import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

async function source(relativePath) {
  return fs.readFile(path.join(repoRoot, relativePath), 'utf8');
}

test('SubscriptionModal incorporates oiioii visual architecture and interaction models', async () => {
  const modalSrc = await source('components/subscription/SubscriptionModal.jsx');
  const i18nSrc = await source('components/subscription/subscriptionI18n.js');

  // 1. Check all 4 plans with code names
  assert.equal(modalSrc.includes("codeName: 'BASE'"), true);
  assert.equal(modalSrc.includes("codeName: 'STAR'"), true);
  assert.equal(modalSrc.includes("codeName: 'PRO'"), true);
  assert.equal(modalSrc.includes("codeName: 'APEX'"), true);

  // 2. Check top roof window banners on PRO & APEX (Image 2 signature element)
  assert.equal(modalSrc.includes('topRoofWindow'), true);
  assert.equal(modalSrc.includes('Seedance 2.5 720P 低至0.37元/秒'), true);
  assert.equal(modalSrc.includes('Seedance 2.5 720P 低至0.36元/秒'), true);

  // 3. Check APEX brand accent styling adhering to UI_DESIGN_SYSTEM
  assert.equal(modalSrc.includes('border-brand') || modalSrc.includes('border-brand-line'), true);
  assert.equal(modalSrc.includes('bg-brand'), true);

  // 4. Check "常用模型折算" section and models (locale copy lives in subscriptionI18n)
  assert.equal(i18nSrc.includes('常用模型折算'), true);
  assert.equal(i18nSrc.includes('Seedance2.0 pro 720p'), true);
  assert.equal(i18nSrc.includes('Seedance 2.5 720p'), true);
  assert.equal(i18nSrc.includes('MiniMax H3 Max Turbo'), true);
  assert.equal(i18nSrc.includes('顶级图像 (Flux/SD) 2K'), true);

  // 5. Check "会员专用模型" section
  assert.equal(i18nSrc.includes('会员专用模型'), true);
  assert.equal(i18nSrc.includes('Seedance2.0 Pro / Fast / mini'), true);
  assert.equal(i18nSrc.includes('最低4.2折'), true);

  // 6. Interactive micro-animation follows UI_DESIGN_SYSTEM v3.7 press physics
  //    (transform 90ms, active:scale-[0.98]); the old hover-grow token is retired.
  assert.equal(modalSrc.includes('active:scale-[0.98]'), true);
  assert.equal(modalSrc.includes('duration-fast ease-standard'), true);

  // 7. Check quota breakdown (⚡ Monthly + 🎁 Bonus + ⓘ Tooltip)
  assert.equal(modalSrc.includes('InfoTooltip'), true);
  assert.equal(i18nSrc.includes('首充加赠'), true);
});
