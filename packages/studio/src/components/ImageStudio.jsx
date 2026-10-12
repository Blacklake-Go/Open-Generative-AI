"use client";

import { useMemo, useState, useEffect, useRef, useCallback } from "react";
import toast from "react-hot-toast";
import { ToastHost as Toaster } from "../ui";
import { generateImage, generateI2I, uploadFile } from "../muapi.js";
import { formatErrorMessage } from "../utils/formatError.js";
import { scopedPersistKey, migrateLegacyPersistKey } from "../persistKey.js";
import DrawModal from "./DrawModal.jsx";
import ImageDetailWorkbench from "./ImageDetailWorkbench.jsx";
import ModelPriceTag from "./ModelPriceTag.jsx";
import { priceForIds } from "../modelPrice.js";
import ImageSpecPopover from "./ImageSpecPopover.jsx";
import ModelParameterControls from "./ModelParameterControls.jsx";
import MobileGenerationActions, {
  GenerationCopyButtons,
} from "./MobileGenerationActions.jsx";
import {
  t2iModels,
  i2iModels,
  isModelActive,
  getAspectRatiosForModel,
  getResolutionsForModel,
  getQualityFieldForModel,
  getAspectRatiosForI2IModel,
  getResolutionsForI2IModel,
  getQualityFieldForI2IModel,
  getMaxImagesForI2IModel,
  getEffectsForI2IModel,
  getDefaultEffectForI2IModel,
  getI2IModelById,
} from "../models.js";
import {
  filterActiveModelEntries,
  getFamilyVariant,
  getImageReferenceVariant,
  imageModelCatalog,
  imageModelPickerEntries,
  imageModelPickerEntryByVariantId,
} from "../modelFamilies.js";
import {
  getModelDescription,
  getModelBadge,
  getModelDisplayName,
} from "../modelDescriptions.js";
import FrontendModelPicker from "./FrontendModelPicker.jsx";
import {
  buildReferenceParams,
  getModelMediaCapabilities,
} from "../modelCapabilities.js";
import {
  buildSupplementalInputPayload,
  createModelParameterValues,
  getSupplementalModelInputs,
} from "../modelParameters.js";
import {
  PROMPT_CONTROL_LABEL_CLASS,
  PromptAspectRatioIcon,
  PromptAction,
  PromptChevronIcon,
  PromptComposer,
  PromptControls,
  PromptFooter,
  PromptMenuItem,
  PromptMenuList,
  PromptPopover,
  PromptPopoverHeader,
  PromptQualityIcon,
  promptControlClassName,
} from "./prompt/PromptComposer.jsx";
import { PromptInputField } from "./prompt/PromptInputField.jsx";
import {
  ReferenceStrip,
  usePromptMention,
} from "./prompt/PromptAttachments.jsx";
import en from "../messages/en/imageStudio.json";
import zh from "../messages/zh/imageStudio.json";
import ja from "../messages/ja-JP/imageStudio.json";
import ko from "../messages/ko-KR/imageStudio.json";
import zhTw from "../messages/zh-TW/imageStudio.json";
import es from "../messages/es-ES/imageStudio.json";
import { resolveCopy } from "../i18nUtils";
import {
  PROVIDER_LOGOS,
  invertLogos,
  getProviderLogo,
  getProviderStyle,
} from "../providerLogos.js";

// ─── helpers ────────────────────────────────────────────────────────────────

async function downloadImage(url, filename) {
  try {
    const response = await fetch(url);
    const blob = await response.blob();
    const blobUrl = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = blobUrl;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(blobUrl);
  } catch {
    window.open(url, "_blank");
  }
}

// ── Batch Grouping & Aspect Ratio Helpers (对标即梦图1/图4流式批次架构) ──

function getArStyle(aspectRatio) {
  if (!aspectRatio) return { aspectRatio: "1 / 1" };
  const parts = String(aspectRatio).split(":");
  if (parts.length === 2) {
    const w = parseFloat(parts[0]);
    const h = parseFloat(parts[1]);
    if (!isNaN(w) && !isNaN(h) && h > 0) {
      return { aspectRatio: `${w} / ${h}` };
    }
  }
  return { aspectRatio: "1 / 1" };
}

function groupHistoryIntoBatches(historyItems) {
  if (!Array.isArray(historyItems) || historyItems.length === 0) return [];
  const batches = [];
  const batchMap = new Map();

  for (const item of historyItems) {
    if (!item || !item.url) continue;
    let batchKey = item.batchId;
    if (!batchKey) {
      const timeBucket = item.timestamp
        ? Math.floor(new Date(item.timestamp).getTime() / 15000)
        : `legacy_${item.id || item.url}`;
      batchKey = `${item.prompt || ""}__${item.model || ""}__${timeBucket}`;
    }

    if (batchMap.has(batchKey)) {
      batchMap.get(batchKey).items.push(item);
    } else {
      const batch = {
        id: batchKey,
        batchId: item.batchId || batchKey,
        prompt: item.prompt || "",
        model: item.model || "",
        aspect_ratio: item.aspect_ratio || "1:1",
        quality: item.quality || null,
        referenceImages: item.referenceImages || [],
        timestamp: item.timestamp || new Date().toISOString(),
        items: [item],
      };
      batchMap.set(batchKey, batch);
      batches.push(batch);
    }
  }

  return batches;
}

function formatFeedDate(timestamp, locale = "zh") {
  if (!timestamp) return "";
  const date = new Date(timestamp);
  if (isNaN(date.getTime())) return "";

  const now = new Date();
  const isToday = date.toDateString() === now.toDateString();
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  const isYesterday = date.toDateString() === yesterday.toDateString();

  const isZh = String(locale || "").startsWith("zh");
  if (isToday) return isZh ? "今天" : "Today";
  if (isYesterday) return isZh ? "昨天" : "Yesterday";

  if (isZh) {
    const month = date.getMonth() + 1;
    const day = date.getDate();
    return `${month}月${day}日`;
  }
  return date.toLocaleDateString(locale || "en", { month: "short", day: "numeric" });
}

function groupBatchesByDate(batches, locale = "zh") {
  const groups = [];
  let currentGroup = null;

  for (const batch of batches) {
    const dateLabel = formatFeedDate(batch.timestamp, locale);
    if (!currentGroup || currentGroup.dateLabel !== dateLabel) {
      currentGroup = {
        dateLabel,
        batches: [batch],
      };
      groups.push(currentGroup);
    } else {
      currentGroup.batches.push(batch);
    }
  }

  return groups;
}

// ─── UploadButton (inline picker) ───────────────────────────────────────────

export function uploadErrorMessage(err, copy) {
  const message = String(err?.message || "");
  if (message === "LOGIN_CANCELLED") return null;
  return message || copy?.uploadButton?.uploadUnknownFailed || "Upload failed, please try again";
}

export function UploadButton({
  apiKey,
  maxImages = 1,
  onSelect,
  onClear,
  initialUrls = [],
  label = null,
  persistedHistory = null,
  onHistoryChange = null,
  onPreview = null,
  copy = {},
}) {
  const t = copy.uploadButton || {
    faceLabel: "人脸",
    referenceImageLabel: "参考图片",
    addUpToImages: "最多添加 {max} 张图片",
    singleSelectedTitle: "已选择 1 张图片 — 点击可继续添加（最多 {max} 张）",
    multiSelectedTitle: "已选择 {count}/{max} 张图片 — 点击管理",
    tooLargeAlert: "以下图片过大（最大 10MB）：{names}",
    uploadFailedAlert: "图片上传失败：{message}",
    headerTitle: "参考图片",
    selectUpTo: "最多选择 {max} 张图片",
    doneButton: "✓ 完成（{count}）",
    uploadFilesButton: "上传文件",
    uploadNewButton: "上传新图片",
    emptyState: "暂无上传记录",
    removeFromHistory: "从历史记录中移除",
    selectedCount: "已选择 {count}/{max}",
    useSelected: "使用所选图片",
    imageName: "图片{n}",
    addReferenceLabel: "添加参考图",
    historyLabel: "上传历史",
    uploadUnknownFailed: "上传失败，请重试",
  };

  const [panelOpen, setPanelOpen] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [selectedEntries, setSelectedEntries] = useState([]);
  const [uploadHistory, setUploadHistory] = useState(persistedHistory || []);
  const onSelectRef = useRef(onSelect);
  onSelectRef.current = onSelect;

  const onHistoryChangeRef = useRef(onHistoryChange);
  onHistoryChangeRef.current = onHistoryChange;
  useEffect(() => {
    onHistoryChangeRef.current?.(uploadHistory);
  }, [uploadHistory]);

  useEffect(() => {
    if (persistedHistory && persistedHistory.length > 0) {
      setUploadHistory((prev) => {
        const existingUrls = new Set(prev.map((h) => h.url));
        const missing = persistedHistory.filter((h) => h.url && !existingUrls.has(h.url));
        return missing.length > 0 ? [...prev, ...missing] : prev;
      });
    }
  }, [persistedHistory]);

  const [lastUploadProgress, setLastUploadProgress] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const dragCounterRef = useRef(0);
  const fileInputRef = useRef(null);
  const panelRef = useRef(null);
  const triggerRef = useRef(null);

  useEffect(() => {
    if (!panelOpen) return;
    const handler = (e) => {
      if (
        panelRef.current &&
        !panelRef.current.contains(e.target) &&
        triggerRef.current &&
        !triggerRef.current.contains(e.target)
      ) {
        setPanelOpen(false);
      }
    };
    window.addEventListener("click", handler);
    return () => window.removeEventListener("click", handler);
  }, [panelOpen]);

  useEffect(() => {
    const nextUrls = initialUrls || [];
    const currentUrls = selectedEntries.map((entry) => entry.url);
    const isSame =
      nextUrls.length === currentUrls.length &&
      nextUrls.every((url, index) => url === currentUrls[index]);
    if (isSame) return;

    setSelectedEntries(nextUrls.map((url) => ({ url })));
    if (nextUrls.length === 0) return;

    setUploadHistory((history) => {
      const existingUrls = new Set(history.map((entry) => entry.url));
      const missing = nextUrls
        .filter((url) => !existingUrls.has(url))
        .map((url) => ({
          id: `restored-${url}`,
          name: "Restored Image",
          url,
          progress: 100,
        }));
      return missing.length > 0 ? [...missing, ...history] : history;
    });
  }, [initialUrls]);

  useEffect(() => {
    if (selectedEntries.length > maxImages) {
      const trimmed = selectedEntries.slice(0, maxImages);
      setSelectedEntries(trimmed);
      if (trimmed.length === 0) onClear?.();
    }
    if (fileInputRef.current) {
      fileInputRef.current.multiple = maxImages > 1;
    }
  }, [maxImages]);

  const fireOnSelect = useCallback((entries) => {
    if (!entries.length) return;
    const urls = entries.map((e) => e.url);
    onSelectRef.current?.({ url: urls[0], urls, thumbnail: entries[0].url });
  }, []);

  const processFiles = async (files) => {
    if (!files.length) return;

    const MAX_IMAGE_SIZE = 10 * 1024 * 1024;
    const tooLarge = files.filter((f) => f.size > MAX_IMAGE_SIZE);
    if (tooLarge.length > 0) {
      toast.error(
        t.tooLargeAlert.replace("{names}", tooLarge.map((f) => f.name).join(", ")),
      );
      return;
    }

    setUploading(true);
    try {
      const toUpload =
        maxImages === 1
          ? files.slice(0, 1)
          : files.slice(0, maxImages - selectedEntries.length || 1);

      await Promise.all(
        toUpload.map(async (file) => {
          const id = Date.now().toString() + Math.random();
          const placeholder = { id, name: file.name, url: null, progress: 0 };
          setUploadHistory((prev) => [placeholder, ...prev]);

          try {
            const uploadedUrl = await uploadFile(apiKey, file, (pct) => {
              setLastUploadProgress(pct);
              setUploadHistory((prev) =>
                prev.map((h) => (h.id === id ? { ...h, progress: pct } : h)),
              );
            });

            setUploadHistory((prev) =>
              prev.map((h) => {
                if (h.id === id) {
                  return { ...h, url: uploadedUrl, progress: 100 };
                }
                return h;
              }),
            );

            if (selectedEntries.length < maxImages) {
              const newEntry = { url: uploadedUrl };
              setSelectedEntries((prev) => [...prev, newEntry]);

              if (maxImages === 1) {
                fireOnSelect([newEntry]);
                setPanelOpen(false);
              }
            }
          } catch (err) {
            console.error("[UploadButton] Upload failed for", file.name, err);
            setUploadHistory((prev) => prev.filter((h) => h.id !== id));
            throw err;
          }
        }),
      );
    } catch (err) {
      const message = uploadErrorMessage(err, copy);
      if (message) toast.error(t.uploadFailedAlert.replace("{message}", message));
    } finally {
      setUploading(false);
      setLastUploadProgress(0);
    }
  };

  const handleFileChange = async (e) => {
    const files = Array.from(e.target.files);
    e.target.value = "";
    await processFiles(files);
  };

  const handleTriggerDragEnter = (e) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounterRef.current += 1;
    if (e.dataTransfer?.items && e.dataTransfer.items.length > 0) {
      setIsDragging(true);
    }
  };

  const handleTriggerDragLeave = (e) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounterRef.current -= 1;
    if (dragCounterRef.current <= 0) {
      dragCounterRef.current = 0;
      setIsDragging(false);
    }
  };

  const handleTriggerDragOver = (e) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleTriggerDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounterRef.current = 0;
    setIsDragging(false);
    const files = Array.from(e.dataTransfer?.files || []).filter((f) =>
      f.type.startsWith("image/"),
    );
    if (files.length > 0) {
      processFiles(files);
    }
  };

  const handleCellClick = (entry) => {
    const selIdx = selectedEntries.findIndex((e) => e.url === entry.url);
    const isSelected = selIdx !== -1;
    const atMax =
      maxImages > 1 && !isSelected && selectedEntries.length >= maxImages;
    if (atMax) return;

    if (maxImages === 1) {
      const newSelected = [{ url: entry.url, localUrl: entry.localUrl }];
      setSelectedEntries(newSelected);
      fireOnSelect(newSelected);
      setPanelOpen(false);
    } else {
      let next;
      if (isSelected) {
        next = selectedEntries.filter((_, i) => i !== selIdx);
        if (next.length === 0) onClear?.();
      } else {
        next = [
          ...selectedEntries,
          { url: entry.url, localUrl: entry.localUrl },
        ];
      }
      setSelectedEntries(next);
    }
  };

  const handleRemoveFromHistory = (e, entry) => {
    e.stopPropagation();
    if (entry.localUrl) URL.revokeObjectURL(entry.localUrl);
    setUploadHistory((prev) => prev.filter((h) => h.id !== entry.id));

    const next = selectedEntries.filter((s) => s.url !== entry.url);
    if (next.length !== selectedEntries.length) {
      setSelectedEntries(next);
      if (next.length === 0) onClear?.();
    }
  };

  const handleDone = (e) => {
    e.stopPropagation();
    fireOnSelect(selectedEntries);
    setPanelOpen(false);
  };

  const isMulti = maxImages > 1;
  const count = selectedEntries.length;
  const hasSelection = count > 0;

  const stripItems = selectedEntries.map((entry, index) => ({
    ...entry,
    id: `${entry.url}-${index}`,
    name:
      uploadHistory.find((h) => h.url === entry.url)?.name ||
      t.imageName.replace("{n}", index + 1),
  }));

  const handleStripRemove = (entry, index) => {
    const next = selectedEntries.filter((_, i) => i !== index);
    setSelectedEntries(next);
    if (next.length === 0) onClear?.();
    else fireOnSelect(next);
  };

  const defaultLabel = isMulti
    ? t.addUpToImages.replace("{max}", maxImages)
    : t.referenceImageLabel;
  const triggerTitle = hasSelection
    ? count > 1
      ? t.multiSelectedTitle.replace("{count}", count).replace("{max}", maxImages)
      : isMulti
        ? t.singleSelectedTitle.replace("{max}", maxImages)
        : label || t.referenceImageLabel
    : label || defaultLabel;

  return (
    <div className="relative">
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        multiple={isMulti}
        className="hidden"
        onChange={handleFileChange}
      />

      <div
        ref={triggerRef}
        onDragEnter={handleTriggerDragEnter}
        onDragLeave={handleTriggerDragLeave}
        onDragOver={handleTriggerDragOver}
        onDrop={handleTriggerDrop}
        className={`rounded-xl ${isDragging ? "ring-2 ring-primary" : ""}`}
      >
        <ReferenceStrip
          items={stripItems}
          onRemove={handleStripRemove}
          onAdd={() => fileInputRef.current?.click()}
          onOpenHistory={
            uploadHistory.length > 0 ? () => setPanelOpen((o) => !o) : null
          }
          onPreview={onPreview ? (entry) => onPreview(entry.url) : null}
          addLabel={t.addReferenceLabel}
          addTitle={triggerTitle}
          historyLabel={t.historyLabel}
          uploading={uploading}
          progress={lastUploadProgress}
          disabled={isMulti && count >= maxImages}
        />
      </div>

      {panelOpen && (
        <PromptPopover
          ref={panelRef}
          onClick={(e) => e.stopPropagation()}
          className="w-96 max-w-[calc(100vw-2rem)]"
        >
          <div className="flex items-center justify-between px-1 pb-3 mb-2 border-b border-white/5">
            <div className="flex flex-col gap-0.5">
              <span className="text-xs font-bold text-secondary">
                {t.headerTitle}
              </span>
              {isMulti && (
                <span className="text-[9px] text-muted">
                  {t.selectUpTo.replace("{max}", maxImages)}
                </span>
              )}
            </div>
            <div className="flex items-center gap-2">
              {isMulti && hasSelection && (
                <button
                  type="button"
                  onClick={handleDone}
                  className="flex items-center gap-1 px-3 py-1.5 bg-primary text-black rounded-xl text-xs font-black transition-all hover:scale-105"
                >
                  {t.doneButton.replace("{count}", count)}
                </button>
              )}
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setPanelOpen(false);
                  fileInputRef.current?.click();
                }}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-primary/10 hover:bg-primary/20 text-primary rounded-full text-xs font-bold transition-all border border-primary/20"
              >
                <svg
                  width="11"
                  height="11"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="3"
                >
                  <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" />
                  <polyline points="17 8 12 3 7 8" />
                  <line x1="12" y1="3" x2="12" y2="15" />
                </svg>
                {isMulti ? t.uploadFilesButton : t.uploadNewButton}
              </button>
            </div>
          </div>

          {uploadHistory.length === 0 ? (
            <div className="py-6 flex flex-col items-center gap-2 opacity-40">
              <svg
                width="28"
                height="28"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
                className="text-secondary"
              >
                <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" />
                <polyline points="17 8 12 3 7 8" />
                <line x1="12" y1="3" x2="12" y2="15" />
              </svg>
              <span className="text-xs text-secondary">{t.emptyState}</span>
            </div>
          ) : (
            <div className="grid grid-cols-3 gap-2 max-h-56 overflow-y-auto custom-scrollbar pr-0.5">
              {uploadHistory.map((entry) => {
                const selIdx = selectedEntries.findIndex(
                  (e) => e.url === entry.url,
                );
                const isSelected = selIdx !== -1;
                const atMax =
                  isMulti && !isSelected && selectedEntries.length >= maxImages;

                return (
                  <div
                    key={entry.id}
                    title={entry.name}
                    onClick={() => entry.url && handleCellClick(entry)}
                    className={`relative rounded-xl overflow-hidden border-2 cursor-pointer group/cell aspect-square transition-all ${
                      isSelected
                        ? "border-primary shadow-glow"
                        : "border-white/10 hover:border-white/30"
                    } ${atMax ? "opacity-40 cursor-not-allowed" : ""} ${!entry.url ? "cursor-wait" : ""}`}
                  >
                    {entry.url ? (
                      <img
                        src={entry.url}
                        alt={entry.name}
                        className="w-full h-full object-cover"
                        onError={(e) => {
                          e.target.style.display = "none";
                          e.target.parentElement.classList.add("bg-white/5");
                        }}
                      />
                    ) : (
                      <div className="w-full h-full bg-white/5 flex flex-col items-center justify-center">
                        <div className="w-8 h-8 rounded-full border-2 border-primary/30 border-t-primary animate-spin mb-1" />
                        <span className="text-[10px] font-black text-primary">
                          {entry.progress}%
                        </span>
                      </div>
                    )}

                    {entry.url && (
                      <div className="pointer-events-none absolute inset-0 flex items-end justify-end bg-black/60 p-1 opacity-0 transition-opacity group-hover/cell:pointer-events-auto group-hover/cell:opacity-100 group-focus-within/cell:pointer-events-auto group-focus-within/cell:opacity-100">
                        <button
                          type="button"
                          title={t.removeFromHistory}
                          onClick={(e) => handleRemoveFromHistory(e, entry)}
                          className="w-5 h-5 bg-red-500/80 hover:bg-red-500 rounded-md flex items-center justify-center transition-colors"
                        >
                          <svg
                            width="8"
                            height="8"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="white"
                            strokeWidth="3"
                          >
                            <line x1="18" y1="6" x2="6" y2="18" />
                            <line x1="6" y1="6" x2="18" y2="18" />
                          </svg>
                        </button>
                      </div>
                    )}

                    {isSelected && (
                      <div className="absolute top-1 left-1 min-w-[20px] h-5 bg-primary rounded-full flex items-center justify-center px-1">
                        {isMulti ? (
                          <span className="text-[10px] font-black text-black">
                            {selIdx + 1}
                          </span>
                        ) : (
                          <svg
                            width="9"
                            height="9"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="black"
                            strokeWidth="4"
                          >
                            <polyline points="20 6 9 17 4 12" />
                          </svg>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {isMulti && hasSelection && (
            <div className="mt-3 pt-3 border-t border-white/5 flex items-center justify-between">
              <span className="text-xs text-secondary">
                {t.selectedCount.replace("{count}", count).replace("{max}", maxImages)}
              </span>
              <button
                type="button"
                onClick={handleDone}
                className="px-4 py-1.5 bg-primary text-black rounded-xl text-xs font-black transition-all hover:scale-105"
              >
                {t.useSelected}
              </button>
            </div>
          )}
        </PromptPopover>
      )}
    </div>
  );
}

// ─── ModelDropdown ────────────────────────────────────────────────────────────

function ModelDropdown({ selectedModel, onSelect, onClose, copy, locale = "en" }) {
  const t = copy.modelDropdown;
  const [search, setSearch] = useState("");
  const selectedEntry = imageModelPickerEntryByVariantId.get(selectedModel);
  const activeEntries = filterActiveModelEntries(imageModelPickerEntries);
  const modelCategories = [
    {
      id: "all",
      label: t.categoryAll,
      entries: activeEntries,
    },
    {
      id: "t2i",
      label: t.categoryT2I,
      entries: activeEntries.filter((entry) => entry.variantsByMode.t2i),
    },
    {
      id: "i2i",
      label: t.categoryI2I,
      entries: activeEntries.filter((entry) => entry.variantsByMode.i2i),
    },
  ];
  const [selectedCategory, setSelectedCategory] = useState("all");
  const [selectedProvider, setSelectedProvider] = useState("all");
  const activeCategory = modelCategories.find((category) => category.id === selectedCategory) || modelCategories[0];
  const modelEntries = activeCategory.entries;

  const activeItemRef = useRef(null);

  useEffect(() => {
    // Automatically scroll the active model into view when opening
    if (activeItemRef.current) {
      activeItemRef.current.scrollIntoView({ block: "nearest" });
    }
  }, []);


  // Dynamically compute list of providers from the input models list
  const availableProviders = [];
  const seenProviders = new Set();
  
  modelEntries.forEach(({ family }) => {
    const pId = family.provider || 'muapi';
    const pName = family.provider_name || 'Muapi';
    if (!seenProviders.has(pId)) {
      seenProviders.add(pId);
      availableProviders.push({ id: pId, name: pName });
    }
  });

  const filtered = modelEntries.filter((entry) => {
    const { family } = entry;
    // 1. Filter by provider tab
    if (selectedProvider !== "all") {
      const pId = family.provider || 'muapi';
      if (pId !== selectedProvider) return false;
    }
    // 2. Filter by search query
    const query = search.toLowerCase();
    return entry.searchText.includes(query);
  });

  return (
    <div className="flex gap-4 flex-1 min-h-[350px] overflow-hidden">
      {/* Left Sidebar: Provider tabs */}
      <div className="flex flex-col gap-2.5 items-center pr-2 border-r border-white/5 shrink-0 select-none overflow-y-auto custom-scrollbar w-14 pt-0.5">
        <button
          type="button"
          onClick={() => setSelectedProvider("all")}
          className={`w-8 h-8 rounded-full flex items-center justify-center border transition-all flex-shrink-0 cursor-pointer ${
            selectedProvider === "all"
              ? "bg-white/10 text-yellow-400 border-yellow-500/30 shadow-md scale-105"
              : "bg-white/[0.02] text-white/50 border-white/[0.03] hover:bg-white/5 hover:text-white"
          }`}
          title={t.allProviders}
        >
          <svg width="15" height="15" viewBox="0 0 24 24" fill={selectedProvider === "all" ? "currentColor" : "none"} stroke="currentColor" strokeWidth="2">
            <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
          </svg>
        </button>
        
        {availableProviders.map(p => {
          const style = getProviderStyle(p.id);
          const isSelected = selectedProvider === p.id;
          return (
            <button
              key={p.id}
              type="button"
              onClick={() => setSelectedProvider(p.id)}
              aria-pressed={isSelected}
              className={`w-8 h-8 flex-shrink-0 rounded-full flex items-center justify-center overflow-hidden font-black text-[10px] border transition-all cursor-pointer ${
                isSelected
                  ? `${style.bg} scale-105 shadow-md shadow-black/10`
                  : "bg-white/[0.02] text-white/40 border-white/[0.02] hover:bg-white/5 hover:text-white/80"
              }`}
              title={p.name}
            >
              {(() => {
                const logo = getProviderLogo(p.id);
                return logo ? (
                  <img
                    src={logo}
                    alt={p.name}
                    className={`w-full h-full rounded-full object-contain ${invertLogos.includes(p.id) ? "invert" : ""}`}
                    onError={(e) => {
                      e.currentTarget.style.display = "none";
                    }}
                  />
                ) : (
                  style.text
                );
              })()}
            </button>
          );
        })}
      </div>

      {/* Right Pane: Search input + Models list */}
      <div className="flex-1 flex flex-col gap-2 min-w-0 overflow-hidden">
        <div className="border-b border-white/5 shrink-0 pb-2 space-y-2">
          {/* Top Search Input (Fixed at top) */}
          <div className="flex items-center gap-2.5 bg-white/5 rounded-xl px-3 py-2 border border-white/5 focus-within:border-primary/50 transition-colors">
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              className="text-white/40 shrink-0"
            >
              <circle cx="11" cy="11" r="8" />
              <path d="M21 21l-4.35-4.35" />
            </svg>
            <input
              type="text"
              placeholder={t.searchPlaceholder}
              value={search}
              onClick={(e) => e.stopPropagation()}
              onChange={(e) => {
                const value = e.target.value;
                setSearch(value);
                if (value.trim()) setSelectedProvider("all");
              }}
              className="bg-transparent border-none text-xs text-white placeholder:text-white/40 focus:ring-0 w-full p-0 focus:outline-none"
            />
            {search && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setSearch("");
                }}
                className="text-white/40 hover:text-white/80 p-0.5 text-xs shrink-0"
              >
                ✕
              </button>
            )}
          </div>

          {/* Category Tabs below search */}
          <div className="flex items-center gap-1.5 overflow-x-auto custom-scrollbar pb-0.5">
            {modelCategories.map((category) => (
              <button
                key={category.id}
                type="button"
                onClick={() => {
                  setSelectedCategory(category.id);
                  setSelectedProvider("all");
                }}
                className={`shrink-0 rounded-lg px-2.5 py-1 text-[11px] font-medium transition-colors border ${
                  selectedCategory === category.id
                    ? "bg-primary/15 text-primary border-primary/30"
                    : "bg-white/[0.02] text-white/50 border-white/[0.04] hover:bg-white/5 hover:text-white"
                }`}
              >
                {category.label}
              </button>
            ))}
            {selectedProvider !== "all" && (
              <button
                type="button"
                onClick={() => setSelectedProvider("all")}
                className="shrink-0 rounded-lg px-2 py-0.5 text-[10px] bg-white/5 hover:bg-white/10 text-white/70 border border-white/10 flex items-center gap-1 transition-colors"
                title="清除厂商筛选"
              >
                <span>{availableProviders.find(p => p.id === selectedProvider)?.name || selectedProvider}</span>
                <span className="opacity-60">✕</span>
              </button>
            )}
          </div>
        </div>
        
        <div className="flex flex-col gap-1.5 overflow-y-auto custom-scrollbar pr-1 pb-2 flex-1 min-h-0">
          {filtered.length === 0 ? (
            <div className="text-xs text-white/30 text-center py-6">
              {t.noModelsFound}
            </div>
          ) : (
            filtered.map((entry) => {
              const { family } = entry;
              const isSelected = selectedEntry === entry;
              return (
              <div
                key={entry.id}
                ref={isSelected ? activeItemRef : null}
                onClick={(e) => {
                  e.stopPropagation();
                  onSelect(entry, activeCategory.id);
                  onClose();
                }}
                className={`flex items-center justify-between p-3 hover:bg-white/5 rounded-lg cursor-pointer transition-all border border-transparent hover:border-white/5 ${
                  isSelected ? "bg-white/5 border-white/5" : ""
                }`}
              >
                <div className="flex items-center gap-3">
                  {(() => {
                    const logo = getProviderLogo(family.provider, family.id);
                    return logo ? (
                      <div className="w-8 h-8 rounded-full border border-white/5 overflow-hidden shrink-0 flex items-center justify-center bg-white/[0.02]">
                        <img
                          src={logo}
                          alt={family.provider_name}
                          className={`w-full h-full object-contain p-1 ${invertLogos.includes(family.provider) ? "invert" : ""}`}
                          onError={(e) => {
                            e.currentTarget.style.display = "none";
                          }}
                        />
                      </div>
                    ) : (
                      <div
                        className={`w-8 h-8 ${
                          family.id.includes("kontext")
                            ? "bg-blue-500/10 text-blue-400 border-blue-500/10"
                            : family.id.includes("effects")
                              ? "bg-purple-500/10 text-purple-400 border-purple-500/10"
                              : "bg-primary/10 text-primary border-primary/10"
                        } border rounded-full flex items-center justify-center font-bold text-xs shadow-inner uppercase`}
                      >
                        {entry.name.charAt(0)}
                      </div>
                    );
                  })()}
                  {(() => {
                    const desc = getModelDescription(family.id, locale);
                    const badge = getModelBadge(family.id);
                    return (
                      <div className="flex flex-col gap-0.5 min-w-0">
                        <div className="flex items-center gap-1.5">
                          <span className="text-xs font-bold text-white tracking-tight truncate">
                            {entry.name}
                          </span>
                          {badge && (
                            <span className="px-1.5 py-0.5 rounded-full bg-brand/20 text-brand text-[10px] font-medium border border-brand/30 shrink-0">
                              {badge}
                            </span>
                          )}
                        </div>
                        {desc && (
                          <span className="text-[11px] text-white/50 leading-tight line-clamp-1">
                            {desc}
                          </span>
                        )}
                        <div className="flex items-center gap-2 mt-0.5">
                          <ModelPriceTag ids={entry.variantIds} locale={locale} />
                          {selectedProvider === "all" && family.provider_name && (
                            <span className="text-[9px] text-white/40">
                              {family.provider_name}
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  })()}
                </div>
                {isSelected && (
                  <svg
                    width="14"
                    height="14"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="#e11d74"
                    strokeWidth="4"
                  >
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                )}
              </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}

// ─── SimpleDropdown ───────────────────────────────────────────────────────────

function SimpleDropdown({ title, options, selected, onSelect, onClose }) {
  return (
    <>
      <PromptPopoverHeader>{title}</PromptPopoverHeader>
      <PromptMenuList>
        {options.map((opt) => (
          <PromptMenuItem
            key={opt}
            selected={selected === opt}
            onClick={(e) => {
              e.stopPropagation();
              onSelect(opt);
              onClose();
            }}
          >
            {opt}
          </PromptMenuItem>
        ))}
      </PromptMenuList>
    </>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function ImageStudio({
  apiKey,
  initialModel = "",
  initialPrompt = "",
  onGenerationStart,
  onGenerationEnd,
  onGenerationComplete,
  onGenerationError,
  historyItems,
  onDeleteHistoryItem,
  droppedFiles,
  onFilesHandled,
  locale = "en",
}) {
  const copy = resolveCopy(en, { 'zh-CN': zh, 'ja-JP': ja, 'ko-KR': ko, 'zh-TW': zhTw, es, 'es-ES': es }, locale);
  const LEGACY_PERSIST_KEY = "hg_image_studio_persistent";
  const PERSIST_KEY = scopedPersistKey(LEGACY_PERSIST_KEY, apiKey);
  useEffect(() => {
    migrateLegacyPersistKey(LEGACY_PERSIST_KEY, PERSIST_KEY);
  }, [PERSIST_KEY]);

  // ── Model state ─────────────────────────────────────────────────────────
  const defaultModel = t2iModels.find((m) => isModelActive(m.id)) || t2iModels.find((m) => m.id === "gpt-image-2.5-flash") || t2iModels[0] || {};
  const initialFamily = imageModelCatalog.familyByVariantId.get(defaultModel.id);
  const [imageMode, setImageMode] = useState(false); // false=t2i, true=i2i
  const [selectedModelId, setSelectedModelId] = useState(defaultModel.id || "");
  const [selectedFamilyId, setSelectedFamilyId] = useState(initialFamily?.id || defaultModel.id || "");
  const [selectedAr, setSelectedAr] = useState(
    defaultModel.inputs?.aspect_ratio?.default || "1:1",
  );
  const [selectedQuality, setSelectedQuality] = useState(() => {
    const resolutions = getResolutionsForModel(defaultModel.id);
    return resolutions[0] || null;
  });
  const [selectedEffect, setSelectedEffect] = useState("");
  const [modelParameterValues, setModelParameterValues] = useState(() =>
    createModelParameterValues(defaultModel),
  );

  // ── Prompt / upload state ───────────────────────────────────────────────
  const [prompt, setPrompt] = useState(initialPrompt || "");
  const [uploadedImageUrls, setUploadedImageUrls] = useState([]);
  const [swapImageUrl, setSwapImageUrl] = useState(null);
  const [uploadHistory, setUploadHistory] = useState([]); // persisted reference images history

  // ── UI state ────────────────────────────────────────────────────────────
  const [dropdownOpen, setDropdownOpen] = useState(null); // 'model' | 'ar' | 'quality' | null
  const [generating, setGenerating] = useState(false);
  const [generateError, setGenerateError] = useState(null);
  const [fullscreenUrl, setFullscreenUrl] = useState(null);
  const [failedImageUrls, setFailedImageUrls] = useState({});
  const [fullscreenImageError, setFullscreenImageError] = useState(false);
  const [isDrawModalOpen, setIsDrawModalOpen] = useState(false);
  const [activeDetailItem, setActiveDetailItem] = useState(null); // { item, batch }
  const [drawModalInitialImage, setDrawModalInitialImage] = useState(null);
  const [openBatchMenuId, setOpenBatchMenuId] = useState(null);

  useEffect(() => {
    setFullscreenImageError(false);
  }, [fullscreenUrl]);

  // ── Canvas / history state ──────────────────────────────────────────────
  const [currentImageUrl, setCurrentImageUrl] = useState(null);
  const [activeHistoryIdx, setActiveHistoryIdx] = useState(0);
  const [batchSize, setBatchSize] = useState(1);
  const [localHistory, setLocalHistory] = useState([]); // [{id,url,prompt,model,aspect_ratio,timestamp}]

  // Use prop history if provided, otherwise local
  const history = historyItems ?? localHistory;

  // When historyItems is server-backed (White Label / backfilled sessions),
  // localHistory isn't what's rendered — removal has to go through the
  // parent so it deletes server-side (UsageLog + S3) and updates the same
  // state `history` reads from. Falls back to the old local-only removal
  // when there's no server-backed list (e.g. standalone/embedded studio).
  const handleDeleteEntry = useCallback(async (entry, idx) => {
    if (historyItems && onDeleteHistoryItem) {
      await onDeleteHistoryItem(entry);
    } else {
      setLocalHistory((prev) => prev.filter((_, i) => i !== idx));
    }
  }, [historyItems, onDeleteHistoryItem]);

  const groupedDateBatches = useMemo(() => {
    const batches = groupHistoryIntoBatches(history);
    return groupBatchesByDate(batches, locale);
  }, [history, locale]);

  const activeDetailIndex = useMemo(() => {
    if (!activeDetailItem?.item) return 0;
    const allImages = history.filter((h) => Boolean(h?.url));
    const idx = allImages.findIndex(
      (h) => (h.id || h.url) === (activeDetailItem.item.id || activeDetailItem.item.url)
    );
    return idx >= 0 ? idx : 0;
  }, [activeDetailItem, history]);

  const handleNavigateDetail = useCallback(
    (direction) => {
      if (!activeDetailItem) return;
      const allImages = history.filter((h) => Boolean(h?.url));
      const currentIdx = allImages.findIndex(
        (h) => (h.id || h.url) === (activeDetailItem.item.id || activeDetailItem.item.url)
      );
      const nextIdx = currentIdx + direction;
      if (nextIdx >= 0 && nextIdx < allImages.length) {
        const nextItem = allImages[nextIdx];
        const batches = groupHistoryIntoBatches(history);
        const parentBatch =
          batches.find((b) =>
            b.items.some((i) => (i.id || i.url) === (nextItem.id || nextItem.url))
          ) || null;
        setActiveDetailItem({
          item: nextItem,
          batch: parentBatch,
        });
      }
    },
    [activeDetailItem, history]
  );

  // ── Refs ────────────────────────────────────────────────────────────────
  const textareaRef = useRef(null);
  const dropdownRef = useRef(null);
  const uploadPickerResetRef = useRef(null); // not used directly — managed via key
  const selectionRef = useRef(null);
  selectionRef.current = { imageMode, selectedFamilyId, selectedModelId };

  // ── Close dropdown on outside click ─────────────────────────────────────
  useEffect(() => {
    if (!dropdownOpen) return;
    const handler = (e) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setDropdownOpen(null);
      }
    };
    window.addEventListener("click", handler);
    return () => window.removeEventListener("click", handler);
  }, [dropdownOpen]);

  // ── Persistence: Load ────────────────────────────────────────────────────
  useEffect(() => {
    try {
      const stored = localStorage.getItem(PERSIST_KEY);
      if (stored) {
        const data = JSON.parse(stored);
        if (data.imageMode !== undefined) setImageMode(data.imageMode);
        if (data.selectedModelId) {
          const restoredFamily = imageModelCatalog.familyByVariantId.get(data.selectedModelId);
          const restoredVariant = imageModelCatalog.variantById.get(data.selectedModelId);
          if (restoredFamily) {
            setSelectedModelId(data.selectedModelId);
            setSelectedFamilyId(restoredFamily.id);
            setModelParameterValues(
              createModelParameterValues(
                restoredVariant?.model,
                data.modelParameterValues || {},
              ),
            );
          }
        }
        if (data.selectedAr) setSelectedAr(data.selectedAr);
        if (data.selectedQuality) setSelectedQuality(data.selectedQuality);
        if (data.selectedEffect) setSelectedEffect(data.selectedEffect);
        if (data.prompt) setPrompt(data.prompt);
        if (data.uploadedImageUrls) setUploadedImageUrls(data.uploadedImageUrls);
        if (data.uploadHistory) setUploadHistory(data.uploadHistory);
        if (data.batchSize) setBatchSize(data.batchSize);
        if (data.localHistory) setLocalHistory(data.localHistory);
      }
    } catch (err) {
      console.warn("Failed to load ImageStudio persistence:", err);
    }
  }, []);

  // ── Adjust height on load ────────────────────────────────────────────────
  // ── Persistence: Save ────────────────────────────────────────────────────
  useEffect(() => {
    const timer = setTimeout(() => {
      try {
        const state = {
          imageMode,
          selectedModelId,
          selectedFamilyId,
          selectedAr,
          selectedQuality,
          selectedEffect,
          modelParameterValues,
          prompt,
          uploadedImageUrls,
          uploadHistory,
          batchSize,
          localHistory,
        };
        localStorage.setItem(PERSIST_KEY, JSON.stringify(state));
      } catch (err) {
        console.warn("Failed to save ImageStudio persistence:", err);
      }
    }, 500); // 500ms debounce
    return () => clearTimeout(timer);
  }, [
    imageMode,
    selectedModelId,
    selectedFamilyId,
    selectedAr,
    selectedQuality,
    selectedEffect,
    modelParameterValues,
    prompt,
    uploadedImageUrls,
    uploadHistory,
    batchSize,
    localHistory,
  ]);

  const processDroppedImages = async (files) => {
    const MAX_IMAGE_SIZE = 10 * 1024 * 1024; // 10MB
    const tooLarge = files.filter((f) => f.size > MAX_IMAGE_SIZE);
    if (tooLarge.length > 0) {
      toast.error(
        copy.uploadButton.tooLargeAlert.replace("{names}", tooLarge.map((f) => f.name).join(", "))
      );
      return;
    }

    const family = imageModelCatalog.familyById.get(selectedFamilyId);
    const editor = getFamilyVariant(
      imageModelCatalog,
      family,
      "i2i",
      selectedModelId,
    );
    if (!editor) {
      toast.error(copy.errors.noImageReferenceSupport.replace("{name}", family.name));
      return;
    }

    setGenerating(true); // Show as generating/busy
    try {
      const uploadLimit = getMaxImagesForI2IModel(editor.model.id);
      const toUpload =
        uploadLimit === 1
          ? files.slice(0, 1)
          : files.slice(0, uploadLimit);
      const urls = await Promise.all(
        toUpload.map(async (file) => {
          try {
            return await uploadFile(apiKey, file);
          } catch (err) {
            console.error(
              "[ImageStudio] Drop upload failed for",
              file.name,
              err
            );
            throw err;
          }
        })
      );

      handleUploadSelect({ urls });
    } catch (err) {
      const message = uploadErrorMessage(err, copy);
      if (message) toast.error(copy.uploadButton.uploadFailedAlert.replace("{message}", message));
    } finally {
      setGenerating(false);
    }
  };

  // ── Handle Dropped Files ────────────────────────────────────────────────
  useEffect(() => {
    if (droppedFiles && droppedFiles.length > 0) {
      const imageFiles = droppedFiles.filter(f => f.type.startsWith('image/'));
      if (imageFiles.length > 0) {
        processDroppedImages(imageFiles);
      }
      onFilesHandled?.();
    }
  }, [droppedFiles, onFilesHandled, processDroppedImages]);

  // ── Derived: current model lists & helpers ───────────────────────────────
  const currentAspectRatios = imageMode
    ? getAspectRatiosForI2IModel(selectedModelId)
    : getAspectRatiosForModel(selectedModelId);
  const currentResolutions = imageMode
    ? getResolutionsForI2IModel(selectedModelId)
    : getResolutionsForModel(selectedModelId);
  const currentQualityField = imageMode
    ? getQualityFieldForI2IModel(selectedModelId)
    : getQualityFieldForModel(selectedModelId);
  const showQualityBtn = currentResolutions.length > 0;
  const currentEffects = imageMode ? getEffectsForI2IModel(selectedModelId) : [];
  const showEffectBtn = currentEffects.length > 0;
  const selectedFamily = imageModelCatalog.familyById.get(selectedFamilyId) || initialFamily;
  const selectedPickerEntry = imageModelPickerEntryByVariantId.get(selectedModelId);
  const selectedModelDisplayName = getModelDisplayName(
    selectedFamily.id,
    selectedPickerEntry?.name || selectedFamily.name
  );
  const currentMode = imageMode ? "i2i" : "t2i";
  const selectedVariant = imageModelCatalog.variantById.get(selectedModelId);
  const supplementalInputs = getSupplementalModelInputs(selectedVariant?.model);
  const referenceVariant = getImageReferenceVariant(
    imageModelCatalog,
    selectedFamily,
    selectedModelId,
  );
  const referenceImageLimit = referenceVariant
    ? getModelMediaCapabilities(referenceVariant.model).image.maxItems
    : 1;

  const applySelectedVariant = useCallback((variant, mode, family) => {
    const model = variant.model;
    const nextImageMode = mode === "i2i";
    const ars = nextImageMode
      ? getAspectRatiosForI2IModel(model.id)
      : getAspectRatiosForModel(model.id);
    const resolutions = nextImageMode
      ? getResolutionsForI2IModel(model.id)
      : getResolutionsForModel(model.id);

    selectionRef.current = {
      imageMode: nextImageMode,
      selectedFamilyId: family.id,
      selectedModelId: model.id,
    };
    setImageMode(nextImageMode);
    setSelectedFamilyId(family.id);
    setSelectedModelId(model.id);
    setModelParameterValues((values) =>
      createModelParameterValues(model, values),
    );
    setSelectedAr(ars[0] || "1:1");
    setSelectedQuality(resolutions[0] || null);

    if (nextImageMode) {
      const effects = getEffectsForI2IModel(model.id);
      setSelectedEffect(
        effects.length > 0
          ? (getDefaultEffectForI2IModel(model.id) || effects[0])
          : "",
      );
    } else {
      setSelectedEffect("");
    }
  }, []);

  const applyUserSelectedVariant = useCallback((variant, mode, family) => {
    if (mode === "t2i") {
      setUploadedImageUrls([]);
    } else {
      const maxImages = getMaxImagesForI2IModel(variant.model.id);
      setUploadedImageUrls((urls) => urls.slice(0, maxImages));
    }
    setSwapImageUrl(null);
    applySelectedVariant(variant, mode, family);
  }, [applySelectedVariant]);

  const IMAGE_MODEL_ALIASES = {
    'flux-1-pro': 'flux-2-pro',
    'flux-pro': 'flux-2-pro',
    'flux-dev': 'flux-dev',
    'flux': 'flux-2-pro',
    'banana-pro': 'nano-banana-pro',
    'banana': 'nano-banana-pro',
    'midjourney': 'midjourney-v7',
    'mj-v7': 'midjourney-v7',
    'midjourney-v6': 'midjourney-v7',
  };

  const applyModelSelection = useCallback((targetModelKey) => {
    if (!targetModelKey) return;
    const rawKey = String(targetModelKey).trim();
    const cleanKey = IMAGE_MODEL_ALIASES[rawKey] || IMAGE_MODEL_ALIASES[rawKey.toLowerCase()] || rawKey;

    // 1. Direct variant match
    let variant = imageModelCatalog.variantById.get(cleanKey);
    let family = imageModelCatalog.familyByVariantId.get(cleanKey);

    // 2. Check picker entries
    if (!variant) {
      const pickerEntry = imageModelPickerEntries.find(
        (e) => e.id === cleanKey || e.variantIds?.has(cleanKey) || e.name?.toLowerCase() === cleanKey.toLowerCase()
      );
      if (pickerEntry) {
        variant = pickerEntry.defaultVariant || pickerEntry.variantsByMode?.t2i || pickerEntry.variantsByMode?.i2i;
        family = pickerEntry.family;
      }
    }

    // 3. Check family match or alias
    if (!variant) {
      const targetFamily = imageModelCatalog.familyById.get(cleanKey);
      if (targetFamily) {
        family = targetFamily;
        variant = targetFamily.variants?.t2i?.[0] || targetFamily.variants?.i2i?.[0];
      }
    }

    // 4. Fallback search in raw t2iModels / i2iModels
    if (!variant) {
      const rawT2I = t2iModels.find((m) => m.id === cleanKey || m.endpoint === cleanKey);
      if (rawT2I) {
        variant = { mode: "t2i", model: rawT2I };
        family = imageModelCatalog.familyByVariantId.get(rawT2I.id) || { id: rawT2I.id, name: rawT2I.name };
      } else {
        const rawI2I = i2iModels.find((m) => m.id === cleanKey || m.endpoint === cleanKey);
        if (rawI2I) {
          variant = { mode: "i2i", model: rawI2I };
          family = imageModelCatalog.familyByVariantId.get(rawI2I.id) || { id: rawI2I.id, name: rawI2I.name };
        }
      }
    }

    if (variant && family) {
      applyUserSelectedVariant(variant, variant.mode, family);
    }
  }, [applyUserSelectedVariant]);

  // ── Sync with initialModel prop and URL ?model= ──────────────────────────
  useEffect(() => {
    const urlParams = typeof window !== "undefined" ? new URLSearchParams(window.location.search) : null;
    const urlModel = urlParams?.get("model");
    const targetModel = initialModel || urlModel;
    if (targetModel) {
      applyModelSelection(targetModel);
    }
  }, [initialModel, applyModelSelection]);

  // ── Sync with initialPrompt prop and URL ?remixPrompt= / ?prompt= / ?ar= / ?quality= / ?batch= ──────────────────
  useEffect(() => {
    const urlParams = typeof window !== "undefined" ? new URLSearchParams(window.location.search) : null;
    const urlPrompt = urlParams?.get("remixPrompt") || urlParams?.get("prompt");
    const targetPrompt = urlPrompt || initialPrompt;
    if (targetPrompt) {
      setPrompt(targetPrompt);
    }
    const urlAr = urlParams?.get("ar");
    if (urlAr) {
      setSelectedAr(urlAr);
    }
    const urlQuality = urlParams?.get("quality");
    if (urlQuality) {
      setSelectedQuality(urlQuality);
    }
    const urlBatch = urlParams?.get("batch");
    if (urlBatch) {
      const b = parseInt(urlBatch, 10);
      if (b > 0 && b <= 4) {
        setBatchSize(b);
      }
    }
  }, [initialPrompt]);

  // ── Sync with global koyosim-select-model custom events ──────────────────
  useEffect(() => {
    const handleSelectModelEvent = (e) => {
      const detail = e.detail;
      const modelKey = typeof detail === "string" ? detail : (detail?.modelKey || detail?.modelId);
      const tabId = detail?.tabId;
      if (tabId && !["image", "headshot", "layers", "design-agent", "ai-influencer"].includes(tabId)) {
        return;
      }
      if (modelKey) {
        applyModelSelection(modelKey);
      }
    };
    window.addEventListener("koyosim-select-model", handleSelectModelEvent);
    return () => window.removeEventListener("koyosim-select-model", handleSelectModelEvent);
  }, [applyModelSelection]);

  // ── Textarea auto-resize ─────────────────────────────────────────────────
  // ── Upload picker callbacks ──────────────────────────────────────────────
  const handleUploadSelect = useCallback(
    ({ url, urls }) => {
      const newUrls = urls || [url];
      const selection = selectionRef.current;
      const family = imageModelCatalog.familyById.get(selection.selectedFamilyId);
      const target = getImageReferenceVariant(
        imageModelCatalog,
        family,
        selection.selectedModelId,
      );
      if (!target) {
        toast.error(copy.errors.noImageReferenceSupport.replace("{name}", family.name));
        return;
      }

      const limit = getModelMediaCapabilities(target.model).image.maxItems;
      setUploadedImageUrls(newUrls.slice(0, limit));
      const currentMode = selection.imageMode ? "i2i" : "t2i";
      if (target.model.id !== selection.selectedModelId || target.mode !== currentMode) {
        applySelectedVariant(target, target.mode, family);
      }
    },
    [applySelectedVariant],
  );

  const handleUploadClear = useCallback(() => {
    setUploadedImageUrls([]);
    const selection = selectionRef.current;
    const family = imageModelCatalog.familyById.get(selection.selectedFamilyId);
    const target = getFamilyVariant(
      imageModelCatalog,
      family,
      "t2i",
      selection.selectedModelId,
    );
    if (target) applySelectedVariant(target, "t2i", family);
  }, [applySelectedVariant]);

  // ── @mention over the attached reference images ─────────────────────────
  const mentionItems = useMemo(
    () =>
      uploadedImageUrls.map((url, index) => ({
        id: url,
        url,
        name:
          uploadHistory.find((entry) => entry.url === url)?.name ||
          copy.uploadButton.imageName.replace("{n}", index + 1),
      })),
    [uploadedImageUrls, uploadHistory, copy],
  );
  const mention = usePromptMention({
    textareaRef,
    value: prompt,
    onChange: (event) => setPrompt(event.target.value),
    items: mentionItems,
    enabled: mentionItems.length > 0,
  });

  // ── Model selection ──────────────────────────────────────────────────────
  const handleModelSelect = (pickerEntry, category = "all") => {
    const { family, variantsByMode, defaultVariant } = pickerEntry;
    const target = category !== "all"
      ? variantsByMode[category]
      : uploadedImageUrls.length > 0 && variantsByMode.i2i
        ? variantsByMode.i2i
        : variantsByMode[currentMode] || defaultVariant;
    if (!target) return;

    applyUserSelectedVariant(target, target.mode, family);
  };

  // ── History helpers ──────────────────────────────────────────────────────
  const addToHistory = useCallback(
    (entry) => {
      if (!historyItems) {
        setLocalHistory((prev) => [entry, ...prev.slice(0, 49)]);
      }
      setActiveHistoryIdx(0);
      setCurrentImageUrl(entry.url);
    },
    [historyItems],
  );

  // ── View state ─────────────────────────────────────

  const resetToPrompt = () => {
    setCurrentImageUrl(null);
    setPrompt("");
    setUploadedImageUrls([]);
    setImageMode(false);
    const firstT2I = t2iModels[0];
    const ars = getAspectRatiosForModel(firstT2I.id);
    const resolutions = getResolutionsForModel(firstT2I.id);
    const family = imageModelCatalog.familyByVariantId.get(firstT2I.id);
    setSelectedModelId(firstT2I.id);
    setSelectedFamilyId(family?.id || firstT2I.id);
    setSelectedAr(ars[0] || "1:1");
    setSelectedQuality(resolutions[0] || null);
    setSelectedEffect("");
    setModelParameterValues(createModelParameterValues(firstT2I));
  };

  // ── Generation ───────────────────────────────────────────────────────────
  const handleGenerate = async () => {
    if (generating) return;

    if (imageMode) {
      if (uploadedImageUrls.length === 0) {
        toast.error(copy.errors.uploadReferenceFirst);
        return;
      }
      const modelInfo = getI2IModelById(selectedModelId);
      if (modelInfo?.swapField && !swapImageUrl) {
        toast.error(copy.errors.uploadSwapFaceFirst);
        return;
      }
    } else {
      const imageCapability = getModelMediaCapabilities(selectedVariant?.model).image;
      if (uploadedImageUrls.length > 0 && imageCapability.maxItems === 0) {
        toast.error(copy.errors.noImageReferenceSupport.replace("{name}", selectedModelDisplayName));
        return;
      }
      if (!prompt.trim()) {
        toast.error(copy.errors.enterPromptFirst);
        return;
      }
    }

    onGenerationStart?.();
    setGenerating(true);
    setGenerateError(null);

    try {
      const settledResults = await Promise.allSettled(
        Array.from({ length: batchSize }).map(async () => {
          if (imageMode) {
            const genParams = {
              model: selectedModelId,
              ...buildSupplementalInputPayload(
                selectedVariant?.model,
                modelParameterValues,
              ),
              images_list: uploadedImageUrls,
              image_url: uploadedImageUrls[0],
              aspect_ratio: selectedAr,
            };
            if (swapImageUrl) genParams.swap_url = swapImageUrl;
            if (prompt.trim()) genParams.prompt = prompt.trim();
            if (currentQualityField && selectedQuality) {
              genParams[currentQualityField] = selectedQuality;
            }
            if (showEffectBtn && selectedEffect) genParams.name = selectedEffect;
            return await generateI2I(apiKey, genParams);
          } else {
            const referenceParams = buildReferenceParams(selectedVariant?.model, {
              imageUrls: uploadedImageUrls,
            });
            const genParams = {
              model: selectedModelId,
              ...buildSupplementalInputPayload(
                selectedVariant?.model,
                modelParameterValues,
              ),
              ...referenceParams,
              prompt: prompt.trim(),
              aspect_ratio: selectedAr,
            };
            if (currentQualityField && selectedQuality) {
              genParams[currentQualityField] = selectedQuality;
            }
            return await generateImage(apiKey, genParams);
          }
        })
      );

      const fulfilled = settledResults.filter(r => r.status === 'fulfilled' && r.value?.url).map(r => r.value);
      const rejected = settledResults.filter(r => r.status === 'rejected');
      const failedValues = settledResults.filter(r => r.status === 'fulfilled' && !r.value?.url);

      const failures = [
        ...rejected.map(r => r.reason),
        ...failedValues.map(r => new Error(r.value?.error || copy.errors.generationFailed))
      ];

      const currentBatchId = `batch_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
      fulfilled.forEach((res) => {
        const entry = {
          id: res.id || Math.random().toString(36).substring(7),
          batchId: currentBatchId,
          url: res.url,
          prompt: prompt.trim(),
          model: selectedModelId,
          aspect_ratio: selectedAr,
          quality: selectedQuality,
          referenceImages: uploadedImageUrls || [],
          timestamp: new Date().toISOString(),
        };
        addToHistory(entry);
        onGenerationComplete?.({
          url: res.url,
          model: selectedModelId,
          prompt: prompt.trim(),
          type: "image",
        });
      });

      if (failures.length > 0) {
        console.error("[ImageStudio] Batch generation errors:", failures);
        const firstErr = failures[0];
        const errMsg = formatErrorMessage(firstErr, copy.errors.generationFailed);
        if (fulfilled.length > 0) {
          const partialMsg = `${fulfilled.length}/${batchSize} succeeded. ${errMsg}`;
          if (onGenerationError) onGenerationError(partialMsg);
          else toast.error(partialMsg);
        } else {
          if (onGenerationError) onGenerationError(errMsg);
          else toast.error(errMsg);
        }
      }
    } catch (e) {
      console.error("[ImageStudio] Generation failed:", e);
      const errMsg = formatErrorMessage(e, copy.errors.generationFailed);
      if (onGenerationError) onGenerationError(errMsg);
      else toast.error(errMsg);
    } finally {
      setGenerating(false);
      onGenerationEnd?.();
    }
  };

  // ── Auto-generation trigger from URL (?auto=1) ───────────────────────────
  const autoTriggeredRef = useRef(false);
  useEffect(() => {
    if (typeof window === "undefined" || autoTriggeredRef.current) return;
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get("auto") === "1") {
      autoTriggeredRef.current = true;
      try {
        const nextUrl = new URL(window.location.href);
        nextUrl.searchParams.delete("auto");
        window.history.replaceState({}, "", nextUrl.toString());
      } catch {}
      const timer = setTimeout(() => {
        handleGenerate();
      }, 400);
      return () => clearTimeout(timer);
    }
  }, [handleGenerate]);

  // ── High-Frequency Action Handlers (对标即梦图1/图3/图4 用户便捷优先) ──

  const handleReEdit = useCallback((target) => {
    if (!target) return;
    const p = target.prompt || "";
    setPrompt(p);
    if (target.model) {
      const restoredFamily = imageModelCatalog.familyByVariantId.get(target.model);
      if (restoredFamily) {
        setSelectedModelId(target.model);
        setSelectedFamilyId(restoredFamily.id);
      }
    }
    if (target.aspect_ratio) setSelectedAr(target.aspect_ratio);
    if (target.quality) setSelectedQuality(target.quality);
    if (target.referenceImages && target.referenceImages.length > 0) {
      setUploadedImageUrls(target.referenceImages);
      setImageMode(true);
    } else {
      setUploadedImageUrls([]);
      setImageMode(false);
    }
    textareaRef.current?.focus();
    textareaRef.current?.scrollIntoView({ behavior: "smooth" });
    const isZh = String(locale || "").startsWith("zh");
    toast.success(isZh ? "已载入提示词与参数至输入框" : "Parameters loaded to composer");
  }, [locale]);

  const handleUseAsReference = useCallback((imageUrl) => {
    if (!imageUrl) return;
    setUploadedImageUrls((prev) => [imageUrl, ...prev.filter((u) => u !== imageUrl)].slice(0, referenceImageLimit));
    setImageMode(true);
    textareaRef.current?.focus();
    textareaRef.current?.scrollIntoView({ behavior: "smooth" });
    const isZh = String(locale || "").startsWith("zh");
    toast.success(isZh ? "已设为参考图" : "Set as reference image");
  }, [referenceImageLimit, locale]);

  const handleInpaint = useCallback((imageUrl) => {
    if (!imageUrl) return;
    setDrawModalInitialImage(imageUrl);
    setIsDrawModalOpen(true);
  }, []);

  const handleUpscale = useCallback(async (targetItem) => {
    if (!targetItem?.url) return null;
    const isZh = String(locale || "").startsWith("zh");
    toast.loading(isZh ? "正在启动智能超清 2K/4K..." : "Starting smart upscale...", { id: "upscale-toast" });
    try {
      const genParams = {
        model: "ai-image-upscaler",
        image_url: targetItem.url,
      };
      const result = await generateI2I(apiKey, genParams);
      if (result?.url) {
        const upscaledEntry = {
          id: result.id || Math.random().toString(36).substring(7),
          batchId: targetItem.batchId || `batch_up_${Date.now()}`,
          url: result.url,
          originalUrl: targetItem.url,
          prompt: targetItem.prompt || "",
          model: "ai-image-upscaler",
          aspect_ratio: targetItem.aspect_ratio || "1:1",
          quality: "4K",
          timestamp: new Date().toISOString(),
        };
        addToHistory(upscaledEntry);
        toast.success(isZh ? "超清完成！" : "Upscale complete!", { id: "upscale-toast" });
        return result;
      }
      toast.dismiss("upscale-toast");
      return null;
    } catch (e) {
      console.error("[ImageStudio] Upscale failed:", e);
      toast.error(e.message || (isZh ? "超清处理失败" : "Upscale failed"), { id: "upscale-toast" });
      throw e;
    }
  }, [apiKey, addToHistory, locale]);

  const handleDeleteBatch = useCallback(async (batch) => {
    const isZh = String(locale || "").startsWith("zh");
    if (!window.confirm(isZh ? "确定要删除这批生成的图片吗？" : "Delete this entire batch?")) return;
    for (const it of batch.items) {
      const idx = history.findIndex((h) => (h.id || h.url) === (it.id || it.url));
      if (idx !== -1) {
        await handleDeleteEntry(it, idx);
      }
    }
    setOpenBatchMenuId(null);
    if (activeDetailItem?.batch?.id === batch.id) {
      setActiveDetailItem(null);
    }
  }, [history, handleDeleteEntry, activeDetailItem, locale]);

  const handleDeleteSingleItem = useCallback(async (singleItem) => {
    const isZh = String(locale || "").startsWith("zh");
    if (!window.confirm(isZh ? "确定要删除该图片吗？" : "Delete this image?")) return;
    const idx = history.findIndex((h) => (h.id || h.url) === (singleItem.id || singleItem.url));
    if (idx !== -1) {
      await handleDeleteEntry(singleItem, idx);
      setActiveDetailItem(null);
    }
  }, [history, handleDeleteEntry, locale]);

  const handleReGenerate = useCallback(async (batch) => {
    if (!batch) return;
    const isZh = String(locale || "").startsWith("zh");
    if (generating) {
      toast.error(isZh ? "正在生成中，请稍候" : "Generating in progress, please wait");
      return;
    }

    const targetPrompt = (batch.prompt || "").trim();
    const targetModelId = batch.model || selectedModelId;
    const targetAr = batch.aspect_ratio || selectedAr;
    const targetRefImages = batch.referenceImages || [];
    const isTargetI2I = targetRefImages.length > 0;

    if (!targetPrompt && !isTargetI2I) {
      toast.error(copy.errors?.enterPromptFirst || "请输入提示词");
      return;
    }

    handleReEdit(batch);

    setGenerating(true);
    setGenerateError(null);
    onGenerationStart?.();

    try {
      const batchId = `batch_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
      const targetVariant = imageModelCatalog.variantById.get(targetModelId);
      const curQualityField = getQualityFieldForModel(targetModelId);
      const count = batch.items?.length || 1;

      const settledResults = await Promise.allSettled(
        Array.from({ length: count }).map(async () => {
          if (isTargetI2I) {
            const genParams = {
              model: targetModelId,
              images_list: targetRefImages,
              image_url: targetRefImages[0],
              aspect_ratio: targetAr,
            };
            if (targetPrompt) genParams.prompt = targetPrompt;
            if (curQualityField && batch.quality) {
              genParams[curQualityField] = batch.quality;
            }
            return await generateI2I(apiKey, genParams);
          } else {
            const referenceParams = buildReferenceParams(targetVariant?.model, {
              imageUrls: targetRefImages,
            });
            const genParams = {
              model: targetModelId,
              ...referenceParams,
              prompt: targetPrompt,
              aspect_ratio: targetAr,
            };
            if (curQualityField && batch.quality) {
              genParams[curQualityField] = batch.quality;
            }
            return await generateImage(apiKey, genParams);
          }
        })
      );

      const fulfilled = settledResults.filter((r) => r.status === "fulfilled" && r.value?.url).map((r) => r.value);
      fulfilled.forEach((res) => {
        const entry = {
          id: res.id || Math.random().toString(36).substring(7),
          batchId,
          url: res.url,
          prompt: targetPrompt,
          model: targetModelId,
          aspect_ratio: targetAr,
          quality: batch.quality || selectedQuality,
          referenceImages: targetRefImages,
          timestamp: new Date().toISOString(),
        };
        addToHistory(entry);
        onGenerationComplete?.({
          url: res.url,
          model: targetModelId,
          prompt: targetPrompt,
          type: "image",
        });
      });
      if (fulfilled.length > 0) {
        toast.success(isZh ? "已重新生成一组图片" : "New batch generated");
      }
    } catch (err) {
      const errMsg = formatErrorMessage(err, copy.errors?.generationFailed || "生成失败");
      toast.error(errMsg);
    } finally {
      setGenerating(false);
      onGenerationEnd?.();
    }
  }, [apiKey, generating, copy, selectedModelId, selectedAr, selectedQuality, addToHistory, onGenerationStart, onGenerationEnd, onGenerationComplete, handleReEdit, locale]);

  const placeholderText =
    uploadedImageUrls.length > 1
      ? copy.promptBar.placeholderMultiImage.replace("{count}", uploadedImageUrls.length)
      : imageMode
        ? copy.promptBar.placeholderI2I
        : copy.promptBar.placeholderT2I;

  // ── Render ───────────────────────────────────────────────────────────────
  return (
    <div className="w-full h-full flex flex-col items-center justify-center bg-transparent relative p-4 md:p-6 overflow-hidden">
      
      {/* ── CENTRAL GALLERY AREA ── */}
      <div className="flex-1 w-full max-w-7xl mx-auto overflow-y-auto custom-scrollbar pb-40 lg:pb-32 px-2">
        {history.length > 0 ? (
          <div className="flex flex-col gap-8 w-full pt-4 animate-fade-in">
            {groupedDateBatches.map(({ dateLabel, batches }) => (
              <div key={dateLabel} className="flex flex-col gap-6 w-full">
                {/* Date Header (对标图4: 1月13日 / 2月3日) */}
                <div className="flex items-center gap-3 select-none px-1">
                  <span className="text-xs sm:text-sm font-semibold text-white/90 font-mono tracking-tight">
                    {dateLabel}
                  </span>
                  <div className="flex-1 h-px bg-white/5" />
                </div>

                {/* Batch list under this date */}
                {batches.map((batch) => (
                  <div
                    key={batch.id}
                    className="rounded-2xl border border-white/10 bg-[#121418]/85 backdrop-blur-md p-4 sm:p-5 shadow-elevation-2 flex flex-col gap-4 transition-all hover:border-white/20"
                  >
                    {/* Header Row: Prompt + Parameters + Actions (对标图1 & 图4) */}
                    <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                      {/* Left: Prompt & Meta Chips */}
                      <div className="flex-1 min-w-0 pr-2">
                        <p
                          className="text-white/90 text-xs sm:text-sm leading-relaxed font-normal select-text break-words line-clamp-3 hover:line-clamp-none transition-all cursor-text mb-2.5"
                          title={batch.prompt}
                        >
                          “{batch.prompt || copy.gallery.noPrompt}”
                        </p>
                        <div className="flex items-center flex-wrap gap-1.5 text-[11px]">
                          <span className="px-2 py-0.5 rounded-full bg-white/5 border border-white/10 text-white/80 font-mono text-[10px]">
                            {imageModelCatalog.variantById.get(batch.model)?.name || batch.model?.replace("-", " ") || copy.gallery.modelFallback}
                          </span>
                          {batch.aspect_ratio && (
                            <span className="px-2 py-0.5 rounded-full bg-white/5 border border-white/10 text-white/70 font-mono text-[10px]">
                              {batch.aspect_ratio}
                            </span>
                          )}
                          {batch.quality && (
                            <span className="px-2 py-0.5 rounded-full bg-white/5 border border-white/10 text-white/70 font-mono text-[10px]">
                              {batch.quality}
                            </span>
                          )}
                          {batch.items.length > 1 && (
                            <span className="px-2 py-0.5 rounded-full bg-brand/10 border border-brand/20 text-brand font-medium text-[10px]">
                              {batch.items.length} 张
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Right: High-frequency Action Pills (重新编辑 / 再次生成 / 更多) */}
                      <div className="flex items-center gap-2 shrink-0 self-start sm:self-center">
                        {/* 重新编辑 */}
                        <button
                          type="button"
                          onClick={() => handleReEdit(batch)}
                          className="h-8 px-3 rounded-full bg-white/5 hover:bg-white/10 border border-white/10 text-white text-xs font-medium flex items-center gap-1.5 transition-all active:scale-95 cursor-pointer shadow-sm"
                          title={String(locale || "").startsWith("zh") ? "将此任务的提示词与参数回填到输入框" : "Load prompt & params into composer"}
                        >
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                            <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                          </svg>
                          <span>{String(locale || "").startsWith("zh") ? "重新编辑" : "Re-edit"}</span>
                        </button>

                        {/* 再次生成 */}
                        <button
                          type="button"
                          onClick={() => handleReGenerate(batch)}
                          disabled={generating}
                          className="h-8 px-3.5 rounded-full bg-brand hover:bg-brand-hover text-white text-xs font-medium flex items-center gap-1.5 transition-all active:scale-95 cursor-pointer shadow-elevation-1 disabled:opacity-50"
                          title={String(locale || "").startsWith("zh") ? "使用相同参数再生成一次" : "Generate again with same params"}
                        >
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67" />
                          </svg>
                          <span>{String(locale || "").startsWith("zh") ? "再次生成" : "Regenerate"}</span>
                        </button>

                        {/* 更多菜单 */}
                        <div className="relative">
                          <button
                            type="button"
                            onClick={() => setOpenBatchMenuId(openBatchMenuId === batch.id ? null : batch.id)}
                            className="h-8 w-8 rounded-full bg-white/5 hover:bg-white/10 border border-white/10 text-white/70 hover:text-white flex items-center justify-center transition-all active:scale-95 cursor-pointer"
                            title={String(locale || "").startsWith("zh") ? "更多操作" : "More"}
                          >
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                              <circle cx="12" cy="12" r="2" />
                              <circle cx="19" cy="12" r="2" />
                              <circle cx="5" cy="12" r="2" />
                            </svg>
                          </button>

                          {openBatchMenuId === batch.id && (
                            <div className="absolute right-0 top-10 w-36 rounded-xl bg-[#1a1d23] border border-white/10 shadow-elevation-3 py-1.5 z-30 animate-fade-in flex flex-col">
                              <button
                                type="button"
                                onClick={() => {
                                  if (batch.prompt) {
                                    navigator.clipboard.writeText(batch.prompt);
                                    toast.success(String(locale || "").startsWith("zh") ? "提示词已复制" : "Prompt copied");
                                  }
                                  setOpenBatchMenuId(null);
                                }}
                                className="px-3 py-1.5 text-left text-xs text-white/80 hover:bg-white/10 flex items-center gap-2 cursor-pointer transition-colors"
                              >
                                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                  <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                                  <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                                </svg>
                                <span>{String(locale || "").startsWith("zh") ? "复制提示词" : "Copy Prompt"}</span>
                              </button>
                              <button
                                type="button"
                                onClick={() => handleDeleteBatch(batch)}
                                className="px-3 py-1.5 text-left text-xs text-red-400 hover:bg-red-500/10 flex items-center gap-2 cursor-pointer transition-colors"
                              >
                                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                  <polyline points="3 6 5 6 21 6" />
                                  <path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2" />
                                </svg>
                                <span>{String(locale || "").startsWith("zh") ? "删除整组" : "Delete Batch"}</span>
                              </button>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Image presentation area (真实画幅 & 多图自适应，对标图1与图4) */}
                    <div
                      className={`w-full ${
                        batch.items.length === 1
                          ? "max-w-md mx-auto"
                          : batch.items.length === 2
                          ? "grid grid-cols-1 sm:grid-cols-2 gap-3"
                          : batch.items.length === 3
                          ? "grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3"
                          : "grid grid-cols-2 sm:grid-cols-2 md:grid-cols-4 gap-3"
                      }`}
                    >
                      {batch.items.map((entry, imgIdx) => (
                        <div
                          key={entry.id || imgIdx}
                          style={getArStyle(batch.aspect_ratio || entry.aspect_ratio)}
                          onClick={() => {
                            setActiveDetailItem({ item: entry, batch });
                          }}
                          className="group relative rounded-xl overflow-hidden border border-white/10 bg-[#0a0b0d] hover:border-brand/60 hover:shadow-elevation-3 transition-all duration-300 cursor-pointer flex flex-col"
                        >
                          {failedImageUrls[entry.url] ? (
                            <div className="w-full h-full flex flex-col items-center justify-center bg-zinc-900/60 p-4 text-center">
                              <span className="text-xs text-white/50">{String(locale || "").startsWith("zh") ? "加载失败" : "Failed"}</span>
                            </div>
                          ) : (
                            <img
                              src={entry.url}
                              alt={batch.prompt?.slice(0, 30) || "Generated image"}
                              className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-[1.02]"
                              loading="lazy"
                              onError={() => setFailedImageUrls((prev) => ({ ...prev, [entry.url]: true }))}
                            />
                          )}

                          {/* Hover micro-actions in top-right corner */}
                          <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity duration-200 flex items-center gap-1.5 z-10">
                            <button
                              type="button"
                              title={String(locale || "").startsWith("zh") ? "用作参考图" : "Use as reference"}
                              onClick={(e) => {
                                e.stopPropagation();
                                handleUseAsReference(entry.url);
                              }}
                              className="p-1.5 rounded-full bg-black/70 hover:bg-black/90 backdrop-blur-md text-white/90 hover:text-white border border-white/15 transition-all active:scale-90"
                            >
                              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                                <circle cx="8.5" cy="8.5" r="1.5" />
                                <polyline points="21 15 16 10 5 21" />
                              </svg>
                            </button>
                            <button
                              type="button"
                              title={String(locale || "").startsWith("zh") ? "下载图片" : "Download"}
                              onClick={(e) => {
                                e.stopPropagation();
                                downloadImage(entry.url, `koyosim-${entry.id || imgIdx}.jpg`);
                              }}
                              className="p-1.5 rounded-full bg-black/70 hover:bg-black/90 backdrop-blur-md text-white/90 hover:text-white border border-white/15 transition-all active:scale-90"
                            >
                              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3" />
                              </svg>
                            </button>
                          </div>

                          {/* Bottom-right HD badge */}
                          <div className="absolute bottom-1.5 right-1.5 px-1.5 py-0.5 rounded bg-black/60 backdrop-blur-sm border border-white/10 text-[9px] font-mono text-white/70">
                            HD
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            ))}
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center h-full animate-fade-in min-h-[50vh]">
            {/* Overlapping floating cards */}
            <div className="flex items-center justify-center gap-3 sm:gap-4 mb-10 select-none scale-90 sm:scale-100">
              <div className="w-16 sm:w-24 aspect-[3/4] rounded-xl border border-line shadow-elevation-2 -rotate-3 transform hover:rotate-0 hover:scale-105 hover:z-20 transition-[transform,box-shadow,border-color] duration-base ease-standard overflow-hidden bg-surface-raised flex-shrink-0">
                <img
                  src="https://d3adwkbyhxyrtq.cloudfront.net/webassets/videomodels/sdxl-image.avif"
                  alt="Creative asset 1"
                  className="w-full h-full object-cover"
                  onError={(e) => { e.target.style.display = 'none'; e.target.parentElement.classList.add('bg-wash'); }}
                />
              </div>
              <div className="w-16 sm:w-24 aspect-[3/4] rounded-xl border border-line shadow-elevation-2 -rotate-1 transform hover:rotate-0 hover:scale-105 hover:z-20 transition-[transform,box-shadow,border-color] duration-base ease-standard overflow-hidden bg-surface-raised flex-shrink-0">
                <img
                  src="https://d3adwkbyhxyrtq.cloudfront.net/webassets/videomodels/chroma-image.avif"
                  alt="Creative asset 2"
                  className="w-full h-full object-cover"
                  onError={(e) => { e.target.style.display = 'none'; e.target.parentElement.classList.add('bg-wash'); }}
                />
              </div>
              <div className="w-16 sm:w-24 aspect-[3/4] rounded-xl border border-line shadow-elevation-2 rotate-1 transform hover:rotate-0 hover:scale-105 hover:z-20 transition-[transform,box-shadow,border-color] duration-base ease-standard overflow-hidden bg-surface-raised flex-shrink-0">
                <img
                  src="https://d3adwkbyhxyrtq.cloudfront.net/webassets/videomodels/neta-lumina.avif"
                  alt="Creative asset 3"
                  className="w-full h-full object-cover"
                  onError={(e) => { e.target.style.display = 'none'; e.target.parentElement.classList.add('bg-wash'); }}
                />
              </div>
              <div className="w-16 sm:w-24 aspect-[3/4] rounded-xl border border-line shadow-elevation-2 rotate-3 transform hover:rotate-0 hover:scale-105 hover:z-20 transition-[transform,box-shadow,border-color] duration-base ease-standard overflow-hidden bg-surface-raised flex-shrink-0">
                <img
                  src="https://d3adwkbyhxyrtq.cloudfront.net/webassets/videomodels/perfect-pony-xl.avif"
                  alt="Creative asset 4"
                  className="w-full h-full object-cover"
                  onError={(e) => { e.target.style.display = 'none'; e.target.parentElement.classList.add('bg-wash'); }}
                />
              </div>
            </div>

            <h1 className="text-2xl sm:text-4xl md:text-5xl font-extrabold tracking-tight mb-4 text-center px-4 flex flex-col items-center">
              <span className="text-white font-black uppercase text-xl sm:text-3xl tracking-wide mb-1 opacity-90">{copy.emptyState.heading}</span>
              <span className="text-brand font-black uppercase text-2xl sm:text-4xl sm:mt-1 tracking-tight">
                {selectedModelDisplayName}
              </span>
            </h1>
            <p className="text-ink-muted text-xs sm:text-sm font-medium tracking-wide text-center max-w-lg leading-relaxed px-4">
              {copy.emptyState.subtitle}
            </p>
          </div>
        )}
      </div>

      {/* ── BOTTOM PROMPT BAR ── */}
      <PromptComposer>
          {/* Top row: upload picker + textarea */}
          <div className="flex flex-col gap-3">
            {/* Reference images: stacked photo cards with add / remove */}
            <div className="flex items-center gap-2.5 flex-wrap">
              {referenceVariant && (
                <UploadButton
                  apiKey={apiKey}
                  maxImages={referenceImageLimit}
                  onSelect={handleUploadSelect}
                  onClear={handleUploadClear}
                  initialUrls={uploadedImageUrls}
                  persistedHistory={uploadHistory}
                  onHistoryChange={setUploadHistory}
                  onPreview={setFullscreenUrl}
                  copy={copy}
                />
              )}

              {imageMode && getI2IModelById(selectedModelId)?.swapField && (
                <UploadButton
                  apiKey={apiKey}
                  maxImages={1}
                  onSelect={({ urls }) => setSwapImageUrl(urls[0] || null)}
                  onClear={() => setSwapImageUrl(null)}
                  initialUrls={swapImageUrl ? [swapImageUrl] : []}
                  onPreview={setFullscreenUrl}
                  label={copy.promptBar.swapFaceLabel}
                  copy={copy}
                />
              )}
            </div>

            {/* Input prompt text area */}
            <PromptInputField
              ref={textareaRef}
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder={placeholderText}
              mention={mention}
              mentionTitle={copy.promptBar.mentionTitle}
            />
          </div>

          {/* Bottom row: controls + generate */}
          <PromptFooter>
            {/* Left controls */}
            <PromptControls ref={dropdownRef}>
              {/* Model button */}
              <div className="relative">
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setDropdownOpen((o) => (o === "model" ? null : "model"));
                  }}
                  className={promptControlClassName({
                    active: dropdownOpen === "model",
                  })}
                >
                  <div className="w-4 h-4 rounded overflow-hidden shrink-0 flex items-center justify-center bg-white/5">
                    {(() => {
                      const selectedModelProvider = selectedFamily.provider || 'muapi';
                      const logo = getProviderLogo(selectedModelProvider, selectedFamily.id || selectedModel);
                      const style = getProviderStyle(selectedModelProvider);
                      return logo ? (
                        <img
                          src={logo}
                          alt="" 
                          className={`w-full h-full object-contain ${invertLogos.includes(selectedModelProvider) ? "invert" : ""}`}
                          onError={(e) => {
                            e.currentTarget.style.display = "none";
                          }}
                        />
                      ) : (
                        <span className="text-[9px] font-bold text-white/80 uppercase">
                          {style.text || "M"}
                        </span>
                      );
                    })()}
                  </div>
                  <span className={PROMPT_CONTROL_LABEL_CLASS}>
                    {selectedModelDisplayName}
                  </span>
                  <PromptChevronIcon />
                </button>

                {dropdownOpen === "model" && (
                  <PromptPopover
                    onClick={(e) => e.stopPropagation()}
                    className="w-[calc(100vw-2rem)] sm:w-[380px] max-h-[78vh] flex flex-col overflow-hidden p-0 border border-line-strong shadow-elevation-3 rounded-2xl"
                  >
                    <FrontendModelPicker
                      studioType="image"
                      selectedModel={selectedModelId}
                      onSelect={handleModelSelect}
                      onClose={() => setDropdownOpen(null)}
                      copy={copy}
                      locale={locale}
                    />
                  </PromptPopover>
                )}
              </div>

              <ModelParameterControls
                inputs={supplementalInputs}
                values={modelParameterValues}
                onChange={(key, value) =>
                  setModelParameterValues((values) => ({ ...values, [key]: value }))
                }
                open={dropdownOpen === "parameters"}
                onToggle={(event) => {
                  event.stopPropagation();
                  setDropdownOpen((open) =>
                    open === "parameters" ? null : "parameters",
                  );
                }}
              />

              {/* Unified Image Specification Popover (Aspect Ratio · Resolution · Batch Size) */}
              <div className="relative">
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setDropdownOpen((o) => (o === "spec" ? null : "spec"));
                  }}
                  className={promptControlClassName({
                    active: dropdownOpen === "spec",
                  })}
                >
                  <svg
                    width="15"
                    height="15"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    className="opacity-60 flex-shrink-0"
                  >
                    <path d="M6 2v4M18 2v4M2 6h4M2 18h4M22 6h-4M22 18h-4M6 22v-4M18 22v-4" />
                    <rect x="6" y="6" width="12" height="12" rx="2" />
                  </svg>
                  <span className={PROMPT_CONTROL_LABEL_CLASS}>
                    {selectedAr}
                    {showQualityBtn && currentResolutions.length > 0
                      ? ` · ${selectedQuality || currentResolutions[0]}`
                      : ""}
                    {` · ${batchSize}`}
                  </span>
                  <PromptChevronIcon />
                </button>

                {dropdownOpen === "spec" && (
                  <PromptPopover
                    onClick={(e) => e.stopPropagation()}
                    className="w-[calc(100vw-2rem)] sm:w-[380px] p-4 flex flex-col"
                  >
                    <ImageSpecPopover
                      aspectRatios={currentAspectRatios}
                      selectedAr={selectedAr}
                      onSelectAr={(ar) => setSelectedAr(ar)}
                      resolutions={currentResolutions}
                      selectedQuality={selectedQuality}
                      onSelectQuality={(q) => setSelectedQuality(q)}
                      showQuality={showQualityBtn}
                      batchSize={batchSize}
                      onChangeBatchSize={(n) => setBatchSize(n)}
                      copy={copy}
                    />
                  </PromptPopover>
                )}
              </div>

              {/* Effect type button */}
              {showEffectBtn && (
                <div className="relative">
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setDropdownOpen((o) => (o === "effect" ? null : "effect"));
                    }}
                    className={promptControlClassName({
                      active: dropdownOpen === "effect",
                    })}
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="opacity-40 text-white">
                      <path d="M5 3l14 9-14 9V3z" />
                    </svg>
                    <span className={`${PROMPT_CONTROL_LABEL_CLASS} max-w-[140px] truncate`}>
                      {selectedEffect || copy.promptBar.effectFallback}
                    </span>
                  </button>

                  {dropdownOpen === "effect" && (
                    <PromptPopover
                      onClick={(e) => e.stopPropagation()}
                      className="min-w-[200px]"
                    >
                      <SimpleDropdown
                        title={copy.popovers.effectType}
                        options={currentEffects}
                        selected={selectedEffect}
                        onSelect={(val) => setSelectedEffect(val)}
                        onClose={() => setDropdownOpen(null)}
                      />
                    </PromptPopover>
                  )}
                </div>
              )}

              {/* Draw button */}
              <button
                type="button"
                className={promptControlClassName()}
                onClick={() => setIsDrawModalOpen(true)}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="opacity-40 text-white group-hover:text-[#e11d74] transition-colors">
                  <path d="M12 20h9" />
                  <path d="M16.5 3.5a2.121 2.121 0 013 3L7 19l-4 1 1-4L16.5 3.5z" />
                </svg>
                <span className={PROMPT_CONTROL_LABEL_CLASS}>
                  {copy.promptBar.drawButton}
                </span>
              </button>
            </PromptControls>

            {/* Right actions: Cost in credits + Generate button */}
            <div className="flex items-center gap-3 self-end sm:self-center shrink-0">
              {(() => {
                const isZh = String(locale || "").startsWith("zh");
                return (
                  <div className="flex items-center gap-1.5 px-2 py-1 select-none whitespace-nowrap">
                    <span className="text-[11px] text-white/50">{isZh ? "消耗" : "Cost"}</span>
                    <ModelPriceTag
                      ids={selectedModelId}
                      multiplier={batchSize}
                      locale={locale}
                      className="text-xs font-semibold text-white/90"
                    />
                  </div>
                );
              })()}

              <PromptAction
                onClick={handleGenerate}
                disabled={generating}
              >
                {generating ? (
                  <>
                    <span className="animate-spin inline-block text-black">◌</span>
                    {copy.promptBar.generating}
                  </>
                ) : (
                  <>
                    <span>{copy.promptBar.generateButton}</span>
                  </>
                )}
              </PromptAction>
            </div>
          </PromptFooter>
      </PromptComposer>

      {/* ── FULLSCREEN IMAGE MODAL ── */}
      {fullscreenUrl && (
        <div 
          className="fixed inset-0 z-modal flex items-center justify-center bg-black/95 backdrop-blur-sm animate-fade-in"
          onClick={() => setFullscreenUrl(null)}
        >
          <button
            type="button"
            className="absolute top-6 right-6 p-3 bg-white/10 hover:bg-white/20 rounded-full text-white transition-colors border border-white/10"
            onClick={(e) => {
              e.stopPropagation();
              setFullscreenUrl(null);
            }}
          >
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
          {fullscreenImageError ? (
            <div
              className="flex flex-col items-center justify-center p-8 bg-zinc-900/90 rounded-2xl border border-white/10 text-white text-center"
              onClick={(e) => e.stopPropagation()}
            >
              <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-red-400 mb-3">
                <circle cx="12" cy="12" r="10" />
                <line x1="12" y1="8" x2="12" y2="12" />
                <line x1="12" y1="16" x2="12.01" y2="16" />
              </svg>
              <span className="text-sm font-medium text-white/70">Failed to load preview</span>
            </div>
          ) : (
            <img
              src={fullscreenUrl}
              alt={copy.fullscreen.previewAlt}
              className="max-w-[95vw] max-h-[95vh] rounded-2xl shadow-2xl object-contain animate-scale-up"
              onClick={(e) => e.stopPropagation()}
              onError={() => setFullscreenImageError(true)}
            />
          )}
        </div>
      )}

      {/* ── IMAGE DETAIL WORKBENCH MODAL (对标图3 图像打开状态) ── */}
      <ImageDetailWorkbench
        isOpen={Boolean(activeDetailItem)}
        onClose={() => setActiveDetailItem(null)}
        item={activeDetailItem?.item}
        batch={activeDetailItem?.batch}
        allHistoryItems={history.filter((h) => Boolean(h?.url))}
        currentIndex={activeDetailIndex}
        onNavigate={handleNavigateDetail}
        onReEdit={handleReEdit}
        onReGenerate={handleReGenerate}
        onUseAsReference={handleUseAsReference}
        onInpaint={handleInpaint}
        onUpscale={handleUpscale}
        onDelete={handleDeleteSingleItem}
        locale={locale}
        copy={copy}
        selectedModelDisplayName={selectedModelDisplayName}
      />

      {/* ── DRAW CANVAS MODAL ── */}
      <DrawModal
        isOpen={isDrawModalOpen}
        onClose={() => {
          setIsDrawModalOpen(false);
          setDrawModalInitialImage(null);
        }}
        apiKey={apiKey}
        batchSize={1}
        onAddHistoryItem={addToHistory}
        initialBgImageUrl={drawModalInitialImage}
      />
      <Toaster position="top-right" duration={5000} />
    </div>
  );
}
