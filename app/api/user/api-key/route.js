import crypto from 'crypto';
import { getUserFromRequest, json } from '@/lib/services/auth';
import { queryOne, execute } from '@/lib/application/dataAccess.js';
import { consumeRateLimit, guardMutation } from '@/lib/security/requestGuard';


/** 限流主体：登录态按用户，其余按客户端 IP；XFF 由 nginx 单向写入。 */
function ipOf(request) {
  return request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
    || request.headers.get('x-real-ip')
    || 'unknown';
}

export const runtime = 'nodejs';

function generateSecureKey() {
  return `sk-koyo-live-${crypto.randomBytes(20).toString('hex')}`;
}

export async function GET(request) {
  const user = await getUserFromRequest(request);
  if (!user) return json({ error: '请先登录' }, { status: 401 });

  try {
    const row = await queryOne('SELECT social_links FROM users WHERE id = $1', [user.id]);
    const links = row?.social_links && typeof row.social_links === 'object' ? row.social_links : {};
    
    let keyInfo = links.agent_api_key;
    if (!keyInfo || !keyInfo.key) {
      const initialKey = generateSecureKey();
      keyInfo = {
        key: initialKey,
        createdAt: new Date().toISOString(),
      };
      const updatedLinks = {
        ...links,
        agent_api_key: keyInfo,
      };
      await execute('UPDATE users SET social_links = $1, updated_at = NOW() WHERE id = $2', [
        JSON.stringify(updatedLinks),
        user.id,
      ]);
    }

    return json({
      apiKey: keyInfo.key,
      createdAt: keyInfo.createdAt,
    });
  } catch (error) {
    console.error('[api/user/api-key GET]', error);
    return json({ error: '获取 API 密钥失败' }, { status: 500 });
  }
}

export async function POST(request) {
  const user = await getUserFromRequest(request);
  const rl = await consumeRateLimit({
    scope: 'user.api-key',
    subject: user?.id || ipOf(request),
    limit: 20,
    windowMs: 60_000,
  });
  if (!rl.allowed) {
    return json({ error: '请求过于频繁，请稍后再试' }, {
      status: 429,
      headers: { 'Retry-After': String(rl.retryAfterSeconds) },
    });
  }
  if (!user) return json({ error: '请先登录' }, { status: 401 });
  const guarded = guardMutation(request, { maxBytes: 16 * 1024 });
  if (guarded) return guarded;

  try {
    const newKey = generateSecureKey();
    const keyInfo = {
      key: newKey,
      createdAt: new Date().toISOString(),
    };

    const row = await queryOne('SELECT social_links FROM users WHERE id = $1', [user.id]);
    const currentLinks = row?.social_links && typeof row.social_links === 'object' ? row.social_links : {};
    const updatedLinks = {
      ...currentLinks,
      agent_api_key: keyInfo,
    };

    await execute('UPDATE users SET social_links = $1, updated_at = NOW() WHERE id = $2', [
      JSON.stringify(updatedLinks),
      user.id,
    ]);

    return json({
      success: true,
      apiKey: newKey,
      createdAt: keyInfo.createdAt,
      message: 'API 密钥已成功重新生成并已保存',
    });
  } catch (error) {
    console.error('[api/user/api-key POST]', error);
    return json({ error: '重新生成 API 密钥失败' }, { status: 500 });
  }
}
