import { Inbox } from 'lucide-react';
import { CopyableId, ConfirmActionDialog } from './AdminUiClient';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';

export { CopyableId, ConfirmActionDialog, Badge, Button };

export function PageHeader({ eyebrow = 'SupDance 运营后台', title, description, children }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4 border-b border-slate-200/90 pb-5">
      <div>
        <p className="mb-1 text-xs font-semibold uppercase tracking-[0.08em] text-brand">
          {eyebrow}
        </p>
        <h1 className="text-2xl font-bold tracking-[-0.02em] leading-8 sm:text-3xl sm:leading-9 text-slate-900">
          {title}
        </h1>
        {description && (
          <p className="mt-1 max-w-3xl text-sm leading-6 tracking-[-0.005em] text-slate-500">
            {description}
          </p>
        )}
      </div>
      {children && <div className="flex flex-wrap items-center gap-2.5">{children}</div>}
    </div>
  );
}

export function Card({ children, className = '' }) {
  return (
    <section className={`rounded-xl border border-slate-200/90 bg-white p-5 shadow-[0_1px_3px_rgba(0,0,0,0.03)] text-slate-800 transition-all duration-200 ease-out hover:border-slate-300 ${className}`}>
      {children}
    </section>
  );
}

export function StatusBadge({ children, tone = 'neutral' }) {
  const styles = {
    good: 'border-emerald-200 bg-emerald-50 text-emerald-700',
    warn: 'border-amber-200 bg-amber-50 text-amber-700',
    danger: 'border-rose-200 bg-rose-50 text-rose-700',
    info: 'border-brand/20 bg-brand/10 text-brand',
    neutral: 'border-slate-200 bg-slate-50 text-slate-600',
  };
  return (
    <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium tracking-[0.01em] leading-4 ${styles[tone] || styles.neutral}`}>
      {children}
    </span>
  );
}

export function MetricCard({ label, value, hint, tone = 'neutral' }) {
  return (
    <Card className="p-5 relative overflow-hidden group hover:border-brand/30 transition-all duration-200 bg-white border border-slate-200 shadow-[0_1px_3px_rgba(0,0,0,0.03)]">
      <p className="text-xs font-semibold uppercase tracking-[0.08em] text-slate-500">{label}</p>
      <p className={`mt-2.5 text-3xl font-bold tracking-[-0.025em] leading-9 tabular-nums ${tone === 'info' ? 'text-brand' : tone === 'good' ? 'text-emerald-600' : tone === 'warn' ? 'text-amber-600' : tone === 'danger' ? 'text-rose-600' : 'text-slate-900'}`}>
        {value}
      </p>
      {hint && <p className="mt-2 text-xs leading-5 tracking-[0.01em] text-slate-400">{hint}</p>}
    </Card>
  );
}

export function EmptyState({ title = '暂无数据', description = '当前范围内还没有可显示的记录。' }) {
  return (
    <div className="rounded-xl border border-dashed border-slate-200 bg-white/80 px-6 py-12 text-center shadow-[0_1px_2px_rgba(0,0,0,0.02)]">
      <div className="mx-auto flex size-12 items-center justify-center rounded-xl border border-slate-200 bg-slate-50 text-slate-400">
        <Inbox className="size-6 text-brand" />
      </div>
      <p className="mt-4 font-semibold text-slate-900 text-sm tracking-[-0.01em] leading-5">{title}</p>
      <p className="mt-1 text-xs text-slate-500 max-w-sm mx-auto leading-5 tracking-[-0.005em]">{description}</p>
    </div>
  );
}

{/* ─── 微信标准四列设置行组件 (WeChat 4-Column Setting Row) ─── */}
export function AdminSettingRow({ label, value, context, action, onClickAction, className = '' }) {
  return (
    <div className={`flex flex-col sm:flex-row sm:items-center justify-between py-4 border-b border-slate-100 hover:bg-slate-50/70 transition-colors text-sm gap-2 sm:gap-4 px-2 ${className}`}>
      {/* Col 1: Label */}
      <div className="w-48 shrink-0 text-slate-500 font-medium">
        {label}
      </div>

      {/* Col 2: Current Value */}
      <div className="w-56 shrink-0 text-slate-900 font-semibold">
        {value}
      </div>

      {/* Col 3: Rules & Limits */}
      <div className="flex-1 text-xs text-slate-400 leading-relaxed">
        {context}
      </div>

      {/* Col 4: Action */}
      <div className="w-28 shrink-0 text-left sm:text-right">
        {action && (
          <button
            type="button"
            onClick={onClickAction}
            className="text-xs font-semibold text-brand hover:underline transition-all cursor-pointer"
          >
            {action}
          </button>
        )}
      </div>
    </div>
  );
}

{/* ─── 微信分步流程网格卡片 (WeChat 3-Column Milestone Card) ─── */}
export function AdminCardGridItem({ title, badge, subtext, actionLabel, onAction, className = '' }) {
  return (
    <div className={`p-4 rounded-xl border border-slate-200 bg-white shadow-[0_1px_2px_rgba(0,0,0,0.02)] flex flex-col justify-between space-y-3 hover:border-slate-300 transition-all ${className}`}>
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-semibold text-slate-900 flex items-center gap-2">
          <span>{title}</span>
          {badge && (
            <span className="rounded px-1.5 py-0.2 text-[10px] bg-slate-100 text-slate-600 border border-slate-200 font-normal">
              {badge}
            </span>
          )}
        </h4>
        {actionLabel && (
          <button
            type="button"
            onClick={onAction}
            className="text-xs font-semibold text-brand hover:underline cursor-pointer"
          >
            {actionLabel}
          </button>
        )}
      </div>
      {subtext && (
        <p className="text-xs text-slate-400 line-clamp-1">{subtext}</p>
      )}
    </div>
  );
}

{/* ─── 微信风格下划线选项卡 (WeChat Underline Sub-Nav Tabs) ─── */}
export function AdminUnderlineTabs({ tabs = [], activeTab, onTabChange }) {
  return (
    <div className="flex items-center gap-6 border-b border-slate-200">
      {tabs.map((tab) => {
        const isActive = activeTab === tab.id;
        return (
          <button
            key={tab.id}
            type="button"
            onClick={() => onTabChange(tab.id)}
            className={`relative pb-3 text-sm font-medium transition-colors cursor-pointer ${
              isActive ? 'text-brand font-semibold' : 'text-slate-500 hover:text-slate-900'
            }`}
          >
            {tab.label}
            {isActive && (
              <span className="absolute bottom-0 inset-x-0 h-0.5 bg-brand rounded-full" />
            )}
          </button>
        );
      })}
    </div>
  );
}

export function DataTable({ columns, rows, data, empty = '暂无记录', emptyText }) {
  const tableRows = rows || data || [];
  const emptyLabel = emptyText || empty;
  if (!tableRows?.length) return <EmptyState title={emptyLabel} />;

  return (
    <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-[0_1px_3px_rgba(0,0,0,0.03)] scrollbar-none [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
      <table className="w-full min-w-[760px] text-left text-sm">
        <thead className="border-b border-slate-200 bg-slate-50/80 text-xs font-semibold text-slate-500">
          <tr>
            {columns.map((column) => (
              <th key={column.key} className="whitespace-nowrap px-4 py-3.5">
                {column.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {tableRows.map((row, index) => (
            <tr key={row.id || index} className="transition-colors duration-150 hover:bg-slate-50/70">
              {columns.map((column) => (
                <td key={column.key} className="px-4 py-3.5 text-slate-700 text-xs leading-5 tracking-[-0.005em]">
                  {column.render ? column.render(row) : (row[column.key] ?? '—')}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function Pagination({ meta, searchParams }) {
  const currentParams = new URLSearchParams(searchParams || {});
  const hasCursor = Boolean(currentParams.get('cursor'));
  const hasMore = Boolean(meta?.hasMore);

  if (!hasCursor && !hasMore) return null;

  const nextParams = new URLSearchParams(searchParams || {});
  if (meta?.nextCursor) {
    nextParams.set('cursor', meta.nextCursor);
  }

  const resetParams = new URLSearchParams(searchParams || {});
  resetParams.delete('cursor');

  return (
    <div className="mt-5 flex items-center justify-between">
      <div className="text-xs text-slate-400">
        {hasCursor ? '当前处于后续分页结果' : '当前显示首屏结果'}
      </div>
      <div className="flex items-center gap-2.5">
        {hasCursor && (
          <a
            href={`?${resetParams.toString()}`}
            className="inline-flex h-[38px] items-center rounded-lg border border-slate-200 bg-white px-3.5 text-xs font-medium text-slate-600 tracking-[-0.005em] transition-all duration-150 hover:bg-slate-50 hover:text-slate-900 shadow-sm"
          >
            ← 返回第一页
          </a>
        )}
        {hasMore && (
          <a
            href={`?${nextParams.toString()}`}
            className="inline-flex h-[38px] items-center rounded-lg border border-brand/20 bg-brand/10 px-4 text-xs font-semibold text-brand tracking-[-0.005em] transition-all duration-150 hover:bg-brand/20 active:scale-[0.98] shadow-sm"
          >
            加载下一页 →
          </a>
        )}
      </div>
    </div>
  );
}

{/* ─── 微信 We分析 成对分析图表卡片组件 (WeAnalysis Paired Chart Card) ─── */}
export function AdminChartCard({
  title,
  subtitle,
  actions,
  filters,
  children,
  emptyText,
  className = '',
}) {
  return (
    <div className={`p-5 rounded-xl border border-slate-200 bg-white shadow-[0_1px_3px_rgba(0,0,0,0.03)] flex flex-col justify-between ${className}`}>
      {/* Header */}
      <div className="flex items-start justify-between gap-4 pb-3 border-b border-slate-100">
        <div>
          <h3 className="text-sm font-semibold text-slate-900">{title}</h3>
          {subtitle && (
            <p className="mt-0.5 text-xs font-mono text-slate-400">{subtitle}</p>
          )}
        </div>
        {actions && (
          <div className="flex items-center gap-2 shrink-0 text-xs">
            {actions}
          </div>
        )}
      </div>

      {/* In-Card Filters */}
      {filters && (
        <div className="py-2.5 flex items-center justify-between gap-3 text-xs flex-wrap">
          {filters}
        </div>
      )}

      {/* Main Chart Body or Silent Empty */}
      <div className="pt-3 min-h-[220px] flex items-center justify-center">
        {emptyText ? (
          <div className="flex items-center gap-1.5 text-xs text-slate-400 font-mono">
            <span className="text-xs">ⓘ</span>
            <span>{emptyText}</span>
          </div>
        ) : (
          children
        )}
      </div>
    </div>
  );
}

{/* ─── 微信 We分析 时间单步微调器 (WeAnalysis Date Stepper) ─── */}
export function AdminDateStepper({ label, onPrev, onNext, canPrev = true, canNext = true }) {
  return (
    <div className="inline-flex items-center gap-1.5 text-xs text-slate-500">
      <button
        type="button"
        onClick={onPrev}
        disabled={!canPrev}
        className="p-1 rounded hover:bg-slate-100 text-slate-400 hover:text-slate-800 disabled:opacity-20 transition-colors cursor-pointer"
      >
        ‹
      </button>
      <span className="font-mono text-slate-800 font-medium px-1">{label}</span>
      <button
        type="button"
        onClick={onNext}
        disabled={!canNext}
        className="p-1 rounded hover:bg-slate-100 text-slate-400 hover:text-slate-800 disabled:opacity-20 transition-colors cursor-pointer"
      >
        ›
      </button>
    </div>
  );
}
