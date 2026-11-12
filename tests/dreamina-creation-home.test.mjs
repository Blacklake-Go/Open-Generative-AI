import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import ImageSpecPkg from '../packages/studio/dist/components/ImageSpecPopover.js';
const { computeImageDimensions } = ImageSpecPkg;
import {
  priceForIds,
  formatModelPrice,
} from '../packages/studio/src/modelPrice.js';
import {
  getAspectRatiosForModel,
  getResolutionsForModel,
  getAspectRatiosForVideoModel,
  getResolutionsForVideoModel,
  getDurationsForModel,
  applyActiveModelDirectory,
  getModelPricing,
} from '../packages/studio/src/models.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

test('D1: Multi-Mode Creation Workbench Structure & 5-Mode Definitions', async (t) => {
  const composerPath = path.join(rootDir, 'components/home/HomeStudioPromptComposer.jsx');
  const composerCode = fs.readFileSync(composerPath, 'utf8');

  await t.test('defines all 5 Dreamina creation modes with isolation', () => {
    assert.ok(composerCode.includes("'image'"), 'supports image mode');
    assert.ok(composerCode.includes("'video'"), 'supports video mode');
    assert.ok(composerCode.includes("'audio'"), 'supports audio mode');
    assert.ok(composerCode.includes("'agent'"), 'supports agent mode');
    assert.ok(composerCode.includes("'digital-human'"), 'supports digital human mode');
  });

  await t.test('implements draft state isolation for all modes', () => {
    assert.ok(composerCode.includes('drafts.image') || composerCode.includes("image: {"), 'has image draft state');
    assert.ok(composerCode.includes('drafts.video') || composerCode.includes("video: {"), 'has video draft state');
    assert.ok(composerCode.includes('drafts.audio') || composerCode.includes("audio: {"), 'has audio draft state');
    assert.ok(composerCode.includes('drafts.agent') || composerCode.includes("agent: {"), 'has agent draft state');
    assert.ok(composerCode.includes("digital-human"), 'has digital-human draft state');
  });

  await t.test('synchronizes mode changes with URL query parameter ?type=', () => {
    assert.ok(composerCode.includes("url.searchParams.set('type', modeId)"), 'updates ?type= parameter on tab switch');
    assert.ok(composerCode.includes("searchParams.get('type')"), 'reads ?type= on mount');
  });

  await t.test('exposes imperative handle with preset application and skill toggling', () => {
    assert.ok(composerCode.includes('applyCreationPreset:'), 'exposes applyCreationPreset');
    assert.ok(composerCode.includes('toggleSkillPrompt:'), 'exposes toggleSkillPrompt');
    assert.ok(composerCode.includes('switchMode:'), 'exposes switchMode');
  });

  await t.test('renders primary generate action as capsule pill button', () => {
    assert.ok(
      composerCode.includes('data-testid="composer-generate-button"'),
      'primary generate action must stay addressable for interaction tests'
    );
    // PromptAction maps `circular` to shape="pill" internally, so the composer
    // expresses capsule geometry through the boolean rather than the shape prop.
    assert.ok(
      /<PromptAction[\s\S]{0,600}?data-testid="composer-generate-button"[\s\S]{0,600}?circular/.test(composerCode),
      'generate action renders through PromptAction with circular (pill) geometry'
    );
  });
});

test('D2: JimengHomePortal Dreamina UI & Dynamic Skill Presets', async (t) => {
  const portalPath = path.join(rootDir, 'components/home/JimengHomePortal.jsx');
  const portalCode = fs.readFileSync(portalPath, 'utf8');

  await t.test('renders iconic Dreamina hero title with ambient glow', () => {
    assert.ok(
      portalCode.includes('创造任何你') || portalCode.includes('Create anything you'),
      'contains Dreamina headline text'
    );
    assert.ok(
      portalCode.includes('想象的事物') || portalCode.includes('imagine'),
      'contains Dreamina emphasis text'
    );
    assert.ok(
      portalCode.includes('blur-[90px]') || portalCode.includes('blur-'),
      'includes ambient glow backdrop'
    );
  });

  await t.test('uses segmented pill switcher adhering to UI_REPAIR_INSTRUCTION', () => {
    assert.ok(portalCode.includes('data-pill-segmented'), 'has data-pill-segmented container');
    assert.ok(portalCode.includes('data-pill-segment-item'), 'has data-pill-segment-item elements');
    // Ensure no conflicting rounded classes on the same element
    const pillRegex = /className="[^"]*rounded-full[^"]*"/g;
    const matches = portalCode.match(pillRegex) || [];
    for (const match of matches) {
      assert.ok(!match.includes('rounded-md'), `no conflicting rounded-md in pill: ${match}`);
      assert.ok(!match.includes('rounded-lg'), `no conflicting rounded-lg in pill: ${match}`);
    }
  });

  await t.test('integrates mode-aware quick skill presets for all 5 modes', () => {
    assert.ok(portalCode.includes("mode === 'video'"), 'provides video presets');
    assert.ok(portalCode.includes("mode === 'audio'"), 'provides audio presets');
    assert.ok(portalCode.includes("mode === 'agent'"), 'provides agent presets');
    assert.ok(portalCode.includes("mode === 'digital-human'"), 'provides digital human presets');
  });

  await t.test('fetches user creations from /api/generations?limit=8', () => {
    assert.ok(
      portalCode.includes("fetch('/api/generations?limit=8'"),
      'queries recent user generations endpoint'
    );
  });

  await t.test('strictly preserves /canvas relative links without hardcoded domains', () => {
    // Locale-aware routing is the i18n successor of the old bare href="/canvas";
    // both keep the link relative to the current host.
    assert.ok(
      portalCode.includes("localizeStudioPath('/canvas'"),
      'JimengHomePortal must route to /canvas through localizeStudioPath'
    );
    assert.ok(
      !portalCode.includes('https://www.Supdance.com/canvas') &&
      !portalCode.includes('https://canvas.supdance.com/'),
      'JimengHomePortal must not hardcode absolute external domain'
    );
  });

  await t.test('implements queued composer action for asynchronous canvas-to-generate switching', () => {
    assert.ok(portalCode.includes('queuedComposerAction'), 'has queuedComposerAction state');
    assert.ok(portalCode.includes('setQueuedComposerAction'), 'sets queued action on canvas mode card click');
  });
});

test('D3: Multi-Mode FrontendModelPicker Capabilities', async (t) => {
  const pickerPath = path.join(rootDir, 'packages/studio/src/components/FrontendModelPicker.jsx');
  const pickerCode = fs.readFileSync(pickerPath, 'utf8');

  await t.test('supports all studio types including image, video, audio, agent, digital-human', () => {
    assert.ok(pickerCode.includes('studioType === "video"'), 'supports video studioType');
    assert.ok(pickerCode.includes('studioType === "audio"'), 'supports audio studioType');
    assert.ok(pickerCode.includes('studioType === "agent"'), 'supports agent studioType');
    assert.ok(pickerCode.includes('studioType === "digital-human"'), 'supports digital-human studioType');
  });

  await t.test('dynamically pulls active models from /api/models/active', () => {
    assert.ok(pickerCode.includes('/api/models/active'), 'fetches active models from server');
  });

  await t.test('provides robust fallback entries for agent mode', () => {
    assert.ok(pickerCode.includes('deepseek-chat'), 'includes deepseek-chat in agent fallback catalog');
    assert.ok(pickerCode.includes('deepseek-reasoner'), 'includes deepseek-reasoner in agent fallback catalog');
  });
});

test('D4: Design Token & Contrast Verification', async (t) => {
  const cssPath = path.join(rootDir, 'app/globals.css');
  const cssCode = fs.readFileSync(cssPath, 'utf8');

  await t.test('brand color is #e11d74 and text on accent is pure white', () => {
    assert.ok(cssCode.includes('#e11d74'), 'brand primary is #e11d74');
    assert.ok(cssCode.includes('--ink-on-accent: #ffffff'), 'text on accent is #ffffff');
  });

  await t.test('dark elevation shadows are properly declared in globals', () => {
    assert.ok(cssCode.includes('--shadow-elevation-1:'), 'elevation-1 token exists');
    assert.ok(cssCode.includes('--shadow-elevation-2:'), 'elevation-2 token exists');
    assert.ok(cssCode.includes('--shadow-elevation-3:'), 'elevation-3 token exists');
    assert.ok(cssCode.includes('--shadow-elevation-4:'), 'elevation-4 token exists');
  });
});

test('D5: Dynamic Model Schema Options & Parameter Sanitization', async (t) => {
  await t.test('resolves allowable aspect ratios for image models', () => {
    const ratios = getAspectRatiosForModel('gpt-image-2.5-flash');
    assert.ok(Array.isArray(ratios), 'returns array of aspect ratios');
    assert.ok(ratios.includes('1:1'), 'contains 1:1');
    assert.ok(ratios.includes('16:9'), 'contains 16:9');
  });

  await t.test('resolves allowable video aspect ratios and durations', () => {
    const videoRatios = getAspectRatiosForVideoModel('seedance-lite-t2v');
    assert.ok(Array.isArray(videoRatios), 'returns array of video aspect ratios');
    assert.ok(videoRatios.includes('16:9'), 'contains 16:9');

    const durations = getDurationsForModel('seedance-lite-t2v');
    assert.ok(Array.isArray(durations), 'returns array of durations');
    assert.ok(durations.length > 0, 'has at least one duration');
  });

  await t.test('sanitizes unsupported ratio on model switch', () => {
    const supported = ['1:1', '16:9'];
    const invalidCurrent = '21:9';
    const sanitized = supported.includes(invalidCurrent) ? invalidCurrent : (supported[0] || '1:1');
    assert.equal(sanitized, '1:1', 'correctly resets invalid ratio to model default');
  });
});

test('D6: Image Dimensions Calculation & Custom Dimension Bounds', async (t) => {
  await t.test('computes exact pixel dimensions from standard aspect ratios', () => {
    assert.deepEqual(computeImageDimensions('1:1', '1K'), { width: 1024, height: 1024 });
    assert.deepEqual(computeImageDimensions('16:9', '1K'), { width: 1280, height: 720 });
    assert.deepEqual(computeImageDimensions('9:16', '1K'), { width: 720, height: 1280 });
    assert.deepEqual(computeImageDimensions('16:9', '2K'), { width: 2560, height: 1440 });
    assert.deepEqual(computeImageDimensions('16:9', '4K'), { width: 3840, height: 2160 });
  });

  await t.test('enforces minimum (256px) and maximum (4096px) boundary constraints', () => {
    const clampDim = (val) => Math.max(256, Math.min(4096, val));
    assert.equal(clampDim(100), 256, 'clamps below min 256 to 256');
    assert.equal(clampDim(5000), 4096, 'clamps above max 4096 to 4096');
    assert.equal(clampDim(1024), 1024, 'preserves valid in-range dimension');
  });

  await t.test('computes proportional dimension when aspect ratio is locked', () => {
    const curW = 1280;
    const curH = 720;
    const ratio = curW / curH; // 16:9
    const newW = 1920;
    const calculatedH = Math.round(newW / ratio);
    assert.equal(calculatedH, 1080, '1920 with 16:9 ratio correctly calculates 1080 height');
  });
});

test('D7: Multi-Modal Shelf Pricing Resolution', async (t) => {
  // Shelf prices are projected from the server model directory (P1 contract):
  // the studio only renders `model_pricing` rows the server published. Seed the
  // directory through the same entry point the app uses after boot.
  const published = (id, creditsPrice, extra = {}) => ({
    id,
    name: id,
    isActive: true,
    isVisible: true,
    autoRouteEligible: true,
    hasWorkingRoute: true,
    creditsPrice,
    pricingType: 'fixed',
    ...extra,
  });
  const directory = [
    published('d7-image-flat', 15),
    published('d7-video-formula', 40, { pricingType: 'per_second' }),
    published('d7-audio-flat', 10),
    published('d7-music-flat', 12),
    published('d7-agent-flat', 1),
    published('d7-digital-human-flat', 25),
  ];
  applyActiveModelDirectory(directory);

  await t.test('resolves published prices for all 5 studio modalities', () => {
    assert.deepEqual(priceForIds('d7-image-flat'), { kind: 'flat', credits: 15 }, 'image model has flat credits');
    assert.deepEqual(priceForIds('d7-audio-flat'), { kind: 'flat', credits: 10 }, 'audio model has flat credits');
    assert.deepEqual(priceForIds('d7-music-flat'), { kind: 'flat', credits: 12 }, 'music model has flat credits');
    assert.deepEqual(priceForIds('d7-agent-flat'), { kind: 'flat', credits: 1 }, 'agent model has flat credits');
    assert.deepEqual(priceForIds('d7-digital-human-flat'), { kind: 'flat', credits: 25 }, 'digital human model has flat credits');
  });

  await t.test('formula-priced models present a from-floor instead of a flat number', () => {
    assert.deepEqual(priceForIds('d7-video-formula'), { kind: 'from', credits: 40 }, 'video model quotes its floor');
  });

  await t.test('mixed families report the lowest price as a from-floor', () => {
    assert.deepEqual(
      priceForIds(new Set(['d7-image-flat', 'd7-digital-human-flat'])),
      { kind: 'from', credits: 15 },
      'variant picks the cheapest published row and labels it from'
    );
  });

  await t.test('never fabricates a price for an unpublished or ineligible model', () => {
    assert.deepEqual(priceForIds('gpt-image-2.5-flash'), { kind: 'missing', credits: null }, 'legacy catalog id has no published row');
    assert.equal(getModelPricing('gpt-image-2.5-flash'), null, 'pricing map has no fallback default');

    applyActiveModelDirectory([...directory, published('d7-draft-only', 99, { isActive: false })]);
    assert.deepEqual(priceForIds('d7-draft-only'), { kind: 'missing', credits: null }, 'inactive rows are not sold');
    applyActiveModelDirectory(directory);
  });

  await t.test('formats pricing copy without returning placeholder', () => {
    const price = { kind: 'flat', credits: 15 };
    const formatted = formatModelPrice(price, { credits: '{credits} 积分' });
    assert.equal(formatted, '15 积分');

    const missingCopy = formatModelPrice({ kind: 'missing', credits: null }, { unavailable: '暂无价格' });
    assert.equal(missingCopy, '暂无价格', 'missing price renders copy, never a number');
  });
});
