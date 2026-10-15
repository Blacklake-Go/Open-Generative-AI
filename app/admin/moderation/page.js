import Link from 'next/link';
import { listModerationCases } from '@/lib/services/adminRead';
import { toSearchParams } from '@/lib/admin/pagination';
import { Card, DataTable, PageHeader, Pagination, StatusBadge, CopyableId } from '@/components/admin/AdminUi';
import { requireAdminPagePermission } from '@/lib/admin/pageAuth';
import { PERMISSIONS } from '@/lib/admin/permissions';

function formatDate(value) {
  return value
    ? new Date(value).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai', hour12: false })
    : '—';
}

export default async function ModerationPage({ searchParams }) {
  await requireAdminPagePermission(PERMISSIONS.moderationRead);
  const params = toSearchParams(await searchParams);
  const result = await listModerationCases(params);

  const columns = [
    {
      key: 'id',
      label: '审核案件 / 生成 ID',
      render: (row) => (
        <div>
          <CopyableId id={row.id} label="案件" />
          <div className="mt-1">
            <CopyableId id={row.creation_id} label="产物" />
          </div>
        </div>
      ),
    },
    {
      key: 'user',
      label: '作者账号',
      render: (row) => (
        <Link href={`/admin/users/${row.user_id}`} className="font-semibold text-white hover:text-brand">
          {row.email || row.user_id}
        </Link>
      ),
    },
    {
      key: 'reason',
      label: '审核原因 / 命中敏感词',
      render: (row) => (
        <span className="text-xs text-white/70">
          {row.reason || row.category || '敏感词拦截'}
        </span>
      ),
    },
    {
      key: 'status',
      label: '状态',
      render: (row) => (
        <StatusBadge
          tone={
            row.status === 'approved'
              ? 'good'
              : row.status === 'rejected'
              ? 'danger'
              : 'warn'
          }
        >
          {row.status === 'approved'
            ? '已通过'
            : row.status === 'rejected'
            ? '已违规下架'
            : '待处理'}
        </StatusBadge>
      ),
    },
    {
      key: 'created_at',
      label: '触发时间',
      render: (row) => formatDate(row.created_at),
    },
  ];

  return (
    <>
      <PageHeader
        eyebrow="生成运营"
        title="内容安全与违规审核"
        description="审核命中敏感词过滤、社区不良内容举报或大模型安全警报的 AI 生成图片与视频作品。"
      />

      <Card className="mb-6">
        <form className="flex flex-wrap items-center gap-3">
          <input
            name="q"
            defaultValue={params.get('q') || ''}
            placeholder="搜索案件 ID、产物 ID 或用户…"
            className="min-w-[260px] flex-1 rounded-xl border border-white/10 bg-black/40 px-4 py-2.5 text-xs text-white outline-none focus:border-brand/50"
          />

          <select
            name="status"
            defaultValue={params.get('status') || ''}
            className="rounded-xl border border-white/10 bg-[#0a0a0a] px-3.5 py-2.5 text-xs text-white/70 outline-none focus:border-brand/50"
          >
            <option value="">全部状态</option>
            <option value="pending">待处理</option>
            <option value="approved">已放行</option>
            <option value="rejected">已违规封禁</option>
          </select>

          <button
            type="submit"
            className="rounded-xl bg-brand px-5 py-2.5 text-xs font-bold text-white hover:bg-brand-hover transition-colors"
          >
            筛选
          </button>
        </form>
      </Card>

      <DataTable columns={columns} rows={result.rows} empty="暂无待审核内容" />
      <Pagination meta={result.meta} searchParams={params} />
    </>
  );
}
