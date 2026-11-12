import CommunityClient from '@/components/community/CommunityClient';
import { resolvePageLocale } from '@/lib/server/pageLocale';
export const dynamic = 'force-dynamic';
export const metadata = { title: 'Creator community — SupDance ONE' };
export default async function Page({ params, searchParams }) {
  return <CommunityClient locale={await resolvePageLocale(params, '/community', searchParams)} />;
}
