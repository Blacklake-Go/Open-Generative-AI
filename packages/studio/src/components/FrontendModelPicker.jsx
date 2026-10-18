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
import {
  applyActiveModelDirectory,
  isServerModelGenerationEligible,
  audioModels,
  lipsyncModels,
} from "../models.js";

/**
 * Clean Dropdown Model Picker (Figure 2 Style)
 *
 * Implements the sleek, vertical card list dropdown popover.
 * Directly maps to backend database settings (display_name, badge, description, sort, is_pinned, is_visible).
 * Zero complexity: no bulky tabs, no agent switches, pure elegant model selection.
 */
const STATIC_SORT_ORDERS = Object.freeze({
  'seedream-5.0-pro': 1,
  'seedream-5.0-flash': 2,
  'image-aesthetic-v8.2': 3,
  'seedream-5.0-lite': 4,
  'seedream-4.5': 5,
  'seedream-5.0': 1,
});

export default function FrontendModelPicker({
  studioType = "image", // "image" | "video"
  selectedModel,
  onSelect,
  onClose,
  copy,
  locale = "zh",
}) {
  const activeItemRef = useRef(null);
  const [directoryRevision, setDirectoryRevision] = useState(0);
  const [directoryLoaded, setDirectoryLoaded] = useState(() =>
    typeof globalThis !== 'undefined' && globalThis.__SUPDANCE_ACTIVE_MODEL_IDS__ instanceof Set);
  const [directoryError, setDirectoryError] = useState(false);

  // Background sync with /api/models/active to reflect dynamic admin updates in real-time
  useEffect(() => {
    let isMounted = true;
    const handleDirectoryUpdate = () => {
      setDirectoryLoaded(true);
      setDirectoryRevision((revision) => revision + 1);
    };
    window.addEventListener('supdance-model-pricing-updated', handleDirectoryUpdate);
    fetch("/api/models/active?nocache=1")
      .then((res) => {
        if (!res.ok) throw new Error('模型目录不可用');
        return res.json();
      })
      .then((data) => {
        if (!Array.isArray(data?.models)) throw new Error('模型目录格式无效');
        if (!isMounted) return;
        applyActiveModelDirectory(data.models);
        setDirectoryLoaded(true);
        setDirectoryRevision((revision) => revision + 1);
        setDirectoryError(false);
      })
      .catch(() => {
        if (!isMounted) return;
        applyActiveModelDirectory([]);
        setDirectoryLoaded(true);
        setDirectoryRevision((revision) => revision + 1);
        setDirectoryError(true);
      });

    return () => {
      isMounted = false;
      window.removeEventListener('supdance-model-pricing-updated', handleDirectoryUpdate);
    };
  }, []);

  // Filter models strictly by studio type with active status
  const modelList = useMemo(() => {
    let catalogEntries = [];
    if (studioType === "video") {
      catalogEntries = filterActiveModelEntries(videoModelPickerEntries);
      if (!catalogEntries.length && !directoryLoaded) {
        catalogEntries = videoModelPickerEntries;
      }
    } else if (studioType === "audio") {
      catalogEntries = (audioModels || []).map((m) => ({
        id: m.id,
        name: m.name,
        family: { id: m.id, name: m.name, provider: m.provider || m.family || "official" },
        variantIds: new Set([m.id]),
        variantsByMode: { audio: { model: m, mode: "audio" } },
        defaultVariant: { model: m, mode: "audio" },
      }));
    } else if (studioType === "digital-human" || studioType === "lipsync") {
      catalogEntries = (lipsyncModels || []).map((m) => ({
        id: m.id,
        name: m.name,
        family: { id: m.id, name: m.name, provider: m.provider || m.family || "official" },
        variantIds: new Set([m.id]),
        variantsByMode: { lipsync: { model: m, mode: "lipsync" } },
        defaultVariant: { model: m, mode: "lipsync" },
      }));
    } else if (studioType === "agent") {
      const agentCatalog = [
        { id: 'deepseek-chat', name: 'DeepSeek-V3 通用创作大模型', provider: 'deepseek' },
        { id: 'deepseek-reasoner', name: 'DeepSeek-R1 深度推理创作大模型', provider: 'deepseek' },
        { id: 'gpt-4o', name: 'GPT-4o 创意全能助手', provider: 'openai' },
        { id: 'claude-3-7-sonnet', name: 'Claude 3.7 Sonnet 思考模型', provider: 'anthropic' },
      ];
      catalogEntries = agentCatalog.map((m) => ({
        id: m.id,
        name: m.name,
        family: { id: m.id, name: m.name, provider: m.provider },
        variantIds: new Set([m.id]),
        variantsByMode: { agent: { model: m, mode: 'agent' } },
        defaultVariant: { model: m, mode: 'agent' },
      }));
    } else {
      catalogEntries = filterActiveModelEntries(imageModelPickerEntries);
      if (!catalogEntries.length && !directoryLoaded) {
        catalogEntries = imageModelPickerEntries;
      }
    }

    // Dynamic fallback: include any active server models of this category not already covered in static catalog
    const coveredIds = new Set(catalogEntries.flatMap((e) => [...(e.variantIds || [e.id])]));
    const KNOWN_CATALOG_ALIASES = {
      'seedream-5.0': ['seedream-4.5', 'seedream-5.0-lite', 'bytedance-seedream-v4.5', 'bytedance-seedream-5.0-lite', 'seedream-5.0'],
      'seedream-5.0-pro': ['bytedance-seedream-5.0-pro', 'bytedance-seedream-v5.0', 'seedream-5.0', 'seedream-5.0-edit'],
      'seedream-4.5': ['bytedance-seedream-v4.5', 'bytedance-seedream-v4.5-edit', 'seedream-4.5'],
      'imagen-4': ['google-imagen4', 'google-imagen4-ultra', 'google-imagen4-fast', 'google-imagen-4'],
    };
    for (const [serverId, catalogList] of Object.entries(KNOWN_CATALOG_ALIASES)) {
      if (catalogList.some((alias) => coveredIds.has(alias))) {
        coveredIds.add(serverId);
        for (const alias of catalogList) coveredIds.add(alias);
      }
    }

    const dynamicServerEntries = [];
    if (typeof globalThis !== "undefined" && globalThis.__SUPDANCE_SERVER_MODEL_META__) {
      for (const [id, meta] of globalThis.__SUPDANCE_SERVER_MODEL_META__.entries()) {
        const cat = meta.category || meta.type || "image";
        const matchesCategory =
          cat === studioType ||
          (studioType === "image" && (cat === "image" || cat === "t2i" || cat === "i2i")) ||
          (studioType === "video" && (cat === "video" || cat === "t2v" || cat === "i2v" || cat === "v2v")) ||
          (studioType === "audio" && (cat === "audio" || cat === "music" || cat === "tts")) ||
          (studioType === "agent" && (cat === "text" || cat === "agent" || cat === "chat")) ||
          ((studioType === "digital-human" || studioType === "lipsync") &&
            (cat === "lipsync" || cat === "avatar" || cat === "digital-human" || cat === "video"));

        if (
          matchesCategory &&
          isServerModelGenerationEligible(meta) &&
          !coveredIds.has(id) &&
          !coveredIds.has(meta.id)
        ) {
          coveredIds.add(id);
          coveredIds.add(meta.id);
          const targetMode =
            studioType === "video"
              ? "t2v"
              : studioType === "audio"
              ? "audio"
              : studioType === "agent"
              ? "agent"
              : studioType === "digital-human"
              ? "lipsync"
              : "t2i";
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
              [targetMode]: {
                model: { id: meta.id, name: meta.name || meta.id, provider: meta.provider || "official" },
                mode: targetMode,
              },
            },
            defaultVariant: {
              model: { id: meta.id, name: meta.name || meta.id, provider: meta.provider || "official" },
              mode: targetMode,
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

      const aSort = getServerModelMeta(aId)?.sortOrder ?? STATIC_SORT_ORDERS[aId] ?? 999;
      const bSort = getServerModelMeta(bId)?.sortOrder ?? STATIC_SORT_ORDERS[bId] ?? 999;
      if (aSort !== bSort) return aSort - bSort;

      return 0;
    });
  }, [studioType, directoryLoaded, directoryRevision]);

  // Current selected model display name for header
  const currentSelectedName = useMemo(() => {
    const found = modelList.find((entry) => {
      const vIds = entry.variantIds instanceof Set ? entry.variantIds : new Set([entry.id]);
      return selectedModel === entry.id || vIds.has(selectedModel) || entry.id?.split(':').includes(selectedModel);
    });
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
    <div className="flex flex-col w-full select-none overflow-hidden bg-[#1c1c1e] rounded-2xl">
      {/* ─── Top Header (Matching user screenshot: "选择模型:  Seedream 5.0 Pro") ─── */}
      <div className="px-4 pt-3.5 pb-2.5 shrink-0 select-none flex items-center gap-2 text-[13px]">
        <span className="font-normal text-[#8e8e93]">
          {locale?.startsWith("zh") ? "选择模型:" : "Select Model:"}
        </span>
        <span className="font-medium text-[#e5e5ea] truncate">
          {currentSelectedName || (locale?.startsWith("zh") ? "未选择" : "None")}
        </span>
      </div>

      {/* ─── Model Cards List (1:1 Screenshot Reference: Clean Vertical Stack) ─── */}
      <div className="flex flex-col gap-1 overflow-y-auto custom-scrollbar p-2 max-h-[420px]">
        {modelList.length === 0 ? (
          <div className="py-8 text-center text-[#8e8e93] text-[13px]">
            {directoryError
              ? (locale?.startsWith("zh") ? "模型目录暂不可用" : "Model directory unavailable")
              : (locale?.startsWith("zh") ? "暂无可用模型" : "No models available")}
          </div>
        ) : (
          modelList.map((entry) => {
            const { family } = entry;
            const modelKey = family?.id || entry.id;
            const vIds = entry.variantIds instanceof Set ? entry.variantIds : new Set([entry.id]);
            const isSelected =
              selectedModel === entry.id ||
              vIds.has(selectedModel) ||
              entry.id?.split(':').includes(selectedModel);

            // Dynamic server-overridden metadata
            const serverMeta = getServerModelMeta(modelKey);
            const displayName = getModelDisplayName(modelKey, entry.name);
            const badge = getModelBadge(modelKey);
            const desc = getModelDescription(modelKey, locale);
            const providerLogo = getProviderLogo(family?.provider || serverMeta?.provider, modelKey || entry.id);

            return (
              <button
                type="button"
                key={entry.id}
                ref={isSelected ? activeItemRef : null}
                onClick={() => handleItemClick(entry)}
                aria-pressed={Boolean(isSelected)}
                className={`group flex w-full items-center gap-3.5 px-3.5 py-3 text-left rounded-xl transition-all cursor-pointer select-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-sky-500 ${
                  isSelected
                    ? "bg-white/[0.08]"
                    : "bg-transparent hover:bg-white/[0.04]"
                }`}
              >
                {/* Left: Emblem Logo Container (size-11, rounded-xl, #2c2c2e) */}
                <div className="size-11 rounded-xl bg-[#2c2c2e] border border-white/[0.04] flex items-center justify-center p-2.5 shrink-0 overflow-hidden shadow-sm">
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
                    <span className="text-body font-bold text-white/70 uppercase">
                      {displayName.charAt(0) || "M"}
                    </span>
                  )}
                </div>

                {/* Middle: Title Line + Description Line */}
                <div className="flex-1 min-w-0 pr-1">
                  {/* Title Line (Model Name + ✦ Badge) */}
                  <div className="flex items-center gap-1.5">
                    <span className="text-[15px] font-medium text-white tracking-tight leading-snug">
                      {displayName}
                    </span>

                    {/* ✦ Sparkle Badge in Sky Blue */}
                    {badge === "✦" && (
                      <span className="text-[#38bdf8] text-[13px] font-bold select-none leading-none ml-1">✦</span>
                    )}
                    {badge && badge !== "✦" && (
                      <span className="rounded px-1.5 py-0.5 text-[10px] font-medium bg-[#3b82f6]/20 text-[#60a5fa] border border-[#3b82f6]/30 shrink-0 leading-none ml-1">
                        {badge}
                      </span>
                    )}
                  </div>

                  {/* Subtitle Line (Exact screenshot matching) */}
                  {desc && (
                    <p className="text-[12px] text-[#8e8e93] leading-relaxed line-clamp-1 mt-0.5">
                      {desc}
                    </p>
                  )}
                </div>

                {/* Right: Selected checkmark matching screenshot */}
                {isSelected && (
                  <div className="shrink-0 size-6 flex items-center justify-center text-white pr-0.5">
                    <Check className="size-5 stroke-[2.5]" />
                  </div>
                )}
              </button>
            );
          })
        )}
      </div>
    </div>
  );
}
