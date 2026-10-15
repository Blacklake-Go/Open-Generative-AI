import { requireAdminPagePermission } from '@/lib/admin/pageAuth';
import { PERMISSIONS } from '@/lib/admin/permissions';
import { listAdminInviteCodesWithHabits, getInviteStatsOverview } from '@/lib/services/inviteCodes';
import { toSearchParams } from '@/lib/admin/pagination';
import InvitesManagerClient from './InvitesManagerClient';

export const metadata = {
  title: '邀请码与使用习惯分析 | SupDance 管理后台',
  robots: { index: false, follow: false },
};

export default async function InvitesAdminPage({ searchParams }) {
  await requireAdminPagePermission(PERMISSIONS.usersRead);
  const params = toSearchParams(await searchParams);

  const status = params.status || null;
  const search = params.search || '';
  const page = Math.max(1, Number(params.page) || 1);
  const pageSize = Math.max(1, Math.min(100, Number(params.pageSize) || 20));

  const [listData, overview] = await Promise.all([
    listAdminInviteCodesWithHabits({ status, search, page, pageSize }),
    getInviteStatsOverview(),
  ]);

  return (
    <InvitesManagerClient
      initialListData={listData}
      initialOverview={overview}
      initialQuery={{ status, search, page, pageSize }}
    />
  );
}

