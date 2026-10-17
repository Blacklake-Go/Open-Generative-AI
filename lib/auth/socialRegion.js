import 'server-only';

import { isChinaIp, resolveClientIp } from '../security/chinaIpBlock.js';

export const VALID_SOCIAL_REGIONS = ['mainland_china', 'international'];

/**
 * Social login is determined by:
 * 1. Explicit query parameter override (if provided, for testing/preview)
 * 2. Explicit header: `x-social-region` (for staging/testing)
 * 3. Incoming network IP via APNIC CIDR range binary search
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

  const { ip } = resolveClientIp(headers);
  return isChinaIp(ip, headers) ? 'mainland_china' : 'international';
}
