import test from 'node:test';
import assert from 'node:assert/strict';
import { NextRequest } from 'next/server.js';
import { requireIsolatedTestDatabase } from '../../scripts/test-database-guard.mjs';
const testUrl = process.env.TEST_DATABASE_URL;
if (testUrl) {
  const url = requireIsolatedTestDatabase(testUrl,process.env.DATABASE_URL);
  assert.match(url.pathname,/^\/p7_test_it_[a-f0-9]{12}$/);
  process.env.DATABASE_URL = testUrl;
}
const {queryOne,execute,closePgPool} = await import('../../lib/db/index.js');
const {allocateUserId} = await import('../../lib/auth/user-id.js');
const authRepo = await import('../../lib/repositories/auth.js');
const {createSession,getUserBySession} = await import('../../lib/services/auth.js');
const {GET:getPreferences,PUT:updatePreferences} = await import('../../app/api/user/preferences/route.js');
test('4. 注册与登录用户的语言偏好完整生效闭环测试', { skip: !testUrl }, async () => {
  const id = await allocateUserId({ reserve: (value,digits) => authRepo.reserveUserId(value,digits),
    findFirstAvailable: digits => authRepo.findFirstAvailableUserId(digits), isExhausted: digits => authRepo.isUserIdPoolExhausted(digits) });
  await execute("INSERT INTO auth_usr.users(id,email,role,credits,status,locale,onboarding_completed) VALUES($1,$2,'user',0,'active','en',TRUE)",[id,`${id}@locale-fixture.test`]);
  const testUser = {id};
  try {

  // 创建真实会话
  const session = await createSession(testUser.id);
  const sessionCookie = `ko_session=${session.token}`;

  // 4.1 默认用户查询偏好设置
  const reqGetPref = new NextRequest('https://one.supdance.com/api/user/preferences', {
    headers: { cookie: sessionCookie },
  });
  const resGetPref = await getPreferences(reqGetPref);
  const getPrefData = await resGetPref.json();
  assert.equal(resGetPref.status, 200);
  assert.equal(getPrefData.preferences.locale, 'en', '未显式修改过偏好的用户，GET 偏好设置中语言应为 en');

  // 4.2 用户在个人中心 -> 账号与设置 -> 界面语言 中将语言设置为 简体中文 (zh-CN)
  const reqPutZh = new NextRequest('https://one.supdance.com/api/user/preferences', {
    method: 'PUT',
    headers: {
      'content-type': 'application/json',
      Origin: 'https://one.supdance.com',
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
  const reqPutEn = new NextRequest('https://one.supdance.com/api/user/preferences', {
    method: 'PUT',
    headers: {
      'content-type': 'application/json',
      Origin: 'https://one.supdance.com',
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

  } finally { await execute('DELETE FROM auth_usr.users WHERE id=$1',[id]); }
});
test.after(async () => { await closePgPool(); });
