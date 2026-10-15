'use client';

import React, { useState, useMemo, useRef, useEffect } from 'react';
import {
  Activity,
  Layers,
  Clock,
  Zap,
  TrendingUp,
  Maximize2,
  RefreshCw,
  BarChart2,
  Sliders,
} from 'lucide-react';
import {
  getModelTimeSeries,
  TIMEFRAMES,
  METRIC_TYPES,
} from '@/lib/modelCenter/modelScreenerData';

/**
 * 丝滑三次贝塞尔平滑路径生成
 */
function buildSplinePath(points) {
  if (!points || points.length === 0) return '';
  if (points.length === 1) return `M ${points[0].x} ${points[0].y}`;

  let d = `M ${points[0].x.toFixed(1)} ${points[0].y.toFixed(1)}`;
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = i > 0 ? points[i - 1] : points[i];
    const p1 = points[i];
    const p2 = points[i + 1];
    const p3 = i < points.length - 2 ? points[i + 2] : p2;

    const cp1x = p1.x + (p2.x - p0.x) / 6;
    const cp1y = p1.y + (p2.y - p0.y) / 6;
    const cp2x = p2.x - (p3.x - p1.x) / 6;
    const cp2y = p2.y - (p3.y - p1.y) / 6;

    d += ` C ${cp1x.toFixed(1)} ${cp1y.toFixed(1)}, ${cp2x.toFixed(1)} ${cp2y.toFixed(1)}, ${p2.x.toFixed(1)} ${p2.y.toFixed(1)}`;
  }
  return d;
}

export default function ModelInteractiveChart({
  modelId = 'flux-dev',
  locale = 'zh-CN',
  initialTimeframe = '24h',
  initialMetric = 'invocations',
  height = 420,
}) {
  const isChinese = Boolean(locale?.includes('zh'));
  const containerRef = useRef(null);

  const [timeframe, setTimeframe] = useState(initialTimeframe);
  const [metric, setMetric] = useState(initialMetric);
  const [hoverIndex, setHoverIndex] = useState(null);
  const [showVolume, setShowVolume] = useState(true);
  const [showArea, setShowArea] = useState(true);
  const [livePulseTick, setLivePulseTick] = useState(0);
  const [containerWidth, setContainerWidth] = useState(800);

  // 监听容器宽度自适应
  useEffect(() => {
    if (!containerRef.current) return;
    const updateWidth = () => {
      if (containerRef.current) {
        setContainerWidth(containerRef.current.clientWidth || 800);
      }
    };
    updateWidth();
    const observer = new ResizeObserver(updateWidth);
    observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, []);

  // 实时心跳微动模拟（TradingView 丝滑动态感）
  useEffect(() => {
    const timer = setInterval(() => {
      setLivePulseTick((prev) => prev + 1);
    }, 4000);
    return () => clearInterval(timer);
  }, []);

  // 获取时间序列数据
  const seriesData = useMemo(() => {
    return getModelTimeSeries(modelId, timeframe, metric);
  }, [modelId, timeframe, metric, livePulseTick]);

  const activeMetricConfig = useMemo(() => {
    return METRIC_TYPES.find((m) => m.id === metric) || METRIC_TYPES[0];
  }, [metric]);

  // 布局尺寸配置
  const padding = { top: 24, right: 64, bottom: showVolume ? 75 : 32, left: 16 };
  const chartWidth = Math.max(300, containerWidth - padding.left - padding.right);
  const totalChartHeight = height - padding.top - padding.bottom;
  const lineChartHeight = showVolume ? totalChartHeight * 0.76 : totalChartHeight;
  const volumeChartHeight = showVolume ? totalChartHeight * 0.20 : 0;
  const volumeGap = 12;

  // 极值与换算计算
  const { minVal, maxVal, points, splinePath, areaPath, volumePoints, yTicks } = useMemo(() => {
    if (!seriesData || seriesData.length === 0) {
      return { minVal: 0, maxVal: 1, points: [], splinePath: '', areaPath: '', volumePoints: [], yTicks: [] };
    }

    const values = seriesData.map((d) => d.value);
    const minRaw = Math.min(...values);
    const maxRaw = Math.max(...values);
    const delta = maxRaw - minRaw || (maxRaw > 0 ? maxRaw * 0.1 : 1);

    // 上下留白 8% 缓冲
    const minPadded = metric === 'sla' ? Math.max(99.5, minRaw - delta * 0.2) : Math.max(0, minRaw - delta * 0.08);
    const maxPadded = metric === 'sla' ? Math.min(100, maxRaw + delta * 0.2) : maxRaw + delta * 0.08;
    const valueRange = maxPadded - minPadded || 1;

    // 折线坐标映射
    const computedPoints = seriesData.map((d, i) => {
      const x = padding.left + (i / (seriesData.length - 1 || 1)) * chartWidth;
      const normalizedY = (d.value - minPadded) / valueRange;
      const y = padding.top + lineChartHeight - normalizedY * lineChartHeight;
      return { x, y, data: d, index: i };
    });

    const spline = buildSplinePath(computedPoints);
    const area = computedPoints.length > 0
      ? `${spline} L ${computedPoints[computedPoints.length - 1].x.toFixed(1)} ${padding.top + lineChartHeight} L ${computedPoints[0].x.toFixed(1)} ${padding.top + lineChartHeight} Z`
      : '';

    // 量能柱状图计算
    const maxVol = Math.max(...seriesData.map((d) => d.volume), 1);
    const volBaseY = padding.top + totalChartHeight;
    const computedVolumePoints = seriesData.map((d, i) => {
      const x = padding.left + (i / (seriesData.length - 1 || 1)) * chartWidth;
      const h = (d.volume / maxVol) * volumeChartHeight;
      const y = volBaseY - h;
      const barWidth = Math.max(2, (chartWidth / seriesData.length) * 0.65);
      return { x, y, h, barWidth, isUp: d.isUp, volume: d.volume, index: i };
    });

    // Y 轴 4 档刻度线
    const ticksCount = 4;
    const ticks = [];
    for (let i = 0; i < ticksCount; i++) {
      const val = minPadded + (i / (ticksCount - 1)) * valueRange;
      const y = padding.top + lineChartHeight - (i / (ticksCount - 1)) * lineChartHeight;
      ticks.push({ val, y });
    }

    return {
      minVal: minPadded,
      maxVal: maxPadded,
      points: computedPoints,
      splinePath: spline,
      areaPath: area,
      volumePoints: computedVolumePoints,
      yTicks: ticks,
    };
  }, [seriesData, chartWidth, lineChartHeight, totalChartHeight, volumeChartHeight, metric, padding.left, padding.top, showVolume]);

  const activeIndex = hoverIndex !== null && hoverIndex >= 0 && hoverIndex < points.length
    ? hoverIndex
    : points.length - 1;
  const currentPoint = points[activeIndex] || null;

  // 格式化 Y 轴数值标签
  const formatYValue = (val) => {
    if (metric === 'sla') return `${val.toFixed(2)}%`;
    if (metric === 'latency') return `${Math.round(val)}ms`;
    if (val >= 1000000) return `${(val / 1000000).toFixed(1)}M`;
    if (val >= 1000) return `${(val / 1000).toFixed(1)}K`;
    return Math.round(val).toString();
  };

  const strokeColor = activeMetricConfig.color;

  return (
    <div
      ref={containerRef}
      className="w-full bg-[#0d0e13] border border-white/[0.08] rounded-2xl p-5 sm:p-6 shadow-elevation-2 relative select-none"
    >
      {/* 顶部控制面板栏：指标切换与时间维度选择器 */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-5 border-b border-white/[0.06]">
        {/* 指标选择胶囊群 */}
        <div className="flex items-center gap-1.5 overflow-x-auto scrollbar-none pb-1 lg:pb-0">
          {METRIC_TYPES.map((m) => {
            const isActive = metric === m.id;
            return (
              <button
                key={m.id}
                onClick={() => setMetric(m.id)}
                className={`px-3 py-1.5 rounded-full text-xs font-semibold tracking-wide transition-all duration-200 cursor-pointer flex items-center gap-1.5 whitespace-nowrap ${
                  isActive
                    ? 'bg-white text-black shadow-[0_2px_12px_rgba(255,255,255,0.25)]'
                    : 'bg-white/[0.04] hover:bg-white/[0.08] text-white/70 hover:text-white border border-white/[0.06]'
                }`}
              >
                <span
                  className="w-2 h-2 rounded-full"
                  style={{ backgroundColor: m.color }}
                />
                <span>{isChinese ? m.labelZh : m.label}</span>
              </button>
            );
          })}
        </div>

        {/* 右侧：时间周期选择器 (1H / 24H / 7D / 30D / 1Y / ALL) */}
        <div className="flex items-center gap-1 bg-[#14161f] p-1 rounded-full border border-white/[0.08] self-start lg:self-auto">
          {TIMEFRAMES.map((tf) => {
            const isActive = timeframe === tf.id;
            return (
              <button
                key={tf.id}
                onClick={() => setTimeframe(tf.id)}
                className={`px-2.5 sm:px-3 py-1 rounded-full text-xs font-mono font-medium transition-all duration-200 cursor-pointer ${
                  isActive
                    ? 'bg-[#3772FF] text-white font-bold shadow-elevation-1'
                    : 'text-white/60 hover:text-white hover:bg-white/[0.04]'
                }`}
              >
                {tf.id.toUpperCase()}
              </button>
            );
          })}

          <div className="w-px h-4 bg-white/10 mx-1" />

          {/* 量能柱形图开关 */}
          <button
            onClick={() => setShowVolume((prev) => !prev)}
            title={isChinese ? '切换量能柱形图' : 'Toggle Volume Bars'}
            className={`p-1.5 rounded-full transition-colors ${
              showVolume ? 'text-[#00f5d4] bg-white/[0.06]' : 'text-white/30 hover:text-white/60'
            }`}
          >
            <BarChart2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* 实时数据看板 HUD 摘要 (TradingView Symbol Header) */}
      {currentPoint && (
        <div className="pt-4 pb-2 flex flex-wrap items-baseline gap-x-6 gap-y-2">
          <div className="flex items-baseline gap-2">
            <span className="text-3xl sm:text-4xl font-black text-white tracking-tight font-mono">
              {formatYValue(currentPoint.data.value)}
            </span>
            <span className="text-xs text-white/50 font-medium">
              {activeMetricConfig.unit}
            </span>
          </div>

          <div className="flex items-center gap-4 text-xs font-mono">
            <div className="flex items-center gap-1.5 text-white/60">
              <Clock className="w-3.5 h-3.5 text-white/40" />
              <span>{currentPoint.data.label}</span>
            </div>

            <div className="flex items-center gap-1.5 text-emerald-400">
              <Zap className="w-3.5 h-3.5" />
              <span>时延: {currentPoint.data.latency}ms</span>
            </div>

            <div className="hidden sm:flex items-center gap-1.5 text-blue-400">
              <Activity className="w-3.5 h-3.5" />
              <span>累计产出: {formatYValue(currentPoint.data.generations)}</span>
            </div>

            <div className="flex items-center gap-1.5 text-white/40">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
              <span>实时拨测就绪</span>
            </div>
          </div>
        </div>
      )}

      {/* 主 SVG 丝滑折线交互画布 */}
      <div
        className="relative w-full cursor-crosshair overflow-hidden mt-2"
        style={{ height }}
        onMouseMove={(e) => {
          const rect = e.currentTarget.getBoundingClientRect();
          const mouseX = e.clientX - rect.left - padding.left;
          const ratio = Math.max(0, Math.min(1, mouseX / chartWidth));
          const idx = Math.round(ratio * (points.length - 1));
          setHoverIndex(idx);
        }}
        onMouseLeave={() => setHoverIndex(null)}
      >
        <svg width="100%" height={height} className="overflow-visible">
          <defs>
            <linearGradient id="chart-area-grad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={strokeColor} stopOpacity={0.24} />
              <stop offset="70%" stopColor={strokeColor} stopOpacity={0.04} />
              <stop offset="100%" stopColor={strokeColor} stopOpacity={0.0} />
            </linearGradient>

            <filter id="line-glow" x="-20%" y="-20%" width="140%" height="140%">
              <feGaussianBlur stdDeviation="2" result="blur" />
              <feComposite in="SourceGraphic" in2="blur" operator="over" />
            </filter>
          </defs>

          {/* 水平网格线与右侧 Y 轴刻度 (TradingView Style) */}
          {yTicks.map((tick, idx) => (
            <g key={idx}>
              <line
                x1={padding.left}
                y1={tick.y}
                x2={padding.left + chartWidth}
                y2={tick.y}
                stroke="rgba(255, 255, 255, 0.05)"
                strokeDasharray="4 4"
                strokeWidth="1"
              />
              <text
                x={padding.left + chartWidth + 8}
                y={tick.y + 4}
                fill="rgba(255, 255, 255, 0.35)"
                fontSize="10"
                fontFamily="ui-monospace, monospace"
              >
                {formatYValue(tick.val)}
              </text>
            </g>
          ))}

          {/* 量能柱状图基准分隔线 */}
          {showVolume && (
            <line
              x1={padding.left}
              y1={padding.top + lineChartHeight + volumeGap}
              x2={padding.left + chartWidth}
              y2={padding.top + lineChartHeight + volumeGap}
              stroke="rgba(255, 255, 255, 0.08)"
              strokeWidth="1"
            />
          )}

          {/* 下方量能柱形图 (Volume Bars) */}
          {showVolume &&
            volumePoints.map((bar, idx) => {
              const isHovered = activeIndex === idx;
              const barColor = bar.isUp ? '#10b981' : '#f43f5e';
              return (
                <rect
                  key={idx}
                  x={bar.x - bar.barWidth / 2}
                  y={bar.y}
                  width={bar.barWidth}
                  height={bar.h}
                  fill={barColor}
                  opacity={isHovered ? 0.9 : 0.35}
                  rx="1.5"
                  className="transition-opacity duration-150"
                />
              );
            })}

          {/* 曲线下方光影渐变面积 */}
          {showArea && (
            <path
              d={areaPath}
              fill="url(#chart-area-grad)"
              className="transition-opacity duration-300"
            />
          )}

          {/* 核心贝塞尔平滑主折线 */}
          <path
            d={splinePath}
            fill="none"
            stroke={strokeColor}
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            filter="url(#line-glow)"
          />

          {/* 十字光标 (Crosshair Lines) */}
          {currentPoint && (
            <g className="pointer-events-none">
              {/* 垂直参考十字线 */}
              <line
                x1={currentPoint.x}
                y1={padding.top}
                x2={currentPoint.x}
                y2={padding.top + totalChartHeight}
                stroke="rgba(255, 255, 255, 0.25)"
                strokeDasharray="3 3"
                strokeWidth="1"
              />
              {/* 水平参考十字线 */}
              <line
                x1={padding.left}
                y1={currentPoint.y}
                x2={padding.left + chartWidth}
                y2={currentPoint.y}
                stroke="rgba(255, 255, 255, 0.25)"
                strokeDasharray="3 3"
                strokeWidth="1"
              />
              {/* 当前高亮核心发光微球 */}
              <circle
                cx={currentPoint.x}
                cy={currentPoint.y}
                r="6"
                fill={strokeColor}
                fillOpacity="0.25"
              />
              <circle
                cx={currentPoint.x}
                cy={currentPoint.y}
                r="3"
                fill="#ffffff"
                stroke={strokeColor}
                strokeWidth="2"
              />
            </g>
          )}

          {/* X 轴等距时间标签 */}
          {points.length > 0 &&
            [0, Math.floor(points.length / 4), Math.floor(points.length / 2), Math.floor((points.length * 3) / 4), points.length - 1].map(
              (idx) => {
                const pt = points[idx];
                if (!pt) return null;
                return (
                  <text
                    key={idx}
                    x={pt.x}
                    y={height - 6}
                    textAnchor="middle"
                    fill="rgba(255, 255, 255, 0.4)"
                    fontSize="10"
                    fontFamily="ui-monospace, monospace"
                  >
                    {pt.data.label}
                  </text>
                );
              }
            )}
        </svg>

        {/* 鼠标位置浮动详情 Tooltip Pill */}
        {currentPoint && (
          <div
            className="absolute pointer-events-none z-30 transition-transform duration-75"
            style={{
              left: Math.max(12, Math.min(containerWidth - 180, currentPoint.x - 70)),
              top: Math.max(10, currentPoint.y - 75),
            }}
          >
            <div className="bg-[#181a24]/95 backdrop-blur-md border border-white/20 rounded-xl px-3 py-2 shadow-elevation-3 text-left min-w-[140px]">
              <div className="text-[10px] font-mono text-white/50 flex items-center justify-between">
                <span>{currentPoint.data.label}</span>
                <span className="text-emerald-400 font-semibold">● 99.99%</span>
              </div>
              <div className="text-sm font-black text-white font-mono mt-0.5">
                {formatYValue(currentPoint.data.value)} {activeMetricConfig.unit}
              </div>
              <div className="text-[10px] text-white/70 font-mono mt-1 flex items-center justify-between pt-1 border-t border-white/[0.08]">
                <span>时延: {currentPoint.data.latency}ms</span>
                <span>量能: {currentPoint.data.volume}</span>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
