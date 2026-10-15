import { Inbox } from 'lucide-react';
import { CopyableId, ConfirmActionDialog } from './AdminUiClient';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';

export { CopyableId, ConfirmActionDialog, Badge, Button };

export function PageHeader({ eyebrow = 'SupDance 运营后台', title, description, children }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4 border-b border-white/[0.08] pb-5">
      <div>
        <p className="mb-1.5 text-xs font-semibold uppercase tracking-[0.08em] text-cyan-400">
          {eyebrow}
        </p>
        <h1 className="text-2xl font-bold tracking-[-0.02em] leading-8 sm:text-3xl sm:leading-9 text-white">
          {title}
        </h1>
        {description && (
          <p className="mt-1.5 max-w-3xl text-sm leading-6 tracking-[-0.005em] text-gray-400">
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
    <section className={`rounded-2xl border border-white/[0.08] bg-surface/90 p-5 shadow-xl shadow-black/40 backdrop-blur-md transition-all duration-200 ease-out hover:border-white/[0.14] ${className}`}>
      {children}
    </section>
  );
}
export function StatusBadge({ children, tone = 'neutral' }) {
  const styles = {
    good: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-400',
    warn: 'border-amber-500/30 bg-amber-500/10 text-amber-400',
    danger: 'border-red-500/30 bg-red-500/10 text-red-400',
    info: 'border-cyan-500/30 bg-cyan-500/10 text-cyan-400',
    neutral: 'border-white/[0.10] bg-white/[0.04] text-gray-400',
  };
  return (
    <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium tracking-[0.01em] leading-4 ${styles[tone] || styles.neutral}`}>
      {children}
    </span>
  );
}
export function MetricCard({ label, value, hint, tone = 'neutral' }) {
  return (
    <Card className="p-5 relative overflow-hidden group hover:border-cyan-500/30 hover:shadow-cyan-500/5 transition-all duration-200">
      <p className="text-xs font-semibold uppercase tracking-[0.08em] text-gray-400">{label}</p>
      <p className={`mt-2.5 text-3xl font-bold tracking-[-0.025em] leading-9 tabular-nums ${tone === 'info' ? 'text-cyan-400' : tone === 'good' ? 'text-emerald-400' : tone === 'warn' ? 'text-amber-400' : tone === 'danger' ? 'text-red-400' : 'text-white'}`}>
        {value}
      </p>
      {hint && <p className="mt-2 text-xs leading-5 tracking-[0.01em] text-gray-400">{hint}</p>}
    </Card>
  );
}
export function EmptyState({ title = '暂无数据', description = '当前范围内还没有可显示的记录。' }) {
  return (
    <div className="rounded-2xl border border-dashed border-white/[0.10] bg-surface/60 px-6 py-12 text-center backdrop-blur-sm">
      <div className="mx-auto flex size-12 items-center justify-center rounded-xl border border-white/[0.08] bg-white/[0.04] text-gray-400">
        <Inbox className="size-6 text-cyan-400/80" />
      </div>
      <p className="mt-4 font-semibold text-white text-sm tracking-[-0.01em] leading-5">{title}</p>
      <p className="mt-1 text-xs text-gray-400 max-w-sm mx-auto leading-5 tracking-[-0.005em]">{description}</p>
    </div>
  );
}
export function DataTable({ columns, rows, data, empty = '暂无记录', emptyText }) {
  const tableRows = rows || data || [];
  const emptyLabel = emptyText || empty;
  if (!tableRows?.length) return <EmptyState title={emptyLabel} />;

  return (
    <div className="overflow-x-auto rounded-2xl border border-white/[0.08] bg-surface/90 shadow-xl shadow-black/40 backdrop-blur-md scrollbar-none [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
      <table className="w-full min-w-[760px] text-left text-sm">
        <thead className="border-b border-white/[0.08] bg-white/[0.02] text-xs font-semibold uppercase tracking-[0.06em] text-gray-400">
          <tr>
            {columns.map((column) => (
              <th key={column.key} className="whitespace-nowrap px-4 py-3.5">
                {column.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-white/[0.06]">
          {tableRows.map((row, index) => (
            <tr key={row.id || index} className="transition-colors duration-150 hover:bg-white/[0.03]">
              {columns.map((column) => (
                <td key={column.key} className="px-4 py-3.5 text-gray-300 text-xs leading-5 tracking-[-0.005em]">
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
      <div className="text-xs text-white/40">
        {hasCursor ? '当前处于后续分页结果' : '当前显示首屏结果'}
      </div>
      <div className="flex items-center gap-2.5">
        {hasCursor && (
          <a
            href={`?${resetParams.toString()}`}
            className="inline-flex h-[38px] items-center rounded-xl border border-white/[0.10] bg-white/[0.04] px-3.5 text-xs font-medium text-gray-300 tracking-[-0.005em] transition-all duration-150 hover:bg-white/[0.08] hover:text-white"
          >
            ← 返回第一页
          </a>
        )}
        {hasMore && (
          <a
            href={`?${nextParams.toString()}`}
            className="inline-flex h-[38px] items-center rounded-xl border border-white/[0.10] bg-white/[0.06] px-4 text-xs font-semibold text-gray-200 tracking-[-0.005em] transition-all duration-150 hover:border-cyan-500/40 hover:bg-cyan-500/10 hover:text-cyan-400 active:scale-[0.98]"
          >
            加载下一页 →
          </a>
        )}
      </div>
    </div>
  );
}
