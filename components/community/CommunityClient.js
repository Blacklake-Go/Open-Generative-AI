'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import {
  AudioLines,
  Clapperboard,
  Compass,
  Copy,
  Flame,
  Heart,
  Image as ImageIcon,
  LoaderCircle,
  MessageCircle,
  Music2,
  Search,
  Share2,
  Sparkles,
  WandSparkles,
  Workflow,
} from 'lucide-react';
import CommunityDetailModal from './CommunityDetailModal';
import StudioHeader from '@/components/site/StudioHeader';
import { resolveClientLocale, getCommonCopy, localizeStudioPath } from '@/lib/locales';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';

const CATEGORIES = [
  { id: 'all', label: '探索发现', icon: Compass },
  { id: 'image', label: 'AI 绘画', icon: ImageIcon },
  { id: 'video', label: 'AI 视频', icon: Clapperboard },
  { id: 'audio', label: 'AI 音乐', icon: Music2 },
  { id: 'workflow', label: '设计工作流', icon: Workflow },
];

const SORTS = [
  { id: 'trending', label: '热门趋势', icon: Flame },
  { id: 'newest', label: '最新发布', icon: Sparkles },
  { id: 'likes', label: '最多赞赏', icon: Heart },
];

function mediaMeta(type) {
  if (type === 'video') return { label: 'AI 视频', Icon: Clapperboard };
  if (type === 'audio') return { label: 'AI 音乐', Icon: AudioLines };
  if (type === 'workflow') return { label: '工作流', Icon: Workflow };
  return { label: 'AI 图像', Icon: ImageIcon };
}

function FeedSkeleton() {
  return (
    <div className="columns-1 gap-4 sm:columns-2 lg:columns-3 xl:columns-4">
      {Array.from({ length: 8 }).map((_, index) => (
        <div key={index} className="mb-4 break-inside-avoid overflow-hidden rounded-2xl border border-border/70 bg-card/60">
          <Skeleton className={`w-full rounded-none ${index % 3 === 0 ? 'h-72' : index % 3 === 1 ? 'h-56' : 'h-80'}`} />
          <div className="flex flex-col gap-3 p-4"><Skeleton className="h-4 w-3/4" /><Skeleton className="h-3 w-1/2" /></div>
        </div>
      ))}
    </div>
  );
}

function FeaturedCaseShowcase({ posts, onOpen, onRemix }) {
  if (!posts?.length) return null;

  const [hero, ...supporting] = posts;
  const heroMedia = hero.media_type === 'video' ? (hero.cover_url || hero.media_url) : (hero.cover_url || hero.media_url);

  return (
    <section aria-labelledby="featured-cases-title" className="relative overflow-hidden rounded-[28px] border border-white/[0.10] bg-[#121419] shadow-2xl shadow-black/25">
      <div className="pointer-events-none absolute -left-24 -top-32 size-96 rounded-full bg-cyan-500/[0.10] blur-3xl" />
      <div className="pointer-events-none absolute -bottom-40 right-0 size-[28rem] rounded-full bg-violet-500/[0.10] blur-3xl" />
      <div className="relative flex flex-col gap-6 p-5 sm:p-7 lg:p-8">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-cyan-300">
              <Sparkles className="size-4" />
              精选案例
            </div>
            <h2 id="featured-cases-title" className="mt-2 text-2xl font-bold tracking-tight text-white sm:text-3xl">从灵感到成片，看看创作者怎么做</h2>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-gray-400">精选真实社区作品，保留提示词、模型和创作方法，方便你直接拆解并做同款。</p>
          </div>
          <Link href="/creations" className="text-xs font-semibold text-cyan-300 transition-colors hover:text-cyan-200">分享我的案例 →</Link>
        </div>

        <div className="grid gap-4 lg:grid-cols-[minmax(0,1.6fr)_minmax(280px,0.9fr)]">
          <article className="group relative min-h-[360px] overflow-hidden rounded-2xl border border-white/[0.10] bg-black/30">
            <button type="button" onClick={() => onOpen(hero.id)} className="absolute inset-0 text-left" aria-label={`打开精选案例：${hero.title}`}>
              <img src={heroMedia} alt={hero.title || '精选案例'} className="h-full min-h-[360px] w-full object-cover transition duration-700 group-hover:scale-[1.035]" />
              <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/15 to-transparent" />
              <div className="absolute inset-x-0 bottom-0 p-5 sm:p-6">
                <div className="mb-3 flex flex-wrap gap-2">
                  {(hero.tags || []).slice(0, 3).map((tag) => <span key={tag} className="rounded-full border border-white/20 bg-black/35 px-2.5 py-1 text-[11px] text-white/85 backdrop-blur">#{tag}</span>)}
                </div>
                <h3 className="max-w-xl text-xl font-bold tracking-tight text-white sm:text-2xl">{hero.title || '未命名案例'}</h3>
                <p className="mt-2 line-clamp-2 max-w-2xl text-sm leading-6 text-white/70">{hero.description || hero.prompt || '查看这个案例的提示词与参数，快速复用创作方法。'}</p>
                <div className="mt-4 flex items-center gap-4 text-xs text-white/65">
                  <span>{hero.author_name || hero.author_username || '社区创作者'}</span>
                  <span>♥ {hero.likes_count || 0}</span>
                  <span>◉ {hero.views_count || 0}</span>
                </div>
              </div>
            </button>
            <button type="button" onClick={(event) => onRemix(hero, event)} className="absolute right-4 top-4 inline-flex items-center gap-1.5 rounded-full bg-white px-3.5 py-2 text-xs font-bold text-black shadow-xl transition hover:bg-cyan-100">
              <WandSparkles className="size-3.5" />做同款
            </button>
          </article>

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-1">
            {supporting.slice(0, 2).map((post) => (
              <button key={post.id} type="button" onClick={() => onOpen(post.id)} className="group flex min-h-[172px] gap-4 overflow-hidden rounded-2xl border border-white/[0.10] bg-black/20 p-3 text-left transition hover:border-cyan-300/35 hover:bg-white/[0.04]">
                <img src={post.cover_url || post.media_url} alt={post.title || '精选案例'} className="h-[146px] w-[116px] shrink-0 rounded-xl object-cover transition duration-500 group-hover:scale-[1.03]" />
                <span className="flex min-w-0 flex-1 flex-col justify-center">
                  <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-cyan-300">{post.media_type === 'video' ? 'AI 视频案例' : 'AI 图像案例'}</span>
                  <span className="mt-2 line-clamp-2 text-sm font-bold leading-5 text-white">{post.title || '未命名案例'}</span>
                  <span className="mt-2 line-clamp-2 text-xs leading-5 text-gray-400">{post.description || post.prompt || '查看提示词与参数'}</span>
                  <span className="mt-auto pt-3 text-[11px] text-gray-500">♥ {post.likes_count || 0} · {post.author_name || post.author_username || '社区创作者'}</span>
                </span>
              </button>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

function PostCard({ post, onOpen, onLike, onRemix }) {
  const { label, Icon } = mediaMeta(post.media_type);
  const isVideo = post.media_type === 'video';
  const isAudio = post.media_type === 'audio';

  return (
    <Card className="group mb-4 break-inside-avoid overflow-hidden border-border/75 bg-card/65 py-0 shadow-none transition-all duration-300 hover:-translate-y-1 hover:border-primary/35 hover:shadow-[0_22px_70px_-30px_hsl(var(--primary)/0.55)]">
      <button type="button" className="block w-full text-left" onClick={() => onOpen(post.id)} aria-label={`打开作品：${post.title}`}>
        <div className="relative overflow-hidden bg-muted/40">
          {isVideo ? (
            <video src={post.cover_url || post.media_url} muted loop playsInline className="block max-h-[30rem] min-h-44 w-full object-cover transition duration-500 group-hover:scale-[1.03]" />
          ) : isAudio ? (
            <div className="flex min-h-56 flex-col items-center justify-center gap-4 bg-gradient-to-br from-primary/15 via-card to-accent/15 p-6 text-primary">
              <span className="flex size-16 items-center justify-center rounded-full border border-primary/30 bg-primary/10 shadow-[0_0_36px_hsl(var(--primary)/0.22)]"><AudioLines className="size-7" /></span>
              <span className="text-xs font-medium tracking-wide">音频创作</span>
            </div>
          ) : (
            <img src={post.cover_url || post.media_url} alt={post.title} loading="lazy" className="block max-h-[32rem] min-h-44 w-full object-cover transition duration-500 group-hover:scale-[1.03]" />
          )}
          <div className="absolute inset-x-0 bottom-0 h-28 bg-gradient-to-t from-background/85 to-transparent" />
          <Badge variant="secondary" className="absolute left-3 top-3 border border-white/10 bg-background/75 text-foreground backdrop-blur-md"><Icon />{label}</Badge>
          <div className="absolute bottom-3 left-3 right-3 flex items-end justify-between gap-3 opacity-0 transition-opacity duration-300 group-hover:opacity-100">
            <span className="line-clamp-2 text-xs font-medium text-foreground">{post.title}</span>
            <span className="flex shrink-0 items-center gap-1 rounded-full border border-white/10 bg-background/80 px-2 py-1 text-[11px] text-muted-foreground backdrop-blur"><MessageCircle />{post.comments_count || 0}</span>
          </div>
        </div>
      </button>
      <CardContent className="flex flex-col gap-3 p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 className="truncate text-sm font-semibold text-foreground">{post.title || '未命名作品'}</h3>
            <Link
              href={`/u/${post.author_user_number || post.user_id || ''}`}
              onClick={(e) => e.stopPropagation()}
              className="mt-1 block truncate text-xs text-muted-foreground transition-colors hover:text-primary hover:underline"
            >
              {post.author_name || post.author_username || '社区创作者'}
            </Link>
          </div>
          <Button type="button" variant="ghost" size="icon-sm" aria-label="点赞" className={post.is_liked ? 'text-primary' : 'text-muted-foreground'} onClick={(event) => onLike(post, event)}>
            <Heart className={post.is_liked ? 'fill-current' : ''} />
            <span className="sr-only">{post.likes_count || 0} 个赞</span>
          </Button>
        </div>
        <div className="flex items-center justify-between text-[11px] text-muted-foreground">
          <div className="flex items-center gap-1.5">
            <span>{post.likes_count || 0} 赞</span>
            <span>·</span>
            <span className="text-amber-400/90 font-medium">🪙 {post.coins_count || 0} 币</span>
          </div>
          <Button type="button" variant="ghost" size="xs" className="text-primary hover:bg-primary/10" onClick={(event) => onRemix(post, event)}>
            <WandSparkles data-icon="inline-start" />做同款
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

export default function CommunityClient({ initialPostId = null, locale: localeProp = null }) {
  const [posts, setPosts] = useState([]);
  const [featuredPosts, setFeaturedPosts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [category, setCategory] = useState('all');
  const [sort, setSort] = useState('trending');
  const [searchQuery, setSearchQuery] = useState('');
  const [activePostId, setActivePostId] = useState(initialPostId);
  const [toastMsg, setToastMsg] = useState('');

  const triggerToast = (message) => {
    setToastMsg(message);
    window.setTimeout(() => setToastMsg(''), 2500);
  };

  const loadPosts = useCallback(async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams({ limit: '36', sort });
      if (category !== 'all') params.set('category', category);
      if (searchQuery.trim()) params.set('q', searchQuery.trim());
      const response = await fetch(`/api/community/posts?${params.toString()}`, { cache: 'no-store' });
      const data = await response.json();
      if (Array.isArray(data.posts)) setPosts(data.posts);
    } catch (error) {
      console.error('加载社区作品失败', error);
      triggerToast('加载失败，请稍后重试');
    } finally {
      setLoading(false);
    }
  }, [category, searchQuery, sort]);

  useEffect(() => { loadPosts(); }, [loadPosts]);

  useEffect(() => {
    let mounted = true;
    fetch('/api/community/posts?limit=3&sort=featured&featured=true', { cache: 'no-store' })
      .then((response) => response.ok ? response.json() : null)
      .then((data) => {
        if (mounted && Array.isArray(data?.posts)) setFeaturedPosts(data.posts);
      })
      .catch(() => {});
    return () => { mounted = false; };
  }, []);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const sp = new URLSearchParams(window.location.search);
      if (sp.get('tab') === 'remix') {
        const timer = setTimeout(() => {
          const featuredSection = document.getElementById('featured-cases-title');
          if (featuredSection) {
            featuredSection.scrollIntoView({ behavior: 'smooth', block: 'center' });
          }
        }, 200);
        return () => clearTimeout(timer);
      }
    }
  }, []);

  const handleLike = async (post, event) => {
    event.stopPropagation();
    try {
      const response = await fetch(`/api/community/posts/${post.id}/like`, { method: 'POST' });
      const data = await response.json();
      if (!response.ok) return triggerToast(data.error || '请先登录');
      setPosts((current) => current.map((item) => item.id === post.id ? { ...item, is_liked: data.isLiked, likes_count: data.likesCount } : item));
    } catch { triggerToast('网络连接失败'); }
  };

  const activeLocale = resolveClientLocale({
    explicit: localeProp,
    pathname: typeof window !== 'undefined' ? window.location.pathname : '',
    search: typeof window !== 'undefined' ? window.location.search : '',
    userLocale: typeof document !== 'undefined' ? document.cookie.match(/(?:^|;\s*)(?:NEXT_LOCALE|locale)=([^;]+)/)?.[1] : null,
  });
  const copy = getCommonCopy(activeLocale);

  const handleRemix = (post, event) => {
    event.stopPropagation();
    fetch(`/api/community/posts/${post.id}/remix`, { method: 'POST' }).catch(() => {});
    const target = post.media_type === 'video' ? 'video' : post.media_type === 'audio' ? 'audio' : post.media_type === 'workflow' ? 'workflow' : 'image';
    const params = new URLSearchParams();
    if (post.prompt) params.set('remixPrompt', post.prompt);
    if (target === 'video') {
      params.set('model', 'kling-v2.6-pro-t2v');
    } else if (target === 'image') {
      params.set('model', 'gpt-image-2.5-flash');
    }
    const studioUrl = localizeStudioPath(activeLocale, target);
    window.location.href = `${studioUrl}?${params.toString()}`;
  };

  return (
    <main className="min-h-screen bg-[#0e0f11] text-foreground flex flex-col selection:bg-white/20">
      <StudioHeader
        action="creations"
        showBrand
        locale={activeLocale}
        title={copy.shell?.community?.replace(/^🔥\s*/, '') || 'Community'}
        subtitle={copy.shell?.communityTitle || 'Discover inspiration, remix creative workflows'}
      />
      {toastMsg && <div role="status" className="fixed left-1/2 top-20 z-50 -translate-x-1/2 rounded-full border border-primary/30 bg-popover/95 px-4 py-2 text-xs font-medium text-primary shadow-2xl backdrop-blur-xl animate-float-in">{toastMsg}</div>}
      
      {/* 居中主内容区：严格对齐个人中心的 1360px 版心与自适应留白 */}
      <div className="flex-1 mx-auto w-full max-w-[1360px] px-6 sm:px-8 lg:px-12 py-8 sm:py-10 flex flex-col gap-8">
        <FeaturedCaseShowcase posts={featuredPosts} onOpen={setActivePostId} onRemix={handleRemix} />
        <section className="relative overflow-hidden rounded-[24px] border border-white/[0.08] bg-[#16171a]/95 px-6 py-10 text-center shadow-xl backdrop-blur-md sm:px-12 sm:py-14">
          <div className="pointer-events-none absolute -left-16 -top-20 size-72 rounded-full bg-primary/10 blur-3xl" />
          <div className="pointer-events-none absolute -bottom-24 -right-16 size-80 rounded-full bg-accent/10 blur-3xl" />
          <div className="relative mx-auto max-w-3xl">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-white/10 px-3 py-1 text-xs font-medium text-white/90">
              <Sparkles className="size-3.5" />
              灵感社区
            </span>
            <h1 className="mt-5 text-3xl font-bold tracking-tight text-white sm:text-5xl">把灵感变成下一次创作</h1>
            <p className="mx-auto mt-4 max-w-2xl text-xs sm:text-sm leading-relaxed text-gray-400 font-normal">探索生图、视频、音乐与工作流作品，查看提示词和参数，带着方法直接开始。</p>
            <form onSubmit={(event) => { event.preventDefault(); loadPosts(); }} className="mx-auto mt-8 flex max-w-2xl items-center gap-2 rounded-full border border-white/[0.10] bg-[#121316] p-1.5 shadow-elevation-2 transition focus-within:border-brand-line focus-within:ring-2 focus-within:ring-brand/20">
              <Search className="ml-3.5 size-4 shrink-0 text-ink-muted" />
              <input value={searchQuery} onChange={(event) => setSearchQuery(event.target.value)} placeholder="搜索提示词、风格或模型" className="h-10 sm:h-11 flex-1 border-0 bg-transparent px-2.5 text-sm text-white placeholder:text-ink-subtle focus:outline-none rounded-xl" />
              <button type="submit" className="h-10 sm:h-11 rounded-full bg-white px-6 text-xs sm:text-sm font-semibold text-black shadow-elevation-1 transition-all hover:bg-white/90 active:scale-95 cursor-pointer">搜索</button>
            </form>
          </div>
        </section>

        {/* 分类过滤器与排序切换栏（严格遵循连续胶囊 UI 规范） */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-white/[0.06] pb-5">
          <div className="inline-flex max-w-full overflow-x-auto items-center gap-1.5 p-1 rounded-full bg-surface-raised border border-line-subtle no-scrollbar" role="tablist" aria-label="作品分类">
            {CATEGORIES.map(({ id, label, icon: Icon }) => {
              const isSelected = category === id;
              return (
                <button
                  key={id}
                  type="button"
                  role="tab"
                  aria-selected={isSelected}
                  onClick={() => setCategory(id)}
                  className={`flex shrink-0 items-center gap-2 h-8 px-4 rounded-full text-xs font-semibold transition-all cursor-pointer ${
                    isSelected
                      ? 'bg-white text-black shadow-elevation-1'
                      : 'text-ink-muted hover:text-white hover:bg-wash'
                  }`}
                >
                  <Icon className="size-3.5" />
                  <span>{label}</span>
                </button>
              );
            })}
          </div>

          <div className="inline-flex items-center gap-1 p-1 rounded-full bg-surface-raised border border-line-subtle self-start sm:self-auto" role="tablist" aria-label="排序规则">
            {SORTS.map(({ id, label, icon: Icon }) => {
              const isSelected = sort === id;
              return (
                <button
                  key={id}
                  type="button"
                  role="tab"
                  aria-selected={isSelected}
                  onClick={() => setSort(id)}
                  className={`flex items-center gap-1.5 h-8 px-3.5 rounded-full text-xs font-medium transition-all cursor-pointer ${
                    isSelected
                      ? 'bg-white/15 text-white font-semibold shadow-elevation-1'
                      : 'text-ink-muted hover:text-white hover:bg-wash'
                  }`}
                >
                  <Icon className="size-3.5" />
                  <span>{label}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* 内容网格与大卡片空状态（对齐个人中心） */}
        <section className="flex-1 flex flex-col min-h-[420px]" aria-live="polite">
          {loading ? (
            <FeedSkeleton />
          ) : posts.length === 0 ? (
            <div className="flex-1 rounded-[28px] border border-white/[0.07] bg-[#16171a]/80 backdrop-blur-sm p-12 sm:p-20 text-center flex flex-col items-center justify-center shadow-xl">
              <div className="flex size-14 items-center justify-center rounded-2xl border border-white/[0.08] bg-white/[0.04] text-white shadow-inner">
                <Compass className="size-6 text-white" />
              </div>
              <h3 className="mt-5 text-base font-bold text-white tracking-wide">还没有匹配的灵感</h3>
              <p className="mt-2 text-xs sm:text-sm text-gray-400 max-w-md mx-auto leading-relaxed">
                换个关键词，或成为第一个在此频道发布创作成果的创作者。
              </p>
              <div className="mt-6">
                <Link
                  href="/creations"
                  className="inline-flex items-center gap-2 rounded-full bg-white hover:bg-white/90 text-black px-6 py-2.5 text-xs sm:text-sm font-semibold shadow-lg transition-transform active:scale-95"
                >
                  <Share2 className="size-4" />
                  从我的作品分享
                </Link>
              </div>
            </div>
          ) : (
            <div className="columns-1 gap-5 sm:columns-2 lg:columns-3 xl:columns-4">
              {posts.map((post) => (
                <PostCard key={post.id} post={post} onOpen={setActivePostId} onLike={handleLike} onRemix={handleRemix} />
              ))}
            </div>
          )}
        </section>
      </div>
      {activePostId && <CommunityDetailModal postId={activePostId} initialPost={posts.find((post) => post.id === activePostId)} onClose={() => setActivePostId(null)} onLikeChange={(id, liked, count) => setPosts((current) => current.map((post) => post.id === id ? { ...post, is_liked: liked, likes_count: count } : post))} />}
    </main>
  );
}
