export const DEFAULT_AVATARS = [
  '/assets/avatars/default-01.svg',
  '/assets/avatars/default-02.svg',
  '/assets/avatars/default-03.svg',
  '/assets/avatars/default-04.svg',
  '/assets/avatars/default-05.svg',
  '/assets/avatars/default-06.svg',
  '/assets/avatars/default-07.svg',
  '/assets/avatars/default-08.svg',
];

/**
 * 根据种子（用户名/用户ID/编号）确定性返回一个内置 SVG 头像
 */
export function getDeterministicDefaultAvatar(seed) {
  if (!seed) return DEFAULT_AVATARS[0];
  const str = String(seed);
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = (hash << 5) - hash + str.charCodeAt(i);
    hash |= 0;
  }
  const index = Math.abs(hash) % DEFAULT_AVATARS.length;
  return DEFAULT_AVATARS[index];
}

/**
 * 规范化并安全清理头像 URL：
 * 1. 过滤 'null', 'undefined', 空字符串等无效脏数据
 * 2. 自动升级微信/第三方非安全 http:// 头像为 https://
 */
export function sanitizeAvatarUrl(url) {
  if (!url || typeof url !== 'string') return null;
  const trimmed = url.trim();
  if (!trimmed || trimmed === 'null' || trimmed === 'undefined' || trimmed === '[object Object]') {
    return null;
  }
  // 微信第三方头像 CDN 升级为 https，避免混合内容警告
  if (/^http:\/\/thirdwx\.qlogo\.cn/i.test(trimmed)) {
    return trimmed.replace(/^http:\/\//i, 'https://');
  }
  if (/^http:\/\/wx\.qlogo\.cn/i.test(trimmed)) {
    return trimmed.replace(/^http:\/\//i, 'https://');
  }
  return trimmed;
}
