"use client";

import React, { useMemo } from "react";
import AspectWireframeIcon from "./AspectWireframeIcon.jsx";

/**
 * Computes standard pixel dimensions from aspect ratio string and quality string.
 */
export function computeImageDimensions(aspectRatio = "1:1", quality = "1K") {
  const q = String(quality || "").toUpperCase();
  let base = 1024;
  if (q.includes("4K")) {
    base = 4096;
  } else if (q.includes("2K")) {
    base = 2048;
  } else if (q.includes("1.5K")) {
    base = 1536;
  }

  const r = String(aspectRatio || "1:1").toLowerCase().trim();
  if (
    r === "auto" ||
    r.includes("自动") ||
    r.includes("smart") ||
    r.includes("自适应")
  ) {
    return { width: base, height: base };
  }
  if (r === "1:1") return { width: base, height: base };
  if (r === "16:9") {
    return base >= 4096
      ? { width: 3840, height: 2160 }
      : base >= 2048
        ? { width: 2560, height: 1440 }
        : { width: 1280, height: 720 };
  }
  if (r === "9:16") {
    return base >= 4096
      ? { width: 2160, height: 3840 }
      : base >= 2048
        ? { width: 1440, height: 2560 }
        : { width: 720, height: 1280 };
  }
  if (r === "4:3") {
    return base >= 4096
      ? { width: 3840, height: 2880 }
      : base >= 2048
        ? { width: 2048, height: 1536 }
        : { width: 1152, height: 864 };
  }
  if (r === "3:4") {
    return base >= 4096
      ? { width: 2880, height: 3840 }
      : base >= 2048
        ? { width: 1536, height: 2048 }
        : { width: 864, height: 1152 };
  }
  if (r === "21:9") {
    return base >= 4096
      ? { width: 4096, height: 1755 }
      : base >= 2048
        ? { width: 2560, height: 1080 }
        : { width: 1680, height: 720 };
  }
  if (r === "3:2") {
    return base >= 4096
      ? { width: 4096, height: 2730 }
      : base >= 2048
        ? { width: 2160, height: 1440 }
        : { width: 1200, height: 800 };
  }
  if (r === "2:3") {
    return base >= 4096
      ? { width: 2730, height: 4096 }
      : base >= 2048
        ? { width: 1440, height: 2160 }
        : { width: 800, height: 1200 };
  }

  const parts = r.split(":");
  if (parts.length === 2) {
    const w = parseFloat(parts[0]);
    const h = parseFloat(parts[1]);
    if (w && h) {
      if (w >= h) {
        return { width: base, height: Math.round((base * h) / w) };
      } else {
        return { width: Math.round((base * w) / h), height: base };
      }
    }
  }
  return { width: base, height: base };
}

export function ImageSpecPopover({
  aspectRatios = [],
  selectedAr = "1:1",
  onSelectAr,
  resolutions = [],
  selectedQuality = "",
  onSelectQuality,
  showQuality = true,
  batchSize = 1,
  onChangeBatchSize,
  copy = {},
}) {
  const dimensions = useMemo(
    () => computeImageDimensions(selectedAr, selectedQuality || resolutions[0]),
    [selectedAr, selectedQuality, resolutions],
  );

  const t = copy.paramsPanel || {};

  return (
    <div className="flex flex-col gap-4 select-none w-full">
      {/* ── 1. Aspect Ratio Section ── */}
      <div>
        <div className="text-[11px] font-semibold text-ink-muted uppercase tracking-wider mb-2 flex items-center justify-between">
          <span>{t.titleRatio || "长宽比例"}</span>
          <span className="text-[10px] text-ink-subtle font-normal">
            {selectedAr}
          </span>
        </div>
        <div className="grid grid-cols-4 sm:grid-cols-5 gap-1.5 max-h-[160px] overflow-y-auto custom-scrollbar p-0.5">
          {aspectRatios.map((ratio) => {
            const isSelected = selectedAr === ratio;
            return (
              <button
                key={ratio}
                type="button"
                onClick={() => onSelectAr?.(ratio)}
                className={`flex flex-col items-center justify-center p-2 rounded-xl border transition-all group ${
                  isSelected
                    ? "bg-primary/15 border-primary text-primary shadow-elevation-1"
                    : "bg-wash/40 border-line text-ink-muted hover:border-line-strong hover:text-ink hover:bg-wash"
                }`}
              >
                <AspectWireframeIcon ratio={ratio} active={isSelected} />
                <span
                  className={`text-[11px] mt-1.5 font-medium leading-none ${
                    isSelected ? "text-primary font-semibold" : "text-white/70"
                  }`}
                >
                  {ratio}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* ── 2. Resolution / Quality Section ── */}
      {showQuality && resolutions.length > 0 && (
        <div>
          <div className="text-[11px] font-semibold text-ink-muted uppercase tracking-wider mb-1.5 flex items-center justify-between">
            <span>{t.titleResolution || "分辨率"}</span>
            <span className="text-[10px] text-ink-subtle font-normal">
              {selectedQuality || resolutions[0]}
            </span>
          </div>
          <div className="grid grid-flow-col auto-cols-fr gap-1 p-1 rounded-xl bg-wash border border-line">
            {resolutions.map((res) => {
              const isSelected =
                selectedQuality === res ||
                (!selectedQuality && res === resolutions[0]);
              return (
                <button
                  key={res}
                  type="button"
                  onClick={() => onSelectQuality?.(res)}
                  className={`py-1.5 px-2 rounded-lg text-xs font-medium transition-all text-center ${
                    isSelected
                      ? "bg-surface-raised text-ink font-semibold shadow-elevation-1"
                      : "text-ink-muted hover:text-ink"
                  }`}
                >
                  {res}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* ── 3. Batch Size / Generation Quantity Section ── */}
      <div>
        <div className="text-[11px] font-semibold text-ink-muted uppercase tracking-wider mb-1.5 flex items-center justify-between">
          <span>{t.titleQuantity || "生成数量"}</span>
          <span className="text-[10px] text-ink-subtle font-normal">
            {t.batchCountUnit
              ? t.batchCountUnit.replace("{count}", batchSize)
              : `${batchSize} 张`}
          </span>
        </div>
        <div className="grid grid-cols-4 gap-1 p-1 rounded-xl bg-wash border border-line">
          {[1, 2, 3, 4].map((num) => {
            const isSelected = batchSize === num;
            return (
              <button
                key={num}
                type="button"
                onClick={() => onChangeBatchSize?.(num)}
                className={`py-1.5 rounded-lg text-xs font-medium transition-all text-center ${
                  isSelected
                    ? "bg-surface-raised text-ink font-semibold shadow-elevation-1"
                    : "text-ink-muted hover:text-ink"
                }`}
              >
                {num}
              </button>
            );
          })}
        </div>
      </div>

      {/* ── 4. Dimensions Section ── */}
      <div className="pt-2.5 border-t border-line-subtle flex items-center justify-between text-xs">
        <span className="text-[11px] font-semibold text-ink-muted uppercase tracking-wider">
          {t.titleDimensions || "尺寸规格"}
        </span>
        <div className="flex items-center gap-1.5 text-xs text-ink-muted font-mono">
          <span className="text-[10px] font-semibold text-ink-subtle">W</span>
          <span className="px-2 py-0.5 rounded-md bg-wash border border-line text-ink font-semibold min-w-[46px] text-center tracking-tight">
            {dimensions.width}
          </span>
          <span className="text-ink-subtle mx-0.5">⇄</span>
          <span className="text-[10px] font-semibold text-ink-subtle">H</span>
          <span className="px-2 py-0.5 rounded-md bg-wash border border-line text-ink font-semibold min-w-[46px] text-center tracking-tight">
            {dimensions.height}
          </span>
          <span className="text-[10px] text-ink-subtle ml-0.5 font-semibold">PX</span>
        </div>
      </div>
    </div>
  );
}

export default ImageSpecPopover;
