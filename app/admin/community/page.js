import { PageHeader } from '@/components/admin/AdminUi';
import { requireAdminPagePermission } from '@/lib/admin/pageAuth';
import { hasPermission, PERMISSIONS } from '@/lib/admin/permissions';
import CommunityCasesManager from './CommunityCasesManager';

export const dynamic = 'force-dynamic';

export default async function CommunityCasesPage() {
  const user = await requireAdminPagePermission(PERMISSIONS.contentRead);
  const canWrite = hasPermission(user.role, PERMISSIONS.contentWrite);

  return (
    <>
      <PageHeader
        eyebrow="内容管理 / 社区"
        title="案例作品管理"
        description="从真实社区作品中筛选精选案例，维护前台案例展示位、作品文案、标签与发布状态。前台只展示已发布并标记为精选的作品。"
      />
      <CommunityCasesManager canWrite={canWrite} />
    </>
  );
}

