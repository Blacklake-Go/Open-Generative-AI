import test from 'node:test';
import assert from 'node:assert/strict';
import { NextRequest } from 'next/server.js';
import { middleware } from '../middleware.js';
import { DEFAULT_LOCALE, normalizeLocale, isSupportedLocale } from '../lib/locales.js';
import { getRequestLocale } from '../lib/i18n.js';

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

