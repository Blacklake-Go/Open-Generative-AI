'use client';

import React, { useMemo, useState } from 'react';

/**
 * 丝滑三次贝塞尔曲线生成算法 (Smooth Cubic Bézier Spline)
 * 将折线离散数据平滑为 TradingView 级别的无极曲线
 */
function getSplinePath(points) {
  if (!points || points.length === 0) return '';
  if (points.length === 1) return `M ${points[0].x} ${points[0].y}`;

  let d = `M ${points[0].x.toFixed(2)} ${points[0].y.toFixed(2)}`;

  for (let i = 0; i < points.length - 1; i++) {
    const p0 = i > 0 ? points[i - 1] : points[i];
    const p1 = points[i];
    const p2 = points[i + 1];
    const p3 = i < points.length - 2 ? points[i + 2] : p2;

    const cp1x = p1.x + (p2.x - p0.x) / 6;
    const cp1y = p1.y + (p2.y - p0.y) / 6;

    const cp2x = p2.x - (p3.x - p1.x) / 6;
    const cp2y = p2.y - (p3.y - p1.y) / 6;

    d += ` C ${cp1x.toFixed(2)} ${cp1y.toFixed(2)}, ${cp2x.toFixed(2)} ${cp2y.toFixed(2)}, ${p2.x.toFixed(2)} ${p2.y.toFixed(2)}`;
  }

  return d;
}

export default function SparklineChart({
  data = [],
  width = 120,
  height = 36,
  color = null,
  isPositive = true,
  interactive = true,
  strokeWidth = 2,
  showArea = true,
  className = '',
}) {
  const [hoverIndex, setHoverIndex] = useState(null);

  const effectiveColor = color || (isPositive ? '#10b981' : '#f43f5e');

  const { points, linePath, areaPath, min, max } = useMemo(() => {
    if (!data || data.length === 0) {
      return { points: [], linePath: '', areaPath: '', min: 0, max: 0 };
    }

    const minVal = Math.min(...data);
    const maxVal = Math.max(...data);
    const range = maxVal - minVal || 1;
    const padding = 3;

    const computedPoints = data.map((val, idx) => {
      const x = (idx / (data.length - 1 || 1)) * (width - padding * 2) + padding;
      const normalizedY = (val - minVal) / range;
      // Invert Y for SVG coordinates
      const y = height - padding - normalizedY * (height - padding * 2);
      return { x, y, value: val };
    });

    const spline = getSplinePath(computedPoints);
    const area = computedPoints.length > 0
      ? `${spline} L ${computedPoints[computedPoints.length - 1].x.toFixed(2)} ${height} L ${computedPoints[0].x.toFixed(2)} ${height} Z`
      : '';

    return {
      points: computedPoints,
      linePath: spline,
      areaPath: area,
      min: minVal,
      max: maxVal,
    };
  }, [data, width, height]);

  if (!data || data.length === 0) {
    return <div style={{ width, height }} className="opacity-20" />;
  }

  const gradientId = useMemo(
    () => `sparkline-grad-${Math.random().toString(36).substr(2, 9)}`,
    []
  );

  const activePoint = hoverIndex !== null && points[hoverIndex] ? points[hoverIndex] : null;

  return (
    <div
      className={`relative inline-block select-none ${className}`}
      style={{ width, height }}
      onMouseLeave={() => setHoverIndex(null)}
      onMouseMove={(e) => {
        if (!interactive || points.length === 0) return;
        const rect = e.currentTarget.getBoundingClientRect();
        const mouseX = Math.max(0, Math.min(width, e.clientX - rect.left));
        const index = Math.round((mouseX / width) * (points.length - 1));
        setHoverIndex(Math.max(0, Math.min(points.length - 1, index)));
      }}
    >
      <svg
        width={width}
        height={height}
        viewBox={`0 0 ${width} ${height}`}
        className="overflow-visible"
      >
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={effectiveColor} stopOpacity={0.28} />
            <stop offset="100%" stopColor={effectiveColor} stopOpacity={0.0} />
          </linearGradient>
          <filter id={`glow-${gradientId}`} x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation="1.5" result="blur" />
            <feComposite in="SourceGraphic" in2="blur" operator="over" />
          </filter>
        </defs>

        {/* 区域发光渐变填充 */}
        {showArea && (
          <path
            d={areaPath}
            fill={`url(#${gradientId})`}
            className="transition-opacity duration-300 pointer-events-none"
          />
        )}

        {/* 丝滑主折线 */}
        <path
          d={linePath}
          fill="none"
          stroke={effectiveColor}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeLinejoin="round"
          filter={`url(#glow-${gradientId})`}
          className="transition-all duration-300 pointer-events-none"
        />

        {/* 悬浮指示点与十字光标 */}
        {activePoint && (
          <g className="transition-transform duration-100 pointer-events-none">
            {/* 垂直参考线 */}
            <line
              x1={activePoint.x}
              y1={0}
              x2={activePoint.x}
              y2={height}
              stroke="rgba(255, 255, 255, 0.2)"
              strokeDasharray="2 2"
              strokeWidth="1"
            />
            {/* 外圈光晕 */}
            <circle
              cx={activePoint.x}
              cy={activePoint.y}
              r="4.5"
              fill={effectiveColor}
              fillOpacity="0.3"
            />
            {/* 内核实心点 */}
            <circle
              cx={activePoint.x}
              cy={activePoint.y}
              r="2.5"
              fill="#ffffff"
              stroke={effectiveColor}
              strokeWidth="1.5"
            />
          </g>
        )}
      </svg>

      {/* 极简浮动微型 HUD 数值 Pill */}
      {activePoint && interactive && (
        <div
          className="absolute z-20 pointer-events-none transform -translate-x-1/2 -top-6 px-1.5 py-0.5 rounded-full bg-[#181a22] border border-white/20 text-[10px] font-mono font-bold text-white shadow-lg whitespace-nowrap"
          style={{ left: Math.max(16, Math.min(width - 16, activePoint.x)) }}
        >
          {activePoint.value}
        </div>
      )}
    </div>
  );
}
