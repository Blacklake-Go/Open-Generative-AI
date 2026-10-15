const ENABLED_CANVAS_SERVER_CAPABILITIES = new Set(['image', 'video', 'audio', 'music', 'text']);

export function isCanvasServerCapabilityEnabled(value) {
  const capability = String(value || '').trim().toLowerCase();
  return ENABLED_CANVAS_SERVER_CAPABILITIES.has(capability);
}
