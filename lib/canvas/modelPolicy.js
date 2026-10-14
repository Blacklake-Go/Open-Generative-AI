export function parseCanvasE2EVerifiedModelIds(value) {
  return new Set(String(value || '').split(',').map((id) => id.trim()).filter(Boolean));
}

export function getCanvasVerifiedModelIdsForUser({
  globalVerifiedModelIds = [],
  testUserIds = [],
  testModelIds = [],
  userId = '',
} = {}) {
  const toSet = (value) => value instanceof Set
    ? new Set(value)
    : new Set(Array.isArray(value) ? value : []);
  const verified = toSet(globalVerifiedModelIds);
  const user = typeof userId === 'string' ? userId.trim() : '';
  if (!user || !toSet(testUserIds).has(user)) return verified;
  for (const modelId of toSet(testModelIds)) verified.add(modelId);
  return verified;
}

export function filterCanvasModelsByVerification({ mountedModelIds = [], candidateModelIds = [], verifiedModelIds = [] }) {
  const candidates = new Set(candidateModelIds);
  const verified = verifiedModelIds instanceof Set
    ? verifiedModelIds
    : new Set(Array.isArray(verifiedModelIds) ? verifiedModelIds : []);
  return new Set(mountedModelIds.filter((id) => candidates.has(id) && verified.has(id)));
}

export function getCanvasTestOnlyModelIds({ testUserIds = [], testModelIds = [], candidateModelIds = [], userId = '' } = {}) {
  const toSet = (value) => value instanceof Set
    ? new Set(value)
    : new Set(Array.isArray(value) ? value : []);
  const user = typeof userId === 'string' ? userId.trim() : '';
  if (!user || !toSet(testUserIds).has(user)) return new Set();
  const candidates = toSet(candidateModelIds);
  return new Set([...toSet(testModelIds)].filter((modelId) => candidates.has(modelId)));
}
