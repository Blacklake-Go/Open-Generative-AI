import { PageHeader, Pagination } from '@/components/admin/AdminUi';
import { requireAdminPagePermission } from '@/lib/admin/pageAuth';
import { PERMISSIONS, hasPermission } from '@/lib/admin/permissions';
import { listGenerationReconciliations } from '@/lib/services/generationReconciliation';
import ReconciliationClient from './ReconciliationClient';

export const dynamic = 'force-dynamic';

export default async function ReconciliationPage({ searchParams }) {
  const actor = await requireAdminPagePermission(PERMISSIONS.generationsRead);
  const result = await listGenerationReconciliations(await searchParams);
  return <>
    <PageHeader eyebrow="任务与资金核对" title="待核对任务"
      description="缺少上游终态时保留冻结额度。可以重新读取已有回执，或根据已核实的失败凭据处理资金；释放继续保留原有效期。" />
    <ReconciliationClient rows={JSON.parse(JSON.stringify(result.rows))}
      canPoll={hasPermission(actor.role, PERMISSIONS.generationsWrite)}
      canRelease={hasPermission(actor.role, PERMISSIONS.generationsWrite) && hasPermission(actor.role, PERMISSIONS.creditsAdjust)} />
    <Pagination meta={result.meta} />
  </>;
}
