import { NextResponse } from 'next/server';
import {
  getGoogleOneTapConfig,
  isOverseasRequest,
  verifyGoogleIdToken,
} from '@/lib/auth/googleOneTap';
import {
  createOAuthUser,
  createSession,
  getSessionCookieDomain,
  getUserBySession,
  setSessionCookie,
} from '@/lib/services/auth';
import { DEFAULT_LOCALE, normalizeLocale } from '@/lib/locales';
import { consumeRateLimit, guardMutation, rateLimitResponse } from '@/lib/security/requestGuard';
import { resolveClientIp } from '@/lib/security/chinaIpBlock';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const NO_STORE_HEADERS = {
  'Cache-Control': 'private, no-store, max-age=0',
  Vary: 'x-real-ip, cf-connecting-ip, x-forwarded-for, true-client-ip, x-vercel-forwarded-for, cf-ipcountry, x-vercel-ip-country',
};

export async function GET(request) {
  try {
    const config = await getGoogleOneTapConfig(request.headers);
    return NextResponse.json(config, { headers: NO_STORE_HEADERS });
  } catch (error) {
    console.error('[auth/google/one-tap] config', error);
    return NextResponse.json({ enabled: false }, { headers: NO_STORE_HEADERS });
  }
}

export async function POST(request) {
  const guarded = guardMutation(request, { maxBytes: 16 * 1024 });
  if (guarded) return guarded;

  try {
    if (!isOverseasRequest(request.headers)) {
      return NextResponse.json({ ok: false, message: '当前地区不支持该登录方式' }, { status: 403 });
    }

    const ip = resolveClientIp(request.headers).ip;
    const limit = await consumeRateLimit({
      scope: 'auth_google_one_tap_ip',
      subject: ip,
      limit: 30,
      windowMs: 15 * 60 * 1000,
    });
    if (!limit.allowed) return rateLimitResponse(limit);

    const config = await getGoogleOneTapConfig(request.headers);
    if (!config.enabled) {
      return NextResponse.json({ ok: false, message: '该登录方式暂不可用' }, { status: 403 });
    }

    const body = await request.json().catch(() => null);
    let payload;
    try {
      payload = await verifyGoogleIdToken(body?.credential, config.clientId);
    } catch (error) {
      console.warn('[auth/google/one-tap] credential rejected:', error.message);
      return NextResponse.json({ ok: false, message: 'Google 登录凭证无效，请重试' }, { status: 401 });
    }

    const email = typeof payload.email === 'string' ? payload.email : null;
    if (!email) {
      return NextResponse.json({ ok: false, message: 'Google 账号未提供邮箱' }, { status: 400 });
    }

    const user = await createOAuthUser({
      provider: 'google',
      providerUserId: payload.sub,
      email,
      emailVerified: payload.email_verified === true,
      displayName: payload.name || payload.given_name || email.split('@')[0],
      avatarUrl: payload.picture || null,
      profile: payload,
      ip,
    });
    if (user?.error) {
      return NextResponse.json({ ok: false, message: user.message || '登录失败' }, { status: 403 });
    }

    const session = await createSession(user.id);
    const sessionUser = await getUserBySession(session.token);
    const response = NextResponse.json({ ok: true, user: sessionUser || user, isNew: Boolean(user.isNew) });
    setSessionCookie(response, session.token, session.expires, request);

    const locale = normalizeLocale((sessionUser && sessionUser.locale) || user.locale || DEFAULT_LOCALE);
    const domain = getSessionCookieDomain(request);
    response.cookies.set('NEXT_LOCALE', locale, {
      path: '/',
      maxAge: 31536000,
      sameSite: 'lax',
      ...(domain ? { domain } : {}),
    });
    response.cookies.set('locale', locale, {
      path: '/',
      maxAge: 31536000,
      sameSite: 'lax',
      ...(domain ? { domain } : {}),
    });
    return response;
  } catch (error) {
    console.error('[auth/google/one-tap]', {
      code: error.code || 'ONE_TAP_FAILED',
      message: error.message,
    });
    return NextResponse.json({ ok: false, message: '登录暂时不可用' }, { status: 500 });
  }
}
