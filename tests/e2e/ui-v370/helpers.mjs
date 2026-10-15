import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import assert from 'node:assert/strict';

export const PROJECT_ROOT = process.cwd();

/**
 * Safely reads a project file relative to repository root.
 */
export function readProjectFile(relPath) {
  const absPath = path.resolve(PROJECT_ROOT, relPath);
  if (!fs.existsSync(absPath)) {
    throw new Error(`Project file not found: ${relPath} (resolved: ${absPath})`);
  }
  return fs.readFileSync(absPath, 'utf8');
}

/**
 * Checks if a project file exists relative to repository root.
 */
export function projectFileExists(relPath) {
  return fs.existsSync(path.resolve(PROJECT_ROOT, relPath));
}

/**
 * Parses CSS custom properties (:root variables) from a CSS string.
 */
export function parseCssVariables(cssContent) {
  const vars = {};
  const rootMatch = cssContent.match(/:root\s*\{([^}]+)\}/s);
  const block = rootMatch ? rootMatch[1] : cssContent;
  
  const regex = /(--[a-zA-Z0-9_-]+)\s*:\s*([^;]+);/g;
  let match;
  while ((match = regex.exec(block)) !== null) {
    vars[match[1].trim()] = match[2].trim();
  }
  return vars;
}

/**
 * Retrieves the parsed globals.css design tokens.
 */
export function getGlobalsTokens() {
  const css = readProjectFile('app/globals.css');
  return parseCssVariables(css);
}

/**
 * Standard UI v3.7.0 Radius Hierarchy contract values.
 */
export const RADIUS_HIERARCHY = {
  MODAL: { token: 'rounded-2xl', px: 20, cssVar: '--radius-2xl' },
  COMPOSER: { token: 'rounded-2xl', px: 20, cssVar: '--radius-2xl' },
  POPOVER: { token: 'rounded-xl', px: 16, cssVar: '--radius-xl' },
  INPUT: { token: 'rounded-xl', px: 16, cssVar: '--radius-xl' },
  CARD: { token: 'rounded-xl', px: 16, cssVar: '--radius-xl' },
  CONTROL: { token: 'rounded-lg', px: 12, cssVar: '--radius-lg' },
  BUTTON: { token: 'rounded-lg', px: 12, cssVar: '--radius-lg' },
  TOOLTIP: { token: 'rounded-md', px: 8, cssVar: '--radius-md' },
  PILL: { token: 'rounded-full', px: 9999, cssVar: '--radius-full' },
};

/**
 * 7-level duration ladder contract values.
 */
export const DURATION_LADDER = {
  INSTANT: { token: 'duration-instant', ms: '80ms', cssVar: '--motion-instant' },
  FAST: { token: 'duration-fast', ms: '120ms', cssVar: '--motion-fast' },
  BASE: { token: 'duration-base', ms: '180ms', cssVar: '--motion-base' },
  SMOOTH: { token: 'duration-smooth', ms: '240ms', cssVar: '--motion-smooth' },
  DRAWER: { token: 'duration-drawer', ms: '300ms', cssVar: '--motion-drawer' },
  DRAWER_LG: { token: 'duration-drawer-lg', ms: '420ms', cssVar: '--motion-drawer-lg' },
  EXPAND: { token: 'duration-expand', ms: '350ms', cssVar: '--motion-expand' },
  MODAL: { token: 'duration-modal', ms: '400ms', cssVar: '--motion-modal' },
  MODAL_LG: { token: 'duration-modal-lg', ms: '520ms', cssVar: '--motion-modal-lg' },
};

/**
 * 6-order cubic-bezier easing curves contract values.
 */
export const EASING_CURVES = {
  STANDARD: { token: 'ease-standard', bezier: 'cubic-bezier(0.16, 1, 0.3, 1)', cssVar: '--ease-standard' },
  ENTER: { token: 'ease-enter', bezier: 'cubic-bezier(0.05, 0.7, 0.1, 1)', cssVar: '--ease-enter' },
  EXIT: { token: 'ease-exit', bezier: 'cubic-bezier(0.3, 0, 0.8, 0.15)', cssVar: '--ease-exit' },
  BOUNCE: { token: 'ease-bounce', bezier: 'cubic-bezier(0.3, 1.3, 0.3, 1)', cssVar: '--ease-bounce' },
  FLUID: { token: 'ease-fluid', bezier: 'cubic-bezier(0.15, 0.75, 0.3, 1)', cssVar: '--ease-fluid' },
  CARD_HOVER: { token: 'ease-card-hover', bezier: 'cubic-bezier(0.4, 0.95, 0.6, 1.1)', cssVar: '--ease-card-hover' },
  DRAWER: { token: 'ease-drawer', bezier: 'cubic-bezier(0.2, 0, 0.4, 1)', cssVar: '--ease-drawer' },
};

/**
 * Verifies that docs/背景动效规范.md has zero diff against git HEAD.
 */
export function checkRedLineZeroDiff() {
  try {
    execSync('git diff --exit-code docs/背景动效规范.md', {
      cwd: PROJECT_ROOT,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    return { ok: true, diff: '' };
  } catch (err) {
    const diff = err.stdout ? err.stdout.toString() : '';
    return { ok: false, diff };
  }
}

/**
 * Extracts class tokens from a JSX or JS file content by matching className="..." strings.
 */
export function extractClassNames(code) {
  const classNames = [];
  const regex = /className=(?:["'`]([^"'`]+)["'`]|(?:\{cn\(([^}]+)\)\})|(?:\{joinClasses\(([^}]+)\)\}))/g;
  let match;
  while ((match = regex.exec(code)) !== null) {
    const raw = match[1] || match[2] || match[3] || '';
    classNames.push(raw);
  }
  return classNames;
}

/**
 * Checks whether an element class string or code snippet contains a specific token.
 */
export function hasToken(codeOrClass, token) {
  return new RegExp(`(?:^|\\s|["'\`])${token.replace(/[[\]]/g, '\\$&')}(?:$|\\s|["'\`])`).test(codeOrClass);
}

/**
 * Evaluates contract conformance and captures diagnostic evidence.
 */
export function assertContract(condition, message, diagnostics = {}) {
  if (!condition) {
    const diagStr = Object.keys(diagnostics).length > 0
      ? `\nDiagnostics:\n${JSON.stringify(diagnostics, null, 2)}`
      : '';
    assert.fail(`${message}${diagStr}`);
  }
}
