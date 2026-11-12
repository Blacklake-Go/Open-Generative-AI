import Client from '@/components/community/CommunityCampaignsClient';
import { resolvePageLocale } from '@/lib/server/pageLocale';
export const dynamic = 'force-dynamic';
export const metadata = { title: 'Open calls — SupDance ONE' };
export default async function Page({ params, searchParams }) { return <Client locale={await resolvePageLocale(params, '/community/campaigns', searchParams)} />; }
