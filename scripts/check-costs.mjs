import 'server-only';
import { queryMany } from '../lib/db/index.js';

async function check() {
  const ids = ['seedream-5.0', 'sora-turbo', 'midjourney-v7', 'flux-1.1-pro', 'luma-dream-machine', 'dall-e-3', 'pika-2.1'];
  for (const id of ids) {
    const pm = await queryMany('SELECT id, provider_id, enabled, cost_config FROM ai_studio.provider_models WHERE model_id = $1', [id]);
    console.log(id, pm);
  }
}
check().catch(console.error);
