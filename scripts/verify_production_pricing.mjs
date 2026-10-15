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
  await page.goto("https://www.Supdance.com/zh/studio", { waitUntil: "networkidle" });
  await page.waitForTimeout(3000);
  await page.keyboard.press("Escape");
  await page.waitForTimeout(500);

  // Find model button
  const modelBtn = page.locator('button:has-text("Seedream"), button:has-text("Nano Banana"), button:has-text("Flux")').first();
  await modelBtn.waitFor({ state: "visible", timeout: 15000 });
  console.log("Current model trigger text:", await modelBtn.innerText());

  // Click model button to open model picker
  await modelBtn.click();
  await page.waitForTimeout(1000);

  // Screenshot model picker open
  await page.screenshot({ path: path.join(artifactDir, "production_pricing_dropdown.png") });
  console.log("Saved production_pricing_dropdown.png");

  // Inspect the items in the dropdown
  const dropdownItems = page.locator('[data-model-price], span:has-text("积分"), span:has-text("暂无价格")');
  const count = await dropdownItems.count();
  console.log(`Found ${count} price elements in dropdown.`);
  for (let i = 0; i < Math.min(count, 15); i++) {
    const text = await dropdownItems.nth(i).innerText();
    console.log(`Price item ${i}: "${text}"`);
  }

  // Check specifically for Muse Image Edit and Qwen Image LoRA
  const museItem = page.locator('text=Muse Image Edit').first();
  if (await museItem.isVisible()) {
    console.log("Muse Image Edit visible!");
    const museParent = museItem.locator('..');
    console.log("Muse parent text:", await museParent.innerText());
  }

  // Click on Muse Image Edit or another model to select it
  if (await museItem.isVisible()) {
    await museItem.click();
    await page.waitForTimeout(800);
  } else {
    // Close dropdown
    await page.keyboard.press("Escape");
    await page.waitForTimeout(500);
  }

  // Check bottom bar price
  const bottomBarPrice = page.locator('text=消耗').first().locator('..');
  if (await bottomBarPrice.isVisible()) {
    const costText = await bottomBarPrice.innerText();
    console.log("Bottom bar cost display:", costText);
  } else {
    console.log("Bottom bar cost not visible directly, searching for any credits tag...");
  }

  // Now change batch size to verify multiplier linkage
  const specBtn = page.locator('button:has-text("1:1"), button:has-text("·")').first();
  if (await specBtn.isVisible()) {
    await specBtn.click();
    await page.waitForTimeout(600);
    // Click batch 4
    const batch4 = page.locator('button:text-is("4")').first();
    if (await batch4.isVisible()) {
      await batch4.click();
      console.log("Clicked batch size 4");
    }
    await page.waitForTimeout(500);
    await page.mouse.click(300, 200); // Close popover
    await page.waitForTimeout(600);
  }

  if (await bottomBarPrice.isVisible()) {
    const costTextAfter = await bottomBarPrice.innerText();
    console.log("Bottom bar cost after batch multiplier:", costTextAfter);
  }

  // Screenshot image studio bottom bar
  await page.screenshot({ path: path.join(artifactDir, "production_pricing_bottom_bar.png") });
  console.log("Saved production_pricing_bottom_bar.png");

  console.log("\n2. Visiting production video studio: https://www.Supdance.com/zh/studio/video");
  await page.goto("https://www.Supdance.com/zh/studio/video", { waitUntil: "networkidle" });
  await page.waitForTimeout(3000);
  await page.keyboard.press("Escape");
  await page.waitForTimeout(500);

  // Video bottom bar price
  const videoBottomBarPrice = page.locator('text=消耗').first().locator('..');
  if (await videoBottomBarPrice.isVisible()) {
    const videoCostText = await videoBottomBarPrice.innerText();
    console.log("Video bottom bar cost display:", videoCostText);
  }

  // Open video model picker
  const videoModelBtn = page.locator('button:has-text("Kling"), button:has-text("Minimax"), button:has-text("Luma"), button:has-text("Vidu")').first();
  if (await videoModelBtn.isVisible()) {
    await videoModelBtn.click();
    await page.waitForTimeout(1000);
    await page.screenshot({ path: path.join(artifactDir, "production_pricing_video.png") });
    console.log("Saved production_pricing_video.png");
  }

  await browser.close();
  console.log("\nAll production pricing checks completed successfully!");
}

main().catch((err) => {
  console.error("Verification error:", err);
  process.exit(1);
});
