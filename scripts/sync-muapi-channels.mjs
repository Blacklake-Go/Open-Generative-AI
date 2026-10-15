// Safe compatibility wrapper for the old MuAPI sync entry point.
// All operations use the reviewed staging services: no provider mapping or enabled
// state is changed, and discovered prices remain pending review unless the service
// explicitly permits a small, verified non-manual update.
// Usage:
//   node --experimental-loader ./scripts/server-only-loader.mjs scripts/sync-muapi-channels.mjs
//   node --experimental-loader ./scripts/server-only-loader.mjs scripts/sync-muapi-channels.mjs --sync-models --sync-prices
//   ... --sync-balance
import 'server-only';

import {
  syncProviderBalance,
  syncProviderModelCatalog,
  syncProviderPrices,
} from '../lib/services/channelSync.js';

const providerId = process.argv.find((argument) => argument.startsWith('--provider='))?.split('=')[1] || 'muapi';
const requested = [
  ['--sync-models', syncProviderModelCatalog],
  ['--sync-prices', syncProviderPrices],
  ['--sync-balance', syncProviderBalance],
].filter(([flag]) => process.argv.includes(flag));

async function main() {
  if (!requested.length) {
    console.log('未执行同步。该任务只写入目录/价格暂存与审核队列，不会自动改映射或禁用模型。');
    console.log('选择：--sync-models、--sync-prices、--sync-balance；可用 --provider=<provider-id> 指定渠道。');
    return;
  }
  const results = [];
  for (const [flag, sync] of requested) {
    const result = await sync({ providerId, actor: { id: 'system:sync-cli' }, requestId: `cli:${flag}` });
    results.push({ action: flag, ...result });
  }
  console.log(JSON.stringify({ providerId, results }, null, 2));
}

main().catch((error) => {
  console.error(JSON.stringify({ status: 'failed', code: error.code || 'SYNC_FAILED', message: error.message || '同步失败', runId: error.runId || null }));
  process.exitCode = 1;
});
