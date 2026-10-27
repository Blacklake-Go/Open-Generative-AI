import { cookies, headers } from 'next/headers';
import { normalizeLocale } from '@/lib/locales';
import { getUserBySession } from '@/lib/services/auth';
import { isChinaIp, resolveClientIp } from '@/lib/security/chinaIpBlock';
import JimengHomePortal from '@/components/home/JimengHomePortal';

export const metadata = {
  title: 'SupDance — AI Creative Workspace',
  description: 'AI Image, Video, Audio and Creative Workflow Studio.',
};

export default async function Home() {
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
  const targetLocale = normalizeLocale(user?.locale || cookieLocale || headerLocale || 'en');
  const googleOneTapEligible = !user && !isChinaIp(resolveClientIp(headerList).ip, headerList);

  return <JimengHomePortal locale={targetLocale} initialUser={user} googleOneTapEligible={googleOneTapEligible} />;
}
