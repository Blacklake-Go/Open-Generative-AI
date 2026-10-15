'use client';

import React, { useEffect, useRef, useState, useMemo, useCallback } from 'react';
import {
  Activity,
  TrendingUp,
  Maximize2,
  Minimize2,
  RefreshCw,
  Sparkles,
  SlidersHorizontal,
  Zap,
} from 'lucide-react';
import {
  TIMEFRAMES,
  METRIC_TYPES,
  getModelTimeSeries,
} from '@/lib/modelCenter/modelScreenerData';

/**
 * TradingViewModelChart
 * 基于 60FPS HTML5 Canvas 架构打造的高保真 AI 模型时序图表。
 * 具备超平滑渲染、双序列（指标面积曲线 + 产出量柱状分布）、
 * 十字准星磁吸联动、动态 HUD 数据药丸与全周期自适应适配。
 */
export default function TradingViewModelChart({
  model,
  initialTimeframe = '24h',
  initialMetric = 'invocations',
  locale = 'zh-CN',
  height = 420,
}) {
  const isChinese = Boolean(locale?.includes('zh'));

  const containerRef = useRef(null);
  const chartInstanceRef = useRef(null);
  const areaSeriesRef = useRef(null);
  const volumeSeriesRef = useRef(null);

  const [timeframe, setTimeframe] = useState(initialTimeframe);
  const [metric, setMetric] = useState(initialMetric);
  const [chartType, setChartType] = useState('area'); // 'area' | 'line'
  const [isClient, setIsClient] = useState(false);

  // HUD 悬浮十字准星实时状态
  const [hoverData, setHoverData] = useState(null);

  useEffect(() => {
    setIsClient(true);
  }, []);

  // 当前指标元数据 (模态自适应单位)
  const currentMetricMeta = useMemo(() => {
    const base =
      METRIC_TYPES.find((m) => m.id === metric) || {
        id: 'invocations',
        label: 'Invocations',
        labelZh: '调用量',
        unit: '次',
        color: '#00f5d4',
      };
    if (metric === 'generations' && model?.outputUnit) {
      return {
        ...base,
        unit: isChinese ? model.outputUnit : model.outputUnitEn || model.outputUnit,
      };
    }
    return base;
  }, [metric, model, isChinese]);

  // 根据模型、周期与指标获取平滑时间序列
  const timeSeriesData = useMemo(() => {
    if (!model) return [];
    return getModelTimeSeries(model.id, timeframe, metric);
  }, [model, timeframe, metric]);

  // 最新与最旧数据（用于计算区间涨跌幅）
  const stats = useMemo(() => {
    if (!timeSeriesData || timeSeriesData.length === 0) {
      return { current: 0, delta: '+0.0%', isUp: true, peak: 0, trough: 0 };
    }
    const first = timeSeriesData[0]?.value || 0;
    const last = timeSeriesData[timeSeriesData.length - 1]?.value || 0;
    const diff = last - first;
    const pct = first > 0 ? (diff / first) * 100 : 0;
    const isUp = diff >= 0;
    const values = timeSeriesData.map((d) => d.value);
    const peak = Math.max(...values);
    const trough = Math.min(...values);

    return {
      current: last,
      delta: `${isUp ? '+' : ''}${pct.toFixed(2)}%`,
      isUp,
      peak,
      trough,
    };
  }, [timeSeriesData]);

  // 初始化或重建 TradingView 实例
  useEffect(() => {
    if (!isClient || !containerRef.current) return;

    let chart = null;
    let resizeObserver = null;
    let isDisposed = false;

    async function initChart() {
      const lc = await import('lightweight-charts');
      if (isDisposed || !containerRef.current) return;

      // 清除已有子节点
      containerRef.current.innerHTML = '';

      const { createChart, AreaSeries, LineSeries, HistogramSeries, CrosshairMode } = lc;

      // TradingView 核心暗色科技主题配置 (严格对齐 UI_DESIGN_SYSTEM)
      chart = createChart(containerRef.current, {
        width: containerRef.current.clientWidth,
        height: height,
        layout: {
          background: { type: 'solid', color: '#090a0f' },
          textColor: '#868b8f',
          fontSize: 11,
          fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
          attributionLogo: false,
        },
        grid: {
          vertLines: { color: 'rgba(255, 255, 255, 0.03)' },
          horzLines: { color: 'rgba(255, 255, 255, 0.03)' },
        },
        crosshair: {
          mode: CrosshairMode.Normal,
          vertLine: {
            color: 'rgba(255, 255, 255, 0.25)',
            width: 1,
            style: 3, // dashed
            labelBackgroundColor: '#1a1d26',
          },
          horzLine: {
            color: 'rgba(255, 255, 255, 0.25)',
            width: 1,
            style: 3,
            labelBackgroundColor: '#1a1d26',
          },
        },
        timeScale: {
          borderColor: 'rgba(255, 255, 255, 0.08)',
          timeVisible: true,
          secondsVisible: false,
          barSpacing: 16,
          minBarSpacing: 8,
        },
        rightPriceScale: {
          borderColor: 'rgba(255, 255, 255, 0.08)',
          scaleMargins: {
            top: 0.1,
            bottom: 0.28,
          },
        },
        handleScroll: {
          mouseWheel: true,
          pressedMouseMove: true,
        },
        handleScale: {
          axisPressedMouseMove: true,
          mouseWheel: true,
          pinch: true,
        },
      });

      chartInstanceRef.current = chart;

      // 主指标系列颜色配置
      const metricColor = currentMetricMeta.color || '#00f5d4';

      // 1. 创建主折线 / 面积序列
      let mainSeries;
      if (chartType === 'area') {
        mainSeries = chart.addSeries(AreaSeries, {
          lineColor: metricColor,
          topColor: `${metricColor}38`,
          bottomColor: `${metricColor}00`,
          lineWidth: 2,
          priceFormat: {
            type: metric === 'sla' ? 'percent' : 'volume',
            precision: metric === 'sla' ? 2 : 0,
          },
        });
      } else {
        mainSeries = chart.addSeries(LineSeries, {
          color: metricColor,
          lineWidth: 2,
          priceFormat: {
            type: metric === 'sla' ? 'percent' : 'volume',
            precision: metric === 'sla' ? 2 : 0,
          },
        });
      }
      areaSeriesRef.current = mainSeries;

      // 2. 创建底部量能柱形图序列 (沉在下部 25%)
      const volumeSeries = chart.addSeries(HistogramSeries, {
        priceScaleId: 'volume',
        priceFormat: {
          type: 'volume',
        },
      });
      volumeSeriesRef.current = volumeSeries;

      chart.priceScale('volume').applyOptions({
        scaleMargins: {
          top: 0.78,
          bottom: 0,
        },
      });

      // 填充格式化时序数据
      if (timeSeriesData && timeSeriesData.length > 0) {
        const primaryData = [];
        const volumeData = [];

        timeSeriesData.forEach((pt) => {
          // 确保严格升序 Unix 秒时间戳
          const unixSec = Math.floor(new Date(pt.timestamp).getTime() / 1000);
          primaryData.push({
            time: unixSec,
            value: pt.value,
          });

          volumeData.push({
            time: unixSec,
            value: pt.volume,
            color: pt.isUp ? 'rgba(0, 245, 212, 0.25)' : 'rgba(225, 29, 116, 0.25)',
          });
        });

        mainSeries.setData(primaryData);
        volumeSeries.setData(volumeData);
        chart.timeScale().fitContent();
      }

      // 3. 订阅十字准星移动事件更新 HUD
      chart.subscribeCrosshairMove((param) => {
        if (
          !param ||
          !param.time ||
          param.point === undefined ||
          param.point.x < 0 ||
          param.point.x > containerRef.current.clientWidth ||
          param.point.y < 0 ||
          param.point.y > height
        ) {
          setHoverData(null);
          return;
        }

        const currentVal = param.seriesData.get(mainSeries);
        const currentVol = param.seriesData.get(volumeSeries);

        if (currentVal && typeof currentVal.value === 'number') {
          const dateObj = new Date(param.time * 1000);
          setHoverData({
            timeStr: dateObj.toLocaleString(isChinese ? 'zh-CN' : 'en-US', {
              month: 'short',
              day: 'numeric',
              hour: '2-digit',
              minute: '2-digit',
            }),
            value: currentVal.value,
            volume: currentVol ? currentVol.value : null,
          });
        }
      });

      // 4. 监听容器宽度自适应
      resizeObserver = new ResizeObserver((entries) => {
        if (!entries || entries.length === 0 || !chartInstanceRef.current) return;
        const entry = entries[0];
        const newWidth = entry.contentRect.width;
        if (newWidth > 0) {
          chartInstanceRef.current.applyOptions({ width: newWidth });
        }
      });
      resizeObserver.observe(containerRef.current);
    }

    initChart();

    return () => {
      isDisposed = true;
      if (resizeObserver) resizeObserver.disconnect();
      if (chart) {
        chart.remove();
        chartInstanceRef.current = null;
      }
    };
  }, [isClient, timeSeriesData, metric, chartType, height, isChinese, currentMetricMeta]);

  // 重置视角至最适范围
  const handleResetZoom = useCallback(() => {
    if (chartInstanceRef.current) {
      chartInstanceRef.current.timeScale().fitContent();
    }
  }, []);

  return (
    <div className="w-full bg-[#0a0c12] border border-white/[0.08] rounded-2xl overflow-hidden shadow-elevation-3">
      {/* ========================================================= */}
      {/* 顶部控制栏 (TradingView 经典工具栏)                        */}
      {/* ========================================================= */}
      <div className="p-4 sm:p-5 border-b border-white/[0.06] flex flex-col xl:flex-row xl:items-center justify-between gap-4">
        {/* 左侧：实时行情数值指示器与状态徽章 */}
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/[0.05] border border-white/10">
            <span className="w-2 h-2 rounded-full bg-[#00f5d4] animate-pulse" />
            <span className="text-xs font-mono font-bold text-white tracking-wide">
              {model.symbol}
            </span>
            <span className="text-[10px] text-white/40 font-mono">
              {currentMetricMeta.label}
            </span>
          </div>

          {/* 实时/悬浮数值展示 HUD */}
          <div className="flex items-baseline gap-2 font-mono">
            <span className="text-2xl sm:text-3xl font-black text-white tracking-tight">
              {hoverData
                ? hoverData.value.toLocaleString()
                : stats.current.toLocaleString()}
            </span>
            <span className="text-xs text-white/50">{currentMetricMeta.unit}</span>

            {/* 动态区间浮动标签 */}
            <span
              className={`text-xs font-bold px-2 py-0.5 rounded-full border ${
                stats.isUp
                  ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30'
                  : 'bg-rose-500/15 text-rose-400 border-rose-500/30'
              }`}
            >
              {stats.delta}
            </span>
          </div>

          {/* 悬浮时间戳提示 */}
          {hoverData && (
            <span className="text-xs text-white/40 font-mono hidden sm:inline-block pl-2 border-l border-white/10">
              {hoverData.timeStr}
            </span>
          )}

          {/* 实时遥测状态徽章 */}
          <div className="hidden md:flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-[#161a24] border border-white/10 text-[10px] font-mono text-white/60">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
            <span>{isChinese ? '实时遥测' : 'Live Telemetry'}</span>
          </div>
        </div>

        {/* 右侧：多维度指标切换 + 时间周期胶囊群 */}
        <div className="flex flex-wrap items-center gap-3">
          {/* 指标切换胶囊 (遵循单一 rounded-full 规范) */}
          <div className="flex items-center gap-1 bg-[#12141c] p-1 rounded-full border border-white/[0.08] overflow-x-auto scrollbar-none">
            {METRIC_TYPES.map((m) => {
              const isActive = metric === m.id;
              return (
                <button
                  key={m.id}
                  onClick={() => setMetric(m.id)}
                  className={`px-3 py-1 rounded-full text-xs font-semibold transition-all cursor-pointer whitespace-nowrap ${
                    isActive
                      ? 'bg-white text-black shadow-sm'
                      : 'text-white/60 hover:text-white'
                  }`}
                >
                  {isChinese ? m.labelZh : m.label}
                </button>
              );
            })}
          </div>

          {/* 周期切换胶囊 */}
          <div className="flex items-center gap-1 bg-[#12141c] p-1 rounded-full border border-white/[0.08]">
            {TIMEFRAMES.map((tf) => {
              const isActive = timeframe === tf.id;
              return (
                <button
                  key={tf.id}
                  onClick={() => setTimeframe(tf.id)}
                  className={`px-2.5 py-1 rounded-full text-xs font-mono font-bold transition-all cursor-pointer ${
                    isActive
                      ? 'bg-[#3772FF] text-white shadow-sm'
                      : 'text-white/50 hover:text-white'
                  }`}
                >
                  {tf.id.toUpperCase()}
                </button>
              );
            })}
          </div>

          {/* 图表形态切换与适应视图 */}
          <div className="flex items-center gap-1">
            <button
              onClick={() => setChartType(chartType === 'area' ? 'line' : 'area')}
              title={isChinese ? '切换面积/纯折线' : 'Toggle Area/Line'}
              className="p-1.5 rounded-full bg-white/[0.06] hover:bg-white/10 text-white/70 hover:text-white border border-white/10 cursor-pointer transition-colors"
            >
              <Activity className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={handleResetZoom}
              title={isChinese ? '自适应缩放' : 'Fit Content'}
              className="p-1.5 rounded-full bg-white/[0.06] hover:bg-white/10 text-white/70 hover:text-white border border-white/10 cursor-pointer transition-colors"
            >
              <RefreshCw className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>

      {/* ========================================================= */}
      {/* TRADINGVIEW 核心 CANVAS 容器                              */}
      {/* ========================================================= */}
      <div className="relative w-full" style={{ height: `${height}px` }}>
        <div ref={containerRef} className="w-full h-full" />
      </div>
    </div>
  );
}
