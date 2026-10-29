import 'server-only';
import { queryMany } from '../db/index.js';
import { exchangeRateSnapshotFromRows } from '../modelCenter/routePricing.js';

export async function getCurrentExchangeRateSnapshot(client = null) {
  const read = client?.readMany ? client.readMany.bind(client) : client?.queryMany ? client.queryMany.bind(client) : queryMany;
  const rows = await read(`SELECT DISTINCT ON (base_currency, quote_currency)
    id, base_currency, quote_currency, rate, source_type, source_url, observed_at, expires_at
    FROM ai_studio.exchange_rate_snapshots
    ORDER BY base_currency, quote_currency, observed_at DESC`);
  return exchangeRateSnapshotFromRows(rows);
}
