import { chromium } from "playwright";
import path from "path";

async function main() {
  const artifactDir = "/Users/seelucency/.gemini/antigravity/brain/9d94f305-b637-416d-919d-e7d4ff045a3d";
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    locale: "zh-CN",
  });
  const page = await context.newPage();

  console.log("1. Visiting production image studio: https://www.Supdance.com/zh/studio");
  await page.goto("https://www.Supdance.com/zh/studio", { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(3000);
  await page.keyboard.press("Escape");
  await page.waitForTimeout(500);

  const specBtn = page.locator('button:has-text("1:1"), button:has-text("·")').first();
  await specBtn.waitFor({ state: "visible", timeout: 15000 });
  const text1 = await specBtn.innerText();
  console.log("Production image spec trigger text:", text1);

  await specBtn.click();
  await page.waitForTimeout(800);
  await page.screenshot({ path: path.join(artifactDir, "production_image_spec_verified.png") });
  console.log("Saved production_image_spec_verified.png");

  // Select 16:9 and 2
  const ratio169 = page.locator('button:has-text("16:9")').first();
  if (await ratio169.isVisible()) await ratio169.click();
  const batch2 = page.locator('button:text-is("2")').first();
  if (await batch2.isVisible()) await batch2.click();

  await page.waitForTimeout(500);
  await page.mouse.click(300, 200);
  await page.waitForTimeout(600);

  console.log("\n2. Visiting production video studio: https://www.Supdance.com/zh/studio/video");
  await page.goto("https://www.Supdance.com/zh/studio/video", { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(3000);
  await page.keyboard.press("Escape");
  await page.waitForTimeout(500);

  const videoSpecBtn = page.locator('button:has-text("16:9"), button:has-text("·")').first();
  await videoSpecBtn.waitFor({ state: "visible", timeout: 15000 });
  const text2 = await videoSpecBtn.innerText();
  console.log("Production video spec trigger text:", text2);

  await videoSpecBtn.click();
  await page.waitForTimeout(800);
  await page.screenshot({ path: path.join(artifactDir, "production_video_spec_verified.png") });
  console.log("Saved production_video_spec_verified.png");

  await browser.close();
  console.log("\nProduction verification completed successfully!");
}

main().catch((err) => {
  console.error("Production verification error:", err);
  process.exit(1);
});
