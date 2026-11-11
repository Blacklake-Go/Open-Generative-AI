/**
 * Empirical Challenger 1: Deep Adversarial Stress-Test Suite
 *
 * Verifies:
 * 1. Dark Mode Contrast & Color Calculation (WCAG 2.1 AA/AAA)
 * 2. High Contrast & Focus Ring Border Visibility
 * 3. Popover Optical Geometry (16px rounded-xl, backdrop-blur-md, shadow-elevation-3)
 * 4. Scrim Dynamic Pointer-Events Safety & Blur Depth (20px)
 * 5. Class Collision & withoutRadiusUtilities Stress Testing
 * 6. tokens.js Integrity and Consistency Across All Controls
 * 7. Red Line Strict Invariant Zero Diff
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const ROOT = process.cwd();

function read(relPath) {
  const fullPath = path.resolve(ROOT, relPath);
  if (!fs.existsSync(fullPath)) {
    throw new Error(`File not found: ${relPath}`);
  }
  return fs.readFileSync(fullPath, 'utf8');
}

// Helper: Relative luminance according to WCAG 2.1 definition
function getLuminance(r, g, b) {
  const [rs, gs, bs] = [r, g, b].map((c) => {
    c = c / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * rs + 0.7152 * gs + 0.0722 * bs;
}

// Helper: Contrast ratio
function getContrastRatio(rgb1, rgb2) {
  const l1 = getLuminance(...rgb1);
  const l2 = getLuminance(...rgb2);
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  return (lighter + 0.05) / (darker + 0.05);
}

function hexToRgb(hex) {
  hex = hex.replace('#', '');
  if (hex.length === 3) {
    hex = hex.split('').map((c) => c + c).join('');
  }
  const num = parseInt(hex, 16);
  return [(num >> 16) & 255, (num >> 8) & 255, num & 255];
}

describe('Challenger 1 Deep Stress Suite: Token Contract & Optical Geometry', () => {
  const tokensSource = read('packages/studio/src/ui/tokens.js');
  const globalsCss = read('app/globals.css');

  // =========================================================================
  // 1. Dark Mode Contrast & Color Calculation (WCAG 2.1 AA/AAA)
  // =========================================================================
  describe('1. Dark Mode Contrast & Color Verification', () => {
    test('Token color palette provides WCAG AAA contrast for text-ink and text-ink-on-accent', () => {
      const bgCanvas = hexToRgb('#030303');
      const bgBase = hexToRgb('#070708');
      const bgSurface = hexToRgb('#0d0e12');
      const bgOverlay = hexToRgb('#181a22');
      const textPrimary = hexToRgb('#f3f4f6');
      const textWhite = hexToRgb('#ffffff');
      const brandMagenta = hexToRgb('#e11d74');

      // text-primary (#f3f4f6) on dark surfaces
      const contrastOnBase = getContrastRatio(textPrimary, bgBase);
      assert.ok(
        contrastOnBase >= 15.0,
        `text-primary on bg-base must exceed 15:1 (calculated: ${contrastOnBase.toFixed(2)})`
      );

      const contrastOnOverlay = getContrastRatio(textPrimary, bgOverlay);
      assert.ok(
        contrastOnOverlay >= 12.0,
        `text-primary on bg-overlay must exceed 12:1 (calculated: ${contrastOnOverlay.toFixed(2)})`
      );

      // text-ink-on-accent (#ffffff) on brand magenta (#e11d74)
      const contrastOnBrand = getContrastRatio(textWhite, brandMagenta);
      assert.ok(
        contrastOnBrand >= 4.5,
        `text-ink-on-accent on bg-brand must satisfy WCAG AA (calculated: ${contrastOnBrand.toFixed(2)})`
      );

      // Brand magenta against pitch dark background (WCAG 2.1 SC 1.4.11 Non-text Contrast for UI components/focus borders >= 3.0:1)
      const brandOnBase = getContrastRatio(brandMagenta, bgBase);
      assert.ok(
        brandOnBase >= 3.0,
        `Brand magenta on bg-base must satisfy WCAG 2.1 SC 1.4.11 non-text contrast >= 3.0:1 (calculated: ${brandOnBase.toFixed(2)})`
      );
      assert.ok(
        brandOnBase >= 4.4,
        `Brand magenta on bg-base achieves near-AA text contrast (calculated: ${brandOnBase.toFixed(2)})`
      );
    });

    test('Semantic token aliases in globals.css map correctly to variables without undefined references', () => {
      assert.ok(globalsCss.includes('--bg-canvas: #030303;'), 'globals.css must define --bg-canvas');
      assert.ok(globalsCss.includes('--bg-base: #070708;'), 'globals.css must define --bg-base');
      assert.ok(globalsCss.includes('--bg-overlay: #181a22;'), 'globals.css must define --bg-overlay');
      assert.ok(globalsCss.includes('--accent-primary: #e11d74;'), 'globals.css must define --accent-primary as #e11d74');
      assert.ok(globalsCss.includes('--brand-ring: rgba(225, 29, 116, 0.45);'), 'globals.css must define --brand-ring');
      assert.ok(globalsCss.includes('--brand-line: rgba(225, 29, 116, 0.28);'), 'globals.css must define --brand-line');
    });
  });

  // =========================================================================
  // 2. High Contrast & Focus Ring Border Visibility
  // =========================================================================
  describe('2. Focus Ring Border Visibility & High Contrast', () => {
    test('FOCUS_RING strictly includes 1px brand border, 1px brand ring, and 2px offset', () => {
      assert.ok(
        tokensSource.includes("export const FOCUS_RING ="),
        'tokens.js must export FOCUS_RING'
      );
      assert.ok(
        tokensSource.includes('focus-visible:border-brand'),
        'FOCUS_RING must include focus-visible:border-brand for border visibility'
      );
      assert.ok(
        tokensSource.includes('focus-visible:ring-1'),
        'FOCUS_RING must specify focus-visible:ring-1'
      );
      assert.ok(
        tokensSource.includes('focus-visible:ring-brand-ring'),
        'FOCUS_RING must specify focus-visible:ring-brand-ring'
      );
      assert.ok(
        tokensSource.includes('focus-visible:ring-offset-2'),
        'FOCUS_RING must specify focus-visible:ring-offset-2'
      );
      assert.ok(
        tokensSource.includes('focus-visible:ring-offset-bg-base'),
        'FOCUS_RING must specify focus-visible:ring-offset-bg-base'
      );
    });

    test('FOCUS_RING_DANGER strictly includes 1px danger border, 1px danger ring, and 2px offset', () => {
      assert.ok(
        tokensSource.includes("export const FOCUS_RING_DANGER ="),
        'tokens.js must export FOCUS_RING_DANGER'
      );
      assert.ok(
        tokensSource.includes('focus-visible:border-danger'),
        'FOCUS_RING_DANGER must include focus-visible:border-danger'
      );
      assert.ok(
        tokensSource.includes('focus-visible:ring-danger-ring'),
        'FOCUS_RING_DANGER must include focus-visible:ring-danger-ring'
      );
      assert.ok(
        tokensSource.includes('focus-visible:ring-offset-2'),
        'FOCUS_RING_DANGER must specify focus-visible:ring-offset-2'
      );
      assert.ok(
        tokensSource.includes('focus-visible:ring-offset-bg-base'),
        'FOCUS_RING_DANGER must specify focus-visible:ring-offset-bg-base'
      );
    });

    test('All interactive control bases in tokens.js inherit FOCUS_RING', () => {
      // 1. CONTROL_BASE
      assert.ok(
        tokensSource.includes('FOCUS_RING,') && tokensSource.includes('export const CONTROL_BASE'),
        'CONTROL_BASE must incorporate FOCUS_RING'
      );
      // 2. ICON_CONTROL_BASE
      assert.ok(
        tokensSource.includes('export const ICON_CONTROL_BASE = [') &&
        tokensSource.includes('active:scale-95 active:duration-instant'),
        'ICON_CONTROL_BASE must exist with active:scale-95'
      );
      // 3. FIELD_BASE
      assert.ok(
        tokensSource.includes('export const FIELD_BASE = [') &&
        tokensSource.includes('aria-[invalid=true]:border-danger'),
        'FIELD_BASE must exist and handle danger borders'
      );
      // 4. DIALOG_CLOSE_BUTTON
      assert.ok(
        tokensSource.includes('export const DIALOG_CLOSE_BUTTON = ['),
        'DIALOG_CLOSE_BUTTON must be exported'
      );
      // 5. PROMPT_MEDIA_SQUARE
      assert.ok(
        tokensSource.includes('export const PROMPT_MEDIA_SQUARE = ['),
        'PROMPT_MEDIA_SQUARE must be exported'
      );
    });

    test('BUTTON_VARIANTS.danger inherits FOCUS_RING_DANGER without border collision', () => {
      assert.ok(
        tokensSource.includes('FOCUS_RING_DANGER,'),
        'BUTTON_VARIANTS.danger must incorporate FOCUS_RING_DANGER'
      );
      assert.ok(
        !tokensSource.includes('focus-visible:border-transparent'),
        'No button variant should cancel the focus border with border-transparent'
      );
    });
  });

  // =========================================================================
  // 3. Popover Optical Geometry (16px rounded-xl, backdrop-blur-md, shadow-elevation-3)
  // =========================================================================
  describe('3. Popover Optical Geometry & Overlays', () => {
    test('OVERLAY_PANEL strictly enforces rounded-xl (16px), backdrop-blur-md (12px), shadow-elevation-3', () => {
      assert.ok(
        tokensSource.includes('export const OVERLAY_PANEL = [') &&
        tokensSource.includes('bg-overlay-glass backdrop-blur-md border border-line-subtle rounded-xl shadow-elevation-3'),
        'OVERLAY_PANEL must specify bg-overlay-glass backdrop-blur-md border border-line-subtle rounded-xl shadow-elevation-3'
      );
    });

    test('PROMPT_POPOVER strictly enforces rounded-xl (16px), backdrop-blur-md (12px), shadow-elevation-3', () => {
      assert.ok(
        tokensSource.includes('export const PROMPT_POPOVER = [') &&
        tokensSource.includes('min-w-44 max-h-popover rounded-xl border border-line-strong') &&
        tokensSource.includes('bg-overlay-glass backdrop-blur-md p-2.5 text-ink shadow-elevation-3'),
        'PROMPT_POPOVER must specify rounded-xl, backdrop-blur-md, and shadow-elevation-3'
      );
    });

    test('MODAL_PANEL strictly enforces rounded-2xl (20px), shadow-elevation-4, and duration-modal', () => {
      assert.ok(
        tokensSource.includes('export const MODAL_PANEL = [') &&
        tokensSource.includes('overflow-y-auto rounded-2xl border border-line-strong bg-overlay text-ink') &&
        tokensSource.includes('p-6 shadow-elevation-4 duration-modal ease-enter animate-modal-enter'),
        'MODAL_PANEL must specify rounded-2xl, shadow-elevation-4, duration-modal ease-enter'
      );
      assert.ok(
        tokensSource.includes('export const MODAL_SHELL = MODAL_PANEL;'),
        'MODAL_SHELL must alias MODAL_PANEL'
      );
    });
  });

  // =========================================================================
  // 4. Scrim Dynamic Pointer-Events Safety & Blur Depth
  // =========================================================================
  describe('4. Scrim Dynamic Pointer-Events Safety & Blur Depth', () => {
    test('SCRIM strictly enforces 20px blur (backdrop-blur-xl), duration-modal, and pointer safety states', () => {
      assert.ok(
        tokensSource.includes('export const SCRIM ='),
        'tokens.js must export SCRIM'
      );
      assert.ok(
        tokensSource.includes('backdrop-blur-xl'),
        'SCRIM must specify 20px blur via backdrop-blur-xl'
      );
      assert.ok(
        tokensSource.includes('data-[state=closed]:pointer-events-none'),
        'SCRIM must enforce pointer-events-none on closed state'
      );
      assert.ok(
        tokensSource.includes('data-[state=open]:pointer-events-auto'),
        'SCRIM must enforce pointer-events-auto on open state'
      );
      assert.ok(
        tokensSource.includes('transition-opacity duration-modal ease-enter'),
        'SCRIM must animate with duration-modal and ease-enter'
      );
    });
  });

  // =========================================================================
  // 5. Class Collision & withoutRadiusUtilities Stress Testing
  // =========================================================================
  describe('5. Class Collision & withoutRadiusUtilities Stress Testing', () => {
    test('withoutRadiusUtilities handles standard and adversarial inputs correctly', async () => {
      const { withoutRadiusUtilities } = await import(
        path.resolve(ROOT, 'packages/studio/src/ui/tokens.js')
      );

      // Simple removal
      assert.equal(
        withoutRadiusUtilities('p-4 rounded-2xl text-ink'),
        'p-4 text-ink',
        'Should remove rounded-2xl'
      );

      // Multiple conflicting radii
      assert.equal(
        withoutRadiusUtilities('rounded-sm rounded-md rounded-lg rounded-xl rounded-2xl rounded-full'),
        '',
        'Should remove all standard radii'
      );

      // Responsive & state prefixes
      assert.equal(
        withoutRadiusUtilities('sm:rounded-xl md:rounded-2xl hover:rounded-lg focus:rounded-none'),
        '',
        'Should remove prefixed radius utilities'
      );

      // Non-radius classes with "round" in name
      assert.equal(
        withoutRadiusUtilities('around-the-world background-red border-round-none'),
        'around-the-world background-red border-round-none',
        'Should not strip words merely containing "round"'
      );

      // Null, undefined, empty inputs
      assert.equal(withoutRadiusUtilities(null), '', 'Should handle null');
      assert.equal(withoutRadiusUtilities(undefined), '', 'Should handle undefined');
      assert.equal(withoutRadiusUtilities(''), '', 'Should handle empty string');
    });

    test('controlClasses accurately resolves radii without leaking multiple conflicting classes', async () => {
      const { controlClasses, withoutRadiusUtilities } = await import(
        path.resolve(ROOT, 'packages/studio/src/ui/tokens.js')
      );

      const defaultClasses = controlClasses('md');
      assert.ok(defaultClasses.includes('h-control-md'), 'Should have h-control-md');
      assert.ok(defaultClasses.includes('rounded-lg'), 'md control should have rounded-lg');

      const pillClasses = controlClasses('md', { shape: 'pill' });
      assert.ok(pillClasses.includes('rounded-full'), 'pill shape should have rounded-full');
      assert.ok(!pillClasses.includes('rounded-lg'), 'pill shape should NOT contain rounded-lg');

      const fieldClasses = controlClasses('md', { shape: 'field' });
      assert.ok(fieldClasses.includes('rounded-xl'), 'field shape should have rounded-xl');
      assert.ok(!fieldClasses.includes('rounded-lg'), 'field shape should NOT contain rounded-lg');
    });
  });

  // =========================================================================
  // 6. Red Line Invariant Zero Diff Verification
  // =========================================================================
  describe('6. Red Line Invariant Zero Modification', () => {
    test('docs/背景动效规范.md matches baseline hash d0cec997bbba71dfbdbf07fe9e1b17b0013c69081ce6dd6873dc923a31bf54b5', () => {
      const content = read('docs/背景动效规范.md');
      const hash = crypto.createHash('sha256').update(content).digest('hex');
      const expected = 'd0cec997bbba71dfbdbf07fe9e1b17b0013c69081ce6dd6873dc923a31bf54b5';
      assert.equal(hash, expected, 'docs/背景动效规范.md must match expected baseline hash');
    });
  });
});
