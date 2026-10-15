'use client';

import { useState } from 'react';

const GROUPS = [
  { id: 'image', label: '图片', defaultKey: 'imageModelId' },
  { id: 'video', label: '视频', defaultKey: 'videoModelId' },
  { id: 'text', label: '文本', defaultKey: 'textModelId' },
  { id: 'audio', label: '音频与音乐', defaultKey: 'audioModelId' },
];
const VOICES = ['alloy', 'ash', 'ballad', 'coral', 'echo', 'fable', 'nova', 'onyx', 'sage', 'shimmer', 'verse', 'marin', 'cedar'];
const FORMATS = ['mp3', 'wav', 'opus', 'aac', 'flac', 'pcm'];
const fieldBase = 'h-10 w-full border border-line bg-well px-3 text-body text-ink outline-none focus-visible:ring-2 focus-visible:ring-brand-ring disabled:opacity-50';
const inputClass = `${fieldBase} rounded-xl`;
const selectClass = `${fieldBase} rounded-lg`;

function initialState(initialConfig, candidates) {
  const mountedModelIds = Object.fromEntries(GROUPS.map(({ id }) => [id,
    initialConfig
      ? initialConfig.mountedModelIds[id].filter((modelId) => candidates.some((model) => model.id === modelId && model.capability === id))
      : candidates.filter((model) => model.capability === id).map((model) => model.id),
  ]));
  const defaults = {
    imageModelId: '', videoModelId: '', textModelId: '', audioModelId: '',
    canvasImageCount: '3', audioVoice: 'alloy', audioFormat: 'mp3', audioSpeed: '1',
    audioInstructions: '', systemPrompt: '', ...initialConfig?.defaults,
  };
  for (const group of GROUPS) {
    if (!mountedModelIds[group.id].includes(defaults[group.defaultKey])) defaults[group.defaultKey] = mountedModelIds[group.id][0] || '';
  }
  return { mountedModelIds, defaults };
}

export default function CanvasConfigClient({ initialConfig, candidates, canWrite }) {
  const [draft, setDraft] = useState(() => initialState(initialConfig, candidates));
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState('');
  const [feedbackError, setFeedbackError] = useState(false);
  const [saved, setSaved] = useState(Boolean(initialConfig));
  const [search, setSearch] = useState({ image: '', video: '', text: '', audio: '' });

  const setDefault = (key, value) => setDraft((current) => ({ ...current, defaults: { ...current.defaults, [key]: value } }));
  const toggleModel = (group, id) => setDraft((current) => {
    const selected = current.mountedModelIds[group.id];
    const next = selected.includes(id) ? selected.filter((value) => value !== id) : [...selected, id];
    const defaults = { ...current.defaults };
    if (!next.includes(defaults[group.defaultKey])) defaults[group.defaultKey] = next[0] || '';
    return { mountedModelIds: { ...current.mountedModelIds, [group.id]: next }, defaults };
  });

  const save = async (event) => {
    event.preventDefault();
    setSaving(true);
    setFeedback('');
    setFeedbackError(false);
    try {
      const response = await fetch('/api/admin/canvas/config', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', 'Idempotency-Key': crypto.randomUUID() },
        body: JSON.stringify(draft),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload?.error?.message || '保存失败');
      setSaved(true);
      setFeedback('已保存并写入审计。新打开或刷新画布后生效。');
    } catch (error) {
      setFeedbackError(true);
      setFeedback(error instanceof Error ? error.message : '保存失败');
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={save} className="space-y-6">
      <div className="rounded-xl border border-line bg-surface p-4 text-label text-ink-muted">
        {saved ? '当前是已保存的平台配置。' : '尚未保存平台配置；画布暂沿用现有模型目录。'}
        {' '}挂载不改变模型上架、渠道、报价或真实可用状态。
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        {GROUPS.map((group) => {
          const models = candidates.filter((model) => model.capability === group.id);
          const query = search[group.id].trim().toLocaleLowerCase();
          const visibleModels = query ? models.filter((model) => `${model.name} ${model.id}`.toLocaleLowerCase().includes(query)) : models;
          const selected = draft.mountedModelIds[group.id];
          return (
            <section key={group.id} className="rounded-2xl border border-line bg-surface p-5 shadow-elevation-2">
              <div className="mb-4 flex items-baseline justify-between gap-3">
                <h2 className="text-section-title text-ink">{group.label}模型挂载</h2>
                <span className="text-label text-ink-muted">已挂载 {selected.length} / {models.length}</span>
              </div>
              {models.length > 8 && <input type="search" value={search[group.id]} onChange={(event) => setSearch((current) => ({ ...current, [group.id]: event.target.value }))} placeholder={`搜索${group.label}模型或 ID`} aria-label={`搜索${group.label}模型`} className={`${inputClass} mb-3`} />}
              {models.length ? (
                <div className="max-h-64 space-y-1 overflow-y-auto pr-1">
                  {visibleModels.map((model) => (
                    <label key={model.id} className="flex min-h-10 cursor-pointer items-center gap-3 rounded-lg px-2 text-body text-ink hover:bg-wash focus-within:ring-2 focus-within:ring-brand-ring">
                      <input type="checkbox" checked={selected.includes(model.id)} disabled={!canWrite} onChange={() => toggleModel(group, model.id)} className="size-4 accent-brand" />
                      <span className="min-w-0 flex-1 truncate">{model.name}</span>
                      <span className="shrink-0 text-label text-ink-muted">{model.credits} 积分</span>
                    </label>
                  ))}
                  {!visibleModels.length && <p className="py-4 text-body text-ink-muted">没有匹配的模型。</p>}
                </div>
              ) : <p className="py-4 text-body text-ink-muted">当前没有符合上架、定价和渠道条件的模型。</p>}
              <label className="mt-5 block text-label text-ink-muted" htmlFor={`default-${group.id}`}>默认{group.label}模型</label>
              <select id={`default-${group.id}`} value={draft.defaults[group.defaultKey]} disabled={!canWrite || !selected.length} onChange={(event) => setDefault(group.defaultKey, event.target.value)} className={`${selectClass} mt-2`}>
                {!selected.length && <option value="">未设置</option>}
                {models.filter((model) => selected.includes(model.id)).map((model) => <option key={model.id} value={model.id}>{model.name}</option>)}
              </select>
            </section>
          );
        })}
      </div>

      <section className="rounded-2xl border border-line bg-surface p-5 shadow-elevation-2">
        <h2 className="text-section-title text-ink">生成偏好默认值</h2>
        <p className="mt-1 text-body text-ink-muted">与画布偏好设置对应，用户进入后可在本次会话自行调整。</p>
        <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <Field label="画布默认生图张数"><input type="number" min="1" max="15" required disabled={!canWrite} value={draft.defaults.canvasImageCount} onChange={(event) => setDefault('canvasImageCount', event.target.value)} className={inputClass} /></Field>
          <Field label="默认音频声音"><select disabled={!canWrite} value={draft.defaults.audioVoice} onChange={(event) => setDefault('audioVoice', event.target.value)} className={selectClass}>{VOICES.map((voice) => <option key={voice} value={voice}>{voice}</option>)}</select></Field>
          <Field label="默认音频格式"><select disabled={!canWrite} value={draft.defaults.audioFormat} onChange={(event) => setDefault('audioFormat', event.target.value)} className={selectClass}>{FORMATS.map((format) => <option key={format} value={format}>{format.toUpperCase()}</option>)}</select></Field>
          <Field label="默认音频语速"><input type="number" min="0.25" max="4" step="0.05" required disabled={!canWrite} value={draft.defaults.audioSpeed} onChange={(event) => setDefault('audioSpeed', event.target.value)} className={inputClass} /></Field>
        </div>
        <div className="mt-4 grid gap-4">
          <Field label="默认音频指令"><textarea rows={2} disabled={!canWrite} value={draft.defaults.audioInstructions} onChange={(event) => setDefault('audioInstructions', event.target.value)} className={`${inputClass} h-auto py-3`} /></Field>
          <Field label="系统提示词"><textarea rows={4} disabled={!canWrite} value={draft.defaults.systemPrompt} onChange={(event) => setDefault('systemPrompt', event.target.value)} className={`${inputClass} h-auto py-3`} /></Field>
        </div>
      </section>

      <div className="flex flex-wrap items-center justify-end gap-4">
        {feedback && <p role={feedbackError ? 'alert' : 'status'} className={`text-body ${feedbackError ? 'text-danger' : 'text-success'}`}>{feedback}</p>}
        {canWrite && <button type="submit" disabled={saving} className="min-h-10 rounded-lg bg-brand px-6 text-body font-semibold text-ink-on-accent hover:bg-brand-hover active:bg-brand-active focus-visible:ring-2 focus-visible:ring-brand-ring disabled:opacity-50">{saving ? '保存中…' : '保存画布配置'}</button>}
      </div>
    </form>
  );
}

function Field({ label, children }) {
  return <label className="grid gap-2 text-label text-ink-muted">{label}{children}</label>;
}
