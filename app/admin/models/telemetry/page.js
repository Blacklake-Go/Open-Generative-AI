import { PageHeader } from '@/components/admin/AdminUi';
import { requireAdminPagePermission } from '@/lib/admin/pageAuth';
import { PERMISSIONS } from '@/lib/admin/permissions';
import { getModelTelemetryOverview } from '@/lib/services/modelTelemetry';
import ModelTelemetryClient from './ModelTelemetryClient';

export const dynamic = 'force-dynamic';

export default async function ModelTelemetryPage() {
  await requireAdminPagePermission(PERMISSIONS.modelsRead);

  let initialData = null;
  try {
    initialData = await getModelTelemetryOverview({ timeRange: '24h', limit: 50 });
  } catch (err) {
    console.error('[admin/models/telemetry] Failed to load initial telemetry data:', err?.message);
  }

  return (
    <>
      <PageHeader
        eyebrow="AI 模型与路由"
        title="模型调用量与遥测大盘"
        description="实时监控全平台 AI 模型的真实调用量、成本消耗、成功率、P50/P90 响应时延及错误归因，数据 100% 直连数据库与链路追踪。"
      />
      <ModelTelemetryClient
        initialData={initialData ? JSON.parse(JSON.stringify(initialData)) : null}
        initialRange="24h"
      />
    </>
  );
}
