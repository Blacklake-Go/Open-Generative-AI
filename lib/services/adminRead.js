import 'server-only';

import * as billingRepo from '../repositories/billing.js';
import * as creationRepo from '../repositories/creations.js';
import * as creditRepo from '../repositories/credits.js';
import * as moderationRepo from '../repositories/moderation.js';
import * as sessionRepo from '../repositories/sessions.js';
import * as settingsRepo from '../repositories/settings.js';
import * as userRepo from '../repositories/users.js';
import { getAssetUrl } from '../storage/storageService.js';

async function exposeAdminResults(result) {
  if (!result?.rows) return result;
  return {
    ...result,
    rows: await Promise.all(result.rows.map(async (row) => {
      if (!row.result_object_key) return row;
      const url = await getAssetUrl({ objectKey: row.result_object_key, visibility: 'private' }).catch(() => null);
      return { ...row, result_url: url, result_object_key: undefined };
    })),
  };
}

// Admin read facade: route/page code must not depend on repository modules.
export async function listCreditLedger(searchParams) { return creditRepo.listCreditLedger(searchParams); }
export async function listAdmins() { return userRepo.listAdmins(); }
export async function listUsers(searchParams) { return userRepo.listUsers(searchParams); }
export async function listUserTags() { return userRepo.listAllTags(); }
export async function getUserSummaryMetrics() { return userRepo.getUserSummaryMetrics(); }
export async function listCreations(searchParams) { return exposeAdminResults(await creationRepo.listCreations(searchParams)); }
/** One row per user (latest matching task + aggregates) with up to `perUser` older tasks attached as `history`. */
export async function listCreationUserGroups(searchParams, { perUser = 5 } = {}) {
  const groups = await exposeAdminResults(await creationRepo.listCreationUserGroups(searchParams));
  const userIds = groups.rows.map((row) => row.user_id);
  const history = await exposeAdminResults({ rows: await creationRepo.listRecentCreationsForUsers(searchParams, userIds, perUser) });
  const byUser = new Map();
  for (const row of history.rows) {
    if (!byUser.has(row.user_id)) byUser.set(row.user_id, []);
    byUser.get(row.user_id).push(row);
  }
  return { ...groups, rows: groups.rows.map((row) => ({ ...row, history: byUser.get(row.user_id) || [] })) };
}
export async function listFailedCreations(searchParams) { return creationRepo.listFailedCreations(searchParams); }
export async function getFailureClusters() { return creationRepo.getFailureClusters(); }
export async function getGenerationTrace(creationId) { return creationRepo.getGenerationTrace(creationId); }
export async function listModerationCases(searchParams) { return exposeAdminResults(await moderationRepo.listModerationCases(searchParams)); }
export async function listActiveSessions(searchParams) { return sessionRepo.listActiveSessions(searchParams); }
export async function listOrders(searchParams) { return billingRepo.listOrders(searchParams); }
export async function listSubscriptions(searchParams) { return billingRepo.listSubscriptions(searchParams); }
export async function listWebhookEvents(searchParams) { return billingRepo.listWebhookEvents(searchParams); }
export async function getAllPlansConfig() { return settingsRepo.getAllPlansConfig(); }
