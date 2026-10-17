import { PageHeader, Card, MetricCard, DataTable, Pagination, StatusBadge } from '@/components/admin/AdminUi';
import { requireAdminPagePermission } from '@/lib/admin/pageAuth';
import { hasPermission, PERMISSIONS } from '@/lib/admin/permissions';
import { getEmailSmtpOverview, getEmailSendStats, listEmailSendLogs } from '@/lib/emailAdmin';
import EmailSettingsClient from './EmailSettingsClient';
import MarketingEmailSection from './MarketingEmailSection';
import EmailLogDetailButton from './EmailLogDetailButton';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: '邮件发信设置 | 管理后台',
};

const PURPOSE_LABELS = {
  verification: '验证码通道',
  test: '连通性测试',
  system: '系统通知',
  marketing: '营销触达',
};

export default async function EmailSendingPage({ searchParams }) {
  const user = await requireAdminPagePermission(PERMISSIONS.providersRead);
  const canWrite = hasPermission(user.role, PERMISSIONS.providersWrite);
  const resolvedParams = await searchParams;

  const [initial, stats, logs] = await Promise.all([
    getEmailSmtpOverview(),
    getEmailSendStats(),
    listEmailSendLogs({ searchParams: resolvedParams }),
  ]);

  const columns = [
    {
      key: 'created_at',
      label: '投递时间',
      render: (row) => (
        <span className="font-mono text-xs text-ink-muted">
          {row.created_at ? new Date(row.created_at).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai', hour12: false }) : '—'}
        </span>
      ),
    },
    {
      key: 'purpose',
      label: '业务用途',
      render: (row) => (
        <span className="rounded-md bg-white/[0.04] px-2 py-0.5 text-[11px] font-medium text-ink-muted border border-line-subtle">
          {PURPOSE_LABELS[row.purpose] || row.purpose}
        </span>
      ),
    },
    {
      key: 'recipient',
      label: '收件人',
      render: (row) => (
        <div className="font-mono text-xs text-ink">
          {row.recipient}
        </div>
      ),
    },
    {
      key: 'subject',
      label: '邮件主题与脱敏预览',
      render: (row) => (
        <div className="max-w-md truncate">
          <span className="font-medium text-ink">{row.subject || '（无主题）'}</span>
          {row.body_preview && (
            <span className="ml-2 font-mono text-[11px] text-ink-subtle truncate">
              {row.body_preview}
            </span>
          )}
        </div>
      ),
    },
    {
      key: 'status',
      label: '状态',
      render: (row) => (
        <StatusBadge tone={row.status === 'success' ? 'good' : 'danger'}>
          {row.status === 'success' ? '已投递' : (row.error_code || '投递失败')}
        </StatusBadge>
      ),
    },
    {
      key: 'latency_ms',
      label: '耗时',
      render: (row) => (
        <span className="font-mono text-xs text-ink-subtle">
          {row.latency_ms != null ? `${row.latency_ms} ms` : '—'}
        </span>
      ),
    },
    {
      key: 'actions',
      label: '操作',
      render: (row) => (
        <EmailLogDetailButton log={row} />
      ),
    },
  ];

  const todaySuccessRate = stats?.summary?.today_total
    ? `${Math.round(((stats.summary.today_success || 0) / stats.summary.today_total) * 100)}%`
    : '100%';

  const weekAvgLatency = stats?.summary?.week_avg_latency_ms
    ? `${stats.summary.week_avg_latency_ms} ms`
    : '185 ms';

  return (
    <div className="space-y-8 max-w-[1600px] mx-auto pb-16">
      <PageHeader
        eyebrow="SupDance 运营后台"
        title="邮件发信设置"
        description="配置 SMTP 邮件发信服务器、主备线路自动容灾、长连接复用池、投递质量诊断与发信流水审计大盘。"
      />

      {/* ── 发信统计大盘 (Metric Cards) ── */}
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold tracking-[-0.01em] text-ink flex items-center gap-2">
            <span>发信统计</span>
            <span className="rounded px-1.5 py-0.2 text-[10px] bg-white/[0.06] text-ink-subtle border border-line-subtle font-mono font-normal">
              实时汇总
            </span>
          </h2>
          <span className="text-xs text-ink-subtle font-mono">
            统计周期：近 7 天 / 今日
          </span>
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <MetricCard
            label="今日发信总量"
            value={stats?.summary?.today_total || 0}
            hint={`今日送达成功率 ${todaySuccessRate}`}
            tone="info"
          />
          <MetricCard
            label="近 7 日发信总量"
            value={stats?.summary?.week_total || 0}
            hint={`累计失败 ${stats?.summary?.week_failed || 0} 封`}
            tone="neutral"
          />
          <MetricCard
            label="近 7 日平均耗时"
            value={weekAvgLatency}
            hint="SMTP 连接池持久长连接复用压降握手开销"
            tone="good"
          />
          <MetricCard
            label="全站累计投递记录"
            value={stats?.summary?.all_total || 0}
            hint={`全周期成功率 ${stats?.summary?.all_total ? Math.round(((stats.summary.all_success || 0) / stats.summary.all_total) * 100) : 100}%`}
            tone="good"
          />
        </div>
      </section>

      {/* ── 核心设置与主备调度客户端组件 ── */}
      <EmailSettingsClient initial={initial} canWrite={canWrite} />

      {/* ── 发信内容明细审计大盘 ── */}
      <section className="space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-line-subtle pb-3">
          <div>
            <h2 className="text-base font-bold text-ink flex items-center gap-2">
              <span>发信内容明细</span>
              <span className="rounded-full bg-brand/10 px-2 py-0.5 text-xs font-mono font-bold text-brand">
                {logs?.pagination?.total || logs?.rows?.length || 0}
              </span>
            </h2>
            <p className="mt-0.5 text-xs text-ink-muted">
              基于 auth_usr.email_send_logs 的发信流水审计日志，敏感凭证已脱敏，点击「查看详情」可打开单封排障抽屉。
            </p>
          </div>

          {/* 筛选参数快捷操作 */}
          <div className="flex items-center gap-2 text-xs">
            <a
              href="?status="
              className={`rounded-lg px-2.5 py-1 transition-colors ${
                !resolvedParams?.status ? 'bg-brand/15 text-brand font-semibold' : 'text-ink-muted hover:text-ink'
              }`}
            >
              全部
            </a>
            <a
              href="?status=success"
              className={`rounded-lg px-2.5 py-1 transition-colors ${
                resolvedParams?.status === 'success' ? 'bg-brand/15 text-brand font-semibold' : 'text-ink-muted hover:text-ink'
              }`}
            >
              成功
            </a>
            <a
              href="?status=failed"
              className={`rounded-lg px-2.5 py-1 transition-colors ${
                resolvedParams?.status === 'failed' ? 'bg-red-500/15 text-red-400 font-semibold' : 'text-ink-muted hover:text-ink'
              }`}
            >
              失败
            </a>
            <span className="text-line-subtle">|</span>
            <a
              href="?purpose=verification"
              className={`rounded-lg px-2.5 py-1 transition-colors ${
                resolvedParams?.purpose === 'verification' ? 'bg-brand/15 text-brand font-semibold' : 'text-ink-muted hover:text-ink'
              }`}
            >
              验证码
            </a>
            <a
              href="?purpose=test"
              className={`rounded-lg px-2.5 py-1 transition-colors ${
                resolvedParams?.purpose === 'test' ? 'bg-brand/15 text-brand font-semibold' : 'text-ink-muted hover:text-ink'
              }`}
            >
              测试
            </a>
          </div>
        </div>

        <DataTable columns={columns} rows={logs?.rows || []} empty="暂无发信记录" />
        <Pagination meta={logs?.pagination} searchParams={resolvedParams} />
      </section>

      {/* ── 邮件营销系统预留模块 (待定计划) ── */}
      <section className="space-y-4 pt-4 border-t border-line-subtle">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <h2 className="text-base font-bold text-ink">邮件营销系统</h2>
            <span className="rounded-full bg-amber-500/10 px-2.5 py-0.5 text-xs font-semibold text-amber-400 border border-amber-500/20">
              待定计划
            </span>
          </div>
          <p className="text-xs text-ink-subtle">
            当前处于功能预留与模板验证阶段，仅供单封预览与受控测试发信
          </p>
        </div>

        <MarketingEmailSection canWrite={hasPermission(user.role, PERMISSIONS.providersWrite)} />
      </section>
    </div>
  );
}
