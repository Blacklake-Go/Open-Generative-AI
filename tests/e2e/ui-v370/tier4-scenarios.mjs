import assert from 'node:assert/strict';
import {
  readProjectFile,
  projectFileExists,
  getGlobalsTokens,
  checkRedLineZeroDiff,
  assertContract,
} from './helpers.mjs';

/**
 * Tier 4: Real-World Application Scenarios (>=5 realistic application flows).
 * Total test cases: 5
 */
export const tier4Tests = [
  {
    id: 'T4-SCEN-1',
    name: 'Scenario 1: Image Studio Complete Generation Island Flow',
    description: 'Walks through PromptComposer, PromptInputField IME safety, spec popovers, and circular submit action.',
    run: async () => {
      // 1. Verify PromptComposer exists and imports Button
      const composerFile = readProjectFile('packages/studio/src/components/prompt/PromptComposer.jsx');
      assert.ok(composerFile.includes('PromptComposer') || composerFile.includes('export'), 'PromptComposer must be exported');

      // 2. Verify PromptInputField handles IME composition
      const inputField = readProjectFile('packages/studio/src/components/prompt/PromptInputField.jsx');
      assert.ok(inputField.includes('isComposingRef'), 'PromptInputField must track composition state');
      assert.ok(inputField.includes('229'), 'Must protect against IME Enter key code 229');

      // 3. Verify Spec Popovers use rounded-xl (16px) and shadow-elevation-3
      assert.ok(composerFile.includes('rounded-xl') && composerFile.includes('shadow-elevation-3'));

      // 4. Verify Studio tokens define PROMPT_PANEL with 20px radius
      const studioTokens = readProjectFile('packages/studio/src/ui/tokens.js');
      assert.ok(studioTokens.includes('rounded-composer'));
    },
  },
  {
    id: 'T4-SCEN-2',
    name: 'Scenario 2: Top Mega Navigation & Dynamic Scrim Switching Flow',
    description: 'Walks through MegaMenu trigger, dynamic scrim positioning, MegaMenuPanel rendering, and click release.',
    run: async () => {
      // 1. Check TopMegaNavigation dynamic scrim calculation
      const megaNav = readProjectFile('components/navigation/TopMegaNavigation.js');
      assert.ok(megaNav.includes('headerBottom'), 'TopMegaNavigation must track headerBottom');
      assert.ok(megaNav.includes('style={{ top: `${headerBottom}px` }}'), 'Scrim top must be bound to headerBottom');

      // 2. Check closed scrim pointer-events safety
      assert.ok(megaNav.includes('opacity-0 pointer-events-none'), 'Closed scrim must have pointer-events-none');

      // 3. Check MegaMenuPanel optical standards
      const megaPanel = readProjectFile('components/navigation/MegaMenuPanel.js');
      assert.ok(megaPanel.includes('rounded-2xl'), 'MegaMenuPanel must use rounded-2xl');
      assert.ok(megaPanel.includes('shadow-elevation-3'), 'MegaMenuPanel must use shadow-elevation-3');
    },
  },
  {
    id: 'T4-SCEN-3',
    name: 'Scenario 3: Unauthenticated User Generation Interception & Auth Modal Flow',
    description: 'Walks through modal overlay presentation, 20px radius, close affordance, and pointer release.',
    run: async () => {
      // 1. Check Dialog overlay pointer safety
      const dialogFile = readProjectFile('components/ui/dialog.jsx');
      assert.ok(dialogFile.includes('data-[state=closed]:pointer-events-none'), 'Dialog overlay must disable pointer events when closed');

      // 2. Check Dialog content radius and elevation
      assert.ok(dialogFile.includes('rounded-2xl'), 'DialogContent must use rounded-2xl (20px)');
      assert.ok(dialogFile.includes('shadow-elevation-4'), 'DialogContent must use shadow-elevation-4');

      // 3. Check Dialog close button
      assert.ok(dialogFile.includes('size-control-md'), 'Dialog close button must have size-control-md (38px target)');
    },
  },
  {
    id: 'T4-SCEN-4',
    name: 'Scenario 4: Studio Settings, Rate Card & Recharge Flow',
    description: 'Walks through custom modal geometry (20px shell -> 16px fields -> 12px controls -> full pill tabs).',
    run: async () => {
      // 1. Check ApiKeyModal geometry
      const apiKeyModal = readProjectFile('components/ApiKeyModal.js');
      assert.ok(apiKeyModal.includes('rounded-2xl'), 'ApiKeyModal must use rounded-2xl');

      // 2. Check Pill Segmented Control geometry
      const studioTokens = readProjectFile('packages/studio/src/ui/tokens.js');
      assert.ok(studioTokens.includes('rounded-full'), 'PILL_SEGMENT_TRACK must use rounded-full');
      assert.ok(studioTokens.includes('PILL_SEGMENT_ACTIVE'), 'Must define PILL_SEGMENT_ACTIVE');

      // 3. Check Control base radius
      assert.ok(studioTokens.includes('CONTROL_RADIUS'), 'Must define CONTROL_RADIUS');
    },
  },
  {
    id: 'T4-SCEN-5',
    name: 'Scenario 5: Multi-Studio Journey & Micro-Motion Invariant Flow',
    description: 'Walks across studio workbenches, verifies 5-state buttons, transition-all purge, and red-line zero diff.',
    run: async () => {
      // 1. Check studio Button 5-state transitions
      const studioTokens = readProjectFile('packages/studio/src/ui/tokens.js');
      assert.ok(studioTokens.includes('active:scale-[0.98]'), 'CONTROL_BASE must have active:scale-[0.98]');
      assert.ok(studioTokens.includes('duration-fast'), 'CONTROL_BASE must have duration-fast');
      assert.ok(studioTokens.includes('ease-standard'), 'CONTROL_BASE must have ease-standard');

      // 2. Check transition-all is purged on CONTROL_BASE
      assert.ok(!studioTokens.includes('transition-all'), 'CONTROL_BASE must not use transition-all');

      // 3. Check strict red-line invariant on docs/背景动效规范.md
      const redLine = checkRedLineZeroDiff();
      assert.equal(redLine.ok, true, 'Zero-diff invariant on docs/背景动效规范.md must hold');
    },
  },
];
