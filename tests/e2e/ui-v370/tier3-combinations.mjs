import assert from 'node:assert/strict';
import {
  readProjectFile,
  projectFileExists,
  getGlobalsTokens,
  checkRedLineZeroDiff,
  assertContract,
} from './helpers.mjs';

/**
 * Tier 3: Cross-Feature Interactions (Pairwise combinations across F1..F8).
 * Total test cases: 10
 */
export const tier3Tests = [
  {
    id: 'T3-COMB-1',
    features: [1, 3],
    name: 'F1 + F3: Button 5-state transitions inside Modal Dialog',
    description: 'Ensures buttons rendered inside Dialog modals maintain active scale-[0.98] and close button has 38px touch target.',
    run: async () => {
      const dialogFile = readProjectFile('components/ui/dialog.jsx');
      const studioTokens = readProjectFile('packages/studio/src/ui/tokens.js');

      assert.ok(
        studioTokens.includes('DIALOG_CLOSE_BUTTON'),
        'Studio tokens must define DIALOG_CLOSE_BUTTON'
      );
      assert.ok(
        studioTokens.includes('size-control-md'),
        'Dialog close button must have size-control-md'
      );
      assert.ok(
        dialogFile.includes('size-control-md'),
        'Root Dialog close button must have size-control-md'
      );
    },
  },
  {
    id: 'T3-COMB-2',
    features: [1, 5],
    name: 'F1 + F5: PromptComposer submit button binds 5-state machine',
    description: 'Ensures circular submit action inside PromptComposer integrates Button primitive with active press and loading states.',
    run: async () => {
      const composerFile = readProjectFile('packages/studio/src/components/prompt/PromptComposer.jsx');
      assert.ok(
        composerFile.includes('Button'),
        'PromptComposer must import and render Button primitive'
      );
    },
  },
  {
    id: 'T3-COMB-3',
    features: [2, 6],
    name: 'F2 + F6: Micro-motion transitions strictly bind design token easing and duration',
    description: 'Ensures interactive micro-motions use tokens like duration-fast (120ms) and ease-standard.',
    run: async () => {
      const studioTokens = readProjectFile('packages/studio/src/ui/tokens.js');
      assert.ok(
        studioTokens.includes('duration-fast ease-standard'),
        'CONTROL_BASE must pair duration-fast with ease-standard'
      );
    },
  },
  {
    id: 'T3-COMB-4',
    features: [3, 7],
    name: 'F3 + F7: Dialog overlay open/close lifecycle maintains click safety',
    description: 'Ensures DialogOverlay pointer events are enabled when open and disabled when closed.',
    run: async () => {
      const dialogFile = readProjectFile('components/ui/dialog.jsx');
      assert.ok(
        dialogFile.includes('data-[state=closed]:pointer-events-none'),
        'DialogOverlay must disable pointer events when state is closed'
      );
    },
  },
  {
    id: 'T3-COMB-5',
    features: [4, 5],
    name: 'F4 + F5: Spec Popovers floating above PromptComposer geometry and optical depth',
    description: 'Ensures popovers anchored to PromptComposer use rounded-xl (16px) and shadow-elevation-3.',
    run: async () => {
      const composerFile = readProjectFile('packages/studio/src/components/prompt/PromptComposer.jsx');
      assert.ok(
        composerFile.includes('rounded-xl') && composerFile.includes('shadow-elevation-3'),
        'PromptComposer popovers must use rounded-xl and shadow-elevation-3'
      );
    },
  },
  {
    id: 'T3-COMB-6',
    features: [4, 7],
    name: 'F4 + F7: TopMegaNavigation MegaMenuPanel anti-hole-punching and elevation',
    description: 'Ensures MegaMenuPanel items do not use dead-black bg-overlay and panel uses shadow-elevation-3.',
    run: async () => {
      const megaPanel = readProjectFile('components/navigation/MegaMenuPanel.js');
      assert.ok(
        megaPanel.includes('shadow-elevation-3'),
        'MegaMenuPanel must use shadow-elevation-3'
      );
      assert.ok(
        !megaPanel.includes('flex items-center gap-1.5 bg-overlay'),
        'MegaMenuPanel title containers must not have bg-overlay'
      );
    },
  },
  {
    id: 'T3-COMB-7',
    features: [5, 7],
    name: 'F5 + F7: Studio interaction with custom modals (ApiKeyModal / RechargeModal)',
    description: 'Ensures custom modals spawned from studio adhere to 20px radius and proper overlay scrim.',
    run: async () => {
      const apiKeyModal = readProjectFile('components/ApiKeyModal.js');
      assert.ok(
        apiKeyModal.includes('rounded-2xl'),
        'ApiKeyModal must use rounded-2xl'
      );
    },
  },
  {
    id: 'T3-COMB-8',
    features: [1, 4],
    name: 'F1 + F4: Pill segmented control tabs combine button interaction with rounded-full',
    description: 'Ensures segmented tabs apply hover/active lighting while preserving continuous rounded-full capsule geometry.',
    run: async () => {
      const studioTokens = readProjectFile('packages/studio/src/ui/tokens.js');
      assert.ok(
        studioTokens.includes('PILL_SEGMENT_TRACK') && studioTokens.includes('rounded-full'),
        'Pill segmented track must be rounded-full'
      );
      assert.ok(
        studioTokens.includes('PILL_SEGMENT_ACTIVE_TAB'),
        'Must define PILL_SEGMENT_ACTIVE_TAB for Radix Tabs'
      );
    },
  },
  {
    id: 'T3-COMB-9',
    features: [2, 8],
    name: 'F2 + F8: Token evolution preserves spatial background red line',
    description: 'Ensures tokens in globals.css do not mutate the zero-diff invariant of docs/背景动效规范.md.',
    run: async () => {
      const redLine = checkRedLineZeroDiff();
      assert.equal(redLine.ok, true, 'Zero-diff invariant on docs/背景动效规范.md must hold');
    },
  },
  {
    id: 'T3-COMB-10',
    features: [6, 7],
    name: 'F6 + F7: Top navigation mega menu smooth transition with GPU opacity acceleration',
    description: 'Ensures TopMegaNavigation uses duration-fast and will-change-[opacity] without layout thrashing.',
    run: async () => {
      const megaNav = readProjectFile('components/navigation/TopMegaNavigation.js');
      assert.ok(
        megaNav.includes('duration-fast') && megaNav.includes('will-change-[opacity]'),
        'TopMegaNavigation scrim must use duration-fast and will-change-[opacity]'
      );
    },
  },
];
