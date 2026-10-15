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

  console.log("1. Visiting production image studio...");
  await page.goto("https://www.Supdance.com/zh/studio", { waitUntil: "networkidle" });
  await page.waitForTimeout(2500);
  await page.keyboard.press("Escape");
  await page.waitForTimeout(500);

  // Model Picker Dropdown
  const modelBtn = page.locator('button:has-text("Seedream"), button:has-text("Nano Banana"), button:has-text("Flux")').first();
  await modelBtn.waitFor({ state: "visible", timeout: 15000 });
  await modelBtn.click();
  await page.waitForTimeout(1000);

  await page.screenshot({ path: path.join(artifactDir, "verify_image_models_pricing.png") });
  console.log("Saved verify_image_models_pricing.png");

  // Close dropdown
  await page.keyboard.press("Escape");
  await page.waitForTimeout(500);

  console.log("\n2. Visiting production video studio...");
  await page.goto("https://www.supdance.com/zh/studio/video", { waitUntil: "networkidle" });
  await page.waitForTimeout(2500);
  await page.keyboard.press("Escape");
  await page.waitForTimeout(500);

  // Open video model dropdown
  const videoModelBtn = page.locator('button:has-text("Kling"), button:has-text("Minimax"), button:has-text("Seedance"), button:has-text("Veo")').first();
  await videoModelBtn.waitFor({ state: "visible", timeout: 15000 });
  await videoModelBtn.click();
  await page.waitForTimeout(1000);

  // Check Veo and Seedance pricing text
  const searchInput = page.locator('input[placeholder*="搜索"]').first();
  if (await searchInput.isVisible()) {
    // Search Veo 3
    await searchInput.fill("Veo 3");
    await page.waitForTimeout(600);
    const veoPriceElem = page.locator('[data-model-price]').first();
    if (await veoPriceElem.isVisible()) {
      console.log("Veo 3 price in UI:", await veoPriceElem.innerText());
    }
    await page.screenshot({ path: path.join(artifactDir, "verify_video_veo3_pricing.png") });
    console.log("Saved verify_video_veo3_pricing.png");

    // Search Seedance
    await searchInput.fill("Seedance");
    await page.waitForTimeout(600);
    const seedanceElem = page.locator('[data-model-price]').first();
    if (await seedanceElem.isVisible()) {
      console.log("Seedance price in UI:", await seedanceElem.innerText());
    }
    await page.screenshot({ path: path.join(artifactDir, "verify_video_seedance_pricing.png") });
    console.log("Saved verify_video_seedance_pricing.png");
  }

  // Close dropdown
  await page.keyboard.press("Escape");
  await page.waitForTimeout(500);

  console.log("\n3. Visiting production Price Details table (模型价格表)...");
  await page.goto("https://www.supdance.com/zh/studio?account=open&tab=price-details", { waitUntil: "networkidle" });
  await page.waitForTimeout(3000);

  // Verify tabs
  const audioTab = page.locator('button:has-text("音频与音乐"), [role="tab"]:has-text("音频与音乐")').first();
  if (await audioTab.isVisible()) {
    console.log("Audio tab is visible in price details!");
    await audioTab.click();
    await page.waitForTimeout(800);
    await page.screenshot({ path: path.join(artifactDir, "verify_price_table_audio.png") });
    console.log("Saved verify_price_table_audio.png");
  }

  const allTab = page.locator('button:has-text("全部"), [role="tab"]:has-text("全部")').first();
  if (await allTab.isVisible()) {
    await allTab.click();
    await page.waitForTimeout(800);
  }

  await page.screenshot({ path: path.join(artifactDir, "verify_price_table_full.png") });
  console.log("Saved verify_price_table_full.png");

  await browser.close();
  console.log("\nAll price verification tests completed successfully!");
}

main().catch((err) => {
  console.error("Test error:", err);
  process.exit(1);
});
