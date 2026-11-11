import CommunitySubmitClient from '@/components/community/CommunitySubmitClient';
import { getServerLocale } from '@/lib/server/serverLocale';
export const dynamic = 'force-dynamic';
export const metadata = { title: 'My submissions — SupDance ONE', robots: { index: false, follow: false } };
export default async function Page() { return <CommunitySubmitClient locale={await getServerLocale()}/>; }
