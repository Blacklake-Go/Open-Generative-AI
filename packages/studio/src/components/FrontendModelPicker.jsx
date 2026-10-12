"use client";

import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { Pin, Check } from "lucide-react";
import {
  imageModelPickerEntries,
  videoModelPickerEntries,
  filterActiveModelEntries,
} from "../modelFamilies.js";
import {
  getModelDescription,
  getModelBadge,
  getModelDisplayName,
  isModelPinned,
  getServerModelMeta,
} from "../modelDescriptions.js";
import { getProviderLogo, invertLogos } from "../providerLogos.js";
import { applyActiveModelDirectory } from "../models.js";

/**
 * Clean Dropdown Model Picker (Figure 2 Style)
 *
 * Implements the sleek, vertical card list dropdown popover.
 * Directly maps to backend database settings (display_name, badge, description, sort, is_pinned, is_visible).
 * Zero complexity: no bulky tabs, no agent switches, pure elegant model selection.
 */
export default function FrontendModelPicker({
  studioType = "image", // "image" | "video"
  selectedModel,
  onSelect,
  onClose,
  copy,
  locale = "zh",
}) {
  const activeItemRef = useRef(null);

  // Background sync with /api/models/active to reflect dynamic admin updates in real-time
  useEffect(() => {
    let isMounted = true;
    fetch("/api/models/active?nocache=1")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (isMounted && Array.isArray(data?.models) && data.models.length > 0) {
          applyActiveModelDirectory(data.models);
        }
      })
      .catch(() => {});

    return () => {
      isMounted = false;
    };
  }, []);

  // Filter models strictly by studio type with active status
  const modelList = useMemo(() => {
    const catalogEntries =
      studioType === "video"
        ? filterActiveModelEntries(videoModelPickerEntries)
        : filterActiveModelEntries(imageModelPickerEntries);

    // Dynamic fallback: include any active server models of this category not already covered in static catalog
    const coveredIds = new Set(catalogEntries.flatMap((e) => [...(e.variantIds || [e.id])]));
    const dynamicServerEntries = [];
    if (typeof globalThis !== "undefined" && globalThis.__KOYOSIM_SERVER_MODEL_META__) {
      for (const [id, meta] of globalThis.__KOYOSIM_SERVER_MODEL_META__.entries()) {
        const cat = meta.category || meta.type || "image";
        if (
          cat === studioType &&
          meta.isVisible !== false &&
          meta.isActive !== false &&
          !coveredIds.has(id) &&
          !coveredIds.has(meta.id)
        ) {
          coveredIds.add(id);
          coveredIds.add(meta.id);
          dynamicServerEntries.push({
            id: meta.id,
            name: meta.displayName || meta.name || meta.id,
            family: {
              id: meta.id,
              name: meta.displayName || meta.name || meta.id,
              provider: meta.provider || "official",
            },
            variantIds: new Set([meta.id]),
            variantsByMode: {
              [studioType === "video" ? "t2v" : "t2i"]: {
                model: { id: meta.id, name: meta.name || meta.id, provider: meta.provider || "official" },
                mode: studioType === "video" ? "t2v" : "t2i",
              },
            },
          });
        }
      }
    }

    const rawList = [...catalogEntries, ...dynamicServerEntries];

    // Sort: Pinned models first (📌) -> Sort Order -> Catalog order
    return [...rawList].sort((a, b) => {
      const aId = a.family?.id || a.id;
      const bId = b.family?.id || b.id;
      const aPinned = isModelPinned(aId);
      const bPinned = isModelPinned(bId);
      if (aPinned !== bPinned) return aPinned ? -1 : 1;

      const aSort = getServerModelMeta(aId)?.sortOrder ?? 999;
      const bSort = getServerModelMeta(bId)?.sortOrder ?? 999;
      if (aSort !== bSort) return aSort - bSort;

      return 0;
    });
  }, [studioType]);

  // Current selected model display name for header
  const currentSelectedName = useMemo(() => {
    const found = modelList.find(
      (entry) =>
        selectedModel === entry.id ||
        entry.variantIds?.has(selectedModel) ||
        (selectedModel && entry.id?.includes(selectedModel))
    );
    if (!found) return "";
    return getModelDisplayName(found.family?.id || found.id, found.name);
  }, [modelList, selectedModel]);

  // Scroll active item into view on open
  useEffect(() => {
    if (activeItemRef.current) {
      activeItemRef.current.scrollIntoView({ block: "nearest", behavior: "smooth" });
    }
  }, []);

  const handleItemClick = useCallback(
    (entry) => {
      if (onSelect) {
        onSelect(entry, "all");
      }
      if (onClose) {
        onClose();
      }
    },
    [onSelect, onClose]
  );

  return (
    <div className="flex flex-col w-full select-none overflow-hidden">
      {/* ─── Top Header (Fig 2 Reference: "使用纳米香蕉生成") ─── */}
      <div className="px-3 pt-2.5 pb-1.5 shrink-0 select-none">
        <span className="text-caption font-medium text-ink-subtle">
          {currentSelectedName
            ? (locale?.startsWith("zh") ? `使用 ${currentSelectedName} 生成` : `Generate with ${currentSelectedName}`)
            : (locale?.startsWith("zh") ? "选择生成模型" : "Select Generative Model")}
        </span>
      </div>

      {/* ─── Model Cards List (Fig 2 Reference: Clean Vertical Stack) ─── */}
      <div className="flex flex-col gap-1 overflow-y-auto custom-scrollbar p-1 max-h-[380px]">
        {modelList.length === 0 ? (
          <div className="py-8 text-center text-ink-subtle text-caption">
            {locale?.startsWith("zh") ? "暂无可用模型" : "No models available"}
          </div>
        ) : (
          modelList.map((entry) => {
            const { family } = entry;
            const modelKey = family?.id || entry.id;
            const isSelected =
              selectedModel === entry.id ||
              entry.variantIds?.has(selectedModel) ||
              (selectedModel && entry.id?.includes(selectedModel));

            // Dynamic server-overridden metadata
            const serverMeta = getServerModelMeta(modelKey);
            const displayName = getModelDisplayName(modelKey, entry.name);
            const badge = getModelBadge(modelKey);
            const desc = getModelDescription(modelKey, locale);
            const isPinned = isModelPinned(modelKey);
            const providerLogo = getProviderLogo(family?.provider || serverMeta?.provider, modelKey || entry.id);
            const creditsPrice = serverMeta?.creditsPrice;

            return (
              <div
                key={entry.id}
                ref={isSelected ? activeItemRef : null}
                onClick={() => handleItemClick(entry)}
                className={`group flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all cursor-pointer select-none ${
                  isSelected
                    ? "bg-white/[0.08] border border-white/[0.08] shadow-elevation-1"
                    : "bg-transparent border border-transparent hover:bg-white/[0.05] hover:border-white/[0.04]"
                }`}
              >
                {/* Left: Emblem Logo Container (w-9 h-9, rounded-xl) */}
                <div className="size-9 rounded-xl bg-white/[0.05] border border-white/[0.06] flex items-center justify-center p-1.5 shrink-0 overflow-hidden">
                  {providerLogo ? (
                    <img
                      src={providerLogo}
                      alt=""
                      className={`w-full h-full object-contain ${
                        invertLogos.includes(family?.provider) ? "invert" : ""
                      }`}
                      onError={(e) => {
                        e.currentTarget.style.display = "none";
                      }}
                    />
                  ) : (
                    <span className="text-body font-black text-ink-subtle uppercase">
                      {displayName.charAt(0) || "M"}
                    </span>
                  )}
                </div>

                {/* Middle: Title Line + Description Line */}
                <div className="flex-1 min-w-0">
                  {/* Title Line (Model Name + Badge + Credits + Pin) */}
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="text-body-sm font-bold text-ink truncate leading-tight">
                      {displayName}
                    </span>

                    {/* High-Contrast Badge */}
                    {badge && (
                      <span className={`rounded px-1.5 py-0.2 text-[10px] font-medium border shrink-0 leading-none ${
                        badge === '最新'
                          ? 'bg-[#3b82f6]/20 text-[#60a5fa] border-[#3b82f6]/30'
                          : badge === '经济'
                          ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30'
                          : 'bg-[#3b82f6]/20 text-[#60a5fa] border-[#3b82f6]/30'
                      }`}>
                        {badge}
                      </span>
                    )}

                    {/* Credits Price Badge */}
                    {creditsPrice !== undefined && creditsPrice !== null && Number(creditsPrice) > 0 && (
                      <span className="rounded px-1.5 py-0.2 text-[10px] font-medium bg-white/[0.05] text-ink-muted border border-white/[0.08] shrink-0 leading-none">
                        {creditsPrice} {locale?.startsWith("zh") ? "积分" : "cr"}
                      </span>
                    )}

                    {/* Pin indicator */}
                    {isPinned && (
                      <Pin className="size-3 fill-amber-300 text-amber-300 shrink-0" />
                    )}
                  </div>

                  {/* Description Line (Fig 2: Clean single line) */}
                  {desc && (
                    <p className="text-caption text-ink-muted leading-tight line-clamp-1 mt-0.5">
                      {desc}
                    </p>
                  )}
                </div>

                {/* Right: Selected checkmark or subtle state */}
                {isSelected && (
                  <div className="shrink-0 size-4 rounded-full flex items-center justify-center text-white/80">
                    <Check className="size-3.5 stroke-[2.5]" />
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
