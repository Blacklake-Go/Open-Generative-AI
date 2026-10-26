import Link from 'next/link';
import { listUsers, getUserSummaryMetrics, listUserTags } from '@/lib/services/adminRead';
import { toSearchParams } from '@/lib/admin/pagination';
import { LOGIN_PROVIDER_OPTIONS, USER_ROLE_OPTIONS } from '@/lib/admin/userFilters';
import { roleLabel } from '@/lib/admin/permissions';
import { Card, DataTable, PageHeader, Pagination, StatusBadge, CopyableId, MetricCard } from '@/components/admin/AdminUi';
import ExportButton from '@/components/admin/ExportButton';
import { requireAdminPagePermission } from '@/lib/admin/pageAuth';
import { PERMISSIONS } from '@/lib/admin/permissions';

import { ProviderBadgeList } from '@/components/admin/ProviderBadges';
import { formatAdminDateTime } from '@/components/admin/formatters';

function renderTagBadges(tags = [], preferredModality = null) {
  const hasTags = tags && tags.length > 0;
  const hasModality = Boolean(preferredModality);

  if (!hasTags && !hasModality) {
    return <span className="text-white/30 text-xs">无标签</span>;
  }

  const modalityBadge = preferredModality === 'video' ? (
    <span key="mod_video" className="inline-flex items-center gap-1 rounded-full border border-pink-500/30 bg-pink-500/10 px-2 py-0.5 text-[11px] font-medium text-pink-300">
      <span>🎬 偏好视频</span>
    </span>
  ) : preferredModality === 'audio' ? (
    <span key="mod_audio" className="inline-flex items-center gap-1 rounded-full border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 text-[11px] font-medium text-amber-300">
      <span>🎵 偏好音频</span>
    </span>
  ) : preferredModality === 'image' ? (
    <span key="mod_image" className="inline-flex items-center gap-1 rounded-full border border-brand/30 bg-brand/10 px-2 py-0.5 text-[11px] font-medium text-brand">
      <span>🎨 偏好生图</span>
    </span>
  ) : null;

  return (
    <div className="flex flex-wrap gap-1">
      {tags.map((t) => (
        <span
          key={t.id}
          className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold text-white shadow-sm"
          style={{ backgroundColor: `${t.color}25`, borderColor: `${t.color}50`, borderWidth: 1 }}
        >
          <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: t.color }} />
          <span>{t.name}</span>
        </span>
      ))}
      {modalityBadge}
    </div>
  );
}

export default async function UsersPage({ searchParams }) {
  await requireAdminPagePermission(PERMISSIONS.usersRead);
  const params = toSearchParams(await searchParams);
  
  const [result, summary, tags] = await Promise.all([
    listUsers(params),
    getUserSummaryMetrics().catch(() => ({
      totalUsers: 0,
      todayNewUsers: 0,
      activeSessions: 0,
      payingUsers: 0,
      suspendedUsers: 0,
    })),
    listUserTags().catch(() => []),
  ]);

  const columns = [
    {
      key: 'user_info',
      label: '用户主体',
      render: (row) => (
        <div>
          <div className="flex items-center gap-2">
            <p className="font-semibold text-white">
              {row.display_name || (row.phone ? `用户${row.phone.slice(-4)}` : row.email?.split('@')[0])}
            </p>
            {row.registration_source && (
              <span className="rounded-md border border-white/10 bg-white/5 px-1.5 py-0.2 text-[10px] text-white/50">
                {row.registration_source}
              </span>
            )}
          </div>
          <div className="mt-0.5 text-xs text-white/50 space-y-0.5">
            {row.email && <div>✉️ {row.email}</div>}
            {row.phone && <div>📱 {row.phone_country_code || '+86'} {row.phone}</div>}
          </div>
          <div className="mt-1 flex items-center gap-1.5">
            <span className="text-[11px] font-mono text-brand/80">#{row.user_number || row.id}</span>
            <CopyableId id={row.id} />
          </div>
        </div>
      ),
    },
    {
      key: 'login_providers',
      label: '绑定登录凭据',
      render: (row) => <ProviderBadgeList providers={row.loginProviders} />,
    },
    {
      key: 'tags',
      label: '运营标签 / 创作偏好',
      render: (row) => renderTagBadges(row.tags, row.preferredModality),
    },
    {
      key: 'role',
      label: '角色',
      render: (row) => (
        <StatusBadge tone={row.role === 'user' ? 'neutral' : 'info'}>
          {roleLabel(row.role)}
        </StatusBadge>
      ),
    },
    {
      key: 'status',
      label: '账户状态',
      render: (row) => (
        <StatusBadge tone={row.status === 'suspended' ? 'danger' : 'good'}>
          {row.status === 'suspended' ? '已封禁' : '正常'}
        </StatusBadge>
      ),
    },
    {
      key: 'credits',
      label: '模型额度 / 生成活跃',
      render: (row) => (
        <div>
          <span className="font-mono font-bold text-brand">{row.credits} 点</span>
          <p className="text-[11px] text-white/40 mt-0.5">
            累计 {row.creationsCount || 0} 次生成
          </p>
        </div>
      ),
    },
    {
      key: 'created_at',
      label: '注册 / 最近登录',
      render: (row) => (
        <div className="text-xs">
          <p className="text-white/70">{formatAdminDateTime(row.created_at)}</p>
          <p className="text-white/40 text-[11px] mt-0.5">
            最近: {formatAdminDateTime(row.last_login_at)}
          </p>
        </div>
      ),
    },
    {
      key: 'action',
      label: '操作',
      render: (row) => (
        <Link
          href={`/admin/users/${row.id}`}
          className="rounded-lg border border-white/10 bg-white/5 px-3 py-1 text-xs font-semibold text-brand transition hover:bg-brand/10 hover:text-brand-hover"
        >
          查看画像与运营 →
        </Link>
      ),
    },
  ];

  return (
    <>
      <PageHeader
        eyebrow="用户与权限"
        title="用户运营管理"
        description="检索平台多渠道注册用户，查看绑定凭据、运营标签、模型额度，并执行封禁、调额与打标。"
      >
        <div className="flex flex-wrap items-center gap-2">
          <Link
            href="/admin/users/dashboard"
            className="inline-flex items-center gap-1.5 rounded-xl border border-brand/30 bg-brand/10 px-3.5 py-2 text-xs font-semibold text-brand hover:bg-brand/20 transition"
          >
            <span>📊 用户数据看板 (实时大屏) →</span>
          </Link>
          <ExportButton type="users" label="导出用户 CSV" requiredPermission={PERMISSIONS.exportsWrite} />
        </div>
      </PageHeader>

      {/* 顶部实时核心大盘微缩统计卡 */}
      <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <MetricCard
          label="平台总用户"
          value={summary.totalUsers}
          hint={`今日新入驻 +${summary.todayNewUsers} 位`}
          tone="neutral"
        />
        <MetricCard
          label="当前活跃会话"
          value={summary.activeSessions}
          hint="在线创作中会话"
          tone="good"
        />
        <MetricCard
          label="付费用户客群"
          value={summary.payingUsers}
          hint={`${summary.totalUsers > 0 ? ((summary.payingUsers / summary.totalUsers) * 100).toFixed(1) : 0}% 商业转化率`}
          tone="info"
        />
        <MetricCard
          label="风控封禁账号"
          value={summary.suspendedUsers}
          hint="受控异常账户"
          tone={summary.suspendedUsers > 0 ? 'warn' : 'neutral'}
        />
        <MetricCard
          label="当前检索命中"
          value={result.meta?.total || 0}
          hint="符合当前组合条件"
          tone="neutral"
        />
      </div>

      {/* 搜索与多维筛选工具栏 */}
      <Card className="mb-6">
        <form className="flex flex-wrap items-center gap-3">
          <input
            name="q"
            defaultValue={params.get('q') || ''}
            placeholder="搜索手机号、邮箱、昵称或用户 ID…"
            className="min-w-[220px] flex-1 rounded-xl border border-white/10 bg-black/40 px-4 py-2.5 text-xs text-white outline-none focus:border-brand"
          />

          {/* 注册时间段筛选 */}
          <select
            name="timeRange"
            defaultValue={params.get('timeRange') || ''}
            className="rounded-xl border border-white/10 bg-[#0a0a0a] px-3 py-2.5 text-xs text-white/70 outline-none focus:border-brand"
          >
            <option value="">全部注册时间</option>
            <option value="today">今日新注册</option>
            <option value="7d">近 7 天新注册</option>
            <option value="30d">近 30 天新注册</option>
          </select>

          {/* 付费与商业化层级筛选 */}
          <select
            name="commercial"
            defaultValue={params.get('commercial') || ''}
            className="rounded-xl border border-white/10 bg-[#0a0a0a] px-3 py-2.5 text-xs text-white/70 outline-none focus:border-brand"
          >
            <option value="">全部付费层级</option>
            <option value="paid">付费会员客群</option>
            <option value="free">免费体验用户</option>
          </select>

          {/* 登录渠道筛选 */}
          <select
            name="provider"
            defaultValue={params.get('provider') || ''}
            className="rounded-xl border border-white/10 bg-[#0a0a0a] px-3 py-2.5 text-xs text-white/70 outline-none focus:border-brand"
          >
            <option value="">全部登录方式</option>
            {LOGIN_PROVIDER_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>

          {/* 运营标签筛选 */}
          <select
            name="tag"
            defaultValue={params.get('tag') || ''}
            className="rounded-xl border border-white/10 bg-[#0a0a0a] px-3 py-2.5 text-xs text-white/70 outline-none focus:border-brand"
          >
            <option value="">全部运营标签</option>
            {tags.map((tag) => (
              <option key={tag.id} value={tag.id}>
                {tag.name}
              </option>
            ))}
          </select>

          {/* 角色筛选 */}
          <select
            name="role"
            defaultValue={params.get('role') || ''}
            className="rounded-xl border border-white/10 bg-[#0a0a0a] px-3 py-2.5 text-xs text-white/70 outline-none focus:border-brand"
          >
            <option value="">全部角色</option>
            {USER_ROLE_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>

          {/* 账户状态筛选 */}
          <select
            name="status"
            defaultValue={params.get('status') || ''}
            className="rounded-xl border border-white/10 bg-[#0a0a0a] px-3 py-2.5 text-xs text-white/70 outline-none focus:border-brand"
          >
            <option value="">全部账户状态</option>
            <option value="active">正常</option>
            <option value="suspended">已封禁</option>
          </select>

          {/* 排序规则 */}
          <select
            name="order"
            defaultValue={params.get('order') || ''}
            className="rounded-xl border border-white/10 bg-[#0a0a0a] px-3 py-2.5 text-xs text-white/70 outline-none focus:border-brand"
          >
            <option value="">注册时间倒序 (默认)</option>
            <option value="login_desc">最近登录倒序</option>
            <option value="credits_desc">模型额度由高到低</option>
            <option value="created_asc">注册时间正序</option>
          </select>

          <button
            type="submit"
            className="rounded-xl bg-brand px-5 py-2.5 text-xs font-bold text-white transition hover:bg-brand-hover shadow-sm"
          >
            筛选
          </button>

          {Array.from(params.keys()).length > 0 && (
            <Link
              href="/admin/users"
              className="rounded-xl border border-white/10 px-3 py-2.5 text-xs text-white/50 hover:bg-white/5 hover:text-white"
            >
              重置
            </Link>
          )}
        </form>
      </Card>

      <DataTable columns={columns} rows={result.rows} empty="未找到匹配的用户记录" />
      <Pagination meta={result.meta} searchParams={params} />
    </>
  );
}
