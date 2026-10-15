import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const parser = require('next/dist/compiled/babel/parser');

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '../..');

// Helper to determine if a string looks like Tailwind / CSS classes
const CSS_CLASS_REGEX = /^(?:(?:sm|md|lg|xl|2xl|hover|focus|active|disabled|group-hover|dark):)?(?:p[xytbr]?-\d+|m[xytbr]?-\d+|w-\d+|h-\d+|text-[a-z]+|bg-[a-z0-9_-]+|border-[a-z0-9_-]+|rounded-[a-z0-9_-]+|flex|grid|absolute|relative|fixed|sticky|block|hidden|inline-block|cursor-[a-z]+|transition-[a-z]+|duration-\d+|opacity-\d+|z-\d+|items-[a-z]+|justify-[a-z]+)(?:\s+.*)?$/;

const SVG_PATH_REGEX = /^[MmLlHhVvCcSsQqTtAaZz0-9\s,.-]{15,}$/;
const URL_REGEX = /^(?:https?:\/\/|\/api\/|\/static\/|\/fonts\/|\/_next\/|\/assets\/|data:image\/)/;
const COLOR_HEX_REGEX = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/;
const IDENTIFIER_OR_CODE_REGEX = /^[a-z0-9_]+(?:-[a-z0-9_]+)*$/;
const PURE_SYMBOLS_REGEX = /^[\s\d_.:;,\-+*\/\\|!?@#$%^&()\[\]{}<>=~`'"•·…—–]+$/;

function isLikelyUserFacing(str, attrName = null) {
  if (!str || typeof str !== 'string') return false;
  const trimmed = str.trim();
  if (trimmed.length < 1) return false;
  if (trimmed.length === 1 && !/[\u4e00-\u9fa5]/.test(trimmed)) return false;

  // CJK text is almost always user-facing if not in comments
  if (/[\u4e00-\u9fa5]/.test(trimmed)) {
    if (trimmed.startsWith('//') || trimmed.startsWith('/*')) return false;
    return true;
  }

  // Pure symbol / punctuation check
  if (PURE_SYMBOLS_REGEX.test(trimmed)) return false;

  // Filter out URLs, SVG paths, colors, CSS classes
  if (URL_REGEX.test(trimmed)) return false;
  if (SVG_PATH_REGEX.test(trimmed)) return false;
  if (COLOR_HEX_REGEX.test(trimmed)) return false;

  // If specific UI attribute, higher tolerance
  if (['placeholder', 'title', 'label', 'description', 'message', 'aria-label', 'tooltip', 'emptyText'].includes(attrName)) {
    if (CSS_CLASS_REGEX.test(trimmed)) return false;
    return true;
  }

  if (CSS_CLASS_REGEX.test(trimmed)) return false;
  if (IDENTIFIER_OR_CODE_REGEX.test(trimmed) && !trimmed.includes(' ')) return false;

  // Require spaces or capital letters or multiple words for English text
  if (/[a-zA-Z]/.test(trimmed)) {
    if (trimmed.includes(' ') || /^[A-Z][a-z]+/.test(trimmed) || /^[A-Z\s]+$/.test(trimmed)) {
      return true;
    }
  }

  return false;
}

export function scanCodeAst(code, filePath) {
  const findings = [];
  let ast;
  try {
    ast = parser.parse(code, {
      sourceType: 'module',
      plugins: [
        'jsx',
        'typescript',
        'classProperties',
        'decorators-legacy',
        'doExpressions',
        'exportDefaultFrom',
        ['importAttributes', { deprecatedAssertSyntax: true }],
      ],
    });
  } catch (err) {
    // If parse fails, fallback to simple line regex
    return scanCodeLinesFallback(code, filePath);
  }

  function walk(node, parent = null, grandParent = null) {
    if (!node || typeof node !== 'object') return;

    // 1. JSXText
    if (node.type === 'JSXText') {
      const text = node.value.trim();
      if (text && isLikelyUserFacing(text)) {
        findings.push({
          type: 'jsx-text',
          text,
          line: node.loc?.start?.line || 1,
          context: parent?.name?.name || 'JSX',
        });
      }
    }

    // 2. JSXAttribute
    if (node.type === 'JSXAttribute') {
      const attrName = node.name?.name;
      const targetAttrs = [
        'title', 'placeholder', 'label', 'description', 'message',
        'aria-label', 'alt', 'tooltip', 'confirmText', 'cancelText',
        'okText', 'header', 'helperText', 'error', 'emptyText', 'subtitle'
      ];
      if (targetAttrs.includes(attrName) && node.value) {
        if (node.value.type === 'StringLiteral') {
          const text = node.value.value.trim();
          if (isLikelyUserFacing(text, attrName)) {
            findings.push({
              type: 'jsx-attr',
              attribute: attrName,
              text,
              line: node.loc?.start?.line || 1,
              context: parent?.name?.name || 'JSX',
            });
          }
        } else if (node.value.type === 'JSXExpressionContainer' && node.value.expression?.type === 'StringLiteral') {
          const text = node.value.expression.value.trim();
          if (isLikelyUserFacing(text, attrName)) {
            findings.push({
              type: 'jsx-attr',
              attribute: attrName,
              text,
              line: node.loc?.start?.line || 1,
              context: parent?.name?.name || 'JSX',
            });
          }
        }
      }
    }

    // 3. ConditionalExpression (ternary: isZh ? '中文' : 'English')
    if (node.type === 'ConditionalExpression') {
      const testSrc = code.slice(node.test.start, node.test.end);
      if (/\bisZh\b|locale\s*===|lang\s*===/.test(testSrc)) {
        const consText = node.consequent.type === 'StringLiteral' ? node.consequent.value.trim() : null;
        const altText = node.alternate.type === 'StringLiteral' ? node.alternate.value.trim() : null;
        if (consText || altText) {
          findings.push({
            type: 'conditional-isZh',
            zh: consText,
            en: altText,
            text: consText || altText,
            line: node.loc?.start?.line || 1,
            context: 'ternary',
          });
        }
      }
    }

    // 4. CallExpression (toast, alert, confirm, etc.)
    if (node.type === 'CallExpression') {
      const callee = node.callee;
      let isUiCall = false;
      let callName = '';

      if (callee.type === 'Identifier' && ['toast', 'alert', 'confirm'].includes(callee.name)) {
        isUiCall = true;
        callName = callee.name;
      } else if (callee.type === 'MemberExpression') {
        const obj = callee.object?.name;
        const prop = callee.property?.name;
        if (obj === 'toast' || (['setMessage', 'setFeedback', 'setError'].includes(obj) && !prop)) {
          isUiCall = true;
          callName = `${obj}.${prop}`;
        }
      }

      if (isUiCall && node.arguments?.[0]?.type === 'StringLiteral') {
        const text = node.arguments[0].value.trim();
        if (isLikelyUserFacing(text)) {
          findings.push({
            type: 'ui-call',
            callName,
            text,
            line: node.loc?.start?.line || 1,
            context: callName,
          });
        }
      }
    }

    // 5. ObjectProperty in arrays or state objects (label: '...', title: '...', desc: '...')
    if (node.type === 'ObjectProperty' && node.key && node.value) {
      const keyName = node.key.name || node.key.value;
      if (['label', 'title', 'subtitle', 'desc', 'description', 'question', 'answer', 'text', 'name'].includes(keyName)) {
        if (node.value.type === 'StringLiteral') {
          const text = node.value.value.trim();
          if (isLikelyUserFacing(text, keyName)) {
            findings.push({
              type: 'object-property',
              key: keyName,
              text,
              line: node.loc?.start?.line || 1,
              context: `property.${keyName}`,
            });
          }
        }
      }
    }

    // 6. Generic CJK StringLiteral (catches variables, returns, ternary branches, array items)
    if (node.type === 'StringLiteral') {
      const text = node.value.trim();
      if (/[\u4e00-\u9fa5]/.test(text)) {
        // Exclude console.* calls
        const isConsoleCall = parent?.type === 'CallExpression' &&
          parent.callee?.type === 'MemberExpression' &&
          parent.callee?.object?.name === 'console';
        
        const line = node.loc?.start?.line || 1;
        const already = findings.some((f) => f.line === line && (f.text === text || f.zh === text));
        if (!already && parent?.type !== 'ImportDeclaration' && !isConsoleCall) {
          findings.push({
            type: 'string-literal-cjk',
            text,
            line,
            context: parent?.type || 'code',
          });
        }
      }
    }

    // Recurse children
    for (const key of Object.keys(node)) {
      if (key === 'loc' || key === 'start' || key === 'end') continue;
      const child = node[key];
      if (Array.isArray(child)) {
        for (const c of child) walk(c, node, parent);
      } else if (child && typeof child === 'object') {
        walk(child, node, parent);
      }
    }
  }

  walk(ast.program);
  return findings;
}

function scanCodeLinesFallback(code, filePath) {
  const findings = [];
  const lines = code.split('\n');
  const cjk = /[\u4e00-\u9fa5]/;
  lines.forEach((l, i) => {
    const trimmed = l.trim();
    if (trimmed.startsWith('//') || trimmed.startsWith('*') || trimmed.startsWith('/*')) return;
    if (cjk.test(l)) {
      findings.push({
        type: 'fallback-line',
        text: trimmed,
        line: i + 1,
        context: 'fallback',
      });
    }
  });
  return findings;
}
