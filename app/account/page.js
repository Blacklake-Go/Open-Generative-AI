import { redirect } from 'next/navigation';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: '账户与订阅 | SupDance AI Studio',
  description: '管理 SupDance AI Studio 账户与生成额度。',
};

import { cookies, headers } from 'next/headers';
import { getLocaleConfig, normalizeLocale } from '@/lib/locales';
import { getUserBySession } from '@/lib/services/auth';

export default async function AccountPage({ searchParams }) {
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
  const config = getLocaleConfig(targetLocale);
  const studioRoot = config.rootPath ? `${config.rootPath}/studio` : '/studio';

  const params = await searchParams;
  const action = params?.action ? `&action=${encodeURIComponent(params.action)}` : '';
  redirect(`${studioRoot}?account=open${action}`);
}
