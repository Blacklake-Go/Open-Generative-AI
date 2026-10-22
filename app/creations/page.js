import CreationsClient from '@/components/creations/CreationsClient';
import { getServerLocale } from '@/lib/server/serverLocale';

export const metadata = {
  title: 'Creations & Asset Library — SupDance AI Studio',
  description: 'Manage all your AI-generated images, videos, and music with one-click community sharing.',
};

export default async function CreationsPage() {
  const locale = await getServerLocale();
  return <CreationsClient locale={locale} />;
}
