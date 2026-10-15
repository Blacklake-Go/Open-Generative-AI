import 'server-only';
import { queryMany } from '../lib/db/index.js';

async function check() {
  const ids = ['seedream-5.0', 'sora-turbo', 'midjourney-v7', 'flux-1.1-pro', 'luma-dream-machine', 'dall-e-3', 'pika-2.1'];
  for (const id of ids) {
    const m = await queryMany('SELECT id, status FROM ai_studio.ai_models WHERE id = $1', [id]);
    const pr = await queryMany('SELECT id, base_credits, is_active FROM ai_studio.model_pricing WHERE model_id = $1', [id]);
    const pm = await queryMany('SELECT pm.id, pm.provider_id, pm.enabled, pm.cost_config, p.enabled as prov_enabled FROM ai_studio.provider_models pm LEFT JOIN ai_studio.ai_providers p ON p.id = pm.provider_id WHERE pm.model_id = $1', [id]);
    console.log(id, { model: m, pricing: pr, channels: pm });
  }
}
check().catch(console.error);
