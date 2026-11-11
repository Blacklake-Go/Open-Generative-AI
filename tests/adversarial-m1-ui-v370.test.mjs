/**
 * Adversarial Stress-Test Suite for UI v3.7.0 Milestone 1
 *
 * M1 Challenger 1 Empirical Challenge Harness
 * Tests:
 * 1. Button 5-state machine (Default, Hover, Active, Focus-Visible, Disabled)
 * 2. Nested radius hierarchy (Modal 20px, Popover 16px, Control 12px, Tooltip 8px, Pill full)
 * 3. Scrim blur (20px diffuse backdrop-blur-xl) & pointer-events safety
 * 4. Anti-hole-punching & child transparency
 * 5. Token compilation and duration/easing ladder
 * 6. Audit of existing E2E test failures
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

describe('M1 Challenger 1: Adversarial Challenge Suite', () => {

  describe('1. Button 5-State Machine Challenge', () => {
    test('Root Button (components/ui/button.jsx) implements all 5 states', () => {
      const code = read('components/ui/button.jsx');

      // State 1: Default / transition & easing
      assert.ok(
        code.includes('transition-[background-color,border-color,color,box-shadow,transform]'),
        'Button must transition transform alongside colors and shadows'
      );
      assert.ok(
        code.includes('duration-fast') && code.includes('ease-standard'),
        'Button must use 120ms standard easing for return transitions'
      );

      // State 2: Hover
      assert.ok(code.includes('hover:bg-brand-hover'), 'Primary button must define hover state');
      assert.ok(code.includes('hover:bg-overlay'), 'Secondary button must define hover state');
      assert.ok(code.includes('hover:bg-wash'), 'Ghost button must define hover state');

      // State 3: Active / Pressed Mechanical Sink (80ms instant)
      assert.ok(
        code.includes('active:scale-[0.98]') && code.includes('active:duration-instant'),
        'Standard button sizes must define active:scale-[0.98] and active:duration-instant'
      );
      assert.ok(
        code.includes('active:scale-95') && code.includes('active:duration-instant'),
        'Icon button sizes must define active:scale-95 and active:duration-instant'
      );

      // State 4: Focus-Visible hairline ring
      assert.ok(
        code.includes('focus-visible:ring-1') &&
        code.includes('focus-visible:ring-brand-ring') &&
        code.includes('focus-visible:ring-offset-2') &&
        code.includes('focus-visible:ring-offset-bg-base'),
        'Button must define 1px hairline brand ring with 2px canvas offset'
      );

      // State 5: Disabled state
      assert.ok(
        code.includes('disabled:pointer-events-none') &&
        code.includes('disabled:opacity-40') &&
        code.includes('disabled:cursor-not-allowed'),
        'Button must disable pointer events, drop opacity to 40% and show cursor-not-allowed'
      );
    });

    test('Studio Button (packages/studio/src/ui/Button.jsx) implements all 5 states', () => {
      const code = read('packages/studio/src/ui/Button.jsx');
      const tokens = read('packages/studio/src/ui/tokens.js');

      // State 1: Default & tokens
      assert.ok(
        tokens.includes('transition-[background-color,border-color,color,box-shadow,transform]'),
        'Studio CONTROL_BASE must transition transform'
      );

      // State 2: Hover
      assert.ok(tokens.includes('hover:bg-overlay'), 'Secondary button must define hover state');
      assert.ok(tokens.includes('hover:bg-wash'), 'Ghost button must define hover state');

      // State 3: Active scale sink
      assert.ok(
        tokens.includes('active:scale-[0.98] active:duration-instant'),
        'CONTROL_BASE must define active:scale-[0.98] active:duration-instant'
      );
      assert.ok(
        tokens.includes('active:scale-95 active:duration-instant'),
        'ICON_CONTROL_BASE must define active:scale-95 active:duration-instant'
      );
      assert.ok(
        code.includes('icon ? ICON_CONTROL_BASE : CONTROL_BASE'),
        'Studio Button must dispatch ICON_CONTROL_BASE when size is icon-based'
      );

      // State 4: Focus-Visible
      assert.ok(
        tokens.includes('focus-visible:ring-brand-ring'),
        'Studio FOCUS_RING must define brand focus ring'
      );

      // State 5: Disabled
      assert.ok(
        tokens.includes('disabled:pointer-events-none') &&
        tokens.includes('disabled:opacity-40'),
        'Studio CONTROL_BASE must enforce disabled styles'
      );
    });

    test('IconButton adheres to WCAG 2.5.3 and 5% active mechanical depression', () => {
      const rootCode = read('components/ui/button.jsx');
      const studioCode = read('packages/studio/src/ui/Button.jsx');

      // Root IconButton
      assert.ok(rootCode.includes('const IconButton'), 'Root must export IconButton');
      assert.ok(rootCode.includes('WCAG 2.5.3'), 'Root IconButton must document WCAG compliance');
      assert.ok(rootCode.includes('accessibleLabel = label || ariaLabel'), 'Root IconButton must require label');
      assert.ok(rootCode.includes('[&_svg]:size-4 [&_svg]:stroke-[1.8]'), 'Root IconButton must constraint SVG icon size');

      // Studio IconButton
      assert.ok(studioCode.includes('export const IconButton'), 'Studio must export IconButton');
      assert.ok(studioCode.includes('aria-label={label}'), 'Studio IconButton must bind aria-label');
      assert.ok(studioCode.includes('ICON_CONTROL_BASE'), 'Studio IconButton must use ICON_CONTROL_BASE');
    });
  });

  describe('2. Radius Hierarchy Stress-Test', () => {
    test('Modal shell strictly adheres to 20px radius (rounded-2xl)', () => {
      const dialog = read('components/ui/dialog.jsx');
      const alertDialog = read('components/ui/alert-dialog.jsx');
      const overlayTokens = read('packages/studio/src/ui/tokens.js');

      assert.ok(dialog.includes('rounded-2xl'), 'DialogContent must use rounded-2xl (20px)');
      assert.ok(alertDialog.includes('rounded-2xl'), 'AlertDialogContent must use rounded-2xl (20px)');
      assert.ok(overlayTokens.includes('rounded-2xl'), 'MODAL_PANEL must use rounded-2xl (20px)');

      // Footer matching
      assert.ok(alertDialog.includes('rounded-b-2xl'), 'AlertDialogFooter must use rounded-b-2xl to match outer shell');
    });

    test('Popover and DropdownMenu shells strictly adhere to 16px radius (rounded-xl)', () => {
      const dropdown = read('components/ui/dropdown-menu.jsx');
      const overlayTokens = read('packages/studio/src/ui/tokens.js');

      assert.ok(dropdown.includes('rounded-xl'), 'DropdownMenuContent must use rounded-xl (16px)');
      assert.ok(overlayTokens.includes("OVERLAY_PANEL ="), 'Overlay tokens must define OVERLAY_PANEL');
      assert.ok(overlayTokens.includes('rounded-xl'), 'OVERLAY_PANEL must specify rounded-xl (16px)');
    });

    test('Interactive controls strictly adhere to 12px radius (rounded-lg)', () => {
      const tokens = read('packages/studio/src/ui/tokens.js');
      const button = read('components/ui/button.jsx');

      assert.ok(tokens.includes("md: 'rounded-lg'"), 'Default md control radius must be rounded-lg (12px)');
      assert.ok(tokens.includes("lg: 'rounded-lg'"), 'Lg control radius must be rounded-lg (12px)');
      assert.ok(button.includes('md: "rounded-lg"'), 'Root Button md radius must be rounded-lg (12px)');
    });

    test('Tooltips strictly adhere to micro-geometry 8px radius (rounded-md)', () => {
      const tooltip = read('components/ui/tooltip.jsx');
      assert.ok(tooltip.includes('rounded-md'), 'TooltipContent must use rounded-md (8px)');
      assert.ok(tooltip.includes('px-2.5 py-1'), 'TooltipContent must use micro-padding px-2.5 py-1');
      assert.ok(tooltip.includes('text-caption font-medium'), 'TooltipContent must use caption font');
      assert.ok(tooltip.includes('shadow-elevation-2'), 'TooltipContent must use shadow-elevation-2');
    });

    test('Segmented controls strictly adhere to Pill capsule (rounded-full)', () => {
      const imagePopover = read('packages/studio/src/components/ImageSpecPopover.jsx');
      const videoPopover = read('packages/studio/src/components/VideoSpecPopover.jsx');
      const tokens = read('packages/studio/src/ui/tokens.js');

      assert.ok(imagePopover.includes('data-pill-segmented'), 'ImageSpecPopover must mark track with data-pill-segmented');
      assert.ok(imagePopover.includes('rounded-full bg-well'), 'ImageSpecPopover segmented track must use rounded-full');
      assert.ok(imagePopover.includes('data-pill-segment-item'), 'ImageSpecPopover item must have data-pill-segment-item');

      assert.ok(videoPopover.includes('data-pill-segmented'), 'VideoSpecPopover must mark track with data-pill-segmented');
      assert.ok(videoPopover.includes('rounded-full bg-well'), 'VideoSpecPopover segmented track must use rounded-full');

      assert.ok(tokens.includes('PILL_SEGMENT_TRACK'), 'tokens.js must define PILL_SEGMENT_TRACK');
      assert.ok(tokens.includes('rounded-full'), 'PILL_SEGMENT_TRACK must use rounded-full');
    });

    test('Drawer side sheet enforces asymmetric docking radii', () => {
      const overlay = read('packages/studio/src/ui/Overlay.jsx');
      const tokens = read('packages/studio/src/ui/tokens.js');

      // Right drawer docked edge has rounded-r-none
      assert.ok(overlay.includes('rounded-l-2xl rounded-r-none'), 'Right drawer must use rounded-l-2xl rounded-r-none');
      // Left drawer docked edge has rounded-l-none
      assert.ok(overlay.includes('rounded-r-2xl rounded-l-none'), 'Left drawer must use rounded-r-2xl rounded-l-none');
      // Bottom sheet docked edge has rounded-b-none
      assert.ok(overlay.includes('rounded-t-2xl rounded-b-none'), 'Bottom sheet must use rounded-t-2xl rounded-b-none');

      // SHEET_PANEL base should not have symmetrical rounded-2xl
      assert.ok(!tokens.includes("'fixed z-modal flex flex-col rounded-2xl border-line-strong"), 'SHEET_PANEL must not enforce symmetrical rounded-2xl');
    });
  });

  describe('3. Scrim Blur & Pointer-Events Safety Challenge', () => {
    test('Dialog and AlertDialog scrims specify 20px diffuse blur and pointer safety', () => {
      const dialog = read('components/ui/dialog.jsx');
      const alertDialog = read('components/ui/alert-dialog.jsx');
      const tokens = read('packages/studio/src/ui/tokens.js');

      for (const [name, content] of [
        ['DialogOverlay', dialog],
        ['AlertDialogOverlay', alertDialog],
        ['Studio SCRIM', tokens],
      ]) {
        assert.ok(content.includes('bg-scrim'), `${name} must specify bg-scrim`);
        assert.ok(content.includes('backdrop-blur-xl'), `${name} must specify 20px blur (backdrop-blur-xl)`);
        assert.ok(content.includes('data-[state=closed]:pointer-events-none'), `${name} must disable pointer events when closed`);
        assert.ok(content.includes('data-[state=open]:pointer-events-auto'), `${name} must enable pointer events when open`);
      }
    });

    test('Overlay panels disable pointer events when closed', () => {
      const dialog = read('components/ui/dialog.jsx');
      const alertDialog = read('components/ui/alert-dialog.jsx');

      assert.ok(
        dialog.includes('data-[state=closed]:pointer-events-none'),
        'DialogContent must disable pointer events when closed'
      );
      assert.ok(
        alertDialog.includes('data-[state=closed]:pointer-events-none'),
        'AlertDialogContent must disable pointer events when closed'
      );
    });
  });

  describe('4. Anti-Hole-Punching & Child Transparency Challenge', () => {
    test('DropdownMenuItem enforces child transparency with [&_*]:bg-transparent', () => {
      const dropdown = read('components/ui/dropdown-menu.jsx');
      assert.ok(
        dropdown.includes('bg-transparent') && dropdown.includes('[&_*]:bg-transparent'),
        'DropdownMenuItem must enforce bg-transparent and child transparency [&_*]:bg-transparent'
      );
    });

    test('MegaMenuPanel in navigation enforces transparent title rows (anti-hole-punching)', () => {
      const megaPanel = read('components/navigation/MegaMenuPanel.js');
      assert.ok(
        !megaPanel.includes('flex items-center gap-1.5 bg-overlay'),
        'Title row in MegaMenuPanel must not hardcode bg-overlay'
      );
      assert.ok(
        megaPanel.includes('hover:bg-wash-strong'),
        'MegaMenuPanel item must use hover:bg-wash-strong for smooth micro-lighting'
      );
    });
  });

  describe('5. Inverted Switch Color Bug Verification', () => {
    test('Switch track is brand magenta when checked and knob is pure white', () => {
      const field = read('packages/studio/src/ui/Field.jsx');

      assert.ok(
        field.includes('data-[state=checked]:bg-brand') &&
        field.includes('data-[state=checked]:border-brand') &&
        field.includes('data-[state=checked]:shadow-elevation-brand'),
        'Switch checked track must be brand magenta with elevation-brand shadow'
      );
      assert.ok(
        field.includes('bg-white shadow-md'),
        'Switch knob thumb must be pure white'
      );
      assert.ok(
        field.includes('data-[state=checked]:translate-x-5'),
        'Switch knob travel must be translate-x-5'
      );
    });
  });

  describe('6. Red Line Invariant Zero Modification Challenge', () => {
    test('docs/背景动效规范.md matches baseline hash exactly', () => {
      const content = read('docs/背景动效规范.md');
      const hash = crypto.createHash('sha256').update(content).digest('hex');
      const expected = 'd0cec997bbba71dfbdbf07fe9e1b17b0013c69081ce6dd6873dc923a31bf54b5';
      assert.equal(hash, expected, 'docs/背景动效规范.md SHA256 must match exactly');
    });
  });

  describe('7. Discrepancy & Defect Investigation: Test Suite Failure T1-F1-4', () => {
    test('Empirical check: T1-F1-4 in tests/e2e/ui-v370/tier1-features.mjs succeeds on packages/studio/src/ui/tokens.js', () => {
      const studioTokens = read('packages/studio/src/ui/tokens.js');
      const hasRingBrandRing = studioTokens.includes('focus-visible:ring-brand-ring');
      const hasBorderBrand = studioTokens.includes('focus-visible:border-brand');

      // The E2E test suite assertion is:
      // assert.ok(studioTokens.includes('focus-visible:ring-brand-ring') && studioTokens.includes('focus-visible:border-brand'))
      assert.ok(hasRingBrandRing, 'studioTokens has focus-visible:ring-brand-ring');
      assert.equal(
        hasBorderBrand,
        true,
        'EMPIRICAL VERIFICATION CONFIRMED: packages/studio/src/ui/tokens.js includes focus-visible:border-brand'
      );
    });
  });
});
