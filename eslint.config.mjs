import { FlatCompat } from '@eslint/eslintrc';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const repoRoot = path.dirname(fileURLToPath(import.meta.url));
const compat = new FlatCompat({ baseDirectory: repoRoot });

const eslintConfig = [
  ...compat.extends('next/core-web-vitals'),
  {
    ignores: [
      '**/node_modules/**',
      '**/.next/**',
      '**/.next-*/**',
      '**/dist/**',
      '**/build/**',
      '**/out/**',
      '**/.cache/**',
    ],
  },
  {
    rules: {
      // Existing UI uses full-page anchors and native images intentionally in
      // several standalone surfaces; keep the CI lint contract deterministic
      // while the UI migration remains incremental.
      '@next/next/no-html-link-for-pages': 'off',
      '@next/next/no-img-element': 'off',
      'jsx-a11y/alt-text': 'off',
      'react/display-name': 'off',
      'react/no-unescaped-entities': 'off',
      'react-hooks/exhaustive-deps': 'off',
    },
  },
];

export default eslintConfig;
