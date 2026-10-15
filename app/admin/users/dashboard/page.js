import { requireAdminPagePermission } from '@/lib/admin/pageAuth';
import { PERMISSIONS } from '@/lib/admin/permissions';
import { getUserDashboardData } from '@/lib/services/userDashboard';
import UserDashboardClient from './UserDashboardClient';

export const metadata = {
  title: '用户数据看板 · 运营大屏 - SupDance 后台',
};

export const dynamic = 'force-dynamic';

export default async function UserDashboardPage() {
  await requireAdminPagePermission(PERMISSIONS.usersRead);
  const initialData = await getUserDashboardData('day').catch(() => ({
    metrics: {},
    trends: [],
    distribution: {},
    stream: [],
  }));

  return <UserDashboardClient initialData={initialData} />;
}
