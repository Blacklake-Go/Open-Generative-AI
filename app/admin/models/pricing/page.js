import { requireAdminPagePermission } from '@/lib/admin/pageAuth';
import { PERMISSIONS } from '@/lib/admin/permissions';
import { permanentRedirect } from 'next/navigation';

export const dynamic = 'force-dynamic';

export default async function ModelPricingRedirectPage({ searchParams }) {
  await requireAdminPagePermission(PERMISSIONS.modelsRead);
  const resolvedSearchParams = await Promise.resolve(searchParams);
  const tab = resolvedSearchParams?.tab;
  if (tab === 'pending') {
    permanentRedirect('/admin/models/routing?tab=pending');
  }
  permanentRedirect('/admin/models/routing?tab=pricing');
}
