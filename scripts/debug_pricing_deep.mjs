import { chromium } from "playwright";

async function main() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  
  // Expose function or intercept api/models/active
  page.on("response", async (res) => {
    if (res.url().includes("/api/models/active")) {
      const json = await res.json().catch(() => null);
      console.log("api/models/active returned count:", json?.models?.length);
      console.log("Sample model from api:", json?.models?.[0]);
    }
  });

  await page.goto("https://www.Supdance.com/zh/studio", { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(3000);

  // Check what webpack modules exist or examine window
  const debugInfo = await page.evaluate(() => {
    // Let's inspect ModelPriceTag or any global
    return {
      title: document.title,
      localStorage: { ...localStorage }
    };
  });
  console.log("Debug info:", debugInfo);

  await browser.close();
}

main().catch(console.error);
