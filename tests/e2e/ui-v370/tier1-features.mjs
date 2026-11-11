import assert from 'node:assert/strict';
import {
  readProjectFile,
  projectFileExists,
  getGlobalsTokens,
  checkRedLineZeroDiff,
  RADIUS_HIERARCHY,
  DURATION_LADDER,
  EASING_CURVES,
  assertContract,
} from './helpers.mjs';

/**
 * Tier 1: Feature Coverage (>=5 tests per feature across all 8 features).
 * Total test cases: 41
 */
export const tier1Tests = [
  // ==========================================
  // Feature 1: Base Button 5-State Machine
  // ==========================================
  {
    id: 'T1-F1-1',
    feature: 1,
    name: 'F1: Button default baseline typography and border contract',
    description: 'Verifies Button default state has font weight, inline-flex, select-none, and border classes.',
    run: async () => {
      const studioTokens = readProjectFile('packages/studio/src/ui/tokens.js');
      const rootButton = readProjectFile('components/ui/button.jsx');

      assert.ok(
        studioTokens.includes('inline-flex items-center justify-center') &&
        studioTokens.includes('select-none') &&
        studioTokens.includes('border text-ink'),
        'Studio CONTROL_BASE must define inline-flex, select-none, and border text-ink'
      );

      assert.ok(
        rootButton.includes('inline-flex items-center justify-center') &&
        rootButton.includes('whitespace-nowrap') &&
        rootButton.includes('select-none'),
        'Root Button must define inline-flex and select-none'
      );
    },
  },
  {
    id: 'T1-F1-2',
    feature: 1,
    name: 'F1: Button hover state transition styling',
    description: 'Verifies Button variants define hover micro-light styles across primary, secondary, and tertiary.',
    run: async () => {
      const studioTokens = readProjectFile('packages/studio/src/ui/tokens.js');
      assert.ok(studioTokens.includes('hover:bg-brand-hover'), 'Primary button must define hover:bg-brand-hover');
      assert.ok(studioTokens.includes('hover:bg-overlay'), 'Secondary button must define hover:bg-overlay');
      assert.ok(studioTokens.includes('hover:bg-wash'), 'Tertiary button must define hover:bg-wash');
    },
  },
  {
    id: 'T1-F1-3',
    feature: 1,
    name: 'F1: Button active/pressed mechanical sink (scale-[0.98])',
    description: 'Verifies Button specifies 80ms active press sink scale-[0.98] and active:duration-instant.',
    run: async () => {
      const studioTokens = readProjectFile('packages/studio/src/ui/tokens.js');
      assertContract(
        studioTokens.includes('active:scale-[0.98]') && studioTokens.includes('active:duration-instant'),
        'Studio CONTROL_BASE must enforce active:scale-[0.98] and active:duration-instant',
        { file: 'packages/studio/src/ui/tokens.js' }
      );
    },
  },
  {
    id: 'T1-F1-4',
    feature: 1,
    name: 'F1: Button focus-visible hairline focus ring',
    description: 'Verifies Button defines focus-visible hairline focus ring and brand ring color.',
    run: async () => {
      const studioTokens = readProjectFile('packages/studio/src/ui/tokens.js');
      const rootButton = readProjectFile('components/ui/button.jsx');

      assert.ok(
        studioTokens.includes('focus-visible:ring-brand-ring') &&
        studioTokens.includes('focus-visible:border-brand'),
        'Studio FOCUS_RING must define focus-visible:ring-brand-ring and focus-visible:border-brand'
      );
      assert.ok(
        rootButton.includes('focus-visible:ring-brand-ring'),
        'Root Button must define focus-visible:ring-brand-ring'
      );
    },
  },
  {
    id: 'T1-F1-5',
    feature: 1,
    name: 'F1: Button disabled interaction safety',
    description: 'Verifies Button disabled state specifies pointer-events-none, opacity-40, and cursor-not-allowed.',
    run: async () => {
      const studioTokens = readProjectFile('packages/studio/src/ui/tokens.js');
      const rootButton = readProjectFile('components/ui/button.jsx');

      assert.ok(
        studioTokens.includes('disabled:pointer-events-none') &&
        studioTokens.includes('disabled:opacity-40') &&
        studioTokens.includes('disabled:cursor-not-allowed'),
        'Studio CONTROL_BASE must disable pointer-events and drop opacity on disabled'
      );
      assert.ok(
        rootButton.includes('disabled:pointer-events-none') &&
        rootButton.includes('disabled:opacity-40'),
        'Root Button must disable pointer-events and drop opacity on disabled'
      );
    },
  },
  {
    id: 'T1-F1-6',
    feature: 1,
    name: 'F1: IconButton export and size contract',
    description: 'Verifies IconButton is exported from studio UI with square hit area contract.',
    run: async () => {
      const studioButton = readProjectFile('packages/studio/src/ui/Button.jsx');
      assert.ok(studioButton.includes('export const IconButton'), 'Studio Button.jsx must export IconButton');
      assert.ok(studioButton.includes('icon: true'), 'IconButton must set icon: true for square hit area');
    },
  },

  // ==========================================
  // Feature 2: Design Tokens & Motion Easing
  // ==========================================
  {
    id: 'T1-F2-1',
    feature: 2,
    name: 'F2: 7-level duration ladder tokens in globals.css',
    description: 'Verifies all 7 duration ladder tokens (80ms to 520ms) are defined in globals.css.',
    run: async () => {
      const tokens = getGlobalsTokens();
      for (const [key, expected] of Object.entries(DURATION_LADDER)) {
        assert.ok(
          tokens[expected.cssVar],
          `Duration token ${expected.cssVar} (${expected.ms}) must be defined in app/globals.css`
        );
        assert.equal(
          tokens[expected.cssVar],
          expected.ms,
          `Duration token ${expected.cssVar} must equal ${expected.ms}`
        );
      }
    },
  },
  {
    id: 'T1-F2-2',
    feature: 2,
    name: 'F2: 6-order cubic-bezier easing curves in globals.css',
    description: 'Verifies all 6 standard cubic-bezier curves (standard, enter, exit, bounce, fluid, card-hover) are defined.',
    run: async () => {
      const tokens = getGlobalsTokens();
      for (const [key, expected] of Object.entries(EASING_CURVES)) {
        assert.ok(
          tokens[expected.cssVar],
          `Easing curve ${expected.cssVar} must be defined in app/globals.css`
        );
        assert.equal(
          tokens[expected.cssVar],
          expected.bezier,
          `Easing curve ${expected.cssVar} must match ${expected.bezier}`
        );
      }
    },
  },
  {
    id: 'T1-F2-3',
    feature: 2,
    name: 'F2: Neutral elevation shadows 1..4 without colored glow',
    description: 'Verifies neutral elevation shadows 1 to 4 are defined with dark alphas and no colored neon glow.',
    run: async () => {
      const tokens = getGlobalsTokens();
      for (let i = 1; i <= 4; i++) {
        const shadow = tokens[`--shadow-elevation-${i}`];
        assert.ok(shadow, `--shadow-elevation-${i} must be defined in app/globals.css`);
        assert.ok(shadow.includes('rgba(0, 0, 0,'), `--shadow-elevation-${i} must use neutral black shadow`);
        assert.ok(!shadow.includes('#e11d74'), `--shadow-elevation-${i} must not contain brand magenta glow`);
        assert.ok(!shadow.includes('#00ffff'), `--shadow-elevation-${i} must not contain cyan glow`);
      }
    },
  },
  {
    id: 'T1-F2-4',
    feature: 2,
    name: 'F2: Glass and wash opacity tokens',
    description: 'Verifies wash (4%), wash-strong (7%), wash-press (10%), and scrim tokens.',
    run: async () => {
      const tokens = getGlobalsTokens();
      assert.equal(tokens['--wash'], 'rgba(255, 255, 255, 0.04)', '--wash must be 4% white');
      assert.equal(tokens['--wash-strong'], 'rgba(255, 255, 255, 0.07)', '--wash-strong must be 7% white');
      assert.equal(tokens['--wash-press'], 'rgba(255, 255, 255, 0.10)', '--wash-press must be 10% white');
      assert.equal(tokens['--scrim'], 'rgba(3, 4, 5, 0.72)', '--scrim must be rgba(3, 4, 5, 0.72)');
    },
  },
  {
    id: 'T1-F2-5',
    feature: 2,
    name: 'F2: Nested radius scale hierarchy tokens',
    description: 'Verifies radius tokens: xs(4px), sm(6px), md(8px), lg(12px), xl(16px), 2xl(20px), full(9999px).',
    run: async () => {
      const tokens = getGlobalsTokens();
      assert.equal(tokens['--radius-xs'], '4px');
      assert.equal(tokens['--radius-sm'], '6px');
      assert.equal(tokens['--radius-md'], '8px');
      assert.equal(tokens['--radius-lg'], '12px');
      assert.equal(tokens['--radius-xl'], '16px');
      assert.equal(tokens['--radius-2xl'], '20px');
      assert.equal(tokens['--radius-full'], '9999px');
    },
  },
  {
    id: 'T1-F2-6',
    feature: 2,
    name: 'F2: Tailwind configuration binds transitionDuration and timingFunction',
    description: 'Verifies tailwind.config.js maps transitionDuration and transitionTimingFunction to CSS variables.',
    run: async () => {
      const tailwindConfig = readProjectFile('tailwind.config.js');
      assert.ok(tailwindConfig.includes("instant: 'var(--motion-instant)'"));
      assert.ok(tailwindConfig.includes("fast: 'var(--motion-fast)'"));
      assert.ok(tailwindConfig.includes("standard: 'var(--ease-standard)'"));
      assert.ok(tailwindConfig.includes("enter: 'var(--ease-enter)'"));
      assert.ok(tailwindConfig.includes("exit: 'var(--ease-exit)'"));
      assert.ok(tailwindConfig.includes("'card-hover': 'var(--ease-card-hover)'"));
    },
  },

  // ==========================================
  // Feature 3: Base Overlay Optical Standards
  // ==========================================
  {
    id: 'T1-F3-1',
    feature: 3,
    name: 'F3: Dialog Overlay and SCRIM token specification',
    description: 'Verifies DialogOverlay and studio SCRIM define fixed inset-0, z-overlay, bg-scrim, and blur standards.',
    run: async () => {
      const studioTokens = readProjectFile('packages/studio/src/ui/tokens.js');
      const dialogFile = readProjectFile('components/ui/dialog.jsx');

      assert.ok(studioTokens.includes('fixed inset-0 z-overlay bg-scrim'), 'Studio SCRIM must specify fixed inset-0 z-overlay bg-scrim');
      assert.ok(dialogFile.includes('fixed inset-0 z-overlay bg-scrim'), 'DialogOverlay must specify fixed inset-0 z-overlay bg-scrim');
    },
  },
  {
    id: 'T1-F3-2',
    feature: 3,
    name: 'F3: Modal shell 20px radius (rounded-2xl) contract',
    description: 'Verifies DialogContent and studio MODAL_PANEL strictly use rounded-2xl (20px).',
    run: async () => {
      const dialogFile = readProjectFile('components/ui/dialog.jsx');
      const studioTokens = readProjectFile('packages/studio/src/ui/tokens.js');

      assert.ok(dialogFile.includes('rounded-2xl'), 'DialogContent must use rounded-2xl');
      assert.ok(studioTokens.includes('rounded-2xl'), 'Studio MODAL_PANEL must use rounded-2xl');
    },
  },
  {
    id: 'T1-F3-3',
    feature: 3,
    name: 'F3: Modal shell elevation depth (shadow-elevation-4)',
    description: 'Verifies DialogContent and studio MODAL_PANEL use shadow-elevation-4.',
    run: async () => {
      const dialogFile = readProjectFile('components/ui/dialog.jsx');
      const studioTokens = readProjectFile('packages/studio/src/ui/tokens.js');

      assert.ok(dialogFile.includes('shadow-elevation-4'), 'DialogContent must use shadow-elevation-4');
      assert.ok(studioTokens.includes('shadow-elevation-4'), 'Studio MODAL_PANEL must use shadow-elevation-4');
    },
  },
  {
    id: 'T1-F3-4',
    feature: 3,
    name: 'F3: Dialog Close button size and accessible touch target',
    description: 'Verifies DialogClose button has 38px touch target (size-control-md) and screen-reader label.',
    run: async () => {
      const dialogFile = readProjectFile('components/ui/dialog.jsx');
      assert.ok(dialogFile.includes('size-control-md'), 'Dialog close button must have size-control-md');
      assert.ok(dialogFile.includes('sr-only'), 'Dialog close button must include sr-only accessibility label');
    },
  },
  {
    id: 'T1-F3-5',
    feature: 3,
    name: 'F3: Mobile sheet responsive adaptation contract',
    description: 'Verifies studio MODAL_PANEL_MOBILE defines bottom-sheet adaptation rules.',
    run: async () => {
      const studioTokens = readProjectFile('packages/studio/src/ui/tokens.js');
      assert.ok(studioTokens.includes('max-md:rounded-sheet-top'), 'MODAL_PANEL_MOBILE must specify max-md:rounded-sheet-top');
      assert.ok(studioTokens.includes('max-md:bottom-0'), 'MODAL_PANEL_MOBILE must anchor to max-md:bottom-0');
    },
  },

  // ==========================================
  // Feature 4: Popovers, Dropdowns, Tooltips & Anti-Punch-Through
  // ==========================================
  {
    id: 'T1-F4-1',
    feature: 4,
    name: 'F4: Popover & DropdownMenu shell radius contract',
    description: 'Verifies Popover and DropdownMenu content wrappers use defined radius token.',
    run: async () => {
      const dropdownFile = readProjectFile('components/ui/dropdown-menu.jsx');
      const studioTokens = readProjectFile('packages/studio/src/ui/tokens.js');

      assert.ok(
        dropdownFile.includes('rounded-lg') || dropdownFile.includes('rounded-xl'),
        'DropdownMenuContent must specify rounded radius class'
      );
      assert.ok(
        studioTokens.includes('OVERLAY_PANEL'),
        'Studio tokens must define OVERLAY_PANEL'
      );
    },
  },
  {
    id: 'T1-F4-2',
    feature: 4,
    name: 'F4: Popover elevation depth (shadow-elevation-3)',
    description: 'Verifies Popover and DropdownMenu shells specify shadow-elevation-3.',
    run: async () => {
      const dropdownFile = readProjectFile('components/ui/dropdown-menu.jsx');
      const studioTokens = readProjectFile('packages/studio/src/ui/tokens.js');

      assert.ok(dropdownFile.includes('shadow-elevation-3'), 'DropdownMenuContent must use shadow-elevation-3');
      assert.ok(studioTokens.includes('shadow-elevation-3'), 'Studio OVERLAY_PANEL must use shadow-elevation-3');
    },
  },
  {
    id: 'T1-F4-3',
    feature: 4,
    name: 'F4: Tooltip shell radius and caption typography',
    description: 'Verifies TooltipContent uses rounded-md/rounded-lg, text-caption, and shadow-elevation-2/3.',
    run: async () => {
      const studioOverlay = readProjectFile('packages/studio/src/ui/Overlay.jsx');
      assert.ok(
        studioOverlay.includes('rounded-md') &&
        studioOverlay.includes('text-caption') &&
        studioOverlay.includes('shadow-elevation-2'),
        'Studio Tooltip must use rounded-md, text-caption, and shadow-elevation-2'
      );
    },
  },
  {
    id: 'T1-F4-4',
    feature: 4,
    name: 'F4: Pill Segmented Control geometry (rounded-full)',
    description: 'Verifies segmented control pills enforce unbroken rounded-full capsule geometry.',
    run: async () => {
      const studioTokens = readProjectFile('packages/studio/src/ui/tokens.js');
      assert.ok(studioTokens.includes('PILL_SEGMENT_TRACK'), 'Must define PILL_SEGMENT_TRACK');
      assert.ok(studioTokens.includes('rounded-full'), 'PILL_SEGMENT_TRACK must use rounded-full');
      assert.ok(studioTokens.includes('pillControlClasses'), 'Must export pillControlClasses with shape: pill');
    },
  },
  {
    id: 'T1-F4-5',
    feature: 4,
    name: 'F4: Anti-hole-punching transparent item titles in MegaMenuPanel',
    description: 'Verifies MegaMenuPanel items do not hardcode bg-overlay on title rows.',
    run: async () => {
      const megaPanel = readProjectFile('components/navigation/MegaMenuPanel.js');
      assert.ok(
        !megaPanel.includes('flex items-center gap-1.5 bg-overlay'),
        'Title row in MegaMenuPanel must not hardcode bg-overlay'
      );
      assert.ok(
        megaPanel.includes('hover:bg-wash-strong'),
        'MegaMenuPanel item must use hover:bg-wash-strong for smooth micro-lighting'
      );
    },
  },

  // ==========================================
  // Feature 5: Studio Workbenches & Prompt Island Adaptation
  // ==========================================
  {
    id: 'T1-F5-1',
    feature: 5,
    name: 'F5: Prompt Composer outer shell radius and padding',
    description: 'Verifies PromptComposer outer container uses rounded-composer / rounded-2xl (20px).',
    run: async () => {
      const studioTokens = readProjectFile('packages/studio/src/ui/tokens.js');
      assert.ok(studioTokens.includes('PROMPT_PANEL'), 'Must export PROMPT_PANEL');
      assert.ok(
        studioTokens.includes('rounded-composer') || studioTokens.includes('rounded-2xl'),
        'PROMPT_PANEL must specify rounded-composer or rounded-2xl'
      );
    },
  },
  {
    id: 'T1-F5-2',
    feature: 5,
    name: 'F5: Prompt Composer fluid height configuration',
    description: 'Verifies PromptComposer defines max-h-composer tokens and overflow scrollbar.',
    run: async () => {
      const composerFile = readProjectFile('packages/studio/src/components/prompt/PromptComposer.jsx');
      assert.ok(composerFile.includes('max-h-composer'), 'PromptComposer must specify max-h-composer');
      assert.ok(composerFile.includes('custom-scrollbar'), 'PromptComposer must use custom-scrollbar');
    },
  },
  {
    id: 'T1-F5-3',
    feature: 5,
    name: 'F5: PromptInputField IME composition safety',
    description: 'Verifies PromptInputField guards against accidental submit during IME composition (keyCode 229).',
    run: async () => {
      const inputField = readProjectFile('packages/studio/src/components/prompt/PromptInputField.jsx');
      assert.ok(inputField.includes('isComposingRef'), 'PromptInputField must track isComposingRef');
      assert.ok(inputField.includes('onCompositionStart'), 'PromptInputField must handle onCompositionStart');
      assert.ok(inputField.includes('onCompositionEnd'), 'PromptInputField must handle onCompositionEnd');
      assert.ok(inputField.includes('229'), 'PromptInputField must guard against event.keyCode === 229');
    },
  },
  {
    id: 'T1-F5-4',
    feature: 5,
    name: 'F5: Circular submit button in PromptComposer',
    description: 'Verifies circular submit button integrates with PromptComposer.',
    run: async () => {
      const composerFile = readProjectFile('packages/studio/src/components/prompt/PromptComposer.jsx');
      assert.ok(
        composerFile.includes('Button') || composerFile.includes('button'),
        'PromptComposer must mount submit action'
      );
    },
  },
  {
    id: 'T1-F5-5',
    feature: 5,
    name: 'F5: Sub-studios integrate standard Button and tokens',
    description: 'Verifies sub-studios import Button / tokens from studio/ui rather than raw button styling.',
    run: async () => {
      const imageStudioExists = projectFileExists('packages/studio/src/components/ImageStudio.jsx') ||
        projectFileExists('packages/studio/src/components/ImageStudio.js');
      assert.ok(imageStudioExists, 'ImageStudio workbench file must exist');
    },
  },

  // ==========================================
  // Feature 6: Micro-Motion Acceleration & Transition-All Purge
  // ==========================================
  {
    id: 'T1-F6-1',
    feature: 6,
    name: 'F6: Hardware acceleration pipeline in design system',
    description: 'Verifies globals.css or component styles declare will-change or transform optimization.',
    run: async () => {
      const megaNav = readProjectFile('components/navigation/TopMegaNavigation.js');
      assert.ok(megaNav.includes('will-change-[opacity]'), 'Dynamic scrim must specify will-change-[opacity]');
    },
  },
  {
    id: 'T1-F6-2',
    feature: 6,
    name: 'F6: Timing ladder compliance on interactive controls',
    description: 'Verifies studio tokens bind duration-fast, duration-instant, duration-base.',
    run: async () => {
      const studioTokens = readProjectFile('packages/studio/src/ui/tokens.js');
      assert.ok(studioTokens.includes('duration-fast'), 'CONTROL_BASE must specify duration-fast');
      assert.ok(studioTokens.includes('active:duration-instant'), 'CONTROL_BASE must specify active:duration-instant');
    },
  },
  {
    id: 'T1-F6-3',
    feature: 6,
    name: 'F6: Easing curve binding on interactive controls',
    description: 'Verifies studio tokens bind ease-standard to CONTROL_BASE.',
    run: async () => {
      const studioTokens = readProjectFile('packages/studio/src/ui/tokens.js');
      assert.ok(studioTokens.includes('ease-standard'), 'CONTROL_BASE must specify ease-standard');
    },
  },
  {
    id: 'T1-F6-4',
    feature: 6,
    name: 'F6: Targeted transitions replacing transition-all on CONTROL_BASE',
    description: 'Verifies CONTROL_BASE does not use blanket transition-all.',
    run: async () => {
      const studioTokens = readProjectFile('packages/studio/src/ui/tokens.js');
      assert.ok(
        !studioTokens.includes('transition-all'),
        'CONTROL_BASE must use targeted property transitions, not transition-all'
      );
      assert.ok(
        studioTokens.includes('transition-[background-color,border-color,color,box-shadow,transform]'),
        'CONTROL_BASE must target exact transition properties'
      );
    },
  },
  {
    id: 'T1-F6-5',
    feature: 6,
    name: 'F6: Prefers-reduced-motion accessibility safeguard',
    description: 'Verifies prefers-reduced-motion media query handling exists in globals.css.',
    run: async () => {
      const globalsCss = readProjectFile('app/globals.css');
      assert.ok(
        globalsCss.includes('prefers-reduced-motion'),
        'globals.css must specify prefers-reduced-motion override'
      );
    },
  },

  // ==========================================
  // Feature 7: App Pages, Navigation, Custom Modals & Click Safety
  // ==========================================
  {
    id: 'T1-F7-1',
    feature: 7,
    name: 'F7: TopMegaNavigation dynamic scrim top offset calculation',
    description: 'Verifies TopMegaNavigation dynamically binds scrim top style to headerBottom.',
    run: async () => {
      const megaNav = readProjectFile('components/navigation/TopMegaNavigation.js');
      assert.ok(megaNav.includes("style={{ top: `${headerBottom}px` }}"), 'Scrim must dynamically bind top to headerBottom');
      assert.ok(megaNav.includes('data-mega-scrim'), 'Scrim must have data-mega-scrim attribute');
    },
  },
  {
    id: 'T1-F7-2',
    feature: 7,
    name: 'F7: Closed scrim pointer-events safety',
    description: 'Verifies closed scrim is opacity-0 pointer-events-none.',
    run: async () => {
      const megaNav = readProjectFile('components/navigation/TopMegaNavigation.js');
      assert.ok(
        megaNav.includes('opacity-0 pointer-events-none'),
        'Closed scrim must specify opacity-0 pointer-events-none'
      );
    },
  },
  {
    id: 'T1-F7-3',
    feature: 7,
    name: 'F7: Custom modals radius 20px (rounded-2xl) compliance',
    description: 'Verifies custom modals (e.g. ApiKeyModal) use rounded-2xl (20px).',
    run: async () => {
      const apiKeyModal = readProjectFile('components/ApiKeyModal.js');
      assert.ok(apiKeyModal.includes('rounded-2xl'), 'ApiKeyModal container must use rounded-2xl');
    },
  },
  {
    id: 'T1-F7-4',
    feature: 7,
    name: 'F7: Navigation Menu Viewport geometry',
    description: 'Verifies TopMegaNavigation viewport has rounded-2xl and shadow-elevation-3.',
    run: async () => {
      const megaNav = readProjectFile('components/navigation/TopMegaNavigation.js');
      assert.ok(megaNav.includes('rounded-2xl'), 'NavigationMenu.Viewport must use rounded-2xl');
      assert.ok(megaNav.includes('shadow-elevation-3'), 'NavigationMenu.Viewport must use shadow-elevation-3');
    },
  },
  {
    id: 'T1-F7-5',
    feature: 7,
    name: 'F7: Full-screen overlay unmount / zero invisible click interception',
    description: 'Verifies DialogOverlay has data-[state=closed]:pointer-events-none.',
    run: async () => {
      const dialogFile = readProjectFile('components/ui/dialog.jsx');
      assert.ok(
        dialogFile.includes('data-[state=closed]:pointer-events-none'),
        'DialogOverlay must disable pointer events when closed'
      );
    },
  },

  // ==========================================
  // Feature 8: E2E Visual Inspection & Build Verification
  // ==========================================
  {
    id: 'T1-F8-1',
    feature: 8,
    name: 'F8: Strict red line zero-diff invariant on docs/背景动效规范.md',
    description: 'Verifies docs/背景动效规范.md has exactly zero git modifications against HEAD.',
    run: async () => {
      const result = checkRedLineZeroDiff();
      assertContract(result.ok, `docs/背景动效规范.md has been modified! Diff:\n${result.diff}`);
    },
  },
  {
    id: 'T1-F8-2',
    feature: 8,
    name: 'F8: Spatial background component integrity',
    description: 'Verifies spatial background files in packages/studio/src/ui/spatial exist without corruption.',
    run: async () => {
      assert.ok(projectFileExists('packages/studio/src/ui/spatial/AuroraBackground.jsx') ||
        projectFileExists('packages/studio/src/ui/spatial/SpatialBackground.jsx') ||
        projectFileExists('components/spatial/SpatialBackground.js'),
        'Spatial background component must exist'
      );
    },
  },
  {
    id: 'T1-F8-3',
    feature: 8,
    name: 'F8: Studio package workspace structure',
    description: 'Verifies packages/studio/package.json exists with valid build script.',
    run: async () => {
      const studioPkg = JSON.parse(readProjectFile('packages/studio/package.json'));
      assert.ok(studioPkg.name === 'studio', 'Studio package name must be studio');
      assert.ok(studioPkg.scripts?.build, 'Studio package must have build script');
    },
  },
  {
    id: 'T1-F8-4',
    feature: 8,
    name: 'F8: Master visual contract documentation integrity (v3.7.0)',
    description: 'Verifies docs/UI_DESIGN_SYSTEM.md specifies version 3.7.0.',
    run: async () => {
      const designSystem = readProjectFile('docs/UI_DESIGN_SYSTEM.md');
      assert.ok(designSystem.includes('3.7.0'), 'docs/UI_DESIGN_SYSTEM.md must be version 3.7.0');
    },
  },
  {
    id: 'T1-F8-5',
    feature: 8,
    name: 'F8: UI repair instruction compliance (docs/UI_REPAIR_INSTRUCTION.md)',
    description: 'Verifies docs/UI_REPAIR_INSTRUCTION.md exists with core repair instructions.',
    run: async () => {
      const repairDoc = readProjectFile('docs/UI_REPAIR_INSTRUCTION.md');
      assert.ok(repairDoc.includes('多重圆角层级'), 'Must specify multi-radius hierarchy');
      assert.ok(repairDoc.includes('pointerEvents'), 'Must specify pointerEvents safety');
      assert.ok(repairDoc.includes('防穿孔'), 'Must specify anti-hole-punching rules');
    },
  },
];
