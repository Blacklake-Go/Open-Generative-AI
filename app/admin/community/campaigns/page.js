import { PageHeader } from '@/components/admin/AdminUi';
import { requireAdminPagePermission } from '@/lib/admin/pageAuth';
import { hasPermission, PERMISSIONS } from '@/lib/admin/permissions';
import CampaignsManager from './CampaignsManager';
export const dynamic = 'force-dynamic';
export default async function Page() {
  const user = await requireAdminPagePermission(PERMISSIONS.contentRead);
  return <><PageHeader eyebrow="内容管理 / 社区" title="征集与评奖" description="发布前检查规则、截止时间和整数积分奖励。开放后规则不可更改。奖励批准与实际入账分别记录。" />
    <CampaignsManager canWrite={hasPermission(user.role, PERMISSIONS.contentWrite)} /></>;
}
