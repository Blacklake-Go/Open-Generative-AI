import { NextResponse } from 'next/server';
import { getCanvasToolCatalog } from '@/lib/canvasTools/catalog';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const catalog = await getCanvasToolCatalog();
    if (!catalog.available) {
      return NextResponse.json(
        { success: false, code: catalog.reason, error: catalog.message },
        { status: 503, headers: { 'Cache-Control': 'no-store' } },
      );
    }
    return NextResponse.json(
      { success: true, ...catalog.spec },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (error) {
    console.error('[api/canvas-tools/spec]', error);
    return NextResponse.json(
      { success: false, code: 'SPEC_UNAVAILABLE', error: '画布工具规格读取失败，请稍后再试' },
      { status: 500, headers: { 'Cache-Control': 'no-store' } },
    );
  }
}
