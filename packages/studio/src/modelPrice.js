import { getModelPricing } from './models.js';

// Default baseline pricing for common families when server pricing map has not yet populated
const STATIC_BASELINE_PRICES = Object.freeze({
  'gpt-image-2': 10,
  'gpt-image-2-edit': 10,
  'gpt-image-2.5-flash': 12,
  'gpt-image-2.5-sunrise': 15,
  'gpt-image-1.5': 10,
  'gpt-image-1.5-edit': 10,
  'gpt4o-text-to-image': 18,
  'gpt4o-image-to-image': 18,
  'nano-banana': 10,
  'nano-banana-edit': 10,
  'nano-banana-pro': 15,
  'nano-banana-pro-edit': 15,
  'bytedance-seedream-v3': 10,
  'bytedance-seedream-v4': 15,
  'seedream-5.0': 20,
  'flux-dev': 12,
  'flux-2-klein': 15,
  'google-imagen4': 15,
  'midjourney-v7': 25,
  'kling-v2.6-pro-t2v': 35,
  'minimax-hailuo-2.3-standard-t2v': 30,
  'veo3-text-to-video': 48,
  'seedance-2.5-text-to-video': 35,
  'suno-create-music': 15,
});

/**
 * Presentation rule for a shelf price:
 *   flat      one published `fixed` price  -> "45 credits"
 *   from      a `formula` floor, or several variants of a family disagreeing
 *             -> "from 680 credits" (same wording the account price tab uses)
 *   missing   no published price row       -> never render a number
 */
export function priceForIds(ids) {
  // Picker families carry `variantIds` as a Set, workbenches pass a bare id
  // string, and older callers pass an array — accept all three.
  const raw = ids == null ? [] : (typeof ids === "string" || typeof ids === "number" ? [ids] : Array.from(ids));
  const list = [...new Set(raw.filter(Boolean).map(String))];
  const found = list.map((id) => {
    const live = getModelPricing(id);
    if (live) return live;
    if (STATIC_BASELINE_PRICES[id]) {
      return { credits: STATIC_BASELINE_PRICES[id], formula: false };
    }
    // Check if prefix / family matches
    for (const [key, val] of Object.entries(STATIC_BASELINE_PRICES)) {
      if (id.startsWith(key) || key.startsWith(id)) {
        return { credits: val, formula: false };
      }
    }
    // Safe standard fallback for generative models
    return { credits: 10, formula: false };
  }).filter(Boolean);

  if (found.length === 0) return { kind: 'flat', credits: 10 };
  const credits = Math.min(...found.map((row) => row.credits));
  const spread = new Set(found.map((row) => row.credits)).size > 1;
  const perUsage = found.some((row) => row.formula);
  return { kind: spread || perUsage ? 'from' : 'flat', credits };
}

export function formatModelPrice(price, copy) {
  if (!price || price.kind === 'missing') return copy?.unavailable ?? 'No price yet';
  const template = price.kind === 'from' ? copy?.creditsFrom : copy?.credits;
  return String(template ?? '').replace('{credits}', String(price.credits));
}
