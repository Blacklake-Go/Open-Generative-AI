import crypto from 'node:crypto';
import * as seoRepo from '../repositories/seo.js';

export const DEFAULT_SEARCH_PUSH_CONFIG = {
  indexNow: {
    enabled: true,
    host: 'www.supdance.com',
    key: '3f82a45c81924619b068ad1d5d893f44',
  },
  baiduPush: {
    enabled: false,
    site: 'https://www.supdance.com',
    token: '',
  },
};

/**
 * Validates a list of target URLs for search engine submission.
 * Enforces single host origin, allowed protocols (http/https), blocks private admin/api routes,
 * removes hash fragments, deduplicates, and caps at 100 URLs.
 */
export function validatePushUrls(urls, allowedHost = 'www.supdance.com') {
  if (!Array.isArray(urls) || urls.length === 0) {
    return { valid: false, validUrls: [], errors: ['推送 URL 列表不能为空且必须为数组'] };
  }

  const errors = [];
  const normalizedSet = new Set();
  const allowedWithoutPort = String(allowedHost || 'www.supdance.com')
    .replace(/^https?:\/\//, '')
    .split('/')[0]
    .split(':')[0]
    .toLowerCase();

  for (const item of urls) {
    if (typeof item !== 'string' || !item.trim()) {
      errors.push(`无效的 URL 条目: ${JSON.stringify(item)}`);
      continue;
    }
    const trimmed = item.trim();
    let parsed;
    try {
      parsed = new URL(trimmed);
    } catch {
      errors.push(`URL 格式无法解析: ${trimmed}`);
      continue;
    }

    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      errors.push(`URL 协议不受支持 (${parsed.protocol})，仅允许 http 与 https: ${trimmed}`);
      continue;
    }

    const hostWithoutPort = parsed.hostname.toLowerCase();
    if (hostWithoutPort !== allowedWithoutPort) {
      errors.push(`URL 域名跨域 (${parsed.hostname})，必须属于主站点 ${allowedWithoutPort}: ${trimmed}`);
      continue;
    }

    if (parsed.pathname.startsWith('/admin') || parsed.pathname.startsWith('/api')) {
      errors.push(`URL 指向私有或管理后台路径，禁止向搜索引擎提交: ${trimmed}`);
      continue;
    }

    // Canonicalize: remove hash
    parsed.hash = '';
    normalizedSet.add(parsed.toString());
  }

  const validUrls = Array.from(normalizedSet);
  if (validUrls.length > 100) {
    return {
      valid: false,
      validUrls: validUrls.slice(0, 100),
      errors: [`批量推送单次最大限制为 100 条 URL（当前去重后为 ${validUrls.length} 条）`],
    };
  }

  return {
    valid: errors.length === 0 && validUrls.length > 0,
    validUrls,
    errors,
  };
}

/**
 * Builds standard IndexNow JSON payload for Bing / Yandex submission.
 */
export function buildIndexNowPayload({ host = 'www.supdance.com', key, keyLocation, urls = [] } = {}) {
  if (!key || typeof key !== 'string') {
    throw new Error('IndexNow key 必须为有效字符串');
  }
  if (!Array.isArray(urls) || urls.length === 0) {
    throw new Error('IndexNow urlList 不能为空');
  }
  return {
    host: host || 'www.supdance.com',
    key,
    keyLocation: keyLocation || `https://${host || 'www.supdance.com'}/api/seo/indexnow-key`,
    urlList: urls,
  };
}

/**
 * Builds Baidu resource platform text/plain payload.
 */
export function buildBaiduPushPayload(urls = []) {
  if (!Array.isArray(urls) || urls.length === 0) {
    throw new Error('百度主动推送 URL 列表不能为空');
  }
  return urls.join('\n');
}

/**
 * Retrieve active search push settings with default fallback.
 */
export async function getSearchPushConfig() {
  const stored = await seoRepo.getSeoSetting('search_push_config');
  if (!stored) {
    return DEFAULT_SEARCH_PUSH_CONFIG;
  }

  return {
    indexNow: {
      enabled: stored.indexNow?.enabled ?? stored.indexnow?.enabled ?? DEFAULT_SEARCH_PUSH_CONFIG.indexNow.enabled,
      host: stored.indexNow?.host ?? stored.indexnow?.host ?? DEFAULT_SEARCH_PUSH_CONFIG.indexNow.host,
      key: stored.indexNow?.key ?? stored.indexnow?.key ?? DEFAULT_SEARCH_PUSH_CONFIG.indexNow.key,
    },
    baiduPush: {
      enabled: stored.baiduPush?.enabled ?? stored.baidu?.enabled ?? DEFAULT_SEARCH_PUSH_CONFIG.baiduPush.enabled,
      site: stored.baiduPush?.site ?? stored.baidu?.site ?? DEFAULT_SEARCH_PUSH_CONFIG.baiduPush.site,
      token: stored.baiduPush?.token ?? stored.baidu?.token ?? DEFAULT_SEARCH_PUSH_CONFIG.baiduPush.token,
    },
  };
}

/**
 * Persist active search push configuration.
 */
export async function saveSearchPushConfig(config, user = null) {
  const current = await getSearchPushConfig();
  const nextConfig = {
    indexNow: {
      enabled: Boolean(config.indexNow?.enabled ?? config.indexnow?.enabled ?? current.indexNow.enabled),
      host: String(config.indexNow?.host ?? config.indexnow?.host ?? current.indexNow.host).trim(),
      key: String(config.indexNow?.key ?? config.indexnow?.key ?? current.indexNow.key).trim(),
    },
    baiduPush: {
      enabled: Boolean(config.baiduPush?.enabled ?? config.baidu?.enabled ?? current.baiduPush.enabled),
      site: String(config.baiduPush?.site ?? config.baidu?.site ?? current.baiduPush.site).trim(),
      token: String(config.baiduPush?.token ?? config.baidu?.token ?? current.baiduPush.token).trim(),
    },
  };

  const actor = user?.email || user?.name || 'system';
  await seoRepo.saveSeoSetting('search_push_config', nextConfig, actor);
  return nextConfig;
}

/**
 * Execute active push to specified search engine(s): 'indexnow', 'baidu', or 'all'.
 * Records telemetry and execution results into ops_bill.seo_push_logs.
 */
export async function executeSearchPush({ engine = 'all', urls = [], user = null, actorEmail = null }) {
  const config = await getSearchPushConfig();
  const actor = user?.email || actorEmail || 'system';
  const targetEngine = String(engine || 'all').toLowerCase();

  // Validate URLs
  const host = config.indexNow?.host || 'www.supdance.com';
  const validation = validatePushUrls(urls, host);

  if (!validation.valid && validation.validUrls.length === 0) {
    return {
      success: false,
      engine: targetEngine,
      count: 0,
      errors: validation.errors,
      logs: [],
    };
  }

  const validUrls = validation.validUrls;
  const dispatchLogs = [];
  let totalSuccess = true;
  let remain = null;

  // 1. Dispatch IndexNow
  if (targetEngine === 'indexnow' || targetEngine === 'all') {
    const startTime = Date.now();
    let status = 'failed';
    let statusCode = null;
    let responseBody = null;
    let errorMessage = null;

    try {
      const payload = buildIndexNowPayload({
        host: config.indexNow.host,
        key: config.indexNow.key,
        urls: validUrls,
      });

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 8000);

      const res = await fetch('https://api.indexnow.org/indexnow', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json; charset=utf-8',
        },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });
      clearTimeout(timeoutId);

      statusCode = res.status;
      try {
        responseBody = await res.json();
      } catch {
        const text = await res.text();
        responseBody = text ? { raw: text } : { message: res.statusText || 'OK' };
      }

      // IndexNow returns 200 (OK) or 202 (Accepted) on success
      if (res.status === 200 || res.status === 202) {
        status = 'success';
      } else {
        status = 'failed';
        totalSuccess = false;
        errorMessage = `IndexNow API returned status ${res.status}`;
      }
    } catch (err) {
      status = 'failed';
      totalSuccess = false;
      statusCode = err.name === 'AbortError' ? 504 : 503;
      errorMessage = err.message;
      responseBody = { error: err.message };
    }

    const latencyMs = Date.now() - startTime;
    const log = await seoRepo.recordPushLog({
      engine: 'indexnow',
      urls: validUrls,
      urlCount: validUrls.length,
      status,
      statusCode,
      responseBody,
      errorMessage,
      latencyMs,
      createdBy: actor,
      actorEmail: actor,
    });
    dispatchLogs.push(log);
  }

  // 2. Dispatch Baidu
  if (targetEngine === 'baidu' || targetEngine === 'all') {
    const startTime = Date.now();
    let status = 'failed';
    let statusCode = null;
    let responseBody = null;
    let errorMessage = null;

    if (!config.baiduPush?.token) {
      statusCode = 400;
      errorMessage = '百度主动推送准入密钥 (token) 尚未配置';
      responseBody = { error: 400, message: errorMessage };
      totalSuccess = false;
    } else {
      try {
        const payload = buildBaiduPushPayload(validUrls);
        const baiduUrl = `http://data.zz.baidu.com/urls?site=${encodeURIComponent(config.baiduPush.site)}&token=${encodeURIComponent(config.baiduPush.token)}`;

        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 8000);

        const res = await fetch(baiduUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'text/plain',
          },
          body: payload,
          signal: controller.signal,
        });
        clearTimeout(timeoutId);

        statusCode = res.status;
        try {
          responseBody = await res.json();
          if (typeof responseBody.remain === 'number') {
            remain = responseBody.remain;
          }
        } catch {
          const text = await res.text();
          responseBody = { raw: text };
        }

        if (res.status === 200 && responseBody?.success) {
          status = 'success';
        } else {
          status = 'failed';
          totalSuccess = false;
          errorMessage = responseBody?.message || `Baidu Push API returned status ${res.status}`;
        }
      } catch (err) {
        status = 'failed';
        totalSuccess = false;
        statusCode = err.name === 'AbortError' ? 504 : 503;
        errorMessage = err.message;
        responseBody = { error: err.message };
      }
    }

    const latencyMs = Date.now() - startTime;
    const log = await seoRepo.recordPushLog({
      engine: 'baidu',
      urls: validUrls,
      urlCount: validUrls.length,
      status,
      statusCode,
      responseBody,
      errorMessage,
      latencyMs,
      createdBy: actor,
      actorEmail: actor,
    });
    dispatchLogs.push(log);
  }

  return {
    success: totalSuccess,
    engine: targetEngine,
    count: validUrls.length,
    remain,
    logs: dispatchLogs,
  };
}
