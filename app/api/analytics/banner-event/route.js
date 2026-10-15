import { NextResponse } from 'next/server';
import { recordBannerEvent } from '@/lib/services/content';
import { getUserFromRequest } from '@/lib/services/auth';
import { consumeRateLimit, guardMutation } from '@/lib/security/requestGuard';


/** 限流主体：登录态按用户，其余按客户端 IP；XFF 由 nginx 单向写入。 */
function ipOf(request) {
  return request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
    || request.headers.get('x-real-ip')
    || 'unknown';
}

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request) {
  const deniedByOrigin = guardMutation(request);
  if (deniedByOrigin) return deniedByOrigin;
  const rl = await consumeRateLimit({
    scope: 'analytics.banner',
    subject: ipOf(request),
    limit: 120,
    windowMs: 60_000,
  });
  if (!rl.allowed) {
    return NextResponse.json({ error: '请求过于频繁，请稍后再试' }, { status: 429, headers: { 'Retry-After': String(rl.retryAfterSeconds) } });
  }
  try {
    let body = {};
    const contentType = request.headers.get('content-type') || '';
    if (contentType.includes('application/json')) {
      body = await request.json();
    } else if (contentType.includes('text/plain')) {
      // 兼容 navigator.sendBeacon 发送的 text/plain JSON 字符串
      const text = await request.text();
      body = JSON.parse(text);
    } else {
      body = await request.json();
    }

    const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
      request.headers.get('x-real-ip') ||
      '127.0.0.1';
    const userAgent = request.headers.get('user-agent') || '';
    const sessionUser = await getUserFromRequest(request);

    const ok = await recordBannerEvent({
      bannerId: body.bannerId,
      eventType: body.eventType,
      // userId 只能由服务端会话决定：接受 body.userId 等于任何人都能给别人账号刷曝光/点击。
      userId: sessionUser?.id || null,
      anonymousId: body.anonymousId,
      targetUrl: body.targetUrl,
      pagePath: body.pagePath,
      locale: body.locale,
      userAgent,
      ip,
    });

    return NextResponse.json({ ok });
  } catch (err) {
    return NextResponse.json({ ok: false, error: err.message }, { status: 400 });
  }
}
