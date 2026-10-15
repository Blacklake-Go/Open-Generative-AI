'use client';

import { useEffect, useState } from 'react';
import { Search, X } from 'lucide-react';
import { Button } from '@/components/admin/AdminUi';

export default function SmartMatchModal({ isOpen, onClose, initialModel, allModels = [], activeCategory = 'all' }) {
  const [modelId, setModelId] = useState('');
  const [candidates, setCandidates] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (isOpen) setModelId(initialModel?.id || '');
  }, [isOpen, initialModel]);

  useEffect(() => {
    if (!isOpen || !modelId) return;
    const controller = new AbortController();
    const model = allModels.find((item) => item.id === modelId);
    setLoading(true);
    setError('');
    setCandidates([]);
    fetch('/api/admin/models/control', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'match_channel_candidates', modelId, category: model?.category, limit: 6 }),
      signal: controller.signal,
    })
      .then(async (response) => {
        const body = await response.json();
        if (!response.ok) throw new Error(body.error?.message || '候选查询失败');
        setCandidates(Array.isArray(body.data?.candidates) ? body.data.candidates : []);
      })
      .catch((cause) => { if (cause.name !== 'AbortError') setError(cause.message); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [isOpen, modelId, allModels]);

  if (!isOpen) return null;
  const selectableModels = allModels.filter((model) => activeCategory === 'all' || model.category === activeCategory);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-4" role="presentation">
      <section aria-label="渠道候选核对" aria-modal="true" role="dialog"
        className="w-full max-w-2xl rounded-2xl border border-slate-200/90 bg-white p-6 shadow-2xl text-slate-800 animate-fade-in">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-base font-bold text-slate-900">渠道候选核对</h2>
            <p className="mt-1 text-xs text-slate-500">匹配分数仅帮助查找。模型身份、端点、能力和价格仍需人工核实并审核。</p>
          </div>
          <button type="button" onClick={onClose} aria-label="关闭" className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700 transition-colors"><X className="size-4" /></button>
        </div>
        <label htmlFor="candidate-model" className="mt-4 block text-xs font-semibold text-slate-700">规范模型</label>
        <select id="candidate-model" value={modelId} onChange={(event) => setModelId(event.target.value)}
          className="mt-1.5 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-800 focus:bg-white focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand/20">
          <option value="">请选择模型</option>
          {selectableModels.map((model) => <option key={model.id} value={model.id}>{model.display_name || model.name} · {model.id}</option>)}
        </select>
        <div className="mt-4 max-h-72 space-y-2 overflow-y-auto" aria-live="polite">
          {loading && <p className="text-xs text-slate-500 py-4 text-center">正在查询候选…</p>}
          {error && <p className="text-xs text-red-500 py-2">{error}</p>}
          {!loading && !error && modelId && candidates.length === 0 && <p className="text-xs text-slate-500 py-4 text-center">没有候选。请到渠道目录手动核实。</p>}
          {candidates.map((candidate, index) => (
            <div key={`${candidate.providerId}-${candidate.providerModelId}-${index}`} className="rounded-xl border border-slate-200/80 bg-slate-50/70 p-3 hover:bg-slate-50 transition-colors">
              <div className="flex items-center gap-2 text-sm font-semibold text-slate-800"><Search className="size-4 text-slate-400" />{candidate.providerName || candidate.providerId}</div>
              <p className="mt-1.5 break-all font-mono text-xs text-slate-600 bg-white px-2 py-1 rounded border border-slate-200/60 inline-block">{candidate.providerModelId}</p>
              <p className="mt-1.5 text-xs text-emerald-600 font-medium">候选匹配 {Math.round(Number(candidate.confidence || 0) * 100)}% · {candidate.reason || '需人工核对'}</p>
            </div>
          ))}
        </div>
        <div className="mt-5 flex justify-end gap-2 border-t border-slate-100 pt-4">
          <Button variant="secondary" size="sm" onClick={onClose}>关闭</Button>
          <a href="/admin/models/routing" className="inline-flex items-center rounded-lg bg-brand hover:bg-brand/90 px-3.5 py-1.5 text-xs font-semibold text-white shadow-sm transition-colors">前往映射审核</a>
        </div>
      </section>
    </div>
  );
}
