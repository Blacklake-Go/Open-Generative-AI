import { listFeedbackForAdmin } from '@/lib/services/feedback';
import { FEEDBACK_KINDS, FEEDBACK_STATUS_LABELS } from '@/lib/feedback/catalog';
import { toSearchParams } from '@/lib/admin/pagination';
import { Card, DataTable, PageHeader, Pagination, StatusBadge, CopyableId } from '@/components/admin/AdminUi';
import { UserSubject } from '@/components/admin/UserSubject';
import { requireAdminPagePermission } from '@/lib/admin/pageAuth';
import { PERMISSIONS } from '@/lib/admin/permissions';

function formatDate(value) {
  return value
    ? new Date(value).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai', hour12: false })
    : '—';
}

const KIND_LABELS = Object.fromEntries(FEEDBACK_KINDS.map((kind) => [kind.id, kind.label]));

export default async function FeedbackPage({ searchParams }) {
  await requireAdminPagePermission(PERMISSIONS.contentRead);
  const params = toSearchParams(await searchParams);
  const result = await listFeedbackForAdmin(params);

  const columns = [
    {
      key: 'id',
      label: '提交编号',
      render: (row) => <CopyableId id={row.id} label="提交" />,
    },
    {
      key: 'user',
      label: '提交人',
      render: (row) => <UserSubject row={row} href={`/admin/users/${row.user_id}`} />,
    },
    {
      key: 'kind',
      label: '类型',
      render: (row) => (
        <StatusBadge tone={row.kind === 'security' ? 'danger' : row.kind === 'improvement' ? 'good' : 'warn'}>
          {KIND_LABELS[row.kind] || row.kind}
        </StatusBadge>
      ),
    },
    {
      key: 'title',
      label: '反馈标题与描述',
      render: (row) => (
        <div className="max-w-[320px]">
          <div className="font-semibold text-white">{row.title}</div>
          <p className="mt-1 line-clamp-2 text-xs text-white/60">{row.detail}</p>
        </div>
      ),
    },
    {
      key: 'status',
      label: '处理状态',
      render: (row) => (
        <StatusBadge
          tone={
            row.status === 'accepted'
              ? 'good'
              : row.status === 'rejected'
              ? 'danger'
              : 'warn'
          }
        >
          {FEEDBACK_STATUS_LABELS[row.status] || row.status}
        </StatusBadge>
      ),
    },
    {
      key: 'reward_coins',
      label: '奖励硬币',
      render: (row) => (row.reward_coins ? `${row.reward_coins} 币` : '—'),
    },
    {
      key: 'created_at',
      label: '提交时间',
      render: (row) => formatDate(row.created_at),
    },
  ];

  return (
    <>
      <PageHeader
        eyebrow="运营管理"
        title="建议与漏洞提交"
        description="管理用户反馈的功能体验建议、体验缺陷与安全漏洞报告，支持在线采纳并核发奖励积分。"
      />

      <Card className="mb-6">
        <form className="flex flex-wrap items-center gap-3">
          <input
            name="q"
            defaultValue={params.get('q') || ''}
            placeholder="搜索反馈标题或内容关键字…"
            className="min-w-[260px] flex-1 rounded-xl border border-white/10 bg-black/40 px-4 py-2.5 text-xs text-white outline-none focus:border-cyan-300/50"
          />

          <select
            name="status"
            defaultValue={params.get('status') || ''}
            className="rounded-xl border border-white/10 bg-[#0a0a0a] px-3.5 py-2.5 text-xs text-white/70 outline-none focus:border-cyan-300/50"
          >
            <option value="">全部状态</option>
            <option value="pending">待处理</option>
            <option value="accepted">已采纳</option>
            <option value="rejected">已驳回</option>
          </select>

          <button
            type="submit"
            className="rounded-xl bg-cyan-300 px-5 py-2.5 text-xs font-bold text-black hover:bg-cyan-200"
          >
            筛选
          </button>
        </form>
      </Card>

      <DataTable columns={columns} rows={result.rows} empty="未找到匹配的反馈记录" />
      <Pagination meta={result.meta} searchParams={params} />
    </>
  );
}
