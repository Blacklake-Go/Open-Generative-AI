import 'server-only';

import * as settingsRepo from '../repositories/settings.js';
import { logAudit } from '../admin/audit.js';
import { withTransaction } from '../db/index.js';

export * from './quotaRulesPolicy.js';

import {
  QUOTA_RULES_SETTING_KEY,
  DEFAULT_QUOTA_RULES,
  normalizeQuotaRules,
  verifyQuotaPricingConsistency,
} from './quotaRulesPolicy.js';

/**
 * 获取当前生效的新用户额度与签到规则
 */
export async function getQuotaRules(transaction = null) {
  try {
    const setting = await settingsRepo.getSettingByKey(QUOTA_RULES_SETTING_KEY, transaction);
    if (setting && setting.value) {
      return normalizeQuotaRules(setting.value);
    }
  } catch (error) {
    console.warn('[quotaRules] 读取系统设置异常，回退至默认规则:', error?.message);
  }
  return { ...DEFAULT_QUOTA_RULES };
}

/**
 * 保存新用户额度与签到规则（包含权限与审计日志）
 */
export async function saveQuotaRules({ actor, rules: inputRules, requestId = null }) {
  const normalized = normalizeQuotaRules(inputRules);
  const consistency = verifyQuotaPricingConsistency(normalized);

  return await withTransaction(async (tx) => {
    const existing = await settingsRepo.getSettingByKey(QUOTA_RULES_SETTING_KEY, tx);
    const updated = await settingsRepo.updateSettingValue({
      key: QUOTA_RULES_SETTING_KEY,
      value: normalized,
      updatedBy: actor.email,
      visibility: 'public',
      transaction: tx,
    });

    await logAudit({
      actor,
      action: 'quota_rules.update',
      targetType: 'system_setting',
      targetId: QUOTA_RULES_SETTING_KEY,
      riskLevel: 'high',
      before: existing ? existing.value : DEFAULT_QUOTA_RULES,
      after: normalized,
      requestId,
      transaction: tx,
    });

    return {
      rules: normalized,
      setting: updated,
      consistency,
    };
  });
}
