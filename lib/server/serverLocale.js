import { cookies, headers } from 'next/headers';
import { DEFAULT_LOCALE, normalizeLocale } from '@/lib/locales';
import { getUserBySession } from '@/lib/services/auth';

/**
 * Server component helper to resolve the active locale from:
 * 1. User's stored account preference (if logged in)
 * 2. NEXT_LOCALE or locale cookie
 * 3. x-locale header set by middleware
 * 4. DEFAULT_LOCALE ('en')
 */
export async function getServerLocale() {
  try {
    const cookieStore = await cookies();
    const headerList = await headers();

    let user = null;
    try {
      const sessionToken = cookieStore.get('ko_session')?.value;
      if (sessionToken) {
        user = await getUserBySession(sessionToken);
      }
    } catch {}

    const cookieLocale = cookieStore.get('NEXT_LOCALE')?.value || cookieStore.get('locale')?.value;
    const headerLocale = headerList.get('x-locale');
    return normalizeLocale(user?.locale || cookieLocale || headerLocale || DEFAULT_LOCALE);
  } catch {
    return DEFAULT_LOCALE;
  }
}
