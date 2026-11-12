import { getUserFromRequest } from '@/lib/services/auth';
import { serveCommunityMedia } from '@/lib/community/media';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export async function GET(request, { params }) {
  try { return await serveCommunityMedia((await params).id, await getUserFromRequest(request), request.headers.get('range') || ''); }
  catch { return new Response(null, { status: 503, headers: { 'Cache-Control': 'no-store' } }); }
}
