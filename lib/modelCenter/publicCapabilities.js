import { sanitizePublicSchema, normalizeGenerationTaskType } from './capabilitySchema.js';

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
      const taskType = normalizeGenerationTaskType(rawTask);
      if (!taskType) continue;
      const expectedInput = taskType.startsWith('t2') ? 'text'
        : taskType.startsWith('i2') ? 'image'
          : taskType.startsWith('v2') ? 'video' : null;
      const expectedOutput = taskType.endsWith('v') ? 'video'
        : taskType.endsWith('i') ? 'image'
          : taskType.endsWith('m') ? 'music'
            : taskType.endsWith('a') ? 'audio' : taskType === 't2t' ? 'text' : null;
      // 音乐线路可能仍声明 audio 输出；对外统一投影为 music 能力。
      const outputType = expectedOutput === 'music'
        ? (outputs.includes('music') || outputs.includes('audio') ? 'music' : null)
        : expectedOutput && outputs.includes(expectedOutput) ? expectedOutput : null;
      if (!expectedInput || !outputType || !inputs.includes(expectedInput)) continue;

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
          inputSchemas: [],
          variants: [],
        });
      }
      const capability = byTask.get(taskType);
      const inputSchema = sanitizePublicSchema(metadata.input_schema || metadata.inputSchema || (metadata.parameters && !Array.isArray(metadata.parameters) ? {type:'object',properties:metadata.parameters} : null));
      if (inputSchema) capability.inputSchemas.push(inputSchema);
      capability.variants.push({taskType,inputTypes:[expectedInput],outputTypes:[outputType],aspectRatios,resolutions,durations,qualities,parameters,...(inputSchema ? {inputSchema} : {})});
      capability.inputTypes.add(expectedInput);
      capability.outputTypes.add(outputType);
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
    variants: [...new Map(capability.variants.map(variant => [JSON.stringify(variant),variant])).values()],
    ...(capability.inputSchemas.length ? { inputSchema: capability.inputSchemas.length === 1 ? capability.inputSchemas[0] : {anyOf:capability.inputSchemas} } : {}),
  }));
}
