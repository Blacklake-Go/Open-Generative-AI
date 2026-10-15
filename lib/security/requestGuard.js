import crypto from 'node:crypto';
import { NextResponse } from 'next/server.js';
import { execute, queryOne } from '../db/index.js';

const DEFAULT_MAX_JSON_BYTES = 256 * 1024;

function safeOrigin(value) {
  try {
    const url = new URL(String(value || ''));
    return `${url.protocol}//${url.host}`;
  } catch {
    return null;
  }
}

export function getClientIp(request) {
  const forwarded = request?.headers?.get?.('x-forwarded-for');
  const firstForwarded = forwarded?.split(',')[0]?.trim();
  return firstForwarded || request?.headers?.get?.('x-real-ip')?.trim() || 'unknown';
}

function isAllowedDomain(originStr, configuredOrigin) {
  if (!originStr) return false;
  try {
    const url = new URL(originStr);
    const host = url.hostname.toLowerCase();

    // 允许 supdance.com 根域及任意二级子域名
    if (host === 'supdance.com' || host.endsWith('.supdance.com')) {
      return true;
    }

    // 若配置了 PUBLIC_APP_URL，允许相同根域名或其子域名
    if (configuredOrigin) {
      try {
        const configUrl = new URL(configuredOrigin);
        const configHost = configUrl.hostname.toLowerCase();
        if (host === configHost || host.endsWith(`.${configHost}`)) {
          return true;
        }
        const configParts = configHost.split('.');
        if (configParts.length >= 2) {
          const apex = configParts.slice(-2).join('.');
          if (host === apex || host.endsWith(`.${apex}`)) {
            return true;
          }
        }
      } catch {}
    }

    // 允许环境变量额外声明的来源（逗号分隔）
    if (process.env.ADDITIONAL_ALLOWED_ORIGINS) {
      const allowedList = process.env.ADDITIONAL_ALLOWED_ORIGINS.split(',').map((s) => s.trim().toLowerCase());
      if (allowedList.includes(originStr.toLowerCase()) || allowedList.includes(host)) {
        return true;
      }
    }

    // 非生产环境允许本地调试
    if (process.env.NODE_ENV !== 'production') {
      if (host === 'localhost' || host === '127.0.0.1' || host.endsWith('.local') || host.endsWith('.test')) {
        return true;
      }
    }
  } catch {
    return false;
  }
  return false;
}

/**
 * Cookie-authenticated mutations must originate from this application.
 * In development/test, a missing Origin is allowed for CLI and integration
 * clients; a supplied mismatching Origin is never allowed. Production can
 * explicitly disable the missing-Origin compatibility with CSRF_ORIGIN_REQUIRED=false.
 */
export function guardSameOrigin(request) {
  const origin = request?.headers?.get?.('origin')?.trim();
  const referer = request?.headers?.get?.('referer')?.trim();
  const suppliedOrigin = safeOrigin(origin || referer);

  const configuredOrigin = safeOrigin(process.env.PUBLIC_APP_URL);
  const requestOrigin = safeOrigin(request?.nextUrl?.origin) || safeOrigin(request?.url);

  const rawProto = request?.headers?.get?.('x-forwarded-proto');
  const proto = rawProto?.split(',')?.[0]?.trim() || (request?.url?.startsWith('https') ? 'https' : 'http');

  const rawForwardedHost = request?.headers?.get?.('x-forwarded-host');
  const rawHost = request?.headers?.get?.('host');
  const candidateHosts = [
    ...(rawForwardedHost ? rawForwardedHost.split(',') : []),
    rawHost,
  ].map((h) => h?.trim()).filter(Boolean);

  const knownOrigins = [
    'https://www.supdance.com',
    'http://www.supdance.com',
    'https://supdance.com',
    'http://supdance.com',
    'https://canvas.supdance.com',
    'http://canvas.supdance.com',
  ];
  const trustedOrigins = new Set([configuredOrigin, requestOrigin, ...knownOrigins].filter(Boolean));

  for (const h of candidateHosts) {
    const orig1 = safeOrigin(`${proto}://${h}`);
    const orig2 = safeOrigin(`${proto === 'https' ? 'http' : 'https'}://${h}`);
    if (orig1) trustedOrigins.add(orig1);
    if (orig2) trustedOrigins.add(orig2);
  }

  const isTrusted = suppliedOrigin
    ? (trustedOrigins.has(suppliedOrigin) || isAllowedDomain(suppliedOrigin, configuredOrigin))
    : false;

  if (suppliedOrigin && !isTrusted) {
    return NextResponse.json({ error: '请求来源无效' }, { status: 403 });
  }

  const required = process.env.CSRF_ORIGIN_REQUIRED !== 'false' && process.env.NODE_ENV === 'production';
  if (required && (!suppliedOrigin || trustedOrigins.size === 0)) {
    return NextResponse.json({ error: '请求缺少有效的来源校验' }, { status: 403 });
  }

  return null;
}

export function guardBodySize(request, maxBytes = DEFAULT_MAX_JSON_BYTES) {
  const contentLength = Number(request?.headers?.get?.('content-length') || 0);
  if (Number.isFinite(contentLength) && contentLength > maxBytes) {
    return NextResponse.json({ error: '请求内容过大' }, { status: 413 });
  }
  return null;
}

export function guardMutation(request, { maxBytes = DEFAULT_MAX_JSON_BYTES } = {}) {
  const method = String(request?.method || 'GET').toUpperCase();
  if (['GET', 'HEAD', 'OPTIONS'].includes(method)) return null;
  return guardSameOrigin(request) || guardBodySize(request, maxBytes);
}

function rateLimitHash(scope, subject) {
  return crypto.createHash('sha256').update(`${scope}:${subject}`).digest('hex');
}

/**
 * PostgreSQL-backed fixed-window limiter. It is intentionally fail-closed:
 * if the limiter cannot be persisted, the caller receives an exception rather
 * than silently allowing an abuse-sensitive operation.
 */
export async function consumeRateLimit({ scope, subject, limit, windowMs }) {
  const cleanScope = String(scope || '').trim();
  const cleanSubject = String(subject || '').trim() || 'unknown';
  const max = Math.max(1, Number(limit) || 1);
  const duration = Math.max(1000, Number(windowMs) || 60_000);
  if (!cleanScope) throw new TypeError('rate limit scope is required');

  const now = new Date();
  const nowIso = now.toISOString();
  const resetThreshold = new Date(now.getTime() - duration).toISOString();
  const keyHash = rateLimitHash(cleanScope, cleanSubject);
  const row = await queryOne(`
    INSERT INTO sys_core.rate_limit_buckets
      (key_hash, scope, subject, window_started_at, request_count, updated_at)
    VALUES ($1, $2, $3, $4, 1, $4)
    ON CONFLICT (key_hash) DO UPDATE SET
      window_started_at = CASE
        WHEN sys_core.rate_limit_buckets.window_started_at <= $5 THEN $4
        ELSE sys_core.rate_limit_buckets.window_started_at
      END,
      request_count = CASE
        WHEN sys_core.rate_limit_buckets.window_started_at <= $5 THEN 1
        ELSE sys_core.rate_limit_buckets.request_count + 1
      END,
      updated_at = $4
    RETURNING request_count, window_started_at
  `, [keyHash, cleanScope, cleanSubject, nowIso, resetThreshold]);

  const requestCount = Number(row?.request_count || 0);
  const windowStartedAt = row?.window_started_at ? new Date(row.window_started_at).getTime() : now.getTime();
  return {
    allowed: requestCount <= max,
    limit: max,
    remaining: Math.max(0, max - requestCount),
    retryAfterSeconds: Math.max(1, Math.ceil((windowStartedAt + duration - now.getTime()) / 1000)),
  };
}

export async function getRateLimitStatus({ scope, subject, limit, windowMs }) {
  const cleanScope = String(scope || '').trim();
  const cleanSubject = String(subject || '').trim() || 'unknown';
  const max = Math.max(1, Number(limit) || 1);
  const duration = Math.max(1000, Number(windowMs) || 60_000);
  if (!cleanScope) throw new TypeError('rate limit scope is required');

  const now = Date.now();
  const keyHash = rateLimitHash(cleanScope, cleanSubject);
  const row = await queryOne(`
    SELECT request_count, window_started_at
    FROM sys_core.rate_limit_buckets
    WHERE key_hash = $1
  `, [keyHash]);
  const windowStartedAt = row?.window_started_at ? new Date(row.window_started_at).getTime() : 0;
  if (!row || windowStartedAt <= now - duration) {
    return { allowed: true, limit: max, remaining: max, retryAfterSeconds: 1 };
  }

  const requestCount = Number(row.request_count || 0);
  return {
    allowed: requestCount < max,
    limit: max,
    remaining: Math.max(0, max - requestCount),
    retryAfterSeconds: Math.max(1, Math.ceil((windowStartedAt + duration - now) / 1000)),
  };
}

export async function resetRateLimitBucket({ scope, subject }) {
  const cleanScope = String(scope || '').trim();
  const cleanSubject = String(subject || '').trim() || 'unknown';
  if (!cleanScope) throw new TypeError('rate limit scope is required');
  const keyHash = rateLimitHash(cleanScope, cleanSubject);
  return execute('DELETE FROM sys_core.rate_limit_buckets WHERE key_hash = $1', [keyHash]);
}

export async function purgeRateLimitBuckets(maxAgeMs = 2 * 86400000) {
  const cutoff = new Date(Date.now() - Math.max(60_000, Number(maxAgeMs) || 2 * 86400000)).toISOString();
  return execute('DELETE FROM sys_core.rate_limit_buckets WHERE updated_at < $1', [cutoff]);
}

export function rateLimitResponse(result) {
  return NextResponse.json(
    { error: '请求过于频繁，请稍后重试' },
    {
      status: 429,
      headers: {
        'Retry-After': String(result?.retryAfterSeconds || 60),
        'X-RateLimit-Limit': String(result?.limit || 1),
        'X-RateLimit-Remaining': String(result?.remaining || 0),
      },
    },
  );
}
