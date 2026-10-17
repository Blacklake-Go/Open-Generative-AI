import ModelNavTabs from '@/components/admin/ModelNavTabs';
import { requireAdminPagePermission } from '@/lib/admin/pageAuth';
import { PERMISSIONS, hasPermission } from '@/lib/admin/permissions';
import { getBrandModelsPageData } from '@/lib/services/modelBrands.js';
import BrandsManagerClient from './BrandsManagerClient';

export const dynamic = 'force-dynamic';

export default async function BrandModelsPage({ searchParams }) {
  const admin = await requireAdminPagePermission(PERMISSIONS.modelsRead);
  const resolvedSearchParams = await Promise.resolve(searchParams);
  const providerId = resolvedSearchParams?.provider || 'all';

  const data = await getBrandModelsPageData({ providerId });

  return (
    <div className="space-y-6 max-w-[1600px] mx-auto pb-16">
      <ModelNavTabs activeTab="brands" />
      <BrandsManagerClient
        initialData={data}
        canWrite={hasPermission(admin.role, PERMISSIONS.modelsWrite)}
        initialProviderId={providerId}
      />
    </div>
  );
}

