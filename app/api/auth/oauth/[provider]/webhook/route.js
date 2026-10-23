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
  return NextResponse.json({ ok: true, code: 0, provider, message: 'success', timestamp: Date.now() });
}

export async function POST(request, { params }) {
  const provider = String((await params).provider || '').toLowerCase();
  let body = {};
  let rawText = '';
  try {
    rawText = await request.text();
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

  console.log(`[oauth/${provider}/webhook] 收到事件原始请求:`, {
    provider,
    event: body?.event || body?.type || 'unknown',
    rawBody: rawText.slice(0, 500),
  });

  // 抖音 / 哔哩哔哩 (verify_webhooks) / 通用开放平台 Webhook 验证握手
  const isVerify =
    body?.event === 'verify_webhook' ||
    body?.event === 'verify_webhooks' ||
    body?.type === 'verify_webhook' ||
    body?.type === 'verify_webhooks' ||
    body?.challenge !== undefined ||
    body?.content?.challenge !== undefined ||
    body?.data?.challenge !== undefined ||
    body?.echostr !== undefined;

  if (isVerify) {
    const challenge =
      body?.content?.challenge ??
      body?.challenge ??
      body?.data?.challenge ??
      body?.echostr ??
      '';

    return NextResponse.json({
      code: 0,
      message: 'success',
      msg: 'success',
      challenge: challenge,
      data: { challenge },
      content: { challenge },
    }, { status: 200 });
  }

  // 业务事件正常接收
  return NextResponse.json({ code: 0, message: 'success', msg: 'success' }, { status: 200 });
}
