import { redirect } from 'next/navigation';
import { getLocaleConfig } from '@/lib/locales';
import { resolvePageLocale } from '@/lib/server/pageLocale';
export const dynamic = 'force-dynamic';
export const metadata = { title: 'Account — SupDance ONE', robots: { index: false, follow: false } };
export default async function Page({ params, searchParams }) {
  const locale = await resolvePageLocale(params, '/account', searchParams);
  const query = await searchParams;
  const action = query?.action ? `&action=${encodeURIComponent(query.action)}` : '';
  redirect(`${getLocaleConfig(locale).rootPath}/studio?account=open${action}`);
}
