import { getUserFromRequest, json } from '@/lib/services/auth';
import { listOwnCommunitySubmissions } from '@/lib/community/submissions';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export async function GET(request) {
  const user = await getUserFromRequest(request);
  if (!user) return json({ error: '请先登录' }, { status: 401 });
  return json(await listOwnCommunitySubmissions(user.id), { headers: { 'Cache-Control': 'private, no-store' } });
}
