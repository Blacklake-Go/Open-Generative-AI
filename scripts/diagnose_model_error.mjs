import { chromium } from "playwright";

async function main() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    locale: "zh-CN",
  });
  const page = await context.newPage();

  page.on("console", (msg) => {
    console.log(`[Browser Console ${msg.type()}]:`, msg.text());
  });

  page.on("requestfailed", (req) => {
    console.log(`[Request Failed]: ${req.method()} ${req.url()} - ${req.failure()?.errorText}`);
  });

  page.on("response", (res) => {
    if (res.url().includes("/api/")) {
      console.log(`[API Response]: ${res.status()} ${res.url()}`);
    }
  });

  console.log("Navigating to https://www.Supdance.com/zh/studio ...");
  await page.goto("https://www.Supdance.com/zh/studio", { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(4000);

  // Check state of model directory in page
  const banner = await page.locator('text="模型目录暂时不可用"').count();
  console.log("Banner count:", banner);

  await browser.close();
}

main().catch(console.error);
