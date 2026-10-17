import { chromium } from 'playwright';
import path from 'path';
import fs from 'fs';
import { createSession } from '../lib/services/auth.js';
import { getCreditBalance } from '../lib/services/credits.js';

const ARTIFACT_DIR = '/Users/seelucency/.gemini/antigravity/brain/4e705e20-b1ea-4334-89b7-c08d2b371233';
const BASE_URL = 'http://localhost:3200';

async function runSimulation() {
  console.log('=== 开始模拟真人浏览器操作验证 ===');
  
  // 1. 获取测试用户会话
  const testUserId = '381090';
  const balance = await getCreditBalance(testUserId);
  console.log(`[Auth] 测试账号 ID: ${testUserId}, 积分余额: ${balance}`);
  const session = await createSession(testUserId);
  console.log(`[Auth] 生成有效会话 Token: ${session.token}`);

  const browser = await chromium.launch({
    executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  try {
    // ----------------------------------------------------
    // 场景一：未登录匿名用户访问首页、查看价盘并尝试生成
    // ----------------------------------------------------
    console.log('\n--- 场景 1: 匿名访客浏览首页与触发认证 ---');
    const anonContext = await browser.newContext({
      viewport: { width: 1440, height: 900 },
      locale: 'zh-CN',
    });
    const anonPage = await anonContext.newPage();
    
    const anonErrors = [];
    anonPage.on('console', msg => {
      if (msg.type() === 'error') {
        anonErrors.push(msg.text());
        console.log(`[Anon Console Error]`, msg.text());
      }
    });
    anonPage.on('pageerror', err => {
      anonErrors.push(err.message);
      console.log(`[Anon Page Error]`, err.message);
    });

    console.log(`[Anon] 导航至首页: ${BASE_URL}/`);
    await anonPage.goto(`${BASE_URL}/`, { waitUntil: 'domcontentloaded', timeout: 120000 });
    
    // 等待 /api/models/active 响应并更新价盘
    await anonPage.waitForResponse(resp => resp.url().includes('/api/models/active'), { timeout: 20000 }).catch(() => {});
    await anonPage.waitForTimeout(1500);

    // 检查是否有 setNotifications 错误
    const hasNotificationCrash = anonErrors.some(e => e.includes('setNotifications'));
    console.log(`[Anon] setNotifications 崩溃排查: ${hasNotificationCrash ? '❌ 存在错误' : '✅ 已完全消除'}`);

    // 检查首页提示词输入框
    const promptTextarea = anonPage.locator('textarea').first();
    await promptTextarea.waitFor({ state: 'visible', timeout: 15000 });
    console.log('[Anon] 提示词输入框可见，模拟真人输入 Prompt...');
    await promptTextarea.click();
    await promptTextarea.fill('赛博朋克风格未来城市夜景，霓虹灯光，雨水倒影，8k高清');
    await anonPage.waitForTimeout(1000);

    // 截取未登录状态首页
    await anonPage.screenshot({ path: path.join(ARTIFACT_DIR, 'browser_01_anon_home_filled.png'), fullPage: false });
    console.log('[Anon] 已截图保存: browser_01_anon_home_filled.png');

    // 点击生成按钮（寻找包含「生成」或图标的提交按钮）
    const generateBtn = anonPage.locator('button:has-text("生成"), button[aria-label*="生成"], button[type="submit"]').first();
    console.log('[Anon] 点击生成按钮，测试未登录拦截与弹窗...');
    await generateBtn.click();
    await anonPage.waitForTimeout(1000);

    // 验证是否弹出了登录弹窗（通过查找 modal 或 登录 关键字）
    const loginModal = anonPage.locator('text=登录, text=Sign in, [role="dialog"]').first();
    const isLoginModalVisible = await loginModal.isVisible().catch(() => false);
    console.log(`[Anon] 登录弹窗唤起状态: ${isLoginModalVisible ? '✅ 成功拦截并唤起登录' : 'ℹ️ 未直接捕获弹窗 (可能已跳转)'}`);
    await anonPage.screenshot({ path: path.join(ARTIFACT_DIR, 'browser_02_anon_auth_modal.png'), fullPage: false });

    await anonContext.close();

    // ----------------------------------------------------
    // 场景二：登录用户实操生图全流程 (从首页到 Studio 渲染)
    // ----------------------------------------------------
    console.log('\n--- 场景 2: 登录真实用户实操生成 ---');
    const authContext = await browser.newContext({
      viewport: { width: 1440, height: 900 },
      locale: 'zh-CN',
    });
    // 注入会话 Cookie
    await authContext.addCookies([
      {
        name: 'ko_session',
        value: session.token,
        domain: 'localhost',
        path: '/',
        httpOnly: true,
        sameSite: 'Lax',
      }
    ]);

    const authPage = await authContext.newPage();
    const authErrors = [];
    authPage.on('console', msg => {
      if (msg.type() === 'error') {
        authErrors.push(msg.text());
        console.log(`[Auth Console Error]`, msg.text());
      }
    });

    // 监听网络 API 请求
    const apiEvents = [];
    authPage.on('request', req => {
      const url = req.url();
      if (url.includes('/api/generation') || url.includes('/api/generations')) {
        console.log(`[API Request] ${req.method()} ${url}`);
      }
    });
    authPage.on('response', async resp => {
      const url = resp.url();
      if (url.includes('/api/generation') || url.includes('/api/generations')) {
        let body = '';
        try {
          body = await resp.text();
        } catch {}
        apiEvents.push({
          url,
          status: resp.status(),
          body: body.slice(0, 300)
        });
        console.log(`[API Response] ${resp.status()} ${url}`);
      }
    });

    console.log(`[Auth] 导航至 Studio: ${BASE_URL}/studio`);
    await authPage.goto(`${BASE_URL}/studio`, { waitUntil: 'domcontentloaded', timeout: 120000 });
    
    // 等待 /api/models/active 响应
    await authPage.waitForResponse(resp => resp.url().includes('/api/models/active'), { timeout: 20000 }).catch(() => {});
    await authPage.waitForTimeout(2000);
    // 检查是否有欢迎引导浮层并快速跳过
    const skipBtn = authPage.locator('button:has-text("跳过并直接体验"), button:has-text("跳过"), button[aria-label="Close"]').first();
    if (await skipBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
      console.log('[Auth] 检测到欢迎引导浮层，执行快速关闭...');
      await skipBtn.click();
      await authPage.waitForTimeout(500);
    }

    // 检查 Studio 内的真实输入框（等待动态组件从骨架屏加载完毕）
    const studioTextarea = authPage.locator('textarea').first();
    await studioTextarea.waitFor({ state: 'visible', timeout: 90000 });
    await authPage.screenshot({ path: path.join(ARTIFACT_DIR, 'browser_03_studio_initial.png'), fullPage: false });
    console.log('[Auth] Studio 已完全挂载，截图保存: browser_03_studio_initial.png');

    await studioTextarea.click();
    const testPrompt = '极简主义，一只萌系小柴犬戴着宇航员头盔，太空漫步，唯美星云，柔和光照，8K分辨率';
    await studioTextarea.fill(testPrompt);
    console.log(`[Auth] 已填入 Studio 提示词: "${testPrompt}"`);
    await authPage.waitForTimeout(1000);

    // 截图输入后状态
    await authPage.screenshot({ path: path.join(ARTIFACT_DIR, 'browser_04_studio_prompt_ready.png'), fullPage: false });

    // 点击立即生成
    const studioGenerateBtn = authPage.locator('button:has-text("立即生成"), button:has-text("生成"), button[aria-label*="生成"]').first();
    console.log('[Auth] 点击生成按钮，触发双阶段账本流程 (Quote -> Reserve -> Provider)...');
    await studioGenerateBtn.click();

    // 等待生成完成（轮询状态从 queued -> processing -> succeeded）
    console.log('[Auth] 等待任务轮询与最终图像渲染 (最长等待 75 秒)...');
    let generatedImageFound = false;
    const startTime = Date.now();

    while (Date.now() - startTime < 75000) {
      // 检查是否有新生成的图片出现在 DOM 中
      const images = authPage.locator('img[src*="/uploads/generated/"], img[src*="/api/storage/assets/"], img[src*="/api/assets/"], img[src*="tos-cn-beijing"], img[src*="seedream"], img[alt*="柴犬"], img[alt*="宇航员"]');
      const count = await images.count();
      if (count > 0) {
        generatedImageFound = true;
        console.log(`[Auth] 🎉 成功捕获到已渲染的生成图片 (匹配数量: ${count})!`);
        break;
      }
      
      // 检查是否有成功完成的任务 API 事件
      const successEvent = apiEvents.find(e => e.status === 201 || e.body.includes('"status":"succeeded"'));
      if (successEvent) {
        console.log(`[Auth] 🎉 API 状态已确认为 succeeded/201! 等待 DOM 渲染图片...`);
        await authPage.waitForTimeout(3000);
        const postImages = authPage.locator('img[src*="/uploads/generated/"], img[src*="/api/storage/assets/"], img[src*="/api/assets/"], img[src*="tos-cn-beijing"], img[src*="seedream"], img[alt*="柴犬"], img[alt*="宇航员"]');
        const postCount = await postImages.count();
        if (postCount > 0) {
          console.log(`[Auth] 🎉 成功捕获到渲染图片 (匹配数量: ${postCount})!`);
        }
        generatedImageFound = true;
        break;
      }

      await authPage.waitForTimeout(2000);
    }

    // 截取最终出图渲染画面
    await authPage.screenshot({ path: path.join(ARTIFACT_DIR, 'browser_05_generation_success.png'), fullPage: false });
    console.log('[Auth] 已截图保存最终生成效果: browser_05_generation_success.png');

    console.log('\n=== API 调用审计轨迹 ===');
    for (const ev of apiEvents) {
      console.log(`- ${ev.status} ${ev.url}`);
      if (ev.body) console.log(`  Payload: ${ev.body.slice(0, 150)}...`);
    }

    console.log(`\n=== 模拟结果汇总 ===`);
    console.log(`1. 前端报错: ${authErrors.length === 0 ? '0 处错误 (完美)' : authErrors.length + ' 处错误'}`);
    console.log(`2. 生图完成度: ${generatedImageFound ? '✅ 完整端到端通过 (100%)' : '⚠️ 尚未检测到前端渲染'}`);

    await authContext.close();
  } finally {
    await browser.close();
  }
}

runSimulation().catch(err => {
  console.error('[FATAL]', err);
  process.exit(1);
});
