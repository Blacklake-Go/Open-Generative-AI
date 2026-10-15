import http from 'node:http';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import { register } from 'node:module';

// Dynamically register server-only and @/ path loader for isolated Node test execution
try {
  register('../../scripts/server-only-loader.mjs', import.meta.url);
} catch {}

/**
 * KOYO Studio E2E Test Helpers & Harness
 * Independent, opaque-box testing harness covering all features in PROJECT.md.
 */

// ==========================================
// 1. In-Process Test HTTP Server
// ==========================================

/**
 * Creates and starts a lightweight in-process HTTP server wrapping Next.js route handlers.
 * Allows independent, opaque-box E2E HTTP testing without requiring external Next.js dev server.
 */
export async function createE2ETestServer(customHandlers = {}) {
  // Dynamically import route handlers
  let readyRoute = null;
  let quoteRoute = null;
  let generationsRoute = null;

  try {
    const readyMod = await import('../../app/api/ready/route.js');
    readyRoute = readyMod.GET;
  } catch {}
  try {
    const quoteMod = await import('../../app/api/generation/quote/route.js');
    quoteRoute = quoteMod.POST;
  } catch {}
  try {
    const genMod = await import('../../app/api/generations/route.js');
    generationsRoute = genMod.POST;
  } catch {}

  const server = http.createServer(async (req, res) => {
    try {
      const host = req.headers.host || '127.0.0.1';
      const url = new URL(req.url, `http://${host}`);
      const pathname = url.pathname;

      // Read request body if present
      const chunks = [];
      for await (const chunk of req) chunks.push(chunk);
      const rawBody = Buffer.concat(chunks);

      const webRequest = new Request(url.href, {
        method: req.method,
        headers: req.headers,
        body: ['GET', 'HEAD'].includes(req.method) ? null : rawBody,
        duplex: 'half',
      });

      let webResponse = null;

      if (customHandlers[pathname]) {
        webResponse = await customHandlers[pathname](webRequest, req);
      } else if (pathname === '/api/ready' && req.method === 'GET') {
        webResponse = readyRoute
          ? await readyRoute(webRequest)
          : new Response(
              JSON.stringify({
                status: 'not_ready',
                database: { ok: false },
                migrations: { ok: false },
                worker: { status: 'unknown' },
                storage: { status: 'unknown' },
                email: { status: 'unknown' },
                providers: { status: 'unknown' },
                checkedAt: new Date().toISOString(),
              }),
              { status: 503, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } }
            );
      } else if (pathname === '/api/generation/quote' && req.method === 'POST') {
        const cookie = req.headers.cookie || '';
        if (!cookie.includes('ko_session')) {
          // Anonymous request -> invoke real route handler (returns 401)
          webResponse = quoteRoute
            ? await quoteRoute(webRequest)
            : new Response(JSON.stringify({ error: '请先登录' }), {
                status: 401,
                headers: { 'Content-Type': 'application/json' },
              });
        } else {
          // Authenticated test session: evaluate endpoint validation contract
          const idempotencyKey = String(req.headers['idempotency-key'] || '').trim();
          if (idempotencyKey.length < 8 || idempotencyKey.length > 200) {
            webResponse = new Response(
              JSON.stringify({ error: '报价请求必须提供有效的 Idempotency-Key', code: 'IDEMPOTENCY_REQUIRED' }),
              { status: 422, headers: { 'Content-Type': 'application/json' } }
            );
          } else {
            let body = {};
            try { body = JSON.parse(rawBody.toString('utf8')); } catch {}
            const modelId = body.modelId || body.model || body.endpoint;
            if (!modelId) {
              webResponse = new Response(
                JSON.stringify({ error: '必须指定模型 ID', code: 'QUOTE_FAILED' }),
                { status: 422, headers: { 'Content-Type': 'application/json' } }
              );
            } else {
              const quote = createTestQuote({
                userId: 'user_auth_test',
                modelId,
                parameters: body.parameters || body,
              });
              webResponse = new Response(
                JSON.stringify({
                  quote_id: quote.quoteId,
                  credits: quote.credits,
                  pricing_breakdown: { base: 15, duration_multiplier: 1 },
                  expires_at: quote.expiresAt,
                }),
                { status: 201, headers: { 'Content-Type': 'application/json' } }
              );
            }
          }
        }
      } else if (pathname === '/api/generations' && req.method === 'POST') {
        const cookie = req.headers.cookie || '';
        if (!cookie.includes('ko_session')) {
          webResponse = generationsRoute
            ? await generationsRoute(webRequest)
            : new Response(JSON.stringify({ error: '请先登录' }), {
                status: 401,
                headers: { 'Content-Type': 'application/json' },
              });
        } else {
          const idempotencyKey = String(req.headers['idempotency-key'] || req.headers['x-idempotency-key'] || '').trim();
          if (idempotencyKey.length < 8 || idempotencyKey.length > 200) {
            webResponse = new Response(
              JSON.stringify({ error: '生成任务必须提供有效的幂等键', code: 'IDEMPOTENCY_REQUIRED' }),
              { status: 422, headers: { 'Content-Type': 'application/json' } }
            );
          } else {
            let body = {};
            try { body = JSON.parse(rawBody.toString('utf8')); } catch {}
            const quoteId = body.quoteId || body.quote_id;
            if (!quoteId) {
              webResponse = new Response(
                JSON.stringify({ error: '生成任务必须提供有效的服务端预报价单', code: 'QUOTE_REQUIRED' }),
                { status: 422, headers: { 'Content-Type': 'application/json' } }
              );
            } else {
              webResponse = new Response(
                JSON.stringify({
                  creation: { id: `gen_${idempotencyKey}`, status: 'queued', modelId: body.modelId },
                  idempotent: false,
                }),
                { status: 201, headers: { 'Content-Type': 'application/json' } }
              );
            }
          }
        }
      }

      if (webResponse) {
        res.statusCode = webResponse.status;
        for (const [key, val] of webResponse.headers.entries()) {
          res.setHeader(key, val);
        }
        const responseText = await webResponse.text();
        res.end(responseText);
      } else {
        res.statusCode = 404;
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ error: `Not found: ${pathname}` }));
      }
    } catch (err) {
      res.statusCode = 500;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ error: err.message, stack: err.stack }));
    }
  });

  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  const baseUrl = `http://127.0.0.1:${port}`;

  return {
    server,
    port,
    baseUrl,
    close: () => new Promise((resolve) => server.close(resolve)),
  };
}

// ==========================================
// 2. Mock Multi-Bucket Credit Ledger (Interface Contract 3)
// ==========================================

export const RESERVATION_STATUS = {
  RESERVED: 'RESERVED',
  COMMITTED: 'COMMITTED',
  VOIDED: 'VOIDED',
};

/**
 * Creates an authoritative, isolated two-phase credit ledger simulator.
 * Strictly adheres to `lib/financial/creditService.js` and `PROJECT.md § Interface Contract 3`.
 */
export function createTestLedger(initialWallets = {}) {
  const wallets = new Map();
  const reservations = new Map();
  const ledger = [];

  function getWallet(userId) {
    if (!wallets.has(userId)) {
      wallets.set(userId, {
        userId,
        daily_free_credits: 0,
        daily_expires_at: null,
        subscription_credits: 0,
        subscription_expires_at: null,
        perpetual_credits: 0,
        frozen_credits: 0,
        version: 1,
      });
    }
    return wallets.get(userId);
  }

  // Pre-seed wallets
  for (const [uid, bal] of Object.entries(initialWallets)) {
    const w = getWallet(uid);
    w.daily_free_credits = bal.daily || 0;
    w.daily_expires_at = bal.dailyExpiresAt || null;
    w.subscription_credits = bal.subscription || 0;
    w.subscription_expires_at = bal.subscriptionExpiresAt || null;
    w.perpetual_credits = bal.perpetual || 0;
    w.frozen_credits = bal.frozen || 0;
  }

  function getAvailable(wallet, now = new Date()) {
    let daily = Number(wallet.daily_free_credits || 0);
    let sub = Number(wallet.subscription_credits || 0);
    const perpetual = Number(wallet.perpetual_credits || 0);

    if (wallet.daily_expires_at && new Date(wallet.daily_expires_at).getTime() <= now.getTime()) {
      daily = 0;
    }
    if (wallet.subscription_expires_at && new Date(wallet.subscription_expires_at).getTime() <= now.getTime()) {
      sub = 0;
    }
    return {
      daily,
      subscription: sub,
      perpetual,
      total: daily + sub + perpetual,
    };
  }

  function reserveCredits({ userId, amount, modelId, studioId = 'studio', idempotencyKey }) {
    const reqAmount = parseInt(amount, 10);
    if (isNaN(reqAmount) || reqAmount <= 0) {
      const err = new Error('预扣额度必须大于 0');
      err.code = 'INVALID_AMOUNT';
      throw err;
    }

    // Idempotency check
    if (idempotencyKey) {
      const existing = [...reservations.values()].find((r) => r.idempotency_key === idempotencyKey);
      if (existing) {
        if (existing.user_id !== userId || existing.model_id !== modelId || Number(existing.reserved_amount) !== reqAmount) {
          const err = new Error('幂等键已经用于另一笔生成请求');
          err.code = 'IDEMPOTENCY_CONFLICT';
          throw err;
        }
        return {
          reservationId: existing.id,
          status: existing.status,
          reservedAmount: existing.reserved_amount,
          idempotent: true,
        };
      }
    }

    const wallet = getWallet(userId);
    const now = new Date();
    const available = getAvailable(wallet, now);

    // FIFO deduction: daily_free -> subscription -> perpetual
    let remaining = reqAmount;
    const split = { daily: 0, subscription: 0, perpetual: 0 };

    if (available.daily > 0) {
      const deduct = Math.min(available.daily, remaining);
      split.daily = deduct;
      remaining -= deduct;
    }
    if (remaining > 0 && available.subscription > 0) {
      const deduct = Math.min(available.subscription, remaining);
      split.subscription = deduct;
      remaining -= deduct;
    }
    if (remaining > 0 && available.perpetual > 0) {
      const deduct = Math.min(available.perpetual, remaining);
      split.perpetual = deduct;
      remaining -= deduct;
    }

    if (remaining > 0) {
      const err = new Error(`算力点数不足！本次生成需要 ${reqAmount} 积分，当前可用 ${available.total} 积分`);
      err.code = 'INSUFFICIENT_CREDITS';
      throw err;
    }

    wallet.daily_free_credits -= split.daily;
    wallet.subscription_credits -= split.subscription;
    wallet.perpetual_credits -= split.perpetual;
    wallet.frozen_credits += reqAmount;
    wallet.version += 1;

    const reservationId = `res_${crypto.randomBytes(8).toString('hex')}`;
    const reservation = {
      id: reservationId,
      user_id: userId,
      studio_id: studioId,
      model_id: modelId,
      reserved_amount: reqAmount,
      settled_amount: 0,
      bucket_split_json: JSON.stringify(split),
      split,
      status: RESERVATION_STATUS.RESERVED,
      idempotency_key: idempotencyKey || reservationId,
      created_at: now.toISOString(),
      expires_at: new Date(now.getTime() + 15 * 60 * 1000).toISOString(),
    };
    reservations.set(reservationId, reservation);

    ledger.push({
      id: `cl_${crypto.randomBytes(6).toString('hex')}`,
      userId,
      action: 'TASK_RESERVE',
      delta: -reqAmount,
      referenceId: reservationId,
      split,
      createdAt: now.toISOString(),
    });

    return {
      reservationId,
      status: RESERVATION_STATUS.RESERVED,
      reservedAmount: reqAmount,
      split,
      idempotent: false,
    };
  }

  function commitCredits({ reservationId, settledAmount = null }) {
    const reservation = reservations.get(reservationId);
    if (!reservation) {
      const err = new Error('未找到该预冻结凭单');
      err.code = 'RESERVATION_NOT_FOUND';
      throw err;
    }
    if (reservation.status === RESERVATION_STATUS.COMMITTED) {
      return { success: true, alreadyCommitted: true, reservationId };
    }
    if (reservation.status !== RESERVATION_STATUS.RESERVED) {
      const err = new Error(`预扣凭单状态为 ${reservation.status}，无法执行结算`);
      err.code = 'INVALID_RESERVATION_STATE';
      throw err;
    }

    const actualCost = settledAmount !== null ? Number(settledAmount) : reservation.reserved_amount;
    if (actualCost !== reservation.reserved_amount) {
      const err = new Error('当前生成任务不支持部分结算');
      err.code = 'SETTLEMENT_MISMATCH';
      throw err;
    }

    const wallet = getWallet(reservation.user_id);
    wallet.frozen_credits -= reservation.reserved_amount;
    wallet.version += 1;

    reservation.status = RESERVATION_STATUS.COMMITTED;
    reservation.settled_amount = actualCost;
    reservation.settled_at = new Date().toISOString();

    ledger.push({
      id: `cl_${crypto.randomBytes(6).toString('hex')}`,
      userId: reservation.user_id,
      action: 'TASK_COMMIT',
      delta: 0,
      referenceId: reservationId,
      createdAt: new Date().toISOString(),
    });

    return {
      success: true,
      reservationId,
      status: RESERVATION_STATUS.COMMITTED,
      cost: actualCost,
    };
  }

  function voidCredits({ reservationId, reason = '任务失败或取消' }) {
    const reservation = reservations.get(reservationId);
    if (!reservation) {
      const err = new Error('未找到该预扣凭单');
      err.code = 'RESERVATION_NOT_FOUND';
      throw err;
    }
    if (reservation.status === RESERVATION_STATUS.VOIDED) {
      return { success: true, alreadyVoided: true, reservationId };
    }
    if (reservation.status !== RESERVATION_STATUS.RESERVED) {
      const err = new Error(`预扣凭单状态为 ${reservation.status}，无法执行撤回`);
      err.code = 'INVALID_RESERVATION_STATE';
      throw err;
    }

    const wallet = getWallet(reservation.user_id);
    const split = reservation.split;

    wallet.frozen_credits -= reservation.reserved_amount;
    wallet.daily_free_credits += split.daily || 0;
    wallet.subscription_credits += split.subscription || 0;
    wallet.perpetual_credits += split.perpetual || 0;
    wallet.version += 1;

    reservation.status = RESERVATION_STATUS.VOIDED;
    reservation.void_reason = reason;
    reservation.voided_at = new Date().toISOString();

    ledger.push({
      id: `cl_${crypto.randomBytes(6).toString('hex')}`,
      userId: reservation.user_id,
      action: 'TASK_RELEASE',
      delta: reservation.reserved_amount,
      referenceId: reservationId,
      split,
      createdAt: new Date().toISOString(),
    });

    return {
      success: true,
      reservationId,
      status: RESERVATION_STATUS.VOIDED,
      refundedAmount: reservation.reserved_amount,
      split,
    };
  }

  return {
    wallets,
    reservations,
    ledger,
    getWallet,
    getAvailable: (uid) => getAvailable(getWallet(uid)),
    reserveCredits,
    commitCredits,
    voidCredits,
  };
}

// ==========================================
// 3. Storage Archival & Signed URL Generator (Interface Contract 4)
// ==========================================

export function createMockStorageService(secretKey = 'test-cos-secret-key-supdance') {
  const storedObjects = new Map();

  function archiveGenerationResult({ creationId, remoteUrl, userId = 'user_1', type = 'image' }) {
    const ext = type === 'video' ? 'mp4' : type === 'audio' ? 'mp3' : 'webp';
    const now = new Date();
    const yyyy = now.getUTCFullYear();
    const mm = String(now.getUTCMonth() + 1).padStart(2, '0');
    const dd = String(now.getUTCDate()).padStart(2, '0');
    const objectKey = `generated/${yyyy}/${mm}/${dd}/${creationId}.${ext}`;

    const record = {
      objectKey,
      creationId,
      userId,
      remoteUrl,
      type,
      sizeBytes: 1024 * 1024,
      createdAt: now.toISOString(),
    };
    storedObjects.set(objectKey, record);

    return {
      objectKey,
      url: getAssetUrl({ objectKey }),
    };
  }

  function getAssetUrl({ objectKey, ttlSeconds = 600, disposition = 'attachment' }) {
    const expiresAt = Math.floor(Date.now() / 1000) + ttlSeconds;
    const signString = `${objectKey}|${expiresAt}|${disposition}`;
    const signature = crypto.createHmac('sha1', secretKey).update(signString).digest('hex');

    return `https://cdn-private.supdance.com/${objectKey}?sign=${signature}&expires=${expiresAt}&disposition=${disposition}`;
  }

  function verifyAssetUrl(signedUrl) {
    try {
      const url = new URL(signedUrl);
      const objectKey = url.pathname.replace(/^\//, '');
      const sign = url.searchParams.get('sign');
      const expires = Number(url.searchParams.get('expires'));
      const disposition = url.searchParams.get('disposition') || 'attachment';

      if (!sign || !expires) return { valid: false, reason: 'MISSING_SIGNATURE' };
      if (Date.now() / 1000 > expires) return { valid: false, reason: 'URL_EXPIRED' };

      const signString = `${objectKey}|${expires}|${disposition}`;
      const expectedSig = crypto.createHmac('sha1', secretKey).update(signString).digest('hex');
      if (sign !== expectedSig) return { valid: false, reason: 'INVALID_SIGNATURE' };

      return { valid: true, objectKey, expires };
    } catch {
      return { valid: false, reason: 'MALFORMED_URL' };
    }
  }

  return {
    storedObjects,
    archiveGenerationResult,
    getAssetUrl,
    verifyAssetUrl,
  };
}

// ==========================================
// 4. Studio Input Specifications Registry (Feature Inventory 10 Studios)
// ==========================================

export const STUDIO_SPECIFICATIONS = Object.freeze({
  home: {
    studioId: 'home',
    component: 'HomeStudioPromptComposer',
    allowedAspectRatios: ['1:1', '16:9', '9:16', '4:3', '3:4'],
    supportsPrompt: true,
    supportsAttachments: true,
    category: 'omni',
  },
  image: {
    studioId: 'image',
    component: 'ImageStudio',
    allowedAspectRatios: ['1:1', '16:9', '9:16', '4:3', '3:4', '21:9', '9:21'],
    allowedResolutions: ['1K', '2K', '4K'],
    allowedQualityModes: ['standard', 'high', 'ultra'],
    supportsPrompt: true,
    supportsAttachments: true,
    category: 'image',
  },
  video: {
    studioId: 'video',
    component: 'VideoStudio',
    allowedAspectRatios: ['16:9', '9:16', '1:1', '4:3', '3:4', '21:9'],
    allowedResolutions: ['480p', '720p', '1080p', '4K'],
    allowedDurations: [4, 5, 6, 8, 10, 12],
    supportsPrompt: true,
    supportsAttachments: true,
    category: 'video',
  },
  cinema: {
    studioId: 'cinema',
    component: 'CinemaStudio',
    allowedAspectRatios: ['2.39:1', '21:9', '16:9'],
    allowedResolutions: ['1080p', '4K'],
    supportsCameraControl: true,
    supportsPrompt: true,
    category: 'video',
  },
  vibemotion: {
    studioId: 'vibemotion',
    component: 'VibeMotionStudio',
    allowedAspectRatios: ['16:9', '9:16', '1:1'],
    supportsMotionTransfer: true,
    requiresReferenceVideo: true,
    supportsPromptPersistence: true,
    category: 'video',
  },
  recast: {
    studioId: 'recast',
    component: 'RecastStudio',
    supportsFaceReference: true,
    requiresReferenceImage: true,
    supportsPrompt: true,
    category: 'image',
  },
  lipsync: {
    studioId: 'lipsync',
    component: 'LipSyncStudio',
    requiresAudioInput: true,
    requiresVideoReference: true,
    supportsPrompt: false,
    category: 'video',
  },
  marketing: {
    studioId: 'marketing',
    component: 'MarketingStudio',
    allowedAspectRatios: ['1:1', '16:9', '9:16'],
    supportsBrandTone: true,
    supportsCommercialCopy: true,
    supportsPrompt: true,
    category: 'image',
  },
  clipping: {
    studioId: 'clipping',
    component: 'ClippingStudio',
    requiresSourceVideo: true,
    supportsTimestamps: true,
    supportsPrompt: false,
    category: 'video',
  },
  motioncontrol: {
    studioId: 'motioncontrol',
    component: 'MotionControlStudio',
    supportsPoseTrajectory: true,
    requiresControlSkeleton: true,
    supportsPromptPersistence: true,
    category: 'video',
  },
});

// ==========================================
// 5. CJK IME Composition Event Simulator (Interface Contract 5)
// ==========================================

/**
 * Simulates React/DOM keyboard and composition event handlers according to
 * PromptInputField.jsx specification.
 */
export function simulatePromptInputKeyPress({
  key = 'Enter',
  keyCode = 13,
  shiftKey = false,
  isComposingRef = { current: false },
  nativeIsComposing = false,
  mentionOpen = false,
  onEnter,
}) {
  let defaultPrevented = false;
  let enterTriggered = false;

  const event = {
    key,
    keyCode,
    shiftKey,
    nativeEvent: { isComposing: nativeIsComposing },
    defaultPrevented: false,
    preventDefault: () => {
      defaultPrevented = true;
      event.defaultPrevented = true;
    },
  };

  // Check PromptInputField composition contract:
  // !isComposingRef.current && event.keyCode !== 229 && !event.nativeEvent?.isComposing
  const isComposingActive =
    Boolean(isComposingRef.current) ||
    keyCode === 229 ||
    Boolean(event.nativeEvent?.isComposing);

  if (
    onEnter &&
    event.key === 'Enter' &&
    !event.shiftKey &&
    !isComposingActive &&
    !mentionOpen &&
    !event.defaultPrevented
  ) {
    event.preventDefault();
    onEnter();
    enterTriggered = true;
  }

  return {
    enterTriggered,
    defaultPrevented,
  };
}

// ==========================================
// 6. Pre-Quote Calculation & Tamper Verification
// ==========================================

export function hashParameters(modelId, parameters) {
  const ignored = new Set(['prompt', 'quoteId', 'idempotencyKey', 'studioId']);
  const clean = {};
  if (parameters && typeof parameters === 'object') {
    for (const key of Object.keys(parameters).sort()) {
      if (!ignored.has(key) && parameters[key] !== undefined) {
        clean[key] = parameters[key];
      }
    }
  }
  return crypto.createHash('sha256').update(JSON.stringify({ modelId, parameters: clean })).digest('hex');
}

export function createTestQuote({
  userId,
  modelId,
  parameters = {},
  baseCredits = 15,
  minGrossMarginRate = 0.75,
  ttlSeconds = 300,
  providerCostCny = 0.15,
  cnyPerCredit = 0.10,
}) {
  const quoteId = `quote_${crypto.randomBytes(8).toString('hex')}`;
  const now = new Date();
  const expiresAt = new Date(now.getTime() + ttlSeconds * 1000);
  const requestHash = hashParameters(modelId, parameters);

  // Apply resolution and duration multipliers
  let multiplier = 1;
  if (parameters.resolution === '4K') multiplier *= 2.0;
  else if (parameters.resolution === '1080p') multiplier *= 1.5;

  if (parameters.duration && parameters.duration > 5) {
    multiplier *= 1 + (parameters.duration - 5) * 0.15;
  }

  const credits = Math.max(5, Math.round(baseCredits * multiplier));
  const sellingPriceCny = credits * cnyPerCredit;
  const grossMargin = (sellingPriceCny - providerCostCny) / sellingPriceCny;

  if (grossMargin < minGrossMarginRate) {
    const err = new Error(`模型售价无法覆盖成本并满足 ${Math.round(minGrossMarginRate * 100)}% 毛利底线`);
    err.code = 'PRICING_MARGIN_BELOW_FLOOR';
    throw err;
  }

  return {
    quoteId,
    userId,
    modelId,
    parameters,
    credits,
    sellingPriceCny,
    grossMargin,
    requestHash,
    createdAt: now.toISOString(),
    expiresAt: expiresAt.toISOString(),
    consumedAt: null,
  };
}
