import crypto from 'node:crypto';

// In-memory fallbacks when PostgreSQL is not configured or in unit test runtime
const inMemoryPushLogs = [];
const inMemorySettings = new Map();

let cachedDb = null;
async function getDb() {
  if (cachedDb) return cachedDb;
  try {
    cachedDb = await import('../db/index.js');
    return cachedDb;
  } catch {
    return null;
  }
}

/**
 * Record a search engine active push log entry into ops_bill.seo_push_logs
 * with in-memory array fallback.
 */
export async function recordPushLog({
  id = null,
  engine,
  urls = [],
  urlCount = null,
  status = 'success',
  statusCode = 200,
  responseBody = null,
  errorMessage = null,
  latencyMs = null,
  createdBy = null,
  actorEmail = null,
}) {
  const logId = id || crypto.randomUUID();
  const normalizedUrls = Array.isArray(urls) ? urls : [];
  const normalizedCount = Number.isInteger(urlCount) ? urlCount : normalizedUrls.length;
  const normalizedEngine = String(engine || 'unknown').toLowerCase();
  const actor = createdBy || actorEmail || 'system';
  const now = new Date().toISOString();

  const record = {
    id: logId,
    engine: normalizedEngine,
    urls: normalizedUrls,
    urls_json: normalizedUrls,
    url_count: normalizedCount,
    status: String(status || 'success'),
    status_code: typeof statusCode === 'number' ? statusCode : null,
    response_body: responseBody && typeof responseBody === 'object' ? responseBody : { raw: responseBody },
    error_message: errorMessage ? String(errorMessage) : null,
    latency_ms: Number.isFinite(latencyMs) ? Math.max(0, Math.round(latencyMs)) : null,
    created_by: actor,
    actor_email: actor,
    created_at: now,
  };

  const db = await getDb();
  if (db && process.env.DATABASE_URL) {
    try {
      await db.execute(
        `INSERT INTO ops_bill.seo_push_logs (
          id, engine, urls, urls_json, url_count, status, status_code,
          response_body, error_message, latency_ms, created_by, actor_email, created_at
        ) VALUES (
          $1, $2, $3::jsonb, $4::jsonb, $5, $6, $7, $8::jsonb, $9, $10, $11, $12, $13
        )`,
        [
          record.id,
          record.engine,
          JSON.stringify(record.urls),
          JSON.stringify(record.urls_json),
          record.url_count,
          record.status,
          record.status_code,
          JSON.stringify(record.response_body),
          record.error_message,
          record.latency_ms,
          record.created_by,
          record.actor_email,
          record.created_at,
        ]
      );
      return record;
    } catch {
      // Fall through to in-memory store on DB failure
    }
  }

  // Fallback: in-memory storage
  inMemoryPushLogs.unshift(record);
  if (inMemoryPushLogs.length > 500) {
    inMemoryPushLogs.pop();
  }
  return record;
}

/**
 * List recent push logs with pagination and optional engine filtering.
 */
export async function listPushLogs({ limit = 50, offset = 0, engine = null } = {}) {
  const maxLimit = Math.min(Math.max(1, Number(limit) || 50), 200);
  const skip = Math.max(0, Number(offset) || 0);

  const db = await getDb();
  if (db && process.env.DATABASE_URL) {
    try {
      const conditions = [];
      const params = [];

      if (engine && typeof engine === 'string') {
        params.push(engine.toLowerCase());
        conditions.push(`engine = $${params.length}`);
      }

      params.push(maxLimit);
      const limitParam = `$${params.length}`;
      params.push(skip);
      const offsetParam = `$${params.length}`;

      const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
      const sql = `
        SELECT id, engine, urls, urls_json, url_count, status, status_code,
               response_body, error_message, latency_ms, created_by, actor_email, created_at
        FROM ops_bill.seo_push_logs
        ${whereClause}
        ORDER BY created_at DESC
        LIMIT ${limitParam} OFFSET ${offsetParam}
      `;

      const rows = await db.queryMany(sql, params);
      return rows.map((row) => ({
        ...row,
        urls: Array.isArray(row.urls) ? row.urls : (row.urls_json || []),
        urls_json: Array.isArray(row.urls_json) ? row.urls_json : (row.urls || []),
        response_body: typeof row.response_body === 'string' ? JSON.parse(row.response_body) : row.response_body,
      }));
    } catch {
      // Fall through to in-memory
    }
  }

  // In-memory fallback
  let filtered = inMemoryPushLogs;
  if (engine) {
    const target = engine.toLowerCase();
    filtered = filtered.filter((item) => item.engine === target);
  }

  return filtered.slice(skip, skip + maxLimit);
}

/**
 * Read system settings key (e.g. site_seo or search_push_config)
 * with in-memory fallback.
 */
export async function getSeoSetting(key) {
  const db = await getDb();
  if (db && process.env.DATABASE_URL) {
    try {
      const row = await db.queryOne(
        `SELECT value_json, updated_by, updated_at FROM ops_bill.system_settings WHERE key = $1`,
        [key]
      );
      if (row?.value_json) {
        return typeof row.value_json === 'string' ? JSON.parse(row.value_json) : row.value_json;
      }
    } catch {
      // Fall through to in-memory
    }
  }

  return inMemorySettings.get(key) || null;
}

/**
 * Persist system settings key (e.g. site_seo or search_push_config)
 * with in-memory fallback.
 */
export async function saveSeoSetting(key, value, updatedBy = 'system') {
  const now = new Date().toISOString();
  const db = await getDb();

  if (db && process.env.DATABASE_URL) {
    try {
      const jsonStr = JSON.stringify(value);
      await db.execute(
        `INSERT INTO ops_bill.system_settings (key, value_json, updated_by, updated_at)
         VALUES ($1, $2::jsonb, $3, $4)
         ON CONFLICT (key) DO UPDATE SET
           value_json = excluded.value_json,
           updated_by = excluded.updated_by,
           updated_at = excluded.updated_at`,
        [key, jsonStr, updatedBy, now]
      );
    } catch {
      // Fall through to in-memory
    }
  }

  inMemorySettings.set(key, value);
  return value;
}
