import 'server-only';

import { queryMany } from '../lib/db/index.js';
import { purgeUserCascade, processExpiredDeletions } from '../lib/services/userDeletion.js';

async function main() {
  console.log('=== [cleanup-deleted-users] 开始扫描已申请注销及无效用户 ===');
  
  // 1. 扫描并自动清理所有超过 3 天后悔期的注销申请用户
  const expiredResult = await processExpiredDeletions();
  console.log(`[自动巡检] 扫描到 ${expiredResult.scanned} 个超期注销申请用户，成功彻底物理清理: ${expiredResult.purged} 个`);

  // 2. 检查数据库中是否存在历史遗留异常状态用户 (如 suspended 或 is_active = false)
  const legacyInactive = await queryMany(`
    SELECT id, email, display_name, status, is_active, deletion_requested_at, deletion_due_at
    FROM auth_usr.users
    WHERE status = 'suspended' OR (status = 'deletion_pending' AND deletion_due_at <= NOW())
  `);

  if (legacyInactive.length > 0) {
    console.log(`[遗留扫描] 发现 ${legacyInactive.length} 个遗留待彻底清理用户:`);
    for (const u of legacyInactive) {
      console.log(`  - #${u.id} (${u.display_name || u.email || '无名'}) [状态: ${u.status}]`);
      try {
        await purgeUserCascade(u.id);
        console.log(`    ✔ 用户 #${u.id} 及其所有凭据、账本、作品数据已物理彻底清除`);
      } catch (err) {
        console.error(`    ❌ 用户 #${u.id} 清理异常:`, err.message);
      }
    }
  } else {
    console.log('✔ 当前无遗留待清理无效用户。');
  }

  console.log('=== [cleanup-deleted-users] 清理任务全部完成 ===');
}

main().catch((err) => {
  console.error('[cleanup-deleted-users] 发生致命错误:', err);
  process.exit(1);
});
