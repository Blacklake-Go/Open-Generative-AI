import "server-only";

import crypto from "node:crypto";
import { NextResponse } from "next/server";
import { bindUserOAuth, createOAuthUser, createSession, getSessionCookieDomain, getUserBySession, setSessionCookie } from "./auth.js";
import { normalizeLocale } from "../locales.js";
import {
  exchangeOAuthCode,
  fetchOAuthProfile,
  getOAuthProvider,
  getPublicAppOrigin,
  getRedirectUri,
  readOAuthState,
} from "../oauth.js";

function clearOAuthCookie(response, request) {
  const domain = getSessionCookieDomain(request);
  response.cookies.set("ko_oauth_state", "", { httpOnly: true, path: "/", maxAge: 0, ...(domain ? { domain } : {}) });
  if (domain) {
    response.cookies.set("ko_oauth_state", "", { httpOnly: true, path: "/", maxAge: 0 });
  }
}

export function htmlResponse(request, { ok, returnTo, message, action = "login", provider = null, isNew = false, user = null, returnOrigin = null }) {
  const requestOrigin = getPublicAppOrigin(request);
  const origin = returnOrigin || requestOrigin;
  const safePath = returnTo?.startsWith("/") && !returnTo.startsWith("//") ? returnTo : "/studio";
  const eventId = `${Date.now()}_${crypto.randomBytes(6).toString("hex")}`;
  const payload = JSON.stringify({
    type: "supdance-auth-complete",
    eventId,
    ok,
    message: message || null,
    action,
    provider,
    isNew: Boolean(isNew),
    user: user ? {
      id: user.id,
      email: user.email || null,
      phone: user.phone || null,
      displayName: user.displayName || user.display_name || null,
      avatarUrl: user.avatarUrl || user.avatar_url || null,
      role: user.role || 'user',
      status: user.status || 'active',
      hasPassword: Boolean(user.hasPassword ?? user.has_password),
      onboardingCompleted: user.onboardingCompleted ?? user.onboarding_completed ?? true,
    } : null,
  });
  const urlDelim = safePath.includes("?") ? "&" : "?";
  const target = JSON.stringify(
    `${origin}${safePath}${urlDelim}auth=${ok ? "success" : "error"}${isNew ? "&isNew=1" : ""}&provider=${encodeURIComponent(provider || "")}${action ? `&action=${encodeURIComponent(action)}` : ""}${message && !ok ? `&auth_error=${encodeURIComponent(message)}` : ""}`
  );
  const html = `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>SupDance - 快捷授权</title>
  <style>
    body {
      background: #090a0f;
      color: #f3f4f6;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      display: flex;
      align-items: center;
      justify-content: center;
      min-height: 100vh;
      margin: 0;
      padding: 24px;
      box-sizing: border-box;
    }
    .card {
      background: rgba(22, 24, 34, 0.95);
      border: 1px solid rgba(255, 255, 255, 0.08);
      border-radius: 16px;
      padding: 32px 28px;
      max-width: 400px;
      width: 100%;
      text-align: center;
      box-shadow: 0 20px 40px rgba(0, 0, 0, 0.6);
    }
    .icon {
      font-size: 36px;
      margin-bottom: 16px;
    }
    h2 {
      font-size: 18px;
      font-weight: 600;
      margin: 0 0 8px;
      color: #fff;
    }
    p {
      font-size: 13px;
      color: #9ca3af;
      line-height: 1.5;
      margin: 0 0 20px;
    }
    .btn {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      background: #ff5722;
      color: #fff;
      font-weight: 600;
      font-size: 14px;
      border: none;
      border-radius: 9999px;
      padding: 10px 24px;
      cursor: pointer;
      text-decoration: none;
      transition: background 0.15s;
    }
    .btn:hover {
      background: #f4511e;
    }
  </style>
</head>
<body>
  <div class="card">
    <div class="icon">${ok ? '✅' : '⚠️'}</div>
    <h2>${ok ? '授权完成' : '授权未完成'}</h2>
    <p id="desc">${ok ? '正在返回 SupDance AI Studio…' : (message ? String(message).replace(/</g, '&lt;').replace(/>/g, '&gt;') : '快捷登录未能完成，请重试')}</p>
    <button id="actionBtn" class="btn" onclick="handleDone()">${ok ? '关闭窗口' : '返回重试'}</button>
  </div>
  <script>
    const message = ${payload};
    const targetUrl = ${target};
    const isPopup = Boolean(
      (window.name && (window.name === 'supdance-oauth' || window.name.includes('oauth'))) ||
      (window.opener && window.opener !== window) ||
      (typeof window !== 'undefined' && window.menubar && !window.menubar.visible && window.innerWidth <= 600)
    );

    // 1. BroadcastChannel 跨窗口通知（现代浏览器最稳固的跨 Tab/Popup 通道，不受 COOP 影响）
    try {
      if (typeof BroadcastChannel !== 'undefined') {
        const bc = new BroadcastChannel('supdance_auth_channel');
        bc.postMessage(message);
        const bcKoyo = new BroadcastChannel('koyosim_auth_channel');
        bcKoyo.postMessage({ ...message, type: 'koyosim-auth-complete' });
        setTimeout(() => {
          try { bc.close(); } catch(e) {}
          try { bcKoyo.close(); } catch(e) {}
        }, 1000);
      }
    } catch (e) {}

    // 2. localStorage StorageEvent 通告（兼容所有标签页监听）
    try {
      const serialized = JSON.stringify({
        ...message,
        _time: Date.now()
      });
      localStorage.setItem('supdance_auth_event', serialized);
      localStorage.setItem('supdance-oauth-sync', serialized);
      localStorage.setItem('koyosim_auth_event', serialized);
      localStorage.setItem('koyosim-oauth-sync', serialized);
    } catch (e) {}

    // 3. window.opener.postMessage 降级兼容
    if (window.opener && window.opener !== window) {
      try { window.opener.postMessage(message, ${JSON.stringify(origin)}); } catch(e) {}
      try { window.opener.postMessage({ ...message, type: 'koyosim-auth-complete' }, ${JSON.stringify(origin)}); } catch(e) {}
      try { window.opener.postMessage(message, '*'); } catch(e) {}
      try { window.opener.postMessage({ ...message, type: 'koyosim-auth-complete' }, '*'); } catch(e) {}
    }

    function handleDone() {
      if (isPopup) {
        window.close();
      } else {
        window.location.replace(targetUrl);
      }
    }

    if (isPopup) {
      // 弹窗模式：延迟后尝试自动关闭
      setTimeout(() => {
        try { window.close(); } catch(e) {}
      }, 350);
      setTimeout(() => {
        const desc = document.getElementById('desc');
        if (desc && ${Boolean(ok)}) {
          desc.innerText = '授权已生效。如果此窗口未自动关闭，请点击下方按钮关闭。';
        }
      }, 1500);
    } else {
      // 全页跳转模式：直接原地 replace 目标 URL
      window.location.replace(targetUrl);
    }
  </script>
</body>
</html>`;
  return new NextResponse(html, { headers: { "Content-Type": "text/html; charset=utf-8" } });
}

export async function handleOAuthCallback(request, providerParam) {
  const cookieStateRaw = request.cookies.get("ko_oauth_state")?.value;
  const queryStateRaw = request.nextUrl.searchParams.get("state");
  // 优先使用 query 中的 signed HMAC state，若不存在则降级为 cookie
  const stateRaw = queryStateRaw || cookieStateRaw;
  const state = readOAuthState(stateRaw);
  const provider = String(providerParam || state?.provider || "").toLowerCase();
  const returnTo = state?.returnTo || "/studio";
  const returnOrigin = state?.returnOrigin || null;
  const mode = state?.mode || "login";

  try {
    if (!state || (provider && state.provider && state.provider !== provider) || !getOAuthProvider(state.provider || provider)) {
      throw new Error("OAuth 授权状态已失效或已过期，请重新点击登录");
    }
    const targetProvider = state.provider || provider;
    const error = request.nextUrl.searchParams.get("error");
    if (error) throw new Error(request.nextUrl.searchParams.get("error_description") || error);
    const rawCode = request.nextUrl.searchParams.get("code");
    if (!rawCode) throw new Error("OAuth 未返回有效授权码");
    const code = String(rawCode).replace(/#.*$/, '').trim();

    const redirectUri = state?.redirectUri || getRedirectUri(request, targetProvider);
    const token = await exchangeOAuthCode(targetProvider, code, redirectUri, state.verifier);
    const accessToken = token.access_token || token.data?.access_token;
    if (!accessToken) throw new Error(`${targetProvider} 未返回 access_token 访问令牌`);
    // 微信/抖音的用户信息接口要求 openid/open_id，只能来自上一步 token 响应。
    const profile = await fetchOAuthProfile(targetProvider, accessToken, token);
    if (!profile.id) throw new Error("OAuth 未返回用户标识");

    const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || request.headers.get("x-real-ip") || null;

    // 绑定模式 (来自个人中心绑定/换绑发起)
    if (mode === "bind" && state.bindUserId) {
      const bindResult = await bindUserOAuth({
        userId: state.bindUserId,
        provider: targetProvider,
        providerUserId: profile.id,
        providerEmail: profile.email,
        providerUsername: profile.username,
        displayName: profile.displayName,
        profile,
        ip,
      });

      if (bindResult?.error) {
        const response = htmlResponse(request, {
          ok: false,
          returnTo,
          returnOrigin,
          message: bindResult.message || "第三方账号绑定失败",
          action: "bind",
          provider: targetProvider,
        });
        clearOAuthCookie(response, request);
        return response;
      }

      // 绑定成功：保留当前用户 Session，绝对不覆盖 Session Cookie
      const response = htmlResponse(request, {
        ok: true,
        returnTo,
        returnOrigin,
        message: bindResult.message || `${targetProvider} 快捷登录绑定成功`,
        action: "bind",
        provider: targetProvider,
      });
      clearOAuthCookie(response, request);
      return response;
    }

    // 登录/注册模式
    const user = await createOAuthUser({
      provider: targetProvider,
      providerUserId: profile.id,
      email: profile.email,
      emailVerified: profile.emailVerified === true,
      providerUsername: profile.username,
      displayName: profile.displayName,
      avatarUrl: profile.avatarUrl || profile.avatar,
      profile,
      ip,
    });
    if (user?.error) throw new Error(user.message || "账户已被封禁或异常");

    const session = await createSession(user.id);
    const sessionUser = await getUserBySession(session.token);
    const isNewUser = Boolean(user.isNew);
    const response = htmlResponse(request, {
      ok: true,
      returnTo,
      returnOrigin,
      action: "login",
      provider: targetProvider,
      isNew: isNewUser,
      user: sessionUser || user,
    });
    setSessionCookie(response, session.token, session.expires, request);
    const resolvedLocale = (sessionUser && sessionUser.locale) || user.locale;
    if (resolvedLocale) {
      const normLocale = normalizeLocale(resolvedLocale);
      const domain = getSessionCookieDomain(request);
      response.cookies.set("NEXT_LOCALE", normLocale, { path: "/", maxAge: 31536000, sameSite: "lax", ...(domain ? { domain } : {}) });
      response.cookies.set("locale", normLocale, { path: "/", maxAge: 31536000, sameSite: "lax", ...(domain ? { domain } : {}) });
    }
    clearOAuthCookie(response, request);
    return response;
  } catch (error) {
    console.error(`[auth/oauth/${provider}]`, { code: error.code || "OAUTH_CALLBACK_FAILED", message: error.message });
    const response = htmlResponse(request, {
      ok: false,
      returnTo,
      returnOrigin,
      message: error.message || "第三方登录失败，请重试",
      action: mode,
      provider,
    });
    clearOAuthCookie(response, request);
    return response;
  }
}
