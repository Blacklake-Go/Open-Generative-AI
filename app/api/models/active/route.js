import { NextResponse } from 'next/server';
import { listActiveModels } from '@/lib/services/models';
import { isSelectablePublicModel, serializePublicGenerationCapabilities } from '@/lib/modelCenter/publicDirectory';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

let cachedModelsPayload = null;
let lastModelsCacheTime = 0;
const MODELS_CACHE_TTL_MS = 5 * 1000;

export function invalidateActiveModelsCache() {
  cachedModelsPayload = null;
  lastModelsCacheTime = 0;
}

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const forceRefresh = searchParams.get('refresh') === 'true' || searchParams.get('nocache') === '1';

  const now = Date.now();
  if (!forceRefresh && cachedModelsPayload && now - lastModelsCacheTime < MODELS_CACHE_TTL_MS) {
    return NextResponse.json(cachedModelsPayload, {
      headers: {
        'Cache-Control': 'no-store',
      },
    });
  }

  try {
    const models = await listActiveModels();
    cachedModelsPayload = {
      success: true,
      models: models.filter(isSelectablePublicModel).map((m) => ({
        id: m.id,
        name: m.name,
        displayName: m.display_name || m.name,
        description: m.description || '',
        badge: m.badge || (typeof m.metadata_json === 'object' ? m.metadata_json?.badge : null) || null,
        category: m.category || m.type || 'image',
        subType: m.sub_type || (typeof m.metadata_json === 'object' ? m.metadata_json?.sub_type : null) || null,
        type: m.type || m.category,
        tier: m.tier || 'core',
        provider: m.provider,
        creditsPrice: m.credits_price,
        pricingType: m.pricing_type || null,
        sortOrder: m.sort_order ?? 0,
        isActive: Boolean(m.is_active),
        isPinned: Boolean(m.is_pinned),
        isFeatured: Boolean(m.is_featured),
        isVisible: Boolean(m.is_visible !== false),
        autoRouteEligible: Boolean(m.auto_route_eligible),
        hasWorkingRoute: Boolean(m.hasWorkingRoute),
        generationCapabilities: serializePublicGenerationCapabilities(m.generation_capabilities),
      })),
    };
    lastModelsCacheTime = now;

    return NextResponse.json(cachedModelsPayload, {
      headers: {
        'Cache-Control': 'no-store',
      },
    });
  } catch (error) {
    console.error('[api/models/active]', error);
    return NextResponse.json({ error: '获取模型列表失败' }, { status: 500 });
  }
}
