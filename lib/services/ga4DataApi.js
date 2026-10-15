import crypto from 'node:crypto';

/**
 * Google Analytics Data API (v1beta) Client for SupDance Admin
 * Uses pure Node.js crypto + fetch to sign JWTs for Google Service Accounts,
 * avoiding external SDK bloat and providing high-performance, edge/node-compatible API calls.
 */

const GA_DATA_API_BASE = 'https://analyticsdata.googleapis.com/v1beta/properties';
const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const GA_READONLY_SCOPE = 'https://www.googleapis.com/auth/analytics.readonly';

// In-memory token cache keyed by clientEmail
const tokenCache = new Map();

/**
 * Base64URL encoder helper
 */
function base64UrlEncode(strOrBuffer) {
  const buf = Buffer.isBuffer(strOrBuffer) ? strOrBuffer : Buffer.from(strOrBuffer, 'utf8');
  return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/**
 * Normalizes private key string, converting escaped \n to real newlines
 */
export function normalizePrivateKey(rawKey) {
  if (!rawKey || typeof rawKey !== 'string') return '';
  let key = rawKey.trim();
  // Strip enclosing quotes if present
  if ((key.startsWith('"') && key.endsWith('"')) || (key.startsWith("'") && key.endsWith("'"))) {
    key = key.slice(1, -1);
  }
  // Replace literal \n with newline characters
  key = key.replace(/\\n/g, '\n');
  return key;
}

/**
 * Generates an OAuth2 Access Token for Google APIs using Service Account JWT assertion
 * @param {Object} params
 * @param {string} params.clientEmail
 * @param {string} params.privateKey
 * @param {string} [params.scope]
 * @returns {Promise<string>} Bearer Access Token
 */
export async function getGoogleServiceAccountAccessToken({ clientEmail, privateKey, scope = GA_READONLY_SCOPE }) {
  if (!clientEmail || !privateKey) {
    throw new Error('缺少 Google Service Account clientEmail 或 privateKey 凭据');
  }

  const cacheKey = `${clientEmail}::${scope}`;
  const now = Math.floor(Date.now() / 1000);
  const cached = tokenCache.get(cacheKey);

  // Return cached token if valid for at least another 180 seconds
  if (cached && cached.expiresAt > now + 180) {
    return cached.token;
  }

  const normalizedKey = normalizePrivateKey(privateKey);
  const header = { alg: 'RS256', typ: 'JWT' };
  const claimSet = {
    iss: clientEmail,
    scope,
    aud: GOOGLE_TOKEN_URL,
    exp: now + 3600,
    iat: now,
  };

  const encodedHeader = base64UrlEncode(JSON.stringify(header));
  const encodedClaim = base64UrlEncode(JSON.stringify(claimSet));
  const signatureInput = `${encodedHeader}.${encodedClaim}`;

  let signature;
  try {
    const signer = crypto.createSign('RSA-SHA256');
    signer.update(signatureInput);
    signature = base64UrlEncode(signer.sign(normalizedKey));
  } catch (err) {
    throw new Error(`Google 服务账号私钥签名失败: ${err?.message || '私钥格式不合法'}`);
  }

  const jwt = `${signatureInput}.${signature}`;

  const res = await fetch(GOOGLE_TOKEN_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: jwt,
    }),
  });

  if (!res.ok) {
    const errText = await res.text();
    let parsedErr = errText;
    try {
      const j = JSON.parse(errText);
      parsedErr = j.error_description || j.error || errText;
    } catch {}
    throw new Error(`Google OAuth2 Token 申请失败 (${res.status}): ${parsedErr}`);
  }

  const tokenData = await res.json();
  const accessToken = tokenData.access_token;
  const expiresIn = tokenData.expires_in || 3600;

  tokenCache.set(cacheKey, {
    token: accessToken,
    expiresAt: now + expiresIn,
  });

  return accessToken;
}

/**
 * Resolves active GA4 credentials from either custom config or environment variables
 * @param {Object} [customCredentials]
 * @returns {{ propertyId: string, clientEmail: string, privateKey: string, source: string } | null}
 */
export function resolveGa4Credentials(customCredentials = null) {
  // 1. Check custom config provided in request or stored in DB
  if (customCredentials?.propertyId && customCredentials?.clientEmail && customCredentials?.privateKey) {
    return {
      propertyId: String(customCredentials.propertyId).trim(),
      clientEmail: String(customCredentials.clientEmail).trim(),
      privateKey: normalizePrivateKey(customCredentials.privateKey),
      source: 'custom_config',
    };
  }

  // 2. Check JSON string in GA4_SERVICE_ACCOUNT_KEY
  if (process.env.GA4_SERVICE_ACCOUNT_KEY) {
    try {
      const sa = JSON.parse(process.env.GA4_SERVICE_ACCOUNT_KEY);
      const propertyId = customCredentials?.propertyId || process.env.GA4_PROPERTY_ID || '';
      if (sa.client_email && sa.private_key && propertyId) {
        return {
          propertyId: String(propertyId).trim(),
          clientEmail: sa.client_email,
          privateKey: normalizePrivateKey(sa.private_key),
          source: 'env_sa_json',
        };
      }
    } catch {}
  }

  // 3. Check individual env variables
  const envPropId = customCredentials?.propertyId || process.env.GA4_PROPERTY_ID || '';
  const envEmail = process.env.GA4_SERVICE_ACCOUNT_EMAIL || '';
  const envKey = process.env.GA4_PRIVATE_KEY || '';

  if (envPropId && envEmail && envKey) {
    return {
      propertyId: String(envPropId).trim(),
      clientEmail: envEmail.trim(),
      privateKey: normalizePrivateKey(envKey),
      source: 'env_vars',
    };
  }

  return null;
}

/**
 * Runs a Realtime report on GA4
 * @param {Object} credentials
 * @returns {Promise<Object>} Realtime metrics and breakdown
 */
export async function runGa4RealtimeReport(credentials) {
  const token = await getGoogleServiceAccountAccessToken(credentials);
  const propertyId = credentials.propertyId.replace(/^properties\//, '');
  const url = `${GA_DATA_API_BASE}/${propertyId}:runRealtimeReport`;

  const requestBody = {
    metrics: [{ name: 'activeUsers' }],
    dimensions: [{ name: 'unifiedScreenName' }],
    limit: 10,
  };

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(requestBody),
  });

  if (!res.ok) {
    const errText = await res.text();
    let errMsg = errText;
    try {
      const j = JSON.parse(errText);
      errMsg = j.error?.message || errText;
    } catch {}
    throw new Error(`GA4 Realtime API 调用失败 (${res.status}): ${errMsg}`);
  }

  const json = await res.json();

  let totalActive = 0;
  const topPages = [];

  if (Array.isArray(json.rows)) {
    for (const row of json.rows) {
      const pagePath = row.dimensionValues?.[0]?.value || '/';
      const count = parseInt(row.metricValues?.[0]?.value || '0', 10);
      totalActive += count;
      topPages.push({ path: pagePath, activeUsers: count });
    }
  }

  return {
    activeUsers: totalActive,
    topPages: topPages.slice(0, 5),
    sampled: Boolean(json.kind),
    timestamp: new Date().toISOString(),
  };
}

/**
 * Runs a Core Summary report on GA4 (Total users, new users, pageviews, top pages)
 * @param {Object} credentials
 * @param {string} [dateRange='7d'] 'today' | '7d' | '30d'
 * @returns {Promise<Object>}
 */
export async function runGa4SummaryReport(credentials, dateRange = '7d') {
  const token = await getGoogleServiceAccountAccessToken(credentials);
  const propertyId = credentials.propertyId.replace(/^properties\//, '');
  const url = `${GA_DATA_API_BASE}/${propertyId}:runReport`;

  let startDate = '7daysAgo';
  if (dateRange === 'today') startDate = 'today';
  if (dateRange === '30d') startDate = '30daysAgo';
  if (dateRange === '90d') startDate = '90daysAgo';

  // 1. Fetch KPI aggregates
  const summaryRes = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      dateRanges: [{ startDate, endDate: 'today' }],
      metrics: [
        { name: 'activeUsers' },
        { name: 'newUsers' },
        { name: 'screenPageViews' },
        { name: 'sessions' },
        { name: 'averageSessionDuration' },
        { name: 'bounceRate' },
      ],
    }),
  });

  if (!summaryRes.ok) {
    const errText = await summaryRes.text();
    let errMsg = errText;
    try {
      const j = JSON.parse(errText);
      errMsg = j.error?.message || errText;
    } catch {}
    throw new Error(`GA4 Summary API 调用失败 (${summaryRes.status}): ${errMsg}`);
  }

  const summaryJson = await summaryRes.json();
  const summaryRow = summaryJson.rows?.[0]?.metricValues || [];

  const summary = {
    dateRange,
    activeUsers: parseInt(summaryRow[0]?.value || '0', 10),
    newUsers: parseInt(summaryRow[1]?.value || '0', 10),
    screenPageViews: parseInt(summaryRow[2]?.value || '0', 10),
    sessions: parseInt(summaryRow[3]?.value || '0', 10),
    averageSessionDuration: Math.round(parseFloat(summaryRow[4]?.value || '0')),
    bounceRate: Math.round(parseFloat(summaryRow[5]?.value || '0') * 100),
  };

  // 2. Fetch Top Pages Breakdown
  let topPages = [];
  try {
    const pagesRes = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        dateRanges: [{ startDate, endDate: 'today' }],
        dimensions: [{ name: 'pagePath' }],
        metrics: [{ name: 'screenPageViews' }],
        orderBys: [{ metric: { metricName: 'screenPageViews' }, desc: true }],
        limit: 5,
      }),
    });
    if (pagesRes.ok) {
      const pagesJson = await pagesRes.json();
      if (Array.isArray(pagesJson.rows)) {
        topPages = pagesJson.rows.map((r) => ({
          path: r.dimensionValues?.[0]?.value || '/',
          views: parseInt(r.metricValues?.[0]?.value || '0', 10),
        }));
      }
    }
  } catch {}

  // 3. Fetch Top Countries Breakdown
  let topCountries = [];
  try {
    const countriesRes = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        dateRanges: [{ startDate, endDate: 'today' }],
        dimensions: [{ name: 'country' }],
        metrics: [{ name: 'activeUsers' }],
        orderBys: [{ metric: { metricName: 'activeUsers' }, desc: true }],
        limit: 5,
      }),
    });
    if (countriesRes.ok) {
      const countriesJson = await countriesRes.json();
      if (Array.isArray(countriesJson.rows)) {
        topCountries = countriesJson.rows.map((r) => ({
          country: r.dimensionValues?.[0]?.value || 'Unknown',
          users: parseInt(r.metricValues?.[0]?.value || '0', 10),
        }));
      }
    }
  } catch {}

  return {
    summary,
    topPages,
    topCountries,
    fetchedAt: new Date().toISOString(),
  };
}

/**
 * Tests GA4 connectivity using provided or discovered credentials
 * @param {Object} [customCredentials]
 * @returns {Promise<{ ok: boolean, message: string, details?: any }>}
 */
export async function testGa4DataApiConnection(customCredentials = null) {
  const creds = resolveGa4Credentials(customCredentials);
  if (!creds) {
    return {
      ok: false,
      message: '未找到 GA4 Data API 凭据，请提供 Property ID、Service Account Client Email 与 Private Key',
    };
  }

  try {
    const realtime = await runGa4RealtimeReport(creds);
    return {
      ok: true,
      message: `连接成功！当前实时在线活跃访客: ${realtime.activeUsers} 人`,
      details: {
        propertyId: creds.propertyId,
        source: creds.source,
        realtimeActiveUsers: realtime.activeUsers,
      },
    };
  } catch (err) {
    return {
      ok: false,
      message: err?.message || 'GA4 API 连接测试失败',
    };
  }
}
