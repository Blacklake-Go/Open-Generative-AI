import 'server-only';
import { queryMany, queryOne, withTransaction } from '@/lib/db/index.js';
import { invalidateActiveModelsCache } from '@/app/api/models/active/route.js';
import { CANONICAL_GROUPS, suggestCanonicalTarget } from '@/lib/modelCenter/canonicalModels.js';
import { executeDeduplication } from '../../scripts/execute-model-deduplication.mjs';

/**
 * 扫描全库模型的去重与健康状态报告
 */
export async function scanModelHygiene() {
  // 1. 全局统计
  const summaryRow = await queryOne(`
    SELECT
      COUNT(*)::int AS total_models,
      COUNT(*) FILTER (WHERE tier = 'core' AND is_visible)::int AS core_visible_count,
      COUNT(*) FILTER (WHERE tier = 'backup' OR NOT is_visible)::int AS backup_count,
      COUNT(*) FILTER (WHERE status = 'disabled')::int AS disabled_count
    FROM ai_studio.ai_models
  `);

  const channelRow = await queryOne(`
    SELECT
      COUNT(*)::int AS total_channels,
      COUNT(*) FILTER (WHERE enabled)::int AS active_channels
    FROM ai_studio.provider_models
  `);

  // 2. 核心旗舰家族状态扫描
  const targetIds = CANONICAL_GROUPS.map((g) => g.targetId);
  const coreModels = await queryMany(`
    SELECT
      m.id, m.name, m.display_name, m.category, m.tier, m.is_visible, m.status,
      COALESCE(ch.channel_count, 0)::int AS channel_count,
      COALESCE(ch.providers, '[]'::jsonb) AS providers
    FROM ai_studio.ai_models m
    LEFT JOIN LATERAL (
      SELECT
        COUNT(*)::int AS channel_count,
        jsonb_agg(DISTINCT pm.provider_id) FILTER (WHERE pm.provider_id IS NOT NULL) AS providers
      FROM ai_studio.provider_models pm
      WHERE pm.model_id = m.id
    ) ch ON TRUE
    WHERE m.id = ANY($1)
    ORDER BY m.category ASC, m.sort ASC
  `, [targetIds]);

  const coreModelMap = new Map(coreModels.map((m) => [m.id, m]));

  const canonicalFamilies = CANONICAL_GROUPS.map((group) => {
    const live = coreModelMap.get(group.targetId);
    return {
      targetId: group.targetId,
      name: group.name,
      displayName: group.display_name,
      category: group.category,
      aliases: group.aliases,
      aliasCount: group.aliases.length,
      channelCount: live?.channel_count || 0,
      providers: live?.providers || [],
      isLive: Boolean(live?.is_visible && live?.status === 'active'),
    };
  });

  // 3. 扫描未合并的疑似动作变体与重复模型 (Unmerged Candidates)
  // 例如带有 -text-to-video, -image-to-video, -t2v, -i2v 等后缀，且当前未在规范列表中或未被禁用的模型
  const allAliasesSet = new Set();
  CANONICAL_GROUPS.forEach((g) => {
    allAliasesSet.add(g.targetId);
    g.aliases.forEach((a) => allAliasesSet.add(a));
  });

  const rawCandidates = await queryMany(`
    SELECT
      m.id, m.name, m.display_name, m.category, m.tier, m.is_visible, m.status,
      COALESCE(ch.channel_count, 0)::int AS channel_count
    FROM ai_studio.ai_models m
    LEFT JOIN LATERAL (
      SELECT COUNT(*)::int AS channel_count
      FROM ai_studio.provider_models pm
      WHERE pm.model_id = m.id
    ) ch ON TRUE
    WHERE m.status != 'disabled'
      AND m.tier != 'core'
      AND (
        m.id LIKE '%-text-to-%'
        OR m.id LIKE '%-image-to-%'
        OR m.id LIKE '%-t2v%'
        OR m.id LIKE '%-i2v%'
        OR m.id LIKE '%-t2i%'
        OR m.id LIKE '%-i2i%'
        OR m.id LIKE '%-standard%'
        OR m.id LIKE '%-turbo%'
      )
    ORDER BY ch.channel_count DESC, m.id ASC
    LIMIT 100
  `);

  // 智能推荐目标
  const unmergedCandidates = rawCandidates
    .filter((c) => !allAliasesSet.has(c.id))
    .slice(0, 30)
    .map((item) => {
      let suggestedTarget = null;
      for (const group of CANONICAL_GROUPS) {
        const root = group.targetId.split('-')[0];
        if (item.id.toLowerCase().includes(root.toLowerCase())) {
          suggestedTarget = group.targetId;
          break;
        }
      }
      return {
        ...item,
        suggestedTarget,
      };
    });

  return {
    summary: {
      totalModels: summaryRow?.total_models || 0,
      coreVisibleCount: summaryRow?.core_visible_count || 0,
      backupCount: summaryRow?.backup_count || 0,
      disabledCount: summaryRow?.disabled_count || 0,
      totalChannels: channelRow?.total_channels || 0,
      activeChannels: channelRow?.active_channels || 0,
      canonicalTotal: CANONICAL_GROUPS.length,
    },
    canonicalFamilies,
    unmergedCandidates,
  };
}

/**
 * 将某个别名模型一键合并到规范目标模型中
 */
export async function mergeModelAlias({ sourceModelId, targetModelId, actor }) {
  if (!sourceModelId || !targetModelId) {
    throw new Error('sourceModelId 和 targetModelId 均为必填项');
  }
  if (sourceModelId === targetModelId) {
    throw new Error('源模型与目标规范模型不能相同');
  }

  const result = await withTransaction(async (tx) => {
    // 验证目标模型是否存在
    const target = await tx.queryOne('SELECT id, name FROM ai_studio.ai_models WHERE id = $1', [targetModelId]);
    if (!target) {
      throw new Error(`目标规范模型 [${targetModelId}] 不存在`);
    }

    // 查询源模型的渠道
    const sourceChannels = await tx.queryMany(
      'SELECT id, provider_id, provider_model_id FROM ai_studio.provider_models WHERE model_id = $1',
      [sourceModelId]
    );

    let migrated = 0;
    let deduped = 0;

    for (const ch of sourceChannels) {
      const conflict = await tx.queryOne(
        'SELECT id FROM ai_studio.provider_models WHERE model_id = $1 AND provider_id = $2 AND provider_model_id = $3',
        [targetModelId, ch.provider_id, ch.provider_model_id]
      );

      if (!conflict) {
        await tx.execute('UPDATE ai_studio.provider_models SET model_id = $1, updated_at = now() WHERE id = $2', [targetModelId, ch.id]);
        migrated++;
      } else {
        await tx.execute(
          'UPDATE ai_studio.provider_catalog_entries SET mapped_provider_model_id = $1 WHERE mapped_provider_model_id = $2',
          [conflict.id, ch.id]
        );
        await tx.execute(
          'DELETE FROM ai_studio.provider_model_price_versions WHERE provider_model_id = $1',
          [ch.id]
        );
        await tx.execute('DELETE FROM ai_studio.provider_models WHERE id = $1', [ch.id]);
        deduped++;
      }
    }

    // 将源模型禁用并标记为备份，设置 backup_model_id 与 auto_route_eligible
    await tx.execute(`
      UPDATE ai_studio.ai_models
      SET status = 'disabled', is_visible = false, tier = 'backup',
          auto_route_eligible = false, backup_model_id = $2,
          description = $3, updated_at = now()
      WHERE id = $1
    `, [sourceModelId, targetModelId, `已合并至规范模型 [${targetModelId}] (操作人: ${actor?.email || actor?.name || 'admin'})`]);

    return { migrated, deduped, targetName: target.name };
  });

  invalidateActiveModelsCache();
  return result;
}

/**
 * 一键重新运行全库去重与收敛同步
 */
export async function runFullHygieneSync() {
  const stats = await executeDeduplication();
  invalidateActiveModelsCache();
  return stats;
}
