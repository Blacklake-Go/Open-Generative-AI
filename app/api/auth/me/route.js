import { getSessionCookieDomain, getUserFromRequest, json } from '@/lib/services/auth';
import { getEntitlements } from '@/lib/services/billing';
import { normalizeLocale } from '@/lib/locales';

export const runtime = 'nodejs';

export async function GET(request) {
  const user = await getUserFromRequest(request);
  const entitlements = user ? await getEntitlements(user.id) : null;
  const response = json({ user, entitlements });

  if (user?.locale) {
    const norm = normalizeLocale(user.locale);
    const domain = getSessionCookieDomain(request);
    response.cookies.set('NEXT_LOCALE', norm, {
      path: '/',
      maxAge: 31536000,
      sameSite: 'lax',
      ...(domain ? { domain } : {}),
    });
    response.cookies.set('locale', norm, {
      path: '/',
      maxAge: 31536000,
      sameSite: 'lax',
      ...(domain ? { domain } : {}),
    });
  }

  return response;
}
