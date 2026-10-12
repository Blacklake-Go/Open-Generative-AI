import { cookies, headers } from 'next/headers';
import StandaloneShell from '@/components/StandaloneShell';
import { normalizeLocale } from '@/lib/locales';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Workflow — koyosim',
  robots: { index: false, follow: false },
};

/** 旧别名壳：语言由 cookie（中间件已解析成 x-locale）决定，不再恒为英文壳。 */
export default async function WorkflowPage({ params }) {
  await params;
  const cookieStore = await cookies();
  const headerList = await headers();
  const cookieLocale = cookieStore.get('NEXT_LOCALE')?.value || cookieStore.get('locale')?.value;
  const locale = normalizeLocale(cookieLocale || headerList.get('x-locale') || 'en');
  return <StandaloneShell locale={locale} />;
}
