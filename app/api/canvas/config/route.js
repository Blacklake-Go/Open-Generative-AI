import { NextResponse } from 'next/server';
import { getUserFromRequest } from '@/lib/admin/authz';
import { getCanvasAllowedModelIds, getCanvasModelConfig, listCanvasModelCandidates, projectCanvasConfig } from '@/lib/services/canvasModelConfig';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function isAllowedCanvasOrigin(origin) {
  if (!origin) return false;
  const lower = String(origin).trim().toLowerCase();
  return lower === 'https://www.supdance.com' || lower === 'https://supdance.com' || lower === 'https://canvas.supdance.com';
}

function getCorsHeaders(origin) {
  return {
    'Access-Control-Allow-Origin': origin || 'https://www.supdance.com',
    'Access-Control-Allow-Credentials': 'true',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'X-SupDance-Canvas, Content-Type',
    'Cache-Control': 'private, no-store',
    Vary: 'Origin',
  };
}

function allowed(request) {
  const origin = request.headers.get('origin');
  const canvasHeader = request.headers.get('x-supdance-canvas');
  return isAllowedCanvasOrigin(origin) && canvasHeader === 'infinite-canvas-v1';
}

export async function OPTIONS(request) {
  const origin = request.headers.get('origin');
  if (!isAllowedCanvasOrigin(origin)) return new NextResponse(null, { status: 403 });
  return new NextResponse(null, { status: 204, headers: getCorsHeaders(origin) });
}

export async function GET(request) {
  const origin = request.headers.get('origin');
  if (!allowed(request)) return NextResponse.json({ error: '禁止访问' }, { status: 403 });
  const corsHeaders = getCorsHeaders(origin);
  try {
    const user = await getUserFromRequest(request);
    if (!user) return NextResponse.json({ error: '请先登录 SupDance', code: 'UNAUTHENTICATED' }, { status: 401, headers: corsHeaders });
    const config = await getCanvasModelConfig();
    const [candidates, allowedModelIds] = await Promise.all([
      config ? listCanvasModelCandidates() : [],
      getCanvasAllowedModelIds({ userId: user.id }),
    ]);
    const projected = projectCanvasConfig(config, candidates);
    for (const capability of ['image', 'video', 'text', 'audio']) {
      projected.mountedModelIds[capability] = projected.mountedModelIds[capability].filter((id) => allowedModelIds.has(id));
      const defaultKey = `${capability}ModelId`;
      if (!allowedModelIds.has(projected.defaults[defaultKey])) projected.defaults[defaultKey] = '';
    }
    projected.configured = Object.values(projected.mountedModelIds).some((ids) => ids.length > 0);
    return NextResponse.json(projected, { headers: corsHeaders });
  } catch (error) {
    console.error('[api/canvas/config]', error);
    return NextResponse.json({ error: '画布配置暂时不可用' }, { status: 503, headers: corsHeaders });
  }
}
