function capabilityObject(value) {
  if (value && typeof value === 'object' && !Array.isArray(value)) return value;
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
    } catch {}
  }
  return {};
}

function capabilityList(value) {
  if (Array.isArray(value)) return value;
  if (typeof value !== 'string' || !value.trim()) return [];
  try {
    const parsed = JSON.parse(value);
    if (Array.isArray(parsed)) return parsed;
  } catch {}
  return value.split(',').map((item) => item.trim()).filter(Boolean);
}

function safeCapabilityValues(value) {
  return [...new Set(capabilityList(value).flatMap((item) => {
    if (typeof item === 'string' && item.trim() && item.length <= 80) return [item.trim()];
    if (typeof item === 'number' && Number.isFinite(item) && item >= 0) return [item];
    return [];
  }))].slice(0, 40);
}

function normalizeTaskType(value) {
  const normalized = String(value || '').trim().toLowerCase().replace(/[\s-]+/g, '_');
  const aliases = {
    text_to_video: 't2v', text2video: 't2v', t2v: 't2v',
    image_to_video: 'i2v', img2video: 'i2v', i2v: 'i2v',
    video_to_video: 'v2v', video_edit: 'v2v', v2v: 'v2v',
    text_to_image: 't2i', text2image: 't2i', t2i: 't2i',
    image_to_image: 'i2i', image_edit: 'i2i', i2i: 'i2i',
    text_to_audio: 't2a', text2audio: 't2a', t2a: 't2a',
  };
  return aliases[normalized] || normalized;
}

/** Project only reviewed, ready-route input/output and parameter capabilities. */
export function projectReadyRouteCapabilities(routes) {
  const byTask = new Map();
  for (const route of routes || []) {
    const metadata = capabilityObject(route.mapping_capabilities);
    const inputs = safeCapabilityValues(metadata.input_types || metadata.inputs)
      .map((value) => String(value).toLowerCase());
    const outputs = safeCapabilityValues(metadata.output_types || metadata.outputs)
      .map((value) => String(value).toLowerCase());
    const taskValues = safeCapabilityValues(route.supported_task_types).length
      ? safeCapabilityValues(route.supported_task_types)
      : safeCapabilityValues(metadata.supported_task_types || metadata.task_types || metadata.modes);
    if (!inputs.length || !outputs.length || !taskValues.length) continue;

    const aspectRatios = safeCapabilityValues(metadata.supported_aspect_ratios
      || metadata.aspect_ratios || metadata.ratios);
    const resolutions = safeCapabilityValues(route.supported_resolutions).length
      ? safeCapabilityValues(route.supported_resolutions)
      : safeCapabilityValues(metadata.resolutions);
    const durations = safeCapabilityValues(route.supported_durations).length
      ? safeCapabilityValues(route.supported_durations)
      : safeCapabilityValues(metadata.durations);
    const qualities = safeCapabilityValues(route.supported_qualities).length
      ? safeCapabilityValues(route.supported_qualities)
      : safeCapabilityValues(metadata.qualities);
    const parameterValues = Array.isArray(metadata.parameters)
      ? metadata.parameters
      : metadata.parameters && typeof metadata.parameters === 'object'
        ? Object.keys(metadata.parameters)
        : metadata.supported_parameters || metadata.parameter_names;
    const parameters = safeCapabilityValues(parameterValues).filter((value) => typeof value === 'string');

    for (const rawTask of taskValues) {
      const taskType = normalizeTaskType(rawTask);
      if (!taskType) continue;
      const expectedInput = taskType.startsWith('t2') ? 'text'
        : taskType.startsWith('i2') ? 'image'
          : taskType.startsWith('v2') ? 'video' : null;
      const expectedOutput = taskType.endsWith('v') ? 'video'
        : taskType.endsWith('i') ? 'image'
          : taskType.endsWith('a') ? 'audio' : null;
      if (!expectedInput || !expectedOutput || !inputs.includes(expectedInput) || !outputs.includes(expectedOutput)) continue;

      if (!byTask.has(taskType)) {
        byTask.set(taskType, {
          taskType,
          inputTypes: new Set(),
          outputTypes: new Set(),
          aspectRatios: new Set(),
          resolutions: new Set(),
          durations: new Set(),
          qualities: new Set(),
          parameters: new Set(),
        });
      }
      const capability = byTask.get(taskType);
      capability.inputTypes.add(expectedInput);
      capability.outputTypes.add(expectedOutput);
      for (const value of aspectRatios) capability.aspectRatios.add(value);
      for (const value of resolutions) capability.resolutions.add(value);
      for (const value of durations) capability.durations.add(value);
      for (const value of qualities) capability.qualities.add(value);
      for (const value of parameters) capability.parameters.add(value);
    }
  }

  return [...byTask.values()].map((capability) => ({
    taskType: capability.taskType,
    inputTypes: [...capability.inputTypes],
    outputTypes: [...capability.outputTypes],
    aspectRatios: [...capability.aspectRatios],
    resolutions: [...capability.resolutions],
    durations: [...capability.durations],
    qualities: [...capability.qualities],
    parameters: [...capability.parameters],
  }));
}
