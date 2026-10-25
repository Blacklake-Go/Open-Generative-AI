import crypto from 'node:crypto';

export function createCanvasShareToken() {
  return crypto.randomBytes(32).toString('base64url');
}

export function hashCanvasShareToken(token) {
  return crypto.createHash('sha256').update(String(token)).digest('hex');
}

export function isCanvasShareToken(token) {
  return typeof token === 'string' && /^[A-Za-z0-9_-]{43}$/.test(token);
}

export function collectCanvasShareAssetIds(snapshot) {
  const assetIds = new Set();
  const visit = (value) => {
    if (Array.isArray(value)) {
      value.forEach(visit);
      return;
    }
    if (!value || typeof value !== 'object') return;
    for (const [key, item] of Object.entries(value)) {
      if (typeof item === 'string') {
        if (key === 'assetId' && /^[A-Za-z0-9_-]{1,128}$/.test(item)) assetIds.add(item);
        if (key === 'storageKey') {
          const match = item.match(/^koyo-asset:([A-Za-z0-9_-]{1,128})$/);
          if (match) assetIds.add(match[1]);
        }
        if (key === 'contentUrl' || key === 'content' || key === 'url' || key === 'dataUrl') {
          const match = item.match(/\/api\/canvas\/assets\/([A-Za-z0-9_-]{1,128})\/content(?:\?[^#]*)?(?:#.*)?$/);
          if (match) assetIds.add(decodeURIComponent(match[1]));
        }
      }
      visit(item);
    }
  };
  visit(snapshot);
  return assetIds;
}

export function rewriteCanvasShareAssetUrls(snapshot, token) {
  const visit = (value) => {
    if (Array.isArray(value)) return value.map(visit);
    if (!value || typeof value !== 'object') return value;
    return Object.fromEntries(Object.entries(value).map(([key, item]) => {
      if (typeof item === 'string' && ['contentUrl', 'content', 'url', 'dataUrl'].includes(key)) {
        const match = item.match(/\/api\/canvas\/assets\/([A-Za-z0-9_-]{1,128})\/content(\?[^#]*)?(?:#.*)?$/);
        if (match) {
          const assetId = decodeURIComponent(match[1]);
          const query = match[2] || '';
          return [key, `/api/canvas/shares/${token}/assets/${encodeURIComponent(assetId)}/content${query}`];
        }
      }
      return [key, visit(item)];
    }));
  };
  return visit(snapshot);
}
