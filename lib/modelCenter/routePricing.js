export const DEFAULT_PRICE_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;
export const DEFAULT_MODEL_HEALTH_MAX_AGE_MS = 15 * 60 * 1000;
export const DEFAULT_COST_TIE_TOLERANCE_RATE = 0.01;
export const ROUTING_MODE_WEIGHT_PRESETS = Object.freeze({
  cost: { cost: 0.70, success_rate: 0.15, speed: 0.10, capacity: 0.05 },
  quality: { cost: 0.05, success_rate: 0.80, speed: 0.10, capacity: 0.05 },
  stability: { cost: 0.10, success_rate: 0.55, speed: 0.25, capacity: 0.10 },
  balanced: { cost: 0.40, success_rate: 0.30, speed: 0.20, capacity: 0.10 },
});
export const ROUTE_COST_SOURCE_TYPES = Object.freeze(['account_actual', 'aggregator', 'manual', 'official_public']);
export const ROUTABLE_BILLING_UNITS = Object.freeze([
  'per_request', 'per_request_estimate', 'request', 'generation', 'per_generation',
  'per_image', 'per_second', 'per_output_second', 'per_video_second', 'per_token',
  'per_1k_tokens', 'per_input_token', 'per_output_token', 'per_unit',
]);
const ROUTABLE_BILLING_UNIT_SET = new Set(ROUTABLE_BILLING_UNITS);

export function isRoutableBillingUnit(value) {
  return ROUTABLE_BILLING_UNIT_SET.has(String(value || '').trim().toLowerCase());
}

function configuredPositiveNumber(name, fallback, minimum = 1) {
  const value = Number(process.env[name]);
  return Number.isFinite(value) && value >= minimum ? value : fallback;
}

export function configuredModelHealthMaxAgeMs() {
  return configuredPositiveNumber('MODEL_HEALTH_MAX_AGE_MS', DEFAULT_MODEL_HEALTH_MAX_AGE_MS);
}

export function evaluateRouteHealth({ healthStatus, lastHealthCheckAt, now = Date.now(), maxHealthAgeMs = configuredModelHealthMaxAgeMs() } = {}) {
  const health = String(healthStatus || '').toLowerCase();
  if (!['healthy', 'degraded'].includes(health)) return { eligible: false, reason: 'HEALTH_CHECK_FAILED' };
  const checkedAt = new Date(lastHealthCheckAt || 0).getTime();
  if (!Number.isFinite(checkedAt) || checkedAt <= 0 || now - checkedAt > maxHealthAgeMs) {
    return { eligible: false, reason: 'HEALTH_CHECK_STALE' };
  }
  return { eligible: true, reason: null };
}

function configuredTieTolerance() {
  const value = Number(process.env.ROUTE_COST_TIE_TOLERANCE_RATE);
  return Number.isFinite(value) ? Math.max(0, Math.min(0.05, value)) : DEFAULT_COST_TIE_TOLERANCE_RATE;
}

function objectValue(value) {
  if (!value) return {};
  if (typeof value === 'object' && !Array.isArray(value)) return value;
  if (typeof value !== 'string') return {};
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

export function attachOfficialPublicPriceVersions(providerModels = [], priceRows = []) {
  const pricesByMappingId = new Map();
  for (const row of priceRows) {
    const price = objectValue(row?.price_version);
    if (String(price.price_type || '').toLowerCase() !== 'official_public' || price.status !== 'active') continue;
    const mappingId = String(row?.provider_model_id || '').trim();
    if (mappingId && !pricesByMappingId.has(mappingId)) pricesByMappingId.set(mappingId, price);
  }

  return providerModels.map((mapping) => {
    const currentPrice = objectValue(mapping.active_price_version || mapping.price_version || mapping.priceVersion);
    if (currentPrice.id) return mapping;
    const officialPrice = pricesByMappingId.get(String(mapping.id || '').trim());
    return officialPrice ? { ...mapping, active_price_version: officialPrice } : mapping;
  });
}

function listValue(value) {
  if (Array.isArray(value)) return value.map((item) => String(item).toLowerCase());
  if (typeof value === 'string' && value.trim()) {
    try {
      const parsed = JSON.parse(value);
      if (Array.isArray(parsed)) return parsed.map((item) => String(item).toLowerCase());
    } catch {}
    return value.split(',').map((item) => item.trim().toLowerCase()).filter(Boolean);
  }
  return [];
}

function numberOrNull(value) {
  if (value === null || value === undefined || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : null;
}

function firstNumber(...values) {
  for (const value of values) {
    const number = numberOrNull(value);
    if (number !== null) return number;
  }
  return null;
}

function countFrom(parameters, keys, fallback = null) {
  for (const key of keys) {
    if (parameters?.[key] === undefined || parameters?.[key] === null) continue;
    const value = Number(parameters[key]);
    if (Number.isFinite(value) && value >= 0) return value;
  }
  return fallback;
}

function matchingMultiplier(value, multipliers) {
  const normalized = String(value ?? '').toLowerCase();
  if (!normalized) return 1;
  for (const [key, raw] of Object.entries(objectValue(multipliers))) {
    if (normalized.includes(String(key).toLowerCase())) {
      const factor = numberOrNull(raw);
      return factor === null ? null : factor;
    }
  }
  return 1;
}

function normalizeFx(fxSnapshot = {}) {
  const snapshot = objectValue(fxSnapshot);
  const rates = objectValue(snapshot.rates);
  const normalizedRates = Object.fromEntries(Object.entries(rates).map(([key, value]) => [String(key).toUpperCase(), Number(value)]));
  if (!(normalizedRates.USD_CNY > 0) && normalizedRates.CNY_USD > 0) normalizedRates.USD_CNY = 1 / normalizedRates.CNY_USD;
  if (!(normalizedRates.CNY_USD > 0) && normalizedRates.USD_CNY > 0) normalizedRates.CNY_USD = 1 / normalizedRates.USD_CNY;
  for (const [pair, rate] of Object.entries(normalizedRates)) {
    const [base, quote] = pair.split('_');
    if (base && quote && rate > 0 && !normalizedRates[`${quote}_${base}`]) normalizedRates[`${quote}_${base}`] = 1 / rate;
  }
  const usdToCny = firstNumber(snapshot.usdToCny, snapshot.usd_to_cny, normalizedRates.USD_CNY);
  if (usdToCny > 0) {
    for (const pair of Object.keys(normalizedRates)) {
      const [base, quote] = pair.split('_');
      if (quote === 'USD' && normalizedRates[pair] > 0 && !normalizedRates[`${base}_CNY`]) {
        normalizedRates[`${base}_CNY`] = normalizedRates[pair] * usdToCny;
      }
    }
  }
  return {
    id: snapshot.id || null,
    observedAt: snapshot.observedAt || snapshot.observed_at || null,
    rates: normalizedRates,
    rateIds: objectValue(snapshot.rateIds || snapshot.rate_ids),
    observedAtByPair: objectValue(snapshot.observedAtByPair || snapshot.observed_at_by_pair),
    expiredPairs: listValue(snapshot.expiredPairs || snapshot.expired_pairs),
    usdToCny,
  };
}

export function exchangeRateSnapshotFromRows(rows = [], { now = Date.now() } = {}) {
  const rates = { CNY_CNY: 1 };
  const rateIds = {};
  const observedAtByPair = {};
  const expiredPairs = [];
  for (const row of rows) {
    const base = String(row.base_currency || '').toUpperCase();
    const quote = String(row.quote_currency || '').toUpperCase();
    const key = `${base}_${quote}`;
    if (!base || !quote || base === quote) continue;
    const expiresAt = row.expires_at ? new Date(row.expires_at).getTime() : null;
    if (expiresAt !== null && (!Number.isFinite(expiresAt) || expiresAt <= now)) {
      expiredPairs.push(key);
      continue;
    }
    const rate = Number(row.rate);
    if (!Number.isFinite(rate) || rate <= 0) continue;
    rates[key] = rate;
    rateIds[key] = row.id;
    observedAtByPair[key] = row.observed_at;
  }
  if (!(rates.USD_CNY > 0) && rates.CNY_USD > 0) {
    rates.USD_CNY = 1 / rates.CNY_USD;
    rateIds.USD_CNY = rateIds.CNY_USD;
    observedAtByPair.USD_CNY = observedAtByPair.CNY_USD;
  }
  if (!(rates.CNY_USD > 0) && rates.USD_CNY > 0) {
    rates.CNY_USD = 1 / rates.USD_CNY;
    rateIds.CNY_USD = rateIds.USD_CNY;
    observedAtByPair.CNY_USD = observedAtByPair.USD_CNY;
  }
  for (const [pair, rate] of Object.entries(rates)) {
    const [base, quote] = pair.split('_');
    const reverse = `${quote}_${base}`;
    if (base && quote && rate > 0 && !(rates[reverse] > 0)) {
      rates[reverse] = 1 / rate;
      rateIds[reverse] = rateIds[pair];
      observedAtByPair[reverse] = observedAtByPair[pair];
    }
    if (quote === 'USD' && rates.USD_CNY > 0 && !(rates[`${base}_CNY`] > 0)) {
      rates[`${base}_CNY`] = rate * rates.USD_CNY;
      rateIds[`${base}_CNY`] = rateIds[pair] || rateIds.USD_CNY;
      observedAtByPair[`${base}_CNY`] = observedAtByPair[pair] || observedAtByPair.USD_CNY;
    }
  }
  return {
    id: rateIds.USD_CNY || null,
    rates,
    rateIds,
    observedAtByPair,
    expiredPairs,
    usdToCny: rates.USD_CNY > 0 ? rates.USD_CNY : null,
    observedAt: observedAtByPair.USD_CNY || null,
  };
}

export function estimateRequestCost(priceConfig, parameters = {}, {
  currency = 'USD',
  billingUnit = null,
  fxSnapshot = {},
} = {}) {
  const config = objectValue(priceConfig);
  const unit = String(billingUnit ?? config.billing_unit ?? config.unit ?? '').trim().toLowerCase();
  const code = String(currency || config.currency || '').toUpperCase();
  if (!isRoutableBillingUnit(unit)) {
    return { known: false, reason: 'BILLING_UNIT_UNVERIFIED', currency: code, billingUnit: unit || null };
  }
  const fx = normalizeFx(fxSnapshot);
  const outputSeconds = firstNumber(
    parameters.output_duration, parameters.outputDuration, parameters.video_duration,
    parameters.videoDuration, parameters.duration, config.default_output_seconds,
  );
  const inputSeconds = firstNumber(
    parameters.input_duration, parameters.inputDuration, parameters.reference_duration,
    parameters.referenceDuration, parameters.source_duration, parameters.sourceDuration,
    config.default_input_seconds,
  );
  const units = firstNumber(parameters.n, parameters.count, parameters.num_images, parameters.numImages,
    parameters.batch_size, parameters.batchSize, config.default_units, 1);
  const referenceImageCount = countFrom(parameters, ['reference_image_count', 'referenceImageCount'],
    Array.isArray(parameters.reference_images) ? parameters.reference_images.length
      : Array.isArray(parameters.image_urls) ? Math.max(0, parameters.image_urls.length - 1) : 0);
  const inputTokens = firstNumber(parameters.input_tokens, parameters.prompt_tokens, parameters.estimated_input_tokens,
    parameters.estimatedInputTokens, config.default_input_tokens);
  const outputTokens = firstNumber(parameters.output_tokens, parameters.max_tokens, parameters.estimated_output_tokens,
    parameters.estimatedOutputTokens, config.default_output_tokens);

  const rates = {
    base: numberOrNull(config.base_cost),
    unitAmount: firstNumber(config.unit_amount, config.amount, config.unit_cost),
    outputSecond: firstNumber(config.cost_per_output_second, config.cost_per_second),
    inputSecond: numberOrNull(config.cost_per_input_second),
    inputToken: numberOrNull(config.cost_per_input_token),
    outputToken: numberOrNull(config.cost_per_output_token),
    inputToken1k: numberOrNull(config.cost_per_1k_input_tokens),
    outputToken1k: numberOrNull(config.cost_per_1k_output_tokens),
    image: numberOrNull(config.cost_per_image),
    referenceImage: numberOrNull(config.cost_per_reference_image),
    referenceVideoSecond: numberOrNull(config.cost_per_reference_video_second),
    tool: numberOrNull(config.tool_fee),
    perUnit: numberOrNull(config.cost_per_unit),
  };
  const explicitlyFree = config.is_free === true || config.free === true;
  const hasPositiveRate = Object.values(rates).some((value) => value !== null && value > 0);
  if (!explicitlyFree && !hasPositiveRate) {
    return { known: false, reason: 'PRICE_CONFIG_MISSING', currency: code, billingUnit: unit };
  }

  let amount = rates.base ?? 0;
  const components = { base: amount };
  const add = (key, rate, count) => {
    if (rate === null) return true;
    if (count === null) return false;
    const value = rate * count;
    components[key] = Number(value.toFixed(8));
    amount += value;
    return true;
  };

  if (!add('output_seconds', rates.outputSecond, outputSeconds)) {
    return { known: false, reason: 'OUTPUT_DURATION_REQUIRED', currency: code, billingUnit: unit };
  }
  if (!add('input_seconds', rates.inputSecond, inputSeconds)) {
    return { known: false, reason: 'INPUT_DURATION_REQUIRED', currency: code, billingUnit: unit };
  }
  if (!add('input_tokens', rates.inputToken, inputTokens)
    || !add('input_tokens_1k', rates.inputToken1k, inputTokens === null ? null : inputTokens / 1000)) {
    return { known: false, reason: 'INPUT_TOKEN_ESTIMATE_REQUIRED', currency: code, billingUnit: unit };
  }
  if (!add('output_tokens', rates.outputToken, outputTokens)
    || !add('output_tokens_1k', rates.outputToken1k, outputTokens === null ? null : outputTokens / 1000)) {
    return { known: false, reason: 'OUTPUT_TOKEN_BUDGET_REQUIRED', currency: code, billingUnit: unit };
  }
  if (!add('images', rates.image, units)
    || !add('reference_images', rates.referenceImage, referenceImageCount)) {
    return { known: false, reason: 'IMAGE_COUNT_REQUIRED', currency: code, billingUnit: unit };
  }
  if (!add('reference_video_seconds', rates.referenceVideoSecond, inputSeconds)) {
    return { known: false, reason: 'REFERENCE_DURATION_REQUIRED', currency: code, billingUnit: unit };
  }
  if (!add('tool_fee', rates.tool, firstNumber(parameters.tool_count, parameters.toolCount, 1))) {
    return { known: false, reason: 'TOOL_COUNT_REQUIRED', currency: code, billingUnit: unit };
  }
  if (!add('units', rates.perUnit, units)) {
    return { known: false, reason: 'BATCH_COUNT_REQUIRED', currency: code, billingUnit: unit };
  }

  if (rates.unitAmount !== null) {
    const unitCount = ['per_request', 'per_request_estimate', 'request', 'generation', 'per_generation'].includes(unit) ? 1
      : unit.includes('input_token') ? (inputTokens === null ? null : (unit.includes('1k') ? inputTokens / 1000 : inputTokens))
        : unit.includes('output_token') || unit.includes('token') ? (outputTokens === null ? null : (unit.includes('1k') ? outputTokens / 1000 : outputTokens))
          : unit.includes('image') ? units
            : unit.includes('second') ? outputSeconds
              : unit.includes('unit') ? units : null;
    if (unitCount === null || !Number.isFinite(unitCount)) {
      return { known: false, reason: 'UNIT_INPUT_REQUIRED', currency: code, billingUnit: unit };
    }
    const unitCost = rates.unitAmount * unitCount;
    amount += unitCost;
    components.unit = Number(unitCost.toFixed(8));
  }

  if (rates.base === null && rates.unitAmount === null && rates.perUnit === null && rates.image === null && rates.outputSecond === null
    && rates.inputSecond === null && rates.inputToken === null && rates.outputToken === null
    && rates.inputToken1k === null && rates.outputToken1k === null && rates.referenceImage === null
    && rates.referenceVideoSecond === null && rates.tool === null && config.is_free !== true && config.free !== true) {
    return { known: false, reason: 'UNIT_PRICE_MISSING', currency: code, billingUnit: unit };
  }

  const resolution = parameters.resolution || parameters.size || parameters.output_resolution;
  const quality = parameters.quality || parameters.mode || parameters.quality_mode;
  const resolutionMultiplier = matchingMultiplier(resolution, config.resolution_multipliers);
  const qualityMultiplier = matchingMultiplier(quality, config.quality_multipliers);
  if (resolutionMultiplier === null || qualityMultiplier === null) {
    return { known: false, reason: 'INVALID_PRICE_MULTIPLIER', currency: code, billingUnit: unit };
  }
  const multiplier = firstNumber(config.unit_multiplier, 1);
  const discountRate = firstNumber(config.account_discount_rate, config.discount_rate, 0);
  const taxRate = firstNumber(config.tax_rate, 0);
  const surcharge = firstNumber(config.surcharge, config.additional_fee, 0);
  amount = amount * resolutionMultiplier * qualityMultiplier * multiplier;
  amount = amount * (1 - discountRate) * (1 + taxRate) + surcharge;
  if (!Number.isFinite(amount) || amount < 0) {
    return { known: false, reason: 'INVALID_PRICE', currency: code, billingUnit: unit };
  }

  let toCny = null;
  if (code === 'CNY' || code === 'RMB') toCny = 1;
  else if (code === 'USD' && fx.usdToCny !== null) toCny = fx.usdToCny;
  else if (fx.rates[`${code}_CNY`] > 0) toCny = fx.rates[`${code}_CNY`];
  if (!(toCny > 0)) return { known: false, reason: 'FX_RATE_MISSING', currency: code, billingUnit: unit };

  const costCny = Number((amount * toCny).toFixed(8));
  const usdToCny = fx.usdToCny;
  const costUsd = code === 'USD' ? Number(amount.toFixed(8))
    : usdToCny > 0 ? Number((costCny / usdToCny).toFixed(8)) : null;
  return {
    known: true,
    currency: code,
    billingUnit: unit,
    estimatedCost: Number(amount.toFixed(8)),
    estimatedCostCny: costCny,
    estimatedCostUsd: costUsd,
    components,
    units,
    outputSeconds,
    inputSeconds,
    inputTokens,
    outputTokens,
    fxSnapshot: { ...fx, toCny },
  };
}

function capabilityReason(mapping, parameters) {
  if (String(mapping.review_status || 'approved') !== 'approved') return 'MAPPING_NOT_APPROVED';
  const capabilities = objectValue(mapping.capabilities);
  const maxOutputCount = numberOrNull(mapping.max_output_count ?? capabilities.max_output_count
    ?? capabilities.max_images_per_request);
  if (maxOutputCount !== null) {
    const requestedCounts = [parameters.n, parameters.count, parameters.num_images, parameters.numImages,
      parameters.batch_size, parameters.batchSize]
      .filter((value) => value !== undefined && value !== null && value !== '')
      .map(Number);
    if (requestedCounts.some((count) => !Number.isSafeInteger(count) || count < 1 || count > maxOutputCount)) {
      return 'OUTPUT_COUNT_UNSUPPORTED';
    }
  }
  const normalizeTask = (value) => {
    const task = String(value || '').toLowerCase().replace(/[\s-]+/g, '_');
    const aliases = {
      text_to_image: 't2i', text2image: 't2i', txt2img: 't2i', t2i: 't2i',
      image_to_image: 'i2i', image_edit: 'i2i', i2i: 'i2i',
      text_to_video: 't2v', text2video: 't2v', t2v: 't2v',
      image_to_video: 'i2v', img2video: 'i2v', i2v: 'i2v',
      video_to_video: 'v2v', video_edit: 'v2v', v2v: 'v2v',
      text_to_audio: 't2a', text2audio: 't2a', t2a: 't2a',
    };
    return aliases[task] || task;
  };
  const tasks = listValue(mapping.supported_task_types?.length ? mapping.supported_task_types
    : capabilities.supported_task_types || capabilities.task_types || capabilities.modes);
  const inputTypes = listValue(capabilities.input_types || capabilities.inputs);
  const outputTypes = listValue(capabilities.output_types || capabilities.outputs);
  if (!inputTypes.length) return 'MAPPING_INPUT_TYPES_UNVERIFIED';
  if (!outputTypes.length) return 'MAPPING_OUTPUT_TYPES_UNVERIFIED';
  const requestedTask = String(parameters.task_type || parameters.taskType || '').toLowerCase();
  if (!tasks.length) return 'MAPPING_TASK_TYPES_UNVERIFIED';
  if (requestedTask && !tasks.map(normalizeTask).includes(normalizeTask(requestedTask))) return 'TASK_TYPE_UNSUPPORTED';
  const normalizedTask = normalizeTask(requestedTask);
  const expectedInput = normalizedTask.startsWith('t2') ? 'text'
    : normalizedTask.startsWith('i2') ? 'image' : normalizedTask.startsWith('v2') ? 'video' : null;
  const expectedOutput = normalizedTask.endsWith('i') ? 'image'
    : normalizedTask.endsWith('v') ? 'video' : normalizedTask.endsWith('a') ? 'audio' : null;
  if (expectedInput && !inputTypes.includes(expectedInput)) return 'INPUT_TYPE_UNSUPPORTED';
  if (expectedOutput && !outputTypes.includes(expectedOutput)) return 'OUTPUT_TYPE_UNSUPPORTED';

  const declaredParameterValue = capabilities.parameters ?? capabilities.supported_parameters ?? capabilities.parameter_names;
  const declaredParameters = new Set([
    ...listValue(declaredParameterValue),
    ...Object.keys(objectValue(declaredParameterValue)).map((key) => key.toLowerCase()),
  ]);
  const allowedParameters = new Set([
    'prompt', 'negative_prompt', 'negativeprompt', 'task_type', 'tasktype', 'generation_mode', 'mode',
    'n', 'count', 'num_images', 'numimages', 'batch_size', 'batchsize',
    'resolution', 'size', 'output_resolution', 'width', 'height',
    'aspect_ratio', 'aspectratio',
    'duration', 'video_duration', 'duration_seconds', 'output_duration',
    'quality', 'quality_mode', 'region', 'request_id',
    'watermark', 'seed',
    'quoteid', 'quote_id', 'idempotencykey', 'idempotency_key',
    'studioid', 'studio_id', 'modelid', 'model', 'endpoint', 'label',
  ]);
  const mediaParameters = {
    image: ['image', 'image_url', 'image_urls', 'images', 'images_list', 'reference_image', 'reference_images',
      'start_image_url', 'first_image_url', 'last_image', 'end_image_url'],
    video: ['video', 'video_url', 'video_urls', 'videos', 'videos_list', 'video_files', 'reference_videos',
      'source_video', 'input_video'],
    audio: ['audio', 'audio_url', 'audio_urls', 'audios', 'audios_list', 'audio_files', 'reference_audios'],
  };
  for (const inputType of inputTypes) {
    for (const name of mediaParameters[inputType] || []) allowedParameters.add(name);
  }
  for (const name of declaredParameters) allowedParameters.add(name);

  const checks = [
    ['resolution', [parameters.resolution, parameters.size, parameters.output_resolution],
      (mapping.supported_resolutions?.length ? mapping.supported_resolutions : capabilities.resolutions)],
    ['aspect_ratio', [parameters.aspect_ratio, parameters.aspectRatio],
      (mapping.supported_aspect_ratios?.length ? mapping.supported_aspect_ratios : capabilities.aspect_ratios || capabilities.ratios)],
    ['duration', [parameters.duration, parameters.video_duration, parameters.duration_seconds, parameters.output_duration],
      (mapping.supported_durations?.length ? mapping.supported_durations : capabilities.durations)],
    ['quality', [parameters.quality, parameters.quality_mode],
      (mapping.supported_qualities?.length ? mapping.supported_qualities : capabilities.qualities)],
    ['region', [parameters.region],
      (mapping.supported_regions?.length ? mapping.supported_regions : capabilities.regions)],
  ];
  for (const [name, rawRequests, supportedValue] of checks) {
    const requestedValues = rawRequests.filter((value) => value !== undefined && value !== null && value !== '');
    if (!requestedValues.length) continue;
    const supported = listValue(supportedValue);
    // A request can only use a control when this exact route has a reviewed
    // declaration. Empty metadata is unknown, not an implicit wildcard.
    if (!supported.length) return `${name.toUpperCase()}_UNVERIFIED`;
    if (supported.includes('*') || supported.includes('auto') || supported.includes('any')) continue;
    const normalizeValue = (value) => {
      const normalized = String(value).trim().toLowerCase();
      return name === 'resolution' ? normalized.replace(/\*/g, 'x').replace(/\s+/g, '') : normalized;
    };
    const normalizedSupported = supported.map(normalizeValue);
    if (requestedValues.some((requested) => !normalizedSupported.includes(normalizeValue(requested)))) {
      return `${name.toUpperCase()}_UNSUPPORTED`;
    }
  }

  const requirements = listValue(mapping.license_requirements);
  // License conditions are an administrator-verified property of the mapping.
  // Never accept a client parameter as proof that a provider contract permits use.
  const verifiedLicenseConditions = listValue(mapping.verified_license_conditions
    || capabilities.verified_license_conditions);
  if (requirements.length && !requirements.every((requirement) => verifiedLicenseConditions.includes(requirement))) {
    return 'LICENSE_REQUIREMENT_NOT_CONFIRMED';
  }
  if (Object.keys(parameters || {}).some((name) => !allowedParameters.has(String(name).toLowerCase()))) {
    return 'PARAMETER_UNVERIFIED';
  }
  return null;
}

function currentPriceVersion(mapping) {
  return objectValue(mapping.active_price_version || mapping.price_version || mapping.priceVersion);
}

function priceValidityReason(price, nowMs, maxAgeMs) {
  if (!price?.id) return 'PRICE_MISSING';
  if (!ROUTE_COST_SOURCE_TYPES.includes(String(price.price_type || '').toLowerCase())) return 'PRICE_TYPE_NOT_ROUTEABLE';
  if (price.status !== 'active') return 'PRICE_NOT_ACTIVE';
  if (!isRoutableBillingUnit(price.billing_unit)) return 'BILLING_UNIT_UNVERIFIED';
  const effective = price.effective_at ? new Date(price.effective_at).getTime() : null;
  const expiry = price.expires_at ? new Date(price.expires_at).getTime() : null;
  const observed = new Date(price.source_observed_at || price.fetched_at || price.created_at || 0).getTime();
  if (effective !== null && Number.isFinite(effective) && effective > nowMs) return 'PRICE_NOT_EFFECTIVE';
  if (expiry !== null && Number.isFinite(expiry) && expiry <= nowMs) return 'PRICE_EXPIRED';
  const effectiveMaxAge = ['manual', 'account_actual'].includes(String(price.price_type || '').toLowerCase())
    ? Math.max(maxAgeMs, 30 * 24 * 60 * 60 * 1000)
    : maxAgeMs;
  if (!Number.isFinite(observed) || observed <= 0 || nowMs - observed > effectiveMaxAge) return 'PRICE_STALE';
  return null;
}

export function evaluateRouteCandidates(providerModels = [], parameters = {}, {
  modelId,
  now = Date.now(),
  maxPriceAgeMs = configuredPositiveNumber('MODEL_PRICE_MAX_AGE_MS', DEFAULT_PRICE_MAX_AGE_MS),
  maxHealthAgeMs = configuredModelHealthMaxAgeMs(),
  maxQuotaAgeMs = configuredPositiveNumber('MODEL_QUOTA_MAX_AGE_MS', 15 * 60 * 1000),
  costTieToleranceRate = configuredTieTolerance(),
  fxSnapshot = {},
  quoteSnapshot = null,
  excludedProviderIds = [],
} = {}) {
  const candidates = [];
  const rejected = [];
  const allowedByQuote = quoteSnapshot?.candidates?.length
    ? new Map(quoteSnapshot.candidates.map((candidate) => [
        `${candidate.providerId || ''}:${candidate.providerModelId}`, candidate,
      ])) : null;
  const quoteCostLimitUsd = numberOrNull(quoteSnapshot?.maxFailoverCostUsd);
  const quoteCostLimitCny = numberOrNull(quoteSnapshot?.maxFailoverCostCny);
  const attempted = new Set(excludedProviderIds.map(String));

  for (const mapping of providerModels) {
    const reject = (reason) => rejected.push({
      providerId: mapping.provider_id || mapping.providerId,
      providerModelId: mapping.provider_model_id || mapping.providerModelId,
      reason,
    });
    const providerId = String(mapping.provider_id || mapping.providerId || '');
    const providerModelId = String(mapping.provider_model_id || mapping.providerModelId || '');
    if (modelId && String(mapping.model_id || mapping.modelId || modelId) !== String(modelId)) {
      reject('CANONICAL_MODEL_MISMATCH'); continue;
    }
    if (attempted.has(providerId)) { reject('ALREADY_ATTEMPTED_FAILED'); continue; }
    if (!mapping.enabled) { reject('MAPPING_DISABLED'); continue; }
    if (mapping.provider_enabled === false || mapping.providerEnabled === false) { reject('PROVIDER_DISABLED'); continue; }
    if (!String(mapping.provider_endpoint || mapping.providerEndpoint || '').trim()) { reject('PROVIDER_ENDPOINT_MISSING'); continue; }
    const specReason = capabilityReason(mapping, parameters);
    if (specReason) { reject(specReason); continue; }
    if (mapping.adapter_available === false || mapping.adapterAvailable === false) { reject('ADAPTER_UNAVAILABLE'); continue; }
    if (mapping.credentials_configured === false || mapping.credentialsConfigured === false) { reject('PROVIDER_NOT_CONFIGURED'); continue; }
    const circuit = String(mapping.circuit_state || mapping.circuitState || '').toLowerCase();
    if (circuit === 'open' || circuit === 'circuit_open') { reject('CIRCUIT_OPEN'); continue; }
    const health = String(mapping.health_status || mapping.healthStatus || '').toLowerCase();
    const healthDecision = evaluateRouteHealth({
      healthStatus: health,
      lastHealthCheckAt: mapping.last_health_check_at || mapping.lastHealthCheckAt,
      now,
      maxHealthAgeMs,
    });
    if (!healthDecision.eligible) { reject(healthDecision.reason); continue; }
    const concurrency = numberOrNull(mapping.concurrency_limit ?? mapping.concurrencyLimit);
    const activeCount = numberOrNull(mapping.active_attempt_count ?? mapping.activeAttemptCount);
    if (concurrency !== null && activeCount !== null && activeCount >= concurrency) { reject('CAPACITY_EXHAUSTED'); continue; }
    const quota = numberOrNull(mapping.available_quota ?? mapping.availableQuota);
    const quotaCheckedAt = new Date(mapping.quota_checked_at || mapping.quotaCheckedAt || 0).getTime();
    if (quota !== null && (!Number.isFinite(quotaCheckedAt) || quotaCheckedAt <= 0 || now - quotaCheckedAt > maxQuotaAgeMs)) {
      reject('QUOTA_CHECK_STALE'); continue;
    }
    if (quota !== null && quota <= 0) { reject('QUOTA_EXHAUSTED'); continue; }

    const price = currentPriceVersion(mapping);
    const priceReason = priceValidityReason(price, now, maxPriceAgeMs);
    const conservativeUpperBoundConfig = objectValue(price.conservative_upper_bound_config || price.conservativeUpperBoundConfig);
    const upperBoundCurrency = String(price.conservative_upper_bound_currency || price.conservativeUpperBoundCurrency || '').toUpperCase();
    const upperBoundExpiresAt = new Date(price.conservative_upper_bound_expires_at || price.conservativeUpperBoundExpiresAt || 0).getTime();
    const conservativeBoundUsable = Boolean(price.id && price.status === 'active'
      && Object.keys(conservativeUpperBoundConfig).length
      && ['USD', 'CNY', 'RMB'].includes(upperBoundCurrency)
      && String(price.conservative_upper_bound_reason || price.conservativeUpperBoundReason || '').trim()
      && Number.isFinite(upperBoundExpiresAt) && upperBoundExpiresAt > now);
    if (priceReason && !(conservativeBoundUsable && ['PRICE_STALE', 'PRICE_EXPIRED'].includes(priceReason))) {
      reject(priceReason); continue;
    }
    const priceConfig = objectValue(price.price_config);
    let estimate = priceReason
      ? { known: false, reason: priceReason }
      : estimateRequestCost(priceConfig, parameters, {
          billingUnit: price.billing_unit,
          currency: price.currency,
          fxSnapshot,
        });
    let estimateSource = 'provider_price_version';
    if ((!estimate.known || priceReason) && conservativeBoundUsable) {
      estimate = estimateRequestCost(conservativeUpperBoundConfig, parameters, {
        billingUnit: price.billing_unit,
        currency: upperBoundCurrency,
        fxSnapshot,
      });
      estimateSource = 'admin_conservative_upper_bound';
    }
    if (!estimate.known) { reject(estimate.reason || 'COST_UNKNOWN'); continue; }
    /*
     * The upper-bound configuration must be parameter-aware (for example, a per-second
     * ceiling for the requested video duration); a single flat UI estimate is not enough.
     */
    const normalizedEstimate = { ...estimate, source: estimateSource };
    if (Number.isFinite(Number(mapping.provider_balance)) && Number(mapping.provider_balance) < 0) {
      reject('INSUFFICIENT_BALANCE'); continue;
    }

    let quoteCandidate = null;
    if (allowedByQuote) {
      quoteCandidate = allowedByQuote.get(`${providerId}:${providerModelId}`);
      if (!quoteCandidate) { reject('NOT_IN_QUOTED_CANDIDATES'); continue; }
      const currentMappingVersion = Number(mapping.mapping_version ?? mapping.mappingVersion ?? 0);
      const quotedMappingVersion = Number(quoteCandidate.mappingVersion ?? 0);
      const currentEndpoint = String(mapping.provider_endpoint || mapping.providerEndpoint || '');
      const quotedEndpoint = String(quoteCandidate.providerEndpoint || '');
      if (!quotedMappingVersion || !currentMappingVersion || currentMappingVersion !== quotedMappingVersion
        || !quotedEndpoint || currentEndpoint !== quotedEndpoint) {
        reject('MAPPING_CHANGED_AFTER_QUOTE'); continue;
      }
      const quotedCostCny = numberOrNull(quoteCandidate.estimatedCostCny);
      const quotedCostUsd = numberOrNull(quoteCandidate.estimatedCostUsd);
      const exceedsQuotedCost = quotedCostCny !== null && estimate.estimatedCostCny > quotedCostCny
        || quotedCostCny === null && (quotedCostUsd === null || estimate.estimatedCostUsd === null
          || estimate.estimatedCostUsd > quotedCostUsd);
      if (exceedsQuotedCost) {
        reject('QUOTE_COST_CEILING_EXCEEDED'); continue;
      }
    }
    if (quoteCostLimitCny !== null && estimate.estimatedCostCny > quoteCostLimitCny) {
      reject('QUOTE_COST_CEILING_EXCEEDED'); continue;
    }
    if (quoteCostLimitCny === null && quoteCostLimitUsd !== null
      && (estimate.estimatedCostUsd === null || estimate.estimatedCostUsd > quoteCostLimitUsd)) {
      reject('QUOTE_COST_CEILING_EXCEEDED'); continue;
    }

    candidates.push({
      providerModel: mapping,
      providerId,
      providerModelId,
      priceVersionId: price.id,
      quotedPriceVersionId: quoteCandidate?.priceVersionId || null,
      priceType: price.price_type,
      estimatedCost: estimate.estimatedCost,
      estimatedCostCurrency: estimate.currency,
      estimatedCostCny: estimate.estimatedCostCny,
      estimatedCostUsd: estimate.estimatedCostUsd,
      priceSnapshot: price,
      fxSnapshot: estimate.fxSnapshot,
      estimate: normalizedEstimate,
      estimatedCostSource: estimateSource,
      conservativeUpperBoundExpiresAt: conservativeBoundUsable ? new Date(upperBoundExpiresAt).toISOString() : null,
      priority: Number(mapping.priority || 0),
      successRate: numberOrNull(mapping.success_rate) ?? 0,
      latencyMs: numberOrNull(mapping.average_latency_ms) ?? Number.MAX_SAFE_INTEGER,
      healthStatus: health || 'unknown',
    });
  }

  return { candidates, rejected };
}

function compareTieBreak(left, right) {
  if (left.successRate !== right.successRate) return right.successRate - left.successRate;
  if (left.latencyMs !== right.latencyMs) return left.latencyMs - right.latencyMs;
  return right.priority - left.priority || left.providerId.localeCompare(right.providerId);
}

export function selectRouteCandidate(evaluation, {
  routingMode = 'cost',
  costTieToleranceRate = configuredTieTolerance(),
  weights = null,
} = {}) {
  const candidates = [...(evaluation?.candidates || [])];
  if (!candidates.length) return null;
  if (routingMode === 'cost') {
    candidates.sort((a, b) => a.estimatedCostCny - b.estimatedCostCny || compareTieBreak(a, b));
    const minimum = candidates[0].estimatedCostCny;
    const toleranceCeiling = minimum * (1 + Math.max(0, costTieToleranceRate));
    const tied = candidates.filter((candidate) => candidate.estimatedCostCny <= toleranceCeiling);
    tied.sort(compareTieBreak);
    return tied[0];
  }

  const w = weights && typeof weights === 'object' 
    ? { ...ROUTING_MODE_WEIGHT_PRESETS.balanced, ...weights }
    : ROUTING_MODE_WEIGHT_PRESETS[routingMode] || ROUTING_MODE_WEIGHT_PRESETS.balanced;

  // Normalize weights so they sum to 1
  const wSum = (w.cost || 0) + (w.success_rate || 0) + (w.speed || 0) + (w.capacity || 0);
  const nw = wSum > 0 ? {
    cost: (w.cost || 0) / wSum,
    success_rate: (w.success_rate || 0) / wSum,
    speed: (w.speed || 0) / wSum,
    capacity: (w.capacity || 0) / wSum,
  } : ROUTING_MODE_WEIGHT_PRESETS.balanced;

  const values = candidates.map((c) => c.estimatedCostCny);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const minLatency = Math.min(...candidates.map((c) => c.latencyMs));
  const maxLatency = Math.max(...candidates.map((c) => c.latencyMs));
  const normalize = (value, low, high, invert = false) => {
    if (high === low) return 1;
    const scaled = (value - low) / (high - low);
    return invert ? 1 - scaled : scaled;
  };

  const scores = candidates.map((candidate) => {
    const pm = candidate.providerModel || {};
    const concLimit = Number(pm.concurrency_limit || pm.concurrencyLimit || 10);
    const activeCount = Number(pm.active_attempt_count || pm.activeAttemptCount || 0);
    const capacityScore = concLimit > 0 ? Math.max(0, (concLimit - activeCount) / concLimit) : 0;

    const score = nw.cost * normalize(candidate.estimatedCostCny, min, max, true)
      + nw.success_rate * candidate.successRate
      + nw.speed * normalize(candidate.latencyMs, minLatency, maxLatency, true)
      + nw.capacity * capacityScore;
    return { candidate, score };
  });
  scores.sort((a, b) => b.score - a.score
    || a.candidate.estimatedCostCny - b.candidate.estimatedCostCny
    || compareTieBreak(a.candidate, b.candidate));
  return scores[0].candidate;
}

export function buildRouteQuoteSnapshot(evaluation, selected, {
  maxFailoverCostUsd = null,
  maxFailoverCostCny = null,
  createdAt = new Date().toISOString(),
} = {}) {
  if (!selected) return null;
  return {
    createdAt,
    selectedProviderModelId: selected.providerModelId,
    selectedProviderId: selected.providerId,
    selectedPriceVersionId: selected.priceVersionId,
    selectedCostCny: selected.estimatedCostCny,
    selectedCostUsd: selected.estimatedCostUsd,
    maxFailoverCostUsd: numberOrNull(maxFailoverCostUsd),
    maxFailoverCostCny: numberOrNull(maxFailoverCostCny),
    fxSnapshot: selected.fxSnapshot,
    candidates: [...(evaluation?.candidates || [])]
      .sort((a, b) => a.estimatedCostCny - b.estimatedCostCny || b.priority - a.priority)
      .map((candidate) => ({
      providerId: candidate.providerId,
      providerModelId: candidate.providerModelId,
      providerEndpoint: candidate.providerModel.provider_endpoint || candidate.providerModel.providerEndpoint || null,
      providerModelVersion: candidate.providerModel.provider_model_version || candidate.providerModel.providerModelVersion || null,
        mappingVersion: Number(candidate.providerModel.mapping_version || candidate.providerModel.mappingVersion || 0),
        priceVersionId: candidate.priceVersionId,
        estimatedCostSource: candidate.estimatedCostSource,
        conservativeUpperBoundExpiresAt: candidate.conservativeUpperBoundExpiresAt,
        estimatedCostCny: candidate.estimatedCostCny,
        estimatedCostUsd: candidate.estimatedCostUsd,
        currency: candidate.estimatedCostCurrency,
      })),
    rejected: evaluation?.rejected || [],
  };
}
