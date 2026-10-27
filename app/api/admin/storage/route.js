import { withAdminErrorBoundary, requirePermission, okResponse, errorResponse } from '@/lib/admin/authz';
import { PERMISSIONS } from '@/lib/admin/permissions';
import { checkIdempotency, completeIdempotency, getRequiredIdempotencyKey, releaseIdempotency } from '@/lib/admin/idempotency';
import { createStorageAdapter } from '@/lib/storage/adapterRegistry.js';
import { markStorageLocationTested, storageLocationDigest } from '@/lib/storage/storageLocations.js';
import {
  normalizeStorageSettings,
  publicStorageSettings,
  readStorageSettings,
  saveStorageSettings,
  validateStorageSettings,
} from '@/lib/storage/storageSettingsV2.js';
import { getStorageAdminOverview } from '@/lib/services/storageAdmin';
import {
  advanceStorageMigration,
  cancelStorageMigration,
  startStorageMigration,
} from '@/lib/services/storageMigration';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

async function handleGET(request) {
  const guard = await requirePermission(request, PERMISSIONS.storageRead);
  if (!guard.ok) return guard.response;
  return okResponse(await getStorageAdminOverview(), guard.requestId);
}

function buildCandidateSettings({ config = {} }, current) {
  const incoming = normalizeStorageSettings(config);
  if (!incoming.accessKeyId && current && current.provider === incoming.provider) {
    incoming.accessKeyId = current.accessKeyId || '';
  }
  if (!incoming.accessKeySecret && current && current.provider === incoming.provider) {
    incoming.accessKeySecret = current.accessKeySecret || '';
  }
  if (!incoming.sessionToken && current && current.provider === incoming.provider) {
    incoming.sessionToken = current.sessionToken || '';
  }
  return incoming;
}

async function handlePOST(request) {
  const guard = await requirePermission(request, PERMISSIONS.storageWrite);
  if (!guard.ok) return guard.response;
  const idempotencyKey = getRequiredIdempotencyKey(request);
  if (!idempotencyKey) return errorResponse('VALIDATION_ERROR', '高风险写操作必须提供有效的 Idempotency-Key', 422, guard.requestId);

  let body = {};
  try {
    body = await request.json();
  } catch {}
  const action = String(body.action || 'save');

  if (action === 'test') {
    const current = await readStorageSettings({ fresh: true });
    const candidate = buildCandidateSettings(body, current);
    const validation = validateStorageSettings(candidate, { hasStoredSecret: Boolean(candidate.accessKeySecret) });
    if (validation) return errorResponse('VALIDATION_ERROR', validation, 422, guard.requestId);
    try {
      const adapter = createStorageAdapter(candidate);
      const startedAt = Date.now();
      const result = await adapter.testConnection();
      const latencyMs = Date.now() - startedAt;
      const digest = storageLocationDigest(candidate);
      if (
        candidate.storageLocationId
        && candidate.storageLocationId === current?.storageLocationId
        && candidate.provider === current?.provider
      ) {
        await markStorageLocationTested(candidate.storageLocationId, digest).catch(() => {});
      }
      return okResponse({ ok: true, latencyMs, provider: candidate.provider, result }, guard.requestId);
    } catch (error) {
      return errorResponse('STORAGE_TEST_FAILED', String(error?.message || '存储连通性测试失败').slice(0, 300), 422, guard.requestId);
    }
  }

  if (action.startsWith('migrate.')) {
    const idemp = await checkIdempotency({ scope: `storage_migration_${action}`, key: idempotencyKey, actorId: guard.user.id });
    if (!idemp.allowed) {
      if (idemp.cachedResponse) return okResponse(idemp.cachedResponse, guard.requestId);
      return errorResponse('CONFLICT', '迁移操作正在处理中', 409, guard.requestId);
    }
    try {
      let payload;
      if (action === 'migrate.start') {
        const { run } = await startStorageMigration({
          actorEmail: guard.user.email || 'system',
          targetLocationId: String(body.targetLocationId || ''),
        });
        payload = { run };
      } else if (action === 'migrate.step') {
        const run = await advanceStorageMigration(String(body.runId || ''), {
          maxItems: Math.min(50, Math.max(1, Number(body.maxItems) || 20)),
        });
        if (!run) return errorResponse('NOT_FOUND', '迁移任务不存在', 404, guard.requestId);
        payload = { run };
      } else if (action === 'migrate.cancel') {
        const run = await cancelStorageMigration(String(body.runId || ''));
        if (!run) return errorResponse('NOT_FOUND', '迁移任务不存在或已结束', 404, guard.requestId);
        payload = { run };
      } else {
        return errorResponse('VALIDATION_ERROR', '不支持的迁移操作', 422, guard.requestId);
      }
      await completeIdempotency(idemp.keyHash, payload);
      return okResponse(payload, guard.requestId);
    } catch (error) {
      await releaseIdempotency(idemp.keyHash).catch(() => {});
      const status = error?.code === 'STORAGE_MIGRATION_RUNNING' ? 409 : error?.code === 'STORAGE_LOCATION_NOT_FOUND' ? 404 : 422;
      return errorResponse(error?.code || 'STORAGE_MIGRATION_FAILED', String(error?.message || '迁移失败').slice(0, 300), status, guard.requestId);
    }
  }

  const idemp = await checkIdempotency({ scope: 'storage_settings_save', key: idempotencyKey, actorId: guard.user.id });
  if (!idemp.allowed) {
    if (idemp.cachedResponse) return okResponse(idemp.cachedResponse, guard.requestId);
    return errorResponse('CONFLICT', '存储设置更新正在处理中', 409, guard.requestId);
  }

  try {
    const saved = await saveStorageSettings({ config: body.config || {}, actorEmail: guard.user.email || 'system' });
    const payload = {
      settings: publicStorageSettings(saved.settings),
      storageLocationId: saved.storageLocationId,
    };
    await completeIdempotency(idemp.keyHash, payload);
    return okResponse(payload, guard.requestId);
  } catch (error) {
    await releaseIdempotency(idemp.keyHash).catch(() => {});
    return errorResponse(error?.code || 'STORAGE_SETTINGS_INVALID', String(error?.message || '存储设置保存失败'), 422, guard.requestId);
  }
}

export const GET = withAdminErrorBoundary(handleGET);
export const POST = withAdminErrorBoundary(handlePOST);
