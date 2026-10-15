import { getUserFromRequest, json } from '@/lib/services/auth';
import { consumeRateLimit, guardMutation } from '@/lib/security/requestGuard';
import {
  getUserNotifications,
  getUnreadNotificationCount,
  markAllNotificationsAsRead,
} from '@/lib/application/dataAccess.js';


/** 限流主体：登录态按用户，其余按客户端 IP；XFF 由 nginx 单向写入。 */
function ipOf(request) {
  return request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
    || request.headers.get('x-real-ip')
    || 'unknown';
}

export const runtime = 'nodejs';

export async function GET(request) {
  try {
    const user = await getUserFromRequest(request);
    if (!user) {
      return json({ notifications: [], unreadCount: 0 });
    }

    const [notifications, unreadCount] = await Promise.all([
      getUserNotifications(user.id, 20),
      getUnreadNotificationCount(user.id),
    ]);

    return json({
      notifications,
      unreadCount,
    });
  } catch (error) {
    console.error('[notifications GET error]', error);
    return json({ error: '获取通知列表失败' }, { status: 500 });
  }
}

export async function POST(request) {
  const deniedByOrigin = guardMutation(request);
  if (deniedByOrigin) return deniedByOrigin;
  try {
    const user = await getUserFromRequest(request);
  const rl = await consumeRateLimit({
    scope: 'user.notifications',
    subject: user?.id || ipOf(request),
    limit: 60,
    windowMs: 60_000,
  });
  if (!rl.allowed) {
    return json({ error: '请求过于频繁，请稍后再试' }, { status: 429, headers: { 'Retry-After': String(rl.retryAfterSeconds) } });
  }
    if (!user) {
      return json({ error: '请先登录' }, { status: 401 });
    }

    await markAllNotificationsAsRead(user.id);

    return json({
      success: true,
      unreadCount: 0,
      message: '全部通知已标记为已读',
    });
  } catch (error) {
    console.error('[notifications POST error]', error);
    return json({ error: '更新通知状态失败' }, { status: 500 });
  }
}
