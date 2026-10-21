import CommunityClient from '@/components/community/CommunityClient';
import { getServerLocale } from '@/lib/server/serverLocale';

export const metadata = {
  title: 'Community — AI Art Inspiration & Creative Workflows | SupDance',
  description: 'Explore generative AI image, video, and audio creations. Inspect prompts and parameters, and remix in one click.',
};

export default async function CommunityPage() {
  const locale = await getServerLocale();
  return <CommunityClient locale={locale} />;
}

