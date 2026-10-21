import BenefitsClient from '@/components/benefits/BenefitsClient';
import { getServerLocale } from '@/lib/server/serverLocale';

export const metadata = {
  title: 'Coin Shop — SupDance AI Studio',
  description: 'Check in daily, share feedback, and redeem coins for zodiac avatar frames and fast generation cards.',
};

export default async function BenefitsPage() {
  const locale = await getServerLocale();
  return <BenefitsClient locale={locale} />;
}

