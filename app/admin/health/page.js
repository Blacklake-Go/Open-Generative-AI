import { getSystemHealth } from '@/lib/services/systemHealth';
import { Card, MetricCard, PageHeader, StatusBadge } from '@/components/admin/AdminUi';
import LiveLogViewer from './LiveLogViewer';
import { requireAdminPagePermission } from '@/lib/admin/pageAuth';
import { PERMISSIONS } from '@/lib/admin/permissions';

export default async function SystemHealthPage() {
  await requireAdminPagePermission(PERMISSIONS.healthRead);
  const { database, migrations, providers, worker, storage, email, modelProviders } = await getSystemHealth();
  const mem = process.memoryUsage();
  const databaseLatency = database.latencyMs == null ? '—' : `${database.latencyMs} ms`;
  const poolIdle = database.pool?.idle ?? 0;
  const poolMax = database.pool?.max ?? 0;
  const workerTone = worker.status === 'healthy' ? 'good' : worker.status === 'degraded' ? 'warn' : 'danger';
  const workerLabel = worker.status === 'healthy' ? '正常运行' : worker.status === 'degraded' ? '队列积压' : worker.status === 'unknown' ? '状态未知' : '未运行';
  const dependencyTone = (status) => status === 'healthy' ? 'good' : status === 'degraded' ? 'warn' : 'danger';
  const dependencyLabel = (status) => ({ healthy: '正常', degraded: '降级', unhealthy: '异常', unknown: '未知' })[status] || '未知';
  const coreReady = Boolean(database.ok && migrations.ok && worker.status === 'healthy' && storage.status === 'healthy' && email.status === 'healthy' && modelProviders.status === 'healthy');

  return (
    <>
      <PageHeader
        eyebrow="系统运维"
        title="系统健康"
        description="查看应用进程、数据库、迁移、生成队列、对象存储、邮件与公开模型渠道状态。"
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 mb-6">
        <MetricCard
          label="服务核心状态"
          value={coreReady ? '正常在线' : '降级运行'}
          hint={`运行时: Node ${process.version}`}
          tone={coreReady ? 'good' : 'warn'}
        />
        <MetricCard
          label="数据库查询延时"
          value={databaseLatency}
          hint={`PostgreSQL 16 · 连接池 ${poolIdle}/${poolMax} 空闲`}
          tone="info"
        />
        <MetricCard
          label="迁移账本"
          value={migrations.ok ? '已同步' : `${migrations.pending.length} 项待执行`}
          hint={migrations.latest || '无迁移记录'}
        />
        <MetricCard
          label="内存 RSS 占用"
          value={`${Math.round(mem.rss / 1024 / 1024)} MB`}
          hint={`堆占用: ${Math.round(mem.heapUsed / 1024 / 1024)} MB`}
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <div className="mb-4 flex items-center justify-between gap-3">
            <h2 className="text-section-title text-ink">生成 Worker 与队列</h2>
            <StatusBadge tone={workerTone}>{workerLabel}</StatusBadge>
          </div>
          <div className="space-y-3 text-body">
            <div className="flex items-center justify-between gap-4 border-b border-line-subtle pb-3">
              <span className="text-ink-muted">活跃 Worker</span>
              <span className="text-mono text-ink">{worker.liveWorkers ?? '未知'}</span>
            </div>
            <div className="flex items-center justify-between gap-4 border-b border-line-subtle pb-3">
              <span className="text-ink-muted">排队任务</span>
              <span className="text-mono text-ink">{worker.queuedCount ?? '未知'}</span>
            </div>
            <div className="flex items-center justify-between gap-4 border-b border-line-subtle pb-3">
              <span className="text-ink-muted">超时处理中</span>
              <span className="text-mono text-ink">{worker.staleProcessingCount ?? '未知'}</span>
            </div>
            <div className="flex items-center justify-between gap-4">
              <span className="text-ink-muted">近 15 分钟失败</span>
              <span className="text-mono text-ink">{worker.failedLast15m ?? '未知'}</span>
            </div>
            {worker.latestHeartbeatAt && (
              <p className="border-t border-line-subtle pt-3 text-caption text-ink-subtle">
                最近心跳：{new Date(worker.latestHeartbeatAt).toLocaleString('zh-TW')}
              </p>
            )}
          </div>
        </Card>

        <Card>
          <h2 className="text-section-title text-ink mb-4">关键服务依赖</h2>
          <div className="space-y-3 text-body">
            {[
              { label: '对象存储', dependency: storage },
              { label: '邮件 SMTP', dependency: email },
              {
                label: '公开模型可用渠道',
                dependency: modelProviders,
                detail: `${modelProviders.coveredModels ?? '未知'}/${modelProviders.activeModels ?? '未知'} 个模型有健康渠道${modelProviders.staleHealthModels ? ` · ${modelProviders.staleHealthModels} 个健康记录过期` : ''}`,
              },
            ].map(({ label, dependency }) => (
              <div key={label} className="flex items-center justify-between gap-4 border-b border-line-subtle pb-3 last:border-b-0 last:pb-0">
                <div>
                  <p className="text-ink">{label}</p>
                  {dependency.detail && <p className="text-caption text-ink-subtle">{dependency.detail}</p>}
                  {dependency.errorCode && <p className="text-caption text-ink-subtle">{dependency.errorCode}</p>}
                  {dependency.checkedAt && <p className="text-caption text-ink-subtle">检查于 {new Date(dependency.checkedAt).toLocaleString('zh-TW')}</p>}
                </div>
                <StatusBadge tone={dependencyTone(dependency.status)}>{dependencyLabel(dependency.status)}</StatusBadge>
              </div>
            ))}
            <p className="text-caption text-ink-subtle">探测结果有短时缓存；邮件健康表示 SMTP 连通与认证检查，不代表收件箱已送达。</p>
          </div>
        </Card>

        <Card>
          <h2 className="text-sm font-bold text-white mb-4">外部依赖与网关健康摘要</h2>
          <div className="space-y-3">
            {providers.map((p) => (
              <div key={p.id} className="flex items-center justify-between rounded-xl border border-white/[0.08] bg-black/20 p-3.5">
                <div>
                  <p className="text-xs font-semibold text-white">{p.name}</p>
                  <p className="text-[11px] text-white/40">{p.description}</p>
                </div>
                <StatusBadge tone={p.configured ? 'good' : 'warn'}>
                  {p.configured ? '已就绪' : '待配置'}
                </StatusBadge>
              </div>
            ))}
          </div>
        </Card>

        <Card>
          <h2 className="text-sm font-bold text-white mb-4">运行环境与安全规则</h2>
          <div className="space-y-2.5 text-xs text-white/70">
            <div className="flex justify-between border-b border-white/[0.05] pb-2">
              <span className="text-white/40">应用协议模式</span>
              <span>Next.js 15 全栈 App Router</span>
            </div>
            <div className="flex justify-between border-b border-white/[0.05] pb-2">
              <span className="text-white/40">监听地址</span>
              <span className="font-mono">127.0.0.1:3100 (Nginx 反向代理)</span>
            </div>
            <div className="flex justify-between border-b border-white/[0.05] pb-2">
              <span className="text-white/40">数据库事务隔离</span>
              <span>PostgreSQL 事务 + 连接池超时</span>
            </div>
            <div className="flex justify-between pb-1">
              <span className="text-white/40">代理策略</span>
              <span>服务器内网直连 (NO_PROXY 保障)</span>
            </div>
          </div>
        </Card>
      </div>

      <LiveLogViewer />
    </>
  );
}

