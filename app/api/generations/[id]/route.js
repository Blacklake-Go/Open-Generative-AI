import { getUserFromRequest, json } from '@/lib/services/auth';
import { getUserCreation } from '@/lib/services/generations';
import { publicErrorMessage } from '@/lib/security/publicError';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request, context) {
  const user = await getUserFromRequest(request);
  if (!user) return json({ error: '请先登录' }, { status: 401 });

  const { id } = await context.params;
  if (!id) return json({ error: '缺少任务 ID' }, { status: 400 });

  try {
    const creation = await getUserCreation(user.id, id);
    if (!creation) return json({ error: '生成任务不存在或无权查看' }, { status: 404 });

    const isSuccess = ['succeeded', 'completed', 'success'].includes(creation.status);
    const isFailed = ['failed', 'error', 'cancelled', 'canceled'].includes(creation.status);

    return json({
      id: creation.id,
      request_id: creation.id,
      status: isSuccess ? 'succeeded' : isFailed ? 'failed' : 'processing',
      url: creation.result_url || undefined,
      outputs: creation.result_url ? [creation.result_url] : [],
      error: creation.error_reason || undefined,
      credit_cost: creation.credit_cost,
      created_at: creation.created_at,
      completed_at: creation.completed_at,
    });
  } catch (error) {
    console.error('[api/generations/[id]]', error);
    return json({ error: publicErrorMessage(error, '获取生成任务失败') }, { status: 500 });
  }
}
