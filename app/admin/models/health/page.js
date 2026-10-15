import { redirect } from 'next/navigation';

export const dynamic = 'force-dynamic';

export default function ModelHealthLegacyRedirect() {
  redirect('/admin/models/providers');
}

