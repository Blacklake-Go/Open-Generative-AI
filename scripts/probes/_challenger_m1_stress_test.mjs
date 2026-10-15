import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();

console.log('====================================================');
console.log('M1 CHALLENGER 2: ADVERSARIAL STRESS TEST HARNESS');
console.log('====================================================\n');

let passCount = 0;
let failCount = 0;
const failures = [];

function test(name, fn) {
  try {
    fn();
    console.log(`  ✓ PASS: ${name}`);
    passCount++;
  } catch (err) {
    console.error(`  ✗ FAIL: ${name}`);
    console.error(`    -> ${err.message}`);
    failures.push({ name, error: err.message });
    failCount++;
  }
}

// ---------------------------------------------------------
// SECTION 1: SWITCH COMPONENT STRESS TEST
// ---------------------------------------------------------
console.log('--- Probing Section 1: Switch Primitive & Color Fix ---');

const fieldJsxPath = path.join(ROOT, 'packages/studio/src/ui/Field.jsx');
const fieldJsx = fs.readFileSync(fieldJsxPath, 'utf8');

test('Switch track has rounded-full pill geometry and withoutRadiusUtilities protection', () => {
  assert.ok(fieldJsx.includes("rounded-full border p-1"), 'Switch track must be rounded-full');
  assert.ok(fieldJsx.includes("withoutRadiusUtilities(className)"), 'Switch must sanitize caller radius');
});

test('Switch track checked state uses solid bg-brand + shadow-elevation-brand', () => {
  assert.ok(
    fieldJsx.includes("data-[state=checked]:bg-brand"),
    'Switch checked track must have bg-brand'
  );
  assert.ok(
    fieldJsx.includes("data-[state=checked]:shadow-elevation-brand"),
    'Switch checked track must have shadow-elevation-brand'
  );
  assert.ok(
    fieldJsx.includes("data-[state=checked]:border-brand"),
    'Switch checked track must have border-brand'
  );
});

test('Switch thumb knob is pure white with shadow-md and rounded-full', () => {
  assert.ok(
    fieldJsx.includes("rounded-full bg-white shadow-md"),
    'Switch thumb must have rounded-full bg-white shadow-md'
  );
  assert.ok(
    fieldJsx.includes("pointer-events-none block size-4 translate-x-0"),
    'Switch thumb must be pointer-events-none block size-4 translate-x-0'
  );
  assert.ok(
    fieldJsx.includes("data-[state=checked]:translate-x-5"),
    'Switch thumb must translate-x-5 on checked'
  );
});

test('Switch unchecked track has dark subtle background (not solid brand)', () => {
  assert.ok(
    fieldJsx.includes("border-line-subtle bg-white/10 hover:bg-white/15"),
    'Switch unchecked track must have border-line-subtle bg-white/10'
  );
});

test('Switch disabled state is protected with cursor-not-allowed and opacity-40', () => {
  assert.ok(
    fieldJsx.includes("disabled:cursor-not-allowed disabled:opacity-40"),
    'Switch must disable cursor and drop opacity'
  );
});

// ---------------------------------------------------------
// SECTION 2: DRAWER DOCKING & ASYMMETRIC RADIUS STRESS TEST
// ---------------------------------------------------------
console.log('\n--- Probing Section 2: Drawer Docking Width & Radii ---');

const overlayJsxPath = path.join(ROOT, 'packages/studio/src/ui/Overlay.jsx');
const overlayJsx = fs.readFileSync(overlayJsxPath, 'utf8');

test('Right Drawer has 400px responsive width (sm:w-panel) and asymmetric docking (rounded-l-2xl rounded-r-none)', () => {
  assert.ok(
    overlayJsx.includes("right-0 top-0 h-full w-full sm:w-panel max-w-full border-l rounded-l-2xl rounded-r-none"),
    'Right drawer must dock flush right with 400px panel and rounded-l-2xl rounded-r-none'
  );
});

test('Left Drawer has asymmetric docking (rounded-r-2xl rounded-l-none)', () => {
  assert.ok(
    overlayJsx.includes("left-0 top-0 h-full w-full sm:w-panel max-w-full border-r rounded-r-2xl rounded-l-none"),
    'Left drawer must dock flush left with rounded-r-2xl rounded-l-none'
  );
});

test('Bottom Drawer has asymmetric docking (rounded-t-2xl rounded-b-none)', () => {
  assert.ok(
    overlayJsx.includes("bottom-0 left-0 w-full max-h-drawer border-t rounded-t-2xl rounded-b-none"),
    'Bottom drawer must dock flush bottom with rounded-t-2xl rounded-b-none'
  );
});

test('SHEET_PANEL does NOT specify symmetrical rounded-2xl that would conflict with docking', () => {
  const tokensJs = fs.readFileSync(path.join(ROOT, 'packages/studio/src/ui/tokens.js'), 'utf8');
  const sheetPanelMatch = tokensJs.match(/export const SHEET_PANEL = \[\s*([\s\S]*?)\]\.join/);
  assert.ok(sheetPanelMatch, 'SHEET_PANEL definition must exist');
  assert.ok(!sheetPanelMatch[1].includes('rounded-2xl'), 'SHEET_PANEL must not contain symmetrical rounded-2xl');
});

test('DrawerContent strips caller-provided conflicting radius utilities', () => {
  assert.ok(
    overlayJsx.includes("withoutRadiusUtilities(className)"),
    'DrawerContent must pass className through withoutRadiusUtilities'
  );
});

test('DrawerContent handles outside pointer events and keyboard escape to trigger onClose', () => {
  assert.ok(overlayJsx.includes("onPointerDownOutside"), 'DrawerContent must handle onPointerDownOutside');
  assert.ok(overlayJsx.includes("onEscapeKeyDown"), 'DrawerContent must handle onEscapeKeyDown');
  assert.ok(overlayJsx.includes("Dialog.Overlay className={SCRIM} onClick={onClose}"), 'Drawer backdrop must call onClose');
});

// ---------------------------------------------------------
// SECTION 3: POPOVER SEGMENTED PILLS STRESS TEST
// ---------------------------------------------------------
console.log('\n--- Probing Section 3: Popover Segmented Pills ---');

const imgPopoverPath = path.join(ROOT, 'packages/studio/src/components/ImageSpecPopover.jsx');
const vidPopoverPath = path.join(ROOT, 'packages/studio/src/components/VideoSpecPopover.jsx');
const imgPopover = fs.readFileSync(imgPopoverPath, 'utf8');
const vidPopover = fs.readFileSync(vidPopoverPath, 'utf8');

test('ImageSpecPopover resolution track and items are strictly rounded-full pills', () => {
  assert.ok(
    imgPopover.includes('data-pill-segmented'),
    'ImageSpecPopover must have data-pill-segmented track'
  );
  assert.ok(
    imgPopover.includes('data-pill-segment-item'),
    'ImageSpecPopover must have data-pill-segment-item buttons'
  );
  assert.ok(
    imgPopover.includes('rounded-full bg-well border border-line-subtle'),
    'Resolution track must be rounded-full bg-well'
  );
  assert.ok(
    imgPopover.includes('py-1.5 px-2 rounded-full text-xs font-medium'),
    'Resolution buttons must be rounded-full'
  );
});

test('ImageSpecPopover batch size track and items are strictly rounded-full pills', () => {
  assert.ok(
    imgPopover.includes('grid grid-cols-4 gap-1 p-1 rounded-full bg-well border border-line-subtle'),
    'Batch size track must be rounded-full'
  );
  assert.ok(
    imgPopover.includes('py-1.5 rounded-full text-xs font-medium'),
    'Batch size buttons must be rounded-full'
  );
});

test('VideoSpecPopover resolution track and items are strictly rounded-full pills', () => {
  assert.ok(
    vidPopover.includes('data-pill-segmented'),
    'VideoSpecPopover must have data-pill-segmented track'
  );
  assert.ok(
    vidPopover.includes('data-pill-segment-item'),
    'VideoSpecPopover must have data-pill-segment-item buttons'
  );
  assert.ok(
    vidPopover.includes('grid grid-flow-col auto-cols-fr gap-1 p-1 rounded-full bg-well border border-line-subtle'),
    'Video resolution track must be rounded-full bg-well'
  );
  assert.ok(
    vidPopover.includes('py-1.5 px-2 rounded-full text-xs font-medium'),
    'Video resolution buttons must be rounded-full'
  );
});

// ---------------------------------------------------------
// SECTION 4: BUTTON GHOST VARIANT STRESS TEST
// ---------------------------------------------------------
console.log('\n--- Probing Section 4: Button Ghost Variant & Fallbacks ---');

const rootButtonPath = path.join(ROOT, 'components/ui/button.jsx');
const studioButtonPath = path.join(ROOT, 'packages/studio/src/ui/Button.jsx');
const tokensJsPath = path.join(ROOT, 'packages/studio/src/ui/tokens.js');
const rootButton = fs.readFileSync(rootButtonPath, 'utf8');
const studioButton = fs.readFileSync(studioButtonPath, 'utf8');
const tokensJs = fs.readFileSync(tokensJsPath, 'utf8');

test('Root Button defines ghost variant with transparent background and hover:bg-wash', () => {
  assert.ok(
    rootButton.includes('ghost:\n          "bg-transparent text-ink-muted border border-transparent hover:bg-wash hover:text-ink active:bg-wash-press"') ||
    rootButton.includes('ghost:') && rootButton.includes('bg-transparent text-ink-muted border border-transparent hover:bg-wash'),
    'Root button must define ghost variant with bg-transparent'
  );
});

test('Studio tokens.js defines ghost variant in BUTTON_VARIANTS without falling back to secondary', () => {
  assert.ok(
    tokensJs.includes('ghost: [\n    \'bg-transparent text-ink-muted border-transparent\''),
    'tokens.js BUTTON_VARIANTS must define ghost'
  );
  assert.ok(
    tokensJs.includes('ghost: \'font-medium\''),
    'tokens.js BUTTON_WEIGHT must define ghost'
  );
});

test('Studio Button.jsx resolves ghost variant properly', () => {
  assert.ok(
    studioButton.includes('const variantKey = BUTTON_VARIANTS[variant] ? variant : "secondary";'),
    'Studio Button must check variant against BUTTON_VARIANTS'
  );
});

test('Unsupported variant gracefully falls back to secondary in Studio Button', () => {
  // Simulate variant resolution logic
  const BUTTON_VARIANTS = { primary: '...', secondary: '...', ghost: '...' };
  const resolve = (v) => BUTTON_VARIANTS[v] ? v : 'secondary';
  assert.strictEqual(resolve('ghost'), 'ghost');
  assert.strictEqual(resolve('invalid_variant'), 'secondary');
});

// ---------------------------------------------------------
// SECTION 5: E2E FOCUS RING TEST CONTRACT PROBE
// ---------------------------------------------------------
console.log('\n--- Probing Section 5: Focus Ring & Test Suite Contract ---');

test('Verify Studio FOCUS_RING definition in tokens.js against E2E test requirement', () => {
  const hasRingBrandRing = tokensJs.includes('focus-visible:ring-brand-ring');
  const hasBorderBrand = tokensJs.includes('focus-visible:border-brand');
  console.log(`    info: tokens.js has focus-visible:ring-brand-ring -> ${hasRingBrandRing}`);
  console.log(`    info: tokens.js has focus-visible:border-brand -> ${hasBorderBrand}`);
  assert.ok(
    hasRingBrandRing && hasBorderBrand,
    'T1-F1-4 in test suite expects both focus-visible:ring-brand-ring AND focus-visible:border-brand'
  );
});

// ---------------------------------------------------------
// SUMMARY
// ---------------------------------------------------------
console.log('\n====================================================');
console.log(`STRESS TEST SUMMARY: Total ${passCount + failCount} | Passed: ${passCount} | Failed: ${failCount}`);
if (failCount > 0) {
  console.log('FAILURES ENCOUNTERED:');
  failures.forEach(f => console.log(`  - ${f.name}: ${f.error}`));
}
console.log('====================================================\n');
process.exit(failCount > 0 ? 1 : 0);
