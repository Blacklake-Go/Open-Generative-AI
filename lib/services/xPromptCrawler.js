import { getSettingByKey, updateSettingValue } from '../repositories/settings.js';

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
    targetAuthorMode: 'all', // 'all' (全网关键词检索) | 'specified' (仅监控名单博主)
    targetAuthors: ['fofrAI', 'icreatelife', 'oran_ge', 'properprompter', 'LinusEkenstam'],
    autoSchedule: false,
    intervalHours: 2,
  },
};

const SEED_PROMPTS = [];

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
 * 获取提示词灵感列表（支持搜索、分类、博主筛选、状态筛选、分页）
 */
export async function getCrawledPrompts({
  category = 'all',
  q = '',
  status = 'all',
  author = 'all',
  page = 1,
  pageSize = 24,
} = {}) {
  try {
    const row = await getSettingByKey(PROMPTS_CACHE_KEY);
    let items = (row && Array.isArray(row.value))
      ? row.value
      : [];

    // 分类过滤
    if (category && category !== 'all') {
      items = items.filter(item => item.category === category);
    }

    // 状态过滤
    if (status && status !== 'all') {
      items = items.filter(item => item.status === status);
    }

    // 博主过滤
    if (author && author !== 'all') {
      const cleanAuthor = author.toLowerCase().replace(/^@/, '');
      items = items.filter(item => item.author?.toLowerCase() === cleanAuthor);
    }

    // 关键字搜索
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

    // 统计各分类数量与独立作者列表
    const allItemsRow = await getSettingByKey(PROMPTS_CACHE_KEY);
    const allList = (allItemsRow && Array.isArray(allItemsRow.value)) ? allItemsRow.value : [];
    const counts = {
      all: allList.length,
      image: allList.filter(i => i.category === 'image').length,
      video: allList.filter(i => i.category === 'video').length,
      music: allList.filter(i => i.category === 'music').length,
      adopted: allList.filter(i => i.status === 'adopted').length,
    };

    // 提取所有不同的博主供前端快速筛选
    const authorMap = new Map();
    for (const item of allList) {
      if (!item.author) continue;
      const key = item.author.toLowerCase();
      if (!authorMap.has(key)) {
        authorMap.set(key, {
          author: item.author,
          username: item.author,
          name: item.authorName || item.author,
          count: 1,
        });
      } else {
        authorMap.get(key).count += 1;
      }
    }
    const authors = Array.from(authorMap.values()).sort((a, b) => b.count - a.count);

    return {
      items: paginated,
      total,
      page,
      pageSize,
      counts,
      authors,
    };
  } catch (err) {
    console.error('getCrawledPrompts error:', err);
    return {
      items: [],
      total: 0,
      page: 1,
      pageSize,
      counts: { all: 0, image: 0, video: 0, music: 0, adopted: 0 },
      authors: [],
    };
  }
}

/**
 * 结构化解析推文中的提示词、模型、参数与生图
 */
export function extractPromptDetails(text = '', tweetPhotos = [], imgAlts = []) {
  // 1. 如果图片自带详细 ALT 描述，且 ALT 包含实质性提示词（比如含摄影、光影、画面构图或 --ar 等参数），优先作为提示词候选
  let promptCandidate = text || '';
  const validAlts = (Array.isArray(imgAlts) ? imgAlts : []).filter(a => a && a !== '图像' && a !== 'Image' && a.length > 10);
  if (validAlts.length > 0) {
    const combinedAlts = validAlts.join('\n\n');
    const lowerText = (text || '').toLowerCase();
    if (lowerText.length < 40 || lowerText.includes('alt') || combinedAlts.includes('--') || combinedAlts.length > (text || '').length) {
      promptCandidate = combinedAlts;
    }
  }

  let raw = promptCandidate;
  let category = 'image';
  let model = 'AI Model';
  let parameters = '';
  let negativePrompt = '';

  const lowerFull = (raw + ' ' + (text || '')).toLowerCase();

  // 2. 判断分类与模型
  if (lowerFull.includes('suno') || lowerFull.includes('udio') || lowerFull.includes('lyrics') || lowerFull.includes('[verse') || lowerFull.includes('[chorus') || lowerFull.includes('genre:')) {
    category = 'music';
    model = lowerFull.includes('udio') ? 'Udio' : 'Suno v3.5';
  } else if (lowerFull.includes('kling') || lowerFull.includes('runway') || lowerFull.includes('luma') || lowerFull.includes('sora') || lowerFull.includes('hailuo') || lowerFull.includes('minimax') || lowerFull.includes('pika') || lowerFull.includes('seedance')) {
    category = 'video';
    if (lowerFull.includes('kling')) model = 'Kling 1.5';
    else if (lowerFull.includes('runway')) model = 'Runway Gen-3';
    else if (lowerFull.includes('luma')) model = 'Luma Dream Machine';
    else if (lowerFull.includes('hailuo') || lowerFull.includes('minimax')) model = 'Hailuo Minimax';
    else if (lowerFull.includes('seedance')) model = 'Seedance 2.5';
    else model = 'Kling AI';
  } else {
    category = 'image';
    if (lowerFull.includes('flux')) model = 'Flux.1 Schnell';
    else if (lowerFull.includes('midjourney') || lowerFull.includes('--v ') || lowerFull.includes('/imagine') || lowerFull.includes('--ar')) model = 'Midjourney v6.1';
    else if (lowerFull.includes('sdxl') || lowerFull.includes('stable diffusion') || lowerFull.includes('sd3')) model = 'SDXL';
    else if (lowerFull.includes('ideogram')) model = 'Ideogram 2.0';
    else model = 'Midjourney v6.1';
  }

  // 3. 提取参数 (如 --ar 16:9 --v 6.1 等)
  const paramMatches = raw.match(/--[a-zA-Z0-9_-]+(\s+[a-zA-Z0-9_:./-]+)?/g);
  if (paramMatches && paramMatches.length > 0) {
    parameters = paramMatches.join(' ');
    paramMatches.forEach(p => {
      raw = raw.replace(p, '');
    });
  }

  // 4. 提取负面提示词 (如 Negative prompt: ...)
  const negMatch = raw.match(/(?:Negative\s*prompt|Negative\s*:|负面提示词|Neg\s*:)\s*[:：]?\s*([^\n\r]+)/i);
  if (negMatch) {
    negativePrompt = negMatch[1]
      .replace(/https?:\/\/t\.co\/[a-zA-Z0-9]+/g, '')
      .replace(/#\w+/g, '')
      .trim();
    raw = raw.replace(negMatch[0], '');
  }

  // 5. 清理 prompt 引导词与杂音
  let cleanPrompt = raw
    .replace(/\/imagine\s+prompt\s*:\s*/gi, '')
    .replace(/^prompt\s*[:：👇￼]*\s*/gim, '')
    .replace(/^Prompt\s*[:：👇￼]*\s*/gim, '')
    .replace(/^prompts\s*[:：👇￼]*\s*/gim, '')
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
 * 执行实时 X 抓取 (支持全局检索与指定博主定向抓取)
 */
export async function executeTwitterCrawl({ category = 'all', limit = 15, targetAuthor = '', userEmail = 'admin' } = {}) {
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
    // 注入 dummy wrtc 避免 Twitter Spaces 音频模块缺失 C++ native binary 导致抓取异常
    try {
      const { createRequire } = await import('node:module');
      const req = createRequire(import.meta.url);
      const dummyWrtc = {
        RTCPeerConnection: class RTCPeerConnection {},
        MediaStream: class MediaStream {},
        nonstandard: { RTCAudioSource: class RTCAudioSource {} },
      };
      try {
        const resolvedPath = req.resolve('@roamhq/wrtc');
        if (req.cache) {
          req.cache[resolvedPath] = {
            id: resolvedPath,
            filename: resolvedPath,
            loaded: true,
            exports: dummyWrtc,
          };
        }
      } catch {}
    } catch {}

    // 动态载入 agent-twitter-client
    const { Scraper, SearchMode } = await import('agent-twitter-client');
    const scraper = new Scraper();

    await scraper.setCookies([
      `auth_token=${authToken}; Domain=.twitter.com; Path=/; Secure;`,
      `ct0=${ct0}; Domain=.twitter.com; Path=/;`,
    ]);

    // 确定基础检索词
    let baseQuery = config.rules.imageQuery;
    if (category === 'video') baseQuery = config.rules.videoQuery;
    if (category === 'music') baseQuery = config.rules.musicQuery;
    if (category === 'all') {
      baseQuery = `(Flux OR Midjourney OR Kling OR Suno) (prompt OR "prompt:") -is:retweet min_faves:10`;
    }

    const cleanAuthor = targetAuthor ? targetAuthor.trim().replace(/^@/, '') : '';
    let query = baseQuery;

    if (cleanAuthor) {
      // 🎯 定向指定博主：抓取并识别该博主的生图作品与提示词
      if (category === 'image') {
        query = `(from:${cleanAuthor}) (prompt OR Midjourney OR Flux OR SDXL OR "prompt:" OR imagine OR photorealistic) has:images`;
      } else if (category === 'video') {
        query = `(from:${cleanAuthor}) (prompt OR Kling OR Runway OR Luma OR Sora OR video)`;
      } else if (category === 'music') {
        query = `(from:${cleanAuthor}) (prompt OR Suno OR Udio OR music OR lyrics)`;
      } else {
        query = `(from:${cleanAuthor}) (prompt OR Midjourney OR Flux OR Kling OR Suno OR "prompt:" OR imagine)`;
      }
    } else if (config.rules?.targetAuthorMode === 'specified' && Array.isArray(config.rules.targetAuthors) && config.rules.targetAuthors.length > 0) {
      // 仅限配置的重点监控博主名单
      const authorFilter = '(' + config.rules.targetAuthors.map(a => `from:${a.trim().replace(/^@/, '')}`).join(' OR ') + ')';
      query = `${authorFilter} ${baseQuery}`;
    }

    const maxResults = Math.min(limit || config.rules.limitPerRun || 15, 30);
    const tweetIterator = scraper.searchTweets(query, maxResults, SearchMode.Latest);

    const newItems = [];
    for await (const tweet of tweetIterator) {
      if (!tweet || !tweet.text) continue;

      const photos = (tweet.photos || []).map(p => p.url).filter(Boolean);
      const videos = (tweet.videos || []).map(v => v.preview || v.url).filter(Boolean);
      const mediaUrls = [...photos, ...videos];
      const imgAlts = (tweet.photos || []).map(p => p.alt).filter(Boolean);

      const parsed = extractPromptDetails(tweet.text, tweet.photos, imgAlts);
      if (!parsed.prompt || parsed.prompt.length < 10) continue;

      const authorHandle = tweet.username || cleanAuthor || 'unknown';

      const item = {
        id: `x_${tweet.id}`,
        tweetId: String(tweet.id),
        category: parsed.category,
        model: parsed.model,
        author: authorHandle,
        authorName: tweet.name || tweet.username || cleanAuthor || 'AI Creator',
        authorAvatar: tweet.avatar || 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=100&auto=format&fit=crop&q=80',
        prompt: parsed.prompt,
        negativePrompt: parsed.negativePrompt || '',
        parameters: parsed.parameters || '',
        mediaType: parsed.category === 'video' ? 'video' : parsed.category === 'music' ? 'audio' : 'image',
        mediaUrls: mediaUrls.length > 0 ? mediaUrls : ['https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=800&auto=format&fit=crop&q=80'],
        likes: tweet.likes || 0,
        retweets: tweet.retweets || 0,
        tweetUrl: `https://x.com/${authorHandle}/status/${tweet.id}`,
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
      const existing = (row && Array.isArray(row.value)) ? row.value : [];
      
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
  const { createCommunityPost } = await import('../repositories/community.js');
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
