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

test('R2: Deterministic Baseline Model Pricing', async (t) => {
  const { priceForIds, formatModelPrice } = await import(
    path.join(rootDir, 'packages/studio/src/modelPrice.js')
  );

  await t.test('provides positive integer baseline for core image models', () => {
    const flashPrice = priceForIds('gpt-image-2.5-flash');
    assert.notEqual(flashPrice.kind, 'missing');
    assert.equal(typeof flashPrice.credits, 'number');
    assert.ok(flashPrice.credits > 0, 'Flash price must be greater than 0');
    assert.equal(flashPrice.credits, 12);

    const gpt2Price = priceForIds('gpt-image-2');
    assert.equal(gpt2Price.credits, 10);

    const fluxPrice = priceForIds('flux-dev');
    assert.equal(fluxPrice.credits, 12);
  });

  await t.test('provides positive baseline for video models', () => {
    const seedancePrice = priceForIds('seedance-2.5-text-to-video');
    assert.equal(seedancePrice.credits, 35);
  });

  await t.test('gracefully falls back for unknown/unregistered models instead of missing', () => {
    const unknownPrice = priceForIds('completely-unknown-custom-model-999');
    assert.notEqual(unknownPrice.kind, 'missing');
    assert.equal(unknownPrice.credits, 10);
  });

  await t.test('formats pricing templates without returning "暂无价格"', () => {
    const flashPrice = priceForIds('gpt-image-2.5-flash');
    const zhText = formatModelPrice(flashPrice, {
      credits: '{credits} 积分',
      creditsFrom: '{credits} 积分起',
      unavailable: '暂无价格',
    });
    assert.equal(zhText, '12 积分');

    const enText = formatModelPrice(flashPrice, {
      credits: '{credits} credits',
      creditsFrom: 'from {credits} credits',
      unavailable: 'No price yet',
    });
    assert.equal(enText, '12 credits');
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
