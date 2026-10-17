import { requireAdminPagePermission } from '@/lib/admin/pageAuth';
import { PERMISSIONS } from '@/lib/admin/permissions';
import { redirect } from 'next/navigation';

export const dynamic = 'force-dynamic';

export default async function BannerManagementRedirectPage() {
  await requireAdminPagePermission(PERMISSIONS.settingsRead);
  redirect('/admin/settings?tab=banner');
}
