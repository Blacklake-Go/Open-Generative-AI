'use client';

import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  Sparkles,
  Folder,
  User,
  PanelLeftClose,
  PanelLeftOpen,
  Search,
  LayoutGrid,
  List,
  Star,
  Download,
  Copy,
  Trash2,
  Wand2,
  ChevronDown,
  Layers,
  Image as ImageIcon,
  Clapperboard,
  AudioLines,
  X,
  Play,
  RotateCcw,
  Loader2,
  Scan,
} from 'lucide-react';
import { localizeStudioPath } from '@/lib/locales';
import { useUserSession } from '@/lib/hooks/useUserSession';
import BrandLogo from '@/components/site/BrandLogo';
import UserDropdownMenu from '@/components/UserDropdownMenu';
import AuthModal from '@/components/AuthModal';
import { useBranding } from '@/lib/hooks/useBranding';

// 动态日期分组算法 (基于真实 ISO 8601 时间戳转换)
function formatTimelineDate(dateStr, isZh) {
  if (!dateStr) return isZh ? '其他时间' : 'Other';
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return isZh ? '其他时间' : 'Other';

  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const targetDay = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const diffDays = Math.round((today - targetDay) / (1000 * 60 * 60 * 24));

  if (diffDays === 0) return isZh ? '今天' : 'Today';
  if (diffDays === 1) return isZh ? '昨天' : 'Yesterday';
  if (diffDays === 2) return isZh ? '前天' : '2 days ago';

  const year = d.getFullYear();
  const month = d.getMonth() + 1;
  const day = d.getDate();

  if (year === now.getFullYear()) {
    return isZh ? `${month}月${day}日` : d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  }
  return isZh ? `${year}年${month}月${day}日` : d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
}

export default function JimengAssetCenter({ locale = 'zh', initialUser = null }) {
  const router = useRouter();
  const { brand } = useBranding();
  const { user, credits, entitlements, refresh: refreshSession } = useUserSession(initialUser);

  // 认证与弹窗状态
  const [showAuthModal, setShowAuthModal] = useState(false);

  // 布局状态
  const [isSidebarExpanded, setIsSidebarExpanded] = useState(true);
  const [topTab, setTopTab] = useState('history'); // 'history' | 'canvas'
  const [viewMode, setViewMode] = useState('grid'); // 'grid' | 'list'

  // 筛选与排序状态
  const [selectedMediaType, setSelectedMediaType] = useState('all'); // 'all' | 'image' | 'video' | 'audio' | 'workflow'
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [timeFilter, setTimeFilter] = useState('all'); // 'all' | '7days' | '30days'
  const [sortOrder, setSortOrder] = useState('newest'); // 'newest' | 'oldest'
  const [onlyStarred, setOnlyStarred] = useState(false);
  const [isTimeDropdownOpen, setIsTimeDropdownOpen] = useState(false);
  const [isSortDropdownOpen, setIsSortDropdownOpen] = useState(false);

  const timeDropdownRef = useRef(null);
  const sortDropdownRef = useRef(null);

  // 搜索防抖 300ms
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchQuery);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  // 真实资产数据流状态
  const [assets, setAssets] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedAsset, setSelectedAsset] = useState(null);
  const [isDetailClosing, setIsDetailClosing] = useState(false);
  const [toastMessage, setToastMessage] = useState('');

  // 模态框退出平滑缩放动效控制器 (200ms)
  const handleCloseDetail = useCallback(() => {
    if (isDetailClosing) return;
    setIsDetailClosing(true);
    setTimeout(() => {
      setSelectedAsset(null);
      setIsDetailClosing(false);
    }, 200);
  }, [isDetailClosing]);

  // 点击外部收起筛选下拉与 Esc 关闭浮层/模态框
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (timeDropdownRef.current && !timeDropdownRef.current.contains(e.target)) {
        setIsTimeDropdownOpen(false);
      }
      if (sortDropdownRef.current && !sortDropdownRef.current.contains(e.target)) {
        setIsSortDropdownOpen(false);
      }
    };
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        setIsTimeDropdownOpen(false);
        setIsSortDropdownOpen(false);
        if (selectedAsset) {
          handleCloseDetail();
        }
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [selectedAsset, handleCloseDetail]);

  const isZh = String(locale).startsWith('zh');
  const studioBase = localizeStudioPath(locale);

  const showToast = (msg) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(''), 2500);
  };

  // 获取真实资产历史列表
  const fetchAssets = useCallback(async () => {
    if (!user) {
      setAssets([]);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    try {
      const params = new URLSearchParams();
      if (selectedMediaType !== 'all') {
        params.set('type', selectedMediaType);
      }
      if (onlyStarred) {
        params.set('favorite', 'true');
      }
      if (debouncedSearch.trim()) {
        params.set('search', debouncedSearch.trim());
      }
      if (sortOrder) {
        params.set('sort', sortOrder);
      }
      params.set('limit', '100');

      const res = await fetch(`/api/assets?${params.toString()}`, { cache: 'no-store' });
      if (res.status === 401) {
        setShowAuthModal(true);
        setIsLoading(false);
        return;
      }

      if (res.ok) {
        const data = await res.json();
        setAssets(Array.isArray(data.assets) ? data.assets : []);
      } else {
        console.error('[JimengAssetCenter] fetchAssets returned status:', res.status);
      }
    } catch (err) {
      console.error('[JimengAssetCenter] fetchAssets failed:', err);
    } finally {
      setIsLoading(false);
    }
  }, [user, selectedMediaType, onlyStarred, debouncedSearch, sortOrder]);

  useEffect(() => {
    fetchAssets();
  }, [fetchAssets]);

  // 切换收藏状态并即时落库
  const handleToggleStar = async (e, asset) => {
    e.stopPropagation();
    const nextStarred = !asset.starred;

    // 乐观更新
    setAssets((prev) =>
      prev.map((item) => (item.id === asset.id ? { ...item, starred: nextStarred } : item))
    );
    if (selectedAsset?.id === asset.id) {
      setSelectedAsset((prev) => (prev ? { ...prev, starred: nextStarred } : prev));
    }

    try {
      const res = await fetch(`/api/assets/${asset.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isFavorite: nextStarred }),
      });
      if (!res.ok) throw new Error('更新失败');
      showToast(
        nextStarred
          ? (isZh ? '已加入收藏' : 'Added to favorites')
          : (isZh ? '已取消收藏' : 'Removed from favorites')
      );
    } catch (err) {
      // 失败回滚
      setAssets((prev) =>
        prev.map((item) => (item.id === asset.id ? { ...item, starred: !nextStarred } : item))
      );
      if (selectedAsset?.id === asset.id) {
        setSelectedAsset((prev) => (prev ? { ...prev, starred: !nextStarred } : prev));
      }
      showToast(isZh ? '收藏状态同步失败' : 'Failed to update favorite');
    }
  };

  // 删除单条真实资产
  const handleDeleteAsset = async (e, asset) => {
    if (e) e.stopPropagation();
    if (
      !window.confirm(
        isZh ? '确定要删除该生成资产吗？删除后将无法恢复。' : 'Are you sure you want to delete this asset?'
      )
    ) {
      return;
    }

    try {
      const res = await fetch(`/api/assets/${asset.id}`, {
        method: 'DELETE',
      });
      if (!res.ok) throw new Error('删除失败');
      setAssets((prev) => prev.filter((item) => item.id !== asset.id));
      if (selectedAsset?.id === asset.id) setSelectedAsset(null);
      showToast(isZh ? '资产已删除' : 'Asset deleted');
    } catch (err) {
      showToast(isZh ? '删除失败，请稍后重试' : 'Delete failed');
    }
  };

  // 图生同款 / 做同款 -> 携带 Prompt 与参数跳转至工作台
  const handleDoSame = (e, asset) => {
    if (e) e.stopPropagation();
    const params = new URLSearchParams();
    const targetTab =
      asset.type === 'video' ? 'video' : asset.type === 'audio' ? 'audio' : 'image';
    params.set('tab', targetTab);
    if (asset.prompt) params.set('prompt', asset.prompt);
    if (asset.model) params.set('model', asset.model);
    if (asset.aspectRatio && asset.aspectRatio !== 'auto') params.set('aspect_ratio', asset.aspectRatio);
    router.push(`${studioBase}?${params.toString()}`);
  };

  // 复制提示词
  const handleCopyPrompt = (e, prompt) => {
    if (e) e.stopPropagation();
    if (prompt) {
      navigator.clipboard.writeText(prompt);
      showToast(isZh ? '提示词已复制到剪贴板' : 'Prompt copied to clipboard');
    }
  };

  // 时间范围过滤 (基于 real createdAt)
  const timeFilteredAssets = useMemo(() => {
    if (timeFilter === 'all') return assets;
    const now = Date.now();
    const maxAgeMs = timeFilter === '7days' ? 7 * 86400 * 1000 : 30 * 86400 * 1000;
    return assets.filter((item) => {
      const ts = new Date(item.createdAt || 0).getTime();
      return now - ts <= maxAgeMs;
    });
  }, [assets, timeFilter]);

  // 按真实日期聚合时间轴
  const groupedTimeline = useMemo(() => {
    const groups = {};
    const groupOrder = [];
    timeFilteredAssets.forEach((item) => {
      const key = formatTimelineDate(item.createdAt, isZh);
      if (!groups[key]) {
        groups[key] = [];
        groupOrder.push(key);
      }
      groups[key].push(item);
    });
    return groupOrder.map((key) => [key, groups[key]]);
  }, [timeFilteredAssets, isZh]);

  // 侧边栏动态历史对话会话 (从用户真实最新任务的 Prompt 提炼，杜绝静态假数据)
  const dynamicSessions = useMemo(() => {
    const seen = new Set();
    const result = [];
    for (const a of assets) {
      const raw = (a.prompt || a.title || '').trim();
      if (raw && !seen.has(raw)) {
        seen.add(raw);
        result.push({
          id: a.id,
          title: raw.length > 20 ? raw.slice(0, 18) + '...' : raw,
          fullTitle: raw,
          tab: a.type === 'video' ? 'video' : a.type === 'audio' ? 'audio' : 'image',
          prompt: a.prompt,
          model: a.model,
        });
      }
      if (result.length >= 5) break;
    }
    return result;
  }, [assets]);

  // 若客户端检测到未登录（如退出登录或会话失效），渲染优雅登录提示卡片
  if (!user && !isLoading) {
    return (
      <div className="min-h-screen bg-[#0d0e12] text-ink flex items-center justify-center p-6">
        <div className="max-w-md w-full rounded-2xl border border-white/10 bg-[#14161b] p-8 text-center shadow-elevation-3">
          <div className="w-14 h-14 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center mx-auto mb-4 text-brand">
            <Folder className="w-7 h-7" />
          </div>
          <h2 className="text-xl font-bold text-white mb-2">
            {isZh ? '登录访问个人资产中心' : 'Sign in to Access Assets'}
          </h2>
          <p className="text-xs text-ink-muted leading-relaxed mb-6">
            {isZh
              ? '资产中心集中归档您所有的 AI 生图、生视频与音频作品，请先登录您的创作者账号。'
              : 'Asset Center securely archives all your generated AI creations. Please sign in to continue.'}
          </p>
          <div className="flex flex-col gap-3">
            <button
              type="button"
              onClick={() => setShowAuthModal(true)}
              className="w-full h-10 rounded-full bg-brand hover:bg-brand-hover active:bg-brand-active text-ink-on-accent text-xs font-semibold transition-[background-color,color,transform] duration-fast ease-standard active:scale-[0.98] active:duration-instant focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-brand-ring shadow-elevation-1 cursor-pointer"
            >
              {isZh ? '立即登录 / 注册' : 'Sign In / Register'}
            </button>
            <Link
              href={isZh ? '/zh/login?redirect=/zh/assets' : '/login?redirect=/assets'}
              className="w-full h-10 rounded-full bg-surface hover:bg-surface-raised border border-line text-ink-muted hover:text-ink text-xs font-medium flex items-center justify-center transition-[background-color,color,border-color,transform] duration-fast ease-standard active:scale-[0.98] active:duration-instant focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-brand-ring cursor-pointer"
            >
              {isZh ? '跳转完整登录页' : 'Go to Login Page'}
            </Link>
          </div>
        </div>

        {showAuthModal && (
          <AuthModal
            isOpen={showAuthModal}
            onClose={() => setShowAuthModal(false)}
            onSuccess={() => {
              setShowAuthModal(false);
              refreshSession();
            }}
          />
        )}
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0d0e12] text-ink flex overflow-hidden">
      {/* ============================================================ */}
      {/* 1. 左侧常驻导航侧边栏                                       */}
      {/* ============================================================ */}
      <aside
        className={`h-screen border-r border-white/[0.08] bg-[#111317] flex flex-col shrink-0 transition-all duration-300 z-30 select-none ${
          isSidebarExpanded ? 'w-60' : 'w-[68px]'
        }`}
      >
        {/* 顶部 Logo & 折叠切换按钮 */}
        <div className="h-14 px-4 flex items-center justify-between border-b border-white/[0.06]">
          <Link href="/" className="flex items-center gap-2 overflow-hidden">
            <BrandLogo brand={brand} />
          </Link>
          <button
            type="button"
            onClick={() => setIsSidebarExpanded(!isSidebarExpanded)}
            className="w-7 h-7 rounded-lg text-ink-subtle hover:text-white hover:bg-white/10 flex items-center justify-center transition-colors cursor-pointer"
            title={isSidebarExpanded ? '折叠侧边栏' : '展开侧边栏'}
          >
            {isSidebarExpanded ? (
              <PanelLeftClose className="w-4 h-4" />
            ) : (
              <PanelLeftOpen className="w-4 h-4" />
            )}
          </button>
        </div>

        {/* 主菜单导航项 */}
        <nav className="p-3 space-y-1">
          {/* 创作 */}
          <Link
            href={studioBase}
            className="flex items-center gap-3 px-3 py-2 rounded-xl text-ink-muted hover:text-white hover:bg-white/5 transition-colors cursor-pointer"
            title="创作"
          >
            <Sparkles className="w-5 h-5 shrink-0 text-white/70" />
            {isSidebarExpanded && <span className="text-sm font-medium">{isZh ? '创作' : 'Studio'}</span>}
          </Link>

          {/* 资产 (当前激活项) */}
          <div
            className="flex items-center gap-3 px-3 py-2 rounded-xl bg-white/10 text-white font-semibold transition-colors cursor-default shadow-sm"
            title="资产"
          >
            <Folder className="w-5 h-5 shrink-0 text-brand" />
            {isSidebarExpanded && <span className="text-sm">{isZh ? '资产' : 'Assets'}</span>}
          </div>

          {/* 主体 */}
          <Link
            href={`${studioBase}?tab=headshot`}
            className="flex items-center gap-3 px-3 py-2 rounded-xl text-ink-muted hover:text-white hover:bg-white/5 transition-colors cursor-pointer"
            title="主体"
          >
            <User className="w-5 h-5 shrink-0 text-white/70" />
            {isSidebarExpanded && <span className="text-sm font-medium">{isZh ? '主体' : 'Subjects'}</span>}
          </Link>
        </nav>

        {/* 分割线与下层真实动态子列表 (仅在展开态展示) */}
        {isSidebarExpanded && (
          <div className="flex-1 overflow-y-auto px-3 py-2 space-y-5 scrollbar-rail border-t border-white/[0.04]">
            {/* 对话列表：真实历史提示词直达入口 */}
            <div>
              <div className="px-3 pb-1 text-xs font-semibold text-ink-subtle uppercase tracking-wider">
                {isZh ? '历史创作会话' : 'Recent Chats'}
              </div>
              <div className="space-y-0.5 mt-1">
                {dynamicSessions.length === 0 ? (
                  <div className="px-3 py-1.5 text-xs text-ink-subtle/50 italic">
                    {isZh ? '暂无历史记录' : 'No recent chats'}
                  </div>
                ) : (
                  dynamicSessions.map((sess) => (
                    <button
                      key={sess.id}
                      type="button"
                      onClick={() => {
                        const params = new URLSearchParams();
                        params.set('tab', sess.tab);
                        if (sess.prompt) params.set('prompt', sess.prompt);
                        if (sess.model) params.set('model', sess.model);
                        router.push(`${studioBase}?${params.toString()}`);
                      }}
                      className="w-full text-left px-3 py-1.5 rounded-lg text-xs text-white/70 hover:text-white hover:bg-white/5 truncate transition-colors flex items-center gap-2 cursor-pointer"
                      title={sess.fullTitle}
                    >
                      <span className="w-1.5 h-1.5 rounded-full bg-brand/60 shrink-0" />
                      <span className="truncate">{sess.title}</span>
                    </button>
                  ))
                )}
              </div>
            </div>

            {/* 画布功能快捷入口 */}
            <div>
              <div className="px-3 pb-1 text-xs font-semibold text-ink-subtle uppercase tracking-wider">
                {isZh ? '设计画布' : 'Canvases'}
              </div>
              <div className="space-y-0.5 mt-1">
                <button
                  type="button"
                  onClick={() => router.push(`${studioBase}?tab=layers`)}
                  className="w-full text-left px-3 py-1.5 rounded-lg text-xs text-white/70 hover:text-white hover:bg-white/5 truncate transition-colors flex items-center gap-2 cursor-pointer"
                  title={isZh ? '自由设计画布' : 'Canvas Studio'}
                >
                  <Layers className="w-3.5 h-3.5 text-white/40 shrink-0" />
                  <span className="truncate">{isZh ? '自由设计画布' : 'Canvas Studio'}</span>
                </button>
              </div>
            </div>
          </div>
        )}
      </aside>

      {/* ============================================================ */}
      {/* 2. 主内容展示区 (顶部Tabs + 筛选栏 + 时间轴网格)             */}
      {/* ============================================================ */}
      <div className="flex-1 flex flex-col h-screen overflow-hidden">
        {/* 顶部二级导航栏 (生成历史 vs 画布) */}
        <header className="h-14 px-6 border-b border-white/[0.08] bg-[#111317]/80 backdrop-blur-md flex items-center justify-between shrink-0 z-20">
          {/* 左侧 Tabs 切换 */}
          <div className="flex items-center gap-6">
            <button
              type="button"
              onClick={() => setTopTab('history')}
              className={`text-base font-semibold transition-colors relative py-1 cursor-pointer ${
                topTab === 'history' ? 'text-white' : 'text-ink-muted hover:text-white'
              }`}
            >
              <span>{isZh ? '生成历史' : 'History'}</span>
              {topTab === 'history' && (
                <span className="absolute bottom-[-15px] left-0 right-0 h-0.5 bg-brand rounded-full shadow-elevation-1" />
              )}
            </button>
            <button
              type="button"
              onClick={() => {
                setTopTab('canvas');
                router.push(`${studioBase}?tab=layers`);
              }}
              className={`text-base font-medium transition-colors relative py-1 cursor-pointer ${
                topTab === 'canvas' ? 'text-white' : 'text-ink-muted hover:text-white'
              }`}
            >
              <span>{isZh ? '画布' : 'Canvases'}</span>
              {topTab === 'canvas' && (
                <span className="absolute bottom-[-15px] left-0 right-0 h-0.5 bg-brand rounded-full shadow-elevation-1" />
              )}
            </button>
          </div>

          {/* 右侧工具组 (搜索、视图模式、真实积分、用户菜单) */}
          <div className="flex items-center gap-3">
            {/* 搜索框 */}
            <div className="relative hidden sm:block w-48 lg:w-60">
              <Search className="w-3.5 h-3.5 text-ink-subtle absolute left-2.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder={isZh ? '搜索提示词或标题...' : 'Search assets...'}
                className="w-full h-8 pl-8 pr-3 rounded-full bg-white/5 border border-white/10 text-xs text-white placeholder:text-ink-subtle focus:outline-none focus:border-brand-line transition-colors"
              />
            </div>

            {/* 视图切换 */}
            <div className="flex items-center rounded-lg bg-white/5 p-0.5 border border-white/10">
              <button
                type="button"
                onClick={() => setViewMode('grid')}
                className={`p-1.5 rounded-md transition-colors cursor-pointer ${
                  viewMode === 'grid' ? 'bg-white/15 text-white' : 'text-ink-subtle hover:text-white'
                }`}
                title="网格视图"
              >
                <LayoutGrid className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onClick={() => setViewMode('list')}
                className={`p-1.5 rounded-md transition-colors cursor-pointer ${
                  viewMode === 'list' ? 'bg-white/15 text-white' : 'text-ink-subtle hover:text-white'
                }`}
                title="列表视图"
              >
                <List className="w-3.5 h-3.5" />
              </button>
            </div>

            {/* 用户下拉菜单 (已内置算力与会员状态胶囊，不再在此处重复展示积分) */}
            <UserDropdownMenu
              user={user}
              credits={credits ?? user?.credits ?? 0}
              entitlements={entitlements}
              locale={locale}
              onOpenAuth={() => setShowAuthModal(true)}
            />
          </div>
        </header>

        {/* 二级筛选栏 (多媒体胶囊 + 筛选/时间/排序下拉) */}
        <div className="h-12 px-6 border-b border-white/[0.06] bg-[#111317]/50 flex items-center justify-between shrink-0 gap-4 relative z-20 overflow-visible">
          {/* 左侧多媒体分类胶囊 (允许在窄屏独立横向滚动，不干扰右侧浮层) */}
          <div className="flex items-center gap-1 overflow-x-auto scrollbar-none py-1 min-w-0">
            {[
              { id: 'all', label: isZh ? '全部' : 'All' },
              { id: 'image', label: isZh ? '图片' : 'Image' },
              { id: 'video', label: isZh ? '视频' : 'Video' },
              { id: 'audio', label: isZh ? '音频' : 'Audio' },
              { id: 'workflow', label: isZh ? '工作流' : 'Workflow' },
            ].map((cat) => (
              <button
                key={cat.id}
                type="button"
                onClick={() => setSelectedMediaType(cat.id)}
                className={`h-7 px-3.5 rounded-full text-xs shrink-0 transition-[background-color,color,border-color,transform] duration-fast ease-standard active:scale-[0.98] active:duration-instant focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-brand-ring cursor-pointer ${
                  selectedMediaType === cat.id
                    ? 'bg-brand text-ink-on-accent font-semibold shadow-elevation-1'
                    : 'text-ink-muted hover:text-ink hover:bg-wash'
                }`}
              >
                {cat.label}
              </button>
            ))}
          </div>

          {/* 右侧筛选下拉控制器 */}
          <div className="flex items-center gap-2 shrink-0 relative">
            {/* 只看收藏 */}
            <button
              type="button"
              onClick={() => setOnlyStarred(!onlyStarred)}
              className={`h-7 px-2.5 rounded-full border text-xs flex items-center gap-1 transition-colors cursor-pointer ${
                onlyStarred
                  ? 'border-amber-400/40 bg-amber-400/10 text-amber-300'
                  : 'border-white/10 bg-white/5 text-ink-muted hover:text-white'
              }`}
            >
              <Star className={`w-3 h-3 ${onlyStarred ? 'fill-amber-400 text-amber-400' : ''}`} />
              <span>{isZh ? '收藏' : 'Starred'}</span>
            </button>

            {/* 时间范围下拉框 */}
            <div className="relative" ref={timeDropdownRef}>
              <button
                type="button"
                onClick={() => {
                  setIsTimeDropdownOpen((prev) => !prev);
                  setIsSortDropdownOpen(false);
                }}
                className={`h-7 px-2.5 rounded-full border text-xs flex items-center gap-1 transition-colors cursor-pointer ${
                  isTimeDropdownOpen
                    ? 'border-white/25 bg-white/10 text-white'
                    : 'border-white/10 bg-white/5 text-ink-muted hover:text-white'
                }`}
              >
                <span>
                  {timeFilter === 'all'
                    ? isZh ? '全部时间' : 'All Time'
                    : timeFilter === '7days'
                    ? isZh ? '近7天' : '7 Days'
                    : isZh ? '近30天' : '30 Days'}
                </span>
                <ChevronDown className={`w-3 h-3 text-white/50 transition-transform ${isTimeDropdownOpen ? 'rotate-180' : ''}`} />
              </button>
              {isTimeDropdownOpen && (
                <div className="absolute right-0 top-full mt-1.5 w-32 rounded-xl bg-[#1c1f26] border border-white/10 shadow-elevation-3 py-1 z-50 animate-fade-in duration-fast">
                  <button
                    type="button"
                    onClick={() => {
                      setTimeFilter('all');
                      setIsTimeDropdownOpen(false);
                    }}
                    className={`w-full px-3 py-1.5 text-left text-xs flex items-center justify-between transition-colors ${
                      timeFilter === 'all'
                        ? 'text-brand font-medium bg-brand/10'
                        : 'text-ink-muted hover:text-white hover:bg-white/10'
                    }`}
                  >
                    <span>{isZh ? '全部时间' : 'All Time'}</span>
                    {timeFilter === 'all' && <span className="w-1.5 h-1.5 rounded-full bg-brand" />}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setTimeFilter('7days');
                      setIsTimeDropdownOpen(false);
                    }}
                    className={`w-full px-3 py-1.5 text-left text-xs flex items-center justify-between transition-colors ${
                      timeFilter === '7days'
                        ? 'text-brand font-medium bg-brand/10'
                        : 'text-ink-muted hover:text-white hover:bg-white/10'
                    }`}
                  >
                    <span>{isZh ? '近7天' : 'Last 7 Days'}</span>
                    {timeFilter === '7days' && <span className="w-1.5 h-1.5 rounded-full bg-brand" />}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setTimeFilter('30days');
                      setIsTimeDropdownOpen(false);
                    }}
                    className={`w-full px-3 py-1.5 text-left text-xs flex items-center justify-between transition-colors ${
                      timeFilter === '30days'
                        ? 'text-brand font-medium bg-brand/10'
                        : 'text-ink-muted hover:text-white hover:bg-white/10'
                    }`}
                  >
                    <span>{isZh ? '近30天' : 'Last 30 Days'}</span>
                    {timeFilter === '30days' && <span className="w-1.5 h-1.5 rounded-full bg-brand" />}
                  </button>
                </div>
              )}
            </div>

            {/* 排序下拉框 */}
            <div className="relative" ref={sortDropdownRef}>
              <button
                type="button"
                onClick={() => {
                  setIsSortDropdownOpen((prev) => !prev);
                  setIsTimeDropdownOpen(false);
                }}
                className={`h-7 px-2.5 rounded-full border text-xs flex items-center gap-1 transition-colors cursor-pointer ${
                  isSortDropdownOpen
                    ? 'border-white/25 bg-white/10 text-white'
                    : 'border-white/10 bg-white/5 text-ink-muted hover:text-white'
                }`}
              >
                <span>{sortOrder === 'newest' ? (isZh ? '最新生成' : 'Newest') : isZh ? '最早生成' : 'Oldest'}</span>
                <ChevronDown className={`w-3 h-3 text-white/50 transition-transform ${isSortDropdownOpen ? 'rotate-180' : ''}`} />
              </button>
              {isSortDropdownOpen && (
                <div className="absolute right-0 top-full mt-1.5 w-32 rounded-xl bg-[#1c1f26] border border-white/10 shadow-elevation-3 py-1 z-50 animate-fade-in duration-fast">
                  <button
                    type="button"
                    onClick={() => {
                      setSortOrder('newest');
                      setIsSortDropdownOpen(false);
                    }}
                    className={`w-full px-3 py-1.5 text-left text-xs flex items-center justify-between transition-colors ${
                      sortOrder === 'newest'
                        ? 'text-brand font-medium bg-brand/10'
                        : 'text-ink-muted hover:text-white hover:bg-white/10'
                    }`}
                  >
                    <span>{isZh ? '最新生成' : 'Newest First'}</span>
                    {sortOrder === 'newest' && <span className="w-1.5 h-1.5 rounded-full bg-brand" />}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setSortOrder('oldest');
                      setIsSortDropdownOpen(false);
                    }}
                    className={`w-full px-3 py-1.5 text-left text-xs flex items-center justify-between transition-colors ${
                      sortOrder === 'oldest'
                        ? 'text-brand font-medium bg-brand/10'
                        : 'text-ink-muted hover:text-white hover:bg-white/10'
                    }`}
                  >
                    <span>{isZh ? '最早生成' : 'Oldest First'}</span>
                    {sortOrder === 'oldest' && <span className="w-1.5 h-1.5 rounded-full bg-brand" />}
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* 核心主展示区：时间轴聚合流 */}
        <main className="flex-1 overflow-y-auto px-6 py-6 space-y-8 scrollbar-rail">
          {isLoading ? (
            /* 加载骨架屏 */
            <div className="space-y-4">
              <div className="h-6 w-32 bg-white/5 rounded-md animate-pulse" />
              <div className="grid grid-cols-[repeat(auto-fill,175px)] gap-3.5 justify-start">
                {Array.from({ length: 14 }).map((_, index) => (
                  <div
                    key={index}
                    className="w-[175px] h-[175px] rounded-xl bg-white/[0.04] border border-white/[0.06] animate-pulse"
                  />
                ))}
              </div>
            </div>
          ) : groupedTimeline.length === 0 ? (
            /* 真实历史空状态 */
            <div className="h-96 flex flex-col items-center justify-center text-center gap-3">
              <Folder className="w-12 h-12 text-ink-subtle/30" />
              <div className="text-sm text-ink-muted">
                {searchQuery || onlyStarred || selectedMediaType !== 'all' || timeFilter !== 'all'
                  ? isZh ? '暂无匹配的资产作品' : 'No matching assets found'
                  : isZh ? '暂无生成历史资产' : 'No generated assets yet'}
              </div>
              <div className="flex items-center gap-2 mt-2">
                {(searchQuery || onlyStarred || selectedMediaType !== 'all' || timeFilter !== 'all') && (
                  <button
                    type="button"
                    onClick={() => {
                      setSearchQuery('');
                      setOnlyStarred(false);
                      setSelectedMediaType('all');
                      setTimeFilter('all');
                    }}
                    className="h-8 px-4 rounded-full border border-white/15 bg-white/5 text-white/80 text-xs font-medium hover:bg-white/10 transition-colors cursor-pointer"
                  >
                    {isZh ? '重置筛选' : 'Reset Filters'}
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => router.push(studioBase)}
                  className="h-8 px-4 rounded-full bg-brand text-white text-xs font-medium hover:bg-brand-hover transition-colors cursor-pointer shadow-elevation-1"
                >
                  {isZh ? '前往创作' : 'Start Creating'}
                </button>
              </div>
            </div>
          ) : (
            groupedTimeline.map(([dateTitle, items]) => (
              <section key={dateTitle} className="space-y-3.5">
                {/* 时间轴吸顶日期标题 */}
                <div className="sticky top-0 z-10 py-1.5 bg-[#0d0e12]/90 backdrop-blur-sm flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-white/90 tracking-wide flex items-center gap-2">
                    <span>{dateTitle}</span>
                    <span className="text-xs text-white/40 font-normal">({items.length})</span>
                  </h3>
                </div>

                {/* 媒体卡片响应式网格 (固定175px正方形状) / 列表 */}
                <div
                  className={
                    viewMode === 'grid'
                      ? 'grid grid-cols-[repeat(auto-fill,175px)] gap-3.5 justify-start'
                      : 'flex flex-col gap-3'
                  }
                >
                  {items.map((asset) => (
                    viewMode === 'grid' ? (
                      <div
                        key={asset.id}
                        onClick={() => setSelectedAsset(asset)}
                        className="group relative w-[175px] h-[175px] rounded-xl overflow-hidden border border-white/[0.08] hover:border-white/25 bg-[#17181c] cursor-pointer transition-all duration-300 shadow-sm flex flex-col justify-end shrink-0"
                      >
                        {/* 背景缩略图 / 媒体视图 */}
                        {asset.type === 'audio' ? (
                          <div className="absolute inset-0 bg-[#131418] flex flex-col items-center justify-center gap-1.5 p-3 text-center">
                            <AudioLines className="w-8 h-8 text-brand" />
                            <span className="text-[9px] text-white/50 font-mono tracking-wider">AUDIO</span>
                            <span className="text-[11px] text-white/70 line-clamp-2">{asset.prompt || asset.title}</span>
                          </div>
                        ) : (
                          /* eslint-disable-next-line @next/next/no-img-element */
                          <img
                            src={asset.thumbnailUrl || asset.url || '/placeholder.png'}
                            alt={asset.title || 'AI Asset'}
                            onError={(e) => { e.currentTarget.onerror = null; e.currentTarget.src = '/icon.png'; }}
                            className="absolute inset-0 w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                            loading="lazy"
                          />
                        )}

                        {/* 悬停暗色渐变蒙层 */}
                        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-black/30 opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none" />

                        {/* 左上角扫瞄/检视图标 (对应图2左上角，悬停展示) */}
                        <div className="absolute top-2 left-2 z-10 opacity-0 group-hover:opacity-100 transition-opacity">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedAsset(asset);
                            }}
                            className="w-6 h-6 rounded-lg bg-black/60 hover:bg-black/90 backdrop-blur-md border border-white/10 text-amber-400 hover:text-amber-300 flex items-center justify-center transition-[background-color,color,transform] duration-fast ease-standard cursor-pointer shadow-sm active:scale-95 active:duration-instant focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-brand-ring"
                            title={isZh ? '查看详情大图' : 'View Detail'}
                          >
                            <Scan className="w-3 h-3" />
                          </button>
                        </div>

                        {/* 视频角标 (未悬停时显现，悬停时让位给扫瞄图标) */}
                        {asset.type === 'video' && (
                          <div className="absolute top-2 left-2 z-10 pointer-events-none group-hover:opacity-0 transition-opacity">
                            <span className="p-1 rounded-md bg-black/60 backdrop-blur-md text-white flex items-center justify-center">
                              <Play className="w-2.5 h-2.5 fill-white" />
                            </span>
                          </div>
                        )}

                        {/* 右上角收藏星标 (点击即时落库) */}
                        <div className="absolute top-2 right-2 z-10">
                          <button
                            type="button"
                            onClick={(e) => handleToggleStar(e, asset)}
                            className={`w-6 h-6 rounded-full backdrop-blur-md border flex items-center justify-center transition-[background-color,color,border-color,transform] duration-fast ease-standard cursor-pointer active:scale-95 active:duration-instant shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-brand-ring ${
                              asset.starred
                                ? 'border-amber-400/40 bg-black/70 text-amber-400 opacity-100'
                                : 'border-white/10 bg-black/50 text-white/70 opacity-0 group-hover:opacity-100 hover:text-white hover:bg-black/80'
                            }`}
                            title={asset.starred ? (isZh ? '取消收藏' : 'Unstar') : (isZh ? '收藏' : 'Star')}
                          >
                            <Star className={`w-3 h-3 ${asset.starred ? 'fill-amber-400' : ''}`} />
                          </button>
                        </div>

                        {/* 底部悬停操作栏 (图生同款 + 复制提示词 + 删除) */}
                        <div className="relative z-10 p-2 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-between gap-1 w-full">
                          <button
                            type="button"
                            onClick={(e) => handleDoSame(e, asset)}
                            className="h-6 px-2.5 rounded-full bg-black/60 hover:bg-black/90 backdrop-blur-md border border-white/10 hover:border-white/20 text-white text-[10px] font-medium transition-[background-color,color,border-color,transform] duration-fast ease-standard shadow-sm flex items-center gap-1 cursor-pointer active:scale-95 active:duration-instant focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-brand-ring shrink-0"
                            title={isZh ? '使用相同提示词与参数进行二次创作' : 'Remix with prompt'}
                          >
                            <Wand2 className="w-2.5 h-2.5 text-brand" />
                            <span>{isZh ? '图生同款' : 'Remix'}</span>
                          </button>

                          <div className="flex items-center gap-1 shrink-0">
                            <button
                              type="button"
                              onClick={(e) => handleCopyPrompt(e, asset.prompt)}
                              className="w-6 h-6 rounded-full bg-black/60 hover:bg-black/90 backdrop-blur-md border border-white/10 text-white/80 hover:text-white flex items-center justify-center transition-[background-color,color,transform] duration-fast ease-standard cursor-pointer active:scale-95 active:duration-instant focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-brand-ring"
                              title={isZh ? '复制提示词' : 'Copy prompt'}
                            >
                              <Copy className="w-3 h-3" />
                            </button>
                            <button
                              type="button"
                              onClick={(e) => handleDeleteAsset(e, asset)}
                              className="w-6 h-6 rounded-full bg-black/60 hover:bg-red-500/80 backdrop-blur-md border border-white/10 text-white/80 hover:text-white flex items-center justify-center transition-[background-color,color,transform] duration-fast ease-standard cursor-pointer active:scale-95 active:duration-instant focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-brand-ring"
                              title={isZh ? '删除资产' : 'Delete asset'}
                            >
                              <Trash2 className="w-3 h-3" />
                            </button>
                          </div>
                        </div>
                      </div>
                    ) : (
                      /* 列表视图：结构清晰的行式卡片 */
                      <div
                        key={asset.id}
                        onClick={() => setSelectedAsset(asset)}
                        className="group relative rounded-xl border border-white/[0.08] hover:border-white/20 bg-[#16181d] hover:bg-[#1a1d23] cursor-pointer transition-all duration-200 p-3 flex items-center justify-between gap-4 shadow-sm"
                      >
                        {/* 左侧固定缩略图 */}
                        <div className="relative w-20 h-20 md:w-24 md:h-24 rounded-lg overflow-hidden shrink-0 bg-black/50 border border-white/10 flex items-center justify-center">
                          {asset.type === 'audio' ? (
                            <div className="flex flex-col items-center justify-center gap-1 text-brand">
                              <AudioLines className="w-6 h-6" />
                              <span className="text-[9px] text-white/50 font-mono">AUDIO</span>
                            </div>
                          ) : (
                            /* eslint-disable-next-line @next/next/no-img-element */
                            <img
                              src={asset.thumbnailUrl || asset.url || '/placeholder.png'}
                              alt={asset.title || 'AI Asset'}
                              onError={(e) => { e.currentTarget.onerror = null; e.currentTarget.src = '/icon.png'; }}
                              className="w-full h-full object-cover"
                              loading="lazy"
                            />
                          )}
                          {asset.type === 'video' && (
                            <div className="absolute top-1 left-1 p-0.5 rounded bg-black/70 text-white">
                              <Play className="w-2.5 h-2.5 fill-white" />
                            </div>
                          )}
                        </div>

                        {/* 中间信息区 */}
                        <div className="flex-1 min-w-0 flex flex-col justify-between py-0.5 gap-1.5">
                          <p className="text-xs font-semibold text-white/90 line-clamp-2 select-text group-hover:text-white">
                            {asset.prompt || asset.title || (isZh ? '无文字提示词' : 'Untitled Asset')}
                          </p>

                          <div className="flex flex-wrap items-center gap-2 text-[11px] text-ink-subtle">
                            <span className="px-1.5 py-0.5 rounded bg-white/5 border border-white/10 font-mono text-[10px] text-white/70">
                              {asset.model || 'AI Model'}
                            </span>
                            <span>{asset.quality || '2K'} · {asset.aspectRatio || 'auto'}</span>
                            <span>·</span>
                            <span>{formatTimelineDate(asset.createdAt, isZh)}</span>
                            {asset.creditCost > 0 && (
                              <>
                                <span>·</span>
                                <span className="text-brand font-mono">{asset.creditCost} {isZh ? '积分' : 'credits'}</span>
                              </>
                            )}
                          </div>
                        </div>

                        {/* 右侧动作区 */}
                        <div className="flex items-center gap-2 shrink-0" onClick={(e) => e.stopPropagation()}>
                          <button
                            type="button"
                            onClick={(e) => handleDoSame(e, asset)}
                            className="h-7 px-3 rounded-full bg-brand hover:bg-brand-hover text-white text-xs font-medium flex items-center gap-1 cursor-pointer shadow-elevation-1 transition-colors"
                            title="做同款"
                          >
                            <Wand2 className="w-3 h-3" />
                            <span className="hidden sm:inline">{isZh ? '做同款' : 'Remix'}</span>
                          </button>

                          <button
                            type="button"
                            onClick={(e) => handleCopyPrompt(e, asset.prompt)}
                            className="w-7 h-7 rounded-full bg-white/5 hover:bg-white/10 text-white/80 hover:text-white flex items-center justify-center transition-colors cursor-pointer"
                            title="复制提示词"
                          >
                            <Copy className="w-3.5 h-3.5" />
                          </button>

                          <button
                            type="button"
                            onClick={(e) => handleToggleStar(e, asset)}
                            className={`w-7 h-7 rounded-full border text-xs flex items-center justify-center transition-colors cursor-pointer ${
                              asset.starred
                                ? 'border-amber-400/40 bg-amber-400/10 text-amber-300'
                                : 'border-white/10 bg-white/5 text-ink-muted hover:text-white'
                            }`}
                            title={asset.starred ? '取消收藏' : '收藏'}
                          >
                            <Star className={`w-3.5 h-3.5 ${asset.starred ? 'fill-amber-400 text-amber-400' : ''}`} />
                          </button>

                          <button
                            type="button"
                            onClick={(e) => handleDeleteAsset(e, asset)}
                            className="w-7 h-7 rounded-full bg-white/5 hover:bg-red-500/20 text-ink-subtle hover:text-red-400 flex items-center justify-center transition-colors cursor-pointer"
                            title="删除资产"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    )
                  ))}
                </div>
              </section>
            ))
          )}
        </main>
      </div>

      {/* ============================================================ */}
      {/* 3. 资产详情高清预览模态框 (Asset Detail Modal)               */}
      {/* ============================================================ */}
      {selectedAsset && (
        <div
          className={`fixed inset-0 z-modal flex items-center justify-center bg-scrim backdrop-blur-xl p-4 sm:p-6 transition-opacity duration-modal ease-enter ${
            isDetailClosing ? 'opacity-0 pointer-events-none' : 'opacity-100'
          }`}
          onClick={(e) => {
            if (e.target === e.currentTarget) handleCloseDetail();
          }}
        >
          <div
            className={`relative max-w-5xl w-full bg-overlay border border-line rounded-2xl overflow-hidden shadow-elevation-4 flex flex-col md:flex-row h-auto md:h-[640px] max-h-[92vh] transition-all duration-modal ease-enter transform ${
              isDetailClosing ? 'scale-95 opacity-0 -translate-y-2' : 'scale-100 opacity-100 translate-y-0'
            }`}
          >
            {/* 关闭按钮 (绝对定位在右上角，加高 z-index 确保永远可点并带缩放微动效) */}
            <button
              type="button"
              onClick={handleCloseDetail}
              className="absolute top-4 right-4 z-40 size-8 rounded-full bg-overlay-glass backdrop-blur-md border border-line-subtle text-ink-muted hover:text-ink hover:bg-well active:scale-95 active:duration-instant flex items-center justify-center transition-[background-color,color,transform] duration-fast ease-standard cursor-pointer focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-brand-ring shadow-elevation-1"
              title={isZh ? '关闭' : 'Close'}
              aria-label="Close"
            >
              <X className="size-4" />
            </button>

            {/* 左侧高清大图 / 视频 / 音频 展台 (占据 flex-1 且有独立深色背景) */}
            <div className="flex-1 min-w-0 bg-base relative flex items-center justify-center p-4 md:p-8 select-none overflow-hidden min-h-[300px] md:min-h-0">
              {selectedAsset.type === 'video' ? (
                <video
                  src={selectedAsset.url}
                  controls
                  autoPlay
                  loop
                  playsInline
                  className="max-h-[75vh] md:max-h-full max-w-full w-auto h-auto object-contain rounded-xl drop-shadow-2xl"
                />
              ) : selectedAsset.type === 'audio' ? (
                <div className="flex flex-col items-center justify-center p-8 text-center max-w-md w-full">
                  <div className="w-20 h-20 rounded-2xl bg-brand/10 border border-brand/20 flex items-center justify-center mb-4 text-brand">
                    <AudioLines className="w-10 h-10" />
                  </div>
                  <h4 className="text-sm font-semibold text-white mb-2">{selectedAsset.title || 'AI 音频作品'}</h4>
                  <audio src={selectedAsset.url} controls className="w-full mt-4" />
                </div>
              ) : (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img
                  src={selectedAsset.url || selectedAsset.previewUrl || selectedAsset.thumbnailUrl}
                  alt={selectedAsset.title || 'Asset Detail'}
                  onError={(e) => {
                    e.currentTarget.onerror = null;
                    e.currentTarget.src = selectedAsset.thumbnailUrl || '/icon.png';
                  }}
                  className="max-h-[75vh] md:max-h-full max-w-full w-auto h-auto object-contain rounded-xl drop-shadow-2xl"
                />
              )}
            </div>

            {/* 右侧元数据与操作面板 (固定宽 380px，保证左右分栏比例绝不折叠；pr-10 避免与右上角关闭按钮发生重叠) */}
            <div className="w-full md:w-[380px] shrink-0 p-6 flex flex-col justify-between border-t md:border-t-0 md:border-l border-line bg-overlay overflow-y-auto max-h-[92vh] md:max-h-none scrollbar-rail min-h-0">
              <div className="space-y-4">
                {/* 顶栏：标签与日期 (加 pr-8 彻底避免与关闭按钮重叠) */}
                <div className="flex items-center justify-between pr-8">
                  <span className="text-xs px-2.5 py-0.5 rounded-full bg-brand-soft border border-brand-line text-brand font-medium">
                    {selectedAsset.type === 'video'
                      ? 'AI 视频'
                      : selectedAsset.type === 'audio'
                      ? 'AI 音频'
                      : 'AI 图像'}
                  </span>
                  <span className="text-xs text-ink-muted font-mono">
                    {formatTimelineDate(selectedAsset.createdAt, isZh)}
                  </span>
                </div>

                {/* 提示词 */}
                <div>
                  <div className="text-xs text-ink-muted mb-1.5 flex items-center justify-between">
                    <span>{isZh ? '提示词' : 'Prompt'}</span>
                    <button
                      type="button"
                      onClick={(e) => handleCopyPrompt(e, selectedAsset.prompt)}
                      className="text-xs text-brand hover:text-brand-hover active:scale-95 active:duration-instant flex items-center gap-1 cursor-pointer transition-[color,transform] duration-fast ease-standard"
                    >
                      <Copy className="w-3 h-3" />
                      <span>{isZh ? '复制' : 'Copy'}</span>
                    </button>
                  </div>
                  <p className="text-xs text-ink leading-relaxed bg-well p-3.5 rounded-xl border border-line select-text max-h-40 overflow-y-auto scrollbar-rail">
                    {selectedAsset.prompt ? `“${selectedAsset.prompt}”` : isZh ? '无文字提示词' : 'No prompt recorded'}
                  </p>
                </div>

                {/* 真实参数细节 */}
                <div className="space-y-2 pt-2 border-t border-line">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-ink-muted">{isZh ? '模型' : 'Model'}</span>
                    <span className="text-ink font-mono truncate max-w-[180px] text-right" title={selectedAsset.model || 'AI Model'}>
                      {selectedAsset.model || 'AI Model'}
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-ink-muted">{isZh ? '画质比例' : 'Ratio'}</span>
                    <span className="text-ink font-mono">
                      {selectedAsset.quality || '2K'} · {selectedAsset.aspectRatio || 'auto'}
                    </span>
                  </div>
                  {selectedAsset.creditCost > 0 && (
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-ink-muted">{isZh ? '消耗积分' : 'Credits'}</span>
                      <span className="text-brand font-mono font-semibold">{selectedAsset.creditCost}</span>
                    </div>
                  )}
                </div>
              </div>

              {/* 底部动作按钮 (加 shrink-0 与 pb-1 确保绝不被截断) */}
              <div className="pt-6 space-y-2 shrink-0 pb-1">
                <button
                  type="button"
                  onClick={(e) => handleDoSame(e, selectedAsset)}
                  className="w-full h-9 rounded-xl bg-brand hover:bg-brand-hover active:bg-brand-active active:scale-[0.98] active:duration-instant text-ink-on-accent text-xs font-semibold flex items-center justify-center gap-2 shadow-elevation-1 cursor-pointer transition-[background-color,transform] duration-fast ease-standard focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-brand-ring"
                >
                  <Wand2 className="w-3.5 h-3.5" />
                  <span>{isZh ? '立即做同款' : 'Remix in Studio'}</span>
                </button>

                {selectedAsset.url && (
                  <a
                    href={selectedAsset.url}
                    download={`${selectedAsset.title || 'asset'}.${selectedAsset.type === 'video' ? 'mp4' : selectedAsset.type === 'audio' ? 'mp3' : 'webp'}`}
                    target="_blank"
                    rel="noreferrer"
                    className="w-full h-8 rounded-xl bg-well hover:bg-raised active:scale-[0.98] active:duration-instant border border-line text-ink-muted hover:text-ink text-xs font-medium flex items-center justify-center gap-2 transition-[background-color,color,transform] duration-fast ease-standard cursor-pointer focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-brand-ring"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>{isZh ? '下载原文件' : 'Download Original'}</span>
                  </a>
                )}

                <div className="flex items-center gap-2 pt-1">
                  <button
                    type="button"
                    onClick={(e) => handleToggleStar(e, selectedAsset)}
                    className={`flex-1 h-8 rounded-xl border text-xs font-medium flex items-center justify-center gap-1.5 transition-[background-color,color,border-color,transform] duration-fast ease-standard cursor-pointer active:scale-[0.98] active:duration-instant focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-brand-ring ${
                      selectedAsset.starred
                        ? 'border-amber-400/30 bg-amber-400/10 text-amber-300'
                        : 'border-line bg-well text-ink-muted hover:text-ink hover:bg-raised'
                    }`}
                  >
                    <Star className={`w-3.5 h-3.5 ${selectedAsset.starred ? 'fill-amber-400' : ''}`} />
                    <span>{selectedAsset.starred ? (isZh ? '已收藏' : 'Starred') : (isZh ? '收藏' : 'Star')}</span>
                  </button>

                  <button
                    type="button"
                    onClick={(e) => handleDeleteAsset(e, selectedAsset)}
                    className="h-8 px-3.5 rounded-xl border border-danger-line bg-danger-soft text-danger hover:bg-danger hover:text-ink-on-accent active:scale-[0.98] active:duration-instant text-xs font-medium flex items-center justify-center gap-1 transition-[background-color,color,transform] duration-fast ease-standard cursor-pointer focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-danger"
                    title="删除此资产"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>{isZh ? '删除' : 'Delete'}</span>
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 浮动 Toast 反馈 */}
      {toastMessage && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 px-4 py-2 rounded-full bg-white text-black text-xs font-semibold shadow-elevation-3 animate-fade-in">
          {toastMessage}
        </div>
      )}

      {/* 登录弹窗 */}
      {showAuthModal && (
        <AuthModal
          isOpen={showAuthModal}
          onClose={() => setShowAuthModal(false)}
          onSuccess={() => {
            setShowAuthModal(false);
            refreshSession();
          }}
        />
      )}
    </div>
  );
}
