import { getSessionCookieDomain, getUserFromRequest, json } from '@/lib/services/auth';
import { queryOne, execute } from '@/lib/application/dataAccess.js';
import { isSupportedLocale, normalizeLocale } from '@/lib/locales';
import { consumeRateLimit, guardMutation, rateLimitResponse } from '@/lib/security/requestGuard';

export const runtime = 'nodejs';

export async function GET(request) {
  const user = await getUserFromRequest(request);
  if (!user) return json({ error: '请先登录' }, { status: 401 });

  const row = await queryOne('SELECT locale, social_links FROM users WHERE id = $1', [user.id]);
  const links = row?.social_links && typeof row.social_links === 'object' ? row.social_links : {};
  const preferences = links.preferences || {
    notifyOnComplete: true,
    highQualityPreview: true,
  };

  return json({
    preferences: {
      notifyOnComplete: preferences.notifyOnComplete ?? true,
      highQualityPreview: preferences.highQualityPreview ?? true,
      locale: normalizeLocale(row?.locale || 'zh-CN'),
    },
  });
}

export async function PUT(request) {
  const user = await getUserFromRequest(request);
  if (!user) return json({ error: '请先登录' }, { status: 401 });
  const guarded = guardMutation(request, { maxBytes: 16 * 1024 });
  if (guarded) return guarded;

  try {
    const limit = await consumeRateLimit({ scope: 'user_preferences_update', subject: user.id, limit: 120, windowMs: 60 * 60 * 1000 });
    if (!limit.allowed) return rateLimitResponse(limit);

    const body = await request.json();
    const { notifyOnComplete, highQualityPreview, locale } = body;

    const row = await queryOne('SELECT locale, social_links FROM users WHERE id = $1', [user.id]);
    const currentLinks = row?.social_links && typeof row.social_links === 'object' ? row.social_links : {};
    
    const updatedPreferences = {
      ...(currentLinks.preferences || {}),
      ...(notifyOnComplete !== undefined ? { notifyOnComplete: Boolean(notifyOnComplete) } : {}),
      ...(highQualityPreview !== undefined ? { highQualityPreview: Boolean(highQualityPreview) } : {}),
    };

    const newLinks = {
      ...currentLinks,
      preferences: updatedPreferences,
    };

    let targetLocale = normalizeLocale(row?.locale || 'zh-CN');
    if (locale !== undefined) {
      if (isSupportedLocale(locale)) {
        targetLocale = normalizeLocale(locale);
      }
    }

    await execute(
      'UPDATE users SET social_links = $1, locale = $2, updated_at = NOW() WHERE id = $3',
      [JSON.stringify(newLinks), targetLocale, user.id]
    );

    const response = json({
      success: true,
      preferences: {
        ...updatedPreferences,
        locale: targetLocale,
      },
    });

    if (locale !== undefined) {
      const domain = getSessionCookieDomain(request);
      response.cookies.set('NEXT_LOCALE', targetLocale, {
        path: '/',
        maxAge: 31536000,
        sameSite: 'lax',
        ...(domain ? { domain } : {}),
      });
      response.cookies.set('locale', targetLocale, {
        path: '/',
        maxAge: 31536000,
        sameSite: 'lax',
        ...(domain ? { domain } : {}),
      });
    }

    return response;
  } catch (error) {
    console.error('[preferences update error]', error);
    return json({ error: '更新偏好设置失败' }, { status: 500 });
  }
}
