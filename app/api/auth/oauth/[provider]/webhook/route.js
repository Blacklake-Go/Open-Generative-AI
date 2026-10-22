import { NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request, { params }) {
  const provider = String((await params).provider || '').toLowerCase();
  const { searchParams } = new URL(request.url);
  const challenge = searchParams.get('challenge') || searchParams.get('echostr');
  if (challenge) {
    return new NextResponse(challenge, {
      status: 200,
      headers: { 'Content-Type': 'text/plain; charset=utf-8' },
    });
  }
  return NextResponse.json({ ok: true, provider, timestamp: Date.now() });
}

export async function POST(request, { params }) {
  const provider = String((await params).provider || '').toLowerCase();
  let body = {};
  try {
    const rawText = await request.text();
    if (rawText) {
      try {
        body = JSON.parse(rawText);
      } catch {
        const urlParams = new URLSearchParams(rawText);
        body = Object.fromEntries(urlParams.entries());
      }
    }
  } catch (err) {
    console.warn(`[oauth/${provider}/webhook] 请求体解析失败:`, err.message);
  }

  // 抖音 Webhook 验证握手
  if (body?.event === 'verify_webhook' || body?.content?.challenge !== undefined) {
    const challenge = body?.content?.challenge !== undefined ? body.content.challenge : body?.challenge;
    return NextResponse.json({ challenge }, { status: 200 });
  }

  console.log(`[oauth/${provider}/webhook] 收到事件:`, {
    event: body?.event || body?.type || 'unknown',
    provider,
  });

  return NextResponse.json({ message: 'success' }, { status: 200 });
}
