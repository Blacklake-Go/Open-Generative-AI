import { PageHeader } from '@/components/admin/AdminUi';
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
    <>
      <PageHeader
        eyebrow="AI 模型中心"
        title="品牌模型明细"
        description="按品牌与生产厂商透视各 AI 供应商挂载的模型规格，管理供应商底层映射标识、路由优先级与启停状态。"
      />
      <BrandsManagerClient
        initialData={data}
        canWrite={hasPermission(admin.role, PERMISSIONS.modelsWrite)}
        initialProviderId={providerId}
      />
    </>
  );
}

