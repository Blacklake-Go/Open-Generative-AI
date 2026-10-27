import { NextResponse } from 'next/server';
import { getSettingByKey } from '@/lib/services/settings';
import { isOAuthProviderConfigured } from '@/lib/oauth';
import { SOCIAL_LOGIN_SETTING_KEY } from '@/lib/auth/socialProviders';
import { buildSocialOptions } from '@/lib/auth/socialOptions';

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
  const payload = await buildSocialOptions({
    headers: request.headers,
    queryRegion: url.searchParams.get('region'),
    getSetting: () => getSettingByKey(SOCIAL_LOGIN_SETTING_KEY),
    isProviderConfigured: isOAuthProviderConfigured,
  });

  const response = NextResponse.json(payload, {
    headers: {
      'Cache-Control': 'private, no-store, max-age=0',
      Vary: 'x-real-ip, cf-connecting-ip, x-forwarded-for, true-client-ip, x-vercel-forwarded-for, cf-ipcountry, x-vercel-ip-country, cookie, x-social-region',
    },
  });

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
