import 'server-only';

import { queryMany, queryOne } from '../db/index.js';

const USD_TO_CNY_RATE = 7.2;

/**
 * 获取全网模型调用真实遥测大盘 (Model Telemetry & Analytics Hub)
 * 100% 直读 PostgreSQL ai_studio 核心业务表，绝不伪造任何数据
 */
export async function getModelTelemetryOverview({ timeRange = '24h', limit = 50 } = {}) {
  const rangeSql = timeRange === '30d'
    ? "INTERVAL '30 days'"
    : timeRange === '7d'
    ? "INTERVAL '7 days'"
    : "INTERVAL '24 hours'";

  try {
    // 1. 全网核心 KPI 指标
    const kpiRow = await queryOne(`
      SELECT
        COUNT(att.id)::int AS total_calls,
        COALESCE(SUM(CASE WHEN att.status = 'succeeded' THEN 1 ELSE 0 END), 0)::int AS success_calls,
        COALESCE(SUM(CASE WHEN att.status = 'failed' OR att.status = 'timeout' THEN 1 ELSE 0 END), 0)::int AS failed_calls,
        COALESCE(ROUND(AVG(att.duration_ms) FILTER (WHERE att.duration_ms > 0)), 0)::int AS avg_duration_ms,
        COALESCE(ROUND(PERCENTILE_CONT(0.50) WITHIN GROUP (ORDER BY att.duration_ms) FILTER (WHERE att.duration_ms > 0))::numeric, 0)::int AS p50_duration_ms,
        COALESCE(ROUND(PERCENTILE_CONT(0.90) WITHIN GROUP (ORDER BY att.duration_ms) FILTER (WHERE att.duration_ms > 0))::numeric, 0)::int AS p90_duration_ms,
        COALESCE(SUM(att.actual_cost_usd), 0)::numeric(18, 4) AS total_cost_usd,
        COALESCE(SUM(c.credit_cost), 0)::int AS total_credits_deducted,
        COUNT(DISTINCT COALESCE(c.model, att.provider_model_id))::int AS active_models_count
      FROM ai_studio.generation_attempts att
      LEFT JOIN ai_studio.creations c ON c.id = att.creation_id
      WHERE att.created_at >= NOW() - ${rangeSql}
    `);

    const totalCalls = Number(kpiRow?.total_calls || 0);
    const successCalls = Number(kpiRow?.success_calls || 0);
    const failedCalls = Number(kpiRow?.failed_calls || 0);
    const successRate = totalCalls > 0 ? Number(((successCalls / totalCalls) * 100).toFixed(1)) : 100;
    const avgDurationMs = Number(kpiRow?.avg_duration_ms || 0);
    const p50DurationMs = Number(kpiRow?.p50_duration_ms || 0);
    const p90DurationMs = Number(kpiRow?.p90_duration_ms || 0);
    const totalCostUsd = Number(kpiRow?.total_cost_usd || 0);
    const totalCostCny = Number((totalCostUsd * USD_TO_CNY_RATE).toFixed(2));
    const totalCreditsDeducted = Number(kpiRow?.total_credits_deducted || 0);
    const activeModelsCount = Number(kpiRow?.active_models_count || 0);

    // 2. 模型调用排行榜 (Top Models by Calls)
    const topModels = await queryMany(`
      SELECT
        COALESCE(m.id, c.model, att.provider_model_id, 'unknown') AS model_id,
        COALESCE(m.display_name, m.name, c.model, att.provider_model_id, '未知模型') AS model_name,
        COALESCE(m.category, 'image') AS category,
        COALESCE(m.tier, 'backup') AS tier,
        COALESCE(m.is_visible, true) AS is_visible,
        COUNT(att.id)::int AS total_calls,
        COALESCE(SUM(CASE WHEN att.status = 'succeeded' THEN 1 ELSE 0 END), 0)::int AS success_calls,
        COALESCE(SUM(CASE WHEN att.status = 'failed' OR att.status = 'timeout' THEN 1 ELSE 0 END), 0)::int AS failed_calls,
        CASE
          WHEN COUNT(att.id) > 0 THEN
            ROUND((SUM(CASE WHEN att.status = 'succeeded' THEN 1 ELSE 0 END)::numeric / COUNT(att.id)::numeric) * 100, 1)
          ELSE 100
        END AS success_rate,
        COALESCE(ROUND(AVG(att.duration_ms) FILTER (WHERE att.duration_ms > 0)), 0)::int AS avg_duration_ms,
        COALESCE(ROUND(PERCENTILE_CONT(0.90) WITHIN GROUP (ORDER BY att.duration_ms) FILTER (WHERE att.duration_ms > 0))::numeric, 0)::int AS p90_duration_ms,
        COALESCE(SUM(att.actual_cost_usd), 0)::numeric(18, 4) AS cost_usd,
        COALESCE(SUM(c.credit_cost), 0)::int AS credits_deducted
      FROM ai_studio.generation_attempts att
      LEFT JOIN ai_studio.creations c ON c.id = att.creation_id
      LEFT JOIN ai_studio.ai_models m ON m.id = c.model OR m.slug = c.model
      WHERE att.created_at >= NOW() - ${rangeSql}
      GROUP BY
        COALESCE(m.id, c.model, att.provider_model_id, 'unknown'),
        COALESCE(m.display_name, m.name, c.model, att.provider_model_id, '未知模型'),
        COALESCE(m.category, 'image'),
        COALESCE(m.tier, 'backup'),
        COALESCE(m.is_visible, true)
      ORDER BY total_calls DESC
      LIMIT $1
    `, [Math.max(Number(limit) || 50, 5)]);

    // 3. 错误归因分类统计 (Error Taxonomy)
    const rawErrors = await queryMany(`
      SELECT
        COALESCE(att.error_code, 'UNKNOWN') AS error_code,
        COALESCE(att.error_reason, '未捕获原因') AS error_reason,
        COUNT(att.id)::int AS count
      FROM ai_studio.generation_attempts att
      WHERE (att.status = 'failed' OR att.status = 'timeout')
        AND att.created_at >= NOW() - ${rangeSql}
      GROUP BY att.error_code, att.error_reason
      ORDER BY count DESC
      LIMIT 50
    `);

    // 聚类归因统计
    const categoryBuckets = {
      SAFETY_FILTER: { label: '内容合规阻断 (Safety / NSFW)', count: 0, examples: [] },
      RATE_LIMIT: { label: '上游并发限流 (Rate Limit 429)', count: 0, examples: [] },
      TIMEOUT: { label: '推理/网关超时 (Timeout)', count: 0, examples: [] },
      NETWORK: { label: '网络或连接中断 (Network Error)', count: 0, examples: [] },
      PARAM_ERROR: { label: '入参格式非法 (Bad Request 400)', count: 0, examples: [] },
      OTHER: { label: '其他/通道异常 (Channel Error)', count: 0, examples: [] },
    };

    for (const item of rawErrors) {
      const code = String(item.error_code || '').toLowerCase();
      const reason = String(item.error_reason || '').toLowerCase();
      const count = Number(item.count || 0);

      let bucketKey = 'OTHER';
      if (code.includes('safety') || code.includes('sensitive') || code.includes('nsfw') || code.includes('audit') || reason.includes('违规') || reason.includes('敏感') || reason.includes('合规')) {
        bucketKey = 'SAFETY_FILTER';
      } else if (code.includes('429') || code.includes('rate') || code.includes('quota') || code.includes('limit') || reason.includes('频次') || reason.includes('限流')) {
        bucketKey = 'RATE_LIMIT';
      } else if (code.includes('timeout') || code.includes('504') || reason.includes('超时')) {
        bucketKey = 'TIMEOUT';
      } else if (code.includes('econn') || code.includes('fetch') || code.includes('network') || code.includes('502') || code.includes('503')) {
        bucketKey = 'NETWORK';
      } else if (code.includes('400') || code.includes('param') || code.includes('invalid') || reason.includes('参数')) {
        bucketKey = 'PARAM_ERROR';
      }

      categoryBuckets[bucketKey].count += count;
      if (categoryBuckets[bucketKey].examples.length < 3) {
        categoryBuckets[bucketKey].examples.push(`${item.error_code}: ${String(item.error_reason).slice(0, 80)}`);
      }
    }

    const errorTaxonomy = Object.entries(categoryBuckets)
      .map(([key, data]) => ({
        categoryKey: key,
        label: data.label,
        count: data.count,
        percentage: failedCalls > 0 ? Number(((data.count / failedCalls) * 100).toFixed(1)) : 0,
        examples: data.examples,
      }))
      .filter((b) => b.count > 0)
      .sort((a, b) => b.count - a.count);

    return {
      timeRange,
      kpi: {
        totalCalls,
        successCalls,
        failedCalls,
        successRate,
        avgDurationMs,
        p50DurationMs,
        p90DurationMs,
        totalCostUsd,
        totalCostCny,
        totalCreditsDeducted,
        activeModelsCount,
      },
      topModels,
      errorTaxonomy,
    };
  } catch (err) {
    console.error('[modelTelemetry] Failed to aggregate telemetry:', err);
    return {
      timeRange,
      kpi: {
        totalCalls: 0,
        successCalls: 0,
        failedCalls: 0,
        successRate: 100,
        avgDurationMs: 0,
        p50DurationMs: 0,
        p90DurationMs: 0,
        totalCostUsd: 0,
        totalCostCny: 0,
        totalCreditsDeducted: 0,
        activeModelsCount: 0,
      },
      topModels: [],
      errorTaxonomy: [],
      error: err.message,
    };
  }
}
