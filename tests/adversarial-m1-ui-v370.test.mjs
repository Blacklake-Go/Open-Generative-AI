/**
 * Adversarial Stress-Test Suite for UI v3.8.0
 *
 * M1 Challenger 1 Empirical Challenge Harness
 * Tests:
 * 1. Button 5-state machine (Default, Hover, Active, Focus-Visible, Disabled)
 * 2. Nested radius hierarchy (Modal 20px, Popover 16px, Control 8px, Tooltip 8px, Pill full)
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
      const globalsCss = read('app/globals.css');

      // State 1: Default / transition & easing
      assert.ok(
        code.includes('transition-[background-color,border-color,color,transform]'),
        'Button must transition transform alongside colours, and must not animate box-shadow'
      );
      assert.ok(
        !code.includes('box-shadow,transform'),
        'Button must not animate box-shadow (v3.8.0 motion contract)'
      );
      assert.ok(
        code.includes('duration-fast') && code.includes('ease-standard'),
        'Button must use 120ms standard easing for return transitions'
      );

      // State 2: Hover
      assert.ok(code.includes('hover:bg-brand-hover-solid'), 'Primary button must define hover state');
      assert.ok(code.includes('hover:bg-overlay'), 'Secondary button must define hover state');
      assert.ok(code.includes('hover:bg-wash'), 'Ghost button must define hover state');

      // State 3: Active / Pressed Mechanical Sink (80ms press duration)
      assert.ok(
        code.includes('active:scale-[0.98]') && code.includes('active:duration-press'),
        'Standard button sizes must define active:scale-[0.98] and active:duration-press'
      );
      assert.ok(
        code.includes('active:scale-[0.96]') && code.includes('active:duration-press'),
        'Icon button sizes must define active:scale-[0.96] and active:duration-press'
      );
      assert.ok(
        !code.includes('active:scale-95'),
        'Icon buttons must use the v3.8.0 [0.96] press, not legacy scale-95'
      );

      // State 4: Focus-Visible hairline outline (single treatment via control-focus)
      assert.ok(
        code.includes('control-focus'),
        'Button must apply the unified control-focus treatment'
      );
      assert.ok(
        globalsCss.includes('.control-focus:focus-visible'),
        'globals.css must define the control-focus:focus-visible outline'
      );
      assert.ok(
        globalsCss.includes('outline: 1px solid color-mix(in srgb, currentColor 36%, transparent)') &&
        globalsCss.includes('outline-offset: 1px'),
        'Focus must be a 1px currentColor-derived hairline with 1px offset'
      );
      assert.ok(
        !code.includes('focus-visible:ring-brand-ring'),
        'Legacy box-shadow brand ring must not return'
      );

      // State 5: Disabled state
      assert.ok(
        code.includes('disabled:pointer-events-none') &&
        code.includes('disabled:opacity-45') &&
        code.includes('disabled:cursor-not-allowed'),
        'Button must disable pointer events, drop opacity to 45% and show cursor-not-allowed'
      );
      assert.ok(
        code.includes('aria-disabled:pointer-events-none') &&
        code.includes('aria-disabled:opacity-45'),
        'asChild buttons must mirror disabled affordances through aria-disabled'
      );
    });

    test('Studio Button (packages/studio/src/ui/Button.jsx) implements all 5 states', () => {
      const code = read('packages/studio/src/ui/Button.jsx');
      const tokens = read('packages/studio/src/ui/tokens.js');
      const globalsCss = read('app/globals.css');

      // State 1: Default & tokens
      assert.ok(
        tokens.includes('transition-[background-color,border-color,color,transform]'),
        'Studio CONTROL_BASE must transition transform without animating box-shadow'
      );

      // State 2: Hover
      assert.ok(tokens.includes('hover:bg-overlay'), 'Secondary button must define hover state');
      assert.ok(tokens.includes('hover:bg-wash'), 'Ghost button must define hover state');

      // State 3: Active scale sink
      assert.ok(
        tokens.includes('active:scale-[0.98] active:duration-press'),
        'CONTROL_BASE must define active:scale-[0.98] active:duration-press'
      );
      assert.ok(
        tokens.includes('active:scale-[0.96] active:duration-press'),
        'ICON_CONTROL_BASE must define active:scale-[0.96] active:duration-press'
      );
      assert.ok(
        code.includes('icon ? ICON_CONTROL_BASE : CONTROL_BASE'),
        'Studio Button must dispatch ICON_CONTROL_BASE when size is icon-based'
      );

      // State 4: Focus-Visible (single treatment via control-focus)
      assert.ok(
        tokens.includes("export const FOCUS_RING = 'control-focus';"),
        'Studio FOCUS_RING must resolve to the unified control-focus class'
      );
      assert.ok(
        globalsCss.includes('.control-focus:focus-visible'),
        'globals.css must define the control-focus:focus-visible outline'
      );
      assert.ok(
        !tokens.includes('focus-visible:ring-brand-ring'),
        'Studio tokens must not reintroduce the legacy box-shadow ring'
      );

      // State 5: Disabled
      assert.ok(
        tokens.includes('disabled:pointer-events-none') &&
        tokens.includes('disabled:opacity-45') &&
        tokens.includes('aria-disabled:opacity-45'),
        'Studio CONTROL_BASE must enforce disabled and aria-disabled styles'
      );
    });

    test('IconButton adheres to WCAG 2.5.3 and 4% active mechanical depression', () => {
      const rootCode = read('components/ui/button.jsx');
      const studioCode = read('packages/studio/src/ui/Button.jsx');

      // Root IconButton
      assert.ok(rootCode.includes('const IconButton'), 'Root must export IconButton');
      assert.ok(rootCode.includes('WCAG 2.5.3'), 'Root IconButton must document WCAG compliance');
      assert.ok(rootCode.includes('accessibleLabel = label || ariaLabel'), 'Root IconButton must require label');
      assert.ok(rootCode.includes('[&_svg]:size-4'), 'Root IconButton must constrain SVG icon size');
      assert.ok(rootCode.includes('strokeWidth={1.8}'), 'Root IconButton must bind icon stroke as a prop');
      assert.ok(!rootCode.includes('[&_svg]:stroke-[1.8]'), 'Stroke weight must not be a utility class');

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

    test('Popover and DropdownMenu shells resolve 16px radius through popover-surface', () => {
      const dropdown = read('components/ui/dropdown-menu.jsx');
      const overlayTokens = read('packages/studio/src/ui/tokens.js');
      const globalsCss = read('app/globals.css');

      assert.ok(dropdown.includes('popover-surface'), 'DropdownMenuContent must use the shared popover-surface');
      assert.ok(!dropdown.includes('rounded-xl'), 'DropdownMenuContent must not carry its own radius utility');
      assert.ok(overlayTokens.includes("OVERLAY_PANEL ="), 'Overlay tokens must define OVERLAY_PANEL');
      assert.ok(overlayTokens.includes('popover-surface'), 'OVERLAY_PANEL must use the shared popover-surface');
      assert.ok(
        globalsCss.includes('.popover-surface') &&
        globalsCss.includes('border-radius: var(--radius-xl)') &&
        globalsCss.includes('box-shadow: var(--shadow-elevation-3)'),
        'globals.css popover-surface must supply the 16px radius and elevation-3 shadow'
      );
      assert.ok(
        globalsCss.includes('--radius-xl: 16px'),
        'Radius token must remain 16px'
      );
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

  describe('7. Discrepancy & Defect Investigation: Unified Focus Treatment', () => {
    test('packages/studio/src/ui/tokens.js binds control-focus and keeps focus-visible:border-brand for fields', () => {
      const studioTokens = read('packages/studio/src/ui/tokens.js');
      const hasControlFocus = studioTokens.includes("export const FOCUS_RING = 'control-focus';");
      const hasBorderBrand = studioTokens.includes('focus-visible:border-brand');

      // v3.8.0 collapses every focus affordance into the single control-focus
      // outline; fields still brighten their border on focus-visible.
      assert.ok(hasControlFocus, 'studioTokens must bind FOCUS_RING to control-focus');
      assert.ok(
        !studioTokens.includes('focus-visible:ring-brand-ring'),
        'studioTokens must not carry the legacy box-shadow ring'
      );
      assert.equal(
        hasBorderBrand,
        true,
        'EMPIRICAL VERIFICATION CONFIRMED: packages/studio/src/ui/tokens.js includes focus-visible:border-brand'
      );
    });
  });
});
