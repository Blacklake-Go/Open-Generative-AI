import FederationAccountClient from '@/components/account/FederationAccountClient';
import { getServerLocale } from '@/lib/server/serverLocale';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'SupDance ONE — Account connection', robots: { index: false, follow: false } };
export default async function ConnectedAccountPage() {
  return <FederationAccountClient locale={await getServerLocale()} />;
}
