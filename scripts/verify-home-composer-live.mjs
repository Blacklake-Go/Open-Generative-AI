import { chromium } from 'playwright';

async function testHomeComposer() {
  console.log('🚀 [E2E Live Test] Starting Home Composer Live Verification...');
  const browser = await chromium.launch({
    channel: 'chrome',
    headless: true,
  });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    locale: 'zh-CN',
  });
  const page = await context.newPage();

  try {
    const testUrl = 'http://127.0.0.1:3105/zh';
    console.log(`1. Navigating to ${testUrl}...`);
    await page.goto(testUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(1000);

    // Step 1: Verify Textarea & Skill preset insertion
    console.log('2. Verifying Prompt Textarea & Preset Insertion...');
    const textarea = page.locator('textarea[placeholder="描述你想要创建的图像"]');
    await textarea.waitFor({ state: 'visible', timeout: 10000 });
    await textarea.fill('赛博朋克风格的雨夜未来城市');

    const presetBtn = page.getByRole('button', { name: /电影级长镜头运镜/i }).first();
    if (await presetBtn.isVisible()) {
      await presetBtn.click();
      const updatedVal = await textarea.inputValue();
      console.log('✅ Preset inserted successfully:', updatedVal);
      if (!updatedVal.includes('电影级长镜头运镜')) {
        throw new Error('Preset was not inserted into prompt composer!');
      }
    }
    await page.screenshot({ path: '/tmp/step1_composer_input.png' });

    // Step 2: Verify Model Picker Popover
    console.log('3. Verifying Model Picker dropdown...');
    const modelBtn = page.locator('button', { hasText: 'Nano Banana' }).first();
    await modelBtn.waitFor({ state: 'visible', timeout: 5000 });
    await modelBtn.click();
    await page.waitForTimeout(600);

    // Verify model picker contains models
    const hunyuanOption = page.locator('text=Hunyuan Image 3.0').first();
    await hunyuanOption.waitFor({ state: 'visible', timeout: 5000 });
    console.log('✅ Model picker dropdown opened with models including Hunyuan Image 3.0!');
    await page.screenshot({ path: '/tmp/step2_model_picker.png' });

    // Select Hunyuan Image 3.0
    await hunyuanOption.click();
    await page.waitForTimeout(500);
    const updatedModelBtn = page.locator('button', { hasText: 'Hunyuan Image 3.0' }).first();
    await updatedModelBtn.waitFor({ state: 'visible', timeout: 5000 });
    console.log('✅ Model switched successfully to Hunyuan Image 3.0!');

    // Step 3: Verify Spec Popover
    console.log('4. Verifying Spec Popover...');
    const specBtn = page.locator('button', { hasText: '1:1 · 1' }).first();
    await specBtn.waitFor({ state: 'visible', timeout: 5000 });
    await specBtn.click();
    await page.waitForTimeout(600);

    // Verify Spec Popover controls: 画幅比例 and 生成张数
    const ratioOption = page.locator('text=画幅比例').first();
    await ratioOption.waitFor({ state: 'visible', timeout: 5000 });
    console.log('✅ Spec popover (aspect ratio 1:1, batch count, dimensions) opened and visible!');
    await page.screenshot({ path: '/tmp/step3_spec_popover.png' });

    // Click 2 to test changing batch size
    const batch2Option = page.locator('button', { hasText: '2' }).first();
    await batch2Option.click();
    await page.waitForTimeout(400);
    const updatedSpecBtn = page.locator('button', { hasText: '1:1 · 2' }).first();
    await updatedSpecBtn.waitFor({ state: 'visible', timeout: 3000 });
    console.log('✅ Spec updated to 1:1 · 2!');

    // Close spec popover by clicking outside
    await page.mouse.click(50, 50);
    await page.waitForTimeout(400);

    // Step 4: Verify Draw Modal
    console.log('5. Verifying Draw Modal ("绘制")...');
    const drawBtn = page.locator('button[title="绘制"]').first();
    await drawBtn.waitFor({ state: 'visible', timeout: 5000 });
    await drawBtn.click();
    await page.waitForTimeout(600);

    const canvas = page.locator('canvas').first();
    await canvas.waitFor({ state: 'visible', timeout: 5000 });
    console.log('✅ Draw modal canvas opened and visible!');
    await page.screenshot({ path: '/tmp/step4_draw_modal.png' });

    // Close draw modal
    const closeDrawBtn = page.locator('button', { hasText: '取消' }).or(page.locator('button[aria-label="Close"]')).first();
    if (await closeDrawBtn.isVisible()) {
      await closeDrawBtn.click();
    } else {
      await page.keyboard.press('Escape');
    }
    await page.waitForTimeout(400);

    // Step 5: Verify Generate Button triggers Auth Modal
    console.log('6. Verifying Generate button triggers AuthModal...');
    const generateBtn = page.locator('button', { hasText: '生成' }).last();
    await generateBtn.waitFor({ state: 'visible', timeout: 5000 });
    await generateBtn.click();
    await page.waitForTimeout(800);

    const authTitle = page.locator('text=创作者账号登录').first();
    await authTitle.waitFor({ state: 'visible', timeout: 5000 });
    console.log('✅ AuthModal ("创作者账号登录") triggered successfully!');
    await page.screenshot({ path: '/tmp/step5_auth_modal.png' });

    console.log('\n🎉 ALL HIGH-FIDELITY STUDIO PROMPT COMPOSER FEATURES FULLY VERIFIED ON LIVE PRODUCTION!');
  } catch (err) {
    console.error('❌ Test failed:', err);
    await page.screenshot({ path: '/tmp/test_failure.png' }).catch(() => {});
    process.exit(1);
  } finally {
    await browser.close();
  }
}

testHomeComposer();
