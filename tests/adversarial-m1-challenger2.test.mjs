/**
 * Empirical Adversarial Test Suite — Milestone 1 Challenger 2
 * Target: packages/studio/src/ui/tokens.js
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execSync } from 'node:child_process';

const ROOT = process.cwd();

function read(relPath) {
  const fullPath = path.resolve(ROOT, relPath);
  return fs.readFileSync(fullPath, 'utf8');
}

describe('Milestone 1 Challenger 2: Empirical Adversarial Challenge Suite', () => {
  const tokensFileContent = read('packages/studio/src/ui/tokens.js');

  // Dynamically import tokens.js to test runtime exported values
  let tokens;
  test('Runtime import of packages/studio/src/ui/tokens.js succeeds', async () => {
    tokens = await import(path.resolve(ROOT, 'packages/studio/src/ui/tokens.js'));
    assert.ok(tokens, 'tokens module must load successfully');
  });

  describe('1. FOCUS_RING & FOCUS_RING_DANGER Token Formatting and Deduplication', () => {
    test('FOCUS_RING has zero duplicated classes and all focus rules use focus-visible:', () => {
      assert.ok(tokens.FOCUS_RING, 'FOCUS_RING must be exported');
      const classes = tokens.FOCUS_RING.trim().split(/\s+/);

      // Check duplicates
      const uniqueClasses = new Set(classes);
      assert.equal(
        classes.length,
        uniqueClasses.size,
        `FOCUS_RING contains duplicated classes: ${classes.join(' ')}`
      );

      // Check outline neutralization
      assert.ok(classes.includes('outline-none'), 'FOCUS_RING must specify outline-none');

      // Check focus-visible prefixing for all focus-related utilities
      const nonPrefixedFocus = classes.filter(
        c => c !== 'outline-none' && !c.startsWith('focus-visible:')
      );
      assert.deepEqual(
        nonPrefixedFocus,
        [],
        `All focus styles in FOCUS_RING must be prefixed with "focus-visible:", found: ${nonPrefixedFocus.join(', ')}`
      );

      // Check exact expected utilities
      assert.ok(classes.includes('focus-visible:ring-1'), 'Must specify 1px hairline ring');
      assert.ok(classes.includes('focus-visible:ring-brand-ring'), 'Must bind brand ring token');
      assert.ok(classes.includes('focus-visible:ring-offset-2'), 'Must specify 2px ring offset');
      assert.ok(classes.includes('focus-visible:ring-offset-bg-base'), 'Must specify canvas offset color');
      assert.ok(classes.includes('focus-visible:border-brand'), 'Must specify brand border on focus-visible');
    });

    test('FOCUS_RING_DANGER has zero duplicated classes and all focus rules use focus-visible:', () => {
      assert.ok(tokens.FOCUS_RING_DANGER, 'FOCUS_RING_DANGER must be exported');
      const classes = tokens.FOCUS_RING_DANGER.trim().split(/\s+/);

      // Check duplicates
      const uniqueClasses = new Set(classes);
      assert.equal(
        classes.length,
        uniqueClasses.size,
        `FOCUS_RING_DANGER contains duplicated classes: ${classes.join(' ')}`
      );

      // Check outline neutralization
      assert.ok(classes.includes('outline-none'), 'FOCUS_RING_DANGER must specify outline-none');

      // Check focus-visible prefixing
      const nonPrefixedFocus = classes.filter(
        c => c !== 'outline-none' && !c.startsWith('focus-visible:')
      );
      assert.deepEqual(
        nonPrefixedFocus,
        [],
        `All focus styles in FOCUS_RING_DANGER must be prefixed with "focus-visible:", found: ${nonPrefixedFocus.join(', ')}`
      );

      // Check exact expected utilities
      assert.ok(classes.includes('focus-visible:ring-1'), 'Must specify 1px hairline ring');
      assert.ok(classes.includes('focus-visible:ring-danger-ring'), 'Must bind danger ring token');
      assert.ok(classes.includes('focus-visible:ring-offset-2'), 'Must specify 2px ring offset');
      assert.ok(classes.includes('focus-visible:ring-offset-bg-base'), 'Must specify canvas offset color');
      assert.ok(classes.includes('focus-visible:border-danger'), 'Must specify danger border on focus-visible');
    });
  });

  describe('2. OVERLAY_PANEL & PROMPT_POPOVER Optical & Geometric Boundary Checks', () => {
    test('OVERLAY_PANEL strictly couples rounded-xl (16px) with backdrop-blur-md (12px blur)', () => {
      assert.ok(tokens.OVERLAY_PANEL, 'OVERLAY_PANEL must be exported');
      const classes = tokens.OVERLAY_PANEL.trim().split(/\s+/);

      // Radius assertion: strictly rounded-xl (16px)
      assert.ok(
        classes.includes('rounded-xl'),
        `OVERLAY_PANEL must have rounded-xl (16px), got: ${tokens.OVERLAY_PANEL}`
      );
      assert.ok(
        !classes.includes('rounded-lg'),
        'OVERLAY_PANEL must NOT have rounded-lg'
      );
      assert.ok(
        !classes.includes('rounded-2xl'),
        'OVERLAY_PANEL must NOT have rounded-2xl'
      );

      // Blur assertion: strictly backdrop-blur-md (12px)
      assert.ok(
        classes.includes('backdrop-blur-md'),
        `OVERLAY_PANEL must have backdrop-blur-md, got: ${tokens.OVERLAY_PANEL}`
      );
      assert.ok(
        !classes.includes('backdrop-blur-sm'),
        'OVERLAY_PANEL must NOT have backdrop-blur-sm'
      );
      assert.ok(
        !classes.includes('backdrop-blur-xl'),
        'OVERLAY_PANEL must NOT have backdrop-blur-xl'
      );

      // Optical surface and shadow
      assert.ok(classes.includes('bg-overlay-glass'), 'OVERLAY_PANEL must specify bg-overlay-glass');
      assert.ok(classes.includes('shadow-elevation-3'), 'OVERLAY_PANEL must specify shadow-elevation-3');
      assert.ok(classes.includes('border-line-subtle'), 'OVERLAY_PANEL must specify border-line-subtle');
      assert.ok(classes.includes('overflow-hidden'), 'OVERLAY_PANEL must specify overflow-hidden');

      // Deduplication check
      const unique = new Set(classes);
      assert.equal(classes.length, unique.size, 'OVERLAY_PANEL must have no duplicated classes');
    });

    test('PROMPT_POPOVER strictly couples rounded-xl with backdrop-blur-md and shadow-elevation-3', () => {
      assert.ok(tokens.PROMPT_POPOVER, 'PROMPT_POPOVER must be exported');
      const classes = tokens.PROMPT_POPOVER.trim().split(/\s+/);

      assert.ok(classes.includes('rounded-xl'), 'PROMPT_POPOVER must have rounded-xl');
      assert.ok(!classes.includes('rounded-lg'), 'PROMPT_POPOVER must not have rounded-lg');
      assert.ok(classes.includes('backdrop-blur-md'), 'PROMPT_POPOVER must have backdrop-blur-md');
      assert.ok(classes.includes('shadow-elevation-3'), 'PROMPT_POPOVER must have shadow-elevation-3');
      assert.ok(classes.includes('bg-overlay-glass'), 'PROMPT_POPOVER must have bg-overlay-glass');
      assert.ok(classes.includes('min-w-44'), 'PROMPT_POPOVER must have min-w-44 (176px)');
      assert.ok(classes.includes('max-h-popover'), 'PROMPT_POPOVER must have max-h-popover');

      const unique = new Set(classes);
      assert.equal(classes.length, unique.size, 'PROMPT_POPOVER must have no duplicated classes');
    });
  });

  describe('3. Dialog, Modal, Scrim & Sheet Boundaries', () => {
    test('SCRIM strictly defines 20px blur and pointer-events safety on closed state', () => {
      assert.ok(tokens.SCRIM, 'SCRIM must be exported');
      const classes = tokens.SCRIM.trim().split(/\s+/);

      assert.ok(classes.includes('fixed') && classes.includes('inset-0'), 'SCRIM must be fixed inset-0');
      assert.ok(classes.includes('z-overlay'), 'SCRIM must be z-overlay');
      assert.ok(classes.includes('bg-scrim'), 'SCRIM must be bg-scrim');
      assert.ok(classes.includes('backdrop-blur-xl'), 'SCRIM must specify backdrop-blur-xl (20px blur)');
      assert.ok(classes.includes('duration-modal'), 'SCRIM must specify duration-modal (400ms)');
      assert.ok(
        classes.includes('data-[state=closed]:pointer-events-none'),
        'SCRIM must be pointer-events-none when closed to prevent invisible click blocking'
      );
      assert.ok(
        classes.includes('data-[state=open]:pointer-events-auto'),
        'SCRIM must be pointer-events-auto when open'
      );
    });

    test('MODAL_PANEL strictly specifies rounded-2xl (20px) and shadow-elevation-4', () => {
      assert.ok(tokens.MODAL_PANEL, 'MODAL_PANEL must be exported');
      const classes = tokens.MODAL_PANEL.trim().split(/\s+/);

      assert.ok(classes.includes('rounded-2xl'), 'MODAL_PANEL must have rounded-2xl (20px)');
      assert.ok(classes.includes('shadow-elevation-4'), 'MODAL_PANEL must have shadow-elevation-4');
      assert.ok(classes.includes('duration-modal'), 'MODAL_PANEL must have duration-modal');
      assert.ok(classes.includes('animate-modal-enter'), 'MODAL_PANEL must have animate-modal-enter');
    });

    test('SHEET_PANEL deliberately omits symmetric rounded-2xl to allow asymmetric docking', () => {
      assert.ok(tokens.SHEET_PANEL, 'SHEET_PANEL must be exported');
      const classes = tokens.SHEET_PANEL.trim().split(/\s+/);

      assert.ok(!classes.includes('rounded-2xl'), 'SHEET_PANEL base must not include symmetric rounded-2xl');
      assert.ok(classes.includes('backdrop-blur-2xl'), 'SHEET_PANEL must have 40px diffusion (backdrop-blur-2xl)');
      assert.ok(classes.includes('will-change-transform'), 'SHEET_PANEL must have GPU translation hints');
    });
  });

  describe('4. Interactive Control Primitives (CONTROL_BASE & ICON_CONTROL_BASE)', () => {
    test('CONTROL_BASE has no internal class duplicates and satisfies 5-state machine', () => {
      const classes = tokens.CONTROL_BASE.trim().split(/\s+/);
      const unique = new Set(classes);
      assert.equal(
        classes.length,
        unique.size,
        `CONTROL_BASE has duplicated classes: ${classes.join(' ')}`
      );

      assert.ok(classes.includes('active:scale-[0.98]'), 'Must include active:scale-[0.98]');
      assert.ok(classes.includes('active:duration-instant'), 'Must include active:duration-instant');
      assert.ok(classes.includes('focus-visible:border-brand'), 'Must include focus-visible:border-brand');
      assert.ok(classes.includes('disabled:pointer-events-none'), 'Must include disabled:pointer-events-none');
      assert.ok(classes.includes('aria-disabled:pointer-events-none'), 'Must include aria-disabled:pointer-events-none');
    });

    test('ICON_CONTROL_BASE has no internal class duplicates and specifies active:scale-95', () => {
      const classes = tokens.ICON_CONTROL_BASE.trim().split(/\s+/);
      const unique = new Set(classes);
      assert.equal(
        classes.length,
        unique.size,
        `ICON_CONTROL_BASE has duplicated classes: ${classes.join(' ')}`
      );

      assert.ok(classes.includes('active:scale-95'), 'Icon control must include active:scale-95');
      assert.ok(classes.includes('active:duration-instant'), 'Icon control must include active:duration-instant');
    });
  });

  describe('5. Utility Functions: controlClasses and withoutRadiusUtilities', () => {
    test('controlClasses returns exactly one height, one padding, one radius, one font size', () => {
      const resultMd = tokens.controlClasses('md');
      const partsMd = resultMd.split(' ');
      assert.equal(partsMd.length, 4);
      assert.equal(partsMd[0], 'h-control-md');
      assert.equal(partsMd[1], 'px-3');
      assert.equal(partsMd[2], 'rounded-lg');
      assert.equal(partsMd[3], 'text-body');

      const resultPill = tokens.controlClasses('sm', { shape: 'pill' });
      assert.ok(resultPill.includes('rounded-full'), 'Pill shape must result in rounded-full');

      const resultField = tokens.controlClasses('md', { shape: 'field' });
      assert.ok(resultField.includes('rounded-xl'), 'Field shape must result in rounded-xl');
    });

    test('withoutRadiusUtilities cleanly strips all caller rounded-* variants without collateral damage', () => {
      const input = 'bg-surface rounded-none hover:rounded-lg rounded-2xl p-4 text-ink rounded-t-xl rounded-full !rounded-md';
      const output = tokens.withoutRadiusUtilities(input);
      assert.equal(output, 'bg-surface p-4 text-ink');
    });
  });

  describe('6. Red Line Invariant: docs/背景动效规范.md', () => {
    test('docs/背景动效规范.md has zero git diff and exact baseline SHA256', () => {
      const baselineHash = 'd0cec997bbba71dfbdbf07fe9e1b17b0013c69081ce6dd6873dc923a31bf54b5';
      const content = read('docs/背景动效规范.md');
      const currentHash = crypto.createHash('sha256').update(content).digest('hex');
      assert.equal(currentHash, baselineHash, 'docs/背景动效规范.md SHA256 must match exactly');

      const diffOutput = execSync('git diff --exit-code docs/背景动效规范.md', {
        cwd: ROOT,
        encoding: 'utf8',
      });
      assert.equal(diffOutput, '', 'git diff on docs/背景动效规范.md must be completely empty');
    });
  });
});
