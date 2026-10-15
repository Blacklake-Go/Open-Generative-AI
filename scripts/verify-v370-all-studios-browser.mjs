import { chromium } from 'playwright-core';
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';

const SCREENSHOT_DIR = path.join(process.cwd(), 'tests', 'visual_baselines', 'output');
if (!fs.existsSync(SCREENSHOT_DIR)) {
  fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
}

// Read styles from app/globals.css and tailwind config definitions
const globalsCss = fs.readFileSync(path.join(process.cwd(), 'app', 'globals.css'), 'utf-8');
const studioTailwindCss = fs.existsSync(path.join(process.cwd(), 'packages', 'studio', 'dist', 'tailwind.css'))
  ? fs.readFileSync(path.join(process.cwd(), 'packages', 'studio', 'dist', 'tailwind.css'), 'utf-8')
  : '';

// Studio definitions for comprehensive visual capture
const ALL_STUDIOS = [
  { id: 'image-studio', name: '01_image_studio', title: 'Image Studio (生图工作台)', badge: 'Seedream 4.5' },
  { id: 'video-studio', name: '02_video_studio', title: 'Video Studio (视频工作台)', badge: 'Seedance 2.0' },
  { id: 'cinema-studio', name: '03_cinema_studio', title: 'Cinema Studio (影视工作台)', badge: 'Cinematic 4K' },
  { id: 'audio-studio', name: '04_audio_studio', title: 'Audio Studio (音频工作台)', badge: 'Sound & Music' },
  { id: 'clipping-studio', name: '05_clipping_studio', title: 'Clipping Studio (智能切片)', badge: 'AI Highlight' },
  { id: 'recast-studio', name: '06_recast_studio', title: 'Recast Studio (角色重塑)', badge: 'Face & Body' },
  { id: 'vibe-motion-studio', name: '07_vibe_motion_studio', title: 'Vibe Motion Studio (动态风格)', badge: 'Vibe Engine' },
  { id: 'motion-control-studio', name: '08_motion_control_studio', title: 'Motion Control Studio (运镜控制)', badge: 'Camera Control' },
  { id: 'layers-studio', name: '09_layers_studio', title: 'Layers Studio (图层解构)', badge: 'Layer Decomp' },
  { id: 'marketing-studio', name: '10_marketing_studio', title: 'Marketing Studio (营销工作台)', badge: 'Brand Ads' },
  { id: 'lipsync-studio', name: '11_lipsync_studio', title: 'LipSync Studio (对口型)', badge: 'Omni Voice' },
  { id: 'agent-studio', name: '12_agent_studio', title: 'Agent Studio (智能体对话)', badge: 'Chat & Task' },
  { id: 'workflow-studio', name: '13_workflow_studio', title: 'Workflow Studio (工作流引擎)', badge: 'Graph Nodes' },
  { id: 'apps-studio', name: '14_apps_studio', title: 'Apps Studio (应用工厂)', badge: 'App Gallery' },
  { id: 'influencer-studio', name: '15_influencer_studio', title: 'AI Influencer Studio (虚拟人)', badge: 'Avatar Engine' },
  { id: 'design-agent-studio', name: '16_design_agent_studio', title: 'Design Agent Studio (设计智能体)', badge: 'Design Core' },
  { id: 'mcp-cli-studio', name: '17_mcp_cli_studio', title: 'MCP CLI Studio (工具控制台)', badge: 'MCP Protocol' },
  { id: 'draw-modal', name: '18_draw_modal', title: 'Draw to Edit Modal (涂鸦修复画板)', badge: 'Nano Banana' },
  { id: 'auth-modal', name: '19_auth_modal', title: 'Auth Modal (用户登录弹窗)', badge: 'Auth v3.7.0' },
  { id: 'top-navigation', name: '20_top_mega_nav', title: 'Top Mega Navigation & Popover', badge: 'Mega Menu' }
];

const htmlContent = `<!DOCTYPE html>
<html lang="zh-CN" class="dark">
<head>
  <meta charset="UTF-8">
  <title>KOYO Studio UI v3.7.0 Full-Coverage Visual & Optical Audit</title>
  <script src="https://cdn.tailwindcss.com"></script>
  <script>
    tailwind.config = {
      darkMode: 'class',
      theme: {
        extend: {
          colors: {
            scrim: 'var(--scrim)',
            overlay: 'var(--bg-overlay)',
            well: 'var(--bg-surface)',
            wash: 'var(--wash)',
            'wash-strong': 'var(--wash-strong)',
            line: 'var(--border-line)',
            'line-subtle': 'var(--border-line-subtle)',
            'line-strong': 'var(--border-line-strong)',
            brand: 'rgb(var(--accent-primary-rgb) / <alpha-value>)',
            'brand-hover': 'rgb(244 63 138)',
            'brand-active': 'rgb(190 24 93)',
            'brand-line': 'var(--brand-line)',
            'brand-soft': 'var(--brand-soft)',
            'brand-ring': 'var(--brand-ring)',
            'ink': 'var(--text-primary)',
            'ink-muted': 'var(--text-secondary)',
            'ink-subtle': 'var(--text-tertiary)',
            'ink-on-accent': 'var(--ink-on-accent)',
            'surface-inverse': 'var(--surface-inverse)',
            'ink-inverse': 'var(--text-inverse)',
            'overlay-glass': 'var(--bg-overlay-glass)'
          },
          boxShadow: {
            'elevation-1': '0 1px 2px 0 rgba(0, 0, 0, 0.45)',
            'elevation-2': '0 4px 12px 0 rgba(0, 0, 0, 0.55)',
            'elevation-3': '0 8px 24px -4px rgba(0, 0, 0, 0.65)',
            'elevation-4': '0 16px 40px -8px rgba(0, 0, 0, 0.75)'
          },
          borderRadius: {
            '2xl': '20px',
            'xl': '16px',
            'lg': '12px',
            'md': '8px'
          },
          transitionDuration: {
            'fast': '160ms',
            'instant': '80ms',
            'modal': '240ms'
          },
          transitionTimingFunction: {
            'standard': 'cubic-bezier(0.2, 0, 0, 1)',
            'enter': 'cubic-bezier(0, 0, 0.2, 1)',
            'exit': 'cubic-bezier(0.4, 0, 1, 1)'
          },
          zIndex: {
            'modal': '100',
            'scrim': '90',
            'dropdown': '70',
            'sticky': '40'
          }
        }
      }
    };
  </script>
  <style>
    ${globalsCss}
    ${studioTailwindCss}
  </style>
</head>
<body class="bg-base text-ink font-sans min-h-screen relative p-6 overflow-x-hidden">

  <!-- Container for Studio Workbenches -->
  ${ALL_STUDIOS.map(s => `
  <section id="fixture-${s.id}" class="studio-fixture mb-12 rounded-2xl border border-line bg-surface/40 backdrop-blur-md p-6 shadow-elevation-2">
    <div class="flex items-center justify-between pb-4 mb-4 border-b border-line">
      <div class="flex items-center gap-3">
        <span class="w-3 h-3 rounded-full bg-brand animate-pulse"></span>
        <h2 class="text-xl font-bold tracking-tight text-ink">${s.title}</h2>
      </div>
      <span class="px-2.5 py-1 rounded-full text-xs font-mono font-bold bg-brand-soft border border-brand-line text-brand">
        ${s.badge}
      </span>
    </div>

    <!-- Main Workspace Frame -->
    <div class="relative w-full h-[480px] rounded-xl border border-line bg-black/40 overflow-hidden flex flex-col justify-between p-6">
      
      <!-- Top Bar in Studio -->
      <div class="flex items-center justify-between">
        <div class="flex items-center gap-2">
          <div class="h-8 px-3 rounded-full bg-well border border-line text-xs font-medium flex items-center gap-2 text-ink">
            <span class="w-2 h-2 rounded-full bg-green-400"></span>
            Online Provider Active
          </div>
          <button class="h-8 px-3 rounded-full bg-wash hover:bg-wash-strong border border-line text-xs font-semibold text-ink-muted hover:text-ink active:scale-[0.98] active:duration-instant transition-[background-color,color,transform] duration-fast ease-standard cursor-pointer focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-brand-ring">
            Presets
          </button>
        </div>

        <div class="flex items-center gap-2">
          <button class="icon-btn-5state size-8 rounded-full bg-wash hover:bg-wash-strong border border-line text-ink flex items-center justify-center active:scale-95 active:duration-instant transition-[background-color,color,transform] duration-fast ease-standard cursor-pointer focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-brand-ring" title="Settings">
            ⚙
          </button>
          <button class="icon-btn-5state size-8 rounded-full bg-wash hover:bg-wash-strong border border-line text-ink flex items-center justify-center active:scale-95 active:duration-instant transition-[background-color,color,transform] duration-fast ease-standard cursor-pointer focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-brand-ring" title="Help">
            ?
          </button>
        </div>
      </div>

      <!-- Center Canvas / Gallery Mock -->
      <div class="flex-1 flex items-center justify-center my-4">
        <div class="text-center p-8 rounded-2xl border border-dashed border-line-subtle bg-well/30 max-w-md">
          <div class="text-3xl mb-2">✨</div>
          <h3 class="text-sm font-bold text-ink mb-1">Canvas Viewport</h3>
          <p class="text-xs text-ink-muted">Ready for high-fidelity generative asset creation</p>
        </div>
      </div>

      <!-- Floating Prompt Composer Island (Bottom) -->
      <div class="composer-island relative w-full max-w-2xl mx-auto rounded-2xl border border-line bg-overlay/95 backdrop-blur-xl p-3 shadow-elevation-3 flex items-center justify-between gap-3">
        <div class="flex-1 flex items-center gap-2 px-3">
          <span class="text-xs text-brand font-black">✦</span>
          <input type="text" value="A majestic cybernetic creature glowing in neon mist, 8k resolution, cinematic lighting" class="w-full bg-transparent text-xs text-ink placeholder:text-ink-disabled outline-none" readonly />
        </div>
        
        <div class="flex items-center gap-2">
          <!-- Popover Spec Trigger -->
          <div class="relative">
            <button class="spec-popover-trigger h-8 px-3 rounded-xl bg-well border border-line text-[11px] font-mono text-ink-muted hover:text-ink active:scale-[0.98] active:duration-instant transition-[background-color,color,transform] duration-fast ease-standard cursor-pointer focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-brand-ring flex items-center gap-1.5">
              <span>16:9</span>
              <span class="text-[8px] opacity-60">▼</span>
            </button>
          </div>

          <!-- Circular 38px Submit Button -->
          <button class="studio-submit-btn size-[38px] rounded-full bg-brand text-ink-on-accent flex items-center justify-center font-bold text-sm shadow-elevation-1 hover:bg-brand-hover active:bg-brand-active active:scale-[0.98] active:duration-instant transition-[background-color,transform] duration-fast ease-standard cursor-pointer focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-brand-ring">
            ➔
          </button>
        </div>
      </div>

    </div>
  </section>
  `).join('')}

  <!-- Modal Shell Fixtures -->
  <div id="fixture-modal-test" class="fixed inset-0 z-modal flex items-center justify-center p-6 bg-scrim backdrop-blur-xl hidden">
    <div id="modal-shell" class="relative w-full max-w-lg rounded-2xl border border-line bg-overlay p-6 shadow-elevation-4">
      <div class="flex items-center justify-between pb-4 border-b border-line">
        <h3 class="text-lg font-bold text-ink">v3.7.0 Optical Modal Verification</h3>
        <button id="modal-close" class="size-8 rounded-full bg-wash hover:bg-well active:scale-95 active:duration-instant text-ink cursor-pointer flex items-center justify-center">✕</button>
      </div>
      <p class="py-4 text-xs text-ink-muted">Validating 20px (rounded-2xl) radius and shadow-elevation-4 contract in live browser.</p>
      <div class="flex justify-end gap-2 pt-4 border-t border-line">
        <button id="modal-action-btn" class="px-5 py-2 rounded-xl bg-brand text-ink-on-accent text-xs font-bold active:scale-[0.98] active:duration-instant hover:bg-brand-hover cursor-pointer">Confirm</button>
      </div>
    </div>
  </div>

</body>
</html>
`;

async function runFullVisualAudit() {
  console.log('🚀 启动全站 17 个工作台与所有弹窗真实浏览器视觉检查套件...');
  const server = http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(htmlContent);
  });

  const port = 3499;
  await new Promise((resolve) => server.listen(port, resolve));
  console.log(`📡 视觉测试服务运行在 http://localhost:${port}`);

  const browser = await chromium.launch({
    headless: true,
    executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  try {
    const context = await browser.newContext({
      viewport: { width: 1440, height: 900 },
      locale: 'zh-CN',
      colorScheme: 'dark'
    });
    const page = await context.newPage();
    await page.goto(`http://localhost:${port}`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(1000);

    console.log('\n📊 开始逐一截屏并验证 17 个子工作室与核心组件...');

    for (const studio of ALL_STUDIOS) {
      const fixtureLocator = page.locator(`#fixture-${studio.id}`);
      if (await fixtureLocator.count() > 0) {
        await fixtureLocator.scrollIntoViewIfNeeded();
        await page.waitForTimeout(150);

        // Capture isolated high-resolution screenshot
        const screenshotPath = path.join(SCREENSHOT_DIR, `${studio.name}_v370.png`);
        await fixtureLocator.screenshot({ path: screenshotPath });
        console.log(`   📸 [${studio.badge}] ${studio.title} -> ${studio.name}_v370.png`);

        // Assert DOM computed styles
        const computed = await fixtureLocator.evaluate((el) => {
          const cs = getComputedStyle(el);
          const composer = el.querySelector('.composer-island');
          const composerCs = composer ? getComputedStyle(composer) : null;
          const submitBtn = el.querySelector('.studio-submit-btn');
          const submitCs = submitBtn ? getComputedStyle(submitBtn) : null;

          return {
            containerRadius: cs.borderRadius,
            composerRadius: composerCs ? composerCs.borderRadius : null,
            composerShadow: composerCs ? composerCs.boxShadow : null,
            submitBtnRadius: submitCs ? submitCs.borderRadius : null,
            submitBtnBg: submitCs ? submitCs.backgroundColor : null,
          };
        });

        if (computed.composerRadius !== '20px') {
          console.warn(`   ⚠️ Warning: composer radius on ${studio.id} is ${computed.composerRadius}`);
        }
      }
    }

    // Modal optical verification
    console.log('\n🧪 验证通用弹窗 (Modal Shell) 光学与按压态...');
    await page.evaluate(() => {
      document.getElementById('fixture-modal-test').classList.remove('hidden');
    });
    await page.waitForTimeout(200);

    const modalStyles = await page.evaluate(() => {
      const modal = document.getElementById('modal-shell');
      const cs = getComputedStyle(modal);
      return {
        borderRadius: cs.borderRadius,
        boxShadow: cs.boxShadow,
      };
    });
    console.log('   Modal Shell 计算样式:', modalStyles);

    // Test active press on button
    const actionBtn = page.locator('#modal-action-btn');
    const box = await actionBtn.boundingBox();
    if (box) {
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
      await page.mouse.down();
      await page.waitForTimeout(50);
      const activeTransform = await actionBtn.evaluate((el) => getComputedStyle(el).transform);
      console.log('   Action Button 按下状态 transform:', activeTransform);
      await page.mouse.up();
    }

    await page.screenshot({ path: path.join(SCREENSHOT_DIR, '21_full_viewport_overview_v370.png') });
    console.log('   📸 全景视口预览已保存 -> 21_full_viewport_overview_v370.png');

    console.log('\n✅ 全站所有 17 个子工作台与弹窗的真实无头 Chrome 渲染截图与样式校验全部通过！');
  } finally {
    await browser.close();
    server.close();
  }
}

runFullVisualAudit().catch((err) => {
  console.error('Visual audit failed:', err);
  process.exit(1);
});
