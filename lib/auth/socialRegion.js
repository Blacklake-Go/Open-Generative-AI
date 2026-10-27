import 'server-only';

import {
  getChinaIpDataStatus,
  getChinaIpVerdict,
  resolveClientIp,
} from '../security/chinaIpBlock.js';

export const VALID_SOCIAL_REGIONS = ['mainland_china', 'international'];

function headerReader(headers) {
  return (name) => {
    if (!headers) return null;
    if (typeof headers.get === 'function') return headers.get(name);
    return headers[name] || headers[name.toLowerCase()];
  };
}

/**
 * Social login is determined by:
 * 1. Explicit query parameter override (if provided, for testing/preview)
 * 2. Explicit header: `x-social-region` (for staging/testing)
 * 3. Incoming network IP via APNIC CIDR range binary search
 */
export function resolveSocialLoginRegion(headers, fallbackQueryRegion = null) {
  const getHeader = headerReader(headers);
  const headerRegion = getHeader('x-social-region');
  const validHeaderRegion = VALID_SOCIAL_REGIONS.includes(headerRegion) ? headerRegion : null;

  const { ip, source: ipSource } = resolveClientIp(headers);
  const verdict = getChinaIpVerdict(ip, headers);
  const detectedRegion = verdict.inChina ? 'mainland_china' : 'international';

  let region = detectedRegion;
  let regionSource = 'ip';
  if (fallbackQueryRegion && VALID_SOCIAL_REGIONS.includes(fallbackQueryRegion)) {
    region = fallbackQueryRegion;
    regionSource = 'query';
  } else if (validHeaderRegion) {
    region = validHeaderRegion;
    regionSource = 'header';
  }

  const ipData = getChinaIpDataStatus();
  return {
    region,
    detectedRegion,
    regionSource,
    ipSource,
    ipKind: verdict.ipKind,
    matchedBy: verdict.matchedBy,
    ipDataSource: ipData.source,
    ipDatasetUpdatedAt: ipData.updatedAt,
    ipRangeCount: ipData.v4RangeCount + ipData.v6RangeCount,
  };
}

export function getSocialLoginRegion(headers, fallbackQueryRegion = null) {
  return resolveSocialLoginRegion(headers, fallbackQueryRegion).region;
}
