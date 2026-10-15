import { redirect } from 'next/navigation';
import { requireAdminPagePermission } from '@/lib/admin/pageAuth';
import { PERMISSIONS } from '@/lib/admin/permissions';

export const dynamic = 'force-dynamic';

export default async function LegacyModelControlPage() {
  await requireAdminPagePermission(PERMISSIONS.modelsRead);
  redirect('/admin/models/providers');
}

