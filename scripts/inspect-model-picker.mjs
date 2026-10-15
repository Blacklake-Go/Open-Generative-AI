import { chromium } from 'playwright';

async function main() {
  const browser = await chromium.launch({
    headless: true,
    executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    locale: 'zh-CN',
  });

  await context.addCookies([
    {
      name: 'ko_session',
      value: '1DFgGB3YQTpvS6-gAkQXvaU0tAcolUEy7ZtEDdZUOms',
      domain: '.supdance.com',
      path: '/',
      httpOnly: true,
      secure: true,
      sameSite: 'Lax',
    }
  ]);

  const page = await context.newPage();
  await page.goto('https://www.supdance.com/zh/studio', { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForTimeout(2000);

  // Find model button in prompt bar
  const buttons = await page.$$('button');
  for (const b of buttons) {
    const text = await b.innerText();
    if (text.includes('Nano Banana') || text.includes('Banana')) {
      console.log('Found model button, clicking:', text.slice(0, 50));
      await b.click();
      break;
    }
  }

  await page.waitForTimeout(1200);

  const outPath = '/Users/seelucency/.gemini/antigravity/brain/2fda4bec-ffe0-47a0-8457-1b69a11e0452/frontend_model_picker_inspect.png';
  await page.screenshot({ path: outPath, fullPage: false });
  console.log('Screenshot saved to:', outPath);

  // Inspect the items inside the popup
  const items = await page.evaluate(() => {
    const picker = document.querySelector('[role="dialog"]') || document.querySelector('.custom-scrollbar');
    if (!picker) return [];
    return Array.from(picker.querySelectorAll('div, button')).map(el => ({
      text: el.innerText?.slice(0, 50),
      img: el.querySelector('img')?.src,
      classes: el.className
    })).filter(x => x.text && x.img);
  });
  console.log('Found picker items with images:', items.slice(0, 10));

  await browser.close();
}

main().catch(console.error);
