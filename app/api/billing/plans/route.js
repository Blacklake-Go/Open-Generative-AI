import { json } from '@/lib/services/auth';
import { listPublicPlans } from '@/lib/services/billing';
import { paymentChannelStatus } from '@/lib/payments/providerCredentials';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  const [plans, providers] = await Promise.all([listPublicPlans(), paymentChannelStatus()]);
  return json({ plans, providers }, {
    headers: {
      'Cache-Control': 'no-store',
    },
  });
}
