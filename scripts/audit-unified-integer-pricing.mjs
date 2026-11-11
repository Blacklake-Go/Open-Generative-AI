import { readFile, writeFile } from 'node:fs/promises';
import { auditIntegerPrice } from '../lib/federation/integerPricing.js';

const [sourcePath, destination] = process.argv.slice(2);
if (!sourcePath || !destination) throw new Error('Usage: node scripts/audit-unified-integer-pricing.mjs source.json result.json');
const source = JSON.parse(await readFile(sourcePath, 'utf8'));
const policy = JSON.parse(source.creditPolicy || '{}');
const ceilDiv = (a, b) => (a + b - 1n) / b;
const scale = 1000000n;
const records = [];
for (const group of source.groups) {
  const overrides = JSON.parse(group.overrides || '[]');
  for (const tier of source.tiers) {
    const override = overrides.find((item) => item.modelKey === tier.model) || {};
    const usdRate = BigInt(override.pointsPerUsdMicrocredits || group.pointsPerUsd);
    const cnyRate = BigInt(override.pointsPerCnyMicrocredits || group.pointsPerCny);
    const groupRatio = BigInt(override.ratioBasisPoints || group.ratioBps);
    const policyRatio = BigInt(policy.modelMultiplierBasisPoints?.[tier.model] || policy.defaultMultiplierBasisPoints || 10000);
    const multiplier = ceilDiv(groupRatio * policyRatio, 10000n);
    let unit = BigInt(tier.saleMicrocredits);
    if (tier.priceCurrency !== 'credits') unit = ceilDiv(unit * (tier.priceCurrency === 'USD' ? usdRate : cnyRate), scale);
    unit = ceilDiv(unit * multiplier, 10000n);
    const cost = tier.costConfigured ? ceilDiv(BigInt(tier.costMicrocredits) * scale, 100000000n).toString() : null;
    const result = auditIntegerPrice({ saleMicrocredits: unit.toString(), costUsdMicros: cost,
      costEvidence: tier.costConfigured ? `configured-tier:${tier.id}:version:${tier.priceVersion}` : null,
      packs: source.packs, fee: source.feeEvidence || null });
    if (tier.billingMode === 'token') {
      result.noLossVerified = false;
      result.blockers.push('TOKEN_USAGE_AND_CONTEXT_BAND_MATRIX_REQUIRED');
    }
    if (!['credits', 'USD', 'CNY'].includes(tier.priceCurrency)) {
      result.noLossVerified = false;
      result.blockers.push('UNKNOWN_PRICE_CURRENCY');
    }
    records.push({ tierId: tier.id, model: tier.model, group: group.code, billingMode: tier.billingMode, selector: JSON.parse(tier.selector || '{}'), ...result });
  }
}
const starters = source.packs.filter((pack) => pack.currency === 'USD' && BigInt(pack.usdMicros) === 10000000n);
const output = { source: 'isolated-restored-main-database', originalPricesChanged: false, historicalOrdersChanged: false,
  usdStarterAtTenDollars: starters.length > 0, minimumCreditPackUsdMicros: source.packs.reduce((minimum, pack) => BigInt(pack.usdMicros) < minimum ? BigInt(pack.usdMicros) : minimum, BigInt(source.packs[0].usdMicros)).toString(),
  creditPackAmountsAreIntegers: source.packs.every((pack) => BigInt(pack.totalMicrocredits) % scale === 0n),
  examinedTierGroupPairs: records.length, proposedPricesAreIntegers: records.every((row) => /^[0-9]+$/.test(row.proposedIntegerCredits)),
  noProposalReducesRevenue: records.every((row) => row.revenueNotReduced),
  fullyVerifiedNonLossPairs: records.filter((row) => row.noLossVerified).length,
  feeEvidenceAvailable: Boolean(source.feeEvidence?.evidence), records };
await writeFile(destination, JSON.stringify(output, null, 2) + '\n');
console.log(JSON.stringify(Object.fromEntries(Object.entries(output).filter(([key]) => key !== 'records')), null, 2));
