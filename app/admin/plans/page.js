import { getAllPlansConfig } from '@/lib/services/adminRead';
import PlansManagerClient from './PlansManagerClient';
import { requireAdminPagePermission } from '@/lib/admin/pageAuth';
import { PERMISSIONS } from '@/lib/admin/permissions';

export default async function PlansPage() {
  await requireAdminPagePermission(PERMISSIONS.plansRead);
  const plans = await getAllPlansConfig();

  return <PlansManagerClient initialPlans={plans} />;
}

