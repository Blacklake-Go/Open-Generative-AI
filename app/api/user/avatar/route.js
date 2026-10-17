import path from 'node:path';
import { getUserFromRequest, json } from '@/lib/services/auth';
import { execute, queryOne } from '@/lib/application/dataAccess.js';
import { consumeRateLimit, guardMutation, rateLimitResponse } from '@/lib/security/requestGuard';
import { getAssetUrl, getStorageAdapter, ingestBuffer } from '@/lib/storage/storageService';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MAX_AVATAR_SIZE = 5 * 1024 * 1024; // 5MB

const ALLOWED_MIME_TYPES = new Set([
  'image/png',
  'image/jpeg',
  'image/jpg',
  'image/webp',
  'image/gif',
]);

const ALLOWED_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg', '.webp', '.gif']);

function isValidImageMagicNumber(buffer, ext) {
  if (buffer.length < 4) return false;
  const hex = buffer.subarray(0, 4).toString('hex').toLowerCase();

  if (ext === '.png') {
    return hex === '89504e47';
  }
  if (ext === '.jpg' || ext === '.jpeg') {
    return hex.startsWith('ffd8ff');
  }
  if (ext === '.webp') {
    const riff = buffer.subarray(0, 4).toString('ascii');
    const webp = buffer.length >= 12 ? buffer.subarray(8, 12).toString('ascii') : '';
    return riff === 'RIFF' && webp === 'WEBP';
  }
  if (ext === '.gif') {
    const header = buffer.subarray(0, 6).toString('ascii');
    return header === 'GIF87a' || header === 'GIF89a';
  }
  return false;
}

export async function POST(request) {
  const user = await getUserFromRequest(request);
  if (!user) {
    return json({ error: '请先登录后再上传头像' }, { status: 401 });
  }

  const guarded = guardMutation(request, { maxBytes: 6 * 1024 * 1024 });
  if (guarded) return guarded;

  try {
    const limit = await consumeRateLimit({ scope: 'user_avatar_upload', subject: user.id, limit: 10, windowMs: 60 * 60 * 1000 });
    if (!limit.allowed) return rateLimitResponse(limit);

    const formData = await request.formData();
    const file = formData.get('file') || formData.get('avatar');

    if (!file || typeof file !== 'object' || typeof file.arrayBuffer !== 'function') {
      return json({ error: '未检测到有效的图片文件' }, { status: 400 });
    }

    if (file.size > MAX_AVATAR_SIZE) {
      return json({ error: '头像图片大小不能超过 5MB' }, { status: 400 });
    }

    const originalName = String(file.name || 'avatar.png');
    let ext = path.extname(originalName).toLowerCase();
    if (!ext || !ALLOWED_EXTENSIONS.has(ext)) {
      ext = file.type === 'image/webp' ? '.webp' : file.type === 'image/jpeg' ? '.jpg' : '.png';
    }

    const mime = String(file.type || '').toLowerCase();
    if (mime && !ALLOWED_MIME_TYPES.has(mime)) {
      return json({ error: `不支持的图片格式: ${mime}` }, { status: 400 });
    }

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    if (!isValidImageMagicNumber(buffer, ext)) {
      return json({ error: '图片文件已损坏或非真实图片内容' }, { status: 400 });
    }

    const previous = await queryOne('SELECT avatar_object_key FROM users WHERE id = $1', [user.id]);
    const stored = await ingestBuffer({
      body: buffer,
      userId: user.id,
      type: 'avatar',
      filename: `avatar${ext}`,
      contentType: mime || `image/${ext.slice(1)}`,
      sourceProvider: 'user_upload',
    });
    const publicUrl = '/api/user/avatar';

    // 只保存稳定的同源资源入口与 object key，不保存 COS URL 或签名。
    await execute(
      'UPDATE users SET avatar_url = $1, avatar_object_key = $2, updated_at = NOW() WHERE id = $3',
      [publicUrl, stored.objectKey, user.id]
    );
    if (previous?.avatar_object_key) await getStorageAdapter().then((adapter) => adapter.delete({ key: previous.avatar_object_key })).catch(() => {});

    const updatedUser = await queryOne(
      'SELECT id, user_number, email, phone, display_name, avatar_url, role, credits, status, locale FROM users WHERE id = $1',
      [user.id]
    );

    return json({
      success: true,
      avatarUrl: publicUrl,
      user: updatedUser,
      message: '头像更新成功',
    });
  } catch (err) {
    console.error('[user/avatar upload error]', err);
    return json({ error: '头像上传处理异常，请稍后重试' }, { status: 500 });
  }
}

export async function GET(request) {
  const reqUrl = new URL(request.url);
  const targetId = reqUrl.searchParams.get('userId') || reqUrl.searchParams.get('uid');
  let userRow = null;

  if (targetId) {
    userRow = await queryOne('SELECT id, avatar_object_key, avatar_url FROM users WHERE id = $1 OR user_number = $1', [targetId]);
  } else {
    const user = await getUserFromRequest(request);
    if (user) {
      userRow = await queryOne('SELECT id, avatar_object_key, avatar_url FROM users WHERE id = $1', [user.id]);
    }
  }

  if (userRow?.avatar_object_key) {
    const assetUrl = await getAssetUrl({ objectKey: userRow.avatar_object_key, visibility: 'private' });
    if (assetUrl) {
      const redirectLocation = /^https?:\/\//i.test(assetUrl)
        ? assetUrl
        : (assetUrl.startsWith('/') ? assetUrl : `/${assetUrl}`);
      return new Response(null, {
        status: 307,
        headers: { Location: redirectLocation },
      });
    }
  }

  if (userRow?.avatar_url && !userRow.avatar_url.startsWith('/api/user/avatar')) {
    if (/^https?:\/\//i.test(userRow.avatar_url) || /^\//.test(userRow.avatar_url)) {
      return new Response(null, {
        status: 307,
        headers: { Location: userRow.avatar_url },
      });
    }
  }

  // 杜绝向 <img> 请求返回 401/404 JSON 导致前端图片破碎，统一平滑重定向至默认 SVG 头像
  return new Response(null, {
    status: 307,
    headers: { Location: '/assets/avatars/default-01.svg' },
  });
}

export async function DELETE(request) {
  const user = await getUserFromRequest(request);
  if (!user) {
    return json({ error: '请先登录' }, { status: 401 });
  }

  const guarded = guardMutation(request, { maxBytes: 1024 });
  if (guarded) return guarded;

  try {
    const limit = await consumeRateLimit({ scope: 'user_avatar_delete', subject: user.id, limit: 20, windowMs: 60 * 60 * 1000 });
    if (!limit.allowed) return rateLimitResponse(limit);

    const previous = await queryOne('SELECT avatar_object_key FROM users WHERE id = $1', [user.id]);
    await execute(
      'UPDATE users SET avatar_url = NULL, avatar_object_key = NULL, updated_at = NOW() WHERE id = $1',
      [user.id]
    );
    if (previous?.avatar_object_key) await getStorageAdapter().then((adapter) => adapter.delete({ key: previous.avatar_object_key })).catch(() => {});

    const updatedUser = await queryOne(
      'SELECT id, user_number, email, phone, display_name, avatar_url, role, credits, status, locale FROM users WHERE id = $1',
      [user.id]
    );

    return json({
      success: true,
      avatarUrl: null,
      user: updatedUser,
      message: '已恢复系统默认头像',
    });
  } catch (err) {
    console.error('[user/avatar delete error]', err);
    return json({ error: '重置头像失败' }, { status: 500 });
  }
}
