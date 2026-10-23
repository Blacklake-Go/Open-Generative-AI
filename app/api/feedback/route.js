import { getUserFromRequest, json } from '@/lib/services/auth';
import { submitFeedback, listMyFeedback } from '@/lib/services/feedback';
import { FEEDBACK_ATTACHMENT_MAX_TOTAL_BYTES } from '@/lib/feedback/attachments';
import { guardMutation, consumeRateLimit, rateLimitResponse } from '@/lib/security/requestGuard';
import { publicErrorMessage } from '@/lib/security/publicError';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MULTIPART_OVERHEAD_BYTES = 2 * 1024 * 1024;

function collectFiles(formData) {
  const candidates = [
    ...formData.getAll('attachments'),
    ...formData.getAll('files'),
    formData.get('file'),
  ];
  return candidates.filter(
    (item) => item && typeof item === 'object' && typeof item.arrayBuffer === 'function' && Number(item.size) > 0,
  );
}

export async function GET(request) {
  const user = await getUserFromRequest(request);
  if (!user) return json({ error: '请先登录' }, { status: 401 });

  try {
    return json({ items: await listMyFeedback(user.id, { limit: 20 }) });
  } catch (error) {
    console.error('[api/feedback GET]', error);
    return json({ error: publicErrorMessage(error, '获取提交记录失败') }, { status: 500 });
  }
}

export async function POST(request) {
  const user = await getUserFromRequest(request);
  if (!user) return json({ error: '请先登录后再提交' }, { status: 401 });

  const isMultipart = String(request.headers.get('content-type') || '').includes('multipart/form-data');
  const guarded = guardMutation(request, {
    maxBytes: isMultipart ? FEEDBACK_ATTACHMENT_MAX_TOTAL_BYTES + MULTIPART_OVERHEAD_BYTES : 64 * 1024,
  });
  if (guarded) return guarded;

  try {
    const limited = await consumeRateLimit({
      scope: 'feedback_submit',
      subject: user.id,
      limit: 10,
      windowMs: 3600 * 1000,
    });
    if (!limited.allowed) return rateLimitResponse(limited);

    let input;
    let files = [];

    if (isMultipart) {
      const formData = await request.formData();
      input = {
        kind: formData.get('kind'),
        title: formData.get('title'),
        pageUrl: formData.get('pageUrl') || formData.get('page_url'),
        githubUrl: formData.get('githubUrl') || formData.get('github_url'),
        detail: formData.get('detail'),
      };
      files = collectFiles(formData);
    } else {
      const body = await request.json();
      input = {
        kind: body.kind,
        title: body.title,
        pageUrl: body.pageUrl,
        githubUrl: body.githubUrl,
        detail: body.detail,
      };
    }

    const result = await submitFeedback({ userId: user.id, ...input, files });
    if (result.error) {
      return json(
        { error: result.error, code: result.code || 'FEEDBACK_INVALID' },
        { status: result.status || 400 },
      );
    }

    return json({
      ...result,
      message: '提交成功，审核通过后硬币会自动到账',
    });
  } catch (error) {
    console.error('[api/feedback POST]', error);
    return json({ error: publicErrorMessage(error, '提交失败，请稍后重试') }, { status: 400 });
  }
}
