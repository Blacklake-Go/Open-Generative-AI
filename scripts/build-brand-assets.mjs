import fs from 'node:fs';
import path from 'node:path';

const targetDir = path.resolve('public/assets/brands');
fs.mkdirSync(targetDir, { recursive: true });

// 复制已有的高清透明 PNG
const existingModelsDir = path.resolve('public/assets/about/models');
const copyPairs = [
  ['kling_exact.png', 'kuaishou.png'],
  ['flux_exact.png', 'bfl.png'],
  ['openai_exact.png', 'openai.png'],
  ['hailuo_exact.png', 'minimax.png'],
  ['wan_exact.png', 'alibaba.png'],
  ['veo_exact.png', 'google.png'],
  ['suno_exact.png', 'suno.png'],
  ['hunyuan_exact.png', 'tencent.png'],
  ['vidu_exact.png', 'vidu.png'],
  ['midjourney_exact.png', 'midjourney.png'],
];

for (const [src, dest] of copyPairs) {
  const srcPath = path.join(existingModelsDir, src);
  const destPath = path.join(targetDir, dest);
  if (fs.existsSync(srcPath)) {
    fs.copyFileSync(srcPath, destPath);
    console.log(`[copy] ${src} -> ${dest}`);
  }
}

// 制作高保真矢量 SVG 库（全暗色模式高对比度、带光学微留白）
const SVG_TEMPLATES = {
  // 1. 字节跳动 (ByteDance / 即梦 / 豆包)
  bytedance: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128" fill="none">
  <defs>
    <linearGradient id="bd-g1" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#3A7BFF"/>
      <stop offset="100%" stop-color="#00D2FF"/>
    </linearGradient>
    <linearGradient id="bd-g2" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#00E5A3"/>
      <stop offset="100%" stop-color="#00B4D8"/>
    </linearGradient>
    <linearGradient id="bd-g3" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#FF385C"/>
      <stop offset="100%" stop-color="#FF6B8B"/>
    </linearGradient>
  </defs>
  <rect x="18" y="24" width="18" height="80" rx="9" fill="url(#bd-g1)" transform="rotate(-15 27 64)"/>
  <rect x="44" y="32" width="18" height="64" rx="9" fill="url(#bd-g2)" transform="rotate(-15 53 64)"/>
  <rect x="70" y="20" width="18" height="88" rx="9" fill="url(#bd-g3)" transform="rotate(-15 79 64)"/>
  <rect x="96" y="38" width="18" height="52" rx="9" fill="#FFFFFF" transform="rotate(-15 105 64)"/>
</svg>`,

  // 2. 快手可灵 (Kling AI)
  kuaishou: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128" fill="none">
  <defs>
    <linearGradient id="kl-g" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#FF2E56"/>
      <stop offset="50%" stop-color="#FF6B00"/>
      <stop offset="100%" stop-color="#FF9E00"/>
    </linearGradient>
  </defs>
  <circle cx="64" cy="64" r="48" stroke="url(#kl-g)" stroke-width="12" stroke-linecap="round" stroke-dasharray="220 80"/>
  <circle cx="64" cy="64" r="28" fill="url(#kl-g)"/>
  <polygon points="56,48 80,64 56,80" fill="#FFFFFF"/>
</svg>`,

  // 3. Black Forest Labs (FLUX 系列)
  bfl: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128" fill="none">
  <defs>
    <linearGradient id="bfl-g" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#FFFFFF"/>
      <stop offset="100%" stop-color="#94A3B8"/>
    </linearGradient>
  </defs>
  <path d="M64 16L108 41.4V92.6L64 118L20 92.6V41.4L64 16Z" stroke="url(#bfl-g)" stroke-width="8" stroke-linejoin="round"/>
  <path d="M64 16V67L108 92.6M64 67L20 92.6" stroke="url(#bfl-g)" stroke-width="7" stroke-linejoin="round"/>
  <circle cx="64" cy="67" r="8" fill="#38BDF8"/>
</svg>`,

  // 4. OpenAI
  openai: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128" fill="none">
  <g transform="translate(16, 16) scale(4)" fill="#FFFFFF">
    <path d="M22.28 9.82a5.98 5.98 0 0 0-.51-4.91 6.05 6.05 0 0 0-6.51-2.9 6.07 6.07 0 0 0-10.28 2.17 5.98 5.98 0 0 0-4 2.9 6.05 6.05 0 0 0 .74 7.1 5.98 5.98 0 0 0 .51 4.91 6.05 6.05 0 0 0 6.51 2.9A5.98 5.98 0 0 0 13.26 24a6.06 6.06 0 0 0 5.77-4.21 5.99 5.99 0 0 0 4-2.9 6.06 6.06 0 0 0-.75-7.07zm-9.02 12.61a4.48 4.48 0 0 1-2.88-1.04l.14-.08 4.78-2.76a.79.79 0 0 0 .39-.68v-6.74l2.02 1.17a.07.07 0 0 1 .04.05v5.58a4.5 4.5 0 0 1-4.49 4.5zm-9.66-4.5a4.47 4.47 0 0 1-.53-3.02l.14.09 4.78 2.76a.77.77 0 0 0 .78 0l5.85-3.37v2.33a.08.08 0 0 1-.04.06l-4.83 2.79a4.5 4.5 0 0 1-6.14-2.03l-.01-.61zm-1.13-11.24a4.47 4.47 0 0 1 2.34-1.97v5.6a.78.78 0 0 0 .39.68l5.84 3.37-2.02 1.17a.08.08 0 0 1-.07 0l-4.83-2.79a4.49 4.49 0 0 1-1.65-6.06zm16.51 3.89l-5.84-3.38 2.02-1.17a.08.08 0 0 1 .07 0l4.83 2.79a4.49 4.49 0 0 1-.68 8.1v-5.67a.79.79 0 0 0-.4-.67zm2.01-3.03l-.14-.08-4.78-2.78a.78.78 0 0 0-.78 0L9.41 8.06V5.72a.08.08 0 0 1 .03-.06l4.88-2.82a4.5 4.5 0 0 1 6.69 4.88zM8.31 12.86l-2.02-1.16a.08.08 0 0 1-.04-.06V6.07a4.5 4.5 0 0 1 7.38-3.45l-.14.08-4.79 2.76a.79.79 0 0 0-.39.68v6.72zm1.1-2.37l2.59-1.5 2.59 1.5v2.99l-2.59 1.49-2.59-1.49z"/>
  </g>
</svg>`,

  // 5. MiniMax (海螺 AI)
  minimax: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128" fill="none">
  <defs>
    <linearGradient id="mm-g" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#00D2FF"/>
      <stop offset="100%" stop-color="#3A7BFF"/>
    </linearGradient>
  </defs>
  <circle cx="64" cy="64" r="48" fill="url(#mm-g)" opacity="0.15"/>
  <path d="M40 84C40 50 64 36 84 48C94 54 94 70 82 78C72 84 56 80 54 70C52 62 60 56 68 58C72 59 74 64 71 67" stroke="url(#mm-g)" stroke-width="10" stroke-linecap="round"/>
  <circle cx="70" cy="66" r="4" fill="#00D2FF"/>
</svg>`,

  // 6. 阿里巴巴 (通义万相 / 千问)
  alibaba: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128" fill="none">
  <defs>
    <linearGradient id="ali-g" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#FF6A00"/>
      <stop offset="100%" stop-color="#EE0979"/>
    </linearGradient>
  </defs>
  <path d="M42 46C30 46 22 54 22 64C22 74 30 82 42 82C58 82 70 46 86 46C98 46 106 54 106 64C106 74 98 82 86 82C70 82 58 46 42 46Z" stroke="url(#ali-g)" stroke-width="12" stroke-linecap="round" stroke-linejoin="round"/>
  <circle cx="42" cy="64" r="6" fill="#FFFFFF"/>
  <circle cx="86" cy="64" r="6" fill="#FFFFFF"/>
</svg>`,

  // 7. Google (DeepMind / Veo / Imagen)
  google: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128" fill="none">
  <path d="M106 65.5C106 62.4 105.7 59.4 105.2 56.5H64V73.4H87.6C86.6 78.8 83.4 83.3 78.7 86.4V97.3H92.9C101.2 89.6 106 78.5 106 65.5Z" fill="#4285F4"/>
  <path d="M64 108C75.9 108 85.8 104.1 92.9 97.3L78.7 86.4C74.8 89 69.8 90.6 64 90.6C52.4 90.6 42.6 82.8 39.1 72.2H24.5V83.5C31.7 97.8 46.7 108 64 108Z" fill="#34A853"/>
  <path d="M39.1 72.2C38.2 69.5 37.7 66.8 37.7 64C37.7 61.2 38.2 58.5 39.1 55.8V44.5H24.5C21.6 50.3 20 57 20 64C20 71 21.6 77.7 24.5 83.5L39.1 72.2Z" fill="#FBBC05"/>
  <path d="M64 37.4C70.5 37.4 76.3 39.6 80.9 44L93.2 31.7C85.7 24.7 75.8 20 64 20C46.7 20 31.7 30.2 24.5 44.5L39.1 55.8C42.6 45.2 52.4 37.4 64 37.4Z" fill="#EA4335"/>
</svg>`,

  // 8. Luma AI (Dream Machine / Ray)
  luma: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128" fill="none">
  <defs>
    <linearGradient id="luma-g" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#C084FC"/>
      <stop offset="100%" stop-color="#6366F1"/>
    </linearGradient>
  </defs>
  <rect x="26" y="26" width="76" height="76" rx="20" stroke="url(#luma-g)" stroke-width="8"/>
  <path d="M46 64L64 42L82 64L64 86L46 64Z" fill="url(#luma-g)"/>
  <circle cx="64" cy="64" r="5" fill="#FFFFFF"/>
</svg>`,

  // 9. Runway (Gen-3 / Gen-2)
  runway: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128" fill="none">
  <rect x="18" y="18" width="92" height="92" rx="22" fill="#18181B" stroke="#27272A" stroke-width="3"/>
  <path d="M44 36H68C79.0457 36 88 44.9543 88 56C88 65.556 81.2828 73.5428 72.2335 75.4801L88 92H72L58 76H44V92H32V36H44ZM44 48V64H68C72.4183 64 76 60.4183 76 56C76 51.5817 72.4183 48 68 48H44Z" fill="#FFFFFF"/>
</svg>`,

  // 10. Suno (AI 音乐创作)
  suno: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128" fill="none">
  <defs>
    <linearGradient id="suno-g" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#F59E0B"/>
      <stop offset="100%" stop-color="#EF4444"/>
    </linearGradient>
  </defs>
  <circle cx="64" cy="64" r="46" stroke="url(#suno-g)" stroke-width="9"/>
  <circle cx="64" cy="64" r="30" stroke="#FFFFFF" stroke-width="4" stroke-opacity="0.3"/>
  <circle cx="64" cy="64" r="14" fill="url(#suno-g)"/>
  <circle cx="64" cy="64" r="5" fill="#FFFFFF"/>
</svg>`,

  // 11. DeepSeek (深度求索 / V3 / R1)
  deepseek: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128" fill="none">
  <defs>
    <linearGradient id="ds-g" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#0066FF"/>
      <stop offset="100%" stop-color="#00D2FF"/>
    </linearGradient>
  </defs>
  <path d="M26 72C26 48 44 32 68 32C88 32 102 44 102 60C102 78 86 86 66 86C50 86 38 82 26 72Z" fill="url(#ds-g)"/>
  <path d="M72 86L94 102C97 104 102 101 100 97L94 84" fill="url(#ds-g)"/>
  <circle cx="48" cy="52" r="5" fill="#FFFFFF"/>
</svg>`,

  // 12. 腾讯 (混元 Hunyuan)
  tencent: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128" fill="none">
  <defs>
    <linearGradient id="tx-g" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#0052D9"/>
      <stop offset="100%" stop-color="#00A870"/>
    </linearGradient>
  </defs>
  <path d="M64 20L104 60L64 100L24 60L64 20Z" stroke="url(#tx-g)" stroke-width="10" stroke-linejoin="round"/>
  <path d="M64 38L88 62L64 86L40 62L64 38Z" fill="url(#tx-g)"/>
</svg>`,

  // 13. 生数科技 (Vidu AI)
  vidu: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128" fill="none">
  <defs>
    <linearGradient id="vidu-g" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#14B8A6"/>
      <stop offset="100%" stop-color="#06B6D4"/>
    </linearGradient>
  </defs>
  <circle cx="64" cy="64" r="46" stroke="url(#vidu-g)" stroke-width="8"/>
  <path d="M64 24V104M24 64H104" stroke="url(#vidu-g)" stroke-width="6" stroke-linecap="round"/>
  <circle cx="64" cy="64" r="16" fill="#FFFFFF"/>
</svg>`,

  // 14. Topaz Labs (高清超分与修复)
  topaz: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128" fill="none">
  <defs>
    <linearGradient id="tp-g" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#10B981"/>
      <stop offset="100%" stop-color="#059669"/>
    </linearGradient>
  </defs>
  <circle cx="64" cy="64" r="44" stroke="url(#tp-g)" stroke-width="8"/>
  <polygon points="64,28 92,64 64,100 36,64" stroke="#FFFFFF" stroke-width="6" fill="url(#tp-g)" fill-opacity="0.3"/>
  <circle cx="64" cy="64" r="8" fill="#FFFFFF"/>
</svg>`,

  // 15. Anthropic (Claude 3.5 系列)
  anthropic: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128" fill="none">
  <g transform="translate(18, 18) scale(0.72)" fill="#D97706">
    <path d="M64 0L76 46L122 46L86 74L98 120L64 92L30 120L42 74L6 46L52 46L64 0Z" fill="#D97706"/>
    <circle cx="64" cy="64" r="18" fill="#FDE68A"/>
  </g>
</svg>`,

  // 16. Midjourney (MJ v6 / Niji)
  midjourney: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128" fill="none">
  <defs>
    <linearGradient id="mj-g" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#818CF8"/>
      <stop offset="100%" stop-color="#C084FC"/>
    </linearGradient>
  </defs>
  <circle cx="64" cy="64" r="46" fill="#18181B" stroke="#3F3F46" stroke-width="4"/>
  <path d="M40 76C48 84 80 84 88 76L82 66H46L40 76Z" fill="url(#mj-g)"/>
  <path d="M64 36V66M64 36L48 60H64M64 42L78 60H64" stroke="#FFFFFF" stroke-width="4" stroke-linejoin="round"/>
</svg>`,

  // 17. Udio (AI 音乐创作)
  udio: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128" fill="none">
  <defs>
    <linearGradient id="udio-g" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#EC4899"/>
      <stop offset="100%" stop-color="#8B5CF6"/>
    </linearGradient>
  </defs>
  <rect x="28" y="44" width="12" height="40" rx="6" fill="url(#udio-g)"/>
  <rect x="46" y="28" width="12" height="72" rx="6" fill="url(#udio-g)"/>
  <rect x="64" y="38" width="12" height="52" rx="6" fill="url(#udio-g)"/>
  <rect x="82" y="20" width="12" height="88" rx="6" fill="url(#udio-g)"/>
</svg>`,

  // 18. Pika Labs (Pika 2.0 / 1.0)
  pika: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128" fill="none">
  <defs>
    <linearGradient id="pika-g" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#F97316"/>
      <stop offset="100%" stop-color="#EAB308"/>
    </linearGradient>
  </defs>
  <path d="M34 86L64 26L94 86H70L64 74L58 86H34Z" fill="url(#pika-g)"/>
  <circle cx="64" cy="54" r="6" fill="#FFFFFF"/>
</svg>`,

  // 19. 智谱 AI (CogVideo / GLM)
  zhipu: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128" fill="none">
  <defs>
    <linearGradient id="zp-g" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#06B6D4"/>
      <stop offset="100%" stop-color="#3B82F6"/>
    </linearGradient>
  </defs>
  <rect x="34" y="34" width="60" height="60" rx="14" stroke="url(#zp-g)" stroke-width="8"/>
  <circle cx="48" cy="48" r="7" fill="#06B6D4"/>
  <circle cx="80" cy="48" r="7" fill="#3B82F6"/>
  <circle cx="48" cy="80" r="7" fill="#3B82F6"/>
  <circle cx="80" cy="80" r="7" fill="#06B6D4"/>
</svg>`,

  // 20. Stability AI (SD / SDXL / SD3.5)
  stability: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128" fill="none">
  <defs>
    <linearGradient id="stab-g" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#A855F7"/>
      <stop offset="100%" stop-color="#EC4899"/>
    </linearGradient>
  </defs>
  <circle cx="64" cy="64" r="14" fill="url(#stab-g)"/>
  <circle cx="64" cy="30" r="10" fill="url(#stab-g)"/>
  <circle cx="64" cy="98" r="10" fill="url(#stab-g)"/>
  <circle cx="30" cy="64" r="10" fill="url(#stab-g)"/>
  <circle cx="98" cy="64" r="10" fill="url(#stab-g)"/>
  <circle cx="40" cy="40" r="7" fill="url(#stab-g)" opacity="0.7"/>
  <circle cx="88" cy="40" r="7" fill="url(#stab-g)" opacity="0.7"/>
  <circle cx="40" cy="88" r="7" fill="url(#stab-g)" opacity="0.7"/>
  <circle cx="88" cy="88" r="7" fill="url(#stab-g)" opacity="0.7"/>
</svg>`,

  // 21. ElevenLabs (高拟真 AI 语音)
  elevenlabs: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128" fill="none">
  <rect x="42" y="28" width="16" height="72" rx="8" fill="#FFFFFF"/>
  <rect x="70" y="28" width="16" height="72" rx="8" fill="#FFFFFF"/>
</svg>`,

  // 22. HiDream (智绘显视)
  hidream: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128" fill="none">
  <defs>
    <linearGradient id="hd-g" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#8B5CF6"/>
      <stop offset="100%" stop-color="#EC4899"/>
    </linearGradient>
  </defs>
  <path d="M24 64C24 64 42 34 64 34C86 34 104 64 104 64C104 64 86 94 64 94C42 94 24 64 24 64Z" stroke="url(#hd-g)" stroke-width="8" stroke-linejoin="round"/>
  <circle cx="64" cy="64" r="16" fill="url(#hd-g)"/>
  <circle cx="64" cy="64" r="6" fill="#FFFFFF"/>
</svg>`,

  // 23. 其他 / 社区独立模型
  other: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128" fill="none">
  <rect x="28" y="28" width="72" height="72" rx="18" stroke="#71717A" stroke-width="6"/>
  <circle cx="64" cy="64" r="14" fill="#A1A1AA"/>
  <path d="M64 16V28M64 100V112M16 64H28M100 64H112" stroke="#71717A" stroke-width="6" stroke-linecap="round"/>
</svg>`,
};

for (const [id, svg] of Object.entries(SVG_TEMPLATES)) {
  const filePath = path.join(targetDir, `${id}.svg`);
  fs.writeFileSync(filePath, svg.trim());
  console.log(`[svg] generated ${id}.svg`);
}

console.log('Brand logo assets generated successfully in public/assets/brands/');
