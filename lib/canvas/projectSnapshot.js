export function canvasSnapshotContainsNode(snapshot, nodeId) {
  let parsed = snapshot;
  if (typeof parsed === 'string') {
    try {
      parsed = JSON.parse(parsed);
    } catch {
      return false;
    }
  }
  if (!parsed || typeof parsed !== 'object' || !Array.isArray(parsed.nodes)) return false;
  return parsed.nodes.some((node) => node && typeof node === 'object' && node.id === nodeId);
}
