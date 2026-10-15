import { listAdmins } from '@/lib/services/adminRead';
import { PageHeader } from '@/components/admin/AdminUi';
import AdminsManagerClient from './AdminsManagerClient';
import { requireAdminPagePermission } from '@/lib/admin/pageAuth';
import { PERMISSIONS } from '@/lib/admin/permissions';

export default async function AdminsPage() {
  await requireAdminPagePermission(PERMISSIONS.adminsWrite);
  const admins = await listAdmins();

  return (
    <>
      <PageHeader
        eyebrow="用户与权限"
        title="管理员团队与角色权限"
        description="管理平台内部管理团队成员与其内置 RBAC 权限。支持快捷调权、账号启用/停用控制，以及从现有用户库检索授权。"
      />

      <AdminsManagerClient initialAdmins={admins} />
    </>
  );
}

