import { createHash } from 'node:crypto';
import { withTransaction } from '../lib/db/index.js';
import { logAudit } from '../lib/admin/audit.js';
import { SAFE_FX_URL, parseSafeUsdCny } from '../lib/pricing/safeReferenceFx.js';

try {
  const response = await fetch(SAFE_FX_URL, { signal: AbortSignal.timeout(15000), headers: { Accept: 'text/html' } });
  if (!response.ok) throw new Error('FX_SOURCE_HTTP_ERROR');
  const reference = parseSafeUsdCny(await response.text());
  const id = `fxs_safe_usdcny_${reference.sourceDate.replaceAll('-', '')}`;
  const result = await withTransaction(async (tx) => {
    await tx.query('SELECT pg_advisory_xact_lock(hashtext($1))', ['fx:USD:CNY']);
    const previous = await tx.queryOne("SELECT id,rate,source_type,source_url,observed_at,expires_at FROM ai_studio.exchange_rate_snapshots WHERE base_currency='USD' AND quote_currency='CNY' ORDER BY observed_at DESC LIMIT 1");
    const sourceDay = Date.parse(`${reference.sourceDate}T00:00:00+08:00`);
    if (previous && new Date(previous.observed_at).getTime() >= sourceDay && new Date(previous.expires_at).getTime() > Date.now() + 8 * 3600_000) {
      return { status: 'already_current' };
    }
    if (previous && Number(previous.rate) > 0 && Math.abs(reference.rate / Number(previous.rate) - 1) > 0.10) {
      throw new Error('FX_CHANGE_REVIEW_REQUIRED');
    }
    const evidence = { ...reference, sourceUrl: SAFE_FX_URL };
    const inserted = await tx.queryOne("INSERT INTO ai_studio.exchange_rate_snapshots (id,base_currency,quote_currency,rate,source_type,source_url,observed_at,expires_at,evidence_digest,created_by) VALUES ($1,'USD','CNY',$2,'reference',$3,now(),$4,$5,'system:safe-fx-refresh') ON CONFLICT (id) DO NOTHING RETURNING id", [id, reference.rate, SAFE_FX_URL, reference.expiresAt, createHash('sha256').update(JSON.stringify(evidence)).digest('hex')]);
    if (!inserted) return { status: 'already_recorded' };
    await logAudit({ action: 'exchange_rate.reference_refresh', targetType: 'exchange_rate_snapshot', targetId: id, riskLevel: 'high', before: previous, after: evidence, transaction: tx });
    return { status: 'updated', ...reference };
  });
  console.log(JSON.stringify(result));
  process.exit(0);
} catch (error) {
  console.error(JSON.stringify({ status: 'failed', code: String(error?.message || 'FX_REFRESH_FAILED').slice(0, 100) }));
  process.exit(1);
}
