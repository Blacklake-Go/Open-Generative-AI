import Client from '@/components/account/FederationAccountClient';
import { resolvePageLocale } from '@/lib/server/pageLocale';
export const dynamic = 'force-dynamic';
export const metadata = { title: 'SupDance ONE — Account connection', robots: { index: false, follow: false } };
export default async function Page({ params, searchParams }) { return <Client locale={await resolvePageLocale(params, '/account/connected', searchParams)} />; }
