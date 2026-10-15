import 'server-only';
import { execute, queryMany, queryOne, withTransaction } from '../lib/db/index.js';

export const SEEDREAM_EDITION_SPECS = [
  {
    targetId: 'seedream-5.0-pro',
    name: 'Seedream 5.0 Pro',
    displayName: 'Seedream 5.0 Pro',
    description: '商业设计、影视、高密度图文等场景效果全面提升',
    badge: '✦',
    sort: 1,
    baseCredits: 28,
    preferredProvider: 'volcengine',
    aliases: [
      'bytedance-seedream-5.0-pro',
      'bytedance-seedream-5.0-pro-layer',
      'seedream-5.0-pro-layer',
      'rh-seedream-v5-pro-text-to-image-dcff0bca',
      'rh-seedream-v5-pro-image-to-image-57ba8f7a',
    ],
  },
  {
    targetId: 'seedream-5.0-flash',
    name: 'Seedream 5.0 Flash',
    displayName: 'Seedream 5.0 Flash',
    description: '轻量化版 Seedream 5.0 Pro，更快更便宜',
    badge: 'FLASH',
    sort: 2,
    baseCredits: 18,
    preferredProvider: 'volcengine',
    aliases: [
      'bytedance-seedream-5.0-flash',
      'seedream-5.0-turbo',
      'doubao-seedream-5-0-flash',
    ],
  },
  {
    targetId: 'seedream-5.0-lite',
    name: 'Seedream 5.0 Lite',
    displayName: 'Seedream 5.0 Lite',
    description: '指令响应更精准，生成效果更智能',
    badge: null,
    sort: 3,
    baseCredits: 12,
    preferredProvider: 'runninghub',
    aliases: [
      'bytedance-seedream-5.0-lite',
      'rh-seedream-v5-lite-text-to-image-777f2fb2',
      'rh-seedream-v5-lite-image-to-image-aa2ad229',
    ],
  },
  {
    targetId: 'seedream-4.5',
    name: 'Seedream 4.7',
    displayName: 'Seedream 4.7',
    description: '画质全面优化，指令响应能力再次提升',
    badge: null,
    sort: 4,
    baseCredits: 15,
    preferredProvider: 'volcengine',
    aliases: [
      'bytedance-seedream-v4.5',
      'seedream-4.7',
      'rh-seedream-v4-5-text-to-image-abdf51f3',
      'rh-seedream-v4-5-image-to-image-5cfd3a16',
      'rh-seedream-v4-text-to-image-cedcaeb6',
      'rh-seedream-v4-image-to-image-e7d7e32b',
    ],
  },
];

export async function executeSeedreamReclassification() {
  console.log('====================================================');
  console.log('🚀 [SupDance] 开始执行 Seedream 家族规格矩阵精细化重构');
  console.log('====================================================');

  const stats = {
    modelsConfigured: 0,
    channelsBound: 0,
    channelsCreated: 0,
    aliasesUpdated: 0,
  };

  await withTransaction(async (tx) => {
    // 1. 确保核心旗舰规格模型在 ai_studio.ai_models 中注册并激活
    for (const spec of SEEDREAM_EDITION_SPECS) {
      const { targetId, name, displayName, description, badge, sort, baseCredits, preferredProvider } = spec;

      const existing = await tx.queryOne('SELECT id FROM ai_studio.ai_models WHERE id = $1', [targetId]);
      if (!existing) {
        await tx.execute(`
          INSERT INTO ai_studio.ai_models (
            id, slug, name, display_name, category, description, status,
            tier, is_visible, sort, is_featured, is_pinned, auto_route_eligible,
            capabilities, created_at, updated_at
          ) VALUES (
            $1, $1, $2, $3, 'image', $4, 'active',
            'core', true, $5, true, false, true,
            $6, now(), now()
          )
        `, [
          targetId,
          name,
          displayName,
          description,
          sort,
          JSON.stringify({ badge, is_pinned: false }),
        ]);
      } else {
        await tx.execute(`
          UPDATE ai_studio.ai_models
          SET name = $2, display_name = $3, category = 'image', description = $4,
              status = 'active', tier = 'core', is_visible = true, sort = $5,
              auto_route_eligible = true,
              capabilities = jsonb_set(COALESCE(capabilities, '{}'::jsonb), '{badge}', $6::jsonb, true),
              updated_at = now()
          WHERE id = $1
        `, [
          targetId,
          name,
          displayName,
          description,
          sort,
          badge ? JSON.stringify(badge) : 'null',
        ]);
      }
      stats.modelsConfigured++;

      // 配置标准阶梯定价策略
      await tx.execute(`
        INSERT INTO ai_studio.model_pricing
          (id, model_id, pricing_type, base_credits, formula_config, subscription_discounts, min_credits, min_gross_margin_rate, is_active, created_at, updated_at)
        VALUES
          ($1, $2, 'fixed', $3, '{}'::jsonb, '{}'::jsonb, 5, 0.7500, true, now(), now())
        ON CONFLICT (model_id) DO UPDATE SET
          base_credits = EXCLUDED.base_credits,
          is_active = true,
          updated_at = now()
      `, [`prc_${targetId.replace(/[-.]/g, '_')}`, targetId, baseCredits]);

      // 配置路由策略
      await tx.execute(`
        INSERT INTO ai_studio.routing_policies
          (id, model_id, routing_mode, weights, circuit_breaker_config, failover_enabled, created_at, updated_at)
        VALUES
          ($1, $2, 'cost', '{"cost":0.5,"success_rate":0.3,"speed":0.2,"capacity":0.0}'::jsonb,
           '{"failure_threshold":3,"cooling_period_sec":60,"half_open_requests":2}'::jsonb, true, now(), now())
        ON CONFLICT (model_id) DO UPDATE SET
          failover_enabled = true,
          updated_at = now()
      `, [`rp_${targetId.replace(/[-.]/g, '_')}`, targetId]);
    }

    // 2. 将旧的通用 seedream-5.0 标记为兼容别名，指向 seedream-5.0-pro
    await tx.execute(`
      UPDATE ai_studio.ai_models
      SET status = 'disabled', tier = 'backup', is_visible = false, auto_route_eligible = false,
          backup_model_id = 'seedream-5.0-pro', description = '通用标识，已自动定向至 Seedream 5.0 Pro',
          updated_at = now()
      WHERE id = 'seedream-5.0'
    `);
    stats.aliasesUpdated++;

    // 3. 精准解耦与重新挂载物理渠道
    // -------------------------------------------------------------
    // 3.1 处理 Seedream 5.0 Pro 渠道
    // -------------------------------------------------------------
    // (a) RunningHub Pro 渠道 -> seedream-5.0-pro
    const rhProRes = await tx.execute(`
      UPDATE ai_studio.provider_models
      SET model_id = 'seedream-5.0-pro', updated_at = now()
      WHERE provider_id = 'runninghub'
        AND provider_model_id LIKE '%v5-pro%'
    `);
    stats.channelsBound += rhProRes.rowCount || 0;

    // (b) Volcengine 5.0 Pro 渠道 -> 确保存在并挂载到 seedream-5.0-pro
    const volcProExisting = await tx.queryOne(`
      SELECT id FROM ai_studio.provider_models
      WHERE provider_id = 'volcengine' AND provider_model_id = 'doubao-seedream-5-0-pro-260628'
    `);
    if (!volcProExisting) {
      await tx.execute(`
        INSERT INTO ai_studio.provider_models (
          id, model_id, provider_id, provider_model_id, enabled, priority,
          cost_config, metadata, created_at, updated_at
        ) VALUES (
          'pm_seedream_5_0_pro_volcengine', 'seedream-5.0-pro', 'volcengine',
          'doubao-seedream-5-0-pro-260628', true, 120,
          '{"currency":"CNY","base_cost":0.08}'::jsonb,
          '{"primary":true,"category":"image"}'::jsonb,
          now(), now()
        )
      `);
      stats.channelsCreated++;
    } else {
      await tx.execute(`
        UPDATE ai_studio.provider_models
        SET model_id = 'seedream-5.0-pro', enabled = true, priority = 120,
            metadata = jsonb_set(COALESCE(metadata, '{}'::jsonb), '{primary}', 'true'::jsonb, true),
            updated_at = now()
        WHERE id = $1
      `, [volcProExisting.id]);
    }

    // (c) BytePlus Pro 渠道 -> 确保存在并挂载到 seedream-5.0-pro
    const byteProExisting = await tx.queryOne(`
      SELECT id FROM ai_studio.provider_models
      WHERE provider_id = 'byteplus' AND (provider_model_id = 'seedream-5.0-pro' OR provider_model_id = 'dola-seedream-5-0-pro-260628')
    `);
    if (!byteProExisting) {
      await tx.execute(`
        INSERT INTO ai_studio.provider_models (
          id, model_id, provider_id, provider_model_id, enabled, priority,
          cost_config, metadata, created_at, updated_at
        ) VALUES (
          'pm_seedream_5_0_pro_byteplus', 'seedream-5.0-pro', 'byteplus',
          'seedream-5.0-pro', true, 110,
          '{"currency":"USD","base_cost":0.035}'::jsonb,
          '{"category":"image"}'::jsonb,
          now(), now()
        )
      `);
      stats.channelsCreated++;
    } else {
      await tx.execute(`
        UPDATE ai_studio.provider_models
        SET model_id = 'seedream-5.0-pro', enabled = true, updated_at = now()
        WHERE id = $1
      `, [byteProExisting.id]);
    }

    // -------------------------------------------------------------
    // 3.2 处理 Seedream 5.0 Flash 渠道
    // -------------------------------------------------------------
    // Volcengine 5.0 (260128) 作为极速版核心官方渠道
    const volcFlashCh = await tx.queryOne(`
      SELECT id FROM ai_studio.provider_models
      WHERE provider_id = 'volcengine' AND provider_model_id = 'doubao-seedream-5-0-260128'
    `);
    if (volcFlashCh) {
      await tx.execute(`
        UPDATE ai_studio.provider_models
        SET model_id = 'seedream-5.0-flash', enabled = true, priority = 110,
            metadata = jsonb_set(COALESCE(metadata, '{}'::jsonb), '{primary}', 'true'::jsonb, true),
            updated_at = now()
        WHERE id = $1
      `, [volcFlashCh.id]);
      stats.channelsBound++;
    }

    // -------------------------------------------------------------
    // 3.3 处理 Seedream 5.0 Lite 渠道
    // -------------------------------------------------------------
    // (a) RunningHub Lite 渠道 -> seedream-5.0-lite
    const rhLiteRes = await tx.execute(`
      UPDATE ai_studio.provider_models
      SET model_id = 'seedream-5.0-lite', enabled = true,
          metadata = jsonb_set(COALESCE(metadata, '{}'::jsonb), '{primary}', 'true'::jsonb, true),
          updated_at = now()
      WHERE provider_id = 'runninghub'
        AND provider_model_id LIKE '%v5-lite%'
    `);
    stats.channelsBound += rhLiteRes.rowCount || 0;

    // (b) BytePlus 5.0 Lite 渠道 -> seedream-5.0-lite
    const byteLiteCh = await tx.queryOne(`
      SELECT id FROM ai_studio.provider_models
      WHERE provider_id = 'byteplus' AND provider_model_id = 'seedream-5.0'
    `);
    if (byteLiteCh) {
      await tx.execute(`
        UPDATE ai_studio.provider_models
        SET model_id = 'seedream-5.0-lite', enabled = true, updated_at = now()
        WHERE id = $1
      `, [byteLiteCh.id]);
      stats.channelsBound++;
    }

    // -------------------------------------------------------------
    // 3.4 处理 Seedream 4.7 (原 4.5) 渠道
    // -------------------------------------------------------------
    const ch45Res = await tx.execute(`
      UPDATE ai_studio.provider_models
      SET enabled = true, priority = 120,
          metadata = jsonb_set(COALESCE(metadata, '{}'::jsonb), '{primary}', 'true'::jsonb, true),
          updated_at = now()
      WHERE id = 'pm_seedream_4_5_volcengine'
    `);
    stats.channelsBound += ch45Res.rowCount || 0;

    // -------------------------------------------------------------
    // 3.5 完善所有 Seedream 渠道准入元数据（endpoint, review_status, price_versions）
    // -------------------------------------------------------------
    const seedreamModels = ['seedream-5.0-pro', 'seedream-5.0-flash', 'seedream-5.0-lite', 'seedream-4.5'];

    // 设置标准的 endpoint 和 approved 状态
    await tx.execute(`
      UPDATE ai_studio.provider_models
      SET review_status = 'approved',
          provider_endpoint = CASE
            WHEN provider_id IN ('volcengine', 'byteplus') THEN '/images/generations'
            WHEN provider_id = 'runninghub' THEN '/task/openapi/create'
            ELSE '/images/generations'
          END,
          updated_at = now()
      WHERE model_id = ANY($1)
    `, [seedreamModels]);

    // 补充活跃价格版本，确保健康度与公开准入通过
    const channelsNeedPrice = [
      { id: 'pver_seedream_5_0_pro_volcengine_v1', pm_id: 'pm_seedream_5_0_pro_volcengine', cost: 0.08, currency: 'CNY' },
      { id: 'pver_seedream_5_0_pro_byteplus_v1', pm_id: 'pm_seedream_5_0_pro_byteplus', cost: 0.035, currency: 'USD' },
      { id: 'pver_seedream_5_0_flash_volcengine_v1', pm_id: 'pm_seedream_5_0_volcengine', cost: 0.04, currency: 'CNY' },
      { id: 'pver_seedream_4_5_volcengine_v1', pm_id: 'pm_seedream_4_5_volcengine', cost: 0.05, currency: 'CNY' },
    ];

    for (const p of channelsNeedPrice) {
      await tx.execute(`
        INSERT INTO ai_studio.provider_model_price_versions
          (id, provider_model_id, version_no, price_type, billing_unit, currency, price_config, status, source_observed_at, fetched_at, effective_at, created_at)
        VALUES
          ($1, $2, 1, 'account_actual', 'per_request', $3::text, jsonb_build_object('currency', $3::text, 'base_cost', $4::numeric), 'active', now(), now(), now(), now())
        ON CONFLICT (provider_model_id, version_no) DO UPDATE SET
          price_config = EXCLUDED.price_config,
          status = 'active',
          source_observed_at = now(),
          effective_at = now()
      `, [p.id, p.pm_id, String(p.currency), Number(p.cost)]);
    }

    // 启用 runninghub 提供商
    await tx.execute(`
      UPDATE ai_studio.ai_providers
      SET enabled = true, updated_at = now()
      WHERE id = 'runninghub'
    `);

    // 4. 将历史别名指向新版规范模型
    for (const spec of SEEDREAM_EDITION_SPECS) {
      for (const alias of spec.aliases) {
        await tx.execute(`
          UPDATE ai_studio.ai_models
          SET status = 'disabled', tier = 'backup', is_visible = false,
              auto_route_eligible = false, backup_model_id = $1,
              description = $2, updated_at = now()
          WHERE id = $3
        `, [spec.targetId, `已自动归并至规范规格 [${spec.targetId}]`, alias]);
        stats.aliasesUpdated++;
      }
    }
  });

  console.log('====================================================');
  console.log('✅ Seedream 家族规格精细化重构完成！');
  console.log(`- 注册并激活规格模型: ${stats.modelsConfigured} 个 (Pro, Flash, Lite, 4.7)`);
  console.log(`- 精确解绑并挂载渠道: ${stats.channelsBound} 个`);
  console.log(`- 新建原生官方渠道: ${stats.channelsCreated} 个`);
  console.log(`- 更新别名重定向: ${stats.aliasesUpdated} 个`);
  console.log('====================================================');
  return stats;
}

if (process.argv[1] && process.argv[1].endsWith('reclassify-seedream-editions.mjs')) {
  executeSeedreamReclassification()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('Fatal error during Seedream reclassification:', err);
      process.exit(1);
    });
}
