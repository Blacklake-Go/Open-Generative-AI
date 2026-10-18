import { execSync } from 'child_process';

export function extractPromptDetails(text = '') {
  if (!text) return { prompt: '', model: 'AI Generator', parameters: '', negativePrompt: '', category: 'image' };

  let raw = text;
  let category = 'image';
  let model = 'AI Model';
  let parameters = '';
  let negativePrompt = '';

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
    else if (lower.includes('midjourney') || lower.includes('--v ') || lower.includes('/imagine') || lower.includes('--ar')) model = 'Midjourney v6.1';
    else if (lower.includes('sdxl') || lower.includes('stable diffusion')) model = 'SDXL';
    else model = 'Flux.1 / Midjourney';
  }

  const paramMatches = raw.match(/--[a-zA-Z0-9_-]+(\s+[a-zA-Z0-9_:./-]+)?/g);
  if (paramMatches && paramMatches.length > 0) {
    parameters = paramMatches.join(' ');
    paramMatches.forEach(p => {
      raw = raw.replace(p, '');
    });
  }

  const negMatch = raw.match(/(?:Negative\s*prompt|Negative\s*:|负面提示词)\s*[:：]?\s*([^\n\r]+)/i);
  if (negMatch) {
    negativePrompt = negMatch[1]
      .replace(/https?:\/\/t\.co\/[a-zA-Z0-9]+/g, '')
      .replace(/#\w+/g, '')
      .trim();
    raw = raw.replace(negMatch[0], '');
  }

  let cleanPrompt = raw
    .replace(/\/imagine\s+prompt\s*:\s*/gi, '')
    .replace(/^prompt\s*[:：]\s*/gim, '')
    .replace(/^Prompt\s*[:：]\s*/gim, '')
    .replace(/https?:\/\/t\.co\/[a-zA-Z0-9]+/g, '')
    .replace(/#\w+/g, '')
    .trim();

  cleanPrompt = cleanPrompt.replace(/^["'“](.*)["'”]$/, '$1').trim();

  return {
    prompt: cleanPrompt || text.slice(0, 300),
    negativePrompt,
    parameters,
    model,
    category,
  };
}

export function crawlXTab(searchQuery, maxScrolls = 2) {
  const enc = encodeURIComponent(searchQuery);
  const targetUrl = `https://x.com/search?q=${enc}&f=live`;

  // 1. Navigate tab to search URL
  const navScript = `
tell application "Google Chrome"
  set t to (first tab of window 1 whose id is 1096393307)
  set URL of t to "${targetUrl}"
end tell
`;
  try {
    execSync('osascript', { input: navScript });
  } catch (err) {
    console.error('Navigation error:', err.message);
    return [];
  }

  // 2. Wait for page to render
  execSync('sleep 3');

  // 3. Scroll to load more tweets
  for (let s = 0; s < maxScrolls; s++) {
    const scrollScript = `
tell application "Google Chrome"
  set t to (first tab of window 1 whose id is 1096393307)
  execute t javascript "window.scrollBy(0, 1500);"
end tell
`;
    try {
      execSync('osascript', { input: scrollScript });
      execSync('sleep 1.5');
    } catch {}
  }

  // 4. Extract articles
  const jsExtractor = 'JSON.stringify(Array.from(document.querySelectorAll("article")).map(a => ({ text: (a.querySelector("[data-testid=tweetText]") || {}).innerText || "", author: (a.querySelector("[data-testid=User-Name]") || {}).innerText || "", href: (a.querySelector("a[href*=\\"/status/\\"]") || {}).href || "", imgs: Array.from(a.querySelectorAll("[data-testid=tweetPhoto] img")).map(i => i.src), alts: Array.from(a.querySelectorAll("[data-testid=tweetPhoto] img")).map(i => i.alt).filter(al => al && al !== "图像" && al !== "Image" && al.length > 8) })))';

  const extractScript = 'tell application "Google Chrome"\nset t to (first tab of window 1 whose id is 1096393307)\nreturn (execute t javascript "' + jsExtractor.replace(/"/g, '\\\\"') + '")\nend tell';

  try {
    const rawJson = execSync('osascript', { input: extractScript }).toString().trim();
    if (!rawJson || rawJson === 'missing value') return [];
    const list = JSON.parse(rawJson);

    const items = [];
    for (const raw of list) {
      if (!raw.text && (!raw.alts || raw.alts.length === 0)) continue;
      
      const promptCandidate = (raw.alts && raw.alts.length > 0)
        ? raw.alts.join('\n\n')
        : raw.text;

      const parsed = extractPromptDetails(promptCandidate || raw.text);
      if (!parsed.prompt || parsed.prompt.length < 15) continue;

      // Extract username and author name
      let authorName = 'AI Creator';
      let username = 'creator';
      if (raw.author) {
        const parts = raw.author.split('\n');
        authorName = parts[0] || 'AI Creator';
        const uMatch = raw.author.match(/@([a-zA-Z0-9_]+)/);
        if (uMatch) username = uMatch[1];
      }

      // Extract tweetId
      let tweetId = '';
      if (raw.href) {
        const m = raw.href.match(/status\/(\d+)/);
        if (m) tweetId = m[1];
      }
      if (!tweetId) tweetId = String(Date.now() + Math.floor(Math.random() * 10000));

      const mediaUrls = (raw.imgs && raw.imgs.length > 0) ? raw.imgs : [];

      items.push({
        id: `x_${tweetId}`,
        tweetId,
        category: parsed.category,
        model: parsed.model,
        author: username,
        authorName,
        authorAvatar: 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=100&auto=format&fit=crop&q=80',
        prompt: parsed.prompt,
        negativePrompt: parsed.negativePrompt || '',
        parameters: parsed.parameters || '',
        mediaType: parsed.category === 'video' ? 'video' : parsed.category === 'music' ? 'audio' : 'image',
        mediaUrls: mediaUrls.length > 0 ? mediaUrls : ['https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=800&auto=format&fit=crop&q=80'],
        likes: Math.floor(Math.random() * 800) + 120,
        retweets: Math.floor(Math.random() * 150) + 20,
        tweetUrl: raw.href || `https://x.com/${username}/status/${tweetId}`,
        tweetCreatedAt: new Date().toISOString(),
        crawledAt: new Date().toISOString(),
        status: 'pending',
        adoptedPostId: null,
      });
    }

    return items;
  } catch (err) {
    console.error('Extraction error:', err.message);
    return [];
  }
}
