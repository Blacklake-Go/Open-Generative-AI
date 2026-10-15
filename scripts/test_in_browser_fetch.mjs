import { chromium } from "playwright";

async function main() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  
  await page.goto("https://www.Supdance.com/zh/studio", { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(4000);

  const res = await page.evaluate(async () => {
    // Let's test fetch in browser context
    const r = await fetch("/api/models/active");
    const d = await r.json();
    return {
      status: r.status,
      count: d.models?.length,
      sample: d.models?.slice(0, 3)
    };
  });

  console.log("In-browser fetch result:", res);
  await browser.close();
}

main().catch(console.error);
