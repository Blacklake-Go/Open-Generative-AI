import { resolveSocialLoginRegion, VALID_SOCIAL_REGIONS } from './socialRegion.js';
import {
  SOCIAL_LOGIN_CATALOG,
  getSocialLoginProviderPlan,
} from './socialProviders.js';

/**
 * Builds the public `/api/auth/social-options` payload from injected lookups.
 * Kept free of Next/DB imports so region + availability behavior can be tested
 * directly instead of through a running server.
 */
export async function buildSocialOptions({
  headers,
  queryRegion = null,
  getSetting,
  isProviderConfigured,
}) {
  const fallbackRegion = VALID_SOCIAL_REGIONS.includes(queryRegion) ? queryRegion : null;
  const resolution = resolveSocialLoginRegion(headers, fallbackRegion);
  const regionCatalog = SOCIAL_LOGIN_CATALOG[resolution.region] || [];

  const [stored, ...configuredFlags] = await Promise.all([
    Promise.resolve()
      .then(() => getSetting())
      .catch(() => null),
    ...regionCatalog.map(async (id) => {
      // Tri-state on purpose: only an explicit "no credentials" hides a button.
      try {
        const value = await isProviderConfigured(id);
        return typeof value === 'boolean' ? value : null;
      } catch {
        return null;
      }
    }),
  ]);

  const configured = {};
  regionCatalog.forEach((id, index) => {
    configured[id] = configuredFlags[index];
  });

  const plan = getSocialLoginProviderPlan(resolution.region, {
    config: stored?.value ?? stored,
    configured,
  });

  return {
    region: resolution.region,
    detectedRegion: resolution.detectedRegion,
    isOverridden: resolution.region !== resolution.detectedRegion,
    providers: plan.providers,
    diagnostics: {
      regionSource: resolution.regionSource,
      ipSource: resolution.ipSource,
      ipKind: resolution.ipKind,
      matchedBy: resolution.matchedBy,
      ipDataSource: resolution.ipDataSource,
      ipDatasetUpdatedAt: resolution.ipDatasetUpdatedAt,
      ipRangeCount: resolution.ipRangeCount,
      hiddenProviders: plan.hidden,
    },
  };
}
