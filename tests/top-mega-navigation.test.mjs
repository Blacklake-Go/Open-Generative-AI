import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const projectRoot = process.cwd();

test('TopMegaNavigation adheres to non-capsule architecture and design tokens', () => {
  const topNavPath = path.join(projectRoot, 'components/navigation/TopMegaNavigation.js');
  const topNavContent = fs.readFileSync(topNavPath, 'utf8');

  // 1. Zero rounded-full in container, tabs, links, or triggers
  assert.doesNotMatch(
    topNavContent,
    /rounded-full/,
    'TopMegaNavigation must completely eliminate rounded-full',
  );

  // 2. Uses rounded-lg for links and triggers
  assert.match(
    topNavContent,
    /rounded-lg/,
    'TopMegaNavigation must use rounded-lg (12px)',
  );

  // 3. Eliminates PILL_SEGMENT_ACTIVE and PILL_SEGMENT_IDLE
  assert.doesNotMatch(
    topNavContent,
    /PILL_SEGMENT_ACTIVE/,
    'TopMegaNavigation must eliminate PILL_SEGMENT_ACTIVE stark white pill',
  );
  assert.doesNotMatch(
    topNavContent,
    /PILL_SEGMENT_IDLE/,
    'TopMegaNavigation must eliminate PILL_SEGMENT_IDLE',
  );

  // 4. Quiet neutral surface elevation: active tab gets bg-wash-strong text-ink, idle gets text-ink-muted hover:text-ink hover:bg-wash
  assert.match(
    topNavContent,
    /bg-wash-strong text-ink/,
    'Active tab must use quiet neutral surface elevation (bg-wash-strong text-ink)',
  );
  assert.match(
    topNavContent,
    /text-ink-muted.*hover:bg-wash.*hover:text-ink/,
    'Idle tabs must use neutral hover wash tokens',
  );

  // 5. ChevronDown from lucide-react with exact classes
  assert.match(
    topNavContent,
    /import\s+\{\s*ChevronDown\s*\}\s+from\s+'lucide-react'/,
    'TopMegaNavigation must import ChevronDown from lucide-react',
  );
  assert.match(
    topNavContent,
    /w-3\.5 h-3\.5 ml-1 transition-transform duration-fast group-data-\[state=open\]:rotate-180/,
    'ChevronDown must use tokenized transition and state-open rotation classes',
  );

  // 6. Viewport wrapper: no hardcoded left-0, dynamic translateX with smooth transition
  assert.doesNotMatch(
    topNavContent,
    /<div[^>]*className="[^"]*left-0[^"]*"[^>]*>[\s\S]*?<NavigationMenu\.Viewport/,
    'Viewport wrapper must not use hardcoded left-0',
  );
  assert.match(
    topNavContent,
    /translateX\(\$\{viewportOffset\}px\)/,
    'Viewport wrapper must use dynamic translateX positioning',
  );
  assert.match(
    topNavContent,
    /transition-transform duration-fast ease-standard/,
    'Viewport wrapper must use transition-transform duration-fast ease-standard',
  );
  const paddingMatch = topNavContent.match(/const minPadding = (\d+);/);
  assert.ok(paddingMatch, 'Viewport positioning must define a screen-edge margin');
  assert.ok(Number(paddingMatch[1]) >= 16, 'Viewport positioning must clamp to at least 16px screen margins');
});

test('StudioHeader navigation adheres to non-capsule styling', () => {
  const headerPath = path.join(projectRoot, 'components/site/StudioHeader.js');
  const headerContent = fs.readFileSync(headerPath, 'utf8');

  // Public nav links use rounded-lg
  assert.match(
    headerContent,
    /rounded-lg px-3 py-1\.5 text-xs font-medium transition-colors sm:text-sm/,
    'StudioHeader navigation links must use rounded-lg',
  );
  assert.match(
    headerContent,
    /bg-wash-strong text-ink font-semibold/,
    'StudioHeader active link must use bg-wash-strong text-ink',
  );
});

test('MegaMenuPanel eliminates nested bg-overlay on title rows to ensure overlay consistency', () => {
  const megaPanelPath = path.join(projectRoot, 'components/navigation/MegaMenuPanel.js');
  const megaPanelContent = fs.readFileSync(megaPanelPath, 'utf8');

  // Internal title rows must not have bg-overlay that creates dark patches on hover or against bg-wash
  assert.doesNotMatch(
    megaPanelContent,
    /<div[^>]*class(?:Name)?="[^"]*bg-overlay[^"]*"[^>]*>\s*<span/m,
    'MegaMenuPanel inner title containers must not have hardcoded bg-overlay',
  );

  // Outer container maintains proper surface token
  assert.match(
    megaPanelContent,
    /bg-overlay text-ink shadow-elevation-3/,
    'MegaMenuPanel outer card must maintain bg-overlay and shadow-elevation-3',
  );
});

test('TopMegaNavigation backdrop scrim uses dynamic header height positioning', () => {
  const topNavPath = path.join(projectRoot, 'components/navigation/TopMegaNavigation.js');
  const topNavContent = fs.readFileSync(topNavPath, 'utf8');

  // Must not hardcode top-14 in scrim class
  assert.doesNotMatch(
    topNavContent,
    /data-mega-scrim[\s\S]*?className="[^"]*top-14[^"]*"/,
    'TopMegaNavigation backdrop scrim must not hardcode top-14',
  );
  assert.match(
    topNavContent,
    /style=\{\{\s*top:\s*`\$\{headerBottom\}px`\s*\}\}/,
    'TopMegaNavigation backdrop scrim must use dynamic headerBottom positioning',
  );
});

test('TopMegaNavigation and JimengAssetCenter eliminate explore (探索) navigation entries', () => {
  const topNavPath = path.join(projectRoot, 'components/navigation/TopMegaNavigation.js');
  const topNavContent = fs.readFileSync(topNavPath, 'utf8');

  assert.doesNotMatch(
    topNavContent,
    /copy\.explore/,
    'TopMegaNavigation must not render explore link',
  );
  assert.doesNotMatch(
    topNavContent,
    /探索入口/,
    'TopMegaNavigation must not contain 探索入口',
  );

  const assetCenterPath = path.join(projectRoot, 'components/assets/JimengAssetCenter.jsx');
  const assetCenterContent = fs.readFileSync(assetCenterPath, 'utf8');

  assert.doesNotMatch(
    assetCenterContent,
    /title="探索"/,
    'JimengAssetCenter must not contain 探索 link in sidebar',
  );
});

