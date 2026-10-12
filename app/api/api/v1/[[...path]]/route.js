import { NextResponse } from 'next/server';
import { getUserFromRequest } from '@/lib/services/auth';
import { findCreationById } from '@/lib/services/generations';
import { consumeRateLimit, getClientIp, guardMutation, rateLimitResponse } from '@/lib/security/requestGuard';
import { publicErrorMessage } from '@/lib/security/publicError';
import { getServerProviderApiKey } from '@/lib/services/providerSecrets';
import { getAssetUrl } from '@/lib/storage/storageService';
import { classifyProxyRequest, POLICY } from '@/lib/security/legacyProxyPolicy';

const MUAPI_BASE = 'https://api.muapi.ai';

async function guardGenericProxyRequest(request, pathSegments, method, user) {
    const verdict = classifyProxyRequest(pathSegments, method);
    if (!verdict.allow) {
        const billed = verdict.decision === POLICY.DENY_BILLING_REQUIRED;
        return NextResponse.json({
            error: billed ? '该推理入口尚未接入平台额度结算，暂不可用' : '该接口不可用',
            code: verdict.decision,
        }, { status: billed ? 402 : verdict.decision === POLICY.DENY_ACCOUNT ? 403 : 404 });
    }
    const result = await consumeRateLimit({
        scope: `legacy_api_v1_${method.toLowerCase()}`,
        subject: user?.id || getClientIp(request),
        limit: method === 'GET' ? 600 : 60,
        windowMs: 60 * 1000,
    });
    return result.allowed ? null : rateLimitResponse(result);
}

function cleanHeaders(request) {
    const headers = new Headers(request.headers);
    headers.delete('host');
    headers.delete('connection');
    headers.delete('cookie');
    headers.delete('authorization');
    headers.delete('x-api-key');
    return headers;
}

// Proxies /api/api/v1/* -> https://api.muapi.ai/api/v1/*
// This is required because the AiAgent library hardcodes a double /api/api
export async function GET(request, { params }) {
    const slug = await params;
    const pathSegments = slug.path || [];
    const path = pathSegments.join('/');

    const user = await getUserFromRequest(request);
    if (!user) return NextResponse.json({ error: '请先登录' }, { status: 401 });

    // Async generation tasks are polled through the legacy agent path. Keep
    // this local and ownership-checked instead of exposing provider requests.
    if (pathSegments[0] === 'predictions' && pathSegments[2] === 'result' && String(pathSegments[1] || '').startsWith('gen_')) {
        const creation = await findCreationById(pathSegments[1]);
        if (!creation || creation.user_id !== user.id) {
            return NextResponse.json({ error: '任务不存在' }, { status: 404 });
        }
        const status = creation.status === 'succeeded' ? 'completed'
            : creation.status === 'cancelled' ? 'cancelled'
                : creation.status;
        const resultUrl = creation.result_object_key
            ? await getAssetUrl({ objectKey: creation.result_object_key, visibility: 'private' }).catch(() => null)
            : creation.result_url;
        return NextResponse.json({
            id: creation.id,
            request_id: creation.id,
            status,
            url: resultUrl || undefined,
            outputs: resultUrl ? [resultUrl] : undefined,
            error: creation.error_reason ? { message: creation.error_reason, code: creation.error_code } : undefined,
            cost: creation.status === 'failed' ? { refunded: true, amount_credits: Number(creation.credit_cost || 0) } : undefined,
        });
    }

    const denied = await guardGenericProxyRequest(request, pathSegments, 'GET', user);
    if (denied) return denied;
    
    const { search } = new URL(request.url);
    const targetUrl = `${MUAPI_BASE}/api/v1/${path}${search}`;

    const headers = cleanHeaders(request);
    // NOTE: credential logging removed for security (CWE-200)
    const apiKey = await getServerProviderApiKey({ provider: 'muapi' });
    if (!apiKey) return NextResponse.json({ error: 'Provider 服务暂未配置' }, { status: 503 });
    headers.set('x-api-key', apiKey);

    try {
        const response = await fetch(targetUrl, { headers, method: 'GET' });
        const data = await response.json();
        return NextResponse.json(data, { status: response.status });
    } catch (error) {
        return NextResponse.json({ error: publicErrorMessage(error, '上游请求异常') }, { status: 500 });
    }
}

export async function POST(request, { params }) {
    const slug = await params;
    const pathSegments = slug.path || [];
    const path = pathSegments.join('/');

    const user = await getUserFromRequest(request);
    if (!user) return NextResponse.json({ error: '请先登录' }, { status: 401 });
    const isUploadPath = pathSegments.some(seg => seg === 'upload_file' || seg === 'upload-binary' || seg.toLowerCase().includes('upload')) || path.toLowerCase().includes('upload');
    const maxBytes = isUploadPath ? 50 * 1024 * 1024 : 256 * 1024;
    const guarded = guardMutation(request, { maxBytes });
    if (guarded) return guarded;
    const denied = await guardGenericProxyRequest(request, pathSegments, 'POST', user);
    if (denied) return denied;
    
    const { search } = new URL(request.url);
    const targetUrl = `${MUAPI_BASE}/api/v1/${path}${search}`;

    const headers = cleanHeaders(request);
    const apiKey = await getServerProviderApiKey({ provider: 'muapi' });
    if (!apiKey) return NextResponse.json({ error: 'Provider 服务暂未配置' }, { status: 503 });
    headers.set('x-api-key', apiKey);

    try {
        const body = await request.arrayBuffer();
        const response = await fetch(targetUrl, { method: 'POST', headers, body });
        const data = await response.json();
        return NextResponse.json(data, { status: response.status });
    } catch (error) {
        return NextResponse.json({ error: publicErrorMessage(error, '上游请求异常') }, { status: 500 });
    }
}
