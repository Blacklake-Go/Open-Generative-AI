import 'server-only';

import * as inviteRepo from '../repositories/inviteCodes.js';
import { getSettingByKey } from './settings.js';
import { randomBytes } from 'node:crypto';

export async function isInviteCodeRequired() {
  try {
    const setting = await getSettingByKey('invite_code_required');
    if (setting?.value !== undefined) {
      return Boolean(setting.value?.enabled ?? setting.value);
    }
  } catch {
    // 数据库离线或沙箱环境回退
  }
  // 生产环境在未显式关闭前默认开启内测邀请码保护
  return process.env.INVITE_CODE_REQUIRED !== 'false';
}

export async function checkInviteCodeValid(code, transaction = null) {
  const norm = String(code || '').trim().toUpperCase();
  if (!norm) return { valid: false, reason: '邀请码不能为空', code: 'INVITE_CODE_REQUIRED' };

  const record = await inviteRepo.findInviteCodeByCode(norm, transaction);
  if (!record) {
    return { valid: false, reason: '邀请码不存在', code: 'INVALID_INVITE_CODE' };
  }
  if (record.status !== 'active') {
    return { valid: false, reason: '邀请码已被禁用或已用尽', code: 'INVITE_CODE_EXHAUSTED' };
  }
  if (record.expires_at && new Date(record.expires_at).getTime() <= Date.now()) {
    return { valid: false, reason: '邀请码已过期', code: 'INVITE_CODE_EXPIRED' };
  }
  if (record.used_count >= record.max_uses) {
    return { valid: false, reason: '邀请码使用次数已达上限', code: 'INVITE_CODE_EXHAUSTED' };
  }

  return { valid: true, code: record.code, maxUses: record.max_uses, usedCount: record.used_count };
}

export async function redeemInviteCode({ code, userId, ip = null, transaction = null }) {
  return inviteRepo.claimInviteCode(code, userId, ip, transaction);
}

export async function generateSingleInviteCode(prefix = 'KOYO') {
  const bytes = randomBytes(4).toString('hex').toUpperCase();
  return `${prefix}-${bytes.slice(0, 4)}-${bytes.slice(4)}`;
}

export async function batchGenerateInviteCodes({
  count = 10,
  maxUses = 1,
  notes = '',
  createdBy = 'admin',
  expiresDays = null,
} = {}) {
  const safeCount = Math.max(1, Math.min(100, Number(count) || 10));
  const expiresAt = expiresDays ? new Date(Date.now() + expiresDays * 86400 * 1000).toISOString() : null;
  const created = [];

  for (let i = 0; i < safeCount; i++) {
    const code = await generateSingleInviteCode();
    try {
      const row = await inviteRepo.createInviteCode({
        code,
        maxUses: Math.max(1, Number(maxUses) || 1),
        notes,
        createdBy,
        expiresAt,
      });
      created.push(row);
    } catch (err) {
      // 碰撞重试
      const retryCode = await generateSingleInviteCode('VIP');
      const row = await inviteRepo.createInviteCode({
        code: retryCode,
        maxUses: Math.max(1, Number(maxUses) || 1),
        notes,
        createdBy,
        expiresAt,
      });
      created.push(row);
    }
  }

  return created;
}

export async function listAdminInviteCodes({ status = null, page = 1, pageSize = 50 } = {}) {
  const safePage = Math.max(1, Number(page) || 1);
  const safeLimit = Math.max(1, Math.min(100, Number(pageSize) || 50));
  const offset = (safePage - 1) * safeLimit;

  const [codes, total] = await Promise.all([
    inviteRepo.listInviteCodes({ status, limit: safeLimit, offset }),
    inviteRepo.countInviteCodes({ status }),
  ]);

  return {
    codes,
    total,
    page: safePage,
    pageSize: safeLimit,
    totalPages: Math.ceil(total / safeLimit),
  };
}

export async function setInviteCodeStatus(id, status) {
  if (!['active', 'disabled', 'exhausted'].includes(status)) {
    throw Object.assign(new Error('状态不合法'), { code: 'INVALID_STATUS' });
  }
  return inviteRepo.updateInviteCodeStatus(id, status);
}

export async function getInviteStatsOverview() {
  const [stats, isRequired, setting] = await Promise.all([
    inviteRepo.getInviteGlobalStats(),
    isInviteCodeRequired(),
    getSettingByKey('invite_code_required').catch(() => null),
  ]);

  return {
    ...stats,
    is_invite_code_required: isRequired,
    switch_setting: setting?.value || null,
  };
}

export async function listAdminInviteCodesWithHabits({ status = null, search = '', page = 1, pageSize = 50 } = {}) {
  const safePage = Math.max(1, Number(page) || 1);
  const safeLimit = Math.max(1, Math.min(100, Number(pageSize) || 50));
  const offset = (safePage - 1) * safeLimit;

  const [codes, total] = await Promise.all([
    inviteRepo.listInviteCodesWithHabits({ status, search, limit: safeLimit, offset }),
    inviteRepo.countInviteCodesFiltered({ status, search }),
  ]);

  return {
    codes,
    total,
    page: safePage,
    pageSize: safeLimit,
    totalPages: Math.ceil(total / safeLimit),
  };
}

export async function getInviteCodeUserHabits(id) {
  if (!id) return [];
  return inviteRepo.getInviteCodeUserHabits(id);
}

export async function updateGlobalInviteSwitch(enabled, user, requestId) {
  const { saveSystemSetting } = await import('./settings.js');
  const actor = user || { email: 'admin@Supdance.com' };
  return saveSystemSetting({
    actor,
    key: 'invite_code_required',
    value: {
      enabled: Boolean(enabled),
      updated_at: new Date().toISOString(),
      updated_by: actor.email,
    },
    visibility: 'public',
    requestId: requestId || `req_sw_${Date.now()}`,
  });
}
