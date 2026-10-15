import { PageHeader } from '@/components/admin/AdminUi';
import { requireAdminPagePermission } from '@/lib/admin/pageAuth';
import { PERMISSIONS, hasPermission } from '@/lib/admin/permissions';
import { getCanvasModelConfig, listCanvasModelCandidates } from '@/lib/services/canvasModelConfig';
import CanvasConfigClient from './CanvasConfigClient';

export const dynamic = 'force-dynamic';

export default async function CanvasModelConfigPage() {
  const admin = await requireAdminPagePermission(PERMISSIONS.modelsRead);
  const [config, candidates] = await Promise.all([getCanvasModelConfig(), listCanvasModelCandidates()]);
  return (
    <>
      <PageHeader
        eyebrow="AI 模型与路由"
        title="无限画布模型与默认配置"
        description="从已上架且有审核渠道的模型中选择画布可用项，并设置进入画布时的初始偏好。模型价格与实际生成路线仍由主站统一管理。"
      />
      <CanvasConfigClient initialConfig={config} candidates={candidates} canWrite={hasPermission(admin.role, PERMISSIONS.modelsWrite)} />
    </>
  );
}
