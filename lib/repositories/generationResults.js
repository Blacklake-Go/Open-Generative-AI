import 'server-only';

import { queryOne, withTransaction } from '../db/index.js';
import { decryptSecret, encryptSecret, isEncryptedSecret } from '../storage/storageCrypto.js';

const ENCRYPTION_PROBE = 'generation-result-encryption-readiness-v1';
const IDENTITY_KEYS = ['creationId', 'attemptId', 'providerId', 'providerRequestId'];

function resultError(code, message) {
  return Object.assign(new Error(message), { code });
}

function encryptionUnavailable() {
  return resultError('GENERATION_RESULT_ENCRYPTION_UNAVAILABLE', 'Generation result encryption is unavailable.');
}

function identityConflict() {
  return resultError('GENERATION_RESULT_IDENTITY_CONFLICT', 'Generation result creation/attempt/provider/receipt identity does not match.');
}

function hasText(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function sameIdentity(left, right) {
  return IDENTITY_KEYS.every((key) => left[key] === right[key]);
}

function rowIdentity(row) {
  return {
    creationId: row.creation_id,
    attemptId: row.attempt_id,
    providerId: row.provider_id,
    providerRequestId: row.provider_request_id,
  };
}

// Uses storageCrypto's existing key resolution unchanged. Never surface STORAGE_ errors
// here: inability to persist a successful provider result is not refund evidence.
export function assertGenerationResultEncryptionReady() {
  try {
    const encrypted = encryptSecret(ENCRYPTION_PROBE);
    if (!isEncryptedSecret(encrypted) || decryptSecret(encrypted) !== ENCRYPTION_PROBE) {
      throw encryptionUnavailable();
    }
    return true;
  } catch {
    throw encryptionUnavailable();
  }
}

function encryptPayload(payload) {
  try {
    const encrypted = encryptSecret(JSON.stringify(payload));
    if (!isEncryptedSecret(encrypted)) throw encryptionUnavailable();
    return JSON.stringify(encrypted);
  } catch {
    throw encryptionUnavailable();
  }
}

function decodeResult(row) {
  try {
    // decryptSecret itself accepts plaintext strings; checkpoints must never do so.
    if (!isEncryptedSecret(row.encrypted_payload_json)) throw new Error();
    const payload = JSON.parse(decryptSecret(row.encrypted_payload_json));
    const identity = rowIdentity(row);
    if (!payload || !sameIdentity(payload, identity) || payload.stage !== row.stage) throw new Error();
    if (row.stage === 'provider_succeeded') {
      if (!hasText(payload.resultUrl) && !hasText(payload.resultText)) throw new Error();
      if (payload.storedResult !== null) throw new Error();
    } else if (row.stage === 'archived') {
      if (!hasText(payload.storedResult?.objectKey) || Object.hasOwn(payload, 'resultUrl')) throw new Error();
    } else {
      throw new Error();
    }
    return {
      ...identity,
      stage: row.stage,
      resultUrl: payload.resultUrl ?? null,
      resultText: payload.resultText ?? null,
      actualCostUsd: payload.actualCostUsd ?? null,
      storedResult: payload.storedResult ?? null,
    };
  } catch {
    // Deliberately omit the original error/cause, ciphertext and provider URL.
    throw resultError('GENERATION_RESULT_UNREADABLE', 'Generation result checkpoint is unreadable.');
  }
}

async function readCheckpoint(creationId, transaction) {
  const one = transaction ? transaction.queryOne.bind(transaction) : queryOne;
  return one(`
    SELECT creation_id, attempt_id, provider_id, provider_request_id, stage, encrypted_payload_json
    FROM ai_studio.generation_result_checkpoints
    WHERE creation_id = $1
  `, [creationId]);
}

export async function getGenerationResult(creationId, transaction = null) {
  const row = await readCheckpoint(creationId, transaction);
  return row ? decodeResult(row) : null;
}

async function lockProcessingCreation(identity, transaction) {
  // This parent lock also serializes first inserts, when there is no checkpoint to lock.
  const creation = await transaction.queryOne(`
    SELECT id, status, provider, provider_request_id
    FROM ai_studio.creations WHERE id = $1 FOR UPDATE
  `, [identity.creationId]);
  if (!creation || creation.status !== 'processing') return null;
  if (!hasText(identity.providerId) || creation.provider !== identity.providerId
      || (creation.provider_request_id !== null && creation.provider_request_id !== identity.providerRequestId)) {
    throw identityConflict();
  }
  if (identity.attemptId !== null) {
    const attempt = await transaction.queryOne(`
      SELECT creation_id, provider_id, provider_request_id
      FROM ai_studio.generation_attempts WHERE id = $1 FOR UPDATE
    `, [identity.attemptId]);
    if (!attempt || attempt.creation_id !== identity.creationId || attempt.provider_id !== identity.providerId
        || (attempt.provider_request_id !== null && attempt.provider_request_id !== identity.providerRequestId)) {
      throw identityConflict();
    }
  }
  return creation;
}

async function matchingCheckpoint(identity, transaction) {
  const row = await readCheckpoint(identity.creationId, transaction);
  if (!row) return null;
  if (!sameIdentity(rowIdentity(row), identity)) throw identityConflict();
  return decodeResult(row);
}

async function makeRecoveryDue(creationId, transaction) {
  // Do not publish a receipt or release a worker's lease. Synchronous results may
  // legitimately have no receipt; the checkpoint is their durable recovery signal.
  await transaction.execute(`
    UPDATE ai_studio.creations SET next_poll_at = NOW()
    WHERE id = $1 AND (next_poll_at IS NULL OR next_poll_at > NOW())
  `, [creationId]);
}

export async function saveGenerationResult({
  creationId,
  attemptId = null,
  providerId,
  providerRequestId = null,
  resultUrl = null,
  resultText = null,
  actualCostUsd = null,
  transaction = null,
}) {
  const identity = { creationId, attemptId, providerId, providerRequestId };
  const save = async (tx) => {
    if (!await lockProcessingCreation(identity, tx)) return null;
    const existing = await matchingCheckpoint(identity, tx);
    if (!existing) {
      if (!hasText(resultUrl) && !hasText(resultText)) {
        throw resultError('GENERATION_RESULT_INVALID', 'Generation result requires a URL or non-empty text.');
      }
      const encrypted = encryptPayload({
        ...identity, stage: 'provider_succeeded', resultUrl, resultText, actualCostUsd, storedResult: null,
      });
      await tx.execute(`
        INSERT INTO ai_studio.generation_result_checkpoints
          (creation_id, attempt_id, provider_id, provider_request_id, encrypted_payload_json, stage)
        VALUES ($1, $2, $3, $4, $5::jsonb, 'provider_succeeded')
      `, [creationId, attemptId, providerId, providerRequestId, encrypted]);
    }
    // A repeat returns the original evidence verbatim, including an archived result.
    await makeRecoveryDue(creationId, tx);
    return existing || getGenerationResult(creationId, tx);
  };
  return transaction ? save(transaction) : withTransaction(save);
}

export async function markGenerationResultArchived({
  creationId,
  attemptId = null,
  providerId,
  providerRequestId = null,
  storedResult,
  transaction = null,
}) {
  const identity = { creationId, attemptId, providerId, providerRequestId };
  const archive = async (tx) => {
    if (!await lockProcessingCreation(identity, tx)) return null;
    const existing = await matchingCheckpoint(identity, tx);
    if (!existing) {
      throw resultError('GENERATION_RESULT_NOT_FOUND', 'Generation result checkpoint is required before archival.');
    }
    if (!hasText(storedResult?.objectKey)) {
      throw resultError('GENERATION_RESULT_INVALID', 'Archived generation result requires an object key.');
    }
    if (existing.stage !== 'archived') {
      const payload = { ...existing, stage: 'archived', storedResult };
      delete payload.resultUrl;
      await tx.execute(`
        UPDATE ai_studio.generation_result_checkpoints
        SET encrypted_payload_json = $2::jsonb, stage = 'archived', updated_at = NOW()
        WHERE creation_id = $1
      `, [creationId, encryptPayload(payload)]);
    }
    await makeRecoveryDue(creationId, tx);
    return existing.stage === 'archived' ? existing : getGenerationResult(creationId, tx);
  };
  return transaction ? archive(transaction) : withTransaction(archive);
}
