import { redirect } from 'next/navigation';
import { cookies, headers } from 'next/headers';
import { getLocaleConfig, normalizeLocale } from '@/lib/locales';
import { getUserBySession } from '@/lib/services/auth';
import JimengHomePortal from '@/components/home/JimengHomePortal';

export const metadata = {
  title: 'SupDance — AI Creative Workspace',
  description: 'AI Image, Video, Audio and Creative Workflow Studio.',
};

export default async function Home() {
  const cookieStore = await cookies();
  const headerList = await headers();

  const cookieLocale = cookieStore.get('NEXT_LOCALE')?.value || cookieStore.get('locale')?.value;
  const headerLocale = headerList.get('x-locale');
  const targetLocale = normalizeLocale(cookieLocale || headerLocale || 'en');

  let user = null;
  try {
    const sessionToken = cookieStore.get('ko_session')?.value;
    if (sessionToken) {
      user = await getUserBySession(sessionToken);
    }
  } catch {}

  return <JimengHomePortal locale={targetLocale} initialUser={user} />;
}
