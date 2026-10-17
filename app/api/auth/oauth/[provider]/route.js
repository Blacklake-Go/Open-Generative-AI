import { NextResponse } from "next/server";
import {
  buildAuthorizationUrl,
  createOAuthState,
  createPkceVerifier,
  getOAuthProvider,
  getPublicAppOrigin,
  getRedirectUri,
  getResolvedOAuthConfig,
} from "@/lib/oauth";
import { getSessionCookieDomain, getUserFromRequest } from "@/lib/services/auth.js";

export const runtime = "nodejs";

function safeReturnTo(value) {
  let candidate = String(value || "/studio");
  if (!candidate.startsWith("/") || candidate.startsWith("//")) {
    candidate = "/studio";
  }
  const purePath = candidate.split('?')[0].replace(/\/+$/, '');
  const authPageRegex = /^(?:\/(zh|zh-CN|zh-TW|ja|ja-JP|ko|ko-KR|es))?\/(?:login|register|forgot-password|reset-password)$/;
  const match = purePath.match(authPageRegex);
  if (match) {
    const prefix = match[1] ? `/${match[1]}` : '';
    return prefix ? `${prefix}/studio` : '/studio';
  }
  return candidate;
}

export async function GET(request, { params }) {
  const provider = String((await params).provider || "").toLowerCase();
  const origin = getPublicAppOrigin(request);
  const returnTo = safeReturnTo(
    request.nextUrl.searchParams.get("returnTo") ||
    request.nextUrl.searchParams.get("redirect")
  );
  const actionParam = request.nextUrl.searchParams.get("action");
  const isBind = actionParam === "bind";

  if (!getOAuthProvider(provider)) {
    const delim = returnTo.includes("?") ? "&" : "?";
    return NextResponse.redirect(new URL(`${returnTo}${delim}auth_error=${encodeURIComponent("不支持的登录方式")}`, origin));
  }

  // 若为绑定模式，必须要求已登录态
  const sessionUser = await getUserFromRequest(request);
  if (isBind && !sessionUser) {
    const delim = returnTo.includes("?") ? "&" : "?";
    return NextResponse.redirect(new URL(`${returnTo}${delim}auth_error=${encodeURIComponent("请先登录账户后再进行绑定")}`, origin));
  }

  const resolved = await getResolvedOAuthConfig(provider);
  if (!resolved || !resolved.configured) {
    const providerNames = { google: "Google", x: "X (Twitter)", tiktok: "TikTok", instagram: "Instagram", wechat: "微信", qq: "QQ", douyin: "抖音", bilibili: "哔哩哔哩" };
    const name = providerNames[provider] || provider;
    const msg = `${name} 快捷登录尚未在管理后台配置 Client ID / Secret`;
    const html = `<!doctype html><html><head><meta charset="utf-8"><title>${name} 登录提示</title>
      <style>body{background:#0a0a0c;color:#fff;font-family:-apple-system,BlinkMacSystemFont,sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;padding:20px;box-sizing:border-box;}
      .card{background:#18181b;border:1px solid rgba(255,255,255,0.1);border-radius:16px;padding:28px;max-width:380px;text-align:center;box-shadow:0 20px 40px rgba(0,0,0,0.5);}
      h2{font-size:18px;margin:0 0 10px;color:#e11d74;} p{font-size:13px;color:#a1a1aa;line-height:1.6;margin:0 0 20px;}
      .btn{background:#e11d74;color:#fff;font-weight:bold;border:none;border-radius:8px;padding:10px 20px;cursor:pointer;font-size:13px;text-decoration:none;display:inline-block;}</style>
      </head><body><div class="card"><h2>${name} 登录尚未配置</h2><p>${msg}。请在管理运营后台「模型与集成 -> 社交登录渠道」中配置相应密钥凭据，或使用手机号/邮箱直接登录体验。</p><button class="btn" onclick="closeOrBack()">确定并返回</button></div>
      <script>
        const message = { type: "supdance-auth-complete", ok: false, message: ${JSON.stringify(msg)} };
        const isPopup = Boolean(
          (window.name && (window.name === 'supdance-oauth' || window.name.includes('oauth'))) ||
          (window.opener && window.opener !== window) ||
          (typeof window !== 'undefined' && window.menubar && !window.menubar.visible && window.innerWidth <= 600)
        );

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
        } catch(e) {}

        try {
          const serialized = JSON.stringify({ ...message, _time: Date.now() });
          localStorage.setItem('supdance_auth_event', serialized);
          localStorage.setItem('koyosim_auth_event', serialized);
          localStorage.setItem('supdance-oauth-sync', serialized);
          localStorage.setItem('koyosim-oauth-sync', serialized);
        } catch(e) {}

        if (window.opener && window.opener !== window) {
          try { window.opener.postMessage(message, ${JSON.stringify(origin)}); } catch(e) {}
          try { window.opener.postMessage({ ...message, type: 'koyosim-auth-complete' }, ${JSON.stringify(origin)}); } catch(e) {}
          try { window.opener.postMessage(message, "*"); } catch(e) {}
          try { window.opener.postMessage({ ...message, type: 'koyosim-auth-complete' }, "*"); } catch(e) {}
        }

        function closeOrBack() {
          if (isPopup) {
            window.close();
          } else {
            const dest = ${JSON.stringify(returnTo)};
            const delim = dest.includes("?") ? "&" : "?";
            window.location.href = dest + delim + "auth_error=" + encodeURIComponent(${JSON.stringify(msg)});
          }
        }
      </script></body></html>`;
    return new NextResponse(html, { headers: { "Content-Type": "text/html; charset=utf-8" } });
  }

  const redirectUri = getRedirectUri(request, provider);
  const verifier = createPkceVerifier();
  const state = createOAuthState({
    provider,
    verifier,
    returnTo,
    redirectUri,
    returnOrigin: origin,
    mode: isBind ? "bind" : "login",
    bindUserId: isBind ? sessionUser.id : null,
  });
  const authUrl = await buildAuthorizationUrl(provider, redirectUri, state, verifier, resolved);
  const response = NextResponse.redirect(authUrl);
  const cookieDomain = getSessionCookieDomain(request);
  response.cookies.set("ko_oauth_state", state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 600,
    ...(cookieDomain ? { domain: cookieDomain } : {}),
  });
  return response;
}
