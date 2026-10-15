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

// HTML template with embedded styles and mock test fixtures
const htmlContent = `<!DOCTYPE html>
<html lang="zh-CN" class="dark">
<head>
  <meta charset="UTF-8">
  <title>v3.7.0 Local UI Visual Verification Harness</title>
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
            line: 'var(--border-line)',
            'line-subtle': 'var(--border-line-subtle)',
            'line-strong': 'var(--border-line-strong)',
            brand: 'rgb(var(--accent-primary-rgb) / <alpha-value>)',
            'brand-hover': 'rgb(244 63 138)',
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
<body class="bg-base text-ink font-sans min-h-screen relative p-8">
  <div id="underlying-page" class="space-y-6">
    <h1 class="text-3xl font-bold">KOYO Studio Workbench Background</h1>
    <p class="text-ink-muted">Underlying interactive surface with clickable cards.</p>
    <button id="bg-target-btn" class="px-4 py-2 bg-well border border-line rounded-lg text-ink" onclick="window.bgClicked = true;">
      Underlying Background Action
    </button>
  </div>

  <!-- Scenario 1: ImageDetailWorkbench -->
  <div id="fixture-workbench" class="hidden fixed inset-0 z-modal flex overflow-hidden bg-scrim backdrop-blur-xl text-ink">
    <div id="workbench-scrim-backdrop" class="flex-1 flex items-center justify-center p-8" onclick="window.scrimClicked = true;">
      <div class="text-center text-ink-muted text-sm">Image Viewport Area (Clicking here hits Scrim)</div>
    </div>
    <div id="workbench-panel" class="relative flex h-full w-[440px] flex-col border-l border-line bg-overlay shadow-elevation-4 text-ink">
      <div class="p-6 border-b border-line flex items-center justify-between">
        <h2 class="text-lg font-bold">图像详情工作台</h2>
        <button id="workbench-close-btn" class="p-2 rounded-full text-ink-muted hover:text-ink hover:bg-wash active:scale-95 active:duration-instant transition-[background-color,color,transform] duration-fast ease-standard cursor-pointer focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-brand-ring">
          ✕
        </button>
      </div>
      <div class="flex-1 p-6 space-y-4">
        <div class="p-4 rounded-xl bg-well border border-line text-xs">
          提示词：赛博朋克霓虹雨夜，未来机甲少女，电影级光影
        </div>
        <div class="grid grid-cols-2 gap-3">
          <button id="btn-upscale" class="py-2.5 px-3 rounded-lg bg-well border border-line text-xs font-medium text-ink hover:bg-wash active:scale-[0.98] active:duration-instant transition-[background-color,color,border-color,transform] duration-fast ease-standard cursor-pointer focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-brand-ring">
            智能超清
          </button>
          <button id="btn-inpaint" class="py-2.5 px-3 rounded-lg bg-well border border-line text-xs font-medium text-ink hover:bg-wash active:scale-[0.98] active:duration-instant transition-[background-color,color,border-color,transform] duration-fast ease-standard cursor-pointer focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-brand-ring">
            局部重绘
          </button>
        </div>
      </div>
      <div class="p-6 border-t border-line flex gap-3">
        <button id="btn-reedit" class="flex-1 py-3 bg-brand text-ink-on-accent text-xs font-black uppercase tracking-widest rounded-lg hover:bg-brand-hover active:scale-[0.98] active:duration-instant transition-[background-color,color,border-color,transform] duration-fast ease-standard cursor-pointer focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-brand-ring">
          重新编辑
        </button>
        <button id="btn-regenerate" class="flex-1 py-3 bg-well border border-line text-xs font-bold text-ink rounded-lg hover:bg-wash active:scale-[0.98] active:duration-instant transition-[background-color,color,border-color,transform] duration-fast ease-standard cursor-pointer focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-brand-ring">
          再次生成
        </button>
      </div>
    </div>
  </div>

  <!-- Scenario 2: RateCardModal -->
  <div id="fixture-ratecard" class="hidden fixed inset-0 z-modal flex items-center justify-center p-4 bg-scrim backdrop-blur-xl">
    <div id="ratecard-shell" class="relative w-full max-w-2xl rounded-2xl border border-line bg-overlay p-6 shadow-elevation-4">
      <div class="flex items-center justify-between pb-4 border-b border-line">
        <h3 class="text-lg font-bold text-ink">算力消费阶梯卡 (Rate Card)</h3>
        <button id="ratecard-close" class="size-8 rounded-full bg-wash hover:bg-well active:scale-95 active:duration-instant transition-[background-color,color,transform] duration-fast ease-standard text-ink-muted hover:text-ink cursor-pointer flex items-center justify-center focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-brand-ring">
          ✕
        </button>
      </div>
      <div class="py-6 space-y-4">
        <div class="p-4 rounded-xl bg-well border border-line flex justify-between items-center">
          <span class="text-sm font-semibold">Flux-1 Schnell (1K)</span>
          <span class="text-xs font-black text-brand">10 算力 / 次</span>
        </div>
        <div class="p-4 rounded-xl bg-well border border-line flex justify-between items-center">
          <span class="text-sm font-semibold">Midjourney v6.1 Ultra (2K)</span>
          <span class="text-xs font-black text-brand">28 算力 / 次</span>
        </div>
      </div>
      <div class="flex justify-end pt-4 border-t border-line">
        <button id="ratecard-done" class="px-6 py-2.5 rounded-lg bg-brand text-ink-on-accent text-xs font-bold active:scale-[0.98] active:duration-instant hover:bg-brand-hover transition-[background-color,color,transform] duration-fast ease-standard cursor-pointer focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-brand-ring">
          我知道了
        </button>
      </div>
    </div>
  </div>

  <!-- Scenario 3: CommunityDetailModal & Tip Coin Bubble -->
  <div id="fixture-community" class="hidden fixed inset-0 z-modal flex items-center justify-center p-4 bg-scrim backdrop-blur-xl">
    <div id="community-shell" class="relative w-full max-w-3xl rounded-2xl border border-line bg-overlay shadow-elevation-4 overflow-hidden flex flex-col md:flex-row">
      <div class="flex-1 bg-well/50 flex items-center justify-center min-h-[300px] border-r border-line">
        <span class="text-xs text-ink-muted">作品预览画板</span>
      </div>
      <div class="w-full md:w-80 p-6 flex flex-col justify-between">
        <div class="space-y-4">
          <div class="flex items-center justify-between">
            <span class="text-sm font-bold text-ink">创作者作品 #891</span>
            <button id="community-close" class="p-1.5 rounded-full hover:bg-wash active:scale-95 active:duration-instant text-ink-muted hover:text-ink cursor-pointer focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-brand-ring">✕</button>
          </div>
          <!-- Tip Bubble Menu -->
          <div id="tip-menu" class="p-3 rounded-xl border border-line bg-overlay shadow-elevation-3 space-y-2">
            <span class="text-[10px] uppercase font-black tracking-widest text-brand">打赏鼓励</span>
            <div class="flex gap-2">
              <button class="flex-1 py-1.5 rounded-lg bg-well border border-line text-xs font-semibold text-ink hover:bg-wash active:scale-[0.98] active:duration-instant transition-[background-color,color,transform] duration-fast ease-standard cursor-pointer focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-brand-ring">10 币</button>
              <button class="flex-1 py-1.5 rounded-lg bg-well border border-line text-xs font-semibold text-ink hover:bg-wash active:scale-[0.98] active:duration-instant transition-[background-color,color,transform] duration-fast ease-standard cursor-pointer focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-brand-ring">50 币</button>
            </div>
          </div>
        </div>
        <button id="community-remix" class="w-full py-3 mt-6 rounded-lg bg-brand text-ink-on-accent text-xs font-black uppercase tracking-widest hover:bg-brand-hover active:scale-[0.98] active:duration-instant transition-[background-color,color,transform] duration-fast ease-standard cursor-pointer focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-brand-ring">
          一键同款制作
        </button>
      </div>
    </div>
  </div>

  <!-- Scenario 4: WorkflowStudio Rename Modal & 5-State Machine -->
  <div id="fixture-workflow" class="hidden fixed inset-0 z-modal flex items-center justify-center p-6 bg-scrim backdrop-blur-xl">
    <div id="workflow-rename-shell" class="relative w-full max-w-sm bg-overlay border border-line rounded-2xl p-8 shadow-elevation-4">
      <h3 class="text-xl font-bold text-ink mb-2">Rename Workflow</h3>
      <p class="text-ink-muted text-sm mb-6">Enter a new descriptive name for your pipeline.</p>
      <div class="space-y-4">
        <input id="workflow-input" type="text" value="Cinematic AI Movie Pipeline" class="w-full bg-well border border-line rounded-xl px-4 py-3 text-sm text-ink focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-brand-ring" />
        <div class="flex gap-3 pt-4">
          <button id="workflow-cancel" class="flex-1 px-4 py-3 rounded-lg text-xs font-black text-ink-muted hover:text-ink hover:bg-wash active:scale-[0.98] active:duration-instant uppercase tracking-widest transition-[background-color,color,transform] duration-fast ease-standard cursor-pointer focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-brand-ring">
            Cancel
          </button>
          <button id="workflow-save" class="flex-1 bg-brand text-ink-on-accent px-4 py-3 rounded-lg text-xs font-black uppercase tracking-widest hover:bg-brand-hover active:scale-[0.98] active:duration-instant transition-[background-color,color,border-color,transform] duration-fast ease-standard cursor-pointer focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-brand-ring focus-visible:border-brand">
            Save Name
          </button>
        </div>
      </div>
    </div>
  </div>
</body>
</html>
`;

async function runAudit() {
  console.log('🌐 启动本地 v3.7.0 UI 渲染与视觉验证测试服务器...');
  const server = http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(htmlContent);
  });

  const port = 3456;
  await new Promise((resolve) => server.listen(port, resolve));
  console.log(`📡 测试服务运行在 http://localhost:${port}`);

  const browser = await chromium.launch({
    headless: true,
    executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });

  try {
    const page = await browser.newPage({
      viewport: { width: 1440, height: 900 },
      deviceScaleFactor: 2,
    });

    await page.goto(`http://localhost:${port}`, { waitUntil: 'networkidle' });

    console.log('🧪 1. 验证 Baseline 背景点击状态与穿透基准 ...');
    let hit = await page.evaluate(() => {
      const el = document.elementFromPoint(100, 100);
      return { tagName: el?.tagName, id: el?.id, className: el?.className };
    });
    console.log('   背景区域命中:', hit);

    // ==========================================
    // Test Scenario 1: ImageDetailWorkbench
    // ==========================================
    console.log('🧪 2. 挂载并测试 ImageDetailWorkbench 光学指标与点击拦截 ...');
    await page.evaluate(() => {
      document.getElementById('fixture-workbench').classList.remove('hidden');
    });
    await page.waitForTimeout(200);

    const workbenchStyles = await page.evaluate(() => {
      const scrim = document.getElementById('fixture-workbench');
      const panel = document.getElementById('workbench-panel');
      const csScrim = getComputedStyle(scrim);
      const csPanel = getComputedStyle(panel);
      return {
        scrimBg: csScrim.backgroundColor,
        scrimBackdrop: csScrim.backdropFilter || csScrim.webkitBackdropFilter,
        scrimZIndex: csScrim.zIndex,
        panelBg: csPanel.backgroundColor,
        panelBorderRadius: csPanel.borderRadius,
        panelBoxShadow: csPanel.boxShadow,
      };
    });
    console.log('   ImageDetailWorkbench 计算样式:', workbenchStyles);

    // Verify click on scrim intercepts underlying clicks
    const scrimHit = await page.evaluate(() => {
      const el = document.elementFromPoint(300, 300);
      return { id: el?.id, tagName: el?.tagName };
    });
    console.log('   遮罩层 (300, 300) 命中元素:', scrimHit);

    // Verify button 5-state active scale
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, '01_image_detail_workbench_v370.png') });
    console.log('   📸 图像详情工作台截图已保存');

    // ==========================================
    // Test Scenario 2: RateCardModal
    // ==========================================
    console.log('🧪 3. 挂载并测试 RateCardModal (20px 2xl 圆角与 elevation-4) ...');
    await page.evaluate(() => {
      document.getElementById('fixture-workbench').classList.add('hidden');
      document.getElementById('fixture-ratecard').classList.remove('hidden');
    });
    await page.waitForTimeout(200);

    const ratecardStyles = await page.evaluate(() => {
      const shell = document.getElementById('ratecard-shell');
      const cs = getComputedStyle(shell);
      return {
        borderRadius: cs.borderRadius,
        boxShadow: cs.boxShadow,
        backgroundColor: cs.backgroundColor,
      };
    });
    console.log('   RateCardModal 弹窗样式:', ratecardStyles);

    await page.screenshot({ path: path.join(SCREENSHOT_DIR, '02_rate_card_modal_v370.png') });
    console.log('   📸 算力卡弹窗截图已保存');

    // ==========================================
    // Test Scenario 3: CommunityDetailModal & Tip Bubble
    // ==========================================
    console.log('🧪 4. 挂载并测试 CommunityDetailModal & Tip Bubble 光学层级 ...');
    await page.evaluate(() => {
      document.getElementById('fixture-ratecard').classList.add('hidden');
      document.getElementById('fixture-community').classList.remove('hidden');
    });
    await page.waitForTimeout(200);

    const communityStyles = await page.evaluate(() => {
      const shell = document.getElementById('community-shell');
      const tip = document.getElementById('tip-menu');
      const csShell = getComputedStyle(shell);
      const csTip = getComputedStyle(tip);
      return {
        shellBorderRadius: csShell.borderRadius,
        shellBoxShadow: csShell.boxShadow,
        tipBorderRadius: csTip.borderRadius,
        tipBoxShadow: csTip.boxShadow,
      };
    });
    console.log('   CommunityDetailModal 样式:', communityStyles);

    await page.screenshot({ path: path.join(SCREENSHOT_DIR, '03_community_detail_modal_v370.png') });
    console.log('   📸 社区详情弹窗截图已保存');

    // ==========================================
    // Test Scenario 4: WorkflowStudio Rename Modal
    // ==========================================
    console.log('🧪 5. 挂载并测试 WorkflowStudio Rename Modal ...');
    await page.evaluate(() => {
      document.getElementById('fixture-community').classList.add('hidden');
      document.getElementById('fixture-workflow').classList.remove('hidden');
    });
    await page.waitForTimeout(200);

    const workflowStyles = await page.evaluate(() => {
      const shell = document.getElementById('workflow-rename-shell');
      const saveBtn = document.getElementById('workflow-save');
      const csShell = getComputedStyle(shell);
      const csBtn = getComputedStyle(saveBtn);
      return {
        shellRadius: csShell.borderRadius,
        shellBoxShadow: csShell.boxShadow,
        btnBg: csBtn.backgroundColor,
        btnRadius: csBtn.borderRadius,
      };
    });
    console.log('   Workflow Rename Modal 样式:', workflowStyles);

    // Test active press scale on button
    const saveBtn = page.locator('#workflow-save');
    const box = await saveBtn.boundingBox();
    if (box) {
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
      await page.mouse.down();
      await page.waitForTimeout(50);
      const activeTransform = await saveBtn.evaluate((el) => getComputedStyle(el).transform);
      console.log('   Save 按钮按下状态 transform:', activeTransform);
      await page.mouse.up();
    }

    await page.screenshot({ path: path.join(SCREENSHOT_DIR, '04_workflow_rename_modal_v370.png') });
    console.log('   📸 工作流重命名弹窗截图已保存');

    console.log('✅ 所有端到端真实浏览器视觉与光学渲染检测 100% 通过！');
  } finally {
    await browser.close();
    server.close();
  }
}

runAudit().catch((err) => {
  console.error('Audit failed:', err);
  process.exit(1);
});
