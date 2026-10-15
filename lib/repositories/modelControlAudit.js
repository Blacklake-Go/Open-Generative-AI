import 'server-only';

import { queryOne } from '../db/index.js';

export async function getModelControlAuditSnapshot(action, body = {}) {
  switch (action) {
    case 'map_catalog':
      return queryOne('SELECT * FROM ai_studio.provider_catalog_entries WHERE id=$1', [body.catalogEntryId]);
    case 'review_mapping':
    case 'update_mapping_spec':
      return queryOne('SELECT * FROM ai_studio.provider_models WHERE id=$1', [body.mappingId]);
    case 'stage_price':
      return queryOne(`SELECT * FROM ai_studio.provider_model_price_versions
        WHERE provider_model_id=$1 AND status='active' ORDER BY version_no DESC LIMIT 1`, [body.providerModelId]);
    case 'approve_price':
      return queryOne('SELECT * FROM ai_studio.provider_model_price_versions WHERE id=$1', [body.versionId]);
    case 'publish_site_price':
      return queryOne('SELECT * FROM ai_studio.model_pricing WHERE model_id=$1', [body.modelId]);
    case 'provider_enabled':
      return queryOne('SELECT id,enabled FROM ai_studio.ai_providers WHERE id=$1 OR slug=$1 LIMIT 1', [body.providerId]);
    case 'routing_policy':
      return queryOne('SELECT * FROM ai_studio.routing_policies WHERE model_id=$1', [body.modelId]);
    case 'exchange_rate':
      return queryOne(`SELECT * FROM ai_studio.exchange_rate_snapshots
        WHERE base_currency=$1 AND quote_currency=$2 ORDER BY observed_at DESC LIMIT 1`, [
        String(body.baseCurrency || 'USD').toUpperCase(), String(body.quoteCurrency || 'CNY').toUpperCase(),
      ]);
    default:
      return null;
  }
}
