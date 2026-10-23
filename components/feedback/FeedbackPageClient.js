'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import {
  AlertCircle,
  ArrowUpRight,
  CheckCircle2,
  Clock3,
  Coins,
  FileText,
  Film,
  ImageIcon,
  Music,
  Paperclip,
  RefreshCw,
  Send,
  UploadCloud,
  X,
} from 'lucide-react';
import StudioHeader from '@/components/site/StudioHeader';
import { SpatialBackground } from '@/components/spatial';
import AuthModal from '@/components/AuthModal';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { useUserSession } from '@/lib/hooks/useUserSession';
import {
  DEFAULT_FEEDBACK_SUPPORT_EMAIL,
  FEEDBACK_GITHUB_ISSUES_URL,
  FEEDBACK_KINDS,
  FEEDBACK_STATUS_LABELS,
  findFeedbackKind,
} from '@/lib/feedback/catalog';
import {
  FEEDBACK_ATTACHMENT_ACCEPT,
  FEEDBACK_ATTACHMENT_MAX_FILES,
  FEEDBACK_ATTACHMENT_MAX_TOTAL_BYTES,
  formatFeedbackBytes,
  getFeedbackAttachmentKind,
  normalizeGithubUrl,
  validateFeedbackAttachments,
} from '@/lib/feedback/attachments';

/**
 * 专为反馈中心定制的可爱 Emo 鸭鸭吉祥物（矢量 SVG，免外链加载，支持情感表情切换）
 * 对应用户截图中右下角标志性的下垂眼/丧萌 Emo 鸭鸭
 */
function EmoDuck({ mood = 'emo', className = 'size-10' }) {
  return (
    <svg
      viewBox="0 0 80 80"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-hidden="true"
    >
      {/* 头部黄色底色 */}
      <circle cx="40" cy="44" r="33" fill="#FFCF25" />

      {/* 头顶可爱呆毛 */}
      <path d="M40 11 C39 5 35 2 33 2 C33 6 36 9 38 12 Z" fill="#FFB703" />
      <path d="M40 11 C42 5 46 3 48 4 C47 8 44 10 41 12 Z" fill="#FFCE20" />

      {/* 脸颊自然腮红 */}
      <ellipse cx="17" cy="47" rx="6.5" ry="4" fill="#FF8A3D" opacity="0.45" />
      <ellipse cx="63" cy="47" rx="6.5" ry="4" fill="#FF8A3D" opacity="0.45" />

      {/* 情绪眼睛 */}
      {mood === 'emo' && (
        <g stroke="#1F2328" strokeWidth="3.2" strokeLinecap="round">
          {/* 下垂斜线/委屈丧气眼（我 emo 了） */}
          <path d="M22 36 L34 40" />
          <path d="M58 36 L46 40" />
          {/* 呆萌下眼睑线 */}
          <path d="M25 41 Q28 43 32 41" strokeWidth="2.2" />
          <path d="M55 41 Q52 43 48 41" strokeWidth="2.2" />
        </g>
      )}

      {mood === 'idea' && (
        <g fill="#1F2328">
          {/* 睁大好奇探索眼 */}
          <circle cx="28" cy="37" r="4.5" />
          <circle cx="52" cy="37" r="4.5" />
          <circle cx="30" cy="35" r="1.8" fill="#FFFFFF" />
          <circle cx="54" cy="35" r="1.8" fill="#FFFFFF" />
        </g>
      )}

      {mood === 'security' && (
        <g stroke="#1F2328" strokeWidth="3.2" strokeLinecap="round">
          {/* 警惕专注横眼 */}
          <path d="M22 38 L34 38" />
          <path d="M46 38 L58 38" />
        </g>
      )}

      {mood === 'happy' && (
        <g stroke="#1F2328" strokeWidth="3.2" strokeLinecap="round" fill="none">
          {/* 欢快弯月笑眼 */}
          <path d="M22 40 Q28 32 34 40" />
          <path d="M46 40 Q52 32 58 40" />
        </g>
      )}

      {/* 扁平饱满的橘黄色鸭嘴 */}
      <path
        d="M26 47 C26 43 32 41 40 41 C48 41 54 43 54 47 C54 53 48 57 40 57 C32 57 26 53 26 47 Z"
        fill="#FF7A1A"
      />
      {/* 嘴部立体阴影弧度 */}
      <path d="M31 52 C35 55 45 55 49 52 C46 55.5 34 55.5 31 52 Z" fill="#E05B00" />
      {/* 鼻孔微圆点 */}
      <circle cx="37" cy="45" r="1.2" fill="#D65100" />
      <circle cx="43" cy="45" r="1.2" fill="#D65100" />
    </svg>
  );
}

// 反馈类型配置：精炼文字，大面积使用 Emo 图标
const FEEDBACK_KINDS_META = [
  {
    id: 'bug_report',
    emo: '🐛',
    title: '网站报错',
    sub: '异常崩溃 · 功能失效',
    reward: 2,
    mood: 'emo',
  },
  {
    id: 'improvement',
    emo: '💡',
    title: '体验建议',
    sub: '交互优化 · 功能脑洞',
    reward: 5,
    mood: 'idea',
  },
  {
    id: 'security',
    emo: '🛡️',
    title: '安全漏洞',
    sub: '合规排查 · 风险预警',
    reward: 20,
    mood: 'security',
  },
];

// 快捷 Emo 话题标签（一键填入标题，降低输入负担）
const QUICK_EMO_TOPICS = [
  { emo: '😵‍💫', label: '页面卡顿/白屏', kind: 'bug_report', prefill: '【页面卡顿】访问页面时出现白屏或响应缓慢' },
  { emo: '🖼️', label: '生图失败报错', kind: 'bug_report', prefill: '【生图异常】生成图片时报错无法产出结果' },
  { emo: '🎬', label: '视频渲染超时', kind: 'bug_report', prefill: '【视频渲染】任务卡在排队进度或渲染超时' },
  { emo: '🎵', label: '音频合成无声', kind: 'bug_report', prefill: '【音频问题】生成的音频文件无法播放或无声' },
  { emo: '💳', label: '充值与额度', kind: 'improvement', prefill: '【额度问题】充值或订阅后额度显示未及时同步' },
  { emo: '✨', label: '期待新功能', kind: 'improvement', prefill: '【功能建议】希望能支持这个创作功能：' },
];

function formatTime(value) {
  if (!value) return '';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleDateString('zh-CN');
}

function AttachmentIcon({ kind }) {
  if (kind === 'image') return <ImageIcon className="size-4 text-brand" />;
  if (kind === 'video') return <Film className="size-4 text-brand" />;
  if (kind === 'audio') return <Music className="size-4 text-brand" />;
  return <FileText className="size-4 text-brand" />;
}

export default function FeedbackPageClient({ supportEmail = DEFAULT_FEEDBACK_SUPPORT_EMAIL }) {
  const { user, mutate } = useUserSession();
  const [activeTab, setActiveTab] = useState('new'); // 'new' | 'mine'
  const [kind, setKind] = useState(FEEDBACK_KINDS[0].id);
  const [title, setTitle] = useState('');
  const [pageUrl, setPageUrl] = useState('');
  const [githubUrl, setGithubUrl] = useState('');
  const [detail, setDetail] = useState('');
  const [attachments, setAttachments] = useState([]);
  const [fieldErrors, setFieldErrors] = useState({});
  const [message, setMessage] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [showAuthModal, setShowAuthModal] = useState(false);

  const [items, setItems] = useState([]);
  const [itemsLoading, setItemsLoading] = useState(false);

  const inputRef = useRef(null);
  const attachmentsRef = useRef([]);
  const fileIdRef = useRef(0);

  const currentMeta = FEEDBACK_KINDS_META.find((item) => item.id === kind) || FEEDBACK_KINDS_META[0];

  const loadMine = useCallback(async () => {
    if (!user) {
      setItems([]);
      return;
    }
    setItemsLoading(true);
    try {
      const res = await fetch('/api/feedback', { cache: 'no-store' });
      if (res.ok) {
        const data = await res.json();
        setItems(Array.isArray(data.items) ? data.items : []);
      }
    } catch {
      // 保持静默
    } finally {
      setItemsLoading(false);
    }
  }, [user]);

  useEffect(() => {
    if (user) {
      loadMine();
    }
  }, [user, loadMine]);

  useEffect(() => {
    attachmentsRef.current = attachments;
  }, [attachments]);

  useEffect(
    () => () => {
      attachmentsRef.current.forEach((item) => {
        if (item.previewUrl) URL.revokeObjectURL(item.previewUrl);
      });
    },
    [],
  );

  function addFiles(incoming) {
    const list = Array.from(incoming || []);
    if (list.length === 0) return;

    const combined = [...attachments.map((item) => item.file), ...list];
    const check = validateFeedbackAttachments(combined);
    if (check.error) {
      setFieldErrors((prev) => ({ ...prev, attachments: check.error }));
      return;
    }

    const next = list.map((file) => ({
      id: `attachment-${Date.now()}-${fileIdRef.current++}`,
      file,
      kind: getFeedbackAttachmentKind(file.name, file.type),
      previewUrl: String(file.type || '').startsWith('image/') ? URL.createObjectURL(file) : null,
    }));
    setAttachments((prev) => [...prev, ...next]);
    setFieldErrors((prev) => ({ ...prev, attachments: undefined }));
    setMessage(null);
  }

  function removeAttachment(id) {
    setAttachments((prev) => {
      const target = prev.find((item) => item.id === id);
      if (target?.previewUrl) URL.revokeObjectURL(target.previewUrl);
      return prev.filter((item) => item.id !== id);
    });
    setFieldErrors((prev) => ({ ...prev, attachments: undefined }));
  }

  function clearAttachments() {
    attachments.forEach((item) => {
      if (item.previewUrl) URL.revokeObjectURL(item.previewUrl);
    });
    setAttachments([]);
  }

  function applyQuickTopic(topic) {
    setKind(topic.kind);
    if (!title.trim() || QUICK_EMO_TOPICS.some((t) => t.prefill === title.trim())) {
      setTitle(topic.prefill);
      if (fieldErrors.title) setFieldErrors((prev) => ({ ...prev, title: undefined }));
    }
  }

  function validateForm() {
    const errors = {};
    if (title.trim().length < 5) errors.title = '标题不少于 5 个字 🏷️';
    if (detail.trim().length < 20) errors.detail = '详细说明不少于 20 个字，写清步骤方便定位 📝';
    const github = normalizeGithubUrl(githubUrl);
    if (github.error) errors.githubUrl = github.error;
    const files = validateFeedbackAttachments(attachments.map((item) => item.file));
    if (files.error) errors.attachments = files.error;
    setFieldErrors(errors);
    return Object.keys(errors).length === 0;
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setMessage(null);

    if (!user) {
      setShowAuthModal(true);
      return;
    }
    if (!validateForm()) return;

    setSubmitting(true);
    try {
      const formData = new FormData();
      formData.append('kind', kind);
      formData.append('title', title.trim());
      formData.append('pageUrl', pageUrl.trim());
      formData.append('githubUrl', githubUrl.trim());
      formData.append('detail', detail.trim());
      attachments.forEach((item) => formData.append('attachments', item.file, item.file.name));

      const res = await fetch('/api/feedback', { method: 'POST', body: formData });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setMessage({ tone: 'error', text: data.error || '提交失败，请稍后重试' });
        return;
      }

      setMessage({
        tone: 'success',
        text: '提交成功！审核采纳后硬币将自动发放到账户 🎉',
      });
      setTitle('');
      setPageUrl('');
      setGithubUrl('');
      setDetail('');
      clearAttachments();
      setFieldErrors({});
      await loadMine();
    } catch {
      setMessage({ tone: 'error', text: '网络异常，提交未送达，请稍后重试 ⚠️' });
    } finally {
      setSubmitting(false);
    }
  }

  const totalAttachmentBytes = attachments.reduce((sum, item) => sum + Number(item.file.size || 0), 0);

  return (
    <div className="relative min-h-screen bg-canvas text-ink selection:bg-brand selection:text-white flex flex-col justify-between overflow-x-hidden">
      {/* 1. 与首页完全一致的空间极光背景与工程点阵 */}
      <SpatialBackground variant="studio" />
      <div className="absolute inset-0 bg-dot-grid opacity-40 pointer-events-none z-0" />

      {/* 2. 统一顶栏（无冗余大面积副标题） */}
      <StudioHeader activeTab={null} className="relative z-40" />

      {/* 3. 页面主体（居中轻量工作台卡片，去除冗余文案） */}
      <main className="relative z-10 mx-auto w-full max-w-4xl flex-1 px-4 py-8 sm:px-6">
        {/* 精简 Hero 标题与 Emo 吉祥物 */}
        <div className="mb-6 flex flex-col items-center text-center">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-brand-line bg-brand-soft px-3 py-1 text-caption font-semibold text-brand shadow-elevation-1">
            <span>✨</span>
            <span>建议与需求中心</span>
          </span>
          <h1 className="mt-3 flex items-center justify-center gap-2.5 text-display font-bold tracking-tight text-ink">
            <EmoDuck mood={message?.tone === 'success' ? 'happy' : currentMeta.mood} className="size-9 shrink-0 drop-shadow-md" />
            <span>遇到问题，随时告诉我们</span>
          </h1>
          <p className="mt-1.5 text-body-sm text-ink-muted">
            轻量反馈 · 采纳即获硬币奖励 🪙
          </p>

          {/* 胶囊分段导航：提反馈 / 我的提交 */}
          <div className="mt-6">
            <Tabs value={activeTab} onValueChange={setActiveTab} className="items-center">
              <TabsList className="bg-well/80 border border-line-subtle shadow-elevation-1">
                <TabsTrigger value="new" className="gap-1.5">
                  <span>✍️</span>
                  <span>提个反馈</span>
                </TabsTrigger>
                <TabsTrigger value="mine" className="gap-1.5">
                  <span>📋</span>
                  <span>我的提交</span>
                  {items.length > 0 && (
                    <span className="ml-1 rounded-full bg-brand-soft px-1.5 py-0.2 text-micro font-semibold text-brand">
                      {items.length}
                    </span>
                  )}
                </TabsTrigger>
              </TabsList>

              {/* TAB 1: 提个反馈表单 */}
              <TabsContent value="new" className="w-full mt-4">
                <div className="relative overflow-hidden rounded-2xl border border-line-subtle bg-surface-glass backdrop-blur-xl p-5 shadow-elevation-2 sm:p-7 text-left">
                  {/* 背景微光 */}
                  <div className="pointer-events-none absolute -right-20 -top-24 size-60 rounded-full bg-brand-soft blur-3xl opacity-60" aria-hidden="true" />

                  <form onSubmit={handleSubmit} className="space-y-5" noValidate>
                    {/* 未登录提醒卡 */}
                    {!user && (
                      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-brand-line bg-brand-soft px-4 py-3">
                        <span className="flex items-center gap-2 text-body-sm text-ink font-medium">
                          <span>🔒</span>
                          <span>登录后提交，审核采纳的硬币将自动存入你的账户</span>
                        </span>
                        <Button type="button" size="sm" variant="primary" onClick={() => setShowAuthModal(true)}>
                          一键登录
                        </Button>
                      </div>
                    )}

                    {/* 反馈类型 Emo 选项卡 */}
                    <div className="space-y-2">
                      <label className="text-label font-medium text-ink flex items-center gap-1.5">
                        <span>🎭</span>
                        <span>反馈类型</span>
                        <span className="text-danger">*</span>
                      </label>
                      <div className="grid gap-2.5 sm:grid-cols-3">
                        {FEEDBACK_KINDS_META.map((item) => {
                          const selected = kind === item.id;
                          return (
                            <button
                              key={item.id}
                              type="button"
                              onClick={() => {
                                setKind(item.id);
                                setMessage(null);
                              }}
                              className={`flex cursor-pointer flex-col rounded-xl border p-3.5 text-left transition-all duration-fast active:scale-[0.98] ${
                                selected
                                  ? 'border-brand-ring bg-brand-soft shadow-elevation-1'
                                  : 'border-line bg-well/70 hover:border-line-strong hover:bg-wash'
                              }`}
                            >
                              <div className="flex items-center justify-between">
                                <span className="flex items-center gap-2 text-body-sm font-semibold text-ink">
                                  <span className="text-lg leading-none">{item.emo}</span>
                                  <span>{item.title}</span>
                                </span>
                                <span className="inline-flex items-center gap-0.5 rounded-full border border-brand-line bg-surface/80 px-2 py-0.5 text-micro font-semibold text-brand">
                                  <Coins className="size-3" />
                                  <span>+{item.reward} 币</span>
                                </span>
                              </div>
                              <span className="mt-1 text-micro text-ink-muted">{item.sub}</span>
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    {/* 快捷 Emo 话题药丸 */}
                    <div className="space-y-1.5">
                      <span className="text-micro font-medium text-ink-muted flex items-center gap-1">
                        <span>⚡</span>
                        <span>常见场景一键填入：</span>
                      </span>
                      <div className="flex flex-wrap gap-1.5">
                        {QUICK_EMO_TOPICS.map((topic) => (
                          <button
                            key={topic.label}
                            type="button"
                            onClick={() => applyQuickTopic(topic)}
                            className="inline-flex items-center gap-1 rounded-full border border-line bg-well/80 px-2.5 py-1 text-micro text-ink-muted transition-colors hover:border-brand-line hover:bg-wash hover:text-ink cursor-pointer"
                          >
                            <span>{topic.emo}</span>
                            <span>{topic.label}</span>
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* 标题输入 */}
                    <div className="space-y-1.5">
                      <label htmlFor="feedback-title" className="text-label font-medium text-ink flex items-center gap-1.5">
                        <span>🏷️</span>
                        <span>标题</span>
                        <span className="text-danger">*</span>
                      </label>
                      <Input
                        id="feedback-title"
                        value={title}
                        onChange={(event) => {
                          setTitle(event.target.value);
                          if (fieldErrors.title) setFieldErrors((prev) => ({ ...prev, title: undefined }));
                        }}
                        maxLength={200}
                        placeholder="一句话说明问题或灵感（不少于 5 个字）"
                        aria-required="true"
                        error={Boolean(fieldErrors.title)}
                        className="rounded-xl bg-well/70 border-line hover:border-line-strong focus:border-brand-line"
                      />
                      {fieldErrors.title && (
                        <p className="text-caption text-danger flex items-center gap-1" role="alert">
                          <span>⚠️</span>
                          <span>{fieldErrors.title}</span>
                        </p>
                      )}
                    </div>

                    {/* 选填信息：涉及页面 & GitHub Issue */}
                    <div className="grid gap-3 sm:grid-cols-2">
                      <div className="space-y-1.5">
                        <label htmlFor="feedback-page" className="text-label font-medium text-ink flex items-center gap-1.5">
                          <span>🔗</span>
                          <span>涉及页面（选填）</span>
                        </label>
                        <Input
                          id="feedback-page"
                          value={pageUrl}
                          onChange={(event) => setPageUrl(event.target.value)}
                          maxLength={500}
                          placeholder="/studio 或具体地址"
                          className="rounded-xl bg-well/70 font-mono text-body-sm border-line hover:border-line-strong focus:border-brand-line"
                        />
                      </div>

                      <div className="space-y-1.5">
                        <label htmlFor="feedback-github" className="text-label font-medium text-ink flex items-center gap-1.5">
                          <span>🐙</span>
                          <span>GitHub Issue（选填）</span>
                        </label>
                        <Input
                          id="feedback-github"
                          type="url"
                          value={githubUrl}
                          onChange={(event) => {
                            setGithubUrl(event.target.value);
                            if (fieldErrors.githubUrl) setFieldErrors((prev) => ({ ...prev, githubUrl: undefined }));
                          }}
                          maxLength={500}
                          placeholder="https://github.com/..."
                          error={Boolean(fieldErrors.githubUrl)}
                          className="rounded-xl bg-well/70 text-body-sm border-line hover:border-line-strong focus:border-brand-line"
                        />
                        {fieldErrors.githubUrl && (
                          <p className="text-caption text-danger flex items-center gap-1" role="alert">
                            <span>⚠️</span>
                            <span>{fieldErrors.githubUrl}</span>
                          </p>
                        )}
                      </div>
                    </div>

                    {/* 详细描述 */}
                    <div className="space-y-1.5">
                      <label htmlFor="feedback-detail" className="text-label font-medium text-ink flex items-center gap-1.5">
                        <span>📝</span>
                        <span>详细说明</span>
                        <span className="text-danger">*</span>
                      </label>
                      <Textarea
                        id="feedback-detail"
                        value={detail}
                        onChange={(event) => {
                          setDetail(event.target.value);
                          if (fieldErrors.detail) setFieldErrors((prev) => ({ ...prev, detail: undefined }));
                        }}
                        maxLength={4000}
                        rows={5}
                        placeholder="描述复现步骤、报错提示或你的改进建议（不少于 20 个字）…"
                        aria-required="true"
                        error={Boolean(fieldErrors.detail)}
                        className="rounded-xl bg-well/70 border-line hover:border-line-strong focus:border-brand-line"
                      />
                      <div className="flex items-center justify-between text-caption text-ink-muted">
                        {fieldErrors.detail ? (
                          <span className="text-danger flex items-center gap-1" role="alert">
                            <span>⚠️</span>
                            <span>{fieldErrors.detail}</span>
                          </span>
                        ) : (
                          <span className="text-micro text-ink-muted flex items-center gap-1">
                            <span>💡</span>
                            <span>写清复现步骤，采纳拿币更快哦</span>
                          </span>
                        )}
                        <span className="tabular-nums text-micro">{detail.length} / 4000</span>
                      </div>
                    </div>

                    {/* 附件与媒体拖拽区（图文化，彻底去除大段说明文案） */}
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-label font-medium text-ink flex items-center gap-1.5">
                          <span>📸</span>
                          <span>截图与附件（选填）</span>
                        </span>
                        <span className="text-micro text-ink-muted">📦 ≤ 30MB · 最多 5 个</span>
                      </div>

                      <button
                        type="button"
                        onClick={() => inputRef.current?.click()}
                        onDragOver={(event) => {
                          event.preventDefault();
                          setDragging(true);
                        }}
                        onDragLeave={(event) => {
                          if (!event.currentTarget.contains(event.relatedTarget)) setDragging(false);
                        }}
                        onDrop={(event) => {
                          event.preventDefault();
                          setDragging(false);
                          addFiles(event.dataTransfer?.files);
                        }}
                        className={`flex w-full flex-col items-center justify-center gap-2 rounded-xl border border-dashed py-6 px-4 text-center transition-colors duration-fast cursor-pointer ${
                          dragging
                            ? 'border-brand-ring bg-brand-soft'
                            : 'border-line bg-well/50 hover:border-line-strong hover:bg-wash'
                        }`}
                      >
                        <span className="flex size-10 items-center justify-center rounded-xl border border-line bg-scrim text-brand">
                          <UploadCloud className="size-5" />
                        </span>
                        <span className="text-body-sm font-medium text-ink">拖拽或点击上传文件</span>
                        <div className="flex flex-wrap items-center justify-center gap-1.5 text-micro text-ink-muted">
                          <span className="inline-flex items-center gap-1 rounded-full border border-line bg-wash px-2 py-0.5">🖼️ 图片</span>
                          <span className="inline-flex items-center gap-1 rounded-full border border-line bg-wash px-2 py-0.5">🎥 视频</span>
                          <span className="inline-flex items-center gap-1 rounded-full border border-line bg-wash px-2 py-0.5">🎵 音频</span>
                          <span className="inline-flex items-center gap-1 rounded-full border border-line bg-wash px-2 py-0.5">📄 日志</span>
                        </div>
                      </button>

                      <input
                        ref={inputRef}
                        type="file"
                        multiple
                        accept={FEEDBACK_ATTACHMENT_ACCEPT}
                        tabIndex={-1}
                        aria-hidden="true"
                        className="sr-only"
                        onChange={(event) => {
                          addFiles(event.target.files);
                          event.target.value = '';
                        }}
                      />

                      {fieldErrors.attachments && (
                        <p className="text-caption text-danger flex items-center gap-1" role="alert">
                          <span>⚠️</span>
                          <span>{fieldErrors.attachments}</span>
                        </p>
                      )}

                      {/* 已选附件列表 */}
                      {attachments.length > 0 && (
                        <div className="space-y-2 pt-1">
                          <ul className="grid gap-2 sm:grid-cols-2">
                            {attachments.map((item) => (
                              <li key={item.id} className="flex items-center gap-2.5 rounded-xl border border-line bg-well p-2">
                                <span className="flex size-9 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-line bg-scrim">
                                  {item.previewUrl ? (
                                    <img src={item.previewUrl} alt="" className="size-full object-cover" />
                                  ) : (
                                    <AttachmentIcon kind={item.kind} />
                                  )}
                                </span>
                                <span className="min-w-0 flex-1">
                                  <span className="block truncate text-body-sm font-medium text-ink">{item.file.name}</span>
                                  <span className="block text-micro text-ink-muted">{formatFeedbackBytes(item.file.size)}</span>
                                </span>
                                <button
                                  type="button"
                                  onClick={() => removeAttachment(item.id)}
                                  aria-label={`移除附件 ${item.file.name}`}
                                  className="flex size-8 shrink-0 cursor-pointer items-center justify-center rounded-lg text-ink-muted hover:bg-wash hover:text-ink transition-colors"
                                >
                                  <X className="size-3.5" />
                                </button>
                              </li>
                            ))}
                          </ul>
                          <div className="text-right text-micro text-ink-muted tabular-nums">
                            已选 {attachments.length} 个 · {formatFeedbackBytes(totalAttachmentBytes)} / {formatFeedbackBytes(FEEDBACK_ATTACHMENT_MAX_TOTAL_BYTES)}
                          </div>
                        </div>
                      )}
                    </div>

                    {/* 提交按钮与状态 */}
                    <div className="pt-2 flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-t border-line-subtle">
                      <div className="flex items-center gap-3">
                        <Button
                          type="submit"
                          variant="primary"
                          size="md"
                          loading={submitting}
                          className="rounded-xl font-semibold gap-2 shadow-elevation-1 active:scale-[0.98]"
                        >
                          {!submitting && <span>🚀</span>}
                          <span>{submitting ? '提交中…' : user ? '提交审核' : '登录后提交'}</span>
                        </Button>

                        {message && (
                          <div
                            role={message.tone === 'error' ? 'alert' : 'status'}
                            className={`text-body-sm flex items-center gap-1.5 ${
                              message.tone === 'error' ? 'text-danger' : 'text-success'
                            }`}
                          >
                            <span>{message.tone === 'error' ? '⚠️' : '🎉'}</span>
                            <span>{message.text}</span>
                          </div>
                        )}
                      </div>

                      {/* 底部快捷通道胶囊 */}
                      <div className="flex flex-wrap items-center gap-2 text-caption text-ink-muted">
                        <a
                          href={`mailto:${supportEmail}`}
                          className="inline-flex items-center gap-1 rounded-full border border-line bg-well/70 px-2.5 py-1 text-micro text-ink-muted hover:border-brand-line hover:text-ink transition-colors"
                        >
                          <span>✉️</span>
                          <span>邮件直达</span>
                        </a>
                        <a
                          href={FEEDBACK_GITHUB_ISSUES_URL}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 rounded-full border border-line bg-well/70 px-2.5 py-1 text-micro text-ink-muted hover:border-brand-line hover:text-ink transition-colors"
                        >
                          <span>🐙</span>
                          <span>GitHub</span>
                        </a>
                        <Link
                          href="/benefits"
                          className="inline-flex items-center gap-1 rounded-full border border-line bg-well/70 px-2.5 py-1 text-micro text-brand hover:text-brand-hover transition-colors"
                        >
                          <span>🪙</span>
                          <span>硬币权益</span>
                        </Link>
                      </div>
                    </div>
                  </form>
                </div>
              </TabsContent>

              {/* TAB 2: 我的提交列表 */}
              <TabsContent value="mine" className="w-full mt-4">
                <div className="rounded-2xl border border-line-subtle bg-surface-glass backdrop-blur-xl p-5 shadow-elevation-2 sm:p-7 text-left">
                  <div className="flex items-center justify-between border-b border-line-subtle pb-4 mb-4">
                    <div className="flex items-center gap-2">
                      <span className="text-body font-semibold text-ink">我的历史提交</span>
                      <span className="text-micro text-ink-muted">（最近 20 条）</span>
                    </div>
                    {user && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={loadMine}
                        loading={itemsLoading}
                        className="rounded-full gap-1 text-ink-muted hover:text-ink"
                      >
                        <RefreshCw className="size-3.5" />
                        <span>刷新</span>
                      </Button>
                    )}
                  </div>

                  {!user ? (
                    <div className="flex flex-col items-center justify-center py-10 text-center">
                      <EmoDuck mood="emo" className="size-16 mb-3 drop-shadow" />
                      <p className="text-body-sm font-semibold text-ink">登录后即可同步你的反馈记录</p>
                      <p className="mt-1 text-caption text-ink-muted">审核通过后，硬币会自动累加到账户额度中 🪙</p>
                      <Button type="button" variant="primary" size="sm" onClick={() => setShowAuthModal(true)} className="mt-4 rounded-xl">
                        立即登录
                      </Button>
                    </div>
                  ) : itemsLoading && items.length === 0 ? (
                    <div className="py-12 text-center text-body-sm text-ink-muted flex items-center justify-center gap-2">
                      <RefreshCw className="size-4 animate-spin text-brand" />
                      <span>正在加载反馈记录…</span>
                    </div>
                  ) : items.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-12 text-center">
                      <EmoDuck mood="emo" className="size-20 mb-3 drop-shadow" />
                      <p className="text-body font-semibold text-ink">还没有提交过反馈呢 ~</p>
                      <p className="mt-1 text-caption text-ink-muted">遇到 Bug、卡顿或有新脑洞，随时来吐槽！</p>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => setActiveTab('new')}
                        className="mt-4 rounded-full gap-1.5"
                      >
                        <span>✍️</span>
                        <span>提第一条反馈</span>
                      </Button>
                    </div>
                  ) : (
                    <ul className="space-y-3">
                      {items.map((item) => {
                        const kindMeta = FEEDBACK_KINDS_META.find((k) => k.id === item.kind);
                        const isAccepted = item.status === 'accepted';
                        const isRejected = item.status === 'rejected';

                        return (
                          <li
                            key={item.id}
                            className="rounded-xl border border-line bg-well/70 p-4 transition-colors hover:border-line-strong space-y-2.5"
                          >
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <div className="flex flex-wrap items-center gap-2">
                                <span className="inline-flex items-center gap-1 rounded-full border border-line bg-wash px-2 py-0.5 text-micro font-medium text-ink-muted">
                                  <span>{kindMeta?.emo || '💬'}</span>
                                  <span>{kindMeta?.title || item.kind}</span>
                                </span>
                                <span className="text-body-sm font-semibold text-ink">{item.title}</span>
                              </div>

                              <div className="flex items-center gap-2">
                                {isAccepted ? (
                                  <span className="inline-flex items-center gap-1 rounded-full border border-success-line bg-success-soft px-2.5 py-0.5 text-micro font-semibold text-success">
                                    <span>🎉</span>
                                    <span>已采纳</span>
                                    {item.rewardCoins > 0 && <span>(+{item.rewardCoins} 🪙)</span>}
                                  </span>
                                ) : isRejected ? (
                                  <span className="inline-flex items-center gap-1 rounded-full border border-danger-line bg-danger-soft px-2.5 py-0.5 text-micro font-semibold text-danger">
                                    <span>🚫</span>
                                    <span>未采纳</span>
                                  </span>
                                ) : (
                                  <span className="inline-flex items-center gap-1 rounded-full border border-warning-line bg-warning-soft px-2.5 py-0.5 text-micro font-semibold text-warning">
                                    <span>⏳</span>
                                    <span>审核中</span>
                                  </span>
                                )}
                              </div>
                            </div>

                            {/* 审核留言 */}
                            {item.reviewNote && (
                              <div className="rounded-lg border border-line bg-surface/90 px-3 py-2 text-caption text-ink-muted flex items-start gap-2">
                                <span className="shrink-0">💬</span>
                                <span>审核回复：{item.reviewNote}</span>
                              </div>
                            )}

                            {/* 元信息行 */}
                            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-micro text-ink-muted">
                              <span>📅 {formatTime(item.createdAt)}</span>
                              {item.pageUrl && <span className="truncate">🔗 {item.pageUrl}</span>}
                              {item.attachmentCount > 0 && <span>📎 {item.attachmentCount} 个附件</span>}
                              {item.githubUrl && (
                                <a
                                  href={item.githubUrl}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="inline-flex items-center gap-0.5 text-brand hover:text-brand-hover"
                                >
                                  <span>🐙 GitHub Issue</span>
                                  <ArrowUpRight className="size-2.5" />
                                </a>
                              )}
                            </div>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </div>
              </TabsContent>
            </Tabs>
          </div>
        </div>
      </main>

      {/* 登录弹窗 */}
      {showAuthModal && (
        <AuthModal
          isOpen={showAuthModal}
          onClose={() => setShowAuthModal(false)}
          onSuccess={async () => {
            setShowAuthModal(false);
            if (mutate) await mutate();
            await loadMine();
          }}
        />
      )}
    </div>
  );
}
