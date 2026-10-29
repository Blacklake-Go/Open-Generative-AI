import crypto from 'node:crypto';
import { sanitizePublicSchema, buildPublicParameterSchema, modelModality } from '../modelCenter/capabilitySchema.js';
import { resolveBrand } from '../modelCenter/brandDictionary.js';
import { serializePublicGenerationCapabilities } from '../modelCenter/publicDirectory.js';
import { evaluateModelAvailability } from '../modelCenter/availability.js';

export const CANVAS_MODEL_SCHEMA_VERSION = 1;

function parseMetadata(value) {
  if (value && typeof value === 'object' && !Array.isArray(value)) return value;
  try { return JSON.parse(value || '{}'); } catch { return {}; }
}

export function publicCanvasModel(model, {schemaVersion = 1} = {}) {
  const capability = schemaVersion >= 2 ? modelModality(model) : String(model.type || '').toLowerCase();
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
  const availability = evaluateModelAvailability(model);
  const descriptor = {
    id: model.id,
    slug: model.slug || model.id,
    name: model.display_name || model.name,
    capability,
    available: availability.available,
    schemaVersion,
    availability: { state: availability.state, reasonCodes: availability.reasonCodes, reasons: availability.reasons },
    brandId: brand.id,
    brandName: brand.shortName,
    brandBadge: brand.badge,
    brandLogoUrl: brand.logoUrl,
    creditsPrice: Number.isFinite(Number(model.credits_price)) ? Number(model.credits_price) : null,
    pricingType: model.pricing_type || 'formula',
    inputSchema: schemaVersion >= 2 ? buildPublicParameterSchema(serializePublicGenerationCapabilities(model.generation_capabilities, {includeVariants:schemaVersion >= 2}), metadata.input_schema || metadata.inputSchema) : sanitizePublicSchema(metadata.input_schema || metadata.inputSchema),
    outputSchema: sanitizePublicSchema(metadata.output_schema || metadata.outputSchema),
    supportedRatios: array('supported_ratios', 'supportedRatios', 'aspect_ratios'),
    supportedResolution: array('supported_resolution', 'supportedResolution', 'resolutions'),
    supportedDuration: array('supported_duration', 'supportedDuration', 'durations'),
    supportsReference: boolean('supports_reference', 'supportsReference', 'reference_image'),
    supportsEdit: boolean('supports_edit', 'supportsEdit', 'image_edit'),
    supportsAudio: boolean('supports_audio', 'supportsAudio', 'audio_output'),
    generationCapabilities: serializePublicGenerationCapabilities(model.generation_capabilities, {includeVariants:schemaVersion >= 2}),
  };
  if(schemaVersion>=2){
    descriptor.supportsReference=descriptor.generationCapabilities.some(capability=>capability.inputTypes.some(type=>['image','video','audio'].includes(type)));
    descriptor.supportsEdit=descriptor.generationCapabilities.some(capability=>['i2i','v2v'].includes(capability.taskType));
    descriptor.supportsAudio=descriptor.generationCapabilities.some(capability=>capability.outputTypes.includes('audio'));
  }
  descriptor.capabilityVersion = crypto.createHash('sha256').update(JSON.stringify({ capability, inputSchema: descriptor.inputSchema, outputSchema: descriptor.outputSchema, generationCapabilities: descriptor.generationCapabilities, supportedRatios: descriptor.supportedRatios, supportedResolution: descriptor.supportedResolution, supportedDuration: descriptor.supportedDuration, supportsReference: descriptor.supportsReference, supportsEdit: descriptor.supportsEdit, supportsAudio: descriptor.supportsAudio })).digest('hex');
  return descriptor;
}


export function canvasCatalogVersion(models) {
  return crypto.createHash('sha256').update(JSON.stringify(models)).digest('hex');
}
