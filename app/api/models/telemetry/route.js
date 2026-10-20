import { NextResponse } from 'next/server';
import { getModelTelemetryOverview } from '@/lib/services/modelTelemetry';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const RANGES = new Set(['24h', '7d', '30d']);

export async function GET(request) {
  const requested = request.nextUrl.searchParams.get('range') || '24h';
  const timeRange = RANGES.has(requested) ? requested : '24h';

  try {
    const data = await getModelTelemetryOverview({ timeRange, limit: 24 });
    if (data?.error) {
      return NextResponse.json(
        { error: '模型遥测暂不可用' },
        { status: 503, headers: { 'Cache-Control': 'no-store' } }
      );
    }

    const models = (data.topModels || [])
      .filter((item) => item.is_visible !== false)
      .map((item) => ({
        id: item.model_id,
        name: item.model_name,
        category: item.category,
        totalCalls: Number(item.total_calls || 0),
        successRate: Number(item.success_rate || 0),
        avgDurationMs: Number(item.avg_duration_ms || 0),
        p90DurationMs: Number(item.p90_duration_ms || 0),
      }));

    const kpi = {
      totalCalls: Number(data.kpi?.totalCalls || 0),
      successRate: Number(data.kpi?.successRate || 0),
      avgDurationMs: Number(data.kpi?.avgDurationMs || 0),
      p50DurationMs: Number(data.kpi?.p50DurationMs || 0),
      p90DurationMs: Number(data.kpi?.p90DurationMs || 0),
      activeModelsCount: Number(data.kpi?.activeModelsCount || 0),
    };

    return NextResponse.json(
      {
        range: data.timeRange || timeRange,
        kpi,
        models,
      },
      {
        headers: {
          'Cache-Control': 'public, max-age=15, stale-while-revalidate=45',
        },
      }
    );
  } catch (error) {
    console.error('[public/models/telemetry] failed to load telemetry:', error);
    return NextResponse.json(
      { error: '模型遥测暂不可用' },
      { status: 503, headers: { 'Cache-Control': 'no-store' } }
    );
  }
}
