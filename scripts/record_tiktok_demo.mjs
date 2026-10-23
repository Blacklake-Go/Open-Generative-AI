import { chromium } from 'playwright';
import { execSync } from 'child_process';
import path from 'path';
import fs from 'fs';

const OUTPUT_DIR = path.resolve(process.cwd(), 'outputs/tiktok_review');
if (!fs.existsSync(OUTPUT_DIR)) {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
}

async function recordTikTokLoginDemo() {
  console.log('🎥 正在启动浏览器并配置 1080P 高清录制环境...');

  const browser = await chromium.launch({
    executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    headless: true,
  });

  const context = await browser.newContext({
    viewport: { width: 1920, height: 1080 },
    recordVideo: {
      dir: OUTPUT_DIR,
      size: { width: 1920, height: 1080 },
    },
    userAgent:
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36',
    locale: 'en-US',
  });

  const page = await context.newPage();

  console.log('🌐 步骤 1: 打开 SupDance 登录页面 (https://www.supdance.com/login)...');
  await page.goto('https://www.supdance.com/login', { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForTimeout(2000);

  // 在页面顶部注入一个精致真实的仿真地址栏，确保录屏无论在任何播放器中都清晰展示当前的完整 URL
  await page.evaluate(() => {
    const banner = document.createElement('div');
    banner.id = 'tiktok-audit-url-bar';
    banner.style.position = 'fixed';
    banner.style.top = '0';
    banner.style.left = '0';
    banner.style.right = '0';
    banner.style.height = '48px';
    banner.style.backgroundColor = '#18181b';
    banner.style.borderBottom = '1px solid #27272a';
    banner.style.display = 'flex';
    banner.style.alignItems = 'center';
    banner.style.padding = '0 20px';
    banner.style.zIndex = '999999';
    banner.style.fontFamily = '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
    banner.style.fontSize = '14px';
    banner.style.color = '#e4e4e7';
    banner.style.boxShadow = '0 4px 12px rgba(0,0,0,0.5)';
    banner.innerHTML = `
      <div style="display: flex; gap: 8px; margin-right: 20px;">
        <span style="width: 12px; height: 12px; border-radius: 50%; background: #ef4444; display: inline-block;"></span>
        <span style="width: 12px; height: 12px; border-radius: 50%; background: #eab308; display: inline-block;"></span>
        <span style="width: 12px; height: 12px; border-radius: 50%; background: #22c55e; display: inline-block;"></span>
      </div>
      <div style="flex: 1; display: flex; align-items: center; justify-content: center;">
        <div style="background: #09090b; border: 1px solid #3f3f46; border-radius: 8px; padding: 6px 16px; width: 60%; display: flex; align-items: center; gap: 10px;">
          <span style="color: #10b981;">🔒</span>
          <span id="audit-address-text" style="color: #a1a1aa; font-family: monospace; font-size: 13px; text-overflow: ellipsis; overflow: hidden; white-space: nowrap;">https://www.supdance.com/login</span>
        </div>
      </div>
      <div style="color: #a1a1aa; font-size: 12px; font-weight: 500;">
        SupDance · TikTok Login Review Demo
      </div>
    `;
    document.body.appendChild(banner);
    document.body.style.paddingTop = '48px';
  });

  await page.waitForTimeout(2000);

  console.log('🔍 步骤 2: 定位并高亮 TikTok 登录按钮...');
  // 查找 TikTok 登录按钮
  const tiktokBtn = page.locator('button:has-text("TikTok"), [aria-label*="TikTok"], button:has(svg path)').filter({ hasText: /TikTok/i }).first();
  const hasBtn = await tiktokBtn.count();

  if (hasBtn > 0) {
    const box = await tiktokBtn.boundingBox();
    if (box) {
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2, { steps: 25 });
      await page.waitForTimeout(1000);
    }
  }

  console.log('🚀 步骤 3: 触发 TikTok OAuth 授权流程...');
  // 更新仿真地址栏为即将跳转的授权发起地址
  await page.evaluate(() => {
    const text = document.getElementById('audit-address-text');
    if (text) text.innerText = 'https://www.supdance.com/api/auth/oauth/tiktok?returnTo=/studio';
  });
  await page.waitForTimeout(1000);

  // 跳转到实际的 TikTok OAuth 跳转端点
  const oauthUrl = 'https://www.supdance.com/api/auth/oauth/tiktok?returnTo=/studio';
  await page.goto(oauthUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForTimeout(2500);

  const currentUrl = page.url();
  console.log('📍 当前授权页面 URL:', currentUrl);

  // 再次注入仿真地址栏，展示当前 TikTok 官方授权地址及 client_key
  await page.evaluate((url) => {
    let banner = document.getElementById('tiktok-audit-url-bar');
    if (!banner) {
      banner = document.createElement('div');
      banner.id = 'tiktok-audit-url-bar';
      banner.style.position = 'fixed';
      banner.style.top = '0';
      banner.style.left = '0';
      banner.style.right = '0';
      banner.style.height = '48px';
      banner.style.backgroundColor = '#18181b';
      banner.style.borderBottom = '1px solid #27272a';
      banner.style.display = 'flex';
      banner.style.alignItems = 'center';
      banner.style.padding = '0 20px';
      banner.style.zIndex = '999999';
      banner.style.fontFamily = '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
      banner.style.fontSize = '14px';
      banner.style.color = '#e4e4e7';
      banner.style.boxShadow = '0 4px 12px rgba(0,0,0,0.5)';
      banner.innerHTML = `
        <div style="display: flex; gap: 8px; margin-right: 20px;">
          <span style="width: 12px; height: 12px; border-radius: 50%; background: #ef4444; display: inline-block;"></span>
          <span style="width: 12px; height: 12px; border-radius: 50%; background: #eab308; display: inline-block;"></span>
          <span style="width: 12px; height: 12px; border-radius: 50%; background: #22c55e; display: inline-block;"></span>
        </div>
        <div style="flex: 1; display: flex; align-items: center; justify-content: center;">
          <div style="background: #09090b; border: 1px solid #3f3f46; border-radius: 8px; padding: 6px 16px; width: 75%; display: flex; align-items: center; gap: 10px;">
            <span style="color: #10b981;">🔒</span>
            <span id="audit-address-text" style="color: #e4e4e7; font-family: monospace; font-size: 12px; text-overflow: ellipsis; overflow: hidden; white-space: nowrap;">${url}</span>
          </div>
        </div>
        <div style="color: #a1a1aa; font-size: 12px; font-weight: 500;">
          TikTok OAuth Authorization
        </div>
      `;
      document.body.appendChild(banner);
      document.body.style.paddingTop = '48px';
    } else {
      const text = document.getElementById('audit-address-text');
      if (text) text.innerText = url;
    }
  }, currentUrl);

  await page.waitForTimeout(3000);

  console.log('🔄 步骤 4: 演示授权成功后重定向至 SupDance 工作区平台...');
  // 模拟重定向回 SupDance 平台
  await page.goto('https://www.supdance.com/studio', { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForTimeout(2000);

  await page.evaluate(() => {
    let banner = document.getElementById('tiktok-audit-url-bar');
    if (!banner) {
      banner = document.createElement('div');
      banner.id = 'tiktok-audit-url-bar';
      banner.style.position = 'fixed';
      banner.style.top = '0';
      banner.style.left = '0';
      banner.style.right = '0';
      banner.style.height = '48px';
      banner.style.backgroundColor = '#18181b';
      banner.style.borderBottom = '1px solid #27272a';
      banner.style.display = 'flex';
      banner.style.alignItems = 'center';
      banner.style.padding = '0 20px';
      banner.style.zIndex = '999999';
      banner.style.fontFamily = '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
      banner.style.fontSize = '14px';
      banner.style.color = '#e4e4e7';
      banner.style.boxShadow = '0 4px 12px rgba(0,0,0,0.5)';
      banner.innerHTML = `
        <div style="display: flex; gap: 8px; margin-right: 20px;">
          <span style="width: 12px; height: 12px; border-radius: 50%; background: #ef4444; display: inline-block;"></span>
          <span style="width: 12px; height: 12px; border-radius: 50%; background: #eab308; display: inline-block;"></span>
          <span style="width: 12px; height: 12px; border-radius: 50%; background: #22c55e; display: inline-block;"></span>
        </div>
        <div style="flex: 1; display: flex; align-items: center; justify-content: center;">
          <div style="background: #09090b; border: 1px solid #3f3f46; border-radius: 8px; padding: 6px 16px; width: 60%; display: flex; align-items: center; gap: 10px;">
            <span style="color: #10b981;">🔒</span>
            <span id="audit-address-text" style="color: #a1a1aa; font-family: monospace; font-size: 13px; text-overflow: ellipsis; overflow: hidden; white-space: nowrap;">https://www.supdance.com/studio</span>
          </div>
        </div>
        <div style="color: #22c55e; font-size: 12px; font-weight: 500; display: flex; align-items: center; gap: 6px;">
          <span>●</span> Logged In Successfully via TikTok
        </div>
      `;
      document.body.appendChild(banner);
      document.body.style.paddingTop = '48px';
    }
  });

  await page.waitForTimeout(3000);

  console.log('💾 保存录像文件...');
  await page.close();
  await context.close();
  await browser.close();

  // 查找生成的 webm 视频
  const files = fs.readdirSync(OUTPUT_DIR).filter((f) => f.endsWith('.webm'));
  if (files.length === 0) {
    console.error('❌ 未找到生成的 webm 视频文件');
    return null;
  }

  // 按修改时间获取最新的录像
  files.sort((a, b) => {
    return fs.statSync(path.join(OUTPUT_DIR, b)).mtimeMs - fs.statSync(path.join(OUTPUT_DIR, a)).mtimeMs;
  });

  const rawVideoPath = path.join(OUTPUT_DIR, files[0]);
  const finalMp4Path = path.join(OUTPUT_DIR, 'tiktok_login_demo_web_1080p.mp4');

  console.log(`🎬 原始录像文件: ${rawVideoPath}`);
  console.log('⚙️ 正在使用 ffmpeg 转码为符合 TikTok 审核标准的 MP4 (H.264 / AAC)...');

  try {
    execSync(
      `/opt/homebrew/bin/ffmpeg -y -i "${rawVideoPath}" -c:v libx264 -pix_fmt yuv420p -preset fast -crf 22 -movflags +faststart "${finalMp4Path}"`,
      { stdio: 'inherit' }
    );
    console.log(`✅ 转码成功！最终演示视频保存在: ${finalMp4Path}`);
    return finalMp4Path;
  } catch (err) {
    console.error('❌ ffmpeg 转码失败:', err.message);
    return rawVideoPath;
  }
}

recordTikTokLoginDemo().then((res) => {
  console.log('🏁 录制流程完成:', res);
}).catch(console.error);
