import { json } from '@/lib/services/auth';
import { createGenerationQuote } from '@/lib/services/pricingEngine';
import { getActiveSubscription } from '@/lib/application/dataAccess.js';
import { consumeRateLimit, guardMutation, rateLimitResponse } from '@/lib/security/requestGuard';
import { publicErrorMessage } from '@/lib/security/publicError';
import { generationApiErrorStatus } from '@/lib/security/generationApiErrors';
import { resolveRequestUser } from '@/lib/security/requestUser';
import { readJsonObjectRequestBody } from '@/lib/security/requestJson';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request) {
  const auth = await resolveRequestUser(request);
  if (!auth.user) return json({ error: auth.error, code: auth.code }, { status: auth.status });
  const { user } = auth;

  try {
    const guarded = guardMutation(request, { maxBytes: 128 * 1024 });
    if (guarded) return guarded;

    const limit = await consumeRateLimit({ scope: 'generation_quote_user', subject: user.id, limit: 60, windowMs: 60 * 60 * 1000 });
    if (!limit.allowed) return rateLimitResponse(limit);

    const parsedBody = await readJsonObjectRequestBody(request);
    if (!parsedBody.ok) {
      const malformedJson = parsedBody.code === 'INVALID_JSON';
      return json({
        error: malformedJson ? '请求内容不是有效 JSON' : '请求 JSON 顶层必须是对象',
        code: parsedBody.code,
      }, { status: 400 });
    }
    const body = parsedBody.value;
    const idempotencyKey = String(request.headers.get('idempotency-key') || '').trim();
    if (idempotencyKey.length < 8 || idempotencyKey.length > 200) {
      return json({ error: '报价请求必须提供有效的 Idempotency-Key', code: 'IDEMPOTENCY_REQUIRED' }, { status: 422 });
    }
    const modelId = body.modelId || body.model || body.endpoint;
    if (!modelId) {
      return json({ error: '必须指定模型 ID' }, { status: 422 });
    }

    // 获取用户当前订阅等级
    const activeSub = await getActiveSubscription(user.id);
    const subscriptionLevel = activeSub?.plan_id || 'free';

    const quote = await createGenerationQuote({
      userId: user.id,
      modelId,
      parameters: body.parameters || body,
      subscriptionLevel,
      idempotencyKey,
      requirePublicAvailability: true,
    });

    return json({
      success: true,
      quote_id: quote.quoteId,
      quoteId: quote.quoteId,
      credits: quote.credits,
      creditsQuoted: quote.credits,
      pricing_breakdown: quote.pricingBreakdown,
      pricingBreakdown: quote.pricingBreakdown,
      expires_at: quote.expiresAt,
      expiresAt: quote.expiresAt,
      ttlSeconds: 300,
    }, { status: 201 });
  } catch (error) {
    console.error('[api/generation/quote]', error);
    return json({
      error: publicErrorMessage(error, '获取模型报价失败'),
      code: error.code || 'QUOTE_FAILED',
    }, { status: generationApiErrorStatus(error) });
  }
}
