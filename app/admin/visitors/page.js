import { redirect } from 'next/navigation';
import { requireAdminPagePermission } from '@/lib/admin/pageAuth';
import { PERMISSIONS } from '@/lib/admin/permissions';

export const dynamic = 'force-dynamic';

export default async function LegacyVisitorsPage() {
  await requireAdminPagePermission(PERMISSIONS.usersRead);
  redirect('/admin/content/visitors');
}
