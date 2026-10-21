import test from 'node:test';
import assert from 'node:assert/strict';
import { NextRequest } from 'next/server.js';
import { middleware } from '../middleware.js';
import { DEFAULT_LOCALE, normalizeLocale, isSupportedLocale } from '../lib/locales.js';
import { getRequestLocale } from '../lib/i18n.js';
import { queryOne, execute } from '../lib/application/dataAccess.js';
import { closePgPool } from '../lib/db/pg.js';
import { createSession, getUserBySession } from '../lib/services/auth.js';
import { GET as getPreferences, PUT as updatePreferences } from '../app/api/user/preferences/route.js';

test('1. 默认语言严格强制为英语 (en)，浏览器 Accept-Language 标头不能篡改默认语言', async () => {
  // 1.1 访问首页 /，浏览器为中文 Accept-Language，无 Cookie
  const reqHome = new NextRequest('https://supdance.com/', {
    headers: {
      'accept-language': 'zh-CN,zh;q=0.9,en;q=0.8',
    },
  });
  const resHome = await middleware(reqHome);
  assert.equal(resHome.status, 200);
  assert.equal(resHome.headers.get('x-locale'), 'en', '首页必须强制为 en，不能被 Accept-Language 改写为中文');

  // 1.2 访问 /studio，浏览器为中文 Accept-Language，无 Cookie
  const reqStudio = new NextRequest('https://supdance.com/studio', {
    headers: {
      'accept-language': 'zh-CN,zh;q=0.9,en;q=0.8',
    },
  });
  const resStudio = await middleware(reqStudio);
  assert.equal(resStudio.status, 200, '访问 /studio 必须正常放行，不得被 Accept-Language 误判 307 重定向到 /zh/studio');
  assert.equal(resStudio.headers.get('x-locale'), 'en', '/studio x-locale 必须为 en');

  // 1.3 访问 /login，浏览器为中文 Accept-Language，无 Cookie
  const reqLogin = new NextRequest('https://supdance.com/login', {
    headers: {
      'accept-language': 'zh-CN,zh;q=0.9,en;q=0.8',
    },
  });
  const resLogin = await middleware(reqLogin);
  assert.equal(resLogin.status, 200, '访问 /login 必须正常放行，不得被 Accept-Language 误判 307 重定向到 /zh/login');
  assert.equal(resLogin.headers.get('x-locale'), 'en', '/login x-locale 必须为 en');

  // 1.4 lib/i18n getRequestLocale 默认也是 en
  const i18nReq = new Request('https://supdance.com/api/test', {
    headers: { 'accept-language': 'zh-CN,zh;q=0.9,en;q=0.8' },
  });
  assert.equal(getRequestLocale(i18nReq), 'en');
});

test('2. 用户在网站改过语言选项（携带 NEXT_LOCALE / locale Cookie）时，正确响应用户习惯', async () => {
  // 2.1 用户切换为简体中文 (zh-CN)
  const reqZh = new NextRequest('https://supdance.com/studio', {
    headers: {
      cookie: 'NEXT_LOCALE=zh-CN; locale=zh-CN',
    },
  });
  const resZh = await middleware(reqZh);
  assert.equal(resZh.status, 307, '明确选择过中文的用户访问 /studio 应重定向至 /zh/studio');
  assert.ok(resZh.headers.get('location')?.includes('/zh/studio'));

  // 2.2 用户切换为日语 (ja-JP)
  const reqJa = new NextRequest('https://supdance.com/studio', {
    headers: {
      cookie: 'NEXT_LOCALE=ja-JP; locale=ja-JP',
    },
  });
  const resJa = await middleware(reqJa);
  assert.equal(resJa.status, 307, '明确选择过日语的用户访问 /studio 应重定向至 /ja-JP/studio');
  assert.ok(resJa.headers.get('location')?.includes('/ja-JP/studio'));

  // 2.3 用户明确切换回英语 (en)
  const reqEn = new NextRequest('https://supdance.com/studio', {
    headers: {
      cookie: 'NEXT_LOCALE=en; locale=en',
    },
  });
  const resEn = await middleware(reqEn);
  assert.equal(resEn.status, 200, '明确选择英语的用户访问 /studio 必须正常放行');
  assert.equal(resEn.headers.get('x-locale'), 'en');
});

test('3. URL 显式前缀路由始终受支持且正常解析', async () => {
  // 3.1 访问 /zh/studio
  const reqZhRoot = new NextRequest('https://supdance.com/zh/studio');
  const resZhRoot = await middleware(reqZhRoot);
  assert.equal(resZhRoot.status, 200);
  assert.equal(resZhRoot.headers.get('x-locale'), 'zh-CN');

  // 3.2 访问 /ja-JP/studio
  const reqJaRoot = new NextRequest('https://supdance.com/ja-JP/studio');
  const resJaRoot = await middleware(reqJaRoot);
  assert.equal(resJaRoot.status, 200);
  assert.equal(resJaRoot.headers.get('x-locale'), 'ja-JP');

  // 3.3 别名前缀 /ja/studio 规范化 308 收敛至 /ja-JP/studio
  const reqJaAlias = new NextRequest('https://supdance.com/ja/studio');
  const resJaAlias = await middleware(reqJaAlias);
  assert.equal(resJaAlias.status, 308);
  assert.ok(resJaAlias.headers.get('location')?.includes('/ja-JP/studio'));
});

test('4. 注册与登录用户的语言偏好完整生效闭环测试', async () => {
  // 找到一个已有用户进行会话与偏好生命周期测试
  const testUser = await queryOne('SELECT id, email, locale, social_links FROM users WHERE email = $1', ['admin@koyosim.com']);
  assert.ok(testUser, '测试用户应存在');

  // 创建真实会话
  const session = await createSession(testUser.id);
  const sessionCookie = `ko_session=${session.token}`;

  // 4.1 默认用户查询偏好设置
  const reqGetPref = new Request('https://supdance.com/api/user/preferences', {
    headers: { cookie: sessionCookie },
  });
  const resGetPref = await getPreferences(reqGetPref);
  const getPrefData = await resGetPref.json();
  assert.equal(resGetPref.status, 200);
  assert.equal(getPrefData.preferences.locale, 'en', '未显式修改过偏好的用户，GET 偏好设置中语言应为 en');

  // 4.2 用户在个人中心 -> 账号与设置 -> 界面语言 中将语言设置为 简体中文 (zh-CN)
  const reqPutZh = new Request('https://supdance.com/api/user/preferences', {
    method: 'PUT',
    headers: {
      'content-type': 'application/json',
      cookie: sessionCookie,
    },
    body: JSON.stringify({ locale: 'zh-CN' }),
  });
  const resPutZh = await updatePreferences(reqPutZh);
  const putZhData = await resPutZh.json();
  assert.equal(resPutZh.status, 200);
  assert.equal(putZhData.preferences.locale, 'zh-CN');

  // 验证响应中正确写入了 NEXT_LOCALE 与 locale Cookie
  const setCookieHeader = resPutZh.headers.get('set-cookie') || '';
  assert.ok(setCookieHeader.includes('NEXT_LOCALE=zh-CN'), 'PUT 响应必须包含 NEXT_LOCALE=zh-CN Cookie');
  assert.ok(setCookieHeader.includes('locale=zh-CN'), 'PUT 响应必须包含 locale=zh-CN Cookie');

  // 验证数据库中确实落库
  const updatedUserRow = await queryOne('SELECT locale, social_links FROM users WHERE id = $1', [testUser.id]);
  assert.equal(updatedUserRow.locale, 'zh-CN', '数据库 users.locale 必须更新为 zh-CN');
  assert.equal(updatedUserRow.social_links?.preferences?.locale, 'zh-CN', '用户偏好中必须记录 explicit 语言习惯');

  // 4.3 检验会话中取出的用户语言是否已同步为 zh-CN
  const sessionUserZh = await getUserBySession(session.token);
  assert.equal(sessionUserZh.locale, 'zh-CN', 'getUserBySession 必须反映已保存的 zh-CN 偏好');

  // 4.4 模拟用户改回 英文 (en)
  const reqPutEn = new Request('https://supdance.com/api/user/preferences', {
    method: 'PUT',
    headers: {
      'content-type': 'application/json',
      cookie: sessionCookie,
    },
    body: JSON.stringify({ locale: 'en' }),
  });
  const resPutEn = await updatePreferences(reqPutEn);
  assert.equal(resPutEn.status, 200);
  const userEnRow = await queryOne('SELECT locale, social_links FROM users WHERE id = $1', [testUser.id]);
  assert.equal(userEnRow.locale, 'en');
  assert.equal(userEnRow.social_links?.preferences?.locale, 'en');

  const sessionUserEn = await getUserBySession(session.token);
  assert.equal(sessionUserEn.locale, 'en');

  await closePgPool();
});
