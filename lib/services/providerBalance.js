/**
 * 供应商余额/配额的展示口径。
 *
 * 纯逻辑、不依赖 server-only 与数据库，可被 `node --test` 直接驱动。
 *
 * 关键约束：`ai_studio.ai_providers.balance` 曾经是 `NOT NULL DEFAULT 0`，
 * 从未查询过余额的渠道也会读到 0。0 是合法余额（真的用完了），
 * 未知必须保留为 null，否则后台会把「没查过」说成「余额为零」。
 */

function toNullableNumber(value) {
  if (value === null || value === undefined) return null;
  if (typeof value === 'string' && value.trim() === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function toNullableText(value) {
  if (value === null || value === undefined) return null;
  const text = String(value).trim();
  return text === '' ? null : text;
}

/**
 * 把 `ai_providers` 的一行映射成后台可解释的余额视图。
 *
 * - `balance === null` 表示未知；只有非空时才附上币种，未知余额没有币种可言。
 * - `balanceApi.supported` 保持三态：true 支持 / false 不支持 / null 未登记。
 * - `source` 是取数端点（余额接口 URL），不是页面来源。
 */
export function mapChannelBalance(row = {}) {
  const balance = toNullableNumber(row.balance);
  const availableQuota = toNullableNumber(row.available_quota);
  const supportedRaw = row.account_balance_api_supported;

  return {
    balance,
    currency: balance === null ? null : (toNullableText(row.currency) || 'USD'),
    balanceCheckedAt: toNullableText(row.balance_checked_at),
    availableQuota,
    quotaCheckedAt: toNullableText(row.quota_checked_at),
    balanceApi: {
      supported: supportedRaw === null || supportedRaw === undefined ? null : Boolean(supportedRaw),
      url: toNullableText(row.account_balance_api_url),
      reason: toNullableText(row.account_balance_api_reason),
    },
  };
}
