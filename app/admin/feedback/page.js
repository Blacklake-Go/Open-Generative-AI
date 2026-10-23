import Link from 'next/link';
import { GitPullRequest, Paperclip } from 'lucide-react';
import { listFeedbackForAdmin } from '@/lib/services/feedback';
import { FEEDBACK_KINDS, FEEDBACK_STATUS_LABELS } from '@/lib/feedback/catalog';
import { toSearchParams } from '@/lib/admin/pagination';
import { Button, Card, DataTable, PageHeader, Pagination, StatusBadge, CopyableId } from '@/components/admin/AdminUi';
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
        <div className="max-w-xs">
          <Link
            href={`/admin/feedback/${row.id}`}
            className="focus-ring rounded-sm font-semibold text-ink transition-colors hover:text-brand"
          >
            {row.title}
          </Link>
          <p className="mt-1 line-clamp-2 text-caption text-ink-muted">{row.detail}</p>
        </div>
      ),
    },
    {
      key: 'assets',
      label: '附件 / GitHub',
      render: (row) => (
        <div className="flex items-center gap-2 text-ink-muted">
          <span className="inline-flex items-center gap-1" title="附件数量">
            <Paperclip className="size-3.5" />
            {Number(row.attachment_count || 0)}
          </span>
          {row.github_url ? (
            <a
              href={row.github_url}
              target="_blank"
              rel="noopener noreferrer"
              className="focus-ring inline-flex items-center gap-1 rounded-sm text-brand hover:underline"
              title="打开关联的 GitHub 链接"
            >
              <GitPullRequest className="size-3.5" />
              GitHub
            </a>
          ) : (
            <span className="text-ink-subtle">—</span>
          )}
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
    {
      key: 'actions',
      label: '操作',
      render: (row) => (
        <Link
          href={`/admin/feedback/${row.id}`}
          className="focus-ring inline-flex items-center rounded-lg border border-line bg-well px-3 py-1.5 text-label font-semibold text-ink-muted transition-colors hover:border-brand-line hover:text-brand"
        >
          {row.status === 'pending' ? '审核' : '查看'}
        </Link>
      ),
    },
  ];

  return (
    <>
      <PageHeader
        eyebrow="运营管理"
        title="建议与漏洞提交"
        description="管理用户反馈的功能体验建议、体验缺陷与安全漏洞报告，支持查看附件、关联 GitHub 并在线裁决与核发硬币奖励。"
      />

      <Card className="mb-6">
        <form className="flex flex-wrap items-center gap-3">
          <input
            name="q"
            defaultValue={params.get('q') || ''}
            placeholder="搜索标题、内容、页面、GitHub、用户邮箱…"
            className="focus-ring min-w-0 flex-1 rounded-xl border border-line bg-well px-4 py-2.5 text-label text-ink placeholder:text-ink-subtle sm:min-w-64"
          />

          <select
            name="kind"
            defaultValue={params.get('kind') || ''}
            className="focus-ring rounded-xl border border-line bg-well px-3.5 py-2.5 text-label text-ink-muted"
          >
            <option value="">全部类型</option>
            {FEEDBACK_KINDS.map((kind) => (
              <option key={kind.id} value={kind.id}>{kind.label}</option>
            ))}
          </select>

          <select
            name="status"
            defaultValue={params.get('status') || ''}
            className="focus-ring rounded-xl border border-line bg-well px-3.5 py-2.5 text-label text-ink-muted"
          >
            <option value="">全部状态</option>
            <option value="pending">待处理</option>
            <option value="accepted">已采纳</option>
            <option value="rejected">已驳回</option>
          </select>

          <Button type="submit" variant="primary" size="md">
            筛选
          </Button>
        </form>
      </Card>

      <DataTable columns={columns} rows={result.rows} empty="未找到匹配的反馈记录" />
      <Pagination meta={result.meta} searchParams={params} />
    </>
  );
}
