import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';

const BASE_URL = process.env.BASE_URL || 'https://www.Supdance.com';
const OUTPUT_DIR = process.env.AUDIT_OUTPUT_DIR || '/Users/seelucency/.gemini/antigravity/brain/659f56a3-3a13-4f83-adae-205a3c19e988/ui_audit';
if (!fs.existsSync(OUTPUT_DIR)) {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
}

const ROUTES_TO_AUDIT = [
  { id: 'home', name: '平台首页', path: '/' },
  { id: 'zh_home', name: '中文首页', path: '/zh' },
  { id: 'studio_image', name: '工作台 (图像)', path: '/zh/studio' },
  { id: 'studio_video', name: '工作台 (视频)', path: '/zh/studio/video' },
  { id: 'studio_audio', name: '工作台 (音频)', path: '/zh/studio/audio' },
  { id: 'login', name: '独立登录页', path: '/zh/login' },
  { id: 'register', name: '独立注册页', path: '/zh/register' },
  { id: 'forgot_password', name: '独立找回密码页', path: '/zh/forgot-password' },
  { id: 'change_password', name: '独立修改密码页', path: '/zh/change-password' },
  { id: 'pricing', name: '会员定价方案', path: '/zh/pricing' },
  { id: 'benefits', name: '会员专属权益', path: '/zh/benefits' },
  { id: 'community', name: '社区创意画廊', path: '/zh/community' },
  { id: 'account', name: '创作者个人中心', path: '/zh/account' },
  { id: 'assets', name: '资产管理中心', path: '/zh/assets' },
  { id: 'assistant', name: 'AI 创意助手', path: '/zh/assistant' },
  { id: 'coins', name: '代币金币中心', path: '/zh/coins' },
  { id: 'credits', name: '算力积分明细', path: '/zh/credits' },
  { id: 'terms', name: '服务协议条款', path: '/terms' },
  { id: 'privacy', name: '隐私保护政策', path: '/privacy' },
  { id: 'design_system', name: '设计系统规范走廊', path: '/design-system' },
];

const VIEWPORTS = [
  { name: 'desktop', width: 1440, height: 900, isMobile: false },
  { name: 'mobile', width: 390, height: 844, isMobile: true },
];

async function runComprehensiveAudit() {
  console.log('=== SupDance 全站 UI 设计规范自动化审计 ===');
  console.log(`目标基地址: ${BASE_URL}`);
  console.log(`截图输出目录: ${OUTPUT_DIR}`);

  const browser = await chromium.launch({
    headless: true,
    executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  });

  const auditReport = {
    startedAt: new Date().toISOString(),
    baseUrl: BASE_URL,
    totalRoutesTested: ROUTES_TO_AUDIT.length,
    findings: [],
    pageStatuses: {},
  };

  for (const vp of VIEWPORTS) {
    console.log(`\n--- 开始视口测试: ${vp.name} (${vp.width}x${vp.height}) ---`);
    const context = await browser.newContext({
      viewport: { width: vp.width, height: vp.height },
      locale: 'zh-CN',
      isMobile: vp.isMobile,
      userAgent: vp.isMobile
        ? 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1'
        : 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
    });

    const page = await context.newPage();

    // 捕获页面运行时错误
    const pageErrors = [];
    page.on('pageerror', (err) => {
      pageErrors.push(err.message);
    });

    for (const route of ROUTES_TO_AUDIT) {
      const url = `${BASE_URL}${route.path}`;
      const pageKey = `${route.id}_${vp.name}`;
      console.log(`[${vp.name}] 正在巡检: ${route.name} (${url})...`);

      let httpStatus = null;
      try {
        const resp = await page.goto(url, { waitUntil: 'networkidle', timeout: 35000 });
        httpStatus = resp ? resp.status() : 200;
      } catch (e) {
        console.warn(`  导航超时或轻微阻塞 (${e.message})，继续执行评估...`);
      }

      await page.waitForTimeout(1000);

      // 截取高清屏幕截图
      const screenshotFilename = `${pageKey}.png`;
      const screenshotPath = path.join(OUTPUT_DIR, screenshotFilename);
      await page.screenshot({ path: screenshotPath, fullPage: false });

      // 在当前页面执行 UI 规范深度探针
      const pageEvaluation = await page.evaluate(() => {
        const issues = [];

        // 1. 检查是否存在阻挡点击的透明固定遮罩 (Invisible Overlay Trap)
        const centerEl = document.elementFromPoint(window.innerWidth / 2, window.innerHeight / 2);
        if (centerEl) {
          const centerStyle = window.getComputedStyle(centerEl);
          const isFixedFullscreen =
            (centerStyle.position === 'fixed' || centerStyle.position === 'absolute') &&
            centerEl.offsetWidth >= window.innerWidth * 0.95 &&
            centerEl.offsetHeight >= window.innerHeight * 0.95;
          const isTransparent =
            centerStyle.backgroundColor === 'rgba(0, 0, 0, 0)' ||
            centerStyle.opacity === '0';
          if (isFixedFullscreen && isTransparent && centerStyle.pointerEvents !== 'none') {
            issues.push({
              type: 'POINTER_BLOCK',
              severity: 'P0',
              selector: centerEl.tagName.toLowerCase() + (centerEl.className ? '.' + centerEl.className.split(' ').join('.') : ''),
              message: '检测到全屏透明覆盖层未设置 pointer-events: none，可能拦截页面中心区域点击',
            });
          }
        }

        // 2. 检查圆角冲突与非规范圆角 (Radius Token & Class Clash Audit)
        const allElements = document.querySelectorAll('*');
        let inspectedCount = 0;
        allElements.forEach((el) => {
          if (inspectedCount > 1500) return;
          inspectedCount++;

          const className = el.className;
          if (typeof className === 'string') {
            // 检查冲突圆角类名 (e.g. rounded-md 和 rounded-full 同时出现)
            const hasPill = className.includes('rounded-full');
            const hasLegacyRadius =
              className.includes('rounded-md') ||
              className.includes('rounded-lg') ||
              className.includes('rounded-sm') ||
              className.includes('rounded-none');

            if (hasPill && hasLegacyRadius) {
              issues.push({
                type: 'RADIUS_CONFLICT',
                severity: 'P1',
                selector: el.tagName.toLowerCase() + (el.id ? '#' + el.id : '') + '.' + el.className.split(' ').slice(0, 3).join('.'),
                message: `元素同时存在 rounded-full 与非 full 圆角类名: "${className.split(' ').filter(c => c.startsWith('rounded-')).join(' ')}"`,
              });
            }

            // 检查 Tab / 胶囊导航是否正确为 rounded-full
            const role = el.getAttribute('role');
            if (role === 'tab' && !hasPill) {
              const cs = window.getComputedStyle(el);
              const h = parseFloat(cs.height) || 0;
              const r = parseFloat(cs.borderRadius) || 0;
              if (h > 0 && r < (h / 2 - 2)) {
                issues.push({
                  type: 'PILL_NOT_ROUNDED_FULL',
                  severity: 'P1',
                  selector: el.tagName.toLowerCase() + (el.id ? '#' + el.id : '') + '.' + el.className.split(' ').slice(0, 3).join('.'),
                  message: `Role=tab 的药丸胶囊高度为 ${h}px，但 borderRadius 仅为 ${r}px (未达 rounded-full)`,
                });
              }
            }
          }
        });

        // 3. 检查模态卡片与大卡片外壳是否遵循 rounded-2xl (约 16-24px)
        const dialogEls = Array.from(document.querySelectorAll('[role="dialog"], .z-modal, .z-overlay'));
        const modalCards = [];
        dialogEls.forEach((dlg) => {
          // 若自身就是卡片（非全屏遮罩）
          if (dlg.getAttribute('role') === 'dialog' && !dlg.className.includes('fixed inset-0')) {
            modalCards.push(dlg);
          } else {
            // 从遮罩层内部寻找真实的浮窗主体卡片
            const innerCard = dlg.querySelector('div[class*="rounded-2xl"], div[class*="rounded-3xl"], div[class*="rounded-xl"], div[class*="shadow-"]');
            if (innerCard) {
              modalCards.push(innerCard);
            }
          }
        });

        modalCards.forEach((card) => {
          const cs = window.getComputedStyle(card);
          const r = parseFloat(cs.borderRadius) || 0;
          if (r < 12 && cs.display !== 'none' && card.offsetWidth > 200) {
            issues.push({
              type: 'MODAL_RADIUS_TOO_SHARP',
              severity: 'P1',
              selector: card.tagName.toLowerCase() + '.' + card.className.split(' ').slice(0, 3).join('.'),
              message: `浮窗/模态卡片圆角仅为 ${r}px，不符合 rounded-2xl (20px) 规范`,
            });
          }
        });

        // 4. 检查浮层中性阴影 (Elevation Shadow Audit)
        modalCards.forEach((card) => {
          const cs = window.getComputedStyle(card);
          if (cs.boxShadow === 'none' && cs.display !== 'none' && card.offsetWidth > 200) {
            issues.push({
              type: 'MISSING_ELEVATION_SHADOW',
              severity: 'P1',
              selector: card.tagName.toLowerCase() + '.' + card.className.split(' ').slice(0, 3).join('.'),
              message: '浮窗或模态框缺失多层中性阴影 (boxShadow: none)',
            });
          }
        });

        // 5. 检查输入框圆角 (Input Radius Audit)
        const inputs = document.querySelectorAll('input:not([type="checkbox"]):not([type="radio"]):not([type="range"]):not([type="hidden"]):not([type="file"]), textarea');
        inputs.forEach((inp) => {
          const cs = window.getComputedStyle(inp);
          let r = parseFloat(cs.borderRadius) || 0;
          // 若输入框为透明内联元素，检查其父级包裹层圆角
          if (r === 0 && (cs.backgroundColor === 'rgba(0, 0, 0, 0)' || cs.borderStyle === 'none')) {
            const parent = inp.closest('form, div[class*="rounded-"]');
            if (parent) {
              const pcs = window.getComputedStyle(parent);
              r = parseFloat(pcs.borderRadius) || 0;
            }
          }
          if (inp.offsetWidth > 100 && (r < 6 || r > 30) && !inp.className.includes('rounded-full')) {
            issues.push({
              type: 'INPUT_RADIUS_DEVIATION',
              severity: 'P2',
              selector: inp.tagName.toLowerCase() + (inp.name ? `[name="${inp.name}"]` : ''),
              message: `输入控件有效圆角为 ${r}px，规范推荐为 rounded-xl (12-16px)`,
            });
          }
        });

        return {
          issues,
          title: document.title,
        };
      });

      auditReport.pageStatuses[pageKey] = {
        name: route.name,
        path: route.path,
        viewport: vp.name,
        httpStatus,
        issuesCount: pageEvaluation.issues.length,
        errorsCount: pageErrors.length,
        screenshot: screenshotFilename,
      };

      if (pageEvaluation.issues.length > 0) {
        pageEvaluation.issues.forEach((iss) => {
          auditReport.findings.push({
            route: route.name,
            path: route.path,
            viewport: vp.name,
            ...iss,
          });
        });
      }

      console.log(`  -> 状态码: ${httpStatus}, UI 待优化项: ${pageEvaluation.issues.length}`);
    }

    // 针对工作台内嵌浮窗做专门专项测试
    if (vp.name === 'desktop') {
      console.log('\n[专项测试] 工作台内嵌 AuthModal 浮窗交互与规范审计...');
      try {
        await page.goto(`${BASE_URL}/zh/studio?auth=login`, { waitUntil: 'networkidle', timeout: 30000 });
        await page.evaluate(() => {
          window.dispatchEvent(new CustomEvent('open-auth-modal', { detail: { mode: 'login' } }));
        });
        await page.waitForTimeout(1000);

        const modalScreenshot = path.join(OUTPUT_DIR, 'modal_auth_login.png');
        await page.screenshot({ path: modalScreenshot });
        console.log(`  已保存 AuthModal 登录态截图: modal_auth_login.png`);

        // 切换注册
        await page.click('button:has-text("注册")');
        await page.waitForTimeout(600);
        await page.screenshot({ path: path.join(OUTPUT_DIR, 'modal_auth_register.png') });
        console.log(`  已保存 AuthModal 注册态截图: modal_auth_register.png`);

        // 切换找回密码
        await page.click('button:has-text("找回密码")');
        await page.waitForTimeout(600);
        await page.screenshot({ path: path.join(OUTPUT_DIR, 'modal_auth_forgot.png') });
        console.log(`  已保存 AuthModal 找回密码态截图: modal_auth_forgot.png`);
      } catch (err) {
        console.warn('  浮窗测试提醒:', err.message);
      }
    }

    await context.close();
  }

  await browser.close();

  // 写入审计结果 JSON
  const reportJsonPath = path.join(OUTPUT_DIR, 'ui_audit_report.json');
  fs.writeFileSync(reportJsonPath, JSON.stringify(auditReport, null, 2), 'utf-8');
  console.log(`\n=== 审计完成！报告已保存至 ${reportJsonPath} ===`);
  console.log(`共审计 ${auditReport.totalRoutesTested} 个核心路由，共记录 ${auditReport.findings.length} 处规范优化点。`);
}

runComprehensiveAudit().catch((err) => {
  console.error('Audit execution error:', err);
  process.exit(1);
});
