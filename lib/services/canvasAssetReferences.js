const ASSET_REFERENCE = /^koyo-asset:([A-Za-z0-9_-]{8,160})$/;

export async function resolveCanvasAssetReferences(value, resolveAsset, { allowDataImage = false } = {}) {
  if (typeof resolveAsset !== 'function') throw new TypeError('An owned-asset resolver is required.');

  async function visit(item) {
    if (typeof item === 'string' && item.startsWith('koyo-asset:')) {
      const match = item.match(ASSET_REFERENCE);
      if (!match) throw Object.assign(new Error('Canvas reference asset ID is invalid.'), { code: 'CANVAS_ASSET_REFERENCE_INVALID' });
      const resolved = await resolveAsset(match[1]);
      if (typeof resolved !== 'string' || (!/^https:\/\//i.test(resolved)
        && !(allowDataImage && /^data:image\/(?:jpeg|png|webp|gif);base64,[A-Za-z0-9+/]+=*$/i.test(resolved)))) {
        throw Object.assign(new Error('Canvas reference asset is unavailable to the provider.'), { code: 'CANVAS_ASSET_URL_UNAVAILABLE' });
      }
      return resolved;
    }
    if (Array.isArray(item)) return Promise.all(item.map(visit));
    if (!item || typeof item !== 'object') return item;
    return Object.fromEntries(await Promise.all(Object.entries(item).map(async ([key, child]) => [key, await visit(child)])));
  }

  return visit(value);
}

export async function resolveCanvasOwnedAssetReferences(value, {
  userId,
  getUserAssetDownload,
  getAssetUrl,
  getAssetBytes,
  providerId = '',
} = {}) {
  if (!userId) throw Object.assign(new Error('Canvas asset owner is required.'), { code: 'CANVAS_ASSET_OWNER_REQUIRED' });
  if (typeof getUserAssetDownload !== 'function' || typeof getAssetUrl !== 'function') {
    throw new TypeError('Canvas asset download and URL resolvers are required.');
  }

  const inlineForArk = providerId === 'volcengine';
  if (inlineForArk && typeof getAssetBytes !== 'function') {
    throw new TypeError('An owned-asset byte reader is required for Volcengine.');
  }

  return resolveCanvasAssetReferences(value, async (assetId) => {
    const asset = await getUserAssetDownload(userId, assetId);
    if (!asset?.objectKey || asset.deletedAt) return null;
    const objectKey = String(asset.objectKey);
    if (
      objectKey !== objectKey.trim()
      || /^(?:https?:|data:|blob:)/i.test(objectKey)
      || objectKey.startsWith('/')
      || objectKey.includes('\\')
      || objectKey.split('/').some((part) => !part || part === '.' || part === '..')
      || /[\u0000-\u001f\u007f]/.test(objectKey)
    ) return null;
    if (inlineForArk) {
      const mimeType = String(asset.mimeType || '').toLowerCase();
      const sizeBytes = Number(asset.sizeBytes);
      if (!/^(?:image\/jpeg|image\/png|image\/webp|image\/gif)$/.test(mimeType)
        || !Number.isSafeInteger(sizeBytes) || sizeBytes < 1 || sizeBytes > 30 * 1024 * 1024) {
        throw Object.assign(new Error('Canvas reference image format or size is unsupported.'), { code: 'CANVAS_ASSET_URL_UNAVAILABLE' });
      }
      const stored = await getAssetBytes(objectKey);
      const body = stored?.body;
      if (!Buffer.isBuffer(body) || body.length !== sizeBytes) {
        throw Object.assign(new Error('Canvas reference image bytes are unavailable.'), { code: 'CANVAS_ASSET_URL_UNAVAILABLE' });
      }
      return `data:${mimeType};base64,${body.toString('base64')}`;
    }
    const assetUrl = await getAssetUrl({ objectKey, visibility: asset.visibility || 'private' });
    if (typeof assetUrl === 'string' && assetUrl.startsWith('/')) {
      const origin = (process.env.PUBLIC_APP_URL || 'https://www.supdance.com').replace(/\/+$/, '');
      return `${origin}${assetUrl}`;
    }
    return assetUrl;
  }, { allowDataImage: inlineForArk });
}
