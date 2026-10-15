import Link from 'next/link';
import { listCreditLedger } from '@/lib/services/adminRead';
import { toSearchParams } from '@/lib/admin/pagination';
import { Card, DataTable, PageHeader, Pagination, CopyableId } from '@/components/admin/AdminUi';
import { requireAdminPagePermission } from '@/lib/admin/pageAuth';
import { PERMISSIONS } from '@/lib/admin/permissions';

function formatDate(value) {
  return value
    ? new Date(value).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai', hour12: false })
    : '—';
}

export default async function CreditsPage({ searchParams }) {
  await requireAdminPagePermission(PERMISSIONS.creditsRead);
  const params = toSearchParams(await searchParams);
  const result = await listCreditLedger(params);

  const columns = [
    {
      key: 'user',
      label: '目标用户',
      render: (row) => (
        <div>
          <Link href={`/admin/users/${row.user_id}`} className="font-semibold text-white hover:text-cyan-200">
            {row.email}
          </Link>
          <div className="mt-1">
            <CopyableId id={row.id} label="流水 ID" />
          </div>
        </div>
      ),
    },
    {
      key: 'bucket_type',
      label: '资产账户',
      render: (row) => {
        const type = String(row.bucket_type || '').toLowerCase();
        if (type === 'subscription') {
          return <span className="rounded-md border border-purple-500/30 bg-purple-500/10 px-2 py-0.5 text-[11px] font-semibold text-purple-300">💎 订阅专属额度</span>;
        }
        if (type === 'perpetual') {
          return <span className="rounded-md border border-cyan-500/30 bg-cyan-500/10 px-2 py-0.5 text-[11px] font-semibold text-cyan-300">⚡ 通用充值积分</span>;
        }
        if (type === 'currency' || type === 'k_coin') {
          return <span className="rounded-md border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 text-[11px] font-semibold text-amber-300">🪙 平台 K 币</span>;
        }
        return <span className="rounded-md border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-[11px] font-semibold text-emerald-300">🎁 每日免费</span>;
      },
    },
    {
      key: 'delta',
      label: '变动量',
      render: (row) => (
        <span className={`font-mono font-bold text-sm ${row.delta > 0 ? 'text-emerald-300' : 'text-red-400'}`}>
          {row.delta > 0 ? `+${row.delta}` : row.delta}
        </span>
      ),
    },
    {
      key: 'balance_after',
      label: '变动后结余',
      render: (row) => (
        <span className="font-mono text-xs text-white/70">
          {row.balance_after !== null && row.balance_after !== undefined ? row.balance_after : '—'}
        </span>
      ),
    },
    { key: 'reason', label: '变动原因' },
    {
      key: 'reference_id',
      label: '关联单号 / 任务',
      render: (row) => <CopyableId id={row.reference_id} />,
    },
    {
      key: 'actor_user_id',
      label: '操作人',
      render: (row) =>
        row.actor_user_id ? (
          <CopyableId id={row.actor_user_id} />
        ) : (
          <span className="text-white/40">系统自动</span>
        ),
    },
    {
      key: 'created_at',
      label: '入账时间',
      render: (row) => formatDate(row.created_at),
    },
  ];

  return (
    <>
      <PageHeader
        eyebrow="计费与资产中枢"
        title="额度与资产账本"
        description="不可篡改的追加型资产流水明细。区分订阅专属额度、通用充值积分与平台 K 币流动。"
      />

      {/* 资产三元架构概览卡片 */}
      <div className="grid gap-4 md:grid-cols-3 mb-6">
        <Card className="border-purple-500/20 bg-purple-500/[0.03]">
          <div className="flex items-center gap-2 text-purple-300 font-bold text-sm">
            <span>💎 订阅专属额度 (Subscription Quota)</span>
          </div>
          <p className="mt-2 text-xs text-white/60 leading-relaxed">
            订阅制专属资产，按月或按年随套餐发放，具备账单周期自动重置机制。在所有 AI 生成任务中享有<strong>最高抵扣优先级</strong>。
          </p>
        </Card>

        <Card className="border-cyan-500/20 bg-cyan-500/[0.03]">
          <div className="flex items-center gap-2 text-cyan-300 font-bold text-sm">
            <span>⚡ 通用算力积分 (Credits)</span>
          </div>
          <p className="mt-2 text-xs text-white/60 leading-relaxed">
            平台通用按量算力，永久有效不过期。通过卡密充值、每日签到或单独购买获取，在订阅额度耗尽后自动作为次级池无缝补足扣除。
          </p>
        </Card>

        <Card className="border-amber-500/20 bg-amber-500/[0.03]">
          <div className="flex items-center gap-2 text-amber-300 font-bold text-sm">
            <span>🪙 平台 K 币钱包 (K-Coins)</span>
          </div>
          <p className="mt-2 text-xs text-white/60 leading-relaxed">
            网站独有的社区互动与激励硬币，不支持现金直接充值；通过每日登录、优质作品获投和官方活动获得，用于社区投币与 K 币兑换中心的专属权益。
          </p>
        </Card>
      </div>

      <Card className="mb-6">
        <form className="flex flex-wrap items-center gap-3">
          <input
            name="q"
            defaultValue={params.get('q') || ''}
            placeholder="搜索用户邮箱、变动原因或关联单号…"
            className="min-w-[240px] flex-1 rounded-xl border border-white/10 bg-black/40 px-4 py-2.5 text-xs text-white outline-none focus:border-cyan-300/50"
          />
          <button
            type="submit"
            className="rounded-xl bg-cyan-300 px-5 py-2.5 text-xs font-bold text-black hover:bg-cyan-200 transition shadow-lg shadow-cyan-500/10"
          >
            筛选流水
          </button>
        </form>
      </Card>

      <DataTable columns={columns} rows={result.rows} empty="暂无匹配的额度账本流水" />
      <Pagination meta={result.meta} searchParams={params} />
    </>
  );
}

