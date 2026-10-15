import { json } from '@/lib/services/auth';
import { createGenerationTask, processGenerationTask } from '@/lib/services/generationCore';
import { exposeCreationResult, getGenerationTrace, listUserGenerations } from '@/lib/services/generations';
import { consumeRateLimit, getClientIp, guardMutation, rateLimitResponse } from '@/lib/security/requestGuard';
import { publicErrorMessage } from '@/lib/security/publicError';
import { validatePromptSafety } from '@/lib/security/contentModeration';
import { generationApiErrorStatus } from '@/lib/security/generationApiErrors';
import { resolveRequestUser } from '@/lib/security/requestUser';
import { readJsonObjectRequestBody } from '@/lib/security/requestJson';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request) {
  const auth = await resolveRequestUser(request);
  if (!auth.user) return json({ error: auth.error, code: auth.code }, { status: auth.status });
  const { user } = auth;

  try {
    const creationId = request.nextUrl.searchParams.get('id');
    if (creationId) {
      const trace = await getGenerationTrace(creationId, { expectedUserId: user.id });
      if (!trace?.creation) return json({ error: '任务不存在' }, { status: 404 });
      return json(trace);
    }

    const result = await listUserGenerations(user.id, Math.min(100, Number(request.nextUrl.searchParams.get('limit') || 50)));
    return json({ creations: result });
  } catch (error) {
    console.error('[api/generations GET]', error);
    return json({ error: publicErrorMessage(error, '读取生成任务失败，请稍后重试'), code: error.code || 'GENERATION_READ_FAILED' }, { status: 503 });
  }
}

export async function POST(request) {
  const auth = await resolveRequestUser(request);
  if (!auth.user) return json({ error: auth.error, code: auth.code }, { status: auth.status });
  const { user } = auth;

  try {
    const guarded = guardMutation(request, { maxBytes: 256 * 1024 });
    if (guarded) return guarded;
    const limit = await consumeRateLimit({ scope: 'generation_user', subject: user.id || getClientIp(request), limit: 60, windowMs: 60 * 60 * 1000 });
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
    const moderation = validatePromptSafety(body.prompt);
    if (!moderation.passed) {
      return json({ error: moderation.reason, code: moderation.code }, { status: 422 });
    }
    const idempotencyKey = request.headers.get('idempotency-key') || request.headers.get('x-idempotency-key');
    const quoteId = String(body.quoteId || body.quote_id || '').trim() || null;
    if (!quoteId) {
      return json({ error: '创建生成任务前必须先获取有效的服务端报价', code: 'QUOTE_REQUIRED' }, { status: 422 });
    }
    const task = await createGenerationTask({
      user,
      modelId: body.modelId || body.model || body.endpoint,
      studioId: body.studioId || 'studio',
      prompt: body.prompt,
      parameters: body.parameters || body,
      idempotencyKey,
      label: body.label,
      quoteId,
      requirePublicAvailability: true,
      routingMode: body.routingMode || body.routing_mode || 'cost',
    });

    if (task.idempotent && task.creation.status !== 'queued') {
      const exposedCreation = await exposeCreationResult(task.creation);
      return json({ ...task, creation: exposedCreation }, { status: 200 });
    }
    if (process.env.GENERATION_ASYNC === 'true') {
      return json({
        ...task,
        creation_id: task.creation.id,
        status: task.creation.status,
      }, { status: task.idempotent ? 200 : 202 });
    }
    const processed = await processGenerationTask({ creationId: task.creation.id });
    if (processed.success === false) return json(processed, { status: 502 });
    const exposedCreation = await exposeCreationResult(processed.creation || task.creation);
    return json({
      ...task,
      ...processed,
      creation: exposedCreation,
      result_url: exposedCreation?.result_url || null,
    }, { status: processed.pending ? 202 : 201 });
  } catch (error) {
    console.error('[api/generations]', error);
    return json({ error: publicErrorMessage(error, '创建生成任务失败'), code: error.code || 'GENERATION_CREATE_FAILED' }, { status: generationApiErrorStatus(error) });
  }
}
