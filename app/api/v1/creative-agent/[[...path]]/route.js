import { NextResponse } from 'next/server';
import { getUserFromRequest } from '@/lib/services/auth';
import { guardMutation } from '@/lib/security/requestGuard';
import { publicErrorMessage } from '@/lib/security/publicError';
import { resolveProviderApiKey } from '@/lib/security/byok';
import { authorizeCreativeAgentProxyPath, POLICY } from '@/lib/security/legacyProxyPolicy';
import { consumeRateLimit, getClientIp, rateLimitResponse } from '@/lib/security/requestGuard';

const MUAPI_BASE = 'https://api.muapi.ai';

async function guardCreativeAgentProxy(request, pathSegments, method, user) {
    const verdict = authorizeCreativeAgentProxyPath(pathSegments, method);
    if (!verdict.allow) {
        const billed = verdict.decision === POLICY.DENY_BILLING_REQUIRED;
        return NextResponse.json({
            error: billed ? '该推理入口尚未接入平台额度结算，暂不可用' : '该接口暂不可用',
            code: verdict.decision,
        }, { status: billed ? 402 : 404 });
    }
    const result = await consumeRateLimit({
        scope: 'creative_agent_proxy',
        subject: user?.id || getClientIp(request),
        limit: method === 'GET' ? 600 : 60,
        windowMs: 60 * 1000,
    });
    return result.allowed ? null : rateLimitResponse(result);
}

async function getApiKey(request) {
    return resolveProviderApiKey(request);
}

function cleanHeaders(request) {
    const headers = new Headers(request.headers);
    headers.delete('host');
    headers.delete('connection');
    headers.delete('cookie');
    headers.delete('Authorization');
    headers.delete('x-api-key');
    return headers;
}

export async function GET(request, { params }) {
    const user = await getUserFromRequest(request);
    if (!user) return NextResponse.json({ error: '请先登录' }, { status: 401 });
    const slug = await params;
    const pathSegments = slug.path || [];
    const denied = await guardCreativeAgentProxy(request, pathSegments, 'GET', user);
    if (denied) return denied;
    const path = pathSegments.join('/');
    
    const { search } = new URL(request.url);
    const targetUrl = `${MUAPI_BASE}/api/v1/creative-agent/${path}${search}`;

    const headers = cleanHeaders(request);
    const apiKey = await getApiKey(request);
    if (!apiKey.ok || !apiKey.key) return NextResponse.json({ error: 'Creative Agent 服务暂未配置或不可用' }, { status: 503 });
    if (apiKey.key) headers.set('x-api-key', apiKey.key);

    try {
        const response = await fetch(targetUrl, { headers, method: 'GET' });
        const data = await response.json();
        return NextResponse.json(data, { status: response.status });
    } catch (error) {
        console.error('[creative-agent proxy GET ERROR]', { code: error.code || 'UPSTREAM_ERROR' });
        return NextResponse.json({ error: publicErrorMessage(error, 'Creative Agent 请求暂时不可用') }, { status: 500 });
    }
}

export async function POST(request, { params }) {
    const user = await getUserFromRequest(request);
    if (!user) return NextResponse.json({ error: '请先登录' }, { status: 401 });
    const guarded = guardMutation(request, { maxBytes: 512 * 1024 });
    if (guarded) return guarded;
    const slug = await params;
    const pathSegments = slug.path || [];
    const denied = await guardCreativeAgentProxy(request, pathSegments, 'POST', user);
    if (denied) return denied;
    const path = pathSegments.join('/');
    
    const { search } = new URL(request.url);
    const targetUrl = `${MUAPI_BASE}/api/v1/creative-agent/${path}${search}`;

    const headers = cleanHeaders(request);
    const apiKey = await getApiKey(request);
    if (!apiKey.ok || !apiKey.key) return NextResponse.json({ error: 'Creative Agent 服务暂未配置或不可用' }, { status: 503 });

    if (apiKey.key) headers.set('x-api-key', apiKey.key);

    try {
        const body = await request.arrayBuffer();
        const response = await fetch(targetUrl, { method: 'POST', headers, body });
        const data = await response.json();
        return NextResponse.json(data, { status: response.status });
    } catch (error) {
        console.error('[creative-agent proxy POST ERROR]', { code: error.code || 'UPSTREAM_ERROR' });
        return NextResponse.json({ error: publicErrorMessage(error, 'Creative Agent 请求暂时不可用') }, { status: 500 });
    }
}

export async function PATCH(request, { params }) {
    const user = await getUserFromRequest(request);
    if (!user) return NextResponse.json({ error: '请先登录' }, { status: 401 });
    const guarded = guardMutation(request, { maxBytes: 512 * 1024 });
    if (guarded) return guarded;
    const slug = await params;
    const pathSegments = slug.path || [];
    const denied = await guardCreativeAgentProxy(request, pathSegments, 'PATCH', user);
    if (denied) return denied;
    const path = pathSegments.join('/');
    
    const { search } = new URL(request.url);
    const targetUrl = `${MUAPI_BASE}/api/v1/creative-agent/${path}${search}`;

    const headers = cleanHeaders(request);
    const apiKey = await getApiKey(request);
    if (!apiKey.ok || !apiKey.key) return NextResponse.json({ error: 'Creative Agent 服务暂未配置或不可用' }, { status: 503 });

    if (apiKey.key) headers.set('x-api-key', apiKey.key);

    try {
        const body = await request.arrayBuffer();
        const response = await fetch(targetUrl, { method: 'PATCH', headers, body });
        const data = await response.json();
        return NextResponse.json(data, { status: response.status });
    } catch (error) {
        console.error('[creative-agent proxy PATCH ERROR]', { code: error.code || 'UPSTREAM_ERROR' });
        return NextResponse.json({ error: publicErrorMessage(error, 'Creative Agent 请求暂时不可用') }, { status: 500 });
    }
}

export async function DELETE(request, { params }) {
    const user = await getUserFromRequest(request);
    if (!user) return NextResponse.json({ error: '请先登录' }, { status: 401 });
    const guarded = guardMutation(request, { maxBytes: 32 * 1024 });
    if (guarded) return guarded;
    const slug = await params;
    const pathSegments = slug.path || [];
    const denied = await guardCreativeAgentProxy(request, pathSegments, 'DELETE', user);
    if (denied) return denied;
    const path = pathSegments.join('/');
    
    const { search } = new URL(request.url);
    const targetUrl = `${MUAPI_BASE}/api/v1/creative-agent/${path}${search}`;

    const headers = cleanHeaders(request);
    const apiKey = await getApiKey(request);
    if (!apiKey.ok || !apiKey.key) return NextResponse.json({ error: 'Creative Agent 服务暂未配置或不可用' }, { status: 503 });

    if (apiKey.key) headers.set('x-api-key', apiKey.key);

    try {
        const response = await fetch(targetUrl, { method: 'DELETE', headers });
        const data = await response.json();
        return NextResponse.json(data, { status: response.status });
    } catch (error) {
        console.error('[creative-agent proxy DELETE ERROR]', { code: error.code || 'UPSTREAM_ERROR' });
        return NextResponse.json({ error: publicErrorMessage(error, 'Creative Agent 请求暂时不可用') }, { status: 500 });
    }
}
