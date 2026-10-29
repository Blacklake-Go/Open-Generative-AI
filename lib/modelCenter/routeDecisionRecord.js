import { normalizeRouteCostCeiling } from './routePricing.js';

/**
 * 调度选择记录的唯一组装点。
 *
 * 一条可追溯的选择记录必须能回答：用的是哪版策略、哪些线路合格、哪些被排除、
 * 实际选中哪个 Provider/模型/端点、映射与价格版本、成本与汇率快照、预算上限，
 * 以及后续 attempt 的 receipt、重试和终态。前七项在选择时已知，写在
 * route_decision_logs；receipt/重试/终态发生在执行期，由 attempt 通过
 * route_decision_id 关联回同一条记录。
 */
export const ROUTE_DECISION_RECORD_VERSION = 'route-decision-record-v1';

function finiteNumber(value) {
  // Number(null) === 0，会把"未知上限"写成 0，因此先按缺失处理。
  if (value === null || value === undefined || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function mappingOf(candidate) {
  return candidate?.providerModel || {};
}

function mappingVersionOf(mapping) {
  const version = Number(mapping?.mapping_version);
  return Number.isFinite(version) ? version : null;
}

export function summarizeSelectedRoute(winner) {
  if (!winner) return null;
  const mapping = mappingOf(winner);
  return {
    providerId: winner.providerId ?? null,
    providerModelId: winner.providerModelId ?? null,
    providerEndpoint: mapping.provider_endpoint ?? null,
    providerModelVersion: mapping.provider_model_version ?? null,
    mappingId: mapping.id ?? null,
    mappingVersion: mappingVersionOf(mapping),
    priceVersionId: winner.priceVersionId ?? null,
    priceType: winner.priceType ?? null,
    estimatedCostCny: finiteNumber(winner.estimatedCostCny),
    estimatedCostUsd: finiteNumber(winner.estimatedCostUsd),
    estimatedCostCurrency: winner.estimatedCostCurrency ?? null,
    estimatedCostSource: winner.estimatedCostSource ?? null,
    fxSnapshot: winner.fxSnapshot ?? null,
  };
}

/**
 * 合格候选的完整快照：不只记录分数，还要能复核“当时这条线路的端点、映射版本、
 * 价格版本和成本口径”。健康证据随候选保留探针等级，不把凭据检查说成连通验证。
 */
export function summarizeEligibleCandidates({ candidates = [], scores = [] } = {}) {
  const scoreByModelId = new Map((scores || []).map((score) => [score.providerModelId, score]));
  return (candidates || []).map((candidate) => {
    const mapping = mappingOf(candidate);
    const score = scoreByModelId.get(candidate.providerModelId) || null;
    return {
      providerId: candidate.providerId ?? null,
      providerModelId: candidate.providerModelId ?? null,
      providerEndpoint: mapping.provider_endpoint ?? null,
      providerModelVersion: mapping.provider_model_version ?? null,
      mappingId: mapping.id ?? null,
      mappingVersion: mappingVersionOf(mapping),
      priceVersionId: candidate.priceVersionId ?? null,
      priceType: candidate.priceType ?? null,
      priority: score ? score.priority : (Number(candidate.priority) || 0),
      estimatedCostCny: finiteNumber(candidate.estimatedCostCny),
      estimatedCostUsd: finiteNumber(candidate.estimatedCostUsd),
      estimatedCostCurrency: candidate.estimatedCostCurrency ?? null,
      estimatedCostSource: candidate.estimatedCostSource ?? null,
      fxSnapshot: candidate.fxSnapshot ?? null,
      healthStatus: candidate.healthEvidence?.healthStatus || candidate.healthStatus || null,
      healthProbeKind: candidate.healthEvidence?.probeKind || null,
      healthCheckedAt: candidate.healthEvidence?.checkedAt || null,
      healthEvidenceLevel: candidate.healthEvidence?.evidenceLevel || null,
      totalScore: score ? score.totalScore : null,
    };
  });
}

export function summarizeExclusions(rejected = []) {
  const byReason = {};
  for (const item of rejected || []) {
    const reason = item?.reason || 'UNKNOWN';
    byReason[reason] = (byReason[reason] || 0) + 1;
  }
  return { total: (rejected || []).length, byReason };
}

/**
 * @param {object} input
 * @param {object} input.decision scoreRouteCandidates 的输出
 * @param {object} input.winner 选中的候选
 * @param {object} input.evaluation evaluateRouteCandidates 的输出
 * @param {string|null} input.decisionId 落库的决策 id，未持久化为 null
 * @param {string|null} input.quoteId 原报价 id；跨模型备用沿用原报价时仍记录
 * @param {object|null} input.costCeiling 跨模型备用成本上限
 */
export function buildRouteDecisionMetadata({
  decision,
  winner,
  evaluation,
  decisionId = null,
  quoteId = null,
  costCeiling = null,
  budgetUsd = null,
  budgetCny = null,
} = {}) {
  const candidates = evaluation?.candidates || [];
  const rejected = evaluation?.rejected || [];
  const normalizedCeiling = normalizeRouteCostCeiling(costCeiling);
  return {
    recordVersion: ROUTE_DECISION_RECORD_VERSION,
    // 没有落库（管理员预览）时明确记为 null，避免与真实决策 id 混淆。
    decisionId: decisionId || null,
    policyVersion: decision?.policyVersion ?? null,
    requestedRoutingMode: decision?.requestedRoutingMode || null,
    routingMode: decision?.routingMode ?? null,
    strategy: decision?.strategy ?? null,
    modeFallback: decision?.modeFallback ?? null,
    weights: decision?.weights ?? null,
    weightsConfigured: decision?.weightsConfigured ?? null,
    costTieToleranceRate: decision?.costTieToleranceRate ?? null,
    candidateCount: decision?.candidateCount ?? candidates.length,
    quoteId: quoteId || null,
    // 胜出线路的健康证据：来源、探针等级、观测时间与有效期一起记录，
    // 便于解释“为什么这条线路可以执行”，且不把凭据级探针说成真实生成验证。
    healthEvidence: winner?.healthEvidence || null,
    selectedRoute: summarizeSelectedRoute(winner),
    eligibleRoutes: summarizeEligibleCandidates({ candidates, scores: decision?.scores || [] }),
    exclusions: summarizeExclusions(rejected),
    budget: {
      maxFailoverCostUsd: finiteNumber(budgetUsd),
      maxFailoverCostCny: finiteNumber(budgetCny),
      // 跨逻辑模型备用经 costCeiling 单独传入预算，必须与报价内候选区分记录。
      crossModelCostCeiling: normalizedCeiling,
    },
    // 保留评分明细供后台与既有读取方使用；完整候选快照见 eligibleRoutes。
    candidates: decision?.scores || [],
  };
}