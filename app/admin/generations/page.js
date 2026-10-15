import Link from 'next/link';
import { listCreations } from '@/lib/services/adminRead';
import { toSearchParams } from '@/lib/admin/pagination';
import { Card, DataTable, PageHeader, Pagination, StatusBadge, CopyableId } from '@/components/admin/AdminUi';
import { requireAdminPagePermission } from '@/lib/admin/pageAuth';
import { PERMISSIONS } from '@/lib/admin/permissions';

function formatDate(value) {
  return value
    ? new Date(value).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai', hour12: false })
    : '—';
}

export default async function GenerationsPage({ searchParams }) {
  await requireAdminPagePermission(PERMISSIONS.generationsRead);
  const params = toSearchParams(await searchParams);
  const result = await listCreations(params);

  const columns = [
    {
      key: 'id',
      label: '任务 ID / 用户',
      render: (row) => (
        <div>
          <CopyableId id={row.id} />
          <div className="mt-1">
            <Link href={`/admin/users/${row.user_id}`} className="text-xs text-white/50 hover:text-cyan-200">
              {row.email}
            </Link>
          </div>
        </div>
      ),
    },
    { key: 'studio_id', label: 'Studio 模块' },
    {
      key: 'label',
      label: '提示词 / 模型',
      render: (row) => (
        <div className="max-w-[280px]">
          <p className="truncate text-xs font-semibold text-white/90">{row.label || '无描述'}</p>
          <p className="mt-0.5 text-[11px] text-cyan-200/70 font-mono">{row.model || row.provider || '默认引擎'}</p>
        </div>
      ),
    },
    {
      key: 'status',
      label: '状态 / 诊断',
      render: (row) => {
        const isSuccess = row.status === 'succeeded' || row.status === 'completed' || row.status === 'success';
        return (
          <div>
            <StatusBadge tone={isSuccess ? 'good' : 'danger'}>
              {row.status}
            </StatusBadge>
            {!isSuccess && (row.error_reason || row.error_code) && (
              <p className="mt-1 max-w-[200px] truncate text-[11px] text-red-300 font-mono" title={row.error_reason || row.error_code}>
                {row.error_reason || row.error_code}
              </p>
            )}
            {row.duration_ms ? (
              <p className="mt-0.5 text-[10px] text-white/30 font-mono">
                耗时: {(row.duration_ms / 1000).toFixed(1)}s
              </p>
            ) : null}
          </div>
        );
      },
    },
    {
      key: 'costs',
      label: '额度 / 成本(USD)',
      render: (row) => (
        <div>
          <span className="font-mono font-bold text-cyan-200">{row.credit_cost} Credits</span>
          <p className="text-[11px] font-mono text-amber-300/80">
            ${Number(row.actual_cost_usd || 0).toFixed(3)}
          </p>
        </div>
      ),
    },
    {
      key: 'result_url',
      label: '生成产物',
      render: (row) =>
        row.result_url ? (
          <a
            href={row.result_url}
            target="_blank"
            rel="noreferrer"
            className="rounded-lg border border-white/10 bg-white/5 px-2.5 py-1 text-xs text-cyan-200 hover:bg-cyan-300/10"
          >
            打开查看 ↗
          </a>
        ) : (
          <span className="text-xs text-white/30">—</span>
        ),
    },
    {
      key: 'created_at',
      label: '提交时间',
      label: '提交时间',
      render: (row) => formatDate(row.created_at),
    },
  ];

  const filterForm = (
    <Card className="mb-6">
      <form className="flex flex-wrap items-center gap-3">
        {view === 'tasks' && <input type="hidden" name="view" value="tasks" />}
        {userId && <input type="hidden" name="user_id" value={userId} />}
        <input
          name="q"
          defaultValue={params.get('q') || ''}
          placeholder={userId ? '在该用户的任务中搜索 ID、提示词或模型…' : '搜索任务 ID、用户邮箱、提示词或模型…'}
          className="min-w-[240px] flex-1 rounded-xl border border-white/10 bg-black/40 px-4 py-2.5 text-xs text-white outline-none focus:border-cyan-300/50"
        />

        <select
          name="status"
          defaultValue={params.get('status') || ''}
          className="rounded-xl border border-white/10 bg-[#0a0a0a] px-3 py-2.5 text-xs text-white/70 outline-none focus:border-cyan-300/50"
        >
          <option value="">全部状态</option>
          <option value="succeeded">Succeeded (成功)</option>
          <option value="processing">Processing (生成中)</option>
          <option value="queued">Queued (排队中)</option>
          <option value="failed">Failed (失败)</option>
        </select>

        <button
          type="submit"
          className="rounded-xl bg-cyan-300 px-5 py-2.5 text-xs font-bold text-black hover:bg-cyan-200"
        >
          筛选任务
        </button>
      </form>
    </Card>
  );

  return (
    <>
      <PageHeader
        eyebrow="内容与任务"
        title="生成任务"
        description="以用户为单位查看平台通过 AI Studio 提交的图像、视频和语音生成任务：默认展示每位用户最新的一条任务，展开可查看更早的记录。"
      >
        <Link
          href="/admin/generations/failures"
          className="rounded-xl border border-amber-400/30 bg-amber-400/10 px-4 py-2 text-xs font-bold text-amber-200 hover:bg-amber-400/20"
        >
          查看失败任务聚类排查 →
        </Link>
      </PageHeader>

      {userId ? (
        <div className="mb-4 flex flex-wrap items-center gap-3">
          <Link
            href={backHref}
            className="inline-flex h-control-sm items-center gap-1.5 rounded-lg border border-line-subtle bg-wash px-3 text-label text-ink-muted transition-[background-color,border-color,color] duration-fast hover:border-line-strong hover:bg-wash-strong hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-ring"
          >
            <ArrowLeft className="size-3.5" aria-hidden="true" /> 返回用户列表
          </Link>
          <p className="text-body-sm text-ink-muted">
            正在查看 <span className="font-medium text-ink">{result.rows[0]?.email || userId}</span> 的全部任务
          </p>
          <Link href={`/admin/users/${userId}`} className="text-label text-ink-subtle hover:text-ink">
            用户详情 →
          </Link>
        </div>
      ) : (
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <nav
            aria-label="视图切换"
            data-pill-segmented
            className="inline-flex items-center gap-1 rounded-full border border-line-subtle bg-well p-1"
          >
            {[
              { key: 'users', label: '按用户' },
              { key: 'tasks', label: '按任务' },
            ].map((item) => {
              const active = view === item.key;
              return (
                <Link
                  key={item.key}
                  href={viewHref(item.key)}
                  data-pill-segment-item
                  aria-current={active ? 'page' : undefined}
                  className={`inline-flex h-control-xs items-center justify-center rounded-full px-4 text-body-sm font-semibold transition-[background-color,color] duration-fast focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-ring ${
                    active ? 'bg-surface-inverse text-ink-inverse shadow-elevation-1' : 'text-ink-muted hover:bg-wash hover:text-ink'
                  }`}
                >
                  {item.label}
                </Link>
              );
            })}
          </nav>
          <p className="text-caption text-ink-subtle">
            {view === 'users' ? '每位用户仅显示最新一条任务，点击行展开历史' : '按提交时间平铺全部任务'}
          </p>
        </div>
      )}

      {filterForm}

      {view === 'users' ? (
        result.rows.length ? (
          <UserGroupList groups={result.rows} baseParams={params.toString()} />
        ) : (
          <EmptyState title="未找到匹配的生成任务记录" />
        )
      ) : (
        <DataTable columns={columns} rows={result.rows} empty="未找到匹配的生成任务记录" />
      )}
      <Pagination meta={result.meta} searchParams={params} />
    </>
  );
}

