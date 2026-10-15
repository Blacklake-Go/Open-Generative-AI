import { cookies, headers } from 'next/headers';
import StandaloneShell from '@/components/StandaloneShell';
import { normalizeLocale } from '@/lib/locales';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Workflow — SupDance',
  robots: { index: false, follow: false },
};

/** 旧别名壳（含页签段）：与 /workflow/[id] 同源，语言由 cookie / x-locale 决定。 */
export default async function WorkflowPage({ params }) {
  await params;
  const cookieStore = await cookies();
  const headerList = await headers();
  const cookieLocale = cookieStore.get('NEXT_LOCALE')?.value || cookieStore.get('locale')?.value;
  const locale = normalizeLocale(cookieLocale || headerList.get('x-locale') || 'en');
  return <StandaloneShell locale={locale} />;
}
