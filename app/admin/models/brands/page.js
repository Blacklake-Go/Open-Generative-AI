import { requireAdminPagePermission } from '@/lib/admin/pageAuth';
import { PERMISSIONS } from '@/lib/admin/permissions';
import { permanentRedirect } from 'next/navigation';

export const dynamic = 'force-dynamic';

export default async function BrandModelsRedirectPage({ searchParams }) {
  await requireAdminPagePermission(PERMISSIONS.modelsRead);
  const resolvedSearchParams = await Promise.resolve(searchParams);
  const brandId = resolvedSearchParams?.brand || resolvedSearchParams?.provider;
  if (brandId && brandId !== 'all') {
    permanentRedirect(`/admin/models?brand=${encodeURIComponent(brandId)}`);
  }
  permanentRedirect('/admin/models?brand=all');
}
