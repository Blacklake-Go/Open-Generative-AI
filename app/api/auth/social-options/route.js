import { NextResponse } from 'next/server';
import { getSettingByKey } from '@/lib/services/settings';
import { isOAuthProviderConfigured } from '@/lib/oauth';
import { getSocialLoginRegion, VALID_SOCIAL_REGIONS } from '@/lib/auth/socialRegion';
import {
  SOCIAL_LOGIN_CATALOG,
  SOCIAL_LOGIN_REGIONS,
  SOCIAL_LOGIN_SETTING_KEY,
  getSocialLoginProviders,
} from '@/lib/auth/socialProviders';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function getCookieDomain(hostname) {
  if (!hostname) return undefined;
  if (hostname.endsWith('supdance.com')) return '.supdance.com';
  if (hostname.endsWith('koyosim.com')) return '.koyosim.com';
  return undefined;
}

export async function GET(request) {
  const url = new URL(request.url);
  const queryRegion = url.searchParams.get('region');
  const validQueryRegion = VALID_SOCIAL_REGIONS.includes(queryRegion) ? queryRegion : null;

  // Detected region by IP (passing headers directly)
  const detectedRegion = getSocialLoginRegion(request.headers);
  const region = validQueryRegion || detectedRegion;
  const regionCatalog = SOCIAL_LOGIN_CATALOG[region] || [];

  const [stored, ...configuredFlags] = await Promise.all([
    getSettingByKey(SOCIAL_LOGIN_SETTING_KEY).catch(() => null),
    ...regionCatalog.map((id) => isOAuthProviderConfigured(id).catch(() => false)),
  ]);

  const configured = {};
  regionCatalog.forEach((id, index) => {
    configured[id] = configuredFlags[index] === true;
  });

  const providers = getSocialLoginProviders(region, {
    config: stored?.value ?? stored,
    configured,
  });

  const response = NextResponse.json(
    {
      region,
      detectedRegion,
      isOverridden: region !== detectedRegion,
      providers,
    },
    {
      headers: {
        'Cache-Control': 'private, no-store, max-age=0',
        Vary: 'x-real-ip, cf-connecting-ip, x-forwarded-for, true-client-ip, x-vercel-forwarded-for, cf-ipcountry, x-vercel-ip-country, cookie, x-social-region',
      },
    }
  );

  const cookieHeader = request.headers.get('cookie') || '';
  if (cookieHeader.includes('ko_social_region=')) {
    const domain = getCookieDomain(url.hostname);
    response.cookies.set('ko_social_region', '', {
      path: '/',
      domain,
      maxAge: 0,
      sameSite: 'lax',
    });
    if (domain) {
      response.cookies.set('ko_social_region', '', {
        path: '/',
        maxAge: 0,
        sameSite: 'lax',
      });
    }
  }

  return response;
}
