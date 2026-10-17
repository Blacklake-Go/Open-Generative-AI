import { requireAdminPagePermission } from '@/lib/admin/pageAuth';
import { PERMISSIONS } from '@/lib/admin/permissions';
import { redirect } from 'next/navigation';

export const dynamic = 'force-dynamic';

export default async function MotionEffectsRedirectPage() {
  await requireAdminPagePermission(PERMISSIONS.settingsRead);
  redirect('/admin/settings?tab=motion');
}
