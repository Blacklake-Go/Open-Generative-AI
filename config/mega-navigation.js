/**
 * Mega Navigation Configuration (参考 Higgsfield.ai 双栏 Mega Menu 模式)
 * 
 * 整合全站一级导航、各模块 Features（工具特性）与 Models（底层模型矩阵）。
 * 支持中英多语言、Badge 状态标识、以及直接携带参数跳转进入工作室。
 */
import { normalizeLocale, getLocaleConfig } from '../lib/locales.js';

export const MEGA_NAV_CATEGORIES = [
  {
    id: 'images',
    tabId: 'image', // 默认点击大类时落地的 tab
    label: {
      zh: '图像',
      en: 'Image',
    },
    href: '/studio?tab=image',
    badge: null,
    features: [
      {
        id: 'image',
        tabId: 'image',
        icon: 'image',
        label: {
          zh: '图像工作室',
          en: 'Create Image',
        },
        description: {
          zh: '文本生图与多模型画板',
          en: 'Generate AI images with multi-models',
        },
        badge: 'HOT',
        href: '/studio?tab=image',
      },
      {
        id: 'headshot',
        tabId: 'headshot',
        icon: 'user',
        label: {
          zh: 'AI 肖像',
          en: 'AI Headshot',
        },
        description: {
          zh: '一键生成专业写真与肖像照',
          en: 'Generate professional portraits & headshots',
        },
        badge: 'TOP',
        href: '/studio?tab=headshot',
      },
      {
        id: 'layers',
        tabId: 'layers',
        icon: 'layers',
        label: {
          zh: '图层工作室',
          en: 'Layers Studio',
        },
        description: {
          zh: '专业图层分离与画布编辑',
          en: 'Visual ideation & layered canvas editing',
        },
        badge: 'SOON',
        href: '/studio?tab=layers',
      },
      {
        id: 'design-agent',
        tabId: 'design-agent',
        icon: 'sparkles',
        label: {
          zh: '设计智能体',
          en: 'Design Agent',
        },
        description: {
          zh: '海报、Banner 与商用视觉自动化',
          en: 'Automated poster & commercial visual design',
        },
        badge: 'SOON',
        href: '/studio?tab=design-agent',
      },
      {
        id: 'ai-influencer',
        tabId: 'ai-influencer',
        icon: 'bot',
        label: {
          zh: '角色设计器',
          en: 'Character Designer',
        },
        description: {
          zh: '全能原创角色设定与高精概念形象定制',
          en: 'Original character concept design and visual crafting',
        },
        badge: 'NEW',
        href: '/studio?tab=ai-influencer',
      },
    ],
    models: [
      {
        id: 'seedream-5-0-pro',
        modelKey: 'bytedance-seedream-5.0-pro',
        tabId: 'image',
        name: 'Seedream 5.0 专业版',
        provider: 'ByteDance',
        description: {
          zh: '针对电影级和文字丰富的视觉效果进行了优化。',
          en: 'Optimized for cinematic visual effects.',
        },
        badge: 'SOON',
        href: '/studio?tab=image&model=bytedance-seedream-5.0-pro',
      },
      {
        id: 'gpt-image-2-5-flash',
        modelKey: 'gpt-image-2.5-flash',
        tabId: 'image',
        name: 'Seedream 4.5 极速',
        provider: 'ByteDance',
        description: {
          zh: '火山引擎 Seedream 4.5 官方极速绘图，细节细腻，20 积分/张',
          en: 'Official Seedream 4.5 high-speed generation, 20 credits/image',
        },
        badge: 'HOT',
        href: '/studio?tab=image&model=gpt-image-2.5-flash',
      },
      {
        id: 'seedream-3-0',
        modelKey: 'bytedance-seedream-v3',
        tabId: 'image',
        name: 'Seedream 3.0',
        provider: 'ByteDance',
        description: {
          zh: '稳定可靠的经典图像生成底座，10 积分/张',
          en: 'Classic cost-effective image generation, 10 credits/image',
        },
        badge: 'TOP',
        href: '/studio?tab=image&model=bytedance-seedream-v3',
      },
      {
        id: 'midjourney-v7',
        modelKey: 'midjourney-v7',
        tabId: 'image',
        name: 'Midjourney v7',
        provider: 'Midjourney',
        description: {
          zh: '顶尖艺术质感与审美，支持角色一致性与风格参考',
          en: 'Top artistic aesthetics, supports character and style references',
        },
        badge: 'SOON',
        href: '/studio?tab=image&model=midjourney-v7',
      },
      {
        id: 'nano-banana-pro',
        modelKey: 'nano-banana-pro',
        tabId: 'image',
        name: 'Nano Banana Pro',
        provider: 'Google DeepMind',
        description: {
          zh: '顶级 4K 超微细节与写实光影',
          en: 'Best 4K image model with micro-detail precision',
        },
        badge: 'SOON',
        href: '/studio?tab=image&model=nano-banana-pro',
      },
      {
        id: 'vidu-q2',
        modelKey: 'vidu-q2-text-to-image',
        tabId: 'image',
        name: 'Vidu Q2',
        provider: 'ShengShu',
        description: {
          zh: '生动多模态高品质图像生成底座',
          en: 'Vivid multimodal high-quality image generation foundation',
        },
        badge: 'SOON',
        href: '/studio?tab=image&model=vidu-q2-text-to-image',
      },
    ],
  },
  {
    id: 'video',
    tabId: 'video',
    label: {
      zh: '视频',
      en: 'Video',
    },
    href: '/studio?tab=video',
    badge: null,
    features: [
      {
        id: 'cinema',
        tabId: 'cinema',
        icon: 'video',
        label: {
          zh: '电影影视工作室',
          en: 'Cinema Studio',
        },
        description: {
          zh: '电影级景深、运镜与电影感调色',
          en: 'Cinematic film-grade aesthetic & lens controls',
        },
        badge: 'TOP',
        href: '/studio?tab=cinema',
      },
      {
        id: 'video',
        tabId: 'video',
        icon: 'video',
        label: {
          zh: '视频工作室',
          en: 'Video Studio',
        },
        description: {
          zh: '文生视频与图生视频基础工作台',
          en: 'Text & image to video foundation workspace',
        },
        badge: 'HOT',
        href: '/studio?tab=video',
      },
      {
        id: 'clipping',
        tabId: 'clipping',
        icon: 'zap',
        label: {
          zh: 'AI 剪辑',
          en: 'AI Clipping',
        },
        description: {
          zh: '智能识别高光片段与自动化剪辑',
          en: 'Smart highlight extraction & automated editing',
        },
        badge: 'SOON',
        href: '/studio?tab=clipping',
      },
      {
        id: 'motion-control',
        tabId: 'motion-control',
        icon: 'compass',
        label: {
          zh: '动作控制',
          en: 'Motion Control',
        },
        description: {
          zh: '骨骼姿态追踪与动作轨迹驱动',
          en: 'Skeletal pose tracking & motion transfer',
        },
        badge: 'SOON',
        href: '/studio?tab=motion-control',
      },
      {
        id: 'vibe-motion',
        tabId: 'vibe-motion',
        icon: 'zap',
        label: {
          zh: '动感运镜',
          en: 'Vibe Motion',
        },
        description: {
          zh: '推拉摇移与复杂动态摄像机转场',
          en: 'Dynamic camera paths, zooms and pans',
        },
        badge: 'SOON',
        href: '/studio?tab=vibe-motion',
      },
      {
        id: 'lipsync',
        tabId: 'lipsync',
        icon: 'bot',
        label: {
          zh: '唇形同步',
          en: 'Lip Sync',
        },
        description: {
          zh: '音频与人物嘴型高精度对齐匹配',
          en: 'Precision lip sync matching voice & audio',
        },
        badge: 'SOON',
        href: '/studio?tab=lipsync',
      },
      {
        id: 'body-swap',
        tabId: 'body-swap',
        icon: 'user',
        label: {
          zh: '换体工作室',
          en: 'Body Swap',
        },
        description: {
          zh: '角色身形替换与动作无缝融合',
          en: 'Seamless character body & pose replacement',
        },
        badge: 'SOON',
        href: '/studio?tab=body-swap',
      },
      {
        id: 'marketing',
        tabId: 'marketing',
        icon: 'sparkles',
        label: {
          zh: '营销工作室',
          en: 'Marketing Studio',
        },
        description: {
          zh: '爆款带货短视频与电商切片制作',
          en: 'High-converting marketing clips & ads',
        },
        badge: 'SOON',
        href: '/studio?tab=marketing',
      },
    ],
    models: [
      {
        id: 'kling-3-0',
        modelKey: 'kling-v3.0-standard-text-to-video',
        tabId: 'video',
        name: 'Kling 3.0 Pro',
        provider: 'Kuaishou',
        description: {
          zh: '顶级物理规律模拟与大幅度连贯动态，35 积分/次',
          en: 'SOTA physics simulation & dynamic coherent motion, 35 credits',
        },
        badge: 'HOT',
        href: '/studio?tab=video&model=kling-v3.0-standard-text-to-video',
      },
      {
        id: 'seedance-2-5',
        modelKey: 'seedance-2.5-text-to-video',
        tabId: 'video',
        name: 'Seedance 2.5',
        provider: 'ByteDance',
        description: {
          zh: '音视频原生协同生成，电影级质感与运镜',
          en: 'Native audio-visual co-generation, cinematic quality & camera',
        },
        badge: 'TOP',
        href: '/studio?tab=video&model=seedance-2.5-text-to-video',
      },
      {
        id: 'minimax-hailuo-2-3',
        modelKey: 'minimax-hailuo-2.3-standard-t2v',
        tabId: 'video',
        name: 'MiniMax Hailuo 2.3',
        provider: 'MiniMax',
        description: {
          zh: '电影级叙事张力与自然生动的微表情神态，30 积分/次',
          en: 'Cinematic storytelling & rich micro-expressions, 30 credits',
        },
        badge: 'TOP',
        href: '/studio?tab=video&model=minimax-hailuo-2.3-standard-t2v',
      },
      {
        id: 'google-veo-3-1',
        modelKey: 'veo3.1-text-to-video',
        tabId: 'video',
        name: 'Google Veo 3.1',
        provider: 'Google DeepMind',
        description: {
          zh: '高保真电影级高清视频生成底座，38 积分/次',
          en: 'Cinematic HD video generation, 38 credits',
        },
        badge: '3.1',
        href: '/studio?tab=video&model=veo3.1-text-to-video',
      },
      {
        id: 'google-veo-3',
        modelKey: 'veo3-text-to-video',
        tabId: 'video',
        name: 'Google Veo 3',
        provider: 'Google DeepMind',
        description: {
          zh: '高保真电影运镜与超高清生成底座，30 积分/次',
          en: 'High-fidelity cinematic camera paths & Ultra HD, 30 credits',
        },
        badge: 'NEW',
        href: '/studio?tab=video&model=veo3-text-to-video',
      },
      {
        id: 'wan-2-7',
        modelKey: 'wan2.7-text-to-video',
        tabId: 'video',
        name: 'Wan 2.7',
        provider: 'Alibaba',
        description: {
          zh: '高动态稳定性与优质语义还原',
          en: 'High temporal stability & prompt alignment',
        },
        badge: 'SOON',
        href: '/studio?tab=video&model=wan2.7-text-to-video',
      },
      {
        id: 'runway-gen3-alpha',
        modelKey: 'runway-image-to-video',
        tabId: 'video',
        name: 'Runway Gen-3 Alpha',
        provider: 'Runway',
        description: {
          zh: '影视行业级镜头控制与高保真画质',
          en: 'Industry-grade camera controls & visual fidelity',
        },
        badge: 'SOON',
        href: '/studio?tab=video&model=runway-image-to-video',
      },
      {
        id: 'openai-sora-2',
        modelKey: 'openai-sora-2-text-to-video',
        tabId: 'video',
        name: 'OpenAI Sora 2',
        provider: 'OpenAI',
        description: {
          zh: '世界模拟与超长镜头连贯生成',
          en: 'World simulation & coherent long-shot generation',
        },
        badge: 'SOON',
        href: '/studio?tab=video&model=openai-sora-2-text-to-video',
      },
      {
        id: 'luma-dream-machine',
        modelKey: 'luma-dream-machine',
        tabId: 'video',
        name: 'Luma Dream Machine',
        provider: 'Luma AI',
        description: {
          zh: '自然光影动态与顺滑转场过渡',
          en: 'Realistic lighting dynamics & seamless transitions',
        },
        badge: 'SOON',
        href: '/studio?tab=video&model=luma-dream-machine',
      },
    ],
  },
  {
    id: 'audio',
    tabId: 'audio',
    label: {
      zh: '音频',
      en: 'Audio',
    },
    href: '/studio?tab=audio',
    badge: null,
    features: [
      {
        id: 'audio',
        tabId: 'audio',
        icon: 'audio',
        label: {
          zh: '音频工作室',
          en: 'Audio Studio',
        },
        description: {
          zh: 'AI 全曲编曲、人声克隆与专业音效',
          en: 'AI song composition, voice cloning & sound FX',
        },
        badge: 'SOON',
        href: '/studio?tab=audio',
      },
    ],
    models: [
      {
        id: 'suno-v4',
        modelKey: 'suno-create-music',
        tabId: 'audio',
        name: 'Suno v4',
        provider: 'Suno',
        description: {
          zh: '全曲高保真编曲与极富感染力的人声演唱',
          en: 'Full-song generation with emotive vocal styles',
        },
        badge: 'SOON',
        href: '/studio?tab=audio&model=suno-create-music',
      },
      {
        id: 'minimax-music-3-0',
        modelKey: 'minimax-music-3.0',
        tabId: 'audio',
        name: 'MiniMax Music 3.0',
        provider: 'MiniMax',
        description: {
          zh: '专业级多声部全曲编曲与逼真人声演唱，15 积分/次',
          en: 'Studio-grade multi-track song synthesis, 15 credits',
        },
        badge: 'HOT',
        href: '/studio?tab=audio&model=minimax-music-3.0',
      },
      {
        id: 'udio-v1-5',
        modelKey: 'udio-v1.5',
        tabId: 'audio',
        name: 'Udio v1.5',
        provider: 'Udio',
        description: {
          zh: '母带级专业音乐制作与高保真分轨',
          en: 'Studio-grade music production & stem separation',
        },
        badge: 'SOON',
        href: '/studio?tab=audio&model=udio-v1.5',
      },
      {
        id: 'minimax-speech-2-6-hd',
        modelKey: 'minimax-speech-2.6-hd',
        tabId: 'audio',
        name: 'MiniMax Speech 2.6 HD',
        provider: 'MiniMax',
        description: {
          zh: '超拟真人性化语音合成与多语言克隆',
          en: 'Ultra-realistic humanlike voice synthesis & cloning',
        },
        badge: 'SOON',
        href: '/studio?tab=audio&model=minimax-speech-2.6-hd',
      },
    ],
  },
  {
    id: 'agents-automation',
    tabId: 'workflows',
    label: {
      zh: '智能体与工作流',
      en: 'Agents & Workflows',
    },
    href: '/studio?tab=workflows',
    badge: 'BETA',
    features: [
      {
        id: 'workflows',
        tabId: 'workflows',
        icon: 'zap',
        label: {
          zh: 'AI 创作工作流',
          en: 'Workflows',
        },
        description: {
          zh: '可视化节点编排与全链路自动化生成',
          en: 'Visual node orchestration & automated pipeline',
        },
        badge: 'BETA',
        href: '/studio?tab=workflows',
      },
      {
        id: 'agents',
        tabId: 'agents',
        icon: 'bot',
        label: {
          zh: '创作智能体',
          en: 'Agents',
        },
        description: {
          zh: '自主思考与分步执行的 AI 创作助理',
          en: 'Autonomous thinking & multi-step creative assistant',
        },
        badge: 'SOON',
        href: '/studio?tab=agents',
      },
    ],
    models: [
      {
        id: 'deepseek-r1',
        modelKey: 'deepseek-r1',
        tabId: 'agents',
        name: 'DeepSeek-R1',
        provider: 'DeepSeek',
        description: {
          zh: '深度长思考与复杂多步骤任务规划',
          en: 'Deep reasoning & complex multi-step task planning',
        },
        badge: 'SOON',
        href: '/studio?tab=agents&model=deepseek-r1',
      },
      {
        id: 'claude-3-7-sonnet',
        modelKey: 'claude-3-7-sonnet',
        tabId: 'agents',
        name: 'Claude 3.7 Sonnet',
        provider: 'Anthropic',
        description: {
          zh: '顶级多模态编排与代码/工作流生成',
          en: 'Premier multimodal orchestration & workflow coding',
        },
        badge: 'SOON',
        href: '/studio?tab=agents&model=claude-3-7-sonnet',
      },
      {
        id: 'gpt-4o',
        modelKey: 'gpt-4o',
        tabId: 'agents',
        name: 'GPT-4o',
        provider: 'OpenAI',
        description: {
          zh: '全能高响应多模态视觉理解与任务执行',
          en: 'Omni high-speed multimodal vision & execution',
        },
        badge: 'SOON',
        href: '/studio?tab=agents&model=gpt-4o',
      },
    ],
  },
  {
    id: 'community',
    tabId: null,
    label: {
      zh: '社区',
      en: 'Community',
    },
    href: '/community',
    badge: null,
    features: [
      {
        id: 'explore-feed',
        tabId: null,
        icon: 'compass',
        label: {
          zh: '探索灵感',
          en: 'Explore Feed',
        },
        description: {
          zh: '浏览全球创作者精选作品与提示词',
          en: 'Browse featured creations & prompts worldwide',
        },
        badge: 'HOT',
        href: '/community',
      },
      {
        id: 'remix-hub',
        tabId: null,
        icon: 'sparkles',
        label: {
          zh: '一键同款',
          en: 'Remix Hub',
        },
        description: {
          zh: '一键载入热门作品参数与工作流',
          en: 'One-click load popular parameters & workflows',
        },
        badge: 'NEW',
        href: '/community?tab=remix',
      },
    ],
    models: [],
  },
];

const MEGA_NAV_COPY = {
  en: {
    explore: 'Explore',
    features: 'Features',
    models: 'Models',
    modelsReady: 'Ready',
  },
  'zh-CN': {
    explore: '探索',
    features: '功能与工具',
    models: '核心模型矩阵',
    modelsReady: '款就绪',
  },
  'zh-TW': {
    explore: '探索',
    features: '功能與工具',
    models: '核心模型矩陣',
    modelsReady: '款就緒',
  },
  'ja-JP': {
    explore: '探索',
    features: '機能とツール',
    models: 'コアモデルマトリックス',
    modelsReady: '個が利用可能',
  },
  'ko-KR': {
    explore: '탐색',
    features: '기능 및 도구',
    models: '핵심 모델 매트릭스',
    modelsReady: '개 준비 완료',
  },
  es: {
    explore: 'Explorar',
    features: 'Funciones y herramientas',
    models: 'Modelos principales',
    modelsReady: 'listos',
  },
};

/**
 * 辅助函数：根据当前语言获取格式化后的导航项
 * @param {string} locale
 */
export function getMegaNavCategories(locale = 'zh') {
  const norm = normalizeLocale(locale);
  const isZh = norm.startsWith('zh');
  const langKey = norm === 'zh-TW' ? 'zh-TW' : (isZh ? 'zh' : (norm === 'ja-JP' ? 'ja-JP' : (norm === 'ko-KR' ? 'ko-KR' : (norm === 'es' ? 'es' : 'en'))));
  const rootPath = getLocaleConfig(norm)?.rootPath || '';
  const studioBase = rootPath ? `${rootPath}/studio` : '/studio';
  const communityBase = (rootPath && rootPath === '/zh') ? '/zh/community' : '/community';

  const pickText = (obj) => {
    if (!obj) return '';
    return obj[langKey] || (isZh ? obj.zh : null) || obj.en || obj.zh || '';
  };

  const localizeUrl = (rawHref) => {
    if (!rawHref) return rawHref;
    if (rawHref.startsWith('/studio')) {
      return rawHref.replace('/studio', studioBase);
    }
    if (rawHref.startsWith('/community')) {
      return rawHref.replace('/community', communityBase);
    }
    return rawHref;
  };

  return MEGA_NAV_CATEGORIES.map((cat) => ({
    ...cat,
    label: pickText(cat.label),
    href: localizeUrl(cat.href),
    features: (cat.features || []).map((feat) => ({
      ...feat,
      label: pickText(feat.label),
      description: pickText(feat.description),
      href: localizeUrl(feat.href),
    })),
    models: (cat.models || []).map((m) => ({
      ...m,
      description: pickText(m.description),
      href: localizeUrl(m.href),
    })),
  }));
}

export function getMegaNavCopy(locale = 'zh') {
  const norm = normalizeLocale(locale);
  return MEGA_NAV_COPY[norm] || MEGA_NAV_COPY.en;
}

/**
 * 辅助函数：通过 tabId 查找 Feature
 */
export function findFeatureByTabId(tabId) {
  for (const cat of MEGA_NAV_CATEGORIES) {
    const found = cat.features?.find((f) => f.tabId === tabId);
    if (found) return found;
  }
  return null;
}

/**
 * 辅助函数：通过 modelKey 查找 Model
 */
export function findModelByKey(modelKey) {
  for (const cat of MEGA_NAV_CATEGORIES) {
    const found = cat.models?.find((m) => m.modelKey === modelKey);
    if (found) return found;
  }
  return null;
}
