import {filterModelsForPublicationAccess} from '@/lib/services/modelPublicationAccess';
import {getUserFromRequest} from '@/lib/services/auth';
import { publicCanvasModel } from '@/lib/canvas/modelDescriptor';
import { canvasContractVersion } from '@/lib/modelCenter/capabilitySchema';
import { NextResponse } from 'next/server';
import { listActiveModels } from '@/lib/services/models';
import { isSelectablePublicModel, serializePublicGenerationCapabilities } from '@/lib/modelCenter/publicDirectory';
import { publicErrorMessage } from '@/lib/security/publicError';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const cachedPayloads = new Map();
const MODELS_CACHE_TTL_MS = 5 * 1000;

export function invalidateActiveModelsCache() {
  cachedPayloads.clear();
}

async function loadActiveModels(forceRefresh, now) {
  const cached = cachedPayloads.get('catalog');
  if (!forceRefresh && cached && now - cached.time < MODELS_CACHE_TTL_MS) return cached.models;
  const models = await listActiveModels();
  cachedPayloads.set('catalog', { models, time: now });
  return models;
}

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  let schemaVersion;
  try { schemaVersion = canvasContractVersion(request); }
  catch (error) { return NextResponse.json({error:publicErrorMessage(error),code:error.code},{status:409}); }
  const forceRefresh = searchParams.get('refresh') === 'true' || searchParams.get('nocache') === '1';

  const now = Date.now();
  try {
    const models = await loadActiveModels(forceRefresh, now);
    const user=await getUserFromRequest(request);
    const visible=await filterModelsForPublicationAccess(models.filter(isSelectablePublicModel),{userId:user?.id,site:'main'});
    const payload = {
      success: true,
      schemaVersion,
      launchScope: { restricted: false, categories: [] },
      models: visible.map((m) => ({
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
        ...(schemaVersion === 2 ? publicCanvasModel(m,{schemaVersion:2}) : {}),
        generationCapabilities: serializePublicGenerationCapabilities(m.generation_capabilities,{includeVariants:schemaVersion===2}),
      })),
    };
    return NextResponse.json(payload, {
      headers: {
        'Cache-Control': 'no-store',
        'Vary': 'Cookie',
      },
    });
  } catch (error) {
    console.error('[api/models/active]', error);
    return NextResponse.json({ error: '获取模型列表失败' }, { status: 500 });
  }
}
