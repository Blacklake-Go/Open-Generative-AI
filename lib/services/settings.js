import 'server-only';

import { logAudit } from '../admin/audit.js';
import { withTransaction } from '../db/index.js';
import * as settingsRepo from '../repositories/settings.js';

const BLOCKED_KEYS = /secret|password|token|key|private/i;

export async function getSettingByKey(key) {
  return settingsRepo.getSettingByKey(key);
}

export async function getSystemSettingsList() {
  return await settingsRepo.getAllSettings();
}

export async function saveSystemSetting({ actor, key, value, visibility = 'private', requestId }) {
  if (!/^[a-z][a-z0-9_.-]{1,80}$/.test(key)) {
    return { error: '配置键名格式无效（仅限小写字母、数字及下划线）' };
  }

  if (BLOCKED_KEYS.test(key)) {
    return { error: '系统设置中严禁存储密钥与私钥敏感信息' };
  }
  if (!['public', 'private'].includes(visibility)) return { error: '配置可见性值无效' };
  try {
    if (JSON.stringify(value).length > 10000) return { error: '配置内容不能超过 10,000 个字符' };
  } catch {
    return { error: '配置内容必须是可序列化数据' };
  }

  return await withTransaction(async (tx) => {
    const existing = await settingsRepo.getSettingByKey(key, tx);
    const updated = await settingsRepo.updateSettingValue({
      key,
      value,
      updatedBy: actor.email,
      visibility,
      transaction: tx,
    });
    await logAudit({
      actor,
      action: 'settings.update',
      targetType: 'system_setting',
      targetId: key,
      riskLevel: 'medium',
      before: existing ? existing.value : null,
      after: value,
      requestId,
      transaction: tx,
    });
    return { setting: updated };
  });
}
