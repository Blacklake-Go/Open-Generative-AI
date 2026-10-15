import { NextResponse } from 'next/server';
import { getUserFromRequest } from '@/lib/services/auth';
import { createGenerationTask, processGenerationTask } from '@/lib/services/generationCore';
import { findModelByEndpointOrId } from '@/lib/services/models';
import { consumeRateLimit, getClientIp, guardMutation, rateLimitResponse } from '@/lib/security/requestGuard';
import { publicErrorMessage } from '@/lib/security/publicError';
import { resolveProviderApiKey } from '@/lib/security/byok';
import { getAssetUrl } from '@/lib/storage/storageService';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
const UPSTREAM_BASE = process.env.UPSTREAM_AI_BASE || 'https://api.muapi.ai';
const MAX_FILE_UPLOAD_BYTES = 50 * 1024 * 1024;
const MAX_GENERATION_JSON_BYTES = 256 * 1024;

function cleanHeaders(request) {
  const headers = new Headers(request.headers);
  headers.delete('host'); headers.delete('connection'); headers.delete('cookie');
  headers.delete('authorization'); headers.delete('x-api-key');
  return headers;
}

/**
 * `packages/studio` posts reference files directly to `/api/v1/upload_file`.
 * It is deliberately kept outside the generation-task path below: multipart
 * bodies are not JSON and must not be parsed or persisted as a generation.
 */
async function proxyFileUpload(request, headers) {
  const contentType = request.headers.get('content-type') || '';
  if (!contentType.toLowerCase().startsWith('multipart/form-data')) {
    return NextResponse.json({ error: '上传请求必须使用 multipart/form-data' }, { status: 415 });
  }

  try {
    const body = await request.arrayBuffer();
    if (body.byteLength > MAX_FILE_UPLOAD_BYTES) {
      return NextResponse.json({ error: '请求内容过大' }, { status: 413 });
    }
    const response = await fetch(`${UPSTREAM_BASE}/api/v1/upload_file`, {
      method: 'POST',
      headers,
      body,
    });
    const responseText = await response.text();
    let data;
    try {
      data = responseText ? JSON.parse(responseText) : {};
    } catch {
      data = { error: response.ok ? '上传服务返回了无效响应' : '上传服务暂时不可用' };
    }
    return NextResponse.json(data, { status: response.status });
  } catch (error) {
    console.error('[proxy/v1/upload]', { code: error.code || 'UPSTREAM_ERROR' });
    return NextResponse.json({ error: publicErrorMessage(error, '上传服务暂时不可用') }, { status: 502 });
  }
}

export async function GET(request, context) {
  const user = await getUserFromRequest(request);
  if (!user) return NextResponse.json({ error: '请先登录' }, { status: 401 });
  const { path: pathSegments = [] } = await context.params;
  const targetUrl = `${UPSTREAM_BASE}/api/v1/${pathSegments.join('/')}${new URL(request.url).search}`;
  const headers = cleanHeaders(request);
  const apiKey = await resolveProviderApiKey(request);
  if (!apiKey.ok || !apiKey.key) return NextResponse.json({ error: '模型服务未配置或不可用' }, { status: 503 });
  if (apiKey.key) headers.set('x-api-key', apiKey.key);
  try {
    const response = await fetch(targetUrl, { headers, method: 'GET' });
    const data = await response.json().catch(() => null);
    const requestId = data?.request_id || data?.id || pathSegments[1];
    const resultUrl = data?.outputs?.[0] || data?.url || data?.output?.url;
    return NextResponse.json(data, { status: response.status });
  } catch (error) { console.error('[proxy/v1/GET]', { code: error.code || 'UPSTREAM_ERROR' }); return NextResponse.json({ error: publicErrorMessage(error, '上游请求异常') }, { status: 502 }); }
}

export async function POST(request, context) {
  const { path: pathSegments = [] } = await context.params;
  const endpoint = pathSegments[0] || '';
  const isFileUpload = pathSegments.length === 1 && endpoint === 'upload_file';
  const user = await getUserFromRequest(request);
  if (!user) return NextResponse.json({ error: '请先登录后再创建生成任务' }, { status: 401 });
  if (user.status === 'suspended') return NextResponse.json({ error: '账户已被封禁，无权上传文件' }, { status: 403 });

  // A reference image is normally much larger than the JSON payload accepted
  // by generation endpoints. Keep the strict JSON cap for generation while
  // allowing a bounded multipart upload through the authenticated proxy.
  const maxBytes = isFileUpload ? MAX_FILE_UPLOAD_BYTES : MAX_GENERATION_JSON_BYTES;
  const guarded = guardMutation(request, { maxBytes });
  if (guarded) return guarded;
  const limit = await consumeRateLimit({ scope: isFileUpload ? 'upload_user' : 'generation_user', subject: user.id || getClientIp(request), limit: isFileUpload ? 120 : 60, windowMs: 60 * 60 * 1000 });
  if (!limit.allowed) return rateLimitResponse(limit);

  if (isFileUpload) {
    const headers = cleanHeaders(request);
    const apiKey = await resolveProviderApiKey(request);
    if (!apiKey.ok || !apiKey.key) return NextResponse.json({ error: '上传服务暂未配置或不可用' }, { status: 503 });
    headers.set('x-api-key', apiKey.key);
    return proxyFileUpload(request, headers);
  }

  const modelConfig = await findModelByEndpointOrId(endpoint);
  if (modelConfig && !modelConfig.is_active) return NextResponse.json({ error: `模型 [${modelConfig.name}] 当前正在维护升级中，已被管理员暂停调用，请切换其他模型。` }, { status: 403 });
  const rawBodyText = await request.text().catch(() => '');
  let body = {};
  try { body = rawBodyText ? JSON.parse(rawBodyText) : {}; } catch { return NextResponse.json({ error: '请求体必须是有效 JSON' }, { status: 422 }); }
  const idempotencyKey = request.headers.get('idempotency-key') || request.headers.get('x-idempotency-key');
  try {
    const targetModelId = modelConfig?.id || endpoint;
    const taskParameters = { ...body, endpoint: targetModelId };
    let quoteId = body.quoteId || body.quote_id || null;
    if (!quoteId && idempotencyKey) {
      const { createGenerationQuote } = await import('@/lib/services/pricingEngine');
      const generatedQuote = await createGenerationQuote({
        userId: user.id,
        modelId: targetModelId,
        parameters: taskParameters,
        idempotencyKey: `${String(idempotencyKey).trim().slice(0, 190)}:quote`,
      });
      quoteId = generatedQuote.quoteId;
    }
    const task = await createGenerationTask({
      user,
      modelId: targetModelId,
      studioId: modelConfig?.type || 'studio',
      prompt: body.prompt,
      parameters: taskParameters,
      idempotencyKey,
      label: body.label,
      quoteId,
    });
    if (task.idempotent && task.creation.status !== 'queued') {
      const resultUrl = task.creation.result_object_key
        ? await getAssetUrl({ objectKey: task.creation.result_object_key, visibility: 'private' }).catch(() => null)
        : task.creation.result_url;
      return NextResponse.json({
        creation_id: task.creation.id,
        status: task.creation.status,
        url: resultUrl || undefined,
        request_id: task.creation.provider_request_id || task.creation.external_request_id || undefined,
      });
    }

    if (process.env.GENERATION_ASYNC === 'true') {
      return NextResponse.json({
        creation_id: task.creation.id,
        status: task.creation.status,
        request_id: task.creation.id,
      }, { status: task.idempotent ? 200 : 202 });
    }

    const processed = await processGenerationTask({ creationId: task.creation.id });
    const status = processed.success === false ? 502 : processed.pending ? 202 : 200;
    const resultUrl = processed.creation?.result_object_key
      ? await getAssetUrl({ objectKey: processed.creation.result_object_key, visibility: 'private' }).catch(() => null)
      : processed.creation?.result_url;
    return NextResponse.json({
      creation_id: processed.creation?.id,
      status: processed.creation?.status,
      url: resultUrl || undefined,
      request_id: processed.providerRequestId || processed.creation?.provider_request_id || undefined,
      error: processed.error || undefined,
    }, { status });
  } catch (error) {
    const status = error.code === 'IDEMPOTENCY_CONFLICT' ? 409
      : error.code === 'INSUFFICIENT_CREDITS' ? 402
        : error.code === 'MODEL_NOT_FOUND' ? 404
          : error.code === 'IDEMPOTENCY_REQUIRED' ? 422
            : 500;
    console.error('[proxy/v1/generation]', { code: error.code || 'GENERATION_FAILED' });
    return NextResponse.json({ error: publicErrorMessage(error, '生成任务创建失败'), code: error.code || 'GENERATION_FAILED' }, { status });
  }
}
