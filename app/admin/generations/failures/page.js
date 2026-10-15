import Link from 'next/link';
import { getFailureClusters, listFailedCreations } from '@/lib/services/adminRead';
import { toSearchParams } from '@/lib/admin/pagination';
import { Card, DataTable, PageHeader, Pagination, StatusBadge, CopyableId } from '@/components/admin/AdminUi';
import { requireAdminPagePermission } from '@/lib/admin/pageAuth';
import { PERMISSIONS } from '@/lib/admin/permissions';

function formatDate(value) {
  return value
    ? new Date(value).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai', hour12: false })
    : '—';
}

export default async function FailedGenerationsPage({ searchParams }) {
  await requireAdminPagePermission(PERMISSIONS.generationsRead);
  const params = toSearchParams(await searchParams);
  const clusters = await getFailureClusters();
  const result = await listFailedCreations(params);

  const columns = [
    {
      key: 'id',
      label: '失败任务 ID / 用户',
      render: (row) => (
        <div>
          <CopyableId id={row.id} />
          <div className="mt-1">
            <Link href={`/admin/users/${row.user_id}`} className="text-xs text-white/50 hover:text-cyan-200">
              {row.email || row.user_id}
            </Link>
          </div>
        </div>
      ),
    },
    { key: 'studio_id', label: 'Studio' },
    {
      key: 'error_code',
      label: '错误代码 / 聚类',
      render: (row) => (
        <span className="rounded-md border border-red-400/30 bg-red-400/10 px-2 py-0.5 font-mono text-xs text-red-200">
          {row.error_code || 'UNKNOWN_ERROR'}
        </span>
      ),
    },
    { key: 'model', label: '请求模型', render: (row) => row.model || '—' },
    {
      key: 'created_at',
      label: '失败时间',
      render: (row) => formatDate(row.created_at),
    },
  ];

  return (
    <>
      <PageHeader
        eyebrow="生成运营"
        title="失败任务分析"
        description="聚合各工作室 AI 生成任务的异常与中断日志，聚类错误代码并快速定位模型供应商或网络故障。"
      />

      {Array.isArray(clusters) && clusters.length > 0 && (
        <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {clusters.map((cluster) => (
            <Card key={cluster.error_code || 'unknown'} className="p-4">
              <div className="text-xs text-white/50">错误类型</div>
              <div className="mt-1 font-mono text-sm font-bold text-red-300">
                {cluster.error_code || 'UNKNOWN'}
              </div>
              <div className="mt-2 text-xl font-extrabold text-white">
                {cluster.count ?? cluster.total ?? 0} <span className="text-xs font-normal text-white/40">次</span>
              </div>
            </Card>
          ))}
        </div>
      )}

      <Card className="mb-6">
        <form className="flex flex-wrap items-center gap-3">
          <input
            name="q"
            defaultValue={params.get('q') || ''}
            placeholder="搜索任务 ID、模型名或用户…"
            className="min-w-[260px] flex-1 rounded-xl border border-white/10 bg-black/40 px-4 py-2.5 text-xs text-white outline-none focus:border-cyan-300/50"
          />

          <button
            type="submit"
            className="rounded-xl bg-cyan-300 px-5 py-2.5 text-xs font-bold text-black hover:bg-cyan-200"
          >
            筛选
          </button>
        </form>
      </Card>

      <DataTable columns={columns} rows={result.rows} empty="暂无失败任务记录" />
      <Pagination meta={result.meta} searchParams={params} />
    </>
  );
}
