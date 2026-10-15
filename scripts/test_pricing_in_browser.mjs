import { chromium } from "playwright";

async function main() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  await page.goto("https://www.Supdance.com/zh/studio", { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(3000);

  // Check the model price elements in the DOM
  const prices = await page.evaluate(() => {
    const els = document.querySelectorAll("[data-model-price]");
    return Array.from(els).map(el => ({
      text: el.innerText,
      price: el.getAttribute("data-model-price"),
      kind: el.getAttribute("data-model-price-kind")
    })).slice(0, 10);
  });

  console.log("Found data-model-price elements on live site:", prices);

  // Open model dropdown
  const modelBtn = page.locator('button:has-text("Seedream"), button:has-text("Nano")').first();
  if (await modelBtn.isVisible()) {
    await modelBtn.click();
    await page.waitForTimeout(1000);
    const dropdownPrices = await page.evaluate(() => {
      const els = document.querySelectorAll("[data-model-price]");
      return Array.from(els).map(el => ({
        text: el.innerText,
        price: el.getAttribute("data-model-price"),
        kind: el.getAttribute("data-model-price-kind")
      })).slice(0, 15);
    });
    console.log("Dropdown prices on live site:", dropdownPrices);
  }

  await browser.close();
}

main().catch(console.error);
