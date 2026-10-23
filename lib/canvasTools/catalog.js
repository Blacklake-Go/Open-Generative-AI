import 'server-only';

import { listActiveModels } from '../services/models.js';
import { isSelectablePublicModel, serializePublicGenerationCapabilities } from '../modelCenter/publicDirectory.js';
import { buildCanvasToolSpec } from './spec.js';

const CACHE_TTL_MS = 30 * 1000;

let cachedCatalog = null;
let cachedAt = 0;
let pending = null;

function scoreCandidate({ model, capability }) {
  let score = 0;
  if (model.id === 'seedream-4.5') score += 16;
  if (String(model.provider || '').toLowerCase() === 'volcengine') score += 8;
  const resolutions = capability.resolutions || [];
  if (resolutions.includes('2k')) score += 2;
  if (resolutions.includes('4k')) score += 2;
  return score;
}

function pickImageToImageModel(models) {
  let best = null;
  for (const model of models) {
    if (!isSelectablePublicModel(model)) continue;
    if ((model.category || model.type) !== 'image') continue;
    const capabilities = serializePublicGenerationCapabilities(model.generation_capabilities);
    const capability = capabilities.find((item) => item.taskType === 'i2i');
    if (!capability) continue;
    const score = scoreCandidate({ model, capability });
    if (!best || score > best.score) {
      best = { model, capability, score };
    }
  }
  return best;
}

async function loadCatalog() {
  const models = await listActiveModels();
  const picked = pickImageToImageModel(models);
  if (!picked) {
    return {
      available: false,
      reason: 'NO_IMAGE_TO_IMAGE_MODEL',
      message: '当前没有可用的图生图模型，画布工具暂时无法生成。',
    };
  }
  return {
    available: true,
    model: picked.model,
    capability: picked.capability,
    spec: buildCanvasToolSpec({ model: picked.model, capabilities: picked.capability }),
  };
}

export async function getCanvasToolCatalog({ maxAgeMs = CACHE_TTL_MS } = {}) {
  if (cachedCatalog && Date.now() - cachedAt < maxAgeMs) return cachedCatalog;
  if (!pending) {
    pending = loadCatalog()
      .then((catalog) => {
        cachedCatalog = catalog;
        cachedAt = Date.now();
        return catalog;
      })
      .finally(() => {
        pending = null;
      });
  }
  return pending;
}
