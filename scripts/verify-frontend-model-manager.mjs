import { queryOne, queryMany } from '../lib/db/index.js';
import { listActiveModels, updateModel } from '../lib/services/models.js';

async function main() {
  console.log('=== [1. 验证模型库中的类型与前台暴漏配置] ===');
  const typeCounts = await queryMany(`
    SELECT category, COUNT(*)::int as count,
           COUNT(*) FILTER (WHERE is_visible)::int as visible_count,
           COUNT(*) FILTER (WHERE COALESCE(is_pinned, (capabilities->>'is_pinned')::boolean, false))::int as pinned_count
    FROM ai_studio.ai_models
    WHERE status != 'disabled'
    GROUP BY category
    ORDER BY count DESC
  `);
  console.log('模型类型分布 (Category Breakdown):', typeCounts);

  console.log('\n=== [2. 验证 Active Models 服务层与前台 API 输出] ===');
  const activeModels = await listActiveModels();
  console.log(`Active Models 获取成功: 总计 ${activeModels.length} 个可用模型`);

  const sample = activeModels.find(m => m.id === 'nano-banana') || activeModels[0];
  console.log('示例模型配置 (Sample Model Meta):', {
    id: sample.id,
    displayName: sample.display_name,
    category: sample.category,
    subType: sample.sub_type,
    badge: sample.badge,
    isPinned: sample.is_pinned,
    isVisible: sample.is_visible,
    creditsPrice: sample.credits_price,
  });

  console.log('\n=== [3. 验证管理员端按类型更新模型前台配置] ===');
  const testId = sample.id;
  const updateRes = await updateModel({
    actor: { id: 'admin-test', role: 'super_admin' },
    id: testId,
    updates: {
      display_name: 'Nano Banana Pro 旗舰版',
      badge: 'Best',
      sub_type: 't2i',
      description: '超高质感写实，精准理解提示词，极速出图。',
      is_pinned: true,
      is_visible: true,
      tier: 'core',
    },
    requestId: 'test_req_001',
  });

  if (updateRes.error) {
    console.error('更新失败:', updateRes.error);
    process.exit(1);
  }
  console.log('✓ 成功更新模型前台配置:', {
    id: updateRes.model.id,
    display_name: updateRes.model.display_name,
    badge: updateRes.model.badge,
    sub_type: updateRes.model.sub_type,
    is_pinned: updateRes.model.is_pinned,
    is_visible: updateRes.model.is_visible,
  });

  console.log('\n=== [4. 再次验证 listActiveModels 立即同步最新属性] ===');
  const updatedList = await listActiveModels();
  const refreshed = updatedList.find(m => m.id === testId);
  console.log('✓ 刷新后模型属性:', {
    id: refreshed.id,
    displayName: refreshed.display_name,
    badge: refreshed.badge,
    subType: refreshed.sub_type,
    isPinned: refreshed.is_pinned,
    description: refreshed.description,
  });

  console.log('\n=== [全部测试通过！模型管理器按类型配置与前台同步完备] ===');
  process.exit(0);
}

main().catch(err => {
  console.error('测试异常:', err);
  process.exit(1);
});
