import CommunityCampaignsClient from '@/components/community/CommunityCampaignsClient';
import { getServerLocale } from '@/lib/server/serverLocale';
export const dynamic='force-dynamic';
export const metadata={title:'Open calls — SupDance ONE'};
export default async function Page(){return <CommunityCampaignsClient locale={await getServerLocale()}/>;}
