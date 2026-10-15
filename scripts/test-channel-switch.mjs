import 'server-only';
import { queryMany } from '../lib/db/index.js';
import { setChannelPrimary } from '../lib/repositories/aiCatalog.js';

async function testSwitch() {
  const modelId = 'kling-2.6';
  const channels = await queryMany(
    'SELECT id, provider_id, metadata FROM ai_studio.provider_models WHERE model_id = $1 ORDER BY id',
    [modelId]
  );
  console.log('Channels before switch:', channels.map(c => ({ id: c.id, prov: c.provider_id, primary: c.metadata?.primary })));

  if (channels.length >= 2) {
    // Switch to first channel
    await setChannelPrimary(modelId, channels[0].id);
    const after0 = await queryMany(
      'SELECT id, provider_id, metadata FROM ai_studio.provider_models WHERE model_id = $1 ORDER BY id',
      [modelId]
    );
    console.log('After switch to channel[0]:', after0.map(c => ({ id: c.id, prov: c.provider_id, primary: c.metadata?.primary })));

    // Switch to second channel
    await setChannelPrimary(modelId, channels[1].id);
    const after1 = await queryMany(
      'SELECT id, provider_id, metadata FROM ai_studio.provider_models WHERE model_id = $1 ORDER BY id',
      [modelId]
    );
    console.log('After switch to channel[1]:', after1.map(c => ({ id: c.id, prov: c.provider_id, primary: c.metadata?.primary })));

    // Switch back to preferred official channel if available
    const official = channels.find(c => c.provider_id === 'kling') || channels[0];
    await setChannelPrimary(modelId, official.id);
    const finalCh = await queryMany(
      'SELECT id, provider_id, metadata FROM ai_studio.provider_models WHERE model_id = $1 ORDER BY id',
      [modelId]
    );
    console.log('Final reset to official:', finalCh.map(c => ({ id: c.id, prov: c.provider_id, primary: c.metadata?.primary })));
  }
}

testSwitch().catch(console.error);
