#!/usr/bin/env node

/**
 * KOYO Studio E2E Master Test Runner
 *
 * Runs Tier 1 (Features), Tier 2 (Boundaries), Tier 3 (Combinations), Tier 4 (Scenarios)
 * Supports standard TAP v13 and rich diagnostic summaries.
 *
 * Usage:
 *   node tests/e2e/runner.mjs
 *   node tests/e2e/runner.mjs --tier=1
 *   node tests/e2e/runner.mjs --tier=2
 *   node tests/e2e/runner.mjs --tier=3
 *   node tests/e2e/runner.mjs --tier=4
 *   node tests/e2e/runner.mjs --feature=1
 *   node tests/e2e/runner.mjs --tap
 *   node tests/e2e/runner.mjs --bail
 */

import { tier1Tests } from './tier1-features.mjs';
import { tier2Tests } from './tier2-boundaries.mjs';
import { tier3Tests } from './tier3-combinations.mjs';
import { tier4Tests } from './tier4-scenarios.mjs';

// Parse CLI flags
const args = process.argv.slice(2);
const tierArg = args.find((a) => a.startsWith('--tier='))?.split('=')[1];
const featureArg = args.find((a) => a.startsWith('--feature='))?.split('=')[1];
const isBail = args.includes('--bail') || args.includes('-b');
const isTapOnly = args.includes('--tap');

// Aggregate tests
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
  allTests = allTests.filter((t) => t.feature === selectedFeature);
}

async function runSuite() {
  const startTime = Date.now();

  if (!isTapOnly) {
    console.log(`\n======================================================`);
    console.log(`  KOYO Studio E2E Opaque-Box Test Runner`);
    console.log(`  4-Tier Unified Creation Closed-Loop Contract`);
    console.log(`  Total Test Cases Scheduled: ${allTests.length}`);
    console.log(`======================================================\n`);
  }

  console.log(`TAP version 13`);
  console.log(`1..${allTests.length}`);

  let passedCount = 0;
  let failedCount = 0;
  const results = [];
  const tierStats = new Map();
  const featureStats = new Map();

  for (let idx = 0; idx < allTests.length; idx++) {
    const testCase = allTests[idx];
    const testNumber = idx + 1;
    const testStart = Date.now();
    let passed = false;
    let failureError = null;

    try {
      await testCase.run();
      passed = true;
    } catch (err) {
      failureError = err;
    }

    const duration = Date.now() - testStart;

    if (passed) {
      passedCount++;
    } else {
      failedCount++;
    }

    results.push({
      testNumber,
      id: testCase.id,
      name: testCase.name,
      tier: testCase.tier,
      feature: testCase.feature || null,
      passed,
      duration,
      error: failureError ? failureError.message : null,
    });

    // Tier stats
    const tStats = tierStats.get(testCase.tier) || { total: 0, pass: 0 };
    tStats.total++;
    if (passed) tStats.pass++;
    tierStats.set(testCase.tier, tStats);

    // Feature stats (for Tier 1)
    if (testCase.tier === 1 && testCase.feature) {
      const fStats = featureStats.get(testCase.feature) || { total: 0, pass: 0 };
      fStats.total++;
      if (passed) fStats.pass++;
      featureStats.set(testCase.feature, fStats);
    }

    // Output TAP line
    if (passed) {
      console.log(`ok ${testNumber} - [Tier ${testCase.tier}] ${testCase.id}: ${testCase.name} (${duration}ms)`);
    } else {
      console.log(`not ok ${testNumber} - [Tier ${testCase.tier}] ${testCase.id}: ${testCase.name} (${duration}ms)`);
      console.log(`  ---`);
      console.log(`  message: "${failureError?.message?.replace(/"/g, '\\"')}"`);
      console.log(`  severity: fail`);
      console.log(`  ...`);

      if (isBail) {
        console.log(`\nBail out! Stopped due to failure on test ${testNumber} (--bail specified).\n`);
        break;
      }
    }
  }

  const totalDuration = ((Date.now() - startTime) / 1000).toFixed(2);

  // Summary output
  console.log(`\n# ======================================================`);
  console.log(`# Test Execution Summary`);
  console.log(`# ======================================================`);
  console.log(`# Total Tests : ${allTests.length}`);
  console.log(`# Passed      : ${passedCount}`);
  console.log(`# Failed      : ${failedCount}`);
  console.log(`# Duration    : ${totalDuration}s`);

  if (!isTapOnly) {
    console.log(`\n# Breakdown by Tier:`);
    const tierDescriptions = {
      1: 'Feature Coverage (7 features, >=5 tests each)',
      2: 'Boundary & Corner Cases (6 areas, >=5 tests each)',
      3: 'Cross-Feature Combinations',
      4: 'Real-World Workloads & Scenarios',
    };

    for (const [tier, stats] of tierStats.entries()) {
      const desc = tierDescriptions[tier] || `Tier ${tier}`;
      const status = stats.pass === stats.total ? 'PASS' : 'FAIL';
      console.log(`#   [Tier ${tier}] ${desc.padEnd(45)}: ${stats.pass}/${stats.total} (${status})`);
    }

    if (featureStats.size > 0) {
      console.log(`\n# Breakdown of Tier 1 Features:`);
      const t1FeatureNames = {
        1: 'Quote API (/api/generation/quote)',
        2: 'Idempotent Job Creation (/api/generations)',
        3: 'Credit Reservation (reserveCredits)',
        4: 'Commit/Void Ledger (commit/voidCredits)',
        5: 'Storage Archive URL (archive/getAssetUrl)',
        6: '10 Studios Input Specs & Contracts',
        7: 'Readiness Endpoint (/api/ready)',
      };

      for (const [featId, stats] of featureStats.entries()) {
        const name = t1FeatureNames[featId] || `Feature ${featId}`;
        const status = stats.pass === stats.total ? 'PASS' : 'FAIL';
        console.log(`#   [F${featId}] ${name.padEnd(45)}: ${stats.pass}/${stats.total} (${status})`);
      }
    }
  }

  console.log(`# ======================================================\n`);

  if (failedCount > 0) {
    process.exit(1);
  } else {
    process.exit(0);
  }
}

runSuite().catch((err) => {
  console.error('\nUnexpected error during test suite execution:', err);
  process.exit(1);
});
