import { redirect } from 'next/navigation';

export const dynamic = 'force-dynamic';

export default function ZhSubscriptionPage() {
  redirect('/zh/studio?subscription=open');
}
