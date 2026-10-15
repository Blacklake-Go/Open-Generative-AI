'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  ShieldCheck, RefreshCw, Layers, CheckCircle2, AlertTriangle,
  GitMerge, X, Loader2, Sparkles, Server, ArrowRight, ExternalLink,
  Search, Check, Zap, HelpCircle
} from 'lucide-react';
import { Button } from '@/components/admin/AdminUi';
import BrandLogo from '@/components/admin/BrandLogo';

export default function ModelHygieneDrawer({
  isOpen,
  onClose,
  onHygieneCompleted,
}) {
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState(null);
  const [activeTab, setActiveTab] = useState('overview'); // 'overview' | 'families' | 'candidates'
  const [syncing, setSyncing] = useState(false);
  const [mergingId, setMergingId] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [toast, setToast] = useState(null);

  const fetchHygieneData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/admin/models/deduplicate');
      const json = await res.json();
      if (json.ok && json.data) {
        setData(json.data);
      } else {
        setToast({ msg: json.error?.message || '获取体检数据失败', type: 'error' });
      }
    } catch (err) {
      setToast({ msg: err.message, type: 'error' });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isOpen) {
      fetchHygieneData();
    }
  }, [isOpen, fetchHygieneData]);

  const showToast = (msg, type = 'success') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3000);
  };

  // 一键执行全库规范化收敛
  const handleRunFullSync = async () => {
    if (!window.confirm('确认执行全库模型规范化收敛？这会将所有预设核心旗舰模型激活，归并动作变体渠道，并将非核心模型下沉为备用。所有通道数据完整无损。')) {
      return;
    }
    setSyncing(true);
    try {
      const res = await fetch('/api/admin/models/deduplicate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'run_sync' }),
      });
      const json = await res.json();
      if (json.ok) {
        showToast('全库模型去重与收敛执行成功！');
        await fetchHygieneData();
        if (onHygieneCompleted) onHygieneCompleted();
      } else {
        showToast(json.error?.message || '执行失败', 'error');
      }
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setSyncing(false);
    }
  };

  // 单个孤立模型合并至核心模型
  const handleMergeAlias = async (sourceModelId, targetModelId) => {
    if (!targetModelId) {
      showToast('请选择目标规范模型', 'error');
      return;
    }
    setMergingId(sourceModelId);
    try {
      const res = await fetch('/api/admin/models/deduplicate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'merge',
          sourceModelId,
          targetModelId,
        }),
      });
      const json = await res.json();
      if (json.ok) {
        showToast(`已成功将【${sourceModelId}】合并至【${targetModelId}】✓`);
        await fetchHygieneData();
        if (onHygieneCompleted) onHygieneCompleted();
      } else {
        showToast(json.error?.message || '合并失败', 'error');
      }
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setMergingId(null);
    }
  };

  if (!isOpen) return null;

  const summary = data?.summary || {
    totalModels: 0,
    coreVisibleCount: 0,
    backupCount: 0,
    disabledCount: 0,
    totalChannels: 0,
    canonicalTotal: 0,
  };

  const filteredFamilies = (data?.canonicalFamilies || []).filter((f) => {
    if (!searchTerm) return true;
    const q = searchTerm.toLowerCase();
    return (
      f.targetId.toLowerCase().includes(q) ||
      f.name.toLowerCase().includes(q) ||
      (f.displayName || '').toLowerCase().includes(q) ||
      f.aliases.some((a) => a.toLowerCase().includes(q))
    );
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm animate-fade-in">
      <div className="relative w-full max-w-4xl max-h-[88vh] flex flex-col rounded-2xl border border-slate-200/90 bg-white shadow-2xl overflow-hidden text-slate-800">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-200/90 px-6 py-4 bg-slate-50/70">
          <div className="flex items-center gap-2.5">
            <span className="flex size-8 items-center justify-center rounded-lg bg-emerald-50 text-emerald-600 border border-emerald-200">
              <ShieldCheck className="size-5" />
            </span>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-bold text-slate-900">模型库治理与去重助手</h3>
                <span className="rounded-full bg-emerald-50 text-emerald-700 px-2 py-0.5 text-xs font-semibold border border-emerald-200">
                  无损收敛治理
                </span>
              </div>
              <p className="text-xs text-slate-500 mt-0.5">
                将冗余动作变体归并在旗舰规范模型下，沉降裸工作流为备用，保持前台精简与渠道高可用。
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700 transition-colors"
          >
            <X className="size-5" />
          </button>
        </div>

        {/* Toast */}
        {toast && (
          <div
            className={`px-4 py-2 text-xs font-medium text-center ${
              toast.type === 'error' ? 'bg-red-50 text-red-700 border-b border-red-200' : 'bg-emerald-50 text-emerald-700 border-b border-emerald-200'
            }`}
          >
            {toast.msg}
          </div>
        )}

        {/* Tab Navigation (Pill Segmented Track) */}
        <div className="flex items-center justify-between px-6 py-3 border-b border-slate-200/90 bg-slate-50/50">
          <div className="inline-flex rounded-full border border-slate-200 bg-slate-100/80 p-1">
            <button
              type="button"
              onClick={() => setActiveTab('overview')}
              className={`flex items-center gap-1.5 rounded-full px-3.5 py-1 text-xs font-medium transition-all ${
                activeTab === 'overview'
                  ? 'bg-white text-slate-900 shadow-sm font-semibold'
                  : 'text-slate-500 hover:text-slate-900'
              }`}
            >
              <Sparkles className="size-3.5" />
              治理体检与总览
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('families')}
              className={`flex items-center gap-1.5 rounded-full px-3.5 py-1 text-xs font-medium transition-all ${
                activeTab === 'families'
                  ? 'bg-white text-slate-900 shadow-sm font-semibold'
                  : 'text-slate-500 hover:text-slate-900'
              }`}
            >
              <Layers className="size-3.5" />
              核心规范家族 ({summary.coreVisibleCount})
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('candidates')}
              className={`flex items-center gap-1.5 rounded-full px-3.5 py-1 text-xs font-medium transition-all ${
                activeTab === 'candidates'
                  ? 'bg-white text-slate-900 shadow-sm font-semibold'
                  : 'text-slate-500 hover:text-slate-900'
              }`}
            >
              <GitMerge className="size-3.5" />
              疑似孤立别名 ({data?.unmergedCandidates?.length || 0})
            </button>
          </div>

          <div className="flex items-center gap-2">
            <Button
              variant="primary"
              size="sm"
              onClick={handleRunFullSync}
              disabled={syncing || loading}
              className="text-xs bg-emerald-600 hover:bg-emerald-500 text-white font-semibold shadow-sm"
            >
              {syncing ? (
                <>
                  <Loader2 className="size-3.5 animate-spin mr-1.5" />
                  正在收敛治理...
                </>
              ) : (
                <>
                  <Zap className="size-3.5 mr-1.5 text-yellow-300" />
                  一键全库规范化收敛
                </>
              )}
            </Button>
            <button
              type="button"
              onClick={fetchHygieneData}
              disabled={loading}
              className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors"
              title="刷新体检数据"
            >
              <RefreshCw className={`size-4 ${loading ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>

        {/* Content Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {loading && !data ? (
            <div className="flex flex-col items-center justify-center py-16 gap-3">
              <Loader2 className="size-8 animate-spin text-brand" />
              <p className="text-xs text-slate-500">正在深度扫描全库模型健康与通道拓扑...</p>
            </div>
          ) : activeTab === 'overview' ? (
            <>
              {/* Metric Highlights */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="rounded-xl border border-slate-200/90 bg-white p-4 shadow-sm">
                  <div className="text-xs text-slate-500">全库模型总数</div>
                  <div className="text-2xl font-bold text-slate-900 mt-1">{summary.totalModels}</div>
                  <div className="text-xs text-slate-400 mt-0.5">历史全量定义</div>
                </div>
                <div className="rounded-xl border border-emerald-200 bg-emerald-50/50 p-4 shadow-sm">
                  <div className="text-xs text-emerald-700 font-semibold flex items-center gap-1">
                    <CheckCircle2 className="size-3.5" />
                    核心前台上架
                  </div>
                  <div className="text-2xl font-bold text-emerald-700 mt-1">{summary.coreVisibleCount}</div>
                  <div className="text-xs text-emerald-600 mt-0.5">
                    占比 {((summary.coreVisibleCount / (summary.totalModels || 1)) * 100).toFixed(1)}% · 精准收敛
                  </div>
                </div>
                <div className="rounded-xl border border-slate-200/90 bg-white p-4 shadow-sm">
                  <div className="text-xs text-slate-500">备选与下沉模型</div>
                  <div className="text-2xl font-bold text-slate-700 mt-1">{summary.backupCount}</div>
                  <div className="text-xs text-slate-400 mt-0.5">含 382 个工作流 / 历史备份</div>
                </div>
                <div className="rounded-xl border border-slate-200/90 bg-white p-4 shadow-sm">
                  <div className="text-xs text-brand font-semibold flex items-center gap-1">
                    <Server className="size-3.5" />
                    聚合渠道通道
                  </div>
                  <div className="text-2xl font-bold text-brand mt-1">{summary.totalChannels}</div>
                  <div className="text-xs text-slate-400 mt-0.5">已全部多对一挂载</div>
                </div>
              </div>

              {/* Architecture & Strategy Card */}
              <div className="rounded-xl border border-slate-200/90 bg-white p-5 space-y-4 shadow-sm">
                <h4 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                  <ShieldCheck className="size-4 text-emerald-600" />
                  SupDance 两层模型治理模型机制
                </h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs text-slate-600">
                  <div className="space-y-1.5 p-3 rounded-lg bg-slate-50 border border-slate-200/80">
                    <span className="font-semibold text-slate-900 flex items-center gap-1.5">
                      <span className="size-2 rounded-full bg-emerald-500" />
                      1. 用户端：规范旗舰模型 (Canonical)
                    </span>
                    <p className="leading-relaxed">
                      前台仅呈现 ~50 个权威模型（如 Kling 3.0, Seedream 5.0, FLUX 1.1 Pro）。文生图、图生图、文生视频等动作在同一规范模型下以参数形式自动路由，不再产生碎片化模型。
                    </p>
                  </div>
                  <div className="space-y-1.5 p-3 rounded-lg bg-slate-50 border border-slate-200/80">
                    <span className="font-semibold text-slate-900 flex items-center gap-1.5">
                      <span className="size-2 rounded-full bg-brand" />
                      2. 底层端：多供应商渠道聚合 (Provider Models)
                    </span>
                    <p className="leading-relaxed">
                      原先散落的 1699 个渠道通道全部挂载至规范模型名下，结合熔断器与智能权重实现多云备份容灾与成本最优分发，历史生成完全兼容不丢单。
                    </p>
                  </div>
                </div>
              </div>

              {/* Status Action CTA */}
              <div className="rounded-xl border border-slate-200/90 bg-slate-50 p-4 flex items-center justify-between">
                <div>
                  <div className="text-sm font-semibold text-slate-900">日常自动化治理机制</div>
                  <div className="text-xs text-slate-500 mt-0.5">
                    从供应商同步新目录时，系统将通过智能通道匹配中枢自动将新通道挂载至上述规范模型。
                  </div>
                </div>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => setActiveTab('families')}
                  className="text-xs shrink-0"
                >
                  查看核心规范清单
                  <ArrowRight className="size-3.5 ml-1" />
                </Button>
              </div>
            </>
          ) : activeTab === 'families' ? (
            <div className="space-y-4">
              <div className="flex items-center justify-between gap-3">
                <div className="relative flex-1 max-w-sm">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-slate-400" />
                  <input
                    type="text"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    placeholder="搜索核心模型名称、ID 或别名..."
                    className="w-full h-9 pl-9 pr-3 text-xs rounded-full bg-slate-50 border border-slate-200 focus:bg-white focus:border-brand focus:outline-none text-slate-800 placeholder:text-slate-400"
                  />
                </div>
                <span className="text-xs text-slate-500">
                  显示 <span className="font-semibold text-slate-800">{filteredFamilies.length}</span> / {data?.canonicalFamilies?.length || 0} 个核心模型
                </span>
              </div>

              <div className="space-y-2.5">
                {filteredFamilies.map((fam) => (
                  <div
                    key={fam.targetId}
                    className="rounded-xl border border-slate-200/90 bg-white p-3.5 hover:border-slate-300 transition-colors flex flex-col md:flex-row md:items-center justify-between gap-3 shadow-sm"
                  >
                    <div className="space-y-1 flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <BrandLogo model={{ id: fam.targetId, name: fam.name }} size="sm" className="rounded-md shrink-0" />
                        <span className="font-bold text-sm text-slate-900 truncate">{fam.name}</span>
                        <code className="text-[11px] font-mono text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded">
                          {fam.targetId}
                        </code>
                        <span className="text-[10px] uppercase font-semibold text-brand bg-brand/10 px-1.5 py-0.5 rounded border border-brand/20">
                          {fam.category}
                        </span>
                        {fam.isLive && (
                          <span className="text-[10px] font-bold text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-200">
                            已上架
                          </span>
                        )}
                      </div>
                      <div className="text-xs text-slate-500 truncate">
                        {fam.displayName}
                      </div>
                      {fam.aliases.length > 0 && (
                        <div className="flex items-center gap-1.5 flex-wrap pt-0.5">
                          <span className="text-[10px] text-slate-400">已收敛别名:</span>
                          {fam.aliases.map((al) => (
                            <span
                              key={al}
                              className="text-[10px] font-mono text-slate-600 bg-slate-100 px-1.5 py-0.5 rounded border border-slate-200/60"
                            >
                              {al}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>

                    <div className="flex items-center gap-3 shrink-0">
                      <div className="text-right">
                        <div className="text-sm font-bold text-emerald-700 flex items-center gap-1 justify-end">
                          <Server className="size-3" />
                          {fam.channelCount} 渠道
                        </div>
                        <div className="text-[11px] text-slate-400">
                          归纳 {fam.aliasCount} 个变体
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="p-3.5 rounded-xl border border-slate-200/90 bg-slate-50 text-xs text-slate-600 leading-relaxed">
                以下为全库中名称含有动作后缀（如 <code className="text-slate-900 font-mono bg-white px-1 py-0.5 rounded border border-slate-200/80">-text-to-video</code>, <code className="text-slate-900 font-mono bg-white px-1 py-0.5 rounded border border-slate-200/80">-turbo</code> 等）但尚未完全收敛的潜在别名。你可以点击将其拥有的渠道一键平滑改绑到对应核心规范模型下。
              </div>

              {(data?.unmergedCandidates || []).length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 gap-2 text-center">
                  <CheckCircle2 className="size-8 text-emerald-500" />
                  <div className="text-sm font-bold text-slate-900">全库已无孤立动作变体！</div>
                  <p className="text-xs text-slate-500">所有历史动作变体已全部收敛合并到核心规范模型中。</p>
                </div>
              ) : (
                <div className="space-y-2.5">
                  {(data?.unmergedCandidates || []).map((cand) => (
                    <div
                      key={cand.id}
                      className="rounded-xl border border-slate-200/90 bg-white p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-sm"
                    >
                      <div className="space-y-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <BrandLogo model={{ id: cand.id, name: cand.name }} size="sm" className="rounded-md shrink-0" />
                          <span className="font-semibold text-sm text-slate-900 truncate">{cand.name}</span>
                          <code className="text-[11px] font-mono text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded">
                            {cand.id}
                          </code>
                          <span className="text-[10px] text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded">
                            {cand.channel_count} 通道
                          </span>
                        </div>
                        <div className="text-xs text-slate-500">
                          推荐合并目标：
                          <span className="font-mono text-brand font-semibold ml-1">
                            {cand.suggestedTarget || '需手动选择'}
                          </span>
                        </div>
                      </div>

                      {cand.suggestedTarget && (
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={() => handleMergeAlias(cand.id, cand.suggestedTarget)}
                          disabled={mergingId === cand.id}
                          className="text-xs shrink-0 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200"
                        >
                          {mergingId === cand.id ? (
                            <Loader2 className="size-3.5 animate-spin mr-1" />
                          ) : (
                            <GitMerge className="size-3.5 mr-1" />
                          )}
                          一键合并至 {cand.suggestedTarget}
                        </Button>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between border-t border-slate-200/90 px-6 py-3.5 bg-slate-50/70">
          <span className="text-xs text-slate-400">
            提示：所有去重合并操作均为非破坏性，历史生成和各供应商渠道映射完整保留。
          </span>
          <Button variant="secondary" size="sm" onClick={onClose} className="text-xs">
            关闭
          </Button>
        </div>
      </div>
    </div>
  );
}
