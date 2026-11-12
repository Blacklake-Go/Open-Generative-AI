import Client from '@/components/community/CommunitySubmitClient';
import { resolvePageLocale } from '@/lib/server/pageLocale';
export const dynamic = 'force-dynamic';
export const metadata = { title: 'My submissions — SupDance ONE', robots: { index: false, follow: false } };
export default async function Page({ params, searchParams }) { return <Client locale={await resolvePageLocale(params, '/community/submit', searchParams)} />; }
