import 'server-only';
import { getServerProviderApiKey } from '../lib/services/providerSecrets.js';

async function check() {
  const providers = ['muapi', 'kling', 'minimax', 'alibaba', 'volcengine', 'byteplus', 'google', 'openai', 'runway', 'luma'];
  for (const p of providers) {
    const key = await getServerProviderApiKey({ provider: p });
    console.log(p, key ? `✅ CONFIGURED (len: ${key.length})` : '❌ NOT CONFIGURED');
  }
}
check().catch(console.error);
