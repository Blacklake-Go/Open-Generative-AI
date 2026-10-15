import { queryMany } from '../lib/db/index.js';

export async function analyzeModelBrands() {
  const rows = await queryMany(`
    SELECT 
      id, name, display_name, category, status,
      capabilities
    FROM ai_studio.ai_models
    ORDER BY category, id
  `);

  const brandGroups = {};

  for (const m of rows) {
    let brand = '其他/社区聚合';
    const id = m.id.toLowerCase();
    const name = (m.name || '').toLowerCase();
    const disp = (m.display_name || '').toLowerCase();

    if (id.includes('kling') || name.includes('kling') || name.includes('可灵')) {
      brand = '快手 (Kling / 可灵)';
    } else if (id.includes('flux') || name.includes('flux')) {
      brand = 'Black Forest Labs (FLUX)';
    } else if (id.includes('seedance') || id.includes('seedream') || id.includes('bytedance') || name.includes('字节') || id.includes('douyin')) {
      brand = '字节跳动 (ByteDance / 即梦 / 豆包)';
    } else if (id.includes('minimax') || id.includes('hailuo') || name.includes('海螺')) {
      brand = 'MiniMax (海螺 AI)';
    } else if (id.includes('veo') || id.includes('imagen') || id.includes('google') || id.includes('gemini')) {
      brand = 'Google (DeepMind / Veo / Imagen)';
    } else if (id.includes('runway') || id.includes('gen-3') || id.includes('gen-2')) {
      brand = 'Runway';
    } else if (id.includes('luma') || id.includes('ray')) {
      brand = 'Luma AI (Dream Machine / Ray)';
    } else if (id.includes('pika')) {
      brand = 'Pika Labs';
    } else if (id.includes('suno')) {
      brand = 'Suno (AI 音乐)';
    } else if (id.includes('udio')) {
      brand = 'Udio (AI 音乐)';
    } else if (id.includes('midjourney') || id.includes('mj')) {
      brand = 'Midjourney';
    } else if (id.includes('openai') || id.includes('gpt') || id.includes('dall-e') || id.includes('sora')) {
      brand = 'OpenAI';
    } else if (id.includes('claude') || id.includes('anthropic')) {
      brand = 'Anthropic (Claude)';
    } else if (id.includes('deepseek')) {
      brand = 'DeepSeek (深度求索)';
    } else if (id.includes('wan') || id.includes('qwen') || id.includes('alibaba') || id.includes('dashscope') || name.includes('万相') || name.includes('通义')) {
      brand = '阿里巴巴 (阿里通义 / Wan 万相)';
    } else if (id.includes('hunyuan') || id.includes('tencent') || name.includes('混元')) {
      brand = '腾讯 (Tencent / 混元)';
    } else if (id.includes('cogvideo') || id.includes('glm') || id.includes('zhipu') || name.includes('智谱')) {
      brand = '智谱 AI (Zhipu / CogVideo)';
    } else if (id.includes('stability') || id.includes('stable-diffusion') || id.includes('sd-') || id.includes('sdxl')) {
      brand = 'Stability AI (SD / SDXL / SD3.5)';
    } else if (id.includes('vidu') || name.includes('生数')) {
      brand = '生数科技 (Vidu)';
    } else if (id.includes('topaz')) {
      brand = 'Topaz (高清超分修复)';
    } else if (id.includes('heygen')) {
      brand = 'HeyGen (数字人 / 翻译)';
    } else if (id.includes('elevenlabs')) {
      brand = 'ElevenLabs (AI 语音)';
    } else if (id.includes('hidream')) {
      brand = 'HiDream (智绘显视)';
    } else if (id.includes('nano-banana')) {
      brand = 'Nano Banana 系列';
    } else if (id.includes('ltx') || id.includes('lipsync') || id.includes('sync')) {
      brand = '数字人与口型同步 (Lipsync / LatentSync 等)';
    }

    if (!brandGroups[brand]) {
      brandGroups[brand] = {
        total: 0,
        categories: { video: 0, image: 0, audio: 0, text: 0, other: 0 },
        samples: [],
      };
    }

    brandGroups[brand].total++;
    const cat = m.category || 'other';
    brandGroups[brand].categories[cat] = (brandGroups[brand].categories[cat] || 0) + 1;
    if (brandGroups[brand].samples.length < 3) {
      brandGroups[brand].samples.push(m.display_name || m.name || m.id);
    }
  }

  return brandGroups;
}
