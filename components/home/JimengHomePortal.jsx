'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import toast from 'react-hot-toast';
import {
  Layers,
  Sparkles,
  ArrowUp,
  ArrowUpRight,
  Plus,
  Lock,
  AtSign,
  Image as ImageIcon,
  Film,
  Volume2,
  Smile,
  Wand2,
  Copy,
  Play,
  Check,
  X,
  Maximize2,
} from 'lucide-react';
import StudioHeader from '@/components/site/StudioHeader';
import { SpatialBackground } from '@/components/spatial';
import { useUserSession } from '@/lib/hooks/useUserSession';
import { localizeStudioPath, normalizeLocale, getCommonCopy, getLocaleConfig } from '@/lib/locales';
import HomeStudioPromptComposer from './HomeStudioPromptComposer';
import AuthModal from '@/components/AuthModal';

// 画布卡片占位封面：无缩略图时使用确定性的氛围渐变，贴近即梦的哑光质感
const CANVAS_CARD_BACKDROPS = [
  'radial-gradient(circle at 28% 18%, rgba(255, 214, 190, 0.16), transparent 58%), linear-gradient(135deg, #38232f 0%, #1b1f2d 58%, #0d0f13 100%)',
  'radial-gradient(circle at 72% 14%, rgba(170, 238, 255, 0.14), transparent 56%), linear-gradient(135deg, #1d3440 0%, #16202a 58%, #0d0f13 100%)',
  'radial-gradient(circle at 32% 78%, rgba(214, 196, 255, 0.12), transparent 55%), linear-gradient(135deg, #2c2938 0%, #1d2029 58%, #0d0f13 100%)',
];

// 图像创作入口卡片氛围底
const IMAGE_CREATION_BACKDROP =
  'radial-gradient(circle at 70% 22%, rgba(255, 190, 214, 0.15), transparent 56%), linear-gradient(135deg, #322234 0%, #1d2029 58%, #0d0f13 100%)';

// 动态模式快捷技能预设标签列表（涵盖图像、视频、音频、Agent、数字人 5 模态）
const getSkillPresets = (locale, tHome, mode = 'image') => {
  const norm = normalizeLocale(locale);
  const isZh = norm.startsWith('zh');

  if (mode === 'video') {
    return [
      {
        id: 'cinematic-drone',
        label: isZh ? '/ 电影级大范围运镜' : '/ Cinematic Camera Tracking',
        badge: 'New',
        badgeType: 'blue',
        prompt: isZh
          ? '电影级航拍大范围运镜，希区柯克变焦推拉，史诗大片光影，4K超高清'
          : 'Epic cinematic drone shot, Hitchcock vertigo zoom in, dramatic film lighting, 4K UHD',
      },
      {
        id: 'slow-mo-fluid',
        label: isZh ? '/ 120fps 慢动作微距' : '/ 120fps Slow-mo Macro',
        badge: 'Hot',
        badgeType: 'orange',
        prompt: isZh
          ? '高帧率120fps慢动作升格摄影，微距水滴与流体折射光斑，极致超清特写'
          : 'Ultra 120fps slow motion cinematography, macro liquid droplets refraction, pristine optics',
      },
      {
        id: 'cyber-chase',
        label: isZh ? '/ 赛博疾速第一人称' : '/ Cyberpunk Chase POV',
        badge: 'Hot',
        badgeType: 'orange',
        prompt: isZh
          ? '第一人称疾速动态追踪，霓虹光线拖尾，激烈追逐视角，强力视觉冲击'
          : 'First-person perspective high-speed chase, neon light trails, adrenaline rush motion blur',
      },
      {
        id: 'retro-film-35mm',
        label: isZh ? '/ 35mm 复古胶片长镜' : '/ 35mm Vintage Film',
        badge: null,
        badgeType: 'neutral',
        prompt: isZh
          ? '35mm复古胶片颗粒，午后阳光斜射丁达尔光，自然微风吹拂与生动景深'
          : '35mm vintage film aesthetic, afternoon Tyndall sunlight, gentle breeze and soft bokeh',
      },
      {
        id: 'epic-fantasy-panorama',
        label: isZh ? '/ 史诗奇幻全景空镜' : '/ Epic Fantasy Panorama',
        badge: null,
        badgeType: 'neutral',
        prompt: isZh
          ? '宏大史诗奇幻全景镜头，云海翻涌巨龙盘旋，虚幻引擎5物理光照渲染'
          : 'Majestic fantasy landscape panorama, rolling sea of clouds, Unreal Engine 5 volumetric lighting',
      },
      {
        id: 'more-video-tools',
        label: isZh ? '进入视频工作室 ›' : 'Video Studio ›',
        badge: null,
        badgeType: 'link',
        href: `${localizeStudioPath(norm)}?tab=video`,
      },
    ];
  }

  if (mode === 'audio') {
    return [
      {
        id: 'cinematic-orchestra',
        label: isZh ? '/ 电影院线管弦交响' : '/ Cinematic Orchestral',
        badge: 'Hot',
        badgeType: 'orange',
        prompt: isZh
          ? '气势恢宏的史诗交响乐，低沉铜管与壮阔弦乐交织，院线大片配乐质感'
          : 'Grand epic orchestral score, heavy brass and soaring strings, cinematic blockbuster soundtrack',
      },
      {
        id: 'warm-acoustic-guitar',
        label: isZh ? '/ 温暖抒情木吉他' : '/ Warm Acoustic Guitar',
        badge: 'New',
        badgeType: 'blue',
        prompt: isZh
          ? '清亮木吉他扫弦伴奏，温暖亲切民谣人声，宁静午后治愈氛围'
          : 'Crisp acoustic guitar chords, warm soothing indie folk vocals, peaceful afternoon ambiance',
      },
      {
        id: 'synthwave-heavy',
        label: isZh ? '/ 赛博朋克合成器浪潮' : '/ Cyberpunk Synthwave',
        badge: 'Hot',
        badgeType: 'orange',
        prompt: isZh
          ? '强劲电子Synthwave合成器低音，赛博朋克节奏，霓虹夜色工业质感'
          : 'Pulsing synthwave bassline, cyberpunk 80s drums, neon midnight retro-future vibes',
      },
      {
        id: 'lofi-chill-hop',
        label: isZh ? '/ Lofi 治愈舒缓节拍' : '/ Lofi Chill Beats',
        badge: null,
        badgeType: 'neutral',
        prompt: isZh
          ? '经典黑胶Lofi Hip Hop微弱爆豆声，柔和电钢琴与平缓鼓点，专注放松'
          : 'Vintage vinyl crackle, gentle Rhodes electric piano, mellow hip hop beats for study & focus',
      },
      {
        id: 'commercial-tech-beat',
        label: isZh ? '/ 商业发布会高燃律动' : '/ Tech Keynote Rhythm',
        badge: null,
        badgeType: 'neutral',
        prompt: isZh
          ? '现代化激昂电子律动，科技感音效点缀，企业宣传片动感节奏'
          : 'Modern upbeat tech corporate beat, energetic digital pulse, product launch presentation trailer',
      },
      {
        id: 'more-audio-tools',
        label: isZh ? '进入音频工作室 ›' : 'Audio Studio ›',
        badge: null,
        badgeType: 'link',
        href: `${localizeStudioPath(norm)}?tab=audio`,
      },
    ];
  }

  if (mode === 'agent') {
    return [
      {
        id: 'director-storyboard',
        label: isZh ? '/ 爆款分镜导演工作流' : '/ Storyboard Director Agent',
        badge: 'New',
        badgeType: 'blue',
        prompt: isZh
          ? '根据主题自动扩写5幕电影级镜头脚本，包含景别、运镜、光影与音效设计'
          : 'Automatically expand 5-scene cinematic storyboard script, with shots, camera angles, lighting and sound',
      },
      {
        id: 'brand-visual-designer',
        label: isZh ? '/ 全渠道视觉设计大师' : '/ Omnichannel Brand Stylist',
        badge: 'Hot',
        badgeType: 'orange',
        prompt: isZh
          ? '自动化解析品牌调性，产出适配多比例的社交媒体视觉方案与多语言文案'
          : 'Analyze brand aesthetics and produce multi-aspect social media graphics and multilingual copy',
      },
      {
        id: 'novel-character-extract',
        label: isZh ? '/ 沉浸式小说角色提取' : '/ Novel Character Forge',
        badge: 'Hot',
        badgeType: 'orange',
        prompt: isZh
          ? '深度提取长篇文本中的人物设定、服装细节与关键场景，生成连贯分镜提示词'
          : 'Extract character persona, detailed wardrobe and recurring scenes from literary text into prompt sequences',
      },
      {
        id: 'viral-video-hook',
        label: isZh ? '/ 爆款短视频脚本与口播' : '/ Viral Short Script & Hook',
        badge: null,
        badgeType: 'neutral',
        prompt: isZh
          ? '3秒黄金抓人钩子，情绪递进故事线，搭配痛点引爆与高转化行动召唤'
          : '3-second high-retention video hook, emotionally engaging arc and high-converting CTA',
      },
      {
        id: 'more-agent-tools',
        label: isZh ? '浏览更多智能体 ›' : 'Browse All Agents ›',
        badge: null,
        badgeType: 'link',
        href: `${localizeStudioPath(norm)}?tab=agents`,
      },
    ];
  }

  if (mode === 'digital-human') {
    return [
      {
        id: 'business-host',
        label: isZh ? '/ 极简商务发布会主播' : '/ Executive Keynote Anchor',
        badge: 'New',
        badgeType: 'blue',
        prompt: isZh
          ? '专业干练商务西装，沉稳自信微笑与手势互动，演播室柔光箱人像质感'
          : 'Polished corporate executive in tailored suit, confident natural gestures, studio lighting',
      },
      {
        id: 'ecommerce-streamer',
        label: isZh ? '/ 电商带货激情口播员' : '/ E-Commerce Live Presenter',
        badge: 'Hot',
        badgeType: 'orange',
        prompt: isZh
          ? '高表现力热情互动，生动面部微表情，快节奏产品展示与专业吸睛手势'
          : 'Vibrant expressive e-commerce streamer, animated micro-expressions and engaging gestures',
      },
      {
        id: 'cyber-hologram-assistant',
        label: isZh ? '/ 科技风未来全息助理' : '/ Futuristic Holographic AI',
        badge: 'Hot',
        badgeType: 'orange',
        prompt: isZh
          ? '半透明未来科技服饰，清澈明亮眼神，AI全息悬浮演播背景，超清数字人'
          : 'Translucent high-tech holographic avatar, glowing HUD elements, clean studio background',
      },
      {
        id: 'bilingual-news-anchor',
        label: isZh ? '/ 多语言双语新闻播报' : '/ Multilingual News Anchor',
        badge: null,
        badgeType: 'neutral',
        prompt: isZh
          ? '沉稳权威双语新闻主播台风，标准发音口型自然同步，新闻演播大厅背景'
          : 'Authoritative broadcast news anchor, natural lip-sync synchronization, broadcast studio desk',
      },
      {
        id: 'more-avatar-tools',
        label: isZh ? '进入数字人唇形工作室 ›' : 'Lipsync & Avatar Studio ›',
        badge: null,
        badgeType: 'link',
        href: `${localizeStudioPath(norm)}?tab=lipsync`,
      },
    ];
  }

  // Default: image mode
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
      label: isZh ? '/ 8K 极清大师肖像' : (norm === 'ja-JP' ? '/ 8K極清ポートレート' : (norm === 'ko-KR' ? '/ 8K 거장 인物' : (norm === 'es' ? '/ Retrato Maestro 8K' : '/ 8K Master Portrait'))),
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

// 画布模式技能工作流标签（视频反解 / 创作分镜 / 广告导演 / 剧本 / 短片）
const getCanvasSkillPresets = (locale) => {
  const norm = normalizeLocale(locale);
  const isZh = norm.startsWith('zh');
  return [
    {
      id: 'video-reverse',
      label: isZh ? '/ 视频反解' : '/ Video Deconstruction',
      badge: 'New',
      prompt: isZh
        ? '上传一段视频，逐帧反解其镜头语言、构图、色调与运镜，生成可复刻的分镜提示词'
        : 'Deconstruct an uploaded video frame by frame into camera language, composition, tone and re-creatable storyboard prompts',
    },
    {
      id: 'storyboard-creator',
      label: isZh ? '/ 创作分镜' : '/ Storyboard Creator',
      badge: 'New',
      prompt: isZh
        ? '根据主题自动扩写5幕电影级镜头脚本，包含景别、运镜、光影与音效设计'
        : 'Expand a theme into a five-act cinematic shot script with framing, camera moves, lighting and sound design',
    },
    {
      id: 'ad-film-director',
      label: isZh ? '/ 全流程广告片导演' : '/ Full-Funnel Ad Director',
      badge: 'New',
      prompt: isZh
        ? '从创意洞察、分镜脚本到成片交付，全流程导演一部商业广告大片'
        : 'Direct a commercial film end-to-end, from creative insight and storyboard to final delivery',
    },
    {
      id: 'script-development',
      label: isZh ? '/ 剧本开发' : '/ Script Development',
      badge: 'New',
      prompt: isZh
        ? '围绕核心创意展开完整剧本：人物设定、三幕结构与对白设计'
        : 'Develop a complete script around the core idea: character profiles, three-act structure and dialogue design',
    },
    {
      id: 'drama-short-film',
      label: isZh ? '/ 剧情短片' : '/ Drama Short Film',
      badge: 'New',
      prompt: isZh
        ? '将你的故事改编为有起承转合的剧情短片脚本，含镜头与氛围设计'
        : 'Adapt your story into a dramatic short film script with shot and mood design',
    },
    {
      id: 'more-canvas-skills',
      label: isZh ? '更多技能 ›' : 'More Skills ›',
      badge: null,
      href: `${localizeStudioPath(norm)}?tab=agents`,
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
      model: 'seedream-5.0-pro',
      ar: '3:4',
      quality: '2K',
      prompt: 'MANGO GLASS PRO 时尚概念人像摄影，复古太阳镜，冷峻高级面部光影，杂志封面构图，超高分辨率电影级质感',
    },
    {
      id: 'supdance-mcp-cli',
      title: isZh ? 'SupDance API / SDK\n接入筹备中' : 'SupDance API & SDK\nComing Soon',
      desc: isZh ? '公开 API 尚未开放，可先使用 Studio 工作台' : 'Public API is not open yet; use the Studio workspace today',
      category: isZh ? '开发生态' : 'Ecosystem',
      badge: '筹备中',
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
      model: 'kling-v2.6-pro-t2v',
      ar: '16:9',
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
  const [composerMode, setComposerMode] = useState('agent'); // 'image' | 'video' | 'audio' | 'agent' | 'digital-human'
  const composerRef = useRef(null);
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [pendingTask, setPendingTask] = useState(null);
  const [activeSkillId, setActiveSkillId] = useState(null);
  const [mounted, setMounted] = useState(false);
  const pendingAuthResolverRef = useRef(null);

  // 用户历史创作列表（从 /api/generations?limit=8 读取）
  const [userCreations, setUserCreations] = useState([]);
  const [loadingCreations, setLoadingCreations] = useState(false);
  const [galleryTab, setGalleryTab] = useState('featured'); // 'user' | 'featured'
  const [previewModalItem, setPreviewModalItem] = useState(null);

  // 画布模式：最近云端画布与底部 Agent 输入框
  const [canvasProjects, setCanvasProjects] = useState([]);
  const [loadingCanvasProjects, setLoadingCanvasProjects] = useState(false);
  const [canvasPrompt, setCanvasPrompt] = useState('');
  const canvasInputRef = useRef(null);

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

  const skillPresets = getSkillPresets(normLocale, tHome, composerMode);
  const canvasSkillPresets = getCanvasSkillPresets(normLocale);
  const recentFeatures = getRecentFeatures(normLocale, tHome, rootPath);

  // 请求真实后端 /api/generations 接口装配历史创作
  const fetchRecentGenerations = useCallback(async () => {
    if (!user) {
      setUserCreations([]);
      setGalleryTab('featured');
      return;
    }
    setLoadingCreations(true);
    try {
      const res = await fetch('/api/generations?limit=8', { credentials: 'include' });
      if (res.ok) {
        const data = await res.json();
        const list = Array.isArray(data?.creations) ? data.creations : [];
        setUserCreations(list);
        if (list.length > 0) {
          setGalleryTab('user');
        }
      }
    } catch (err) {
      console.warn('[JimengHomePortal] Failed to load user creations:', err);
    } finally {
      setLoadingCreations(false);
    }
  }, [user]);

  useEffect(() => {
    fetchRecentGenerations();
  }, [fetchRecentGenerations]);

  // 读取最近云端画布（最多展示 3 个）
  useEffect(() => {
    let cancelled = false;
    if (!user) {
      setCanvasProjects([]);
      setLoadingCanvasProjects(false);
      return () => {
        cancelled = true;
      };
    }
    setLoadingCanvasProjects(true);
    fetch('/api/canvas/projects', { credentials: 'include', cache: 'no-store' })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (cancelled) return;
        const list = Array.isArray(data?.projects) ? data.projects : [];
        setCanvasProjects(list.slice(0, 2));
      })
      .catch((err) => {
        if (!cancelled) {
          console.warn('[JimengHomePortal] Failed to load canvas projects:', err);
        }
      })
      .finally(() => {
        if (!cancelled) setLoadingCanvasProjects(false);
      });
    return () => {
      cancelled = true;
    };
  }, [user]);

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

  const [queuedComposerAction, setQueuedComposerAction] = useState(null);

  useEffect(() => {
    if (activeMode === 'generate' && queuedComposerAction && composerRef.current) {
      if (queuedComposerAction.type === 'applyPreset') {
        composerRef.current.applyCreationPreset(queuedComposerAction.payload);
      } else if (queuedComposerAction.type === 'setPrompt') {
        composerRef.current.setPromptText(queuedComposerAction.prompt, queuedComposerAction.mode);
      }
      setQueuedComposerAction(null);
    }
  }, [activeMode, queuedComposerAction]);

  // 画布底部输入框：将灵感带入 Agent 创作台
  const handleCanvasPromptSubmit = (event) => {
    event.preventDefault();
    const prompt = canvasPrompt.trim();
    if (!prompt) return;
    setCanvasPrompt('');
    setActiveMode('generate');
    setQueuedComposerAction({ type: 'setPrompt', prompt, mode: 'agent' });
    window.scrollTo({ top: 120, behavior: 'smooth' });
    toast.success(isZh ? '已带入 Agent 创作台，确认后即可开始' : 'Prompt loaded into the Agent composer');
  };

  // 输入框快捷操作：聚焦 / 插入技能斜杠 / 插入主体 @
  const handleCanvasInputAction = (action) => {
    if (action === 'skill') {
      setCanvasPrompt((prev) => `${prev}${prev.trim() && !prev.endsWith(' ') ? ' ' : ''}/`);
    } else if (action === 'subject') {
      setCanvasPrompt((prev) => `${prev}${prev.trim() && !prev.endsWith(' ') ? ' ' : ''}@`);
    }
    canvasInputRef.current?.focus();
  };

  // 画布模式技能标签：切入生成模式并带入 Agent 创作台
  const handleCanvasSkillClick = (skill) => {
    if (skill.href) {
      router.push(skill.href);
      return;
    }
    setActiveMode('generate');
    setQueuedComposerAction({ type: 'setPrompt', prompt: skill.prompt, mode: 'agent' });
    window.scrollTo({ top: 120, behavior: 'smooth' });
    toast.success(isZh ? `已应用技能: ${skill.label.replace('/ ', '')}` : `Applied skill: ${skill.label}`);
  };

  // 点击展台卡片：一键装配创作参数或跳转
  const handleFeatureCardClick = (item) => {
    if (item.href) {
      router.push(item.href);
      return;
    }
    if (item.tab === 'image' || item.tab === 'video') {
      const payload = {
        prompt: item.prompt,
        ar: item.ar,
        quality: item.quality,
        modelId: item.model,
        mode: item.tab,
      };
      if (activeMode !== 'generate') {
        setActiveMode('generate');
        setQueuedComposerAction({ type: 'applyPreset', payload });
      } else {
        composerRef.current?.applyCreationPreset(payload);
      }
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

  // 点击用户历史作品“同款创作”
  const handleApplyUserCreation = (item) => {
    const targetMode = item.studio_id || item.mediaType || 'image';
    const payload = {
      prompt: item.prompt,
      modelId: item.model_id || item.modelId,
      ar: item.aspect_ratio || item.ar,
      mode: targetMode,
    };
    if (activeMode !== 'generate') {
      setActiveMode('generate');
      setQueuedComposerAction({ type: 'applyPreset', payload });
    } else {
      composerRef.current?.applyCreationPreset(payload);
    }
    window.scrollTo({ top: 120, behavior: 'smooth' });
    toast.success(isZh ? '已装配历史创作同款参数' : 'Loaded preset from past creation');
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
    fetchRecentGenerations();
    if (pendingAuthResolverRef.current) {
      pendingAuthResolverRef.current.resolve?.(user || true);
      pendingAuthResolverRef.current = null;
    }
    if (pendingTask) {
      const { prompt, model, ar, quality, batch, mode } = pendingTask;
      const params = new URLSearchParams();
      params.set('tab', mode || 'image');
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
      <main className="relative z-10 flex-1 flex flex-col items-center justify-start pt-24 md:pt-32 pb-16 px-4 max-w-[1320px] mx-auto w-full">
        {/* 顶部中央 Dreamina 标志性品牌标题与环境光晕 */}
        <div className="relative mb-8 text-center flex flex-col items-center">
          {/* Ambient backdrop glow */}
          <div className="absolute -top-12 left-1/2 -translate-x-1/2 w-[340px] sm:w-[540px] h-[160px] bg-brand/15 blur-[90px] pointer-events-none rounded-full" />

          {activeMode === 'canvas' ? (
            <h1 className="text-2xl sm:text-3xl md:text-4xl font-semibold tracking-tight text-center select-none relative z-10">
              <span className="bg-gradient-to-b from-white via-white/95 to-white/70 bg-clip-text text-transparent">
                {getGreeting()}
              </span>
            </h1>
          ) : (
            <>
              <h1 className="text-3xl sm:text-4xl md:text-5xl font-extrabold tracking-tight text-center select-none relative z-10 flex flex-wrap items-center justify-center gap-x-2.5 gap-y-1">
                <span className="bg-gradient-to-b from-white via-white/95 to-white/70 bg-clip-text text-transparent">
                  {isZh ? '创造任何你' : 'Create anything you'}
                </span>
                <span className="italic font-serif bg-gradient-to-r from-brand-hover via-pink-400 to-rose-300 bg-clip-text text-transparent drop-shadow-[0_0_24px_rgba(225,29,116,0.35)]">
                  {isZh ? '想象的事物' : 'imagine'}
                </span>
              </h1>
              <p className="text-xs sm:text-sm text-ink-muted text-center max-w-xl mx-auto mt-3 font-normal leading-relaxed relative z-10">
                {getGreeting()} · {isZh ? '全模态前沿模型，多模态视听无限画布' : 'Next-Gen Multi-modal AI Creative Engine & Infinite Canvas'}
              </p>
            </>
          )}
        </div>

        {/* 核心模式分段器 (生成 vs 画布) — 对齐即梦胶囊切换器视觉与动效 */}
        <div
          data-pill-segmented
          role="group"
          aria-label={isZh ? '创作类型' : 'Creation type'}
          className="mode-switch rounded-full mb-8"
        >
          <button
            type="button"
            data-pill-segment-item
            aria-pressed={activeMode === 'generate'}
            onClick={() => setActiveMode('generate')}
            className="mode-switch-option rounded-full"
          >
            {tHome.modeGenerate || (isZh ? '生成' : 'Generate')}
          </button>
          <button
            type="button"
            data-pill-segment-item
            aria-pressed={activeMode === 'canvas'}
            onClick={() => setActiveMode('canvas')}
            className="mode-switch-option rounded-full"
          >
            {tHome.modeCanvas || (isZh ? '画布' : 'Canvas')}
          </button>
        </div>

        {/* 画布模式：即梦式画布首页（新建画布 + 最近画布 + Agent 输入框） */}
        {activeMode === 'canvas' ? (
          <div className="w-full max-w-[1280px] flex flex-col animate-fade-in">
            <div className="mb-3 flex items-center justify-end gap-5 px-1">
              <button
                type="button"
                onClick={() => router.push(`${studioBase}?tab=layers`)}
                className="flex items-center gap-1.5 text-xs text-ink-subtle hover:text-white transition-colors cursor-pointer"
              >
                <Layers className="size-3.5" />
                <span>{isZh ? '图层画板' : 'Layers Studio'}</span>
              </button>
              <a
                href="/canvas"
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-ink-muted hover:text-white transition-colors"
              >
                {isZh ? '全部' : 'View all'}
              </a>
            </div>

            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
              {/* 新建画布 */}
              <a
                href="/canvas?mode=new"
                target="_blank"
                rel="noopener noreferrer"
                className="group relative aspect-[16/10] overflow-hidden rounded-2xl border border-white/10 bg-[#0f1115]/80 hover:bg-[#14161c]/90 hover:border-white/20 transition-all duration-300 flex flex-col items-center justify-center gap-3"
              >
                <span className="absolute inset-0 bg-dot-grid opacity-30 pointer-events-none" />
                <span className="relative z-10 flex size-14 items-center justify-center rounded-2xl bg-white text-black shadow-elevation-2 transition-transform duration-300 group-hover:scale-105">
                  <Plus className="size-5" strokeWidth={2.4} />
                </span>
                <span className="relative z-10 text-sm font-medium text-white/90">
                  {isZh ? '新建画布' : 'New canvas'}
                </span>
              </a>

              {/* 图像创作 */}
              <Link
                href={`${studioBase}?tab=image`}
                title={isZh ? '进入图像创作' : 'Open image creation'}
                className="group relative aspect-[16/10] overflow-hidden rounded-2xl border border-white/10 transition-all duration-300 hover:-translate-y-0.5 hover:border-white/25 shadow-elevation-1 hover:shadow-elevation-2"
              >
                <span
                  className="absolute inset-0 transition-transform duration-500 group-hover:scale-105"
                  style={{ backgroundImage: IMAGE_CREATION_BACKDROP }}
                />
                <span className="absolute inset-0 bg-dot-grid opacity-[0.08]" />
                <span className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/15 to-transparent" />
                <span className="absolute inset-x-0 bottom-0 z-10 flex items-end justify-between gap-3 p-4 sm:p-5">
                  <span className="min-w-0 flex items-center gap-2">
                    <ImageIcon className="size-4 shrink-0 text-white/70" />
                    <span className="truncate text-sm font-semibold text-white/95">
                      {isZh ? '图像创作' : 'Image creation'}
                    </span>
                  </span>
                  <ArrowUpRight className="size-4 shrink-0 text-white/40 opacity-0 transition-all duration-200 group-hover:opacity-100" />
                </span>
              </Link>

              {/* 最近云端画布 */}
              {loadingCanvasProjects
                ? Array.from({ length: 2 }).map((_, index) => (
                    <div
                      key={`canvas-skeleton-${index}`}
                      className="aspect-[16/10] animate-pulse rounded-2xl border border-white/[0.06] bg-white/[0.025]"
                    />
                  ))
                : canvasProjects.map((project, index) => (
                    <a
                      key={project.id}
                      href="/canvas"
                      target="_blank"
                      rel="noopener noreferrer"
                      title={isZh ? '在画布中打开' : 'Open in Canvas'}
                      className="group relative aspect-[16/10] overflow-hidden rounded-2xl border border-white/10 transition-all duration-300 hover:-translate-y-0.5 hover:border-white/25 shadow-elevation-1 hover:shadow-elevation-2"
                    >
                      <span
                        className="absolute inset-0 transition-transform duration-500 group-hover:scale-105"
                        style={{ backgroundImage: CANVAS_CARD_BACKDROPS[index % CANVAS_CARD_BACKDROPS.length] }}
                      />
                      <span className="absolute inset-0 bg-dot-grid opacity-[0.08]" />
                      <span className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/15 to-transparent" />
                      <span className="absolute inset-x-0 bottom-0 z-10 flex items-end justify-between gap-3 p-4 sm:p-5">
                        <span className="min-w-0">
                          <span className="block truncate text-sm font-semibold text-white/95">
                            {project.name || (isZh ? '未命名画布' : 'Untitled canvas')}
                          </span>
                          <span className="mt-0.5 block truncate text-[11px] text-white/45 opacity-0 transition-opacity duration-200 group-hover:opacity-100">
                            {project.nodeCount || 0} {isZh ? '个节点' : 'nodes'}
                            {project.updatedAt
                              ? ` · ${new Date(project.updatedAt).toLocaleDateString(isZh ? 'zh-CN' : 'en-US', { month: '2-digit', day: '2-digit' })}`
                              : ''}
                          </span>
                        </span>
                        <ArrowUpRight className="size-4 shrink-0 translate-y-1 -translate-x-1 text-white/40 opacity-0 transition-all duration-200 group-hover:translate-x-0 group-hover:translate-y-0 group-hover:opacity-100" />
                      </span>
                    </a>
                  ))}

              {/* 未登录：同步入口 */}
              {!user &&
                [0, 1].map((index) => (
                  <button
                    key={`canvas-guest-${index}`}
                    type="button"
                    onClick={() => setShowAuthModal(true)}
                    className="group relative aspect-[16/10] overflow-hidden rounded-2xl border border-white/10 transition-all duration-300 hover:-translate-y-0.5 hover:border-white/25"
                  >
                    <span
                      className="absolute inset-0 opacity-55 transition-transform duration-500 group-hover:scale-105"
                      style={{
                        backgroundImage:
                          CANVAS_CARD_BACKDROPS[(index + 1) % CANVAS_CARD_BACKDROPS.length],
                      }}
                    />
                    <span className="absolute inset-0 bg-dot-grid opacity-[0.08]" />
                    <span className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/25 to-transparent" />
                    <span className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-2">
                      <span className="flex size-8 items-center justify-center rounded-full border border-white/20 bg-black/45 text-white/70 transition-colors duration-200 group-hover:text-white">
                        <Lock className="size-3.5" />
                      </span>
                      <span className="text-xs font-medium text-white/65 transition-colors duration-200 group-hover:text-white/90">
                        {isZh ? '登录后同步画布' : 'Sign in to sync'}
                      </span>
                    </span>
                  </button>
                ))}
            </div>

            {/* 底部 Agent 输入框 */}
            <form
              onSubmit={handleCanvasPromptSubmit}
              className="mt-3 flex w-full items-center gap-3 rounded-2xl border border-white/10 bg-[#16181d]/90 px-4 py-3 shadow-elevation-2 backdrop-blur-xl transition-colors focus-within:border-white/20 sm:px-5"
            >
              <input
                ref={canvasInputRef}
                value={canvasPrompt}
                onChange={(event) => setCanvasPrompt(event.target.value)}
                placeholder={isZh ? '输入想法、剧本或上传参考，支持 / 使用技能，@添加主体，和 Agent 一起创作' : 'Describe your idea, use / for skills, @ to add subjects, and create with Agent'}
                aria-label={isZh ? '画布 Agent 创作指令' : 'Canvas Agent prompt'}
                className="min-w-0 flex-1 bg-transparent text-sm text-white outline-none placeholder:text-ink-subtle"
              />
              <button
                type="submit"
                disabled={!canvasPrompt.trim()}
                aria-label={isZh ? '发送给 Agent' : 'Send to Agent'}
                className="flex size-9 shrink-0 items-center justify-center rounded-full bg-white text-black transition-all duration-200 enabled:hover:bg-white/90 enabled:active:scale-95 disabled:bg-white/10 disabled:text-white/30"
              >
                <ArrowUp className="size-4" strokeWidth={2.4} />
              </button>
            </form>

            {/* 输入框快捷操作行：添加参考 / 技能 / 主体 */}
            <div className="mt-2.5 flex items-center gap-1.5 px-1">
              <button
                type="button"
                onClick={() => handleCanvasInputAction('focus')}
                aria-label={isZh ? '添加参考' : 'Add reference'}
                className="flex size-8 items-center justify-center rounded-full text-ink-muted transition-colors hover:bg-white/[0.06] hover:text-white cursor-pointer"
              >
                <Plus className="size-4" strokeWidth={2.2} />
              </button>
              <button
                type="button"
                onClick={() => handleCanvasInputAction('skill')}
                className="flex h-8 items-center gap-1.5 rounded-full px-3 text-xs font-medium text-ink-muted transition-colors hover:bg-white/[0.06] hover:text-white cursor-pointer"
              >
                <Sparkles className="size-3.5 text-brand" />
                <span>{isZh ? '技能' : 'Skills'}</span>
              </button>
              <button
                type="button"
                onClick={() => handleCanvasInputAction('subject')}
                className="flex h-8 items-center gap-1.5 rounded-full px-3 text-xs font-medium text-ink-muted transition-colors hover:bg-white/[0.06] hover:text-white cursor-pointer"
              >
                <AtSign className="size-3.5" />
                <span>{isZh ? '主体' : 'Subject'}</span>
              </button>
            </div>

            {/* 画布模式技能工作流标签 */}
            <div className="mt-4 w-full flex items-center gap-2 overflow-x-auto py-3 no-scrollbar scrollbar-rail">
              {canvasSkillPresets.map((skill) => (
                <button
                  key={skill.id}
                  type="button"
                  onClick={() => handleCanvasSkillClick(skill)}
                  className="h-8 px-3.5 rounded-full text-xs font-medium shrink-0 flex items-center gap-1.5 transition-all cursor-pointer active:scale-95 shadow-sm bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.08] hover:border-white/20 text-white/80 hover:text-white"
                >
                  <span>{skill.label}</span>
                  {skill.badge && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded-full font-bold uppercase tracking-wider bg-blue-500/20 text-blue-400 border border-blue-500/30">
                      {skill.badge}
                    </span>
                  )}
                </button>
              ))}
            </div>
          </div>
        ) : (
          /* 生成模式高保真多功能工作室输入框控制台 */
          <HomeStudioPromptComposer
            ref={composerRef}
            locale={locale}
            skillOptions={skillPresets}
            onSkillSelect={handleSkillClick}
            onModeChange={(mode) => {
              setComposerMode(mode);
              setActiveSkillId(null);
            }}
            onTaskComplete={(task) => {
              setUserCreations((prev) => [task, ...prev]);
              setGalleryTab('user');
            }}
            onRequireAuth={(task) => {
              setPendingTask(task);
              setShowAuthModal(true);
            }}
          />
        )}

        {activeMode === 'generate' && (
          <>
        {/* 快捷技能预设胶囊推荐列表（动态联动当前选中的创作模式） */}
        <div className="w-full max-w-[1080px] flex items-center gap-2 overflow-x-auto py-3.5 no-scrollbar scrollbar-rail">
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

        {/* 4. 底部“最近作品与精选展台”画廊卡片群 */}
        <section className="w-full max-w-[960px] mt-12 sm:mt-16">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4 px-1">
            <div className="flex items-center gap-3">
              <h2 className="text-sm font-semibold text-white/90 tracking-wide flex items-center gap-2">
                <Sparkles className="size-4 text-brand" />
                <span>{isZh ? '创作画廊与精选展台' : 'Creations & Showcase'}</span>
              </h2>

              {/* 仅在用户存在历史作品时展示切换分段器 */}
              {userCreations.length > 0 && (
                <div
                  data-pill-segmented
                  className="inline-flex items-center p-0.5 rounded-full bg-well border border-white/10"
                >
                  <button
                    type="button"
                    data-pill-segment-item
                    onClick={() => setGalleryTab('user')}
                    className={`h-6 px-3 rounded-full text-[11px] font-medium transition-all cursor-pointer ${
                      galleryTab === 'user'
                        ? 'bg-white text-black font-semibold shadow-elevation-1'
                        : 'text-ink-muted hover:text-white'
                    }`}
                  >
                    {isZh ? `我的创作 (${userCreations.length})` : `My Creations (${userCreations.length})`}
                  </button>
                  <button
                    type="button"
                    data-pill-segment-item
                    onClick={() => setGalleryTab('featured')}
                    className={`h-6 px-3 rounded-full text-[11px] font-medium transition-all cursor-pointer ${
                      galleryTab === 'featured'
                        ? 'bg-white text-black font-semibold shadow-elevation-1'
                        : 'text-ink-muted hover:text-white'
                    }`}
                  >
                    {isZh ? '精选作品' : 'Showcases'}
                  </button>
                </div>
              )}
            </div>

            <Link
              href={assetHref}
              className="text-xs text-ink-subtle hover:text-white transition-colors flex items-center gap-1 shrink-0"
            >
              <span>{tHome.goToAssets || (isZh ? '前往资产库 ›' : 'Go to Assets ›')}</span>
            </Link>
          </div>

          {/* 选项 A：用户真实历史作品展示 */}
          {galleryTab === 'user' && userCreations.length > 0 ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
              {userCreations.map((creation) => {
                const assetUrl = creation.result_url || creation.url || creation.storageUrl;
                const isVideo =
                  creation.studio_id === 'video' ||
                  creation.mediaType === 'video' ||
                  (assetUrl && (assetUrl.includes('.mp4') || assetUrl.includes('.webm')));
                const isAudio =
                  creation.studio_id === 'audio' ||
                  creation.mediaType === 'audio' ||
                  (assetUrl && (assetUrl.includes('.mp3') || assetUrl.includes('.wav')));

                return (
                  <div
                    key={creation.id}
                    className="group relative h-52 rounded-xl overflow-hidden border border-white/10 hover:border-brand-line bg-[#16181e] transition-all duration-300 hover:-translate-y-1 shadow-elevation-2 flex flex-col justify-between p-3.5"
                  >
                    {/* 背景媒体展示 */}
                    {assetUrl ? (
                      isVideo ? (
                        <video
                          src={assetUrl}
                          className="absolute inset-0 w-full h-full object-cover"
                          muted
                          loop
                          playsInline
                          onMouseEnter={(e) => e.currentTarget.play().catch(() => {})}
                          onMouseLeave={(e) => {
                            e.currentTarget.pause();
                            e.currentTarget.currentTime = 0;
                          }}
                        />
                      ) : isAudio ? (
                        <div className="absolute inset-0 bg-gradient-to-br from-indigo-950/60 via-purple-950/40 to-black/80 flex items-center justify-center">
                          <Volume2 className="size-10 text-brand/40 animate-pulse" />
                        </div>
                      ) : (
                        <div
                          className="absolute inset-0 bg-cover bg-center transition-transform duration-500 group-hover:scale-105"
                          style={{ backgroundImage: `url(${assetUrl})` }}
                        />
                      )
                    ) : (
                      <div className="absolute inset-0 bg-gradient-to-br from-neutral-900 to-black flex items-center justify-center">
                        <ImageIcon className="size-8 text-white/20" />
                      </div>
                    )}

                    {/* 暗黑渐变覆盖层 */}
                    <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/40 to-transparent group-hover:from-black/95 transition-all" />

                    {/* 顶部状态与类型角标 */}
                    <div className="relative z-10 flex items-center justify-between">
                      <span className="px-2 py-0.5 rounded-full bg-black/60 backdrop-blur-md border border-white/20 text-[10px] font-semibold text-white/90">
                        {creation.studio_id || creation.mediaType || 'AI 创作'}
                      </span>
                      {creation.status === 'succeeded' ? (
                        <span className="px-2 py-0.5 rounded-full bg-emerald-500/20 border border-emerald-500/30 text-[10px] font-semibold text-emerald-300">
                          {isZh ? '成功' : 'Done'}
                        </span>
                      ) : creation.status === 'processing' ? (
                        <span className="px-2 py-0.5 rounded-full bg-amber-500/20 border border-amber-500/30 text-[10px] font-semibold text-amber-300 animate-pulse">
                          {isZh ? '处理中' : 'Processing'}
                        </span>
                      ) : creation.status === 'failed' ? (
                        <span className="px-2 py-0.5 rounded-full bg-rose-500/20 border border-rose-500/30 text-[10px] font-semibold text-rose-300">
                          {isZh ? '失败' : 'Failed'}
                        </span>
                      ) : null}
                    </div>

                    {/* 底部悬浮控制栏与提示词摘要 */}
                    <div className="relative z-10 flex flex-col gap-2">
                      <p className="text-xs text-white/90 font-medium line-clamp-2 leading-relaxed">
                        {creation.prompt || (isZh ? '无提示词文本' : 'No prompt text')}
                      </p>

                      {/* 鼠标悬浮时展示便捷操作 */}
                      <div className="flex items-center gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity duration-200 pt-1">
                        <button
                          type="button"
                          onClick={() => handleApplyUserCreation(creation)}
                          className="flex-1 h-7 rounded-lg bg-brand hover:bg-brand-hover text-white text-[11px] font-semibold flex items-center justify-center gap-1 transition-colors cursor-pointer"
                        >
                          <Wand2 className="size-3" />
                          <span>{isZh ? '同款创作' : 'Remix'}</span>
                        </button>

                        {assetUrl && (
                          <a
                            href={`/canvas?importAsset=${encodeURIComponent(assetUrl)}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="h-7 px-2.5 rounded-lg bg-white/10 hover:bg-white/20 text-white text-[11px] font-medium flex items-center justify-center gap-1 transition-colors cursor-pointer"
                            title={isZh ? '在无限画布中打开' : 'Open in Canvas'}
                          >
                            <Layers className="size-3" />
                          </a>
                        )}

                        {assetUrl && (
                          <button
                            type="button"
                            onClick={() => setPreviewModalItem(creation)}
                            className="size-7 rounded-lg bg-white/10 hover:bg-white/20 text-white flex items-center justify-center transition-colors cursor-pointer"
                            title={isZh ? '全屏大图预览' : 'Preview'}
                          >
                            <Maximize2 className="size-3" />
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            /* 选项 B：平台精选创作展台卡片群 */
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
          )}
        </section>
          </>
        )}
      </main>

      {/* 底部极简 Footer */}
      <footer className="relative z-10 py-6 text-center text-xs text-ink-subtle/50 border-t border-white/[0.04]">
        <span>SupDance · Premium AI Creative Workspace</span>
      </footer>

      {/* 全屏媒体预览弹窗 */}
      {previewModalItem && (
        <div
          onClick={() => setPreviewModalItem(null)}
          className="fixed inset-0 z-50 bg-black/90 backdrop-blur-md flex items-center justify-center p-4 cursor-zoom-out animate-fade-in"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="relative max-w-4xl max-h-[90vh] rounded-2xl bg-surface border border-white/15 p-2 shadow-elevation-4 overflow-hidden flex flex-col cursor-default"
          >
            <button
              type="button"
              onClick={() => setPreviewModalItem(null)}
              className="absolute top-4 right-4 z-10 size-8 rounded-full bg-black/70 hover:bg-black text-white flex items-center justify-center cursor-pointer transition-colors"
            >
              <X className="size-4" />
            </button>

            {previewModalItem.studio_id === 'video' ||
            previewModalItem.mediaType === 'video' ||
            (previewModalItem.result_url && previewModalItem.result_url.includes('.mp4')) ? (
              <video
                src={previewModalItem.result_url || previewModalItem.url}
                controls
                autoPlay
                className="max-h-[75vh] w-auto rounded-xl object-contain mx-auto"
              />
            ) : previewModalItem.studio_id === 'audio' ||
              previewModalItem.mediaType === 'audio' ||
              (previewModalItem.result_url && previewModalItem.result_url.includes('.mp3')) ? (
              <div className="p-8 flex flex-col items-center gap-4">
                <Volume2 className="size-16 text-brand" />
                <audio
                  src={previewModalItem.result_url || previewModalItem.url}
                  controls
                  autoPlay
                  className="w-full max-w-md"
                />
              </div>
            ) : (
              <img
                src={previewModalItem.result_url || previewModalItem.url}
                alt=""
                className="max-h-[75vh] w-auto rounded-xl object-contain mx-auto select-none"
              />
            )}

            <div className="p-4 flex items-center justify-between border-t border-white/10 mt-2 gap-4">
              <p className="text-xs text-white/80 line-clamp-2">{previewModalItem.prompt}</p>
              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={() => {
                    handleApplyUserCreation(previewModalItem);
                    setPreviewModalItem(null);
                  }}
                  className="px-3 py-1.5 rounded-lg bg-brand hover:bg-brand-hover text-white text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer"
                >
                  <Wand2 className="size-3.5" />
                  <span>{isZh ? '同款创作' : 'Remix'}</span>
                </button>
                <a
                  href={`/canvas?importAsset=${encodeURIComponent(previewModalItem.result_url || previewModalItem.url || '')}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-white text-xs font-medium flex items-center gap-1.5 transition-colors cursor-pointer"
                >
                  <Layers className="size-3.5" />
                  <span>{isZh ? '画布打开' : 'Open in Canvas'}</span>
                </a>
              </div>
            </div>
          </div>
        </div>
      )}

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
