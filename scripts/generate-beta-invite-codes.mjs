import { createRequire } from 'node:module';
import fs from 'node:fs';

const require = createRequire(import.meta.url);
try {
  const serverOnlyPath = require.resolve('server-only');
  require.cache[serverOnlyPath] = {
    id: serverOnlyPath,
    filename: serverOnlyPath,
    loaded: true,
    exports: {},
  };
} catch {}

try {
  if (typeof process.loadEnvFile === 'function' && fs.existsSync('.env.local')) {
    process.loadEnvFile('.env.local');
  }
} catch {}

const { batchGenerateInviteCodes } = await import('../lib/services/inviteCodes.js');
const { closePgPool } = await import('../lib/db/index.js');

async function main() {
  const count = Number(process.argv[2]) || 50;
  console.log(`正在为首批内测创作者批量生成 ${count} 个激活邀请码...`);
  try {
    const codes = await batchGenerateInviteCodes({
      count,
      maxUses: 1,
      notes: '首批种子用户内测激活码',
      createdBy: 'system:beta-launch',
    });
    console.log(`\n=== 成功生成 ${codes.length} 个内测激活码 ===\n`);
    codes.forEach((c, idx) => {
      console.log(`${String(idx + 1).padStart(2, ' ')}. ${c.code}`);
    });
    console.log('\n======================================\n');
  } finally {
    await closePgPool().catch(() => {});
  }
}

main().catch((err) => {
  console.error('生成邀请码失败:', err);
  process.exit(1);
});

