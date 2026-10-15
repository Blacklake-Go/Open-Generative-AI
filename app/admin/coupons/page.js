import { listCoupons } from '@/lib/services/coupons';
import { toSearchParams } from '@/lib/admin/pagination';
import { Card, DataTable, PageHeader, Pagination, StatusBadge, CopyableId } from '@/components/admin/AdminUi';
import CouponGeneratorClient from './CouponGeneratorClient';
import CouponRedemptionDetails from './CouponRedemptionDetails';
import { requireAdminPagePermission } from '@/lib/admin/pageAuth';
import { PERMISSIONS } from '@/lib/admin/permissions';

function formatDate(value) {
  return value
    ? new Date(value).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai', hour12: false })
    : '—';
}

export default async function CouponsPage({ searchParams }) {
  await requireAdminPagePermission(PERMISSIONS.couponsRead);
  const params = toSearchParams(await searchParams);
  const result = await listCoupons(params);

  const columns = [
    {
      key: 'code',
      label: '兑换码 / 卡密',
      render: (row) => (
        <div className="font-mono font-bold text-brand">
          <CopyableId id={row.code} />
        </div>
      ),
    },
    {
      key: 'type',
      label: '权益类型',
      render: (row) => (
        <span className="text-xs text-white/80">
          {row.type === 'credits' ? '算力点卡' : '会员套餐'}
        </span>
      ),
    },
    {
      key: 'value',
      label: '面值 / 套餐',
      render: (row) => (
        <span className="font-semibold text-white">
          {row.type === 'credits' ? `${row.value} 积分` : row.value}
        </span>
      ),
    },
    {
      key: 'usage',
      label: '核销次数',
      render: (row) => (
        <span className="font-mono text-xs text-white/70">
          {row.used_count || 0} / {row.max_uses || 1}
        </span>
      ),
    },
    {
      key: 'redemptions',
      label: '兑换明细',
      render: (row) => (
        <CouponRedemptionDetails
          couponCode={row.code}
          redemptions={row.redemptions}
          usedCount={row.used_count}
          maxUses={row.max_uses}
          type={row.type}
          value={row.value}
        />
      ),
    },
    {
      key: 'status',
      label: '状态',
      render: (row) => (
        <StatusBadge
          tone={
            !row.is_active
              ? 'danger'
              : row.used_count >= row.max_uses
              ? 'neutral'
              : 'good'
          }
        >
          {!row.is_active
            ? '已停用'
            : row.used_count >= row.max_uses
            ? '已核销'
            : '有效'}
        </StatusBadge>
      ),
    },
    {
      key: 'created_at',
      label: '创建时间',
      render: (row) => formatDate(row.created_at),
    },
  ];

  return (
    <>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between mb-6">
        <PageHeader
          eyebrow="订阅与计费"
          title="卡密与兑换码"
          description="批量生成算力充值点卡与会员套餐激活码，实时监控卡密分发、核销人与生命周期状态。"
        />
        <div className="shrink-0">
          <CouponGeneratorClient />
        </div>
      </div>

      <Card className="mb-6">
        <form className="flex flex-wrap items-center gap-3">
          <input
            name="q"
            defaultValue={params.get('q') || ''}
            placeholder="搜索卡密码或创建人…"
            className="min-w-[260px] flex-1 rounded-xl border border-white/10 bg-black/40 px-4 py-2.5 text-xs text-white outline-none focus:border-brand/50"
          />

          <select
            name="type"
            defaultValue={params.get('type') || ''}
            className="rounded-xl border border-white/10 bg-[#0a0a0a] px-3.5 py-2.5 text-xs text-white/70 outline-none focus:border-brand/50"
          >
            <option value="">全部类型</option>
            <option value="credits">算力点卡</option>
            <option value="plan">会员套餐</option>
          </select>

          <button
            type="submit"
            className="rounded-xl bg-brand px-5 py-2.5 text-xs font-bold text-white hover:bg-brand-hover transition-colors"
          >
            筛选
          </button>
        </form>
      </Card>

      <DataTable columns={columns} rows={result.rows} empty="暂无卡密与兑换码记录" />
      <Pagination meta={result.meta} searchParams={params} />
    </>
  );
}
