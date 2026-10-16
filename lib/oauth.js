import "server-only";

import crypto from "node:crypto";
import * as providerRepo from "./repositories/providers.js";

/**
 * 社交登录唯一协议源：路由段 id（wechat/qq/douyin）→ 协议参数 + 凭据命名空间。
 * 凭据存放在 ops_bill.provider_secrets，通过 credentialProvider/credentialNames
 * 声明，env 只做兜底；微信用 wechat_oauth 命名空间以免与微信支付串线。
 */
const PROVIDERS = {
  google: {
    credentialProvider: 'google',
    credentialNames: { clientId: 'client_id', clientSecret: 'client_secret' },
    envClientId: 'GOOGLE_CLIENT_ID',
    envClientSecret: 'GOOGLE_CLIENT_SECRET',
    authorizeUrl: "https://accounts.google.com/o/oauth2/v2/auth",
    tokenUrl: "https://oauth2.googleapis.com/token",
    userInfoUrl: "https://openidconnect.googleapis.com/v1/userinfo",
    scopes: ["openid", "email", "profile"],
    pkce: true,
    authExtraParams: { prompt: "select_account" },
    clientIdParam: 'client_id',
    tokenTransport: 'form',
    profileTransport: 'bearer',
    clientId: () => process.env.GOOGLE_CLIENT_ID,
    clientSecret: () => process.env.GOOGLE_CLIENT_SECRET,
  },
  x: {
    credentialProvider: 'x',
    credentialNames: { clientId: 'client_id', clientSecret: 'client_secret' },
    envClientId: 'X_CLIENT_ID',
    envClientSecret: 'X_CLIENT_SECRET',
    authorizeUrl: "https://twitter.com/i/oauth2/authorize",
    tokenUrl: "https://api.x.com/2/oauth2/token",
    userInfoUrl: "https://api.x.com/2/users/me?user.fields=profile_image_url",
    scopes: ["users.read", "tweet.read", "offline.access"],
    pkce: true,
    clientIdParam: 'client_id',
    tokenTransport: 'form',
    tokenBasicAuth: true,
    profileTransport: 'bearer',
    clientId: () => process.env.X_CLIENT_ID,
    clientSecret: () => process.env.X_CLIENT_SECRET,
  },
  tiktok: {
    credentialProvider: 'tiktok',
    credentialNames: { clientId: 'client_key', clientSecret: 'client_secret' },
    envClientId: 'TIKTOK_CLIENT_KEY',
    envClientSecret: 'TIKTOK_CLIENT_SECRET',
    authorizeUrl: "https://www.tiktok.com/v2/auth/authorize/",
    tokenUrl: "https://open.tiktokapis.com/v2/oauth/token/",
    userInfoUrl: "https://open.tiktokapis.com/v2/user/info/?fields=open_id,union_id,display_name,avatar_url",
    scopes: ["user.info.basic"],
    pkce: true,
    clientIdParam: 'client_key',
    tokenTransport: 'form',
    profileTransport: 'bearer',
    clientId: () => process.env.TIKTOK_CLIENT_KEY,
    clientSecret: () => process.env.TIKTOK_CLIENT_SECRET,
  },
  instagram: {
    credentialProvider: 'instagram',
    credentialNames: { clientId: ['client_id', 'app_id'], clientSecret: ['client_secret', 'app_secret'] },
    envClientId: 'INSTAGRAM_CLIENT_ID',
    envClientSecret: 'INSTAGRAM_CLIENT_SECRET',
    authorizeUrl: "https://www.instagram.com/oauth/authorize",
    tokenUrl: "https://api.instagram.com/oauth/access_token",
    userInfoUrl: "https://graph.instagram.com/me?fields=id,username,account_type",
    scopes: ["instagram_business_basic"],
    pkce: false,
    clientIdParam: 'client_id',
    secretParam: 'client_secret',
    tokenTransport: 'form',
    profileTransport: 'instagram',
    clientId: () => process.env.INSTAGRAM_CLIENT_ID || process.env.INSTAGRAM_APP_ID,
    clientSecret: () => process.env.INSTAGRAM_CLIENT_SECRET || process.env.INSTAGRAM_APP_SECRET,
  },
  wechat: {
    credentialProvider: ['wechat_oauth', 'wechat'],
    credentialNames: { clientId: ['app_id', 'client_id'], clientSecret: ['app_secret', 'client_secret'] },
    envClientId: 'WECHAT_OAUTH_APP_ID',
    envClientSecret: 'WECHAT_OAUTH_APP_SECRET',
    authorizeUrl: "https://open.weixin.qq.com/connect/qrconnect",
    tokenUrl: "https://api.weixin.qq.com/sns/oauth2/access_token",
    userInfoUrl: "https://api.weixin.qq.com/sns/userinfo",
    scopes: ["snsapi_login"],
    pkce: false,
    clientIdParam: 'appid',
    secretParam: 'secret',
    tokenTransport: 'get-query',
    authorizeFragment: '#wechat_redirect',
    profileTransport: 'wechat-query',
    profileNeedsOpenid: true,
    clientId: () => process.env.WECHAT_OAUTH_APP_ID || process.env.WECHAT_APP_ID,
    clientSecret: () => process.env.WECHAT_OAUTH_APP_SECRET || process.env.WECHAT_SECRET,
  },
  qq: {
    credentialProvider: 'qq',
    credentialNames: { clientId: 'app_id', clientSecret: 'app_key' },
    envClientId: 'QQ_APP_ID',
    envClientSecret: 'QQ_APP_KEY',
    authorizeUrl: "https://graph.qq.com/oauth2.0/authorize",
    tokenUrl: "https://graph.qq.com/oauth2.0/token",
    openIdUrl: "https://graph.qq.com/oauth2.0/me",
    userInfoUrl: "https://graph.qq.com/user/get_user_info",
    scopes: ["get_user_info"],
    pkce: false,
    clientIdParam: 'client_id',
    secretParam: 'client_secret',
    tokenTransport: 'form',
    tokenExtraParams: { fmt: 'json' },
    profileTransport: 'qq-jsonp',
    clientId: () => process.env.QQ_APP_ID,
    clientSecret: () => process.env.QQ_APP_KEY,
  },
  bilibili: {
    credentialProvider: 'bilibili',
    credentialNames: { clientId: 'client_id', clientSecret: 'client_secret' },
    envClientId: 'BILIBILI_CLIENT_ID',
    envClientSecret: 'BILIBILI_CLIENT_SECRET',
    authorizeUrl: 'https://account.bilibili.com/pc/account-pc/auth/oauth',
    tokenUrl: 'https://api.bilibili.com/x/account-oauth2/v1/token',
    userInfoUrl: 'https://member.bilibili.com/arcopen/fn/user/account/info',
    scopes: ['USER_INFO'],
    pkce: false,
    clientIdParam: 'client_id',
    secretParam: 'client_secret',
    tokenTransport: 'bilibili-query-post',
    profileTransport: 'bilibili-signed',
    clientId: () => process.env.BILIBILI_CLIENT_ID,
    clientSecret: () => process.env.BILIBILI_CLIENT_SECRET,
  },
  douyin: {
    credentialProvider: 'douyin',
    credentialNames: { clientId: ['client_key', 'app_id'], clientSecret: ['client_secret', 'app_secret'] },
    envClientId: 'DOUYIN_CLIENT_KEY',
    envClientSecret: 'DOUYIN_CLIENT_SECRET',
    authorizeUrl: "https://open.douyin.com/platform/oauth/connect/",
    tokenUrl: "https://open.douyin.com/oauth/access_token/",
    userInfoUrl: "https://open.douyin.com/oauth/userinfo/",
    scopes: ["user_info"],
    pkce: false,
    clientIdParam: 'client_key',
    secretParam: 'client_secret',
    tokenTransport: 'form',
    profileTransport: 'douyin-post',
    profileNeedsOpenid: true,
    clientId: () => process.env.DOUYIN_CLIENT_KEY || process.env.DOUYIN_APP_ID,
    clientSecret: () => process.env.DOUYIN_CLIENT_SECRET || process.env.DOUYIN_APP_SECRET,
  },
};
PROVIDERS.wechat_oauth = PROVIDERS.wechat;

export async function getResolvedOAuthConfig(provider) {
  const p = String(provider || "").toLowerCase();
  const config = PROVIDERS[p];
  if (!config) return null;

  const { credentialProvider, credentialNames, envClientId, envClientSecret } = config;
  let clientId = null;
  let clientSecret = null;

  const resolveSecretCandidate = async (names) => {
    const list = Array.isArray(names) ? names : [names];
    const provList = Array.isArray(credentialProvider) ? credentialProvider : [credentialProvider];
    for (const prov of provList) {
      for (const name of list) {
        if (!name) continue;
        const val = await providerRepo.getProviderSecret(prov, name);
        if (val) return val;
      }
    }
    return null;
  };

  try {
    clientId = (await resolveSecretCandidate(credentialNames.clientId))
      || process.env[envClientId]
      || (typeof config.clientId === 'function' ? config.clientId() : null)
      || null;
    clientSecret = (await resolveSecretCandidate(credentialNames.clientSecret))
      || process.env[envClientSecret]
      || (typeof config.clientSecret === 'function' ? config.clientSecret() : null)
      || null;
  } catch (err) {
    console.error(`[oauth] 读取 ${credentialProvider} 数据库密钥失败，回退环境变量:`, err.message);
    clientId = typeof config.clientId === 'function' ? config.clientId() : null;
    clientSecret = typeof config.clientSecret === 'function' ? config.clientSecret() : null;
  }

  return {
    ...config,
    resolvedClientId: clientId,
    resolvedClientSecret: clientSecret,
    configured: Boolean(clientId && clientSecret),
  };
}

export function getOAuthProvider(provider) {
  return PROVIDERS[String(provider || "").toLowerCase()] || null;
}

export function listOAuthProviders() {
  return Object.keys(PROVIDERS);
}

export async function isOAuthProviderConfigured(provider) {
  const resolved = await getResolvedOAuthConfig(provider);
  return Boolean(resolved?.configured);
}

export function isOAuthConfigured(provider) {
  const config = getOAuthProvider(provider);
  return Boolean(config?.clientId() && config?.clientSecret());
}

function stateSecret() {
  const secret = process.env.OAUTH_STATE_SECRET || process.env.BILLING_SESSION_SECRET;
  if (!secret && process.env.NODE_ENV === "production") throw new Error("OAUTH_STATE_SECRET is not configured");
  return secret || "development-only-oauth-state-secret";
}

function sign(value) {
  return crypto.createHmac("sha256", stateSecret()).update(value).digest("base64url");
}

export function getPublicAppOrigin(request) {
  const configuredOrigin = (() => {
    try {
      return process.env.PUBLIC_APP_URL ? new URL(process.env.PUBLIC_APP_URL).origin : null;
    } catch {
      return null;
    }
  })();
  const knownOrigins = [
    'https://www.supdance.com',
    'https://supdance.com',
    'https://canvas.supdance.com',
  ];
  const allowedOrigins = new Set(
    [configuredOrigin, ...knownOrigins, ...(process.env.OAUTH_ALLOWED_ORIGINS || '').split(',')]
      .map((value) => {
        try {
          const origin = new URL(String(value || '').trim());
          if (!['http:', 'https:'].includes(origin.protocol)) return null;
          if (origin.protocol === 'http:' && !['localhost', '127.0.0.1'].includes(origin.hostname)) return null;
          return origin.origin;
        } catch {
          return null;
        }
      })
      .filter(Boolean)
  );
  const forwardedHost = request?.headers?.get?.("x-forwarded-host") || request?.headers?.get?.("host");
  const forwardedProto = request?.headers?.get?.("x-forwarded-proto") || "https";
  if (forwardedHost) {
    try {
      const host = forwardedHost.split(',')[0].trim();
      const proto = forwardedProto.split(',')[0].trim();
      const requestOrigin = new URL(`${proto}://${host}`).origin;
      if (allowedOrigins.has(requestOrigin)) return requestOrigin;
    } catch {
      // Ignore malformed or untrusted forwarded host headers.
    }
  }
  return configuredOrigin || "https://www.supdance.com";
}

export function createOAuthState({ provider, verifier, returnTo, redirectUri, mode = "login", bindUserId = null, returnOrigin = null }) {
  const payload = Buffer.from(JSON.stringify({
    provider,
    verifier,
    returnTo,
    redirectUri,
    mode,
    bindUserId,
    returnOrigin,
    nonce: crypto.randomBytes(12).toString("hex"),
  })).toString("base64url");
  return `${payload}.${sign(payload)}`;
}

export function readOAuthState(value) {
  try {
    const [payload, signature] = String(value || "").split(".");
    if (!payload || !signature) return null;
    const expectedSig = sign(payload);
    const bufA = Buffer.from(signature);
    const bufB = Buffer.from(expectedSig);
    if (bufA.length !== bufB.length || !crypto.timingSafeEqual(bufA, bufB)) return null;
    return JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
  } catch {
    return null;
  }
}

export function createPkceVerifier() {
  return crypto.randomBytes(48).toString("base64url");
}

export function createPkceChallenge(verifier) {
  return crypto.createHash("sha256").update(verifier).digest("base64url");
}

export function getRedirectUri(request, provider) {
  if (provider === "google") {
    if (process.env.GOOGLE_REDIRECT_URI) {
      return process.env.GOOGLE_REDIRECT_URI.trim();
    }
    const originClean = getPublicAppOrigin(request);
    // Google Cloud Console 严格校验重定向 URI，生产及全站子域名统一对齐至已授权的权威回调地址
    if (!originClean || originClean.includes('supdance.com') || (!originClean.includes('localhost') && !originClean.includes('127.0.0.1'))) {
      return 'https://www.supdance.com/api/auth/oauth/google/callback';
    }
    return `${originClean}/api/auth/oauth/google/callback`;
  }
  const originClean = getPublicAppOrigin(request);
  if (provider === "tiktok") {
    // Matches the registered redirect URI in TikTok Developer Portal
    return `${originClean}/auth/tiktok/callback`;
  }
  return `${originClean}/api/auth/oauth/${provider}/callback`;
}

function readClientId(config) {
  return config?.resolvedClientId
    || (typeof config?.clientId === "function" ? config.clientId() : config?.clientId);
}

function readClientSecret(config) {
  return config?.resolvedClientSecret
    || (typeof config?.clientSecret === "function" ? config.clientSecret() : config?.clientSecret);
}

export async function buildAuthorizationUrl(provider, redirectUri, state, verifier, customConfig = null) {
  const config = customConfig || (await getResolvedOAuthConfig(provider)) || getOAuthProvider(provider);
  const clientId = readClientId(config);
  if (!config || !clientId) throw new Error(`${provider} OAuth is not configured`);
  const url = new URL(config.authorizeUrl);
  url.searchParams.set(config.clientIdParam || "client_id", clientId);
  if (provider === 'bilibili') {
    // 哔哩哔哩开放平台要求 gourl 与配置的回调地址完全一致
    url.searchParams.set('gourl', redirectUri);
  }
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("response_type", "code");
  if (config.scopes?.length) url.searchParams.set("scope", config.scopes.join(" "));
  if (config.authExtraParams) {
    for (const [k, v] of Object.entries(config.authExtraParams)) {
      url.searchParams.set(k, v);
    }
  }
  url.searchParams.set("state", state);
  if (config.pkce && verifier) {
    url.searchParams.set("code_challenge", createPkceChallenge(verifier));
    url.searchParams.set("code_challenge_method", "S256");
  }
  const built = url.toString();
  return config.authorizeFragment ? `${built}${config.authorizeFragment}` : built;
}

/** QQ Connect 的 token 端点返回 form-encoded 文本而非 JSON。 */
function parseTokenBody(text, label) {
  try {
    return JSON.parse(text);
  } catch {
    const form = new URLSearchParams(text);
    if (form.get("access_token")) return Object.fromEntries(form.entries());
    throw new Error(`${label} 返回了无法解析的响应: ${String(text).slice(0, 160)}`);
  }
}

/** 微信/QQ/抖音在 HTTP 200 下用 errcode / ret / error_description 表达失败。 */
function assertProviderTokenPayload(data, label) {
  if (!data || typeof data !== "object") throw new Error(`${label} 返回空响应`);
  const errcode = data.errcode ?? data.error ?? data.data?.err_no ?? data.data?.error_info?.error_code;
  const errmsg = data.errmsg ?? data.error_description ?? data.error ?? data.data?.err_msg
    ?? data.data?.error_description ?? data.data?.error_info?.description;
  const token = data.access_token || data.data?.access_token;
  if (!token && errcode !== undefined && errcode !== 0 && errcode !== '0') {
    throw new Error(`${label} 失败: ${errmsg || errcode}`);
  }
  if (!token) throw new Error(`${label} 未返回 access_token: ${String(errmsg || '未知原因')}`);
  return data;
}

async function parseResponse(response, label) {
  const text = await response.text();
  let data = null;
  try {
    data = JSON.parse(text);
  } catch {}
  if (!response.ok) {
    const errorMsg = data?.error_description || data?.error?.message || data?.error || data?.detail
      || data?.errmsg || data?.message || text || response.statusText;
    throw new Error(`${label} 失败 (${response.status}): ${typeof errorMsg === 'object' ? JSON.stringify(errorMsg) : errorMsg}`);
  }
  if (data?.error && typeof data.error === 'object' && data.error.code && data.error.code !== 'ok' && data.error.code !== 0) {
    throw new Error(`${label} 接口错误: ${data.error.message || data.error.code}`);
  }
  return data;
}

export async function exchangeOAuthCode(provider, code, redirectUri, verifier, customConfig = null) {
  const config = customConfig || (await getResolvedOAuthConfig(provider)) || getOAuthProvider(provider);
  const clientId = readClientId(config);
  const clientSecret = readClientSecret(config);
  if (!config || !clientId || !clientSecret) throw new Error(`${provider} OAuth is not configured`);
  const label = `${provider} token exchange`;
  const idParam = config.clientIdParam || "client_id";
  const secretParam = config.secretParam || "client_secret";
  let data;

  if (config.tokenTransport === 'bilibili-query-post') {
    const url = new URL(config.tokenUrl);
    url.searchParams.set('client_id', clientId);
    url.searchParams.set('client_secret', clientSecret);
    url.searchParams.set('grant_type', 'authorization_code');
    url.searchParams.set('code', code);
    data = await parseResponse(await fetch(url, { method: 'POST' }), label);
  } else if (config.tokenTransport === "get-query") {
    const url = new URL(config.tokenUrl);
    url.searchParams.set(idParam, clientId);
    url.searchParams.set(secretParam, clientSecret);
    url.searchParams.set("code", code);
    url.searchParams.set("grant_type", "authorization_code");
    data = await parseResponse(await fetch(url, { method: "GET" }), label);
  } else if (config.tokenTransport === "json") {
    data = await parseResponse(await fetch(config.tokenUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        [idParam]: clientId,
        [secretParam]: clientSecret,
        code,
        grant_type: "authorization_code",
      }),
    }), label);
  } else {
    const form = new URLSearchParams({
      code,
      grant_type: "authorization_code",
      redirect_uri: redirectUri,
      [idParam]: clientId,
      [secretParam]: clientSecret,
    });
    for (const [k, v] of Object.entries(config.tokenExtraParams || {})) form.set(k, v);
    if (config.pkce && verifier) form.set("code_verifier", verifier);

    const headers = { "Content-Type": "application/x-www-form-urlencoded" };
    if (config.tokenBasicAuth) {
      headers.Authorization = `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString("base64")}`;
      form.delete(idParam);
      form.delete(secretParam);
    }
    const response = await fetch(config.tokenUrl, { method: "POST", headers, body: form });
    data = parseTokenBody(await response.text(), label);
    if (!response.ok) throw new Error(`${label} 失败 (${response.status}): ${data.error_description || data.error || data.errmsg || response.statusText}`);
  }

  assertProviderTokenPayload(data, label);
  const accessToken = data.access_token || data.data?.access_token;
  return {
    ...data,
    access_token: accessToken,
    openid: data.openid || data.data?.openid || null,
    open_id: data.open_id || data.data?.open_id || null,
    user_id: data.user_id || data.data?.user_id || null,
  };
}

/** 兼容 JSONP 包裹：callback( {...} ); */
function unwrapJsonp(text) {
  const matched = String(text || "").match(/\{[\s\S]*\}/);
  if (!matched) throw new Error("QQ 返回了无法解析的 openid 响应");
  return JSON.parse(matched[0]);
}

async function fetchQqOpenId(accessToken) {
  const url = `${PROVIDERS.qq.openIdUrl}?access_token=${encodeURIComponent(accessToken)}&fmt=json`;
  const response = await fetch(url, {
    headers: { "User-Agent": "supdance-oauth" },
  });
  if (!response.ok) throw new Error(`QQ openid 请求失败 (${response.status})`);
  const text = await response.text();
  const data = unwrapJsonp(text);
  if (data.error) {
    throw new Error(`QQ openid 获取失败 (${data.error}): ${data.error_description || data.msg || '未知错误'}`);
  }
  return data.openid;
}

export async function fetchOAuthProfile(provider, accessToken, context = null) {
  if (!accessToken) throw new Error(`${provider} 授权凭据 accessToken 为空`);
  const config = (await getResolvedOAuthConfig(provider)) || getOAuthProvider(provider);
  if (!config) throw new Error(`不支持的登录方式: ${provider}`);
  const label = `${provider} profile request`;

  if (config.profileTransport === 'bilibili-signed') {
    const resolved = await getResolvedOAuthConfig('bilibili');
    const clientId = resolved?.resolvedClientId;
    const clientSecret = resolved?.resolvedClientSecret;
    if (!clientId || !clientSecret) throw new Error('bilibili OAuth is not configured');
    const timestamp = String(Math.floor(Date.now() / 1000));
    const nonce = crypto.randomUUID();
    const signedHeaders = {
      'x-bili-accesskeyid': clientId,
      'x-bili-content-md5': crypto.createHash('md5').update('').digest('hex'),
      'x-bili-signature-method': 'HMAC-SHA256',
      'x-bili-signature-nonce': nonce,
      'x-bili-signature-version': '2.0',
      'x-bili-timestamp': timestamp,
    };
    const canonical = Object.keys(signedHeaders).sort().map((key) => `${key}:${signedHeaders[key]}`).join('\n');
    const authorization = crypto.createHmac('sha256', clientSecret).update(canonical).digest('hex');
    const response = await fetch(config.userInfoUrl, {
      method: 'GET',
      headers: { Accept: 'application/json', 'Content-Type': 'application/json', Authorization: authorization, 'access-token': accessToken, ...signedHeaders },
      signal: AbortSignal.timeout(8000),
    });
    const data = await parseResponse(response, label);
    if (data?.code !== 0) throw new Error(`哔哩哔哩用户信息获取失败: ${data?.message || data?.code || '未知错误'}`);
    const profile = data.data || {};
    if (!profile.openid) throw new Error('哔哩哔哩未返回 openid，请确认应用已获批 USER_INFO 权限');
    return { id: profile.openid, email: null, emailVerified: false, username: profile.name || null, displayName: profile.name || null, avatarUrl: profile.face || null };
  }

  if (config.profileTransport === "qq-jsonp") {
    const openId = context?.openid || await fetchQqOpenId(accessToken);
    if (!openId) throw new Error("QQ 未返回 openid");
    const consumerKey = readClientId(config) || (typeof config.clientId === "function" ? config.clientId() : config.clientId);
    if (!consumerKey) throw new Error("QQ Client ID / App ID 尚未配置");
    const url = new URL(config.userInfoUrl);
    url.searchParams.set("access_token", accessToken);
    url.searchParams.set("oauth_consumer_key", consumerKey);
    url.searchParams.set("openid", openId);
    const data = await parseResponse(await fetch(url, { headers: { "User-Agent": "supdance-oauth" } }), label);
    if (data.ret !== undefined && data.ret !== 0) throw new Error(`QQ 用户信息获取失败: ${data.msg || data.ret}`);
    return {
      id: openId,
      email: null,
      emailVerified: false,
      username: data.nickname || null,
      displayName: data.nickname || null,
      avatarUrl: (data.figureurl_qq_2 || data.figureurl_qq_1 || data.figureurl)
        ? String(data.figureurl_qq_2 || data.figureurl_qq_1 || data.figureurl).replace(/^http:\/\//i, 'https://')
        : null,
    };
  }

  if (config.profileTransport === "wechat-query") {
    const openId = context?.openid;
    if (!openId) throw new Error("微信授权响应缺少 openid，请重新扫码登录");
    const url = new URL(config.userInfoUrl);
    url.searchParams.set("access_token", accessToken);
    url.searchParams.set("openid", openId);
    url.searchParams.set("lang", "zh_CN");
    const data = await parseResponse(await fetch(url), label);
    if (data.errcode) throw new Error(`微信用户信息获取失败: ${data.errmsg || data.errcode}`);
    return {
      id: data.unionid || data.openid || openId,
      email: null,
      emailVerified: false,
      username: data.nickname || null,
      displayName: data.nickname || null,
      avatarUrl: data.headimgurl ? String(data.headimgurl).replace(/^http:\/\//i, 'https://') : null,
    };
  }

  if (config.profileTransport === "douyin-query" || config.profileTransport === "douyin-post") {
    const openId = context?.open_id || context?.openid;
    if (!openId) throw new Error("抖音授权响应未返回 open_id");

    // 抖音 OpenAPI 规范：POST /oauth/userinfo/ 携带 access_token 与 open_id
    let response = await fetch(config.userInfoUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "access-token": accessToken,
      },
      body: JSON.stringify({
        access_token: accessToken,
        open_id: openId,
      }),
    });

    if (!response.ok) {
      const form = new URLSearchParams({
        access_token: accessToken,
        open_id: openId,
      });
      response = await fetch(config.userInfoUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          "access-token": accessToken,
        },
        body: form,
      });
    }

    try {
      const data = await parseResponse(response, label);
      if (data.error_info?.error_code || (data.data?.error_code && data.data.error_code !== 0)) {
        throw new Error(`抖音用户信息获取失败: ${data.error_info?.description || data.data?.description || data.data?.error_code}`);
      }
      const profile = data.data || data;
      const identity = profile.union_id || profile.open_id || openId;
      if (!identity) throw new Error("抖音未返回用户标识");
      return {
        id: identity,
        email: profile.email || null,
        emailVerified: false,
        username: profile.nickname || null,
        displayName: profile.nickname || '抖音用户',
        avatarUrl: profile.avatar || profile.avatar_url || null,
      };
    } catch (err) {
      console.warn(`[oauth/douyin] 获取扩展用户信息失败，使用已校验 open_id 进行基础登录:`, err.message);
      return {
        id: openId,
        email: null,
        emailVerified: false,
        username: null,
        displayName: '抖音用户',
        avatarUrl: null,
      };
    }
  }

  if (provider === "instagram" || config.profileTransport === "instagram") {
    let instaData = null;
    try {
      const instaUrl = new URL(config.userInfoUrl);
      instaUrl.searchParams.set('access_token', accessToken);
      const res = await fetch(instaUrl, {
        headers: { Authorization: `Bearer ${accessToken}`, Accept: 'application/json' },
        signal: AbortSignal.timeout(8000),
      });
      instaData = await parseResponse(res, label);
    } catch (err) {
      console.warn('[oauth/instagram] 读取用户资料失败，回退基础 context 标识:', err.message);
    }
    const identity = String(instaData?.id || context?.user_id || context?.open_id || "");
    if (!identity) throw new Error('Instagram 授权未返回有效用户标识');
    return {
      id: identity,
      email: instaData?.email || null,
      emailVerified: false,
      username: instaData?.username || null,
      displayName: instaData?.username || 'Instagram 用户',
      avatarUrl: instaData?.profile_picture_url || instaData?.profile_picture || null,
    };
  }

  if (provider === "google") {
    let data = null;
    try {
      const res = await fetch(config.userInfoUrl, {
        headers: { Authorization: `Bearer ${accessToken}` },
        signal: AbortSignal.timeout(8000),
      });
      data = await parseResponse(res, label);
    } catch (err) {
      console.warn('[oauth/google] 请求 userinfo 失败，尝试通过 id_token 解码用户凭据:', err.message);
      if (context?.id_token) {
        try {
          const parts = String(context.id_token).split('.');
          if (parts.length >= 2) {
            data = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
          }
        } catch {}
      }
      if (!data) throw err;
    }

    const sub = data?.sub || data?.id;
    if (!sub) throw new Error("Google 未返回用户唯一标识");

    return {
      id: String(sub),
      email: data.email || null,
      emailVerified: data.email_verified === true,
      username: null,
      displayName: data.name || data.given_name || (data.email ? data.email.split('@')[0] : 'Google 用户'),
      avatarUrl: data.picture || null,
    };
  }

  const data = await parseResponse(await fetch(config.userInfoUrl, {
    headers: { Authorization: `Bearer ${accessToken}` },
  }), label);
  if (provider === "x") return {
    id: data.data?.id,
    email: data.data?.email || null,
    emailVerified: false,
    username: data.data?.username || null,
    displayName: data.data?.name || data.data?.username,
    avatarUrl: data.data?.profile_image_url || null,
  };
  return {
    id: data.data?.user?.open_id || data.data?.user?.union_id || data.open_id || data.union_id,
    email: data.data?.user?.email || data.email || null,
    emailVerified: false,
    username: data.data?.user?.username || data.data?.user?.handle || data.username || null,
    displayName: data.data?.user?.display_name || data.display_name,
    avatarUrl: data.data?.user?.avatar_url || data.avatar_url || null,
  };
}
