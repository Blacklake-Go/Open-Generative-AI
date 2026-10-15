import 'server-only';
import fs from 'fs';
import { queryMany, queryOne } from '../lib/db/index.js';

async function check() {
  const raw = fs.readFileSync('/home/ubuntu/scratch_studio_model_ids.json', 'utf8');
  const studioIds = JSON.parse(raw);
  console.log('Total Studio model IDs to check:', studioIds.length);

  const missingInAiModels = [];
  const disabledInAiModels = [];
  const missingPricing = [];
  const missingChannels = [];
  const activeAndHealthy = [];

  for (const id of studioIds) {
    const m = await queryOne('SELECT id, status FROM ai_studio.ai_models WHERE id = $1', [id]);
    if (!m) {
      missingInAiModels.push(id);
      continue;
    }
    if (m.status !== 'active') {
      disabledInAiModels.push({ id, status: m.status });
      continue;
    }
    const pr = await queryOne('SELECT id FROM ai_studio.model_pricing WHERE model_id = $1 AND is_active = true', [id]);
    if (!pr) {
      missingPricing.push(id);
    }
    const ch = await queryOne('SELECT count(*) FROM ai_studio.provider_models WHERE model_id = $1 AND enabled = true', [id]);
    if (!ch || parseInt(ch.count) === 0) {
      missingChannels.push(id);
    } else {
      activeAndHealthy.push(id);
    }
  }

  console.log(JSON.stringify({
    total_studio_ids: studioIds.length,
    missing_in_ai_models_count: missingInAiModels.length,
    disabled_in_ai_models_count: disabledInAiModels.length,
    missing_pricing_count: missingPricing.length,
    missing_channels_count: missingChannels.length,
    active_and_healthy_count: activeAndHealthy.length,
    sample_missing_in_ai_models: missingInAiModels.slice(0, 25),
    sample_disabled: disabledInAiModels.slice(0, 25),
    sample_missing_channels: missingChannels.slice(0, 25),
  }, null, 2));
}

check().catch(console.error);
