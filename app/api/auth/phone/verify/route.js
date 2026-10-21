import { NextResponse } from 'next/server';
import { verifySmsCode } from '@/lib/sms';
import { findOrCreateUserByPhone, createSession, getSessionCookieDomain, setSessionCookie, json } from '@/lib/services/auth';
import { consumeRateLimit, getClientIp, guardMutation, rateLimitResponse } from '@/lib/security/requestGuard';
import { DEFAULT_LOCALE, isSupportedLocale, normalizeLocale } from '@/lib/locales';

export const runtime = 'nodejs';

export async function POST(request) {
  try {
    const guarded = guardMutation(request, { maxBytes: 16 * 1024 });
    if (guarded) return guarded;
    const body = await request.json();
    const phone = String(body.phone || '').trim();
    const countryCode = String(body.countryCode || '+86').trim();
    const code = String(body.code || '').trim();
    const ip = getClientIp(request);
    const limit = await consumeRateLimit({ scope: 'auth_sms_verify_ip', subject: ip, limit: 30, windowMs: 15 * 60 * 1000 });
    if (!limit.allowed) return rateLimitResponse(limit);

    if (!phone) {
      return json({ error: '请输入手机号码' }, { status: 400 });
    }
    if (!code) {
      return json({ error: '请输入短信验证码' }, { status: 400 });
    }

    // 1. 校验验证码
    const verifyResult = await verifySmsCode({ phone, countryCode, code, type: 'login', ip });
    if (verifyResult.error) {
      return json({ error: verifyResult.error }, { status: 400 });
    }

    // 2. 获取或创建用户主体与 auth_accounts 凭据
    const cookieLocale = request.cookies.get('NEXT_LOCALE')?.value || request.cookies.get('locale')?.value;
    const initialLocale = (cookieLocale && isSupportedLocale(cookieLocale))
      ? normalizeLocale(cookieLocale)
      : (body.locale && isSupportedLocale(body.locale) ? normalizeLocale(body.locale) : DEFAULT_LOCALE);

    const result = await findOrCreateUserByPhone({
      phone,
      countryCode,
      registrationSource: 'phone_sms',
      ip,
      locale: initialLocale,
    });

    if (result.error) {
      return json({ error: result.message || '登录失败' }, { status: 403 });
    }

    const { user, isNew } = result;

    // 3. 签发会话
    const session = await createSession(user.id);
    const userLocale = normalizeLocale(user.locale || initialLocale || DEFAULT_LOCALE);
    const response = json({
      user: {
        id: user.id,
        userNumber: user.user_number || user.id,
        displayName: user.display_name,
        phone: user.phone,
        phoneCountryCode: user.phone_country_code,
        email: user.email,
        role: user.role,
        status: user.status,
        locale: userLocale,
        credits: Number(user.credits || 0),
        loginProviders: ['phone']
      },
      isNew
    });

    setSessionCookie(response, session.token, session.expires, request);
    const domain = getSessionCookieDomain(request);
    response.cookies.set('NEXT_LOCALE', userLocale, { path: '/', maxAge: 31536000, sameSite: 'lax', ...(domain ? { domain } : {}) });
    response.cookies.set('locale', userLocale, { path: '/', maxAge: 31536000, sameSite: 'lax', ...(domain ? { domain } : {}) });
    return response;
  } catch (error) {
    console.error('[auth/phone/verify]', error);
    return json({ error: '登录验证失败，请稍后重试' }, { status: 500 });
  }
}
