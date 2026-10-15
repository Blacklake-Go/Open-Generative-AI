import test from 'node:test';
import assert from 'node:assert/strict';
import { sanitizeAvatarUrl, getDeterministicDefaultAvatar } from '../lib/avatar.js';

test('sanitizeAvatarUrl correctly handles invalid and protocol issues', () => {
  // 1. 无效或空值
  assert.equal(sanitizeAvatarUrl(null), null);
  assert.equal(sanitizeAvatarUrl(undefined), null);
  assert.equal(sanitizeAvatarUrl(''), null);
  assert.equal(sanitizeAvatarUrl('   '), null);
  assert.equal(sanitizeAvatarUrl('null'), null);
  assert.equal(sanitizeAvatarUrl('undefined'), null);
  assert.equal(sanitizeAvatarUrl('[object Object]'), null);

  // 2. 微信与第三方非安全 http 升级为 https
  assert.equal(
    sanitizeAvatarUrl('http://thirdwx.qlogo.cn/mmopen/vi_32/example/0'),
    'https://thirdwx.qlogo.cn/mmopen/vi_32/example/0'
  );
  assert.equal(
    sanitizeAvatarUrl('http://wx.qlogo.cn/mmopen/vi_32/example/0'),
    'https://wx.qlogo.cn/mmopen/vi_32/example/0'
  );

  // 3. 正常相对路径或 https 保留
  assert.equal(sanitizeAvatarUrl('/uploads/avatars/user.png'), '/uploads/avatars/user.png');
  assert.equal(sanitizeAvatarUrl('https://example.com/avatar.jpg'), 'https://example.com/avatar.jpg');
});

test('getDeterministicDefaultAvatar returns stable SVG avatars from catalog', () => {
  const av1 = getDeterministicDefaultAvatar('user-12345');
  const av2 = getDeterministicDefaultAvatar('user-12345');
  assert.equal(av1, av2, 'Deterministic avatar must be reproducible for same seed');
  assert.ok(av1.startsWith('/assets/avatars/default-'), 'Must point to /assets/avatars/default-XX.svg');
});
