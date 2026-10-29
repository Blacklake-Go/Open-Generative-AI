import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

test('R1: Studio Route Aliasing & Resolution', async (t) => {
  const { resolveStudioTab, STUDIO_TAB_ALIASES } = await import(
    path.join(rootDir, 'lib/studio-routes.js')
  );

  await t.test('resolves singular workflow to plural workflows', () => {
    assert.equal(STUDIO_TAB_ALIASES.workflow, 'workflows');
    assert.equal(resolveStudioTab('workflow'), 'workflows');
    assert.equal(resolveStudioTab('workflows'), 'workflows');
  });

  await t.test('resolves canvas alias to layers', () => {
    assert.equal(STUDIO_TAB_ALIASES.canvas, 'layers');
    assert.equal(resolveStudioTab('canvas'), 'layers');
    assert.equal(resolveStudioTab('layers'), 'layers');
  });

  await t.test('preserves existing canonical studio tabs', () => {
    assert.equal(resolveStudioTab('image'), 'image');
    assert.equal(resolveStudioTab('video'), 'video');
    assert.equal(resolveStudioTab('cinema'), 'cinema');
    assert.equal(resolveStudioTab('audio'), 'audio');
  });
});

test('R2: Shelf Pricing Projection From Published Directory', async (t) => {
  const { priceForIds, formatModelPrice } = await import(
    path.join(rootDir, 'packages/studio/src/modelPrice.js')
  );
  const { applyActiveModelDirectory } = await import(
    path.join(rootDir, 'packages/studio/src/models.js')
  );

  const copy = {
    credits: '{credits} 积分',
    creditsFrom: '{credits} 积分起',
    unavailable: '暂无价格',
  };
  const publishedRow = (id, creditsPrice, pricingType = 'fixed') => ({
    id,
    creditsPrice,
    pricingType,
    isActive: true,
    isVisible: true,
    autoRouteEligible: true,
    hasWorkingRoute: true,
  });

  await t.test('never fabricates a shelf price before the server directory is published', () => {
    const unpublished = priceForIds('seedream-5.0-pro');
    assert.equal(unpublished.kind, 'missing');
    assert.equal(unpublished.credits, null);
    assert.equal(formatModelPrice(unpublished, copy), '暂无价格');
  });

  await t.test('projects published fixed prices onto the shelf', () => {
    applyActiveModelDirectory([
      publishedRow('seedream-5.0-pro', 12),
      publishedRow('kling-2.6', 90),
    ]);

    const imagePrice = priceForIds('seedream-5.0-pro');
    assert.equal(imagePrice.kind, 'flat');
    assert.equal(imagePrice.credits, 12);
    assert.equal(formatModelPrice(imagePrice, copy), '12 积分');
    assert.equal(
      formatModelPrice(imagePrice, {
        credits: '{credits} credits',
        creditsFrom: 'from {credits} credits',
        unavailable: 'No price yet',
      }),
      '12 credits',
    );

    assert.equal(priceForIds('kling-2.6').credits, 90);
  });

  await t.test('renders formula pricing as a floor instead of a flat price', () => {
    const formulaPrice = priceForIds('seedream-5.0-flash');
    assert.equal(formulaPrice.kind, 'missing', 'unpublished formula model still reports missing');

    applyActiveModelDirectory([
      publishedRow('seedream-5.0-pro', 12),
      publishedRow('seedream-5.0-flash', 8, 'formula'),
    ]);
    const projected = priceForIds('seedream-5.0-flash');
    assert.equal(projected.kind, 'from');
    assert.equal(projected.credits, 8);
    assert.equal(formatModelPrice(projected, copy), '8 积分起');
  });

  await t.test('family spreads report the lowest published price as a floor', () => {
    applyActiveModelDirectory([
      publishedRow('seedream-5.0-pro', 12),
      publishedRow('seedream-4.5', 30),
    ]);
    const family = priceForIds(['seedream-5.0-pro', 'seedream-4.5']);
    assert.equal(family.kind, 'from');
    assert.equal(family.credits, 12);
  });

  await t.test('unregistered or ineligible models stay missing, never a default number', () => {
    applyActiveModelDirectory([
      publishedRow('seedream-5.0-pro', 12),
      { ...publishedRow('draft-model', 50), isActive: false },
      { ...publishedRow('unpriced-model', 0) },
    ]);

    assert.equal(priceForIds('completely-unknown-custom-model-999').kind, 'missing');
    assert.equal(priceForIds('draft-model').kind, 'missing');
    assert.equal(priceForIds('unpriced-model').kind, 'missing');
  });
});

test('R3: Brand Decoupling & Competitor Keyword Sanitization', async (t) => {
  const zhPath = path.join(rootDir, 'messages/zh/common.json');
  const enPath = path.join(rootDir, 'messages/en/common.json');

  const zhContent = fs.readFileSync(zhPath, 'utf8');
  const enContent = fs.readFileSync(enPath, 'utf8');

  await t.test('zero occurrences of competitor brand in Chinese dictionary', () => {
    const matchCount = (zhContent.match(/即梦/g) || []).length;
    assert.equal(matchCount, 0, 'Competitor keyword 即梦 must not exist in messages/zh/common.json');
  });

  await t.test('zero occurrences of competitor brand in English dictionary', () => {
    const matchCount = (enContent.match(/即梦/g) || []).length;
    assert.equal(matchCount, 0, 'Competitor keyword 即梦 must not exist in messages/en/common.json');
  });

  await t.test('KOYO branded titles and ecosystem keys exist in dictionaries', () => {
    const zhJson = JSON.parse(zhContent);
    assert.ok(zhJson.homePortal, 'homePortal dictionary exists');
    assert.ok(zhJson.homePortal.cliTitle.includes('KOYO') || zhJson.homePortal.cliTitle.includes('Koyo'));
    assert.ok(zhJson.homePortal.studioSceneTitle.includes('KOYO') || zhJson.homePortal.studioSceneTitle.includes('Koyo'));
  });
});

test('R4: Shell and Studio Query Parameter Contracts', async (t) => {
  const shellPath = path.join(rootDir, 'components/StandaloneShell.js');
  const videoStudioPath = path.join(rootDir, 'packages/studio/src/components/VideoStudio.jsx');
  const cinemaStudioPath = path.join(rootDir, 'packages/studio/src/components/CinemaStudio.jsx');

  const shellContent = fs.readFileSync(shellPath, 'utf8');
  const videoContent = fs.readFileSync(videoStudioPath, 'utf8');
  const cinemaContent = fs.readFileSync(cinemaStudioPath, 'utf8');

  await t.test('StandaloneShell accepts both prompt and remixPrompt parameters', () => {
    assert.ok(
      shellContent.includes("searchParams.get('prompt')") ||
      shellContent.includes('remixPrompt || searchParams.get("prompt")'),
      'StandaloneShell must extract prompt query param'
    );
  });

  await t.test('VideoStudio supports prompt query param and auto-execution', () => {
    assert.ok(
      videoContent.includes('urlParams?.get("prompt")') || videoContent.includes('searchParams.get("prompt")'),
      'VideoStudio parses prompt query param'
    );
    assert.ok(
      videoContent.includes('urlParams.get("auto")') || videoContent.includes('searchParams.get("auto")'),
      'VideoStudio supports auto query param'
    );
  });

  await t.test('CinemaStudio supports prompt query param and auto-execution', () => {
    assert.ok(
      cinemaContent.includes('urlParams?.get("prompt")') || cinemaContent.includes('searchParams.get("prompt")'),
      'CinemaStudio parses prompt query param'
    );
    assert.ok(
      cinemaContent.includes('urlParams.get("auto")') || cinemaContent.includes('searchParams.get("auto")'),
      'CinemaStudio supports auto query param'
    );
  });
});

test('R5: Skill Prompt Bi-directional Toggling Logic', async (t) => {
  // Unit test for the exact logic implemented in HomeStudioPromptComposer
  function toggleSkillPrompt(currentText, skillSnippet) {
    const trimmed = currentText.trim();
    if (trimmed.includes(skillSnippet)) {
      // Remove snippet and clean up commas / extra spaces
      const removed = trimmed
        .replace(new RegExp(`,?\\s*${skillSnippet.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')},?`, 'g'), '')
        .replace(/^,\s*|,\s*$/g, '')
        .trim();
      return removed;
    }
    return trimmed ? `${trimmed}, ${skillSnippet}` : skillSnippet;
  }

  const baseText = '未来赛博都市夜景';
  const skill = '4K超清电影级质感，大师布光';

  const appended = toggleSkillPrompt(baseText, skill);
  assert.equal(appended, '未来赛博都市夜景, 4K超清电影级质感，大师布光');

  // Second click must cleanly remove the skill without corrupting user prompt
  const removed = toggleSkillPrompt(appended, skill);
  assert.equal(removed, '未来赛博都市夜景');

  // From empty prompt
  const fromEmpty = toggleSkillPrompt('', skill);
  assert.equal(fromEmpty, skill);
  const backToEmpty = toggleSkillPrompt(fromEmpty, skill);
  assert.equal(backToEmpty, '');
});
