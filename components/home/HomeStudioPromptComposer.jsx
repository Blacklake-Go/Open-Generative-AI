'use client';

import React, {
  useState,
  useRef,
  useEffect,
  useCallback,
  useMemo,
  forwardRef,
  useImperativeHandle,
} from 'react';
import { useRouter } from 'next/navigation';
import toast from 'react-hot-toast';
import { useUserSession } from '@/lib/hooks/useUserSession';
import { localizeStudioPath } from '@/lib/locales';

// Studio components and primitives
import {
  PromptComposer,
  PromptFooter,
  PromptControls,
  PromptAction,
  PromptPopover,
  PromptChevronIcon,
  promptControlClassName,
  PROMPT_CONTROL_LABEL_CLASS,
} from '@/packages/studio/src/components/prompt/PromptComposer.jsx';
import { PromptInputField } from '@/packages/studio/src/components/prompt/PromptInputField.jsx';
import {
  usePromptMention,
} from '@/packages/studio/src/components/prompt/PromptAttachments.jsx';
import { UploadButton } from '@/packages/studio/src/components/ImageStudio.jsx';
import FrontendModelPicker from '@/packages/studio/src/components/FrontendModelPicker.jsx';
import ImageSpecPopover from '@/packages/studio/src/components/ImageSpecPopover.jsx';
import ModelPriceTag from '@/packages/studio/src/components/ModelPriceTag.jsx';
import DrawModal from '@/packages/studio/src/components/DrawModal.jsx';

// Studio models, logos & config
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
} from '@/packages/studio/src/models.js';
import {
  imageModelCatalog,
  imageModelPickerEntries,
  imageModelPickerEntryByVariantId,
  getImageReferenceVariant,
  getFamilyVariant,
} from '@/packages/studio/src/modelFamilies.js';
import {
  getModelDisplayName,
  getModelBadge,
} from '@/packages/studio/src/modelDescriptions.js';
import {
  getModelMediaCapabilities,
} from '@/packages/studio/src/modelCapabilities.js';
import {
  getProviderLogo,
  getProviderStyle,
  invertLogos,
} from '@/packages/studio/src/providerLogos.js';
import { scopedPersistKey } from '@/packages/studio/src/persistKey.js';
import { resolveCopy } from '@/packages/studio/src/i18nUtils.js';

// Messages
import enMessages from '@/packages/studio/src/messages/en/imageStudio.json';
import zhMessages from '@/packages/studio/src/messages/zh/imageStudio.json';
import jaMessages from '@/packages/studio/src/messages/ja-JP/imageStudio.json';
import koMessages from '@/packages/studio/src/messages/ko-KR/imageStudio.json';
import zhTwMessages from '@/packages/studio/src/messages/zh-TW/imageStudio.json';
import esMessages from '@/packages/studio/src/messages/es-ES/imageStudio.json';

const LEGACY_PERSIST_KEY = 'hg_image_studio_persistent';

const HomeStudioPromptComposer = forwardRef(function HomeStudioPromptComposer(
  {
    locale = 'zh',
    onRequireAuth,
    onStartCreation,
    className = '',
  },
  ref,
) {
  const router = useRouter();
  const { user } = useUserSession();
  const apiKey = user?.apiKey || user?.id || null;
  const isZh = String(locale).startsWith('zh');
  const studioBase = localizeStudioPath(locale);

  // i18n copy resolution
  const copy = useMemo(() => {
    return resolveCopy(
      enMessages,
      {
        'zh-CN': zhMessages,
        'zh-TW': zhTwMessages,
        'ja-JP': jaMessages,
        'ko-KR': koMessages,
        es: esMessages,
        'es-ES': esMessages,
      },
      locale,
    );
  }, [locale]);

  // Model default state setup
  const defaultModel = useMemo(() => {
    return (
      t2iModels.find((m) => isModelActive(m.id)) ||
      t2iModels.find((m) => m.id === 'gpt-image-2.5-flash') ||
      t2iModels[0] ||
      {}
    );
  }, []);

  const initialFamily = useMemo(() => {
    return imageModelCatalog.familyByVariantId.get(defaultModel.id) || null;
  }, [defaultModel.id]);

  const [imageMode, setImageMode] = useState(false);
  const [selectedModelId, setSelectedModelId] = useState(defaultModel.id || '');
  const [selectedFamilyId, setSelectedFamilyId] = useState(
    initialFamily?.id || defaultModel.id || '',
  );
  const [selectedAr, setSelectedAr] = useState(
    defaultModel.inputs?.aspect_ratio?.default || '1:1',
  );
  const [selectedQuality, setSelectedQuality] = useState(() => {
    const resolutions = getResolutionsForModel(defaultModel.id);
    return resolutions[0] || '1K';
  });
  const [batchSize, setBatchSize] = useState(1);
  const [prompt, setPrompt] = useState('');
  const [uploadedImageUrls, setUploadedImageUrls] = useState([]);
  const [uploadHistory, setUploadHistory] = useState([]);
  const [dropdownOpen, setDropdownOpen] = useState(null); // 'model' | 'spec' | null
  const [isDrawModalOpen, setIsDrawModalOpen] = useState(false);
  const [fullscreenUrl, setFullscreenUrl] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const textareaRef = useRef(null);
  const dropdownRef = useRef(null);
  const selectionRef = useRef({
    imageMode,
    selectedFamilyId,
    selectedModelId,
  });

  useEffect(() => {
    selectionRef.current = {
      imageMode,
      selectedFamilyId,
      selectedModelId,
    };
  }, [imageMode, selectedFamilyId, selectedModelId]);

  // Imperative handle for parent (JimengHomePortal) to control text & focus
  useImperativeHandle(ref, () => ({
    setPromptText: (text) => {
      setPrompt(text || '');
      textareaRef.current?.focus();
    },
    appendPromptText: (text) => {
      if (!text) return;
      setPrompt((prev) => (prev ? `${prev}，${text}` : text));
      textareaRef.current?.focus();
    },
    toggleSkillPrompt: (skillPrompt) => {
      if (!skillPrompt) return;
      setPrompt((prev) => {
        if (!prev) return skillPrompt;
        if (prev.includes(skillPrompt)) {
          // Remove it if already active
          const cleaned = prev
            .replace(new RegExp(`，?${skillPrompt.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&')}`), '')
            .replace(new RegExp(`${skillPrompt.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&')}，?`), '')
            .trim();
          return cleaned;
        }
        return `${prev}，${skillPrompt}`;
      });
      textareaRef.current?.focus();
    },
    applyCreationPreset: ({ prompt: newPrompt, modelId, ar, quality, batch }) => {
      if (newPrompt) setPrompt(newPrompt);
      if (ar) setSelectedAr(ar);
      if (quality) setSelectedQuality(quality);
      if (batch) setBatchSize(batch);
      if (modelId) {
        const restoredFamily = imageModelCatalog.familyByVariantId.get(modelId);
        if (restoredFamily) {
          setSelectedModelId(modelId);
          setSelectedFamilyId(restoredFamily.id);
        }
      }
      textareaRef.current?.focus();
    },
    focusTextarea: () => {
      textareaRef.current?.focus();
    },
    getComposerState: () => ({
      prompt,
      selectedModelId,
      selectedAr,
      selectedQuality,
      batchSize,
      uploadedImageUrls,
    }),
  }));

  // Close popovers on outside click
  useEffect(() => {
    if (!dropdownOpen) return;
    const handler = (e) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setDropdownOpen(null);
      }
    };
    window.addEventListener('click', handler);
    return () => window.removeEventListener('click', handler);
  }, [dropdownOpen]);

  // Load existing persistent settings if available
  useEffect(() => {
    try {
      const persistKey = scopedPersistKey(LEGACY_PERSIST_KEY, apiKey);
      const stored = localStorage.getItem(persistKey) || localStorage.getItem(LEGACY_PERSIST_KEY);
      if (stored) {
        const data = JSON.parse(stored);
        if (data.selectedModelId) {
          const restoredFamily = imageModelCatalog.familyByVariantId.get(data.selectedModelId);
          if (restoredFamily) {
            setSelectedModelId(data.selectedModelId);
            setSelectedFamilyId(restoredFamily.id);
          }
        }
        if (data.selectedAr) setSelectedAr(data.selectedAr);
        if (data.selectedQuality) setSelectedQuality(data.selectedQuality);
        if (data.batchSize) setBatchSize(data.batchSize);
        if (Array.isArray(data.uploadHistory)) setUploadHistory(data.uploadHistory);
      }
    } catch (err) {
      console.warn('[HomeStudioPromptComposer] Failed to load persistence:', err);
    }
  }, [apiKey]);

  // Derived model lists & helpers
  const currentAspectRatios = useMemo(() => {
    return imageMode
      ? getAspectRatiosForI2IModel(selectedModelId)
      : getAspectRatiosForModel(selectedModelId);
  }, [imageMode, selectedModelId]);

  const currentResolutions = useMemo(() => {
    return imageMode
      ? getResolutionsForI2IModel(selectedModelId)
      : getResolutionsForModel(selectedModelId);
  }, [imageMode, selectedModelId]);

  const showQualityBtn = currentResolutions.length > 0;

  const selectedFamily = useMemo(() => {
    return (
      imageModelCatalog.familyById.get(selectedFamilyId) ||
      initialFamily ||
      { id: selectedModelId, name: 'Model', provider: 'default' }
    );
  }, [selectedFamilyId, initialFamily, selectedModelId]);

  const selectedPickerEntry = useMemo(() => {
    return imageModelPickerEntryByVariantId.get(selectedModelId);
  }, [selectedModelId]);

  const selectedModelDisplayName = useMemo(() => {
    return getModelDisplayName(
      selectedFamily.id,
      selectedPickerEntry?.name || selectedFamily.name || 'Model',
    );
  }, [selectedFamily, selectedPickerEntry]);

  const currentMode = imageMode ? 'i2i' : 't2i';
  const selectedVariant = imageModelCatalog.variantById.get(selectedModelId);
  const referenceVariant = getImageReferenceVariant(
    imageModelCatalog,
    selectedFamily,
    selectedModelId,
  );
  const referenceImageLimit = referenceVariant
    ? getModelMediaCapabilities(referenceVariant.model).image.maxItems
    : 1;

  // Variant application logic
  const applySelectedVariant = useCallback((variant, mode, family) => {
    const model = variant.model;
    const nextImageMode = mode === 'i2i';
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
    setSelectedAr(ars[0] || '1:1');
    setSelectedQuality(resolutions[0] || '1K');
  }, []);

  const applyUserSelectedVariant = useCallback(
    (variant, mode, family) => {
      if (mode === 't2i') {
        setUploadedImageUrls([]);
      } else {
        const maxImages = getMaxImagesForI2IModel(variant.model.id);
        setUploadedImageUrls((urls) => urls.slice(0, maxImages));
      }
      applySelectedVariant(variant, mode, family);
    },
    [applySelectedVariant],
  );

  // Model selection handler from FrontendModelPicker
  const handleModelSelect = useCallback(
    (pickerEntry, category = 'all') => {
      const { family, variantsByMode, defaultVariant } = pickerEntry;
      const target =
        category !== 'all'
          ? variantsByMode[category]
          : uploadedImageUrls.length > 0 && variantsByMode.i2i
          ? variantsByMode.i2i
          : variantsByMode[currentMode] || defaultVariant;
      if (!target) return;

      applyUserSelectedVariant(target, target.mode, family);
    },
    [uploadedImageUrls, currentMode, applyUserSelectedVariant],
  );

  // Reference upload selection handlers
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
        toast.error(
          copy.errors?.noImageReferenceSupport?.replace('{name}', family.name) ||
            `${family.name} does not support reference images`,
        );
        return;
      }

      const limit = getModelMediaCapabilities(target.model).image.maxItems;
      setUploadedImageUrls(newUrls.slice(0, limit));
      const currentSelectionMode = selection.imageMode ? 'i2i' : 't2i';
      if (target.model.id !== selection.selectedModelId || target.mode !== currentSelectionMode) {
        applySelectedVariant(target, target.mode, family);
      }
    },
    [applySelectedVariant, copy],
  );

  const handleUploadClear = useCallback(() => {
    setUploadedImageUrls([]);
    const selection = selectionRef.current;
    const family = imageModelCatalog.familyById.get(selection.selectedFamilyId);
    const target = getFamilyVariant(
      imageModelCatalog,
      family,
      't2i',
      selection.selectedModelId,
    );
    if (target) applySelectedVariant(target, 't2i', family);
  }, [applySelectedVariant]);

  // @mention over attached reference images
  const mentionItems = useMemo(
    () =>
      uploadedImageUrls.map((url, index) => ({
        id: url,
        url,
        name:
          uploadHistory.find((entry) => entry.url === url)?.name ||
          copy.uploadButton?.imageName?.replace('{n}', index + 1) ||
          `Image ${index + 1}`,
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

  // Dynamic placeholder matching Studio
  const placeholderText = useMemo(() => {
    if (uploadedImageUrls.length > 1) {
      return (
        copy.promptBar?.placeholderMultiImage?.replace('{count}', uploadedImageUrls.length) ||
        `已选择 ${uploadedImageUrls.length} 张图片 — 描述转换效果（可选）`
      );
    }
    if (uploadedImageUrls.length === 1) {
      return copy.promptBar?.placeholderI2I || '描述如何转换这张图片（可选）';
    }
    return copy.promptBar?.placeholderT2I || '描述你想要创建的图像';
  }, [uploadedImageUrls.length, copy]);

  // Save current composer state to local persistence
  const saveStateToStorage = useCallback(() => {
    try {
      const state = {
        imageMode,
        selectedModelId,
        selectedFamilyId,
        selectedAr,
        selectedQuality,
        prompt: prompt.trim(),
        uploadedImageUrls,
        uploadHistory,
        batchSize,
      };
      const persistKey = scopedPersistKey(LEGACY_PERSIST_KEY, apiKey);
      localStorage.setItem(persistKey, JSON.stringify(state));
      localStorage.setItem(LEGACY_PERSIST_KEY, JSON.stringify(state));
    } catch (e) {
      console.warn('[HomeStudioPromptComposer] Failed to save state to localStorage:', e);
    }
  }, [
    imageMode,
    selectedModelId,
    selectedFamilyId,
    selectedAr,
    selectedQuality,
    prompt,
    uploadedImageUrls,
    uploadHistory,
    batchSize,
    apiKey,
  ]);

  // Main Submit handler (Generate)
  const handleTriggerSubmit = useCallback(() => {
    if (isSubmitting) return;

    // Validation
    if (imageMode && uploadedImageUrls.length === 0) {
      toast.error(copy.errors?.uploadReferenceFirst || '请先上传参考图片');
      return;
    }
    if (!imageMode && !prompt.trim() && uploadedImageUrls.length === 0) {
      toast.error(copy.errors?.enterPromptFirst || '请先输入提示词');
      textareaRef.current?.focus();
      return;
    }

    // Require Auth Check
    if (!user) {
      if (onRequireAuth) {
        onRequireAuth({
          prompt: prompt.trim(),
          model: selectedModelId,
          ar: selectedAr,
          quality: selectedQuality,
          batch: batchSize,
          imageUrls: uploadedImageUrls,
        });
      }
      return;
    }

    // Save state before jumping
    saveStateToStorage();
    setIsSubmitting(true);

    if (onStartCreation) {
      onStartCreation({
        prompt: prompt.trim(),
        model: selectedModelId,
        ar: selectedAr,
        quality: selectedQuality,
        batch: batchSize,
        imageUrls: uploadedImageUrls,
      });
      return;
    }

    // Direct transition to Studio with auto=1
    const params = new URLSearchParams();
    params.set('tab', 'image');
    if (prompt.trim()) {
      params.set('prompt', prompt.trim());
    }
    if (selectedModelId) {
      params.set('model', selectedModelId);
    }
    if (selectedAr) {
      params.set('ar', selectedAr);
    }
    if (selectedQuality) {
      params.set('quality', selectedQuality);
    }
    if (batchSize > 1) {
      params.set('batch', String(batchSize));
    }
    params.set('auto', '1');

    router.push(`${studioBase}?${params.toString()}`);
  }, [
    isSubmitting,
    imageMode,
    uploadedImageUrls,
    prompt,
    user,
    onRequireAuth,
    selectedModelId,
    selectedAr,
    selectedQuality,
    batchSize,
    saveStateToStorage,
    onStartCreation,
    router,
    studioBase,
    copy,
  ]);

  return (
    <>
      <PromptComposer
        positionClassName="relative w-full max-w-[880px] z-20"
        panelClassName={`w-full rounded-2xl bg-[#16181d]/90 border border-white/10 hover:border-white/20 focus-within:border-brand-line focus-within:ring-2 focus-within:ring-brand-ring/40 transition-all duration-200 shadow-elevation-3 backdrop-blur-xl p-3 sm:p-4 flex flex-col gap-3 group ${className}`}
      >
        {/* Top row: Reference image upload picker + multiline prompt textarea */}
        <div className="flex flex-col gap-3">
          {/* Reference images: stacked photo cards with add / history / remove */}
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
          </div>

          {/* Multiline Prompt Textarea with @mentions */}
          <PromptInputField
            ref={textareaRef}
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder={placeholderText}
            mention={mention}
            mentionTitle={copy.promptBar?.mentionTitle || '可能@的内容'}
            onEnter={handleTriggerSubmit}
          />
        </div>

        {/* Bottom row: controls + price tag + generate button */}
        <PromptFooter>
          {/* Left controls */}
          <PromptControls ref={dropdownRef}>
            {/* 1. Model Selector Capsule Button */}
            <div className="relative">
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setDropdownOpen((o) => (o === 'model' ? null : 'model'));
                }}
                className={promptControlClassName({
                  active: dropdownOpen === 'model',
                })}
              >
                <div className="w-4 h-4 rounded overflow-hidden shrink-0 flex items-center justify-center bg-white/5">
                  {(() => {
                    const selectedModelProvider = selectedFamily.provider || 'default';
                    const logo = getProviderLogo(selectedModelProvider, selectedFamily.id || selectedModelId);
                    const style = getProviderStyle(selectedModelProvider);
                    return logo ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={logo}
                        alt=""
                        className={`w-full h-full object-contain ${
                          invertLogos.includes(selectedModelProvider) ? 'invert' : ''
                        }`}
                        onError={(e) => {
                          e.currentTarget.style.display = 'none';
                        }}
                      />
                    ) : (
                      <span className="text-[9px] font-bold text-white/80 uppercase">
                        {style?.text || 'M'}
                      </span>
                    );
                  })()}
                </div>
                <span className={PROMPT_CONTROL_LABEL_CLASS}>
                  {selectedModelDisplayName}
                </span>
                <PromptChevronIcon />
              </button>

              {dropdownOpen === 'model' && (
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

            {/* 2. Unified Image Specification Popover (Aspect Ratio · Resolution · Batch Size) */}
            <div className="relative">
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setDropdownOpen((o) => (o === 'spec' ? null : 'spec'));
                }}
                className={promptControlClassName({
                  active: dropdownOpen === 'spec',
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
                    : ''}
                  {` · ${batchSize}`}
                </span>
                <PromptChevronIcon />
              </button>

              {dropdownOpen === 'spec' && (
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

            {/* 3. Draw Modal Trigger Button */}
            <button
              type="button"
              className={promptControlClassName()}
              onClick={() => setIsDrawModalOpen(true)}
              title={copy.promptBar?.drawButton || '绘制'}
            >
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
                className="opacity-40 text-white group-hover:text-[#e11d74] transition-colors"
              >
                <path d="M12 20h9" />
                <path d="M16.5 3.5a2.121 2.121 0 013 3L7 19l-4 1 1-4L16.5 3.5z" />
              </svg>
              <span className={PROMPT_CONTROL_LABEL_CLASS}>
                {copy.promptBar?.drawButton || '绘制'}
              </span>
            </button>
          </PromptControls>

          {/* Right actions: Cost in credits + Generate button */}
          <div className="flex items-center gap-3 self-end sm:self-center shrink-0">
            <div className="flex items-center gap-1.5 px-2 py-1 select-none whitespace-nowrap">
              <span className="text-[11px] text-white/50">{isZh ? '消耗' : 'Cost'}</span>
              <ModelPriceTag
                ids={selectedModelId}
                multiplier={batchSize}
                locale={locale}
                className="text-xs font-semibold text-white/90"
              />
            </div>

            <PromptAction
              onClick={handleTriggerSubmit}
              disabled={isSubmitting}
            >
              {isSubmitting ? (
                <>
                  <span className="animate-spin inline-block text-white">◌</span>
                  <span>{copy.promptBar?.generating || '生成中...'}</span>
                </>
              ) : (
                <span>{copy.promptBar?.generateButton || '生成'}</span>
              )}
            </PromptAction>
          </div>
        </PromptFooter>
      </PromptComposer>

      {/* ── Draw Canvas Modal ── */}
      <DrawModal
        isOpen={isDrawModalOpen}
        onClose={() => setIsDrawModalOpen(false)}
        apiKey={apiKey}
        batchSize={1}
        onAddHistoryItem={(entry) => {
          if (entry?.url) {
            handleUploadSelect({ url: entry.url, urls: [...uploadedImageUrls, entry.url] });
            setUploadHistory((prev) => [
              { id: `draw-${Date.now()}`, name: isZh ? '手绘草图' : 'Drawing Sketch', url: entry.url, progress: 100 },
              ...prev,
            ]);
            toast.success(isZh ? '已添加绘制图像为参考图并切换至图生图' : 'Drawing added as reference image (Image-to-Image enabled)');
          }
        }}
      />

      {/* ── Fullscreen Image Preview Modal ── */}
      {fullscreenUrl && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/95 backdrop-blur-sm animate-fade-in"
          onClick={() => setFullscreenUrl(null)}
        >
          <button
            type="button"
            className="absolute top-6 right-6 p-3 bg-white/10 hover:bg-white/20 rounded-full text-white transition-colors border border-white/10 cursor-pointer"
            onClick={(e) => {
              e.stopPropagation();
              setFullscreenUrl(null);
            }}
          >
            <svg
              width="24"
              height="24"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={fullscreenUrl}
            alt="Preview"
            className="max-h-[90vh] max-w-[90vw] object-contain rounded-xl shadow-elevation-4"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}
    </>
  );
});

export default HomeStudioPromptComposer;
