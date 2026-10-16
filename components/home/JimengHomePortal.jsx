'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import toast from 'react-hot-toast';
import { Layers, Sparkles, ExternalLink, ArrowRight } from 'lucide-react';
import StudioHeader from '@/components/site/StudioHeader';
import { SpatialBackground } from '@/components/spatial';
import { useUserSession } from '@/lib/hooks/useUserSession';
import { localizeStudioPath, normalizeLocale, getCommonCopy, getLocaleConfig } from '@/lib/locales';
import HomeStudioPromptComposer from './HomeStudioPromptComposer';
import AuthModal from '@/components/AuthModal';

// 快捷技能预设标签列表（针对图像生成器优化的影视摄影与大师创作体系）
const getSkillPresets = (locale, tHome) => {
  const norm = normalizeLocale(locale);
  const isZh = norm.startsWith('zh');
  return [
    {
      id: 'cinematic-light',
      label: isZh ? '/ 电影光影与质感' : (norm === 'ja-JP' ? '/ シネマ光影・質感' : (norm === 'ko-KR' ? '/ 시네마틱 라이팅' : (norm === 'es' ? '/ Luz Cinematográfica' : '/ Cinematic Lighting & Texture'))),
      badge: 'New',
      badgeType: 'blue',
      prompt: isZh ? '4K超清电影级质感，大师布光，丁达尔光束，胶片颗粒与高级景深' : '4K ultra cinematic lighting, volumetric Tyndall rays, 35mm film grain, shallow depth of field',
    },
    {
      id: 'master-portrait',
      label: isZh ? '/ 8K 极清大师肖像' : (norm === 'ja-JP' ? '/ 8K極清ポートレート' : (norm === 'ko-KR' ? '/ 8K 거장 인물' : (norm === 'es' ? '/ Retrato Maestro 8K' : '/ 8K Master Portrait'))),
      badge: 'New',
      badgeType: 'blue',
      prompt: isZh ? '哈苏顶级人像特写，真实细腻皮肤纹理，柔焦散景，自然生动的面部微表情' : 'Hasselblad master portrait close-up, hyper-realistic skin texture, soft bokeh, natural micro-expressions',
    },
    {
      id: 'surreal-concept',
      label: isZh ? '/ 超现实概念场景' : (norm === 'ja-JP' ? '/ 超現実コンセプト' : (norm === 'ko-KR' ? '/ 초현실 컨셉' : (norm === 'es' ? '/ Concepto Surrealista' : '/ Surreal Concept Scene'))),
      badge: 'Hot',
      badgeType: 'orange',
      prompt: isZh ? '概念艺术大师构图，宏大超现实奇幻场景，虚幻引擎5渲染，磅礴空间纵深' : 'Epic surreal concept art, Unreal Engine 5 render, majestic spatial depth and ethereal atmosphere',
    },
    {
      id: 'commercial-film',
      label: isZh ? '/ 商业广告大片' : (norm === 'ja-JP' ? '/ CM広告ビジュアル' : (norm === 'ko-KR' ? '/ 상업 광고 비주얼' : (norm === 'es' ? '/ Cine Publicitario' : '/ Commercial Film & Ad'))),
      badge: 'Hot',
      badgeType: 'orange',
      prompt: isZh ? '极简现代高端商业广告美学，纯净高光反光，产品高级静物摄影，杂志封面质感' : 'High-end commercial advertisement aesthetics, minimalist studio lighting, pristine reflections, magazine cover',
    },
    {
      id: 'anime-scene',
      label: isZh ? '/ 新海诚二次元分镜' : (norm === 'ja-JP' ? '/ アニメ映画カット' : (norm === 'ko-KR' ? '/ 애니메이션 연출' : (norm === 'es' ? '/ Escena Anime' : '/ Anime Cinematic Scene'))),
      badge: null,
      badgeType: 'neutral',
      prompt: isZh ? '新海诚唯美动漫电影风，透亮蓝天白云，细腻唯美色彩光晕，经典日系分镜' : 'Makoto Shinkai aesthetic anime film style, radiant clouds, vibrant sunset glow, scenic anime composition',
    },
    {
      id: 'cyber-future',
      label: isZh ? '/ 赛博未来全息' : (norm === 'ja-JP' ? '/ サイバーホログラム' : (norm === 'ko-KR' ? '/ 사이버 홀로그램' : (norm === 'es' ? '/ Cyberpunk Holograma' : '/ Cyberpunk Hologram'))),
      badge: null,
      badgeType: 'neutral',
      prompt: isZh ? '未来赛博科技美学，霓虹光带与全息悬浮投影，雨夜倒影与金属机械构造' : 'Futuristic cyberpunk aesthetics, holographic neon projections, rain reflections and intricate biomechanical details',
    },
    {
      id: 'more-skills',
      label: tHome.moreSkills || (isZh ? '更多工作流与智能体 ›' : 'More Workflows & Agents ›'),
      badge: null,
      badgeType: 'link',
      href: `${localizeStudioPath(norm)}?tab=workflows`,
    },
  ];
};

// 最近上新展台卡片（全站 SupDance 真实生态与同款参数装配）
const getRecentFeatures = (locale, tHome, rootPath) => {
  const norm = normalizeLocale(locale);
  const isZh = norm.startsWith('zh');
  return [
    {
      id: 'mango-glass-pro',
      title: tHome.featuredCreations ? `${tHome.featuredCreations}\nMANGO GLASS PRO` : '精选作品\nMANGO GLASS PRO',
      author: '@翻月岚',
      category: tHome.featuredCreations || '精选作品',
      badge: isZh ? '精选' : 'PRO',
      gradient: 'from-amber-600/30 to-purple-900/40',
      bgImage: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=800&auto=format&fit=crop&q=80',
      tab: 'image',
      model: 'gpt-image-2.5-flash',
      ar: '3:4',
      quality: '2K',
      prompt: 'MANGO GLASS PRO 时尚概念人像摄影，复古太阳镜，冷峻高级面部光影，杂志封面构图，超高分辨率电影级质感',
    },
    {
      id: 'supdance-mcp-cli',
      title: isZh ? 'SupDance MCP / CLI\n开发生态' : 'SupDance MCP & CLI\nDev Ecosystem',
      desc: isZh ? '支持 Cursor / Claude 等任意 Agent 自动化调用' : 'Automated calls from Cursor, Claude & custom agents',
      category: isZh ? '开发生态' : 'Ecosystem',
      badge: 'NEW',
      gradient: 'from-blue-600/30 to-indigo-950/40',
      bgImage: 'https://images.unsplash.com/photo-1526374965328-7f61d4dc18c5?w=800&auto=format&fit=crop&q=80',
      tab: 'api',
      href: rootPath ? `${rootPath}/call-api` : '/call-api',
    },
    {
      id: 'seedance-sample',
      title: isZh ? 'Seedance 2.5\n电影运镜模式' : 'Seedance 2.5\nCinematic Motion',
      desc: isZh ? '原生音视频协同，电影级大范围运镜与史诗全景' : 'Native A/V sync, cinematic camera tracking & epic views',
      category: isZh ? '模型突破' : 'Model',
      badge: isZh ? '升级' : 'UPGRADE',
      gradient: 'from-emerald-600/30 to-slate-900/40',
      bgImage: 'https://images.unsplash.com/photo-1506744038136-46273834b3fb?w=800&auto=format&fit=crop&q=80',
      tab: 'video',
      model: 'seedance-2.5-text-to-video',
      prompt: '巨石阵日出史诗全景，电影级空镜，广角远景与迷雾缭绕，4K超高清画质',
    },
    {
      id: 'supdance-cinema-studio',
      title: isZh ? 'SupDance 电影片场\nCinema Studio' : 'SupDance Cinema Studio\nCinematic Craft',
      desc: isZh ? '大师镜头语言与多机位导演拍摄控制台' : 'Master camera builder & multi-angle directorial shooting',
      category: isZh ? '全新上线' : 'New Launch',
      badge: 'HOT',
      gradient: 'from-rose-600/30 to-neutral-900/40',
      bgImage: 'https://images.unsplash.com/photo-1485846234645-a62644f84728?w=800&auto=format&fit=crop&q=80',
      tab: 'cinema',
      prompt: '70年代经典复古电影片场，电影级变形宽荧幕镜头，暖色调光斑与故事感人物叙事',
    },
  ];
};

export default function JimengHomePortal({ locale = 'zh', initialUser = undefined }) {
  const router = useRouter();
  const { user } = useUserSession(initialUser);
  const [activeMode, setActiveMode] = useState('generate'); // 'generate' | 'canvas'
  const composerRef = useRef(null);
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [pendingTask, setPendingTask] = useState(null);
  const [activeSkillId, setActiveSkillId] = useState(null);
  const [mounted, setMounted] = useState(false);
  const pendingAuthResolverRef = useRef(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  const normLocale = normalizeLocale(locale);
  const copy = getCommonCopy(normLocale);
  const tHome = copy.homePortal || {};
  const isZh = normLocale.startsWith('zh');
  const rootPath = getLocaleConfig(normLocale)?.rootPath || '';
  const studioBase = localizeStudioPath(normLocale);
  const assetHref = rootPath ? `${rootPath}/assets` : '/assets';

  const skillPresets = getSkillPresets(normLocale, tHome);
  const recentFeatures = getRecentFeatures(normLocale, tHome, rootPath);

  // 全局账户额度守卫：在首页遇到未登录时弹出统一 AuthModal
  const requireAccountGate = useCallback(() => {
    return new Promise((resolve) => {
      if (user) {
        resolve(user);
        return;
      }
      pendingAuthResolverRef.current = { resolve };
      setShowAuthModal(true);
    });
  }, [user]);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      window.__SUPDANCE_REQUIRE_ACCOUNT__ = requireAccountGate;
      window.__SUPDANCE_REQUIRE_API_KEY__ = async () => {
        const u = await requireAccountGate();
        return u ? 'supdance-account-session' : null;
      };
    }
    return () => {
      if (typeof window !== 'undefined') {
        delete window.__SUPDANCE_REQUIRE_ACCOUNT__;
        delete window.__SUPDANCE_REQUIRE_API_KEY__;
      }
    };
  }, [requireAccountGate]);

  // 动态时段问候语：挂载前固定输出 default，杜绝水合闪烁
  const getGreeting = () => {
    if (!mounted) {
      return tHome.greetingDefault || (isZh ? '你好，今天想要创作什么？' : 'Hello, what would you like to create today?');
    }
    const hour = new Date().getHours();
    if (hour < 11) return tHome.greetingMorning || tHome.greetingDefault;
    if (hour < 14) return tHome.greetingNoon || tHome.greetingDefault;
    if (hour < 18) return tHome.greetingAfternoon || tHome.greetingDefault;
    return tHome.greetingEvening || tHome.greetingDefault;
  };

  // 点击卡片：一键装配创作参数或跳转
  const handleFeatureCardClick = (item) => {
    if (item.href) {
      router.push(item.href);
      return;
    }
    if (item.tab === 'image') {
      composerRef.current?.applyCreationPreset({
        prompt: item.prompt,
        ar: item.ar,
        quality: item.quality,
        modelId: item.model,
      });
      window.scrollTo({ top: 120, behavior: 'smooth' });
      toast.success(isZh ? '已装配精选作品同款创作参数' : 'Loaded creation preset');
      return;
    }
    const params = new URLSearchParams();
    params.set('tab', item.tab);
    if (item.model) params.set('model', item.model);
    if (item.prompt) params.set('prompt', item.prompt);
    params.set('auto', '1');
    router.push(`${studioBase}?${params.toString()}`);
  };

  // 点击技能标签：交互式切换高亮与提示词协同
  const handleSkillClick = (skill) => {
    if (skill.href) {
      router.push(skill.href);
      return;
    }
    if (skill.prompt) {
      if (activeSkillId === skill.id) {
        setActiveSkillId(null);
        composerRef.current?.toggleSkillPrompt(skill.prompt);
        toast(isZh ? '已取消技能预设' : 'Skill preset removed', { icon: '↩' });
      } else {
        setActiveSkillId(skill.id);
        composerRef.current?.toggleSkillPrompt(skill.prompt);
        toast.success(isZh ? `已应用技能: ${skill.label.replace('/ ', '')}` : `Applied skill: ${skill.label}`);
      }
    }
  };

  const handleAuthSuccess = () => {
    setShowAuthModal(false);
    if (pendingAuthResolverRef.current) {
      pendingAuthResolverRef.current.resolve?.(user || true);
      pendingAuthResolverRef.current = null;
    }
    if (pendingTask) {
      const { prompt, model, ar, quality, batch } = pendingTask;
      const params = new URLSearchParams();
      params.set('tab', 'image');
      if (prompt) params.set('prompt', prompt);
      if (model) params.set('model', model);
      if (ar) params.set('ar', ar);
      if (quality) params.set('quality', quality);
      if (batch > 1) params.set('batch', String(batch));
      params.set('auto', '1');
      router.push(`${studioBase}?${params.toString()}`);
    }
  };

  const handleAuthClose = () => {
    setShowAuthModal(false);
    if (pendingAuthResolverRef.current) {
      pendingAuthResolverRef.current.resolve?.(null);
      pendingAuthResolverRef.current = null;
    }
  };

  return (
    <div className="min-h-screen bg-canvas text-ink relative selection:bg-brand selection:text-white flex flex-col justify-between overflow-x-hidden">
      {/* 1. 保留网站既有空间极光与工程点阵背景特效 */}
      <SpatialBackground />
      <div className="absolute inset-0 bg-dot-grid opacity-40 pointer-events-none z-0" />

      {/* 2. 统一顶栏：显式透传服务端一致的 locale 与 user */}
      <StudioHeader locale={normLocale} activeTab={null} className="relative z-40" initialUser={user} />

      {/* 3. 首页主舞台黄金视口区 */}
      <main className="relative z-10 flex-1 flex flex-col items-center justify-start pt-24 md:pt-32 pb-16 px-4 max-w-6xl mx-auto w-full">
        {/* 顶部中央问候语 */}
        <h1 className="text-3xl sm:text-4xl md:text-[42px] font-semibold tracking-tight text-center bg-gradient-to-b from-white via-white/95 to-white/70 bg-clip-text text-transparent mb-7 select-none">
          {getGreeting()}
        </h1>

        {/* 核心模式分段器 (生成 vs 画布) — 遵循 UI_REPAIR_INSTRUCTION.md 规范 */}
        <div
          data-pill-segmented
          className="inline-flex items-center p-1 rounded-full bg-[#181a20]/90 border border-white/10 shadow-elevation-1 mb-8 backdrop-blur-md"
        >
          <button
            type="button"
            data-pill-segment-item
            onClick={() => setActiveMode('generate')}
            className={`h-8 px-6 rounded-full text-xs sm:text-sm font-medium transition-all cursor-pointer ${
              activeMode === 'generate'
                ? 'bg-white text-black font-semibold shadow-elevation-1 scale-100'
                : 'text-ink-muted hover:text-ink'
            }`}
          >
            {tHome.modeGenerate || (isZh ? '生成' : 'Generate')}
          </button>
          <button
            type="button"
            data-pill-segment-item
            onClick={() => setActiveMode('canvas')}
            className={`h-8 px-6 rounded-full text-xs sm:text-sm font-medium transition-all cursor-pointer ${
              activeMode === 'canvas'
                ? 'bg-white text-black font-semibold shadow-elevation-1 scale-100'
                : 'text-ink-muted hover:text-ink'
            }`}
          >
            {tHome.modeCanvas || (isZh ? '画布' : 'Canvas')}
          </button>
        </div>

        {/* 画布模式专属空间导引面板 (当选择画布模式时展示) */}
        {activeMode === 'canvas' ? (
          <div className="w-full max-w-[880px] rounded-2xl bg-[#16181d]/90 border border-white/15 p-6 sm:p-8 backdrop-blur-xl shadow-elevation-3 flex flex-col gap-6 animate-fade-in">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pb-5 border-b border-white/10">
              <div className="flex items-center gap-3">
                <div className="size-11 rounded-xl bg-brand/10 border border-brand/20 flex items-center justify-center text-brand">
                  <Layers className="size-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-white">
                    {isZh ? 'SupDance 创意画布工作台' : 'SupDance Creative Canvas Workspaces'}
                  </h3>
                  <p className="text-xs text-ink-muted mt-0.5">
                    {isZh ? '选择适合您创作流程的画布空间：专业分层画板或无限灵感白板' : 'Choose your canvas workspace: Layered Studio or Infinite Visual Canvas'}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setActiveMode('generate')}
                className="text-xs text-ink-subtle hover:text-white px-3 py-1.5 rounded-lg border border-white/10 hover:bg-wash transition-colors"
              >
                {isZh ? '← 返回极速生成' : '← Back to Generator'}
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* Option 1: 图层工作室 */}
              <div
                onClick={() => router.push(`${studioBase}?tab=layers`)}
                className="group relative p-5 rounded-xl border border-white/10 hover:border-brand-line bg-white/[0.02] hover:bg-white/[0.05] cursor-pointer transition-all duration-200 flex flex-col justify-between min-h-[160px]"
              >
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-brand/20 text-brand border border-brand/30 uppercase tracking-wider">
                      STUDIO TAB
                    </span>
                    <ArrowRight className="size-4 text-ink-subtle group-hover:text-brand group-hover:translate-x-1 transition-all" />
                  </div>
                  <h4 className="text-sm font-bold text-white group-hover:text-brand transition-colors">
                    {isZh ? '图层画板 (Layers Studio)' : 'Layers Studio'}
                  </h4>
                  <p className="text-xs text-ink-muted mt-1 leading-relaxed">
                    {isZh ? '深度图层分离、主体微调重绘与多素材精准排版合成。' : 'Layer decomposition, precise inpainting and visual element composition.'}
                  </p>
                </div>
                <div className="text-[11px] font-semibold text-brand pt-2 flex items-center gap-1">
                  <span>{isZh ? '立即进入画板 ›' : 'Open Layers Studio ›'}</span>
                </div>
              </div>

              {/* Option 2: 无限画布 */}
              <a
                href="/canvas"
                target="_blank"
                rel="noopener noreferrer"
                className="group relative p-5 rounded-xl border border-white/10 hover:border-brand-line bg-white/[0.02] hover:bg-white/[0.05] cursor-pointer transition-all duration-200 flex flex-col justify-between min-h-[160px]"
              >
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-brand-soft text-brand border border-brand-line uppercase tracking-wider">
                      STANDALONE
                    </span>
                    <ExternalLink className="size-4 text-ink-subtle group-hover:text-brand transition-colors" />
                  </div>
                  <h4 className="text-sm font-bold text-white group-hover:text-brand transition-colors">
                    {isZh ? '无限画布 (Infinite Canvas)' : 'Infinite Canvas'}
                  </h4>
                  <p className="text-xs text-ink-muted mt-1 leading-relaxed">
                    {isZh ? '无边界节点式无限大白板，多图联动、视听跨模态灵感串联。' : 'Unbounded node-based board, multi-image cross-modal ideation and infinite zoom.'}
                  </p>
                </div>
                <div className="text-[11px] font-semibold text-brand pt-2 flex items-center gap-1">
                  <span>{isZh ? '打开无限画布 ↗' : 'Launch Infinite Canvas ↗'}</span>
                </div>
              </a>
            </div>
          </div>
        ) : (
          /* 生成模式高保真多功能工作室输入框控制台 */
          <HomeStudioPromptComposer
            ref={composerRef}
            locale={locale}
            onRequireAuth={(task) => {
              setPendingTask(task);
              setShowAuthModal(true);
            }}
          />
        )}

        {/* 快捷技能预设胶囊推荐列表 */}
        <div className="w-full max-w-[880px] flex items-center gap-2 overflow-x-auto py-3.5 no-scrollbar scrollbar-rail">
          {skillPresets.map((skill) => {
            const isActive = activeSkillId === skill.id;
            return (
              <button
                key={skill.id}
                type="button"
                onClick={() => handleSkillClick(skill)}
                className={`h-8 px-3.5 rounded-full text-xs font-medium shrink-0 flex items-center gap-1.5 transition-all cursor-pointer active:scale-95 shadow-sm ${
                  isActive
                    ? 'bg-brand text-white border border-brand-line shadow-elevation-1'
                    : 'bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.08] hover:border-white/20 text-white/80 hover:text-white'
                }`}
              >
                <span>{skill.label}</span>
                {skill.badge && (
                  <span
                    className={`text-[10px] px-1.5 py-0.2 rounded-full font-bold uppercase tracking-wider ${
                      isActive
                        ? 'bg-white/20 text-white'
                        : skill.badgeType === 'blue'
                        ? 'bg-blue-500/20 text-blue-400 border border-blue-500/30'
                        : 'bg-rose-500/20 text-rose-400 border border-rose-500/30'
                    }`}
                  >
                    {skill.badge}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* 4. 底部“最近上新”卡片展台 */}
        <section className="w-full max-w-[960px] mt-12 sm:mt-16">
          <div className="flex items-center justify-between mb-4 px-1">
            <h2 className="text-sm font-semibold text-white/90 tracking-wide flex items-center gap-2">
              <Sparkles className="size-4 text-brand" />
              <span>{tHome.latestReleases || (isZh ? '最近上新' : 'Latest Releases')}</span>
            </h2>
            <Link
              href={assetHref}
              className="text-xs text-ink-subtle hover:text-white transition-colors flex items-center gap-1"
            >
              <span>{tHome.goToAssets || (isZh ? '前往资产库 ›' : 'Go to Assets ›')}</span>
            </Link>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
            {recentFeatures.map((item) => (
              <div
                key={item.id}
                onClick={() => handleFeatureCardClick(item)}
                className="group relative h-48 rounded-xl overflow-hidden border border-white/10 hover:border-brand-line bg-[#16181e] cursor-pointer transition-all duration-300 hover:-translate-y-1 shadow-elevation-2 flex flex-col justify-end p-4"
              >
                {/* 封面背景与半透明遮罩 */}
                <div
                  className="absolute inset-0 bg-cover bg-center transition-transform duration-500 group-hover:scale-105"
                  style={{ backgroundImage: `url(${item.bgImage})` }}
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/40 to-black/10 group-hover:from-black/95 transition-all" />

                {/* 角标 */}
                <div className="absolute top-3 left-3 z-10">
                  <span className="px-2 py-0.5 rounded-full bg-white/15 backdrop-blur-md border border-white/20 text-[10px] font-semibold text-white">
                    {item.badge}
                  </span>
                </div>

                {/* 卡片文字信息 */}
                <div className="relative z-10 flex flex-col gap-1">
                  <h3 className="text-sm font-bold text-white leading-snug whitespace-pre-line group-hover:text-brand-hover transition-colors">
                    {item.title}
                  </h3>
                  <p className="text-[11px] text-white/60 line-clamp-1 font-normal">
                    {item.author || item.desc}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </section>
      </main>

      {/* 底部极简 Footer */}
      <footer className="relative z-10 py-6 text-center text-xs text-ink-subtle/50 border-t border-white/[0.04]">
        <span>SupDance · Premium AI Creative Workspace</span>
      </footer>

      {/* 登录弹窗 */}
      {showAuthModal && (
        <AuthModal
          isOpen={showAuthModal}
          onClose={handleAuthClose}
          onSuccess={handleAuthSuccess}
          locale={locale}
        />
      )}
    </div>
  );
}
