import { NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * 哔哩哔哩开放平台 Webhook / 事件推送处理器
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
    console.warn('[webhook/bilibili] 无法解析请求体:', err.message);
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
  return NextResponse.json({ ok: true, provider: 'bilibili', timestamp: Date.now() });
}

export async function POST(request) {
  const body = await parseRequestBody(request);

  if (body?.challenge !== undefined || body?.echostr !== undefined) {
    const challenge = body?.challenge !== undefined ? body.challenge : body?.echostr;
    return NextResponse.json({ challenge }, { status: 200 });
  }

  console.log('[webhook/bilibili] 收到开放平台事件推送:', {
    event: body?.event || body?.type || 'unknown',
    body,
  });

  return NextResponse.json({ code: 0, message: 'success' }, { status: 200 });
}
