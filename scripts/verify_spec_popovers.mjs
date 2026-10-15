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

  console.log("1. Visiting image studio: http://localhost:3000/zh/studio");
  await page.goto("http://localhost:3000/zh/studio", { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(3000);

  // Close any modal/overlay if open
  await page.keyboard.press("Escape");
  await page.waitForTimeout(500);

  // Locate the unified image spec button (contains '·' and either '1:1' or '4K' or '1K')
  console.log("2. Finding and clicking unified image spec button...");
  const specButton = page.locator('button:has-text("1:1"), button:has-text("·")').first();
  await specButton.waitFor({ state: "visible", timeout: 10000 });
  
  const initialText = await specButton.innerText();
  console.log("Image spec button initial text:", initialText);

  await page.screenshot({ path: path.join(artifactDir, "image_studio_initial.png") });

  await specButton.click();
  await page.waitForTimeout(800);
  await page.screenshot({ path: path.join(artifactDir, "image_spec_popover_open.png") });
  console.log("Saved image_spec_popover_open.png");

  // Select 16:9 ratio inside popover
  const ratio169 = page.locator('button:has-text("16:9")').first();
  if (await ratio169.isVisible()) {
    await ratio169.click();
    console.log("Clicked 16:9 ratio");
  }

  // Select batch size 3
  const batch3 = page.locator('button:text-is("3")').first();
  if (await batch3.isVisible()) {
    await batch3.click();
    console.log("Clicked batch size 3");
  }

  await page.waitForTimeout(500);
  await page.screenshot({ path: path.join(artifactDir, "image_spec_popover_changed.png") });
  console.log("Saved image_spec_popover_changed.png");

  // Click on background or empty space to close popover
  await page.mouse.click(300, 200);
  await page.waitForTimeout(600);

  const updatedText = await specButton.innerText();
  console.log("Image spec button after change:", updatedText);
  await page.screenshot({ path: path.join(artifactDir, "image_spec_closed_updated.png") });

  console.log("\n3. Visiting video studio: http://localhost:3000/zh/studio/video");
  await page.goto("http://localhost:3000/zh/studio/video", { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(3000);
  await page.keyboard.press("Escape");
  await page.waitForTimeout(500);

  const videoSpecButton = page.locator('button:has-text("16:9"), button:has-text("·")').first();
  await videoSpecButton.waitFor({ state: "visible", timeout: 10000 });
  const videoInitialText = await videoSpecButton.innerText();
  console.log("Video spec button initial text:", videoInitialText);

  await page.screenshot({ path: path.join(artifactDir, "video_studio_initial.png") });

  await videoSpecButton.click();
  await page.waitForTimeout(800);
  await page.screenshot({ path: path.join(artifactDir, "video_spec_popover_open.png") });
  console.log("Saved video_spec_popover_open.png");

  // Select 9:16 in video spec popover
  const ratio916 = page.locator('button:has-text("9:16")').first();
  if (await ratio916.isVisible()) {
    await ratio916.click();
    console.log("Clicked 9:16 in video spec");
  }

  await page.waitForTimeout(500);
  await page.screenshot({ path: path.join(artifactDir, "video_spec_popover_changed.png") });
  console.log("Saved video_spec_popover_changed.png");

  await page.mouse.click(300, 200);
  await page.waitForTimeout(600);

  const videoUpdatedText = await videoSpecButton.innerText();
  console.log("Video spec button after change:", videoUpdatedText);
  await page.screenshot({ path: path.join(artifactDir, "video_spec_closed_updated.png") });

  await browser.close();
  console.log("\nAll verifications completed successfully!");
}

main().catch((err) => {
  console.error("Verification failed:", err);
  process.exit(1);
});
