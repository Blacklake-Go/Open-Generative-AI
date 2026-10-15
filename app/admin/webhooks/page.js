import { listWebhookEvents } from '@/lib/services/adminRead';
import { toSearchParams } from '@/lib/admin/pagination';
import { Card, DataTable, PageHeader, Pagination, StatusBadge, CopyableId } from '@/components/admin/AdminUi';
import { requireAdminPagePermission } from '@/lib/admin/pageAuth';
import { PERMISSIONS } from '@/lib/admin/permissions';

function formatDate(value) {
  return value
    ? new Date(value).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai', hour12: false })
    : '—';
}

export default async function WebhooksPage({ searchParams }) {
  await requireAdminPagePermission(PERMISSIONS.webhooksRead);
  const params = toSearchParams(await searchParams);
  const result = await listWebhookEvents(params);

  const columns = [
    {
      key: 'event_id',
      label: '外部事件 ID',
      render: (row) => <CopyableId id={row.event_id || row.id} />,
    },
    { key: 'provider', label: '供应商渠道', render: (row) => row.provider || '—' },
    {
      key: 'status',
      label: '处理状态',
      render: (row) => (
        <StatusBadge
          tone={
            row.status === 'processed' || row.status === 'received'
              ? 'good'
              : row.status === 'replayed'
              ? 'info'
              : 'danger'
          }
        >
          {row.status || 'unknown'}
        </StatusBadge>
      ),
    },
    {
      key: 'event_type',
      label: '事件类型',
      render: (row) => (
        <span className="font-mono text-xs text-white/70">
          {row.event_type || row.type || 'callback'}
        </span>
      ),
    },
    {
      key: 'created_at',
      label: '接收时间',
      render: (row) => formatDate(row.created_at),
    },
  ];

  return (
    <>
      <PageHeader
        eyebrow="系统集成"
        title="Webhook 事件记录"
        description="记录接收到的第三方支付平台、AI 供应商异步回调与通知事件流，支持排查丢单与异步投递重试。"
      />

      <Card className="mb-6">
        <form className="flex flex-wrap items-center gap-3">
          <input
            name="q"
            defaultValue={params.get('q') || ''}
            placeholder="搜索事件 ID 或渠道名…"
            className="min-w-[260px] flex-1 rounded-xl border border-white/10 bg-black/40 px-4 py-2.5 text-xs text-white outline-none focus:border-brand/50"
          />

          <select
            name="provider"
            defaultValue={params.get('provider') || ''}
            className="rounded-xl border border-white/10 bg-[#0a0a0a] px-3.5 py-2.5 text-xs text-white/70 outline-none focus:border-brand/50"
          >
            <option value="">全部渠道</option>
            <option value="wechat">微信支付</option>
            <option value="alipay">支付宝</option>
            <option value="stripe">Stripe</option>
            <option value="runninghub">RunningHub</option>
            <option value="volcengine">火山引擎</option>
          </select>

          <button
            type="submit"
            className="rounded-xl bg-brand px-5 py-2.5 text-xs font-bold text-white hover:bg-brand-hover transition-colors"
          >
            筛选
          </button>
        </form>
      </Card>

      <DataTable columns={columns} rows={result.rows} empty="暂无 Webhook 事件记录" />
      <Pagination meta={result.meta} searchParams={params} />
    </>
  );
}
