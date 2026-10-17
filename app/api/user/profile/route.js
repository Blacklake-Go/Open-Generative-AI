import { getSessionCookieDomain, getUserFromRequest, json } from '@/lib/services/auth';
import { getProfile, updateProfile } from '@/lib/services/profile';
import { isSupportedLocale, normalizeLocale } from '@/lib/locales';
import { consumeRateLimit, guardMutation, rateLimitResponse } from '@/lib/security/requestGuard';

export const runtime = 'nodejs';

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const requestedUserId = searchParams.get('userId');
  const user = await getUserFromRequest(request);

  const targetUserId = requestedUserId || user?.id;
  if (!targetUserId) return json({ error: '请先登录或指定要查看的用户' }, { status: 401 });

  const profile = await getProfile(targetUserId);

  if (!profile) return json({ error: '用户不存在' }, { status: 404 });

  const isOwner = Boolean(user && (user.id === profile.id || user.userNumber === profile.user_number || user.user_number === profile.user_number));
  const canonicalUserNumber = profile.user_number ? String(profile.user_number) : (profile.id ? String(profile.id) : null);

  const sanitizedProfile = isOwner
    ? profile
    : {
        ...profile,
        email: null,
        phone: null,
        hasPassword: false,
      };

  return json({
    user: {
      ...sanitizedProfile,
      userNumber: canonicalUserNumber,
      user_number: canonicalUserNumber,
    }
  });
}

export async function PUT(request) {
  const user = await getUserFromRequest(request);
  if (!user) return json({ error: '请先登录' }, { status: 401 });
  const guarded = guardMutation(request, { maxBytes: 32 * 1024 });
  if (guarded) return guarded;

  try {
    const limit = await consumeRateLimit({ scope: 'user_profile_update', subject: user.id, limit: 60, windowMs: 60 * 60 * 1000 });
    if (!limit.allowed) return rateLimitResponse(limit);

    const body = await request.json();
    const { displayName, bio, website, avatarUrl, socialLinks, zodiac, industry, occupation, country, gender, occupationCode, styleCodes } = body;
    let locale;
    if (body.locale !== undefined) {
      if (!isSupportedLocale(body.locale)) {
        return json({ error: '不支持的语言 Locale' }, { status: 422 });
      }
      locale = normalizeLocale(body.locale);
    }

    const updated = await updateProfile(user.id, {
      displayName,
      bio,
      website,
      avatarUrl,
      socialLinks,
      locale,
      zodiac,
      industry,
      occupation,
      country,
      gender,
      occupationCode,
      styleCodes,
    });
    if (!updated) {
      return json({ error: '没有需要更新的字段' }, { status: 400 });
    }
    const response = json({ user: updated });
    if (locale !== undefined) {
      const norm = normalizeLocale(locale);
      const domain = getSessionCookieDomain(request);
      response.cookies.set('NEXT_LOCALE', norm, { path: '/', maxAge: 31536000, sameSite: 'lax', ...(domain ? { domain } : {}) });
      response.cookies.set('locale', norm, { path: '/', maxAge: 31536000, sameSite: 'lax', ...(domain ? { domain } : {}) });
    }
    return response;
  } catch (error) {
    console.error('[profile update error]', error);
    return json({ error: '更新个人信息失败' }, { status: 500 });
  }
}
