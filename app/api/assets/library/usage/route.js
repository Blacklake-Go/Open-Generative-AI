import { getUserFromRequest, json } from '@/lib/services/auth';
import { getLibraryUsage } from '@/lib/services/assetLibrary';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request) {
  const user = await getUserFromRequest(request);
  if (!user) return json({ error: '请先登录' }, { status: 401 });

  try {
    return json(await getLibraryUsage(user.id));
  } catch (error) {
    console.error('[GET /api/assets/library/usage]', error);
    return json({ error: '读取存储容量失败' }, { status: 500 });
  }
}
