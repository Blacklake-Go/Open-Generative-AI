'use client';

import { AlertTriangle, X } from 'lucide-react';
import { Button } from '@/components/admin/AdminUi';

export default function UnroutedConfirmModal({ model, onCancel, onSmartMatch }) {
  if (!model) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-4" role="presentation">
      <section role="dialog" aria-modal="true" aria-label="模型渠道待审核"
        className="w-full max-w-md rounded-2xl border border-slate-200/90 bg-white p-6 shadow-2xl text-slate-800 animate-fade-in">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2 text-amber-500"><AlertTriangle className="size-5" /><h2 className="text-base font-bold text-slate-900">渠道待审核</h2></div>
          <button type="button" onClick={onCancel} aria-label="关闭" className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700 transition-colors"><X className="size-4" /></button>
        </div>
        <p className="mt-4 text-sm text-slate-600 leading-relaxed">
          {model.display_name || model.name}（<code className="text-xs font-mono bg-slate-100 px-1 py-0.5 rounded text-slate-700">{model.id}</code>）没有已审核渠道。请核实准确的上游模型、端点、输入输出能力及价格，再提交映射审核。
        </p>
        <p className="mt-2 text-xs text-slate-400">展示开关不会让此模型变成可下单模型。</p>
        <div className="mt-5 flex flex-wrap justify-end gap-2 border-t border-slate-100 pt-4">
          <Button variant="secondary" size="sm" onClick={onCancel}>关闭</Button>
          <Button variant="secondary" size="sm" onClick={() => onSmartMatch?.(model)}>查看候选</Button>
          <a href="/admin/models/routing" className="inline-flex items-center rounded-lg bg-brand hover:bg-brand/90 px-3 py-1.5 text-xs font-semibold text-white shadow-sm transition-colors">前往映射审核</a>
        </div>
      </section>
    </div>
  );
}
