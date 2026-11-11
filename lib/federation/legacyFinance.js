import 'server-only';
import { createHash } from 'node:crypto';
import { queryMany, withTransaction } from '../db/index.js';
import { federationError } from './ticket.js';

function stable(value) {
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stable(value[key])]));
  return value;
}
export function financeSnapshotHash(value) {
  return createHash('sha256').update(JSON.stringify(stable(value))).digest('hex');
}

const SOURCES = [
  { kind: 'credit_ledger_v1', table: 'ops_bill.credit_ledger', id: 'id', immutable: true },
  { kind: 'credit_ledger_v2', table: 'ops_bill.credit_ledger_v2', id: 'id', immutable: true },
  { kind: 'credit_wallet', table: 'ops_bill.credit_wallets', id: 'user_id' },
  { kind: 'credit_reservation', table: 'ops_bill.credit_reservations', id: 'id' },
  { kind: 'credit_returned_lot', table: 'ops_bill.credit_returned_lots', id: 'id' },
  { kind: 'currency_journal', table: 'ops_bill.currency_journal_entries', id: 'id', immutable: true },
  { kind: 'currency_wallet', table: 'ops_bill.currency_wallets', id: 'user_id',
    columns: 'user_id,available_balance,frozen_balance,restricted_balance,is_locked,version,updated_at,created_at' },
];

// This is an append-only provenance mirror, not a second spendable ledger. In
// particular, v1 and v2 describe overlapping history and must never be summed.
export async function snapshotLegacyFinance() {
  return withTransaction(async (tx) => {
    await tx.execute('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ');
    const summary = [];
    for (const source of SOURCES) {
      const rows = await tx.queryMany(`SELECT ${source.columns || '*'} FROM ${source.table} ORDER BY ${source.id}`);
      let inserted = 0;
      for (const row of rows) {
        const id = String(row[source.id]);
        const hash = financeSnapshotHash(row);
        if (source.immutable) {
          const previous = await tx.queryOne(`SELECT source_hash FROM supdance_federation.legacy_finance_snapshots
            WHERE source_kind=$1 AND source_id=$2 AND source_hash<>$3 LIMIT 1`, [source.kind, id, hash]);
          if (previous) throw federationError('LEGACY_FINANCE_DRIFT', '历史流水内容发生变化，已停止同步', 409);
        }
        inserted += await tx.execute(`INSERT INTO supdance_federation.legacy_finance_snapshots
          (source_kind,source_id,source_user_id,source_hash,source_payload) VALUES($1,$2,$3,$4,$5::jsonb)
          ON CONFLICT DO NOTHING`, [source.kind, id, row.user_id == null ? null : String(row.user_id), hash, JSON.stringify(row)]);
      }
      summary.push({ kind: source.kind, sourceRows: rows.length, inserted,
        fingerprint: financeSnapshotHash(rows), spendableCreditsIssued: 0 });
    }
    return summary;
  });
}

export async function readLegacyHistory(userId, limit = 50) {
  if (!userId) throw federationError('UNAUTHORIZED', '请先登录', 401);
  const safeLimit = Number.isSafeInteger(limit) ? Math.min(100, Math.max(1, limit)) : 50;
  return queryMany(`SELECT source_kind,source_id,source_payload,observed_at
    FROM supdance_federation.legacy_finance_snapshots
    WHERE source_user_id=$1 AND source_kind IN ('credit_ledger_v1','credit_ledger_v2','currency_journal')
    ORDER BY (source_payload->>'created_at')::timestamptz DESC,source_kind,source_id LIMIT $2`, [userId, safeLimit]);
}
