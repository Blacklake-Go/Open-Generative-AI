import { redirect } from 'next/navigation';

export const dynamic = 'force-dynamic';

export default function ZhPricingPage() {
  redirect('/zh/studio?subscription=open');
}
