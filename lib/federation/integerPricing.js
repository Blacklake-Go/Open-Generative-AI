// Exact arithmetic for a proposed USD price book. No floating-point estimate or
// missing cost/fee evidence is accepted as proof of a non-loss-making price.
const SCALE = 1000000n;
const BPS = 10000n;
const ceilDiv = (a, b) => (a + b - 1n) / b;
function integer(value, name, { positive = false } = {}) {
  const text = String(value ?? '');
  if (!/^(0|[1-9][0-9]*)$/.test(text)) throw new TypeError(`${name} must be a non-negative integer`);
  const result = BigInt(text);
  if (positive && result === 0n) throw new TypeError(`${name} must be positive`);
  return result;
}

export function auditIntegerPrice({ saleMicrocredits, costUsdMicros, costEvidence, packs, fee }) {
  const sale = integer(saleMicrocredits, 'saleMicrocredits');
  const proposed = ceilDiv(sale, SCALE);
  const result = { proposedIntegerCredits: proposed.toString(), previousMicrocredits: sale.toString(),
    proposedMicrocredits: (proposed * SCALE).toString(), revenueNotReduced: proposed * SCALE >= sale, noLossVerified: false, blockers: [] };
  if (costUsdMicros === null || costUsdMicros === undefined || !costEvidence) result.blockers.push('COST_EVIDENCE_REQUIRED');
  if (!fee?.evidence || fee.rateBps === undefined || fee.fixedUsdMicros === undefined) result.blockers.push('PAYMENT_FEE_EVIDENCE_REQUIRED');
  if (!Array.isArray(packs) || !packs.length || packs.some((pack) => pack.currency !== 'USD')) result.blockers.push('USD_PACK_MATRIX_REQUIRED');
  if (result.blockers.length) return result;
  const cost = integer(costUsdMicros, 'costUsdMicros');
  const rate = integer(fee.rateBps, 'fee.rateBps');
  const fixed = integer(fee.fixedUsdMicros, 'fee.fixedUsdMicros');
  if (rate >= BPS) throw new TypeError('payment fee rate must be below 100%');
  let minimum = 0n;
  let limitingPack = null;
  for (const pack of packs) {
    const price = integer(pack.usdMicros, 'pack.usdMicros', { positive: true });
    const credits = integer(pack.totalMicrocredits, 'pack.totalMicrocredits', { positive: true });
    // Round fees upwards and revenue downwards, including every bonus credit.
    const feeMicros = ceilDiv(price * rate, BPS) + fixed;
    const net = price > feeMicros ? price - feeMicros : 0n;
    if (!net) { result.blockers.push('PACK_NET_RECEIPT_NOT_POSITIVE'); continue; }
    const required = ceilDiv(cost * credits, net * SCALE);
    if (required > minimum) { minimum = required; limitingPack = pack.id; }
  }
  result.minimumNonLossIntegerCredits = minimum.toString();
  result.limitingPack = limitingPack;
  result.noLossVerified = result.blockers.length === 0 && proposed >= minimum;
  result.recommendedIntegerCredits = (proposed > minimum ? proposed : minimum).toString();
  if (!result.noLossVerified && !result.blockers.length) result.blockers.push('PRICE_BELOW_COST_FLOOR');
  return result;
}
