import { PageHeader } from '@/components/admin/AdminUi';
import { requireAdminPagePermission } from '@/lib/admin/pageAuth';
import { PERMISSIONS } from '@/lib/admin/permissions';
import { getChannelsHealthOverview } from '@/lib/services/circuitBreaker';
import HealthMonitorClient from './HealthMonitorClient';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: '通道健康 | SupDance 运营后台',
};

export default async function ModelHealthPage() {
  await requireAdminPagePermission(PERMISSIONS.providersRead);
  let channels = [];
  try {
    channels = await getChannelsHealthOverview();
  } catch (error) {
    console.error('[admin/models/health] Failed to load channel health:', error.message);
  }

  return (
    <>
      <PageHeader
        eyebrow="AI 模型与路由"
        title="通道健康"
        description="实时监控各模型供应商 API 通道连通性、请求延迟、失败率与熔断状态，支持手动触发通道探测与熔断重置。"
      />
      <HealthMonitorClient initialChannels={JSON.parse(JSON.stringify(channels))} />
    </>
  );
}

