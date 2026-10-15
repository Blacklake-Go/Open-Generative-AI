import { getUserFromRequest, json } from '../../../../../lib/services/auth.js';
import { dailyCheckIn } from '../../../../../lib/financial/index.js';
import { getApiI18n } from '../../../../../lib/i18n.js';
import { consumeRateLimit, guardMutation, rateLimitResponse } from '../../../../../lib/security/requestGuard.js';
import { publicErrorMessage } from '../../../../../lib/security/publicError.js';

export const runtime = 'nodejs';

export async function POST(request) {
  const { t } = getApiI18n(request);
  const user = await getUserFromRequest(request);
  if (!user) return json({ error: t('api.unauthorized') }, { status: 401 });
  const guarded = guardMutation(request, { maxBytes: 16 * 1024 });
  if (guarded) return guarded;

  try {
    const limit = await consumeRateLimit({ scope: 'credit_checkin_user', subject: user.id, limit: 10, windowMs: 24 * 60 * 60 * 1000 });
    if (!limit.allowed) return rateLimitResponse(limit);

    const result = await dailyCheckIn(user.id);
    return json({
      ...result,
      message: t('financial.checkinSuccess'),
    });
  } catch (error) {
    console.error('[api/financial/credits/checkin]', error);
    return json({ error: publicErrorMessage(error, t('common.failed')) }, { status: 400 });
  }
}
