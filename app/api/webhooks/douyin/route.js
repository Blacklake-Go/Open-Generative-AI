import { NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * 抖音开放平台 Webhook / 事件订阅处理器
 * 支持：
 * 1. 抖音开放平台开发者后台「保存 / 校验 Webhook URL」的 challenge 握手验证
 * 2. 授权状态变更、取消授权等业务事件推送接收
 */
async function parseRequestBody(request) {
  try {
    const rawText = await request.text();
    if (!rawText) return {};
    try {
      return JSON.parse(rawText);
    } catch {
      const params = new URLSearchParams(rawText);
      return Object.fromEntries(params.entries());
    }
  } catch (err) {
    console.warn('[webhook/douyin] 无法解析请求体:', err.message);
    return {};
  }
}

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const challenge = searchParams.get('challenge') || searchParams.get('echostr');
  if (challenge) {
    return new NextResponse(challenge, {
      status: 200,
      headers: { 'Content-Type': 'text/plain; charset=utf-8' },
    });
  }
  return NextResponse.json({ ok: true, provider: 'douyin', timestamp: Date.now() });
}

export async function POST(request) {
  const body = await parseRequestBody(request);

  // 1. 抖音开放平台 Webhook URL 合法性校验请求
  // 抖音规范：event 为 verify_webhook，从 content.challenge 读取并原样返回 { challenge: ... }
  if (body?.event === 'verify_webhook' || body?.content?.challenge !== undefined) {
    const challenge = body?.content?.challenge !== undefined ? body.content.challenge : body?.challenge;
    console.log('[webhook/douyin] 收到 Webhook 握手验证请求, challenge =', challenge);
    return NextResponse.json({ challenge }, { status: 200 });
  }

  // 2. 业务事件推送（例如 authorize、unauthorize、token 刷新等）
  console.log('[webhook/douyin] 收到开放平台事件推送:', {
    event: body?.event || body?.type || 'unknown',
    client_key: body?.client_key || null,
    log_id: body?.log_id || null,
  });

  // 抖音要求返回成功响应
  return NextResponse.json({ message: 'success' }, { status: 200 });
}
