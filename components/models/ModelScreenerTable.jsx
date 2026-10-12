'use client';

import React, { useState, useMemo, useEffect } from 'react';
import Link from 'next/link';
import {
  Search,
  ArrowUpDown,
  TrendingUp,
  TrendingDown,
  Sparkles,
  ChevronRight,
  ExternalLink,
  Activity,
  Layers,
  Zap,
  SlidersHorizontal,
  Clock,
  ArrowRight,
  Shield,
  Cpu,
  Server,
  Gauge,
  Boxes,
  Radio,
  CheckCircle2,
} from 'lucide-react';
import SparklineChart from './SparklineChart';
import ModelBrandLogo from './ModelBrandLogo';
import {
  getAllScreenerModels,
  MODEL_CATEGORIES,
  TIMEFRAMES,
  getModelTimeframeStats,
} from '@/lib/modelCenter/modelScreenerData';
import { inferStudioTabFromModel } from '@/lib/studio-routes';

const VIEW_PERSPECTIVES = [
  { id: 'overview', label: 'Overview', labelZh: '全景概览', icon: Layers },
  { id: 'performance', label: 'Cluster & SLA', labelZh: '算力负载与性能', icon: Activity },
  { id: 'throughput', label: 'Output & Throughput', labelZh: '产出与交付', icon: Zap },
];

export default function ModelScreenerTable({ locale = 'zh-CN' }) {
  const isChinese = Boolean(locale?.includes('zh'));

  const [selectedCategory, setSelectedCategory] = useState('all');
  const [selectedTimeframe, setSelectedTimeframe] = useState('24h');
  const [activeView, setActiveView] = useState('overview'); // 'overview' | 'performance' | 'throughput'
  const [searchQuery, setSearchQuery] = useState('');
  const [sortField, setSortField] = useState('calls');
  const [sortOrder, setSortOrder] = useState('desc');

  // 实时状态微动心跳时钟 (每 2.5 秒触发一次自然呼吸起伏)
  const [liveTick, setLiveTick] = useState(0);

  useEffect(() => {
    if (selectedTimeframe !== '1h') return;
    const timer = setInterval(() => {
      setLiveTick((t) => t + 1);
    }, 2500);
    return () => clearInterval(timer);
  }, [selectedTimeframe]);

  const allModels = useMemo(() => getAllScreenerModels(), []);

  // 将每个模型与其动态时间维度指标聚合
  const modelsWithStats = useMemo(() => {
    return allModels.map((row) => {
      const stats = getModelTimeframeStats(row, selectedTimeframe, liveTick);
      return {
        ...row,
        stats,
      };
    });
  }, [allModels, selectedTimeframe, liveTick]);

  // 过滤与排序
  const filteredModels = useMemo(() => {
    let result = modelsWithStats.filter((item) => {
      const matchCat = selectedCategory === 'all' || item.category === selectedCategory;
      const q = searchQuery.toLowerCase().trim();
      const matchSearch =
        !q ||
        item.name.toLowerCase().includes(q) ||
        item.symbol.toLowerCase().includes(q) ||
        item.provider.toLowerCase().includes(q) ||
        item.description.toLowerCase().includes(q);
      return matchCat && matchSearch;
    });

    result.sort((a, b) => {
      let valA, valB;
      if (sortField === 'calls') {
        valA = a.stats.callsRaw;
        valB = b.stats.callsRaw;
      } else if (sortField === 'output') {
        valA = a.stats.outputRaw;
        valB = b.stats.outputRaw;
      } else if (sortField === 'clusterLoad') {
        valA = a.clusterLoad;
        valB = b.clusterLoad;
      } else if (sortField === 'sla') {
        valA = a.sla;
        valB = b.sla;
      } else if (sortField === 'latencyMs') {
        valA = a.latencyMs;
        valB = b.latencyMs;
      } else if (sortField === 'p99LatencyMs') {
        valA = a.p99LatencyMs;
        valB = b.p99LatencyMs;
      } else if (sortField === 'successRate') {
        valA = a.successRate;
        valB = b.successRate;
      } else {
        valA = a[sortField];
        valB = b[sortField];
      }

      if (typeof valA === 'string') valA = valA.toLowerCase();
      if (typeof valB === 'string') valB = valB.toLowerCase();
      if (valA < valB) return sortOrder === 'asc' ? -1 : 1;
      if (valA > valB) return sortOrder === 'asc' ? 1 : -1;
      return 0;
    });

    return result;
  }, [modelsWithStats, selectedCategory, searchQuery, sortField, sortOrder]);

  const toggleSort = (field) => {
    if (sortField === field) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortOrder('desc');
    }
  };

  const getModelUrl = (modelId) => {
    return isChinese ? `/zh/models/${modelId}` : `/models/${modelId}`;
  };

  const getStudioUrl = (modelId, category) => {
    const root = isChinese ? '/zh/studio' : '/studio';
    const targetTab = inferStudioTabFromModel(modelId, category || 'image');
    return `${root}?tab=${targetTab}&model=${encodeURIComponent(modelId)}`;
  };

  // 获取当前生效的动态表头名称
  const currentHeaderInfo = useMemo(() => {
    const sampleStats = getModelTimeframeStats(allModels[0] || {}, selectedTimeframe, liveTick);
    return {
      callsHeaderZh: sampleStats.callsHeaderZh,
      callsHeaderEn: sampleStats.callsHeaderEn,
      outputHeaderZh: sampleStats.outputHeaderZh,
      outputHeaderEn: sampleStats.outputHeaderEn,
      isRealtime: sampleStats.isRealtime,
    };
  }, [allModels, selectedTimeframe, liveTick]);

  return (
    <div className="w-full">
      {/* 顶部过滤控制条 */}
      <div className="flex flex-col gap-4 mb-6">
        {/* 一级控制：分类胶囊 (严格遵循 UI_REPAIR_INSTRUCTION 单一 rounded-full) */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-1.5 overflow-x-auto scrollbar-none pb-1">
            {MODEL_CATEGORIES.map((cat) => {
              const isActive = selectedCategory === cat.id;
              return (
                <button
                  key={cat.id}
                  onClick={() => setSelectedCategory(cat.id)}
                  className={`px-3.5 py-1.5 rounded-full text-xs font-semibold tracking-wide transition-all duration-200 cursor-pointer whitespace-nowrap ${
                    isActive
                      ? 'bg-white text-black shadow-[0_2px_12px_rgba(255,255,255,0.25)]'
                      : 'bg-white/[0.04] hover:bg-white/[0.08] text-white/70 hover:text-white border border-white/[0.06]'
                  }`}
                >
                  {isChinese ? cat.labelZh : cat.label}
                </button>
              );
            })}
          </div>

          {/* 搜索框 */}
          <div className="relative w-full sm:w-64">
            <Search className="w-3.5 h-3.5 text-white/40 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={isChinese ? '搜索模型、架构或厂商...' : 'Search model, provider...'}
              className="w-full bg-[#12141c] border border-white/[0.1] focus:border-white/30 rounded-full pl-9 pr-4 py-1.5 text-xs text-white placeholder-white/40 outline-none transition-all shadow-inner"
            />
          </div>
        </div>

        {/* 二级控制：多时间维度 + 多指标视角切换群 */}
        <div className="flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-white/[0.06]">
          {/* 左侧：统计时间维度 (实时 / 时调用量 / 日调用量 / 周月 / 月调用量) */}
          <div className="flex items-center gap-1 text-xs">
            <span className="text-white/40 mr-1.5 font-mono text-[11px] uppercase tracking-wider flex items-center gap-1">
              <Clock className="w-3 h-3 text-white/40" />
              {isChinese ? '时间维度:' : 'Timeframe:'}
            </span>
            {TIMEFRAMES.map((tf) => {
              const isActive = selectedTimeframe === tf.id;
              return (
                <button
                  key={tf.id}
                  onClick={() => setSelectedTimeframe(tf.id)}
                  className={`px-2.5 py-1 rounded-full text-[11px] font-mono transition-all duration-200 cursor-pointer ${
                    isActive
                      ? 'bg-[#3772FF] text-white font-bold shadow-elevation-1'
                      : 'text-white/50 hover:text-white hover:bg-white/[0.04]'
                  }`}
                >
                  {isChinese ? tf.labelZh : tf.label}
                </button>
              );
            })}
          </div>

          {/* 中间：多维度数据视角切换 (全景概览 / 算力性能 / 产出交付) */}
          <div className="flex items-center gap-1 bg-[#12141c] p-1 rounded-full border border-white/[0.08]">
            {VIEW_PERSPECTIVES.map((vp) => {
              const Icon = vp.icon;
              const isActive = activeView === vp.id;
              return (
                <button
                  key={vp.id}
                  onClick={() => setActiveView(vp.id)}
                  className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-semibold transition-all duration-200 cursor-pointer ${
                    isActive
                      ? 'bg-white text-black font-bold shadow-sm'
                      : 'text-white/60 hover:text-white'
                  }`}
                >
                  <Icon className="w-3 h-3" />
                  <span>{isChinese ? vp.labelZh : vp.label}</span>
                </button>
              );
            })}
          </div>

          {/* 右侧：实时数据流状态微标 */}
          <div className="text-[11px] font-mono text-white/40 flex items-center gap-3">
            <span>
              {isChinese ? '展示模型数:' : 'Showing:'}{' '}
              <strong className="text-white font-bold">{filteredModels.length}</strong>
            </span>
            <span className="w-1 h-1 rounded-full bg-white/20" />
            {currentHeaderInfo.isRealtime ? (
              <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/25 text-emerald-400 font-mono text-[10px]">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                <span>{isChinese ? '流式实时遥测 (2.5s同步)' : 'Live Telemetry (2.5s sync)'}</span>
              </span>
            ) : (
              <span className="text-emerald-400 flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                {isChinese ? '节点自愈同步中' : 'Cluster Live'}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* 核心高保真量化指标表格 */}
      <div className="bg-[#0f1117] border border-white/[0.08] rounded-2xl overflow-hidden shadow-elevation-2">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-white/[0.08] bg-[#141620]/60 text-white/45 text-[11px] font-semibold uppercase tracking-wider select-none">
                <th className="py-3.5 px-4 font-mono w-12 text-center">#</th>
                <th
                  className="py-3.5 px-4 cursor-pointer hover:text-white transition-colors"
                  onClick={() => toggleSort('name')}
                >
                  <div className="flex items-center gap-1">
                    <span>{isChinese ? '模型 / 架构' : 'Model / Architecture'}</span>
                    <ArrowUpDown className="w-3 h-3 opacity-40" />
                  </div>
                </th>
                <th className="py-3.5 px-4">{isChinese ? '类型' : 'Type'}</th>

                {/* 视图 01: 全景概览列群 */}
                {activeView === 'overview' && (
                  <>
                    <th
                      className="py-3.5 px-4 cursor-pointer hover:text-white transition-colors"
                      onClick={() => toggleSort('clusterLoad')}
                    >
                      <div className="flex items-center gap-1">
                        <span>{isChinese ? '实时集群状态' : 'Cluster Status'}</span>
                        <ArrowUpDown className="w-3 h-3 opacity-40" />
                      </div>
                    </th>
                    <th className="py-3.5 px-4">{isChinese ? '费率标准' : 'Rate'}</th>
                    <th
                      className="py-3.5 px-4 cursor-pointer hover:text-white transition-colors"
                      onClick={() => toggleSort('calls')}
                    >
                      <div className="flex items-center gap-1">
                        <span>
                          {isChinese
                            ? currentHeaderInfo.callsHeaderZh
                            : currentHeaderInfo.callsHeaderEn}
                        </span>
                        <ArrowUpDown className="w-3 h-3 opacity-40" />
                      </div>
                    </th>
                    <th
                      className="py-3.5 px-4 cursor-pointer hover:text-white transition-colors"
                      onClick={() => toggleSort('output')}
                    >
                      <div className="flex items-center gap-1">
                        <span>
                          {isChinese
                            ? currentHeaderInfo.outputHeaderZh
                            : currentHeaderInfo.outputHeaderEn}
                        </span>
                        <ArrowUpDown className="w-3 h-3 opacity-40" />
                      </div>
                    </th>
                    <th
                      className="py-3.5 px-4 cursor-pointer hover:text-white transition-colors"
                      onClick={() => toggleSort('latencyMs')}
                    >
                      <div className="flex items-center gap-1">
                        <span>{isChinese ? '端到端响应耗时' : 'Latency Breakdown'}</span>
                        <ArrowUpDown className="w-3 h-3 opacity-40" />
                      </div>
                    </th>
                    <th className="py-3.5 px-4 w-32">
                      {isChinese ? '调用走势 (Sparkline)' : 'Trend'}
                    </th>
                  </>
                )}

                {/* 视图 02: 算力负载与性能列群 */}
                {activeView === 'performance' && (
                  <>
                    <th
                      className="py-3.5 px-4 cursor-pointer hover:text-white transition-colors"
                      onClick={() => toggleSort('calls')}
                    >
                      <div className="flex items-center gap-1">
                        <span>{isChinese ? '峰值并发 / 请求率' : 'Peak Concurrency / RPS'}</span>
                        <ArrowUpDown className="w-3 h-3 opacity-40" />
                      </div>
                    </th>
                    <th
                      className="py-3.5 px-4 cursor-pointer hover:text-white transition-colors"
                      onClick={() => toggleSort('clusterLoad')}
                    >
                      <div className="flex items-center gap-1">
                        <span>{isChinese ? '集群节点负载率' : 'Cluster Load %'}</span>
                        <ArrowUpDown className="w-3 h-3 opacity-40" />
                      </div>
                    </th>
                    <th
                      className="py-3.5 px-4 cursor-pointer hover:text-white transition-colors"
                      onClick={() => toggleSort('p99LatencyMs')}
                    >
                      <div className="flex items-center gap-1">
                        <span>{isChinese ? 'P99 尾部延迟' : 'P99 Latency'}</span>
                        <ArrowUpDown className="w-3 h-3 opacity-40" />
                      </div>
                    </th>
                    <th className="py-3.5 px-4">{isChinese ? '端到端耗时拆解' : 'Duration Detail'}</th>
                    <th className="py-3.5 px-4">{isChinese ? '网络抖动与丢包' : 'Jitter & Loss'}</th>
                    <th
                      className="py-3.5 px-4 cursor-pointer hover:text-white transition-colors"
                      onClick={() => toggleSort('sla')}
                    >
                      <div className="flex items-center gap-1">
                        <span>{isChinese ? 'SLA 可用率' : 'SLA Target'}</span>
                        <ArrowUpDown className="w-3 h-3 opacity-40" />
                      </div>
                    </th>
                  </>
                )}

                {/* 视图 03: 产出与交付列群 */}
                {activeView === 'throughput' && (
                  <>
                    <th
                      className="py-3.5 px-4 cursor-pointer hover:text-white transition-colors"
                      onClick={() => toggleSort('output')}
                    >
                      <div className="flex items-center gap-1">
                        <span>{isChinese ? '实时产出速率' : 'Live Output Rate'}</span>
                        <ArrowUpDown className="w-3 h-3 opacity-40" />
                      </div>
                    </th>
                    <th className="py-3.5 px-4">{isChinese ? '活跃生成任务' : 'Active Tasks'}</th>
                    <th className="py-3.5 px-4">{isChinese ? '高规格产出占比' : 'Hi-Res Ratio'}</th>
                    <th
                      className="py-3.5 px-4 cursor-pointer hover:text-white transition-colors"
                      onClick={() => toggleSort('successRate')}
                    >
                      <div className="flex items-center gap-1">
                        <span>{isChinese ? '任务成功率' : 'Success Rate'}</span>
                        <ArrowUpDown className="w-3 h-3 opacity-40" />
                      </div>
                    </th>
                    <th className="py-3.5 px-4">
                      {isChinese
                        ? currentHeaderInfo.outputHeaderZh
                        : currentHeaderInfo.outputHeaderEn}
                    </th>
                    <th className="py-3.5 px-4 w-32">
                      {isChinese ? '产出走势 (Sparkline)' : 'Trend'}
                    </th>
                  </>
                )}

                <th className="py-3.5 px-4 text-right">{isChinese ? '操作' : 'Action'}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/[0.04]">
              {filteredModels.map((row, idx) => {
                const s = row.stats;
                const statusColor =
                  row.statusLevel === 'optimal'
                    ? 'bg-emerald-400 text-emerald-400'
                    : row.statusLevel === 'busy'
                    ? 'bg-amber-400 text-amber-400'
                    : 'bg-rose-400 text-rose-400';

                return (
                  <tr
                    key={row.id}
                    className="hover:bg-white/[0.03] transition-colors group cursor-default"
                  >
                    {/* 排名 */}
                    <td className="py-3.5 px-4 font-mono text-white/40 text-center font-bold">
                      {idx + 1}
                    </td>

                    {/* 模型名称、代号与厂商 */}
                    <td className="py-3.5 px-4">
                      <Link
                        href={getModelUrl(row.id)}
                        className="flex items-center gap-3 group/link"
                      >
                        <ModelBrandLogo
                          providerId={row.providerId}
                          provider={row.provider}
                          modelId={row.id}
                          size="md"
                        />
                        <div>
                          <div className="font-bold text-white group-hover/link:text-[#00f5d4] transition-colors flex items-center gap-1.5">
                            <span>{row.name}</span>
                            <ChevronRight className="w-3 h-3 opacity-0 group-hover/link:opacity-100 group-hover/link:translate-x-0.5 transition-all text-[#00f5d4]" />
                          </div>
                          <div className="text-[11px] font-mono text-white/40 flex items-center gap-1.5">
                            <span>{row.symbol}</span>
                            <span className="text-white/20">·</span>
                            <span className="text-white/50">{row.provider}</span>
                          </div>
                        </div>
                      </Link>
                    </td>

                    {/* 分类类型 Pill */}
                    <td className="py-3.5 px-4">
                      <span className="px-2 py-0.5 rounded-full bg-white/[0.05] border border-white/10 text-[11px] font-medium text-white/80 whitespace-nowrap">
                        {isChinese ? row.categoryLabelZh : row.type}
                      </span>
                    </td>

                    {/* ========================================================= */}
                    {/* 视图 01: 全景概览单元格                                    */}
                    {/* ========================================================= */}
                    {activeView === 'overview' && (
                      <>
                        {/* 实时集群状态 (差异化量化状态 + 真实节点负载 + 排队) */}
                        <td className="py-3.5 px-4">
                          <div className="flex items-start gap-2">
                            <span
                              className={`w-2 h-2 rounded-full mt-1 shrink-0 animate-pulse ${
                                row.statusLevel === 'optimal'
                                  ? 'bg-emerald-400'
                                  : row.statusLevel === 'busy'
                                  ? 'bg-amber-400'
                                  : 'bg-rose-400'
                              }`}
                            />
                            <div className="font-mono leading-tight">
                              <div className="flex items-center gap-1.5">
                                <span className="text-white/95 font-semibold text-xs">
                                  {row.sla}%
                                </span>
                                <span
                                  className={`text-[10px] font-medium px-1.5 py-0.2 rounded-full border ${
                                    row.statusLevel === 'optimal'
                                      ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/25'
                                      : row.statusLevel === 'busy'
                                      ? 'bg-amber-500/10 text-amber-400 border-amber-500/25'
                                      : 'bg-rose-500/10 text-rose-400 border-rose-500/25'
                                  }`}
                                >
                                  {isChinese ? row.statusZh : row.statusLevel}
                                </span>
                              </div>
                              <span className="text-[10px] text-white/40 block mt-0.5 whitespace-nowrap">
                                {isChinese ? row.statusSubZh : `Load ${row.clusterLoad}%`}
                              </span>
                            </div>
                          </div>
                        </td>

                        {/* 费率标准 */}
                        <td className="py-3.5 px-4 font-mono text-white/85 whitespace-nowrap">
                          {isChinese ? row.priceRate : row.priceRateEn}
                        </td>

                        {/* 调用量 (实时状态显示 RPS 与并发，周期状态显示调用量及涨跌幅) */}
                        <td className="py-3.5 px-4">
                          <div className="font-mono">
                            <div className="font-bold text-white flex items-baseline gap-1">
                              <span>{s.callsPrimary}</span>
                              <span className="text-white/40 text-[10px] font-normal">
                                {isChinese ? s.callsUnit : s.callsUnitEn}
                              </span>
                            </div>
                            {s.isRealtime ? (
                              <div className="text-[10px] text-[#00f5d4] flex items-center gap-1 mt-0.5">
                                <Activity className="w-2.5 h-2.5" />
                                <span>{s.callsSub}</span>
                              </div>
                            ) : (
                              <span
                                className={`text-[10px] font-semibold px-1.5 py-0.2 rounded-full border inline-flex items-center gap-0.5 mt-0.5 ${
                                  s.isCallsPositive
                                    ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30'
                                    : 'bg-rose-500/15 text-rose-400 border-rose-500/30'
                                }`}
                              >
                                {s.isCallsPositive ? (
                                  <TrendingUp className="w-2.5 h-2.5" />
                                ) : (
                                  <TrendingDown className="w-2.5 h-2.5" />
                                )}
                                {s.callsDelta}
                              </span>
                            )}
                          </div>
                        </td>

                        {/* 模态产出量 (专属模态单位：张/段/首/Tokens，实时状态显示当前速率与生成中任务) */}
                        <td className="py-3.5 px-4">
                          <div className="font-mono">
                            <div className="font-bold text-white flex items-baseline gap-1">
                              <span>{s.outputPrimary}</span>
                              {!s.isRealtime && (
                                <span className="text-white/40 text-[10px] font-normal">
                                  {isChinese ? s.outputUnit : row.outputUnitEn}
                                </span>
                              )}
                            </div>
                            <span className="text-[10px] text-white/50 block mt-0.5 whitespace-nowrap">
                              {isChinese ? s.outputSub : s.outputSubEn}
                            </span>
                          </div>
                        </td>

                        {/* 平均响应延迟 (含端到端真实耗时细分，而非千篇一律的TTFT) */}
                        <td className="py-3.5 px-4 font-mono">
                          <span className="text-white/90 font-semibold">{row.latencyMs} ms</span>
                          <span className="text-[10px] text-white/40 block mt-0.5 whitespace-nowrap">
                            {isChinese ? row.latencyBreakdownZh : row.latencyBreakdownEn}
                          </span>
                        </td>

                        {/* 走势 Sparkline */}
                        <td className="py-3.5 px-4">
                          <SparklineChart
                            data={row.sparkline}
                            width={110}
                            height={28}
                            isPositive={row.isPositive}
                          />
                        </td>
                      </>
                    )}

                    {/* ========================================================= */}
                    {/* 视图 02: 算力负载与性能单元格                              */}
                    {/* ========================================================= */}
                    {activeView === 'performance' && (
                      <>
                        {/* 峰值并发 / 请求率 */}
                        <td className="py-3.5 px-4 font-mono">
                          <span className="text-white font-bold">{row.peakConcurrency}</span>
                          <span className="text-[10px] text-[#00f5d4] block mt-0.5">
                            {row.liveRps} req/s
                          </span>
                        </td>

                        {/* 集群节点负载率 (彩色微型进度条) */}
                        <td className="py-3.5 px-4 font-mono">
                          <div className="flex items-center gap-2">
                            <span className="text-white font-semibold">{row.clusterLoad}%</span>
                            <div className="w-16 h-1.5 rounded-full bg-white/10 overflow-hidden shrink-0">
                              <div
                                className={`h-full rounded-full transition-all duration-500 ${
                                  row.clusterLoad > 80
                                    ? 'bg-rose-400'
                                    : row.clusterLoad > 60
                                    ? 'bg-amber-400'
                                    : 'bg-emerald-400'
                                }`}
                                style={{ width: `${row.clusterLoad}%` }}
                              />
                            </div>
                          </div>
                          <span className="text-[10px] text-white/40 block mt-0.5">
                            {isChinese ? row.queueWait : 'Queue depth: optimal'}
                          </span>
                        </td>

                        {/* P99 尾部延迟 */}
                        <td className="py-3.5 px-4 font-mono">
                          <span className="text-white font-bold">{row.p99LatencyMs} ms</span>
                          <span className="text-[10px] text-white/40 block mt-0.5">
                            P50: {row.latencyMs} ms
                          </span>
                        </td>

                        {/* 端到端耗时拆解 */}
                        <td className="py-3.5 px-4 font-mono text-[11px] text-white/80 whitespace-nowrap">
                          {isChinese ? row.latencyBreakdownZh : row.latencyBreakdownEn}
                        </td>

                        {/* 网络抖动与丢包率 */}
                        <td className="py-3.5 px-4 font-mono">
                          <span className="text-white/80">{row.packetLoss}</span>
                          <span className="text-[10px] text-emerald-400 block mt-0.5">
                            {isChinese ? `自愈: <${row.failoverMs}ms` : `Failover <${row.failoverMs}ms`}
                          </span>
                        </td>

                        {/* SLA 可用率 */}
                        <td className="py-3.5 px-4 font-mono">
                          <div className="flex items-center gap-1.5 text-emerald-400 font-semibold">
                            <CheckCircle2 className="w-3.5 h-3.5" />
                            <span>{row.sla}%</span>
                          </div>
                          <span className="text-[10px] text-white/40 block mt-0.5">
                            {isChinese ? 'SLA 工业级承诺' : 'Standard SLA'}
                          </span>
                        </td>
                      </>
                    )}

                    {/* ========================================================= */}
                    {/* 视图 03: 产出与交付单元格                                  */}
                    {/* ========================================================= */}
                    {activeView === 'throughput' && (
                      <>
                        {/* 实时产出速率 */}
                        <td className="py-3.5 px-4 font-mono">
                          <span className="text-white font-bold text-sm text-[#00f5d4]">
                            {row.liveOutputRate}
                          </span>
                          <span className="text-[10px] text-white/40 block mt-0.5">
                            {isChinese ? `模态: ${row.categoryLabelZh}` : row.type}
                          </span>
                        </td>

                        {/* 活跃生成任务 */}
                        <td className="py-3.5 px-4 font-mono">
                          <div className="text-white font-semibold flex items-center gap-1">
                            <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-pulse" />
                            <span>
                              {row.activeTasks} {row.outputUnit}
                            </span>
                          </div>
                          <span className="text-[10px] text-white/40 block mt-0.5">
                            {isChinese ? '正在节点渲染中' : 'In pipeline'}
                          </span>
                        </td>

                        {/* 高规格产出占比 */}
                        <td className="py-3.5 px-4 font-mono">
                          <span className="text-white/90 font-medium">
                            {isChinese ? row.qualityRatioZh : row.qualityRatioEn}
                          </span>
                          <span className="text-[10px] text-white/40 block mt-0.5">
                            {isChinese ? '原生画质基准' : 'Production grade'}
                          </span>
                        </td>

                        {/* 任务成功率 */}
                        <td className="py-3.5 px-4 font-mono">
                          <span className="text-emerald-400 font-bold">{row.successRate}%</span>
                          <span className="text-[10px] text-white/40 block mt-0.5">
                            {isChinese ? '故障自动剔除' : 'Fail-safe active'}
                          </span>
                        </td>

                        {/* 周期交付总量 */}
                        <td className="py-3.5 px-4 font-mono">
                          <span className="text-white font-bold">
                            {s.outputPrimary} {s.outputUnit}
                          </span>
                          <span
                            className={`text-[10px] font-semibold px-1.5 py-0.2 rounded-full border inline-flex items-center gap-0.5 ml-1.5 ${
                              s.isOutputPositive
                                ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30'
                                : 'bg-rose-500/15 text-rose-400 border-rose-500/30'
                            }`}
                          >
                            {s.outputDelta}
                          </span>
                        </td>

                        {/* 走势 Sparkline */}
                        <td className="py-3.5 px-4">
                          <SparklineChart
                            data={row.sparkline}
                            width={110}
                            height={28}
                            isPositive={row.isPositive}
                          />
                        </td>
                      </>
                    )}

                    {/* 操作按钮组 */}
                    <td className="py-3.5 px-4 text-right whitespace-nowrap">
                      <div className="flex items-center justify-end gap-2">
                        <Link
                          href={getModelUrl(row.id)}
                          className="px-3 py-1.5 rounded-full bg-white/[0.08] hover:bg-white text-white hover:text-black text-xs font-semibold tracking-wide transition-all duration-200 inline-flex items-center gap-1 shadow-elevation-1 cursor-pointer"
                        >
                          <span>{isChinese ? '模型专题' : 'Detail'}</span>
                          <ArrowRight className="w-3 h-3" />
                        </Link>

                        <Link
                          href={getStudioUrl(row.id, row.category)}
                          className="px-2.5 py-1.5 rounded-full bg-[#3772FF]/20 hover:bg-[#3772FF] text-[#60a5fa] hover:text-white text-xs font-semibold tracking-wide transition-all duration-200 inline-flex items-center gap-1 border border-[#3772FF]/40 cursor-pointer"
                          title={isChinese ? '在 Studio 工作台立即体验' : 'Try in Studio'}
                        >
                          <Zap className="w-3 h-3" />
                          <span className="hidden sm:inline">{isChinese ? '体验' : 'Try'}</span>
                        </Link>
                      </div>
                    </td>
                  </tr>
                );
              })}

              {filteredModels.length === 0 && (
                <tr>
                  <td colSpan={10} className="py-16 text-center text-white/40">
                    <div className="flex flex-col items-center justify-center gap-2">
                      <Search className="w-8 h-8 text-white/20" />
                      <span>{isChinese ? '未检索到匹配的 AI 大模型' : 'No matching models found.'}</span>
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
