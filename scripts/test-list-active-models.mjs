import 'server-only';
import { listActiveModels } from '../lib/services/models.js';

async function check() {
  const active = await listActiveModels();
  console.log('listActiveModels() returned total count:', active.length);
  const sample = active.slice(0, 20).map(m => ({ id: m.id, name: m.name, prov: m.provider, price: m.credits_price }));
  console.log('Sample active models:', sample);

  // Check specific flagship models
  const checkIds = [
    'kling-2.6', 'kling-v2.6-pro-t2v', 'kling-3.0', 'kling-v3.0-standard-text-to-video',
    'wan-2.1', 'wan2.1-text-to-image', 'wan2.1-image-to-video',
    'hailuo-02', 'hailuo-2.3', 'minimax-hailuo-2.3-standard-t2v',
    'seedream-5.0', 'bytedance-seedream-5.0-pro', 'seedance-2.0', 'seedance-v2.0-t2v',
    'veo-2', 'veo-2-text-to-video', 'veo-3',
    'gpt-image', 'gpt4o-text-to-image', 'sora-turbo',
    'midjourney-v7', 'flux-1-dev', 'flux-1-pro', 'flux-1.1-pro',
    'runway-image-to-video', 'luma-dream-machine', 'vidu-2.0',
    'dall-e-3', 'pika-2.0', 'pika-2.1', 'ideogram-v3', 'recraft-v3'
  ];

  console.log('\n--- Specific Key Model Availability in listActiveModels() ---');
  for (const cid of checkIds) {
    const found = active.find(m => m.id === cid);
    console.log(cid, found ? `✅ ON SHELF (price: ${found.credits_price}, prov: ${found.provider})` : '❌ MISSING FROM ACTIVE SHELF');
  }
}

check().catch(console.error);
