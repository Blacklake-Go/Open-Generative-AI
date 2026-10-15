import { getUserFromRequest, json } from '@/lib/services/auth';
import { createCommunityPost, listCommunityPosts } from '@/lib/services/community';
import { consumeRateLimit, guardMutation } from '@/lib/security/requestGuard';
import { publicErrorMessage } from '@/lib/security/publicError';


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
    const searchParams = request.nextUrl.searchParams;

    const category = searchParams.get('category') || 'all';
    const sort = searchParams.get('sort') || 'trending';
    const tag = searchParams.get('tag') || '';
    const q = searchParams.get('q') || '';
    const userId = searchParams.get('userId') || '';
    const featuredOnly = searchParams.get('featured') === 'true';
    const limit = parseInt(searchParams.get('limit') || '24', 10);
    const offset = parseInt(searchParams.get('offset') || '0', 10);

    const posts = await listCommunityPosts({
      category,
      sort,
      tag,
      q,
      userId,
      featuredOnly,
      viewerId: user?.id || null,
      limit,
      offset,
    });

    return json({
      posts,
      pagination: {
        limit,
        offset,
        hasMore: posts.length === limit,
      },
    });
  } catch (error) {
    console.error('[community list error]', error);
    return json({ error: publicErrorMessage(error, '获取社区作品失败') }, { status: 500 });
  }
}

export async function POST(request) {
  const user = await getUserFromRequest(request);
  const rl = await consumeRateLimit({
    scope: 'community.posts',
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
  if (!user) {
    return json({ error: '请登录后再分享作品到社区' }, { status: 401 });
  }

  const guarded = guardMutation(request, { maxBytes: 256 * 1024 });
  if (guarded) return guarded;

  try {
    const body = await request.json();
    const {
      creationId,
      title,
      description,
      mediaType,
      mediaUrl,
      coverUrl,
      prompt,
      negativePrompt,
      modelName,
      parameters,
      tags,
    } = body;

    if (!mediaUrl) {
      return json({ error: '缺少作品媒体资源地址' }, { status: 400 });
    }

    const post = await createCommunityPost({
      userId: user.id,
      creationId,
      title: title || '未命名作品',
      description,
      mediaType: mediaType || 'image',
      mediaUrl,
      coverUrl: coverUrl || mediaUrl,
      prompt,
      negativePrompt,
      modelName,
      parameters: parameters || {},
      tags: tags || [],
    });

    return json({ post }, { status: 201 });
  } catch (error) {
    console.error('[community create error]', error);
    return json({ error: publicErrorMessage(error, '发布到社区失败') }, { status: 500 });
  }
}
