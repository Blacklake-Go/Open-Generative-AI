#!/usr/bin/env node

/**
 * CLI Entrypoint for KOYO Studio UI v3.7.0 4-Tier E2E Test Suite
 *
 * Usage:
 *   node scripts/test-e2e-ui-v370.mjs
 *   node scripts/test-e2e-ui-v370.mjs --tier=1
 *   node scripts/test-e2e-ui-v370.mjs --tier=2
 *   node scripts/test-e2e-ui-v370.mjs --tier=3
 *   node scripts/test-e2e-ui-v370.mjs --tier=4
 *   node scripts/test-e2e-ui-v370.mjs --feature=1..8
 *   node scripts/test-e2e-ui-v370.mjs --tap
 *   node scripts/test-e2e-ui-v370.mjs --bail
 */

import { runUiV370Suite } from '../tests/e2e/ui-v370/runner.mjs';

runUiV370Suite()
  .then((summary) => {
    if (summary.failed > 0) {
      process.exit(1);
    }
    process.exit(0);
  })
  .catch((err) => {
    console.error('Fatal test runner execution error:', err);
    process.exit(1);
  });
