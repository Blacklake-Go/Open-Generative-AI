import ModelsScreenerPageClient from '@/components/models/ModelsScreenerPageClient';
import { getServerLocale } from '@/lib/server/serverLocale';

export const metadata = {
  title: 'Model Directory — Actual 24h Usage & Pricing | SupDance',
  description:
    'Browse listed generative AI models with actual 24-hour call volume, success rate, latency, and pricing on SupDance.',
};

export default async function ModelsPage() {
  const locale = await getServerLocale();
  return <ModelsScreenerPageClient locale={locale} />;
}

