import { getUserFromRequest, json } from '../../../../../lib/services/auth.js';
import { setPayPassword } from '../../../../../lib/financial/index.js';
import { consumeRateLimit, guardMutation, rateLimitResponse } from '../../../../../lib/security/requestGuard.js';
import { publicErrorMessage } from '../../../../../lib/security/publicError.js';

export const runtime = 'nodejs';

export async function POST(request) {
  const user = await getUserFromRequest(request);
  if (!user) return json({ error: '请先登录' }, { status: 401 });
  const guarded = guardMutation(request, { maxBytes: 16 * 1024 });
  if (guarded) return guarded;

  try {
    const limit = await consumeRateLimit({ scope: 'currency_pay_password_update', subject: user.id, limit: 10, windowMs: 15 * 60 * 1000 });
    if (!limit.allowed) return rateLimitResponse(limit);

    const body = await request.json();
    const { password } = body;

    if (!password || String(password).length < 6) {
      return json({ error: '支付密码长度不能低于 6 位' }, { status: 400 });
    }

    await setPayPassword(user.id, password, String(body.currentPassword || ''));
    return json({ success: true, message: '支付密码设置成功' });
  } catch (error) {
    console.error('[api/financial/currency/password]', error);
    if (error?.code === 'RATE_LIMITED') return rateLimitResponse(error);
    if (error?.code === 'PAY_PASSWORD_CURRENT_REQUIRED') {
      return json({ error: '修改支付密码需要先验证当前密码', code: error.code }, { status: 400 });
    }
    if (error?.code === 'PAY_PASSWORD_INVALID') {
      return json({ error: '当前支付密码错误，请核对后重试', code: error.code }, { status: 400 });
    }
    return json({ error: publicErrorMessage(error, '设置支付密码失败') }, { status: 400 });
  }
}
