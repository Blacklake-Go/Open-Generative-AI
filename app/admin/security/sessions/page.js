import Link from 'next/link';
import { listActiveSessions } from '@/lib/services/adminRead';
import { toSearchParams } from '@/lib/admin/pagination';
import { roleLabel } from '@/lib/admin/permissions';
import { Card, DataTable, PageHeader, Pagination, StatusBadge, CopyableId } from '@/components/admin/AdminUi';
import AdminActionForm from '@/components/admin/AdminActionForm';
import { requireAdminPagePermission } from '@/lib/admin/pageAuth';
import { PERMISSIONS } from '@/lib/admin/permissions';
import { formatAdminDateTime } from '@/components/admin/formatters';

export default async function SessionsPage({ searchParams }) {
  await requireAdminPagePermission(PERMISSIONS.sessionsRevoke);
  const params = toSearchParams(await searchParams);
  const result = await listActiveSessions(params);

  const columns = [
    {
      key: 'user',
      label: '账户主体 / 角色',
      render: (row) => (
        <div>
          <Link
            href={`/admin/users/${row.user_id}`}
            className="font-semibold text-white transition-colors hover:text-brand"
          >
            {row.display_name || row.email || (row.phone ? `用户${row.phone.slice(-4)}` : row.user_id)}
          </Link>
          <div className="mt-0.5 text-xs text-white/50 space-y-0.5">
            {row.email && <div>✉️ {row.email}</div>}
            {row.phone && <div>📱 {row.phone_country_code || '+86'} {row.phone}</div>}
          </div>
          <div className="mt-1 flex items-center gap-2">
            <StatusBadge tone={row.role === 'user' ? 'neutral' : 'info'}>
              {roleLabel(row.role)}
            </StatusBadge>
            <CopyableId id={row.user_id} label="用户 ID" />
          </div>
        </div>
      ),
    },
    {
      key: 'token_hash',
      label: '会话 Token 哈希',
      render: (row) => (
        <div>
          <CopyableId id={row.token_hash} />
          {row.last_seen_at && (
            <p className="mt-1 text-[11px] text-white/40">
              活跃: {formatAdminDateTime(row.last_seen_at)}
            </p>
          )}
        </div>
      ),
    },
    {
      key: 'created_at',
      label: '登录创建时间',
      render: (row) => formatAdminDateTime(row.created_at),
    },
    {
      key: 'expires_at',
      label: '凭据有效期至',
      render: (row) => (
        <span className="text-white/60">{formatAdminDateTime(row.expires_at)}</span>
      ),
    },
    {
      key: 'action',
      label: '管理操作',
      render: (row) => (
        <div className="flex flex-wrap items-center gap-2">
          {/* 单会话下线 */}
          <AdminActionForm
            action={`/api/admin/security/sessions/${row.token_hash}`}
            method="DELETE"
            fields={[]}
            label="下线此设备"
            tone="secondary"
            confirmMessage="确认下线该单条设备会话？该设备需重新登录。"
          />
          {/* 用户全量会话注销 */}
          <AdminActionForm
            action={`/api/admin/users/${row.user_id}/sessions`}
            method="POST"
            fields={[]}
            label="强制全量下线"
            tone="danger"
            confirmMessage="确认强制撤销该用户的所有活跃会话？用户所有终端均将被踢下线。"
          />
        </div>
      ),
    },
  ];

  return (
    <>
      <PageHeader
        eyebrow="用户与权限"
        title="会话与安全监控"
        description="实时监控平台所有有效登录会话。支持按照用户邮箱、手机号或昵称快速定位，并在检测到异常时支持单设备下线或全量会话注销。"
      />

      <Card className="mb-6">
        <form className="flex flex-wrap items-center gap-3">
          <input
            name="q"
            defaultValue={params.get('q') || ''}
            placeholder="搜索邮箱、手机号、昵称或用户 ID…"
            className="min-w-[280px] flex-1 rounded-xl border border-white/10 bg-black/40 px-4 py-2.5 text-xs text-white outline-none focus:border-brand"
          />
          <button
            type="submit"
            className="rounded-xl bg-brand px-5 py-2.5 text-xs font-bold text-white hover:bg-brand-hover transition shadow-sm"
          >
            查询会话
          </button>
          {Array.from(params.keys()).length > 0 && (
            <Link
              href="/admin/security/sessions"
              className="rounded-xl border border-white/10 px-3 py-2.5 text-xs text-white/50 hover:bg-white/5 hover:text-white"
            >
              重置
            </Link>
          )}
        </form>
      </Card>

      <DataTable columns={columns} rows={result.rows} empty="当前没有匹配的有效会话" />
      <Pagination meta={result.meta} searchParams={params} />
    </>
  );
}

