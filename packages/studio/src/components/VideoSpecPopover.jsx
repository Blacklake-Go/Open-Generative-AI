"use client";

import React from "react";
import AspectWireframeIcon from "./AspectWireframeIcon.jsx";

export function VideoSpecPopover({
  aspectRatios = [],
  selectedAr = "16:9",
  onSelectAr,
  aspectRatioHelp = null,
  resolutions = [],
  selectedResolution = "720p",
  onSelectResolution,
  copy = {},
}) {
  const arTitle = copy.dropdowns?.aspectRatio || "长宽比例";
  const resTitle = copy.dropdowns?.resolution || "分辨率";

  return (
    <div className="flex flex-col gap-4 select-none w-full">
      {/* ── 1. Aspect Ratio Section ── */}
      {aspectRatios.length > 0 && (
        <div>
          <div className="text-[11px] font-semibold text-ink-muted uppercase tracking-wider mb-2 flex items-center justify-between">
            <span>{arTitle}</span>
            <span className="text-[10px] text-ink-subtle font-normal">
              {selectedAr}
            </span>
          </div>
          <div className="grid grid-cols-3 sm:grid-cols-6 gap-1.5 p-0.5">
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
          {aspectRatioHelp && (
            <p className="mt-2 text-[10px] text-ink-subtle leading-tight px-1">
              {aspectRatioHelp}
            </p>
          )}
        </div>
      )}

      {/* ── 2. Resolution Section ── */}
      {resolutions.length > 0 && (
        <div>
          <div className="text-[11px] font-semibold text-ink-muted uppercase tracking-wider mb-1.5 flex items-center justify-between">
            <span>{resTitle}</span>
            <span className="text-[10px] text-ink-subtle font-normal">
              {(() => {
                const cur = resolutions.find(
                  (r) =>
                    r.value === selectedResolution ||
                    r === selectedResolution ||
                    r.id === selectedResolution,
                );
                return cur?.label || cur?.value || selectedResolution;
              })()}
            </span>
          </div>
          <div className="grid grid-flow-col auto-cols-fr gap-1 p-1 rounded-xl bg-wash border border-line">
            {resolutions.map((opt) => {
              const val = typeof opt === "object" ? opt.value || opt.id : opt;
              const label =
                typeof opt === "object" ? opt.label || opt.name || val : opt;
              const disabled = typeof opt === "object" ? Boolean(opt.disabled) : false;
              const isSelected =
                val === selectedResolution ||
                String(val).toLowerCase() === String(selectedResolution).toLowerCase();

              return (
                <button
                  key={val}
                  type="button"
                  disabled={disabled}
                  onClick={() => !disabled && onSelectResolution?.(opt)}
                  className={`py-1.5 px-2 rounded-lg text-xs font-medium transition-all text-center ${
                    isSelected
                      ? "bg-surface-raised text-ink font-semibold shadow-elevation-1"
                      : disabled
                        ? "opacity-35 cursor-not-allowed text-ink-subtle"
                        : "text-ink-muted hover:text-ink"
                  }`}
                >
                  {label}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

export default VideoSpecPopover;
