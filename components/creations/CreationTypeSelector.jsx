'use client';

/**
 * 创作类型选择器 — 类 Dreamina 风格。
 *
 * 用户选择生成类型（图像/视频/音乐/工作流），
 * 类型切换后加载该类型的可用模型列表。
 * 工作流类型点击后跳转到已有 /workflow 页面。
 */

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Image, Video, Music, Workflow, Sparkles, Loader2, ChevronDown } from 'lucide-react';

const CREATION_TYPES = [
  { id: 'image', label: '图像', icon: Image, color: 'bg-blue-500/10 text-blue-400 border-blue-500/25 hover:bg-blue-500/15', activeColor: 'bg-blue-500/20 text-blue-300 border-blue-500/40 ring-1 ring-blue-500/30' },
  { id: 'video', label: '视频', icon: Video, color: 'bg-purple-500/10 text-purple-400 border-purple-500/25 hover:bg-purple-500/15', activeColor: 'bg-purple-500/20 text-purple-300 border-purple-500/40 ring-1 ring-purple-500/30' },
  { id: 'audio', label: '音乐', icon: Music, color: 'bg-orange-500/10 text-orange-400 border-orange-500/25 hover:bg-orange-500/15', activeColor: 'bg-orange-500/20 text-orange-300 border-orange-500/40 ring-1 ring-orange-500/30' },
  { id: 'workflow', label: '工作流', icon: Workflow, color: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/25 hover:bg-emerald-500/15', activeColor: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40 ring-1 ring-emerald-500/30', href: '/workflow' },
];

export default function CreationTypeSelector({ activeType = 'image', onTypeChange, onModelSelect }) {
  const router = useRouter();
  const [selectedType, setSelectedType] = useState(activeType);
  const [models, setModels] = useState([]);
  const [selectedModel, setSelectedModel] = useState(null);
  const [loading, setLoading] = useState(false);

  const fetchModels = useCallback(async (type) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/app/models/available?type=${type}`);
      const data = await res.json();
      if (res.ok && data.data?.models) {
        setModels(data.data.models);
        // 自动选择推荐模型或第一个
        const recommended = data.data.models.find((m) => m.recommended) || data.data.models[0];
        if (recommended) {
          setSelectedModel(recommended);
          onModelSelect?.(recommended);
        }
      } else {
        setModels([]);
      }
    } catch {
      setModels([]);
    } finally {
      setLoading(false);
    }
  }, [onModelSelect]);

  useEffect(() => {
    if (selectedType && selectedType !== 'workflow') {
      fetchModels(selectedType);
    }
  }, [selectedType, fetchModels]);

  const handleTypeChange = (type) => {
    // 工作流跳转到独立页面
    if (type.href) {
      router.push(type.href);
      return;
    }
    setSelectedType(type.id);
    setSelectedModel(null);
    onTypeChange?.(type.id);
  };

  const handleModelSelect = (model) => {
    setSelectedModel(model);
    onModelSelect?.(model);
  };

  return (
    <div className="space-y-4">
      {/* 类型切换 Tab */}
      <div className="flex gap-2">
        {CREATION_TYPES.map((type) => {
          const Icon = type.icon;
          const isActive = selectedType === type.id;
          return (
            <button
              key={type.id}
              onClick={() => handleTypeChange(type)}
              className={`flex items-center gap-2 rounded-xl border px-4 py-2.5 text-sm font-medium transition-all duration-200 active:scale-[0.97] ${
                isActive ? type.activeColor : type.color
              }`}
            >
              <Icon className="size-4" />
              {type.label}
            </button>
          );
        })}
      </div>

      {/* 模型选择器 */}
      {selectedType !== 'workflow' && (
        <div className="rounded-2xl border border-white/[0.08] bg-white/[0.02] p-4">
          {loading ? (
            <div className="flex items-center justify-center py-6 text-sm text-gray-400">
              <Loader2 className="mr-2 size-4 animate-spin" />
              加载可用模型...
            </div>
          ) : models.length === 0 ? (
            <p className="text-center py-6 text-sm text-gray-500">暂无可用的{CREATION_TYPES.find((t) => t.id === selectedType)?.label}模型</p>
          ) : (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
              {models.map((model) => (
                <button
                  key={model.id}
                  onClick={() => handleModelSelect(model)}
                  className={`group relative flex flex-col items-start rounded-xl border p-3.5 text-left transition-all duration-200 active:scale-[0.97] ${
                    selectedModel?.id === model.id
                      ? 'border-cyan-500/40 bg-cyan-500/10 ring-1 ring-cyan-500/25'
                      : 'border-white/[0.08] bg-white/[0.02] hover:border-white/[0.16] hover:bg-white/[0.04]'
                  }`}
                >
                  {model.recommended && (
                    <span className="absolute -top-1.5 right-2 flex items-center gap-1 rounded-full bg-cyan-500/20 px-2 py-0.5 text-[10px] font-medium text-cyan-300 border border-cyan-500/30">
                      <Sparkles className="size-2.5" />
                      推荐
                    </span>
                  )}
                  <span className="text-sm font-semibold text-white">{model.displayName || model.name}</span>
                  <span className="mt-1 text-[11px] text-gray-400 leading-4 line-clamp-2">{model.description || ''}</span>
                  <div className="mt-2 flex flex-wrap gap-1">
                    {(model.tags || []).slice(0, 3).map((tag) => (
                      <span key={tag} className="rounded-full bg-white/[0.06] px-2 py-0.5 text-[10px] text-gray-400">
                        {tag}
                      </span>
                    ))}
                  </div>
                  <div className="mt-2.5 flex items-center gap-1.5 text-xs">
                    {model.quoteRequired === false
                      && Number.isFinite(Number(model.credits))
                      && Number(model.credits) > 0 ? (
                        <>
                          <span className="font-mono font-bold text-cyan-400">{Number(model.credits)}</span>
                          <span className="text-gray-500">积分/次</span>
                        </>
                      ) : (
                        <span className="text-gray-400">生成前确认报价</span>
                      )}
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
