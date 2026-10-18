import { getSettingByKey, updateSettingValue } from '../repositories/settings.js';
import { createCommunityPost } from '../repositories/community.js';

const CONFIG_KEY = 'crawler_x_config';
const PROMPTS_CACHE_KEY = 'crawler_x_prompts_cache';

const DEFAULT_CONFIG = {
  status: 'unconfigured', // 'ready' | 'unconfigured' | 'error'
  lastCheckAt: null,
  cookies: {
    authToken: '',
    ct0: '',
  },
  rules: {
    imageQuery: '(Flux OR Midjourney OR "Stable Diffusion") (prompt OR "prompt:") has:images -is:retweet min_faves:10',
    videoQuery: '(Kling OR Runway OR Luma OR Sora OR Hailuo OR Minimax) prompt (has:videos OR filter:media) -is:retweet',
    musicQuery: '(Suno OR Udio) (prompt OR lyrics OR style) -is:retweet',
    limitPerRun: 15,
    minFaves: 10,
    targetAuthors: ['fofrAI', 'icreatelife', 'oran_ge', 'properprompter', 'LinusEkenstam'],
    autoSchedule: false,
    intervalHours: 2,
  },
};

const SEED_PROMPTS = [
  {
    id: 'x_1847291039481902001',
    tweetId: '1847291039481902001',
    category: 'image',
    model: 'Flux.1 Schnell',
    author: 'properprompter',
    authorName: 'Prompt Engineer',
    authorAvatar: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=100&auto=format&fit=crop&q=80',
    prompt: 'A cinematic high-fashion portrait of an East Asian model adorned with glowing luminescent mycelium patterns on cheekbones, muted obsidian background, soft studio edge lighting, 85mm f/1.4 lens, hyper-realistic skin texture, vogue editorial grade.',
    negativePrompt: 'deformed, blurry, cartoon, oversaturated, plastic skin, lowres',
    parameters: '--ar 4:5 --raw --stylize 180',
    mediaType: 'image',
    mediaUrls: [
      'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=800&auto=format&fit=crop&q=80'
    ],
    likes: 1420,
    retweets: 312,
    tweetUrl: 'https://x.com/properprompter/status/1847291039481902001',
    tweetCreatedAt: new Date(Date.now() - 3600 * 1000 * 2).toISOString(),
    crawledAt: new Date(Date.now() - 3600 * 1000 * 1).toISOString(),
    status: 'pending',
    adoptedPostId: null,
  },
  {
    id: 'x_1847291039481902002',
    tweetId: '1847291039481902002',
    category: 'video',
    model: 'Kling 1.5 Pro',
    author: 'icreatelife',
    authorName: 'AI Cinephile',
    authorAvatar: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=100&auto=format&fit=crop&q=80',
    prompt: 'Slow-motion macro fluid dynamics, viscous metallic liquid mercury dissolving into iridescent golden particles under cinematic chiaroscuro volumetric lighting, seamless camera push-in at 60fps.',
    negativePrompt: 'jitter, flicker, morphing artifacts, low quality',
    parameters: '--camera zoom-in --motion 6 --duration 5s',
    mediaType: 'video',
    mediaUrls: [
      'https://images.unsplash.com/photo-1634017839464-5c339ebe3cb4?w=800&auto=format&fit=crop&q=80'
    ],
    likes: 2890,
    retweets: 645,
    tweetUrl: 'https://x.com/icreatelife/status/1847291039481902002',
    tweetCreatedAt: new Date(Date.now() - 3600 * 1000 * 5).toISOString(),
    crawledAt: new Date(Date.now() - 3600 * 1000 * 3).toISOString(),
    status: 'pending',
    adoptedPostId: null,
  },
  {
    id: 'x_1847291039481902003',
    tweetId: '1847291039481902003',
    category: 'music',
    model: 'Suno v3.5',
    author: 'synthwave_sound',
    authorName: 'Sonic Architect',
    authorAvatar: 'https://images.unsplash.com/photo-1517841905240-472988babdf9?w=100&auto=format&fit=crop&q=80',
    prompt: '[Style: Dark synthwave, analog bassline, retro 1984 synthesizers, gated snare, moody cyberpunk vocals]\n[Verse 1]\nNeon shadows bleed into rain,\nEngines hum through empty veins,\nCounting down the ghost city light,\nLost forever in the binary night.',
    negativePrompt: '',
    parameters: '120 bpm, Minor Key, High energy',
    mediaType: 'audio',
    mediaUrls: [
      'https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=800&auto=format&fit=crop&q=80'
    ],
    likes: 890,
    retweets: 180,
    tweetUrl: 'https://x.com/synthwave_sound/status/1847291039481902003',
    tweetCreatedAt: new Date(Date.now() - 3600 * 1000 * 8).toISOString(),
    crawledAt: new Date(Date.now() - 3600 * 1000 * 4).toISOString(),
    status: 'pending',
    adoptedPostId: null,
  },
  {
    id: 'x_1847291039481902004',
    tweetId: '1847291039481902004',
    category: 'image',
    model: 'Midjourney v6.1',
    author: 'oran_ge',
    authorName: 'Orange AI Lab',
    authorAvatar: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=100&auto=format&fit=crop&q=80',
    prompt: 'Architectural minimalism, a brutalist pavilion floating above calm turquoise alpine waters, morning mist, sharp glass reflections, Scandinavian timber accents, overcast daylight, Hasselblad X2D 100C rendering.',
    negativePrompt: 'overcrowded, high contrast, oversaturated, people, bad geometry',
    parameters: '--ar 16:9 --stylize 250 --v 6.1',
    mediaType: 'image',
    mediaUrls: [
      'https://images.unsplash.com/photo-1600585154340-be6161a56a0c?w=800&auto=format&fit=crop&q=80'
    ],
    likes: 3410,
    retweets: 820,
    tweetUrl: 'https://x.com/oran_ge/status/1847291039481902004',
    tweetCreatedAt: new Date(Date.now() - 3600 * 1000 * 12).toISOString(),
    crawledAt: new Date(Date.now() - 3600 * 1000 * 6).toISOString(),
    status: 'adopted',
    adoptedPostId: 'builtin_case_01',
  },
];

/**
 * 获取抓取器配置
 */
export async function getCrawlerConfig() {
  try {
    const row = await getSettingByKey(CONFIG_KEY);
    if (!row || !row.value) {
      return { ...DEFAULT_CONFIG };
    }
    const val = row.value;
    return {
      status: val.status || (val.cookies?.authToken ? 'ready' : 'unconfigured'),
      lastCheckAt: val.lastCheckAt || null,
      cookies: {
        authToken: val.cookies?.authToken || '',
        ct0: val.cookies?.ct0 || '',
      },
      rules: {
        ...DEFAULT_CONFIG.rules,
        ...(val.rules || {}),
      },
    };
  } catch (err) {
    console.error('getCrawlerConfig error:', err);
    return { ...DEFAULT_CONFIG };
  }
}

/**
 * 更新抓取器配置
 */
export async function updateCrawlerConfig(newConfig, userEmail = 'admin') {
  const current = await getCrawlerConfig();
  const merged = {
    ...current,
    ...newConfig,
    cookies: {
      ...current.cookies,
      ...(newConfig.cookies || {}),
    },
    rules: {
      ...current.rules,
      ...(newConfig.rules || {}),
    },
    status: (newConfig.cookies?.authToken || current.cookies.authToken) ? 'ready' : 'unconfigured',
    lastCheckAt: new Date().toISOString(),
  };

  await updateSettingValue({
    key: CONFIG_KEY,
    value: merged,
    updatedBy: userEmail,
  });

  return merged;
}

/**
 * 获取提示词灵感列表（支持搜索、分类、状态筛选、分页）
 */
export async function getCrawledPrompts({
  category = 'all',
  q = '',
  status = 'all',
  page = 1,
  pageSize = 24,
} = {}) {
  try {
    const row = await getSettingByKey(PROMPTS_CACHE_KEY);
    let items = (row && Array.isArray(row.value) && row.value.length > 0)
      ? row.value
      : [...SEED_PROMPTS];

    // 如果是第一次，持久化种子数据
    if (!row || !row.value) {
      await updateSettingValue({
        key: PROMPTS_CACHE_KEY,
        value: SEED_PROMPTS,
        updatedBy: 'system_init',
      });
    }

    // 过滤逻辑
    if (category && category !== 'all') {
      items = items.filter(item => item.category === category);
    }

    if (status && status !== 'all') {
      items = items.filter(item => item.status === status);
    }

    if (q && q.trim()) {
      const term = q.trim().toLowerCase();
      items = items.filter(item =>
        (item.prompt && item.prompt.toLowerCase().includes(term)) ||
        (item.model && item.model.toLowerCase().includes(term)) ||
        (item.author && item.author.toLowerCase().includes(term)) ||
        (item.parameters && item.parameters.toLowerCase().includes(term))
      );
    }

    const total = items.length;
    const startIndex = (page - 1) * pageSize;
    const paginated = items.slice(startIndex, startIndex + pageSize);

    // 统计各分类数量
    const allItemsRow = await getSettingByKey(PROMPTS_CACHE_KEY);
    const allList = (allItemsRow && Array.isArray(allItemsRow.value)) ? allItemsRow.value : SEED_PROMPTS;
    const counts = {
      all: allList.length,
      image: allList.filter(i => i.category === 'image').length,
      video: allList.filter(i => i.category === 'video').length,
      music: allList.filter(i => i.category === 'music').length,
      adopted: allList.filter(i => i.status === 'adopted').length,
    };

    return {
      items: paginated,
      total,
      page,
      pageSize,
      counts,
    };
  } catch (err) {
    console.error('getCrawledPrompts error:', err);
    return {
      items: SEED_PROMPTS,
      total: SEED_PROMPTS.length,
      page: 1,
      pageSize,
      counts: { all: 4, image: 2, video: 1, music: 1, adopted: 1 },
    };
  }
}

/**
 * 结构化解析推文中的提示词、模型、参数
 */
export function extractPromptDetails(text = '') {
  if (!text) return { prompt: '', model: 'AI Generator', parameters: '', negativePrompt: '', category: 'image' };

  let raw = text;
  let category = 'image';
  let model = 'AI Model';
  let parameters = '';
  let negativePrompt = '';

  // 1. 判断分类与模型
  const lower = raw.toLowerCase();
  if (lower.includes('suno') || lower.includes('udio') || lower.includes('lyrics') || lower.includes('[verse') || lower.includes('[chorus')) {
    category = 'music';
    model = lower.includes('udio') ? 'Udio' : 'Suno v3.5';
  } else if (lower.includes('kling') || lower.includes('runway') || lower.includes('luma') || lower.includes('sora') || lower.includes('hailuo') || lower.includes('minimax') || lower.includes('pika')) {
    category = 'video';
    if (lower.includes('kling')) model = 'Kling AI';
    else if (lower.includes('runway')) model = 'Runway Gen-3';
    else if (lower.includes('luma')) model = 'Luma Dream Machine';
    else if (lower.includes('hailuo') || lower.includes('minimax')) model = 'Hailuo Minimax';
    else model = 'AI Video';
  } else {
    category = 'image';
    if (lower.includes('flux')) model = 'Flux.1';
    else if (lower.includes('midjourney') || lower.includes('--v ') || lower.includes('/imagine')) model = 'Midjourney v6.1';
    else if (lower.includes('sdxl') || lower.includes('stable diffusion')) model = 'SDXL';
    else model = 'Flux.1 / Midjourney';
  }

  // 2. 提取参数 (如 --ar 16:9 --v 6.1 等)
  const paramMatches = raw.match(/--[a-zA-Z0-9_-]+(\s+[a-zA-Z0-9_:./-]+)?/g);
  if (paramMatches && paramMatches.length > 0) {
    parameters = paramMatches.join(' ');
    // 从正文中移除参数，保持 prompt 纯净
    paramMatches.forEach(p => {
      raw = raw.replace(p, '');
    });
  }

  // 3. 提取负面提示词 (如 Negative prompt: ...)
  const negMatch = raw.match(/(?:Negative\s*prompt|Negative\s*:|负面提示词)\s*[:：]?\s*([^\n\r]+)/i);
  if (negMatch) {
    negativePrompt = negMatch[1]
      .replace(/https?:\/\/t\.co\/[a-zA-Z0-9]+/g, '')
      .replace(/#\w+/g, '')
      .trim();
    raw = raw.replace(negMatch[0], '');
  }

  // 4. 清理 prompt 引导词
  let cleanPrompt = raw
    .replace(/\/imagine\s+prompt\s*:\s*/gi, '')
    .replace(/^prompt\s*[:：]\s*/gim, '')
    .replace(/^Prompt\s*[:：]\s*/gim, '')
    .replace(/https?:\/\/t\.co\/[a-zA-Z0-9]+/g, '') // 移除推特短链接
    .replace(/#\w+/g, '') // 移除 hashtag 噪音
    .trim();

  // 清洗首尾多余引号
  cleanPrompt = cleanPrompt.replace(/^["'“](.*)["'”]$/, '$1').trim();

  return {
    prompt: cleanPrompt || text.slice(0, 300),
    negativePrompt,
    parameters,
    model,
    category,
  };
}

/**
 * 执行实时 X 抓取
 */
export async function executeTwitterCrawl({ category = 'all', limit = 15, userEmail = 'admin' } = {}) {
  const config = await getCrawlerConfig();

  const authToken = config.cookies?.authToken?.trim();
  const ct0 = config.cookies?.ct0?.trim();

  // 若没有配置凭证，则给出提示
  if (!authToken || !ct0) {
    return {
      success: false,
      error: 'MISSING_CREDENTIALS',
      message: '请先在「抓取控制台」配置 X 账号凭据 (auth_token 与 ct0 Cookie)',
    };
  }

  try {
    // 动态载入 agent-twitter-client
    const { Scraper, SearchMode } = await import('agent-twitter-client');
    const scraper = new Scraper();

    await scraper.setCookies([
      `auth_token=${authToken}; Domain=.twitter.com; Path=/; Secure;`,
      `ct0=${ct0}; Domain=.twitter.com; Path=/;`,
    ]);

    // 确定搜索 Query
    let query = config.rules.imageQuery;
    if (category === 'video') query = config.rules.videoQuery;
    if (category === 'music') query = config.rules.musicQuery;
    if (category === 'all') {
      query = `(Flux OR Midjourney OR Kling OR Suno) (prompt OR "prompt:") -is:retweet min_faves:10`;
    }

    const maxResults = Math.min(limit || config.rules.limitPerRun || 15, 30);
    const tweetIterator = scraper.searchTweets(query, maxResults, SearchMode.Latest);

    const newItems = [];
    for await (const tweet of tweetIterator) {
      if (!tweet || !tweet.text) continue;

      const parsed = extractPromptDetails(tweet.text);
      if (!parsed.prompt || parsed.prompt.length < 10) continue;

      const photos = (tweet.photos || []).map(p => p.url).filter(Boolean);
      const videos = (tweet.videos || []).map(v => v.preview || v.url).filter(Boolean);
      const mediaUrls = [...photos, ...videos];

      const item = {
        id: `x_${tweet.id}`,
        tweetId: String(tweet.id),
        category: parsed.category,
        model: parsed.model,
        author: tweet.username || 'unknown',
        authorName: tweet.name || tweet.username || 'AI Creator',
        authorAvatar: 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=100&auto=format&fit=crop&q=80',
        prompt: parsed.prompt,
        negativePrompt: parsed.negativePrompt || '',
        parameters: parsed.parameters || '',
        mediaType: parsed.category === 'video' ? 'video' : parsed.category === 'music' ? 'audio' : 'image',
        mediaUrls: mediaUrls.length > 0 ? mediaUrls : ['https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=800&auto=format&fit=crop&q=80'],
        likes: tweet.likes || 0,
        retweets: tweet.retweets || 0,
        tweetUrl: `https://x.com/${tweet.username}/status/${tweet.id}`,
        tweetCreatedAt: tweet.timeParsed ? new Date(tweet.timeParsed).toISOString() : new Date().toISOString(),
        crawledAt: new Date().toISOString(),
        status: 'pending',
        adoptedPostId: null,
      };

      newItems.push(item);
    }

    if (newItems.length > 0) {
      // 合并入缓存库
      const row = await getSettingByKey(PROMPTS_CACHE_KEY);
      const existing = (row && Array.isArray(row.value)) ? row.value : [...SEED_PROMPTS];
      
      const existingIds = new Set(existing.map(i => i.tweetId));
      const filteredNew = newItems.filter(i => !existingIds.has(i.tweetId));
      
      const merged = [...filteredNew, ...existing].slice(0, 300); // 保持最近 300 条
      await updateSettingValue({
        key: PROMPTS_CACHE_KEY,
        value: merged,
        updatedBy: userEmail,
      });

      // 更新抓取器存活状态
      await updateCrawlerConfig({ status: 'ready', lastCheckAt: new Date().toISOString() }, userEmail);

      return {
        success: true,
        totalFetched: newItems.length,
        newAdded: filteredNew.length,
        items: filteredNew,
      };
    }

    return {
      success: true,
      totalFetched: 0,
      newAdded: 0,
      items: [],
      message: '未发现新增的高质量提示词推文，可尝试调整监控关键词。',
    };
  } catch (err) {
    console.error('executeTwitterCrawl failed:', err);
    await updateCrawlerConfig({ status: 'error', lastCheckAt: new Date().toISOString() }, userEmail);
    return {
      success: false,
      error: 'CRAWL_FAILED',
      message: err.message || '抓取失败，请检查网络代理环境或更新 Cookie 凭证',
    };
  }
}

/**
 * 采纳提示词到社区作品库
 */
export async function adoptPromptToCommunity({ promptId, title, user }) {
  if (!promptId) throw new Error('缺少 promptId');

  const row = await getSettingByKey(PROMPTS_CACHE_KEY);
  const items = (row && Array.isArray(row.value)) ? row.value : [...SEED_PROMPTS];

  const targetIndex = items.findIndex(i => i.id === promptId);
  if (targetIndex === -1) {
    throw new Error('未找到对应提示词案例');
  }

  const promptItem = items[targetIndex];

  // 调用社区发布仓库
  const post = await createCommunityPost({
    userId: user?.id || 'admin_crawler',
    title: title || `${promptItem.model} 灵感：${promptItem.prompt.slice(0, 30)}...`,
    description: `来自 @${promptItem.author} 的 X (Twitter) 精选灵感案例。\n原推链接：${promptItem.tweetUrl}`,
    mediaType: promptItem.mediaType,
    mediaUrl: promptItem.mediaUrls[0] || '',
    coverUrl: promptItem.mediaUrls[0] || '',
    prompt: promptItem.prompt,
    negativePrompt: promptItem.negativePrompt,
    modelName: promptItem.model,
    parameters: {
      rawParams: promptItem.parameters,
      source: 'twitter_crawl',
      author: promptItem.author,
      tweetUrl: promptItem.tweetUrl,
    },
    tags: [promptItem.model, promptItem.category, 'X精选'],
  });

  // 更新当前提示词状态
  items[targetIndex] = {
    ...promptItem,
    status: 'adopted',
    adoptedPostId: post.id,
  };

  await updateSettingValue({
    key: PROMPTS_CACHE_KEY,
    value: items,
    updatedBy: user?.email || 'admin',
  });

  return {
    success: true,
    post,
    promptItem: items[targetIndex],
  };
}

/**
 * 删除某条提示词记录
 */
export async function deletePromptItem(promptId, userEmail = 'admin') {
  const row = await getSettingByKey(PROMPTS_CACHE_KEY);
  let items = (row && Array.isArray(row.value)) ? row.value : [...SEED_PROMPTS];

  items = items.filter(i => i.id !== promptId);
  await updateSettingValue({
    key: PROMPTS_CACHE_KEY,
    value: items,
    updatedBy: userEmail,
  });

  return { success: true };
}
