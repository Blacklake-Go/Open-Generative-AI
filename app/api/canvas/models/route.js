import { getUserFromRequest } from '@/lib/services/auth';
import { listActiveModels } from '@/lib/services/models';
import { getCanvasAllowedModelIds } from '@/lib/services/canvasModelConfig';
import { isCanvasServerCapabilityEnabled } from '@/lib/canvas/capabilityPolicy';
import { resolveBrand } from '@/lib/modelCenter/brandDictionary';
import { canvasJson, canvasOriginGuard, canvasPreflight } from '@/lib/canvas/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function parseMetadata(value) {
  if (value && typeof value === 'object' && !Array.isArray(value)) return value;
  try { return JSON.parse(value || '{}'); } catch { return {}; }
}

function publicSchema(value, depth = 0) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || depth > 5) return null;
  const types = new Set(['object', 'array', 'string', 'number', 'integer', 'boolean']);
  const schema = {};
  if (types.has(String(value.type || ''))) schema.type = value.type;
  if (typeof value.title === 'string') schema.title = value.title.slice(0, 120);
  if (typeof value.description === 'string') schema.description = value.description.slice(0, 240);
  if (Array.isArray(value.required)) schema.required = value.required.filter((item) => typeof item === 'string').slice(0, 40);
  if (Array.isArray(value.enum)) schema.enum = value.enum.filter((item) => ['string', 'number', 'boolean'].includes(typeof item)).slice(0, 40);
  for (const key of ['minimum', 'maximum', 'minLength', 'maxLength', 'minItems', 'maxItems']) {
    if (Number.isFinite(Number(value[key]))) schema[key] = Number(value[key]);
  }
  if (value.items && typeof value.items === 'object') schema.items = publicSchema(value.items, depth + 1);
  if (value.properties && typeof value.properties === 'object' && !Array.isArray(value.properties)) {
    schema.properties = Object.fromEntries(Object.entries(value.properties).slice(0, 40).map(([key, child]) => [key.slice(0, 80), publicSchema(child, depth + 1)]).filter(([, child]) => child));
  }
  return schema;
}

function publicModel(model) {
  const capability = String(model.type || '').toLowerCase();
  const metadata = parseMetadata(model.metadata_json);
  const array = (...keys) => {
    const value = keys.map((key) => metadata[key]).find(Array.isArray);
    return value ? value.filter((entry) => ['string', 'number'].includes(typeof entry)).slice(0, 40) : [];
  };
  const boolean = (...keys) => {
    const value = keys.map((key) => metadata[key]).find((entry) => typeof entry === 'boolean');
    return typeof value === 'boolean' ? value : false;
  };
  const brand = resolveBrand({
    id: model.id,
    name: model.display_name || model.name,
    capabilities: model.capabilities || metadata,
    brand: model.brand || metadata.brand,
  });
  return {
    id: model.id,
    slug: model.slug || model.id,
    name: model.display_name || model.name,
    capability,
    available: true,
    brandId: brand.id,
    brandName: brand.shortName,
    brandBadge: brand.badge,
    brandLogoUrl: brand.logoUrl,
    creditsPrice: Number.isFinite(Number(model.credits_price)) ? Number(model.credits_price) : null,
    pricingType: model.pricing_type || 'formula',
    inputSchema: publicSchema(metadata.input_schema || metadata.inputSchema),
    outputSchema: publicSchema(metadata.output_schema || metadata.outputSchema),
    supportedRatios: array('supported_ratios', 'supportedRatios', 'aspect_ratios'),
    supportedResolution: array('supported_resolution', 'supportedResolution', 'resolutions'),
    supportedDuration: array('supported_duration', 'supportedDuration', 'durations'),
    supportsReference: boolean('supports_reference', 'supportsReference', 'reference_image'),
    supportsEdit: boolean('supports_edit', 'supportsEdit', 'image_edit'),
    supportsAudio: boolean('supports_audio', 'supportsAudio', 'audio_output'),
  };
}

export function OPTIONS(request) {
  return canvasPreflight(request, 'GET, OPTIONS');
}

export async function GET(request) {
  const blocked = canvasOriginGuard(request);
  if (blocked) return blocked;
  const user = await getUserFromRequest(request);
  if (!user) return canvasJson(request, { error: '请先登录 SupDance', code: 'UNAUTHENTICATED' }, { status: 401 });
  try {
    const [models, allowed] = await Promise.all([
      listActiveModels(),
      getCanvasAllowedModelIds({ userId: user.id }),
    ]);
    return canvasJson(request, {
      models: models
        .map(publicModel)
        .filter((model) => isCanvasServerCapabilityEnabled(model.capability) && allowed.has(model.id)),
    });
  } catch (error) {
    console.error('[api/canvas/models]', { code: error?.code || 'MODEL_CATALOG_FAILED' });
    return canvasJson(request, { error: '读取模型目录失败', code: 'MODEL_CATALOG_FAILED' }, { status: 503 });
  }
}
