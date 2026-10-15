#!/usr/bin/env node

/**
 * KOYO Studio UI v3.7.0 E2E Test Suite Runner
 *
 * Requirements-driven 4-tier opaque-box test runner covering F1 through F8:
 * - Tier 1: Feature Coverage (41 tests, >=5 per feature)
 * - Tier 2: Boundary & Corner Cases (41 tests, >=5 per feature)
 * - Tier 3: Cross-Feature Interactions (10 pairwise tests)
 * - Tier 4: Real-World Application Scenarios (5 realistic studio journeys)
 *
 * CLI Usage:
 *   node tests/e2e/ui-v370/runner.mjs
 *   node tests/e2e/ui-v370/runner.mjs --tier=1
 *   node tests/e2e/ui-v370/runner.mjs --tier=2
 *   node tests/e2e/ui-v370/runner.mjs --tier=3
 *   node tests/e2e/ui-v370/runner.mjs --tier=4
 *   node tests/e2e/ui-v370/runner.mjs --feature=1
 *   node tests/e2e/ui-v370/runner.mjs --tap
 *   node tests/e2e/ui-v370/runner.mjs --bail
 */

import { tier1Tests } from './tier1-features.mjs';
import { tier2Tests } from './tier2-boundaries.mjs';
import { tier3Tests } from './tier3-combinations.mjs';
import { tier4Tests } from './tier4-scenarios.mjs';

// Parse command line arguments
const args = process.argv.slice(2);
const tierArg = args.find((a) => a.startsWith('--tier='))?.split('=')[1];
const featureArg = args.find((a) => a.startsWith('--feature='))?.split('=')[1];
const isBail = args.includes('--bail') || args.includes('-b');
const isTapOnly = args.includes('--tap');
const isJsonOnly = args.includes('--json');

// Assemble all test suites
let allTests = [
  ...tier1Tests.map((t) => ({ ...t, tier: 1 })),
  ...tier2Tests.map((t) => ({ ...t, tier: 2 })),
  ...tier3Tests.map((t) => ({ ...t, tier: 3 })),
  ...tier4Tests.map((t) => ({ ...t, tier: 4 })),
];

if (tierArg) {
  const selectedTier = parseInt(tierArg, 10);
  allTests = allTests.filter((t) => t.tier === selectedTier);
}

if (featureArg) {
  const selectedFeature = parseInt(featureArg, 10);
  allTests = allTests.filter((t) => {
    if (t.feature === selectedFeature) return true;
    if (Array.isArray(t.features) && t.features.includes(selectedFeature)) return true;
    return false;
  });
}

export async function runUiV370Suite() {
  const startTime = Date.now();
  let passedCount = 0;
  let failedCount = 0;
  const results = [];

  if (!isTapOnly && !isJsonOnly) {
    console.log(`\n======================================================`);
    console.log(`  KOYO Studio UI v3.7.0 E2E Master Test Runner`);
    console.log(`  4-Tier Opaque-Box Specification Verification Suite`);
    console.log(`  Total Test Cases Scheduled: ${allTests.length}`);
    console.log(`======================================================\n`);
  }

  if (isTapOnly) {
    console.log('TAP version 13');
    console.log(`1..${allTests.length}`);
  }

  for (let i = 0; i < allTests.length; i++) {
    const test = allTests[i];
    const testNum = i + 1;
    const testStart = Date.now();
    let err = null;

    try {
      await test.run();
      passedCount++;
    } catch (e) {
      err = e;
      failedCount++;
    }

    const duration = Date.now() - testStart;
    const status = err ? 'fail' : 'pass';

    results.push({
      id: test.id,
      tier: test.tier,
      feature: test.feature || test.features,
      name: test.name,
      status,
      duration,
      error: err ? { message: err.message, stack: err.stack } : null,
    });

    if (isTapOnly) {
      if (status === 'pass') {
        console.log(`ok ${testNum} - [Tier ${test.tier}] ${test.id}: ${test.name}`);
      } else {
        console.log(`not ok ${testNum} - [Tier ${test.tier}] ${test.id}: ${test.name}`);
        console.log(`  ---`);
        console.log(`  message: "${err.message.replace(/"/g, '\\"')}"`);
        console.log(`  ...`);
      }
    } else if (!isJsonOnly) {
      const icon = status === 'pass' ? '✓' : '✗';
      const label = `[Tier ${test.tier}] ${test.id}: ${test.name}`;
      if (status === 'pass') {
        console.log(`  \x1b[32m${icon}\x1b[0m ${label} \x1b[90m(${duration}ms)\x1b[0m`);
      } else {
        console.log(`  \x1b[31m${icon}\x1b[0m ${label} \x1b[90m(${duration}ms)\x1b[0m`);
        console.log(`    \x1b[31mError: ${err.message}\x1b[0m`);
      }
    }

    if (err && isBail) {
      if (!isTapOnly && !isJsonOnly) {
        console.log(`\n[BAIL] Bailing out after first failure: ${test.id}`);
      }
      break;
    }
  }

  const totalDuration = Date.now() - startTime;

  if (isJsonOnly) {
    console.log(
      JSON.stringify(
        {
          total: allTests.length,
          passed: passedCount,
          failed: failedCount,
          durationMs: totalDuration,
          results,
        },
        null,
        2
      )
    );
  } else if (!isTapOnly) {
    console.log(`\n------------------------------------------------------`);
    console.log(`  Summary of UI v3.7.0 Test Suite Execution:`);
    console.log(`  Total:  ${allTests.length}`);
    console.log(`  Passed: \x1b[32m${passedCount}\x1b[0m`);
    console.log(`  Failed: ${failedCount > 0 ? `\x1b[31m${failedCount}\x1b[0m` : '0'}`);
    console.log(`  Time:   ${totalDuration}ms`);
    console.log(`------------------------------------------------------\n`);
  }

  return {
    total: allTests.length,
    passed: passedCount,
    failed: failedCount,
    durationMs: totalDuration,
    results,
  };
}

// Auto-run if executed directly
if (process.argv[1]?.endsWith('runner.mjs')) {
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
}
