/**
 * Migration: 创建 pricing_strategy 表 + 扩展 model_pricing 表
 *
 * 运行方式: node scripts/migrations/add-pricing-strategy.mjs
 *
 * 此脚本幂等：重复运行不会报错。
 */

import pg from 'pg';

const client = new pg.Client({ connectionString: process.env.DATABASE_URL });

async function run(sql) {
  const result = await client.query(sql);
  return result.rows?.[0] ?? null;
}

async function migrate() {
  await client.connect();
  console.log('[migration] 开始创建 pricing_strategy 表...');

  await run(`
    CREATE TABLE IF NOT EXISTS ai_studio.pricing_strategy (
      id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      name            TEXT NOT NULL DEFAULT 'default',

      -- 倍率定价
      base_multiplier       NUMERIC(6,3) NOT NULL DEFAULT 1.500,
      min_margin_rate       NUMERIC(5,4) NOT NULL DEFAULT 0.3000,
      rounding_strategy     TEXT NOT NULL DEFAULT 'ceil_to_0.01',

      -- 分类倍率覆盖
      category_multipliers  JSONB DEFAULT '{}',

      -- 分级倍率覆盖
      tier_multipliers      JSONB DEFAULT '{}',

      -- 规格级倍率修正 (分辨率/时长分档)
      -- 示例: {"resolution":{"4k":2.0,"2k":1.5,"1k":1.0,"720p":0.8},"duration":{"60s":2.5,"30s":1.8,"10s":1.2,"5s":1.0}}
      spec_multipliers      JSONB DEFAULT '{}',

      is_active       BOOLEAN DEFAULT true,
      updated_by      UUID,
      created_at      TIMESTAMPTZ DEFAULT now(),
      updated_at      TIMESTAMPTZ DEFAULT now()
    )
  `);
  console.log('[migration] ✅ pricing_strategy 表已创建');

  // 扩展 model_pricing 表
  const alterStatements = [
    `ALTER TABLE ai_studio.model_pricing ADD COLUMN IF NOT EXISTS pricing_mode TEXT DEFAULT 'auto' CHECK (pricing_mode IN ('auto', 'manual', 'locked'))`,
    `ALTER TABLE ai_studio.model_pricing ADD COLUMN IF NOT EXISTS auto_suggested_price_cny NUMERIC(12,4)`,
    `ALTER TABLE ai_studio.model_pricing ADD COLUMN IF NOT EXISTS manual_override_price_cny NUMERIC(12,4)`,
    `ALTER TABLE ai_studio.model_pricing ADD COLUMN IF NOT EXISTS effective_multiplier NUMERIC(6,3)`,
    `ALTER TABLE ai_studio.model_pricing ADD COLUMN IF NOT EXISTS locked_by UUID`,
    `ALTER TABLE ai_studio.model_pricing ADD COLUMN IF NOT EXISTS locked_at TIMESTAMPTZ`,
    `ALTER TABLE ai_studio.model_pricing ADD COLUMN IF NOT EXISTS lock_reason TEXT`,
  ];

  for (const sql of alterStatements) {
    try {
      await run(sql);
    } catch (err) {
      if (!err.message?.includes('already exists')) {
        console.warn(`[migration] ⚠️ ${sql.slice(0, 60)}... → ${err.message}`);
      }
    }
  }
  console.log('[migration] ✅ model_pricing 表已扩展');

  // 插入默认策略（如果不存在）
  const existing = await run(`SELECT id FROM ai_studio.pricing_strategy WHERE is_active = true LIMIT 1`);
  if (!existing) {
    await run(`
      INSERT INTO ai_studio.pricing_strategy (
        name, base_multiplier, min_margin_rate,
        category_multipliers, tier_multipliers, spec_multipliers, is_active
      ) VALUES (
        'default', 1.500, 0.3000,
        '{"image": 1.5, "video": 2.0, "audio": 1.3, "workflow": 1.8}',
        '{"core": 1.0, "backup": 1.0, "experimental": 1.2}',
        '{"resolution": {"4k": 2.0, "2k": 1.5, "1k": 1.0, "720p": 0.8}, "duration": {"60s": 2.5, "30s": 1.8, "10s": 1.2, "5s": 1.0}}',
        true
      )
    `);
    console.log('[migration] ✅ 默认定价策略已插入（含分辨率/时长分档倍率）');
  } else {
    console.log('[migration] ℹ️ 已存在活跃定价策略，跳过插入');
  }

  await client.end();
  console.log('[migration] 🎉 全部完成');
}

migrate().catch((err) => {
  console.error('[migration] ❌ 迁移失败:', err);
  client.end();
  process.exit(1);
});
