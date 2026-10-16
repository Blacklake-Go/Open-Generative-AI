import 'server-only';

import { isChinaIp, resolveClientIp } from '../security/chinaIpBlock.js';

export const VALID_SOCIAL_REGIONS = ['mainland_china', 'international'];

/**
 * Social login is determined by:
 * 1. Explicit query parameter override (if provided)
 * 2. Explicit user cookie preference: `ko_social_region=international` or `ko_social_region=mainland_china`
 * 3. Explicit header: `x-social-region`
 * 4. Incoming network IP via APNIC CIDR range binary search
 */
export function getSocialLoginRegion(headers, fallbackQueryRegion = null) {
  if (fallbackQueryRegion && VALID_SOCIAL_REGIONS.includes(fallbackQueryRegion)) {
    return fallbackQueryRegion;
  }

  const getHeader = (name) => {
    if (!headers) return null;
    if (typeof headers.get === 'function') return headers.get(name);
    return headers[name] || headers[name.toLowerCase()];
  };

  const headerRegion = getHeader('x-social-region');
  if (headerRegion && VALID_SOCIAL_REGIONS.includes(headerRegion)) {
    return headerRegion;
  }

  const cookieHeader = getHeader('cookie') || '';
  const match = cookieHeader.match(/(?:^|;\s*)ko_social_region=(mainland_china|international)/);
  if (match && match[1]) {
    return match[1];
  }

  const { ip } = resolveClientIp(headers);
  return isChinaIp(ip, headers) ? 'mainland_china' : 'international';
}
