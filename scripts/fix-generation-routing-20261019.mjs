#!/usr/bin/env node
/** Permanent generation-routing repair (2026-10-19). Usage: node this.mjs [--apply] */
import pg from 'pg';
const APPLY = process.argv.includes('--apply');
const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
const SEEDANCE_T2V = '/openapi/v2/bytedance/seedance-2.0-global/text-to-video';
const SEEDANCE_I2V = '/openapi/v2/bytedance/seedance-2.0-global/image-to-video';
const DURATIONS = ['-1','4','5','6','7','8','9','10','11','12','13','14','15'];
const SEEDANCE_RES = ['480p','720p','1080p','native1080p','2k','4k','native4k'];
const RATIOS = ['adaptive','16:9','4:3','1:1','3:4','9:16','21:9'];
const PLATFORM_PARAMS = ['prompt','negative_prompt','aspect_ratio','resolution','duration','quality','seed','watermark','batch_size','n','reference_mode','camera_motion','generate_audio','first_frame_url','end_frame_url','image_urls','video_url','mode'];
const opts = (v) => v.map((x) => ({ value: String(x), description: String(x), descriptionEn: String(x) }));
const j = (v) => JSON.stringify(v);

async function updateRunningHubContracts() {
  const r = await client.query("SELECT id, model_id, provider_model_id, provider_endpoint, endpoint_config, capabilities, parameter_mapping FROM ai_studio.provider_models WHERE provider_id='runninghub'");
  let n = 0;
  for (const row of r.rows) {
    const cfg = row.endpoint_config || {};
    const params = Array.isArray(cfg.params) ? cfg.params : [];
    if (!params.length) continue;
    const byKey = new Map(params.map((p) => [String(p.fieldKey || ''), p]));
    const vals = (k) => { const p = byKey.get(k); return Array.isArray(p && p.options) ? p.options.map((o) => (o && typeof o === 'object' ? o.value : o)).filter((x) => x !== undefined && x !== null).map(String) : []; };
    const durations = vals('duration'), resolutions = vals('resolution'), qualities = vals('quality');
    const ratios = vals('aspectRatio').length ? vals('aspectRatio') : vals('ratio');
    let changed = false;
    const nextParams = params.map((p) => { const k = String(p.fieldKey || ''); if (['sound','cameraFixed','multiPrompt','shotType'].includes(k) && p.required === true) { changed = true; return Object.assign({}, p, { required: false }); } return p; });
    const caps = row.capabilities || {};
    const nextCaps = Object.assign({}, caps, {
      input_types: Array.isArray(caps.input_types) && caps.input_types.length ? caps.input_types : ['text'],
      output_types: Array.isArray(caps.output_types) && caps.output_types.length ? caps.output_types : ['video'],
      parameters: Array.from(new Set([...(Array.isArray(caps.parameters) ? caps.parameters : []), ...PLATFORM_PARAMS])),
    });
    if (ratios.length) nextCaps.aspect_ratios = Array.from(new Set([...(Array.isArray(caps.aspect_ratios) ? caps.aspect_ratios : []), ...ratios]));
    if (resolutions.length) nextCaps.resolutions = Array.from(new Set([...(Array.isArray(caps.resolutions) ? caps.resolutions : []), ...resolutions]));
    if (durations.length) nextCaps.durations = Array.from(new Set([...(Array.isArray(caps.durations) ? caps.durations : []), ...durations]));
    let tasks = Array.isArray(row.supported_task_types) ? row.supported_task_types : [];
    if (!tasks.length) { const path = String(row.provider_endpoint || row.provider_model_id || ''); if (path.includes('text-to-video')) tasks = ['t2v','text_to_video']; else if (path.includes('image-to-video')) tasks = ['i2v','image_to_video']; else if (path.includes('text-to-image')) tasks = ['t2i','text_to_image']; else if (path.includes('image-to-image')) tasks = ['i2i','image_to_image']; }
    const maps = Object.assign({}, row.parameter_mapping || {});
    if (byKey.has('generateAudio')) maps.generate_audio = 'generateAudio';
    if (byKey.has('sound')) maps.generate_audio = 'sound';
    if (byKey.has('aspectRatio')) maps.aspect_ratio = 'aspectRatio';
    if (byKey.has('ratio')) maps.aspect_ratio = 'ratio';
    if (byKey.has('firstFrameUrl')) { maps.first_frame_url = 'firstFrameUrl'; maps.image_url = 'firstFrameUrl'; }
    if (byKey.has('lastFrameUrl')) maps.end_frame_url = 'lastFrameUrl';
    if (byKey.has('imageUrls')) maps.image_urls = 'imageUrls';
    await client.query("UPDATE ai_studio.provider_models SET supported_durations=$2::jsonb, supported_resolutions=$3::jsonb, supported_qualities=$4::jsonb, supported_task_types=$5::jsonb, capabilities=$6::jsonb, parameter_mapping=$7::jsonb, endpoint_config=$8::jsonb, mapping_version=COALESCE(mapping_version,0)+1, updated_at=now() WHERE id=$1", [row.id, j(durations), j(resolutions), j(qualities), j(tasks), j(nextCaps), j(maps), j(changed ? Object.assign({}, cfg, { params: nextParams }) : cfg)]);
    n += 1;
  }
  console.log('[contracts] runninghub rows updated:', n);
}

async function retire(sql, label) { const r = await client.query(sql); console.log('[retire]', label, '=>', r.rowCount); }
async function disableMismatched() {
  await retire("UPDATE ai_studio.provider_models SET enabled=false, mapping_version=COALESCE(mapping_version,0)+1, updated_at=now() WHERE model_id='seedance-2.0' AND id NOT IN ('pm_runninghub_seedance20_global_t2v','pm_runninghub_seedance20_global_i2v')", 'seedance-2.0 legacy routes');
  await retire("UPDATE ai_studio.provider_models SET enabled=false, mapping_version=COALESCE(mapping_version,0)+1, updated_at=now() WHERE model_id='kling-3.0' AND (provider_id<>'runninghub' OR (provider_model_id NOT LIKE '%text-to-video' AND provider_model_id NOT LIKE '%image-to-video'))", 'kling-3.0 non-video routes');
  await retire("UPDATE ai_studio.provider_models SET enabled=false, mapping_version=COALESCE(mapping_version,0)+1, updated_at=now() WHERE model_id='seedream-5.0' AND provider_id='volcengine' AND provider_model_id='seedream-5.0'", 'seedream-5.0 legacy route');
  await retire("UPDATE ai_studio.provider_models SET enabled=false, mapping_version=COALESCE(mapping_version,0)+1, updated_at=now() WHERE provider_id='runninghub' AND provider_model_id LIKE '%qwen-image-3.0-pro%' AND model_id IN ('flux-1-dev','flux-1-schnell','flux-2','midjourney-v6.1','midjourney-v7','sd-3.5-large','imagen-4')", 'qwen-image substitutions');
  await retire("UPDATE ai_studio.provider_models SET enabled=false, mapping_version=COALESCE(mapping_version,0)+1, updated_at=now() WHERE model_id IN ('flux-1-pro','flux-1-dev','flux-1-schnell','flux-2','midjourney-v7','midjourney-v6.1','sd-3.5-large') AND provider_id<>'runninghub'", 'non-runninghub flux/mj substitutes');
  await retire("UPDATE ai_studio.provider_models SET enabled=false, mapping_version=COALESCE(mapping_version,0)+1, updated_at=now() WHERE model_id='gpt-image' AND (provider_id='volcengine' OR (provider_id='openai' AND provider_model_id='dall-e-3'))", 'gpt-image substitutes');
  await retire("UPDATE ai_studio.provider_models SET enabled=false, mapping_version=COALESCE(mapping_version,0)+1, updated_at=now() WHERE model_id='wan-2.1' AND provider_model_id='wanx2.1-t2i-turbo'", 'wan t2i substitute');
}

async function ensureSeedream() {
  const r = await client.query("UPDATE ai_studio.provider_models SET supported_resolutions = COALESCE(supported_resolutions,'[]'::jsonb) || '[\"1k\",\"2k\",\"4k\",\"auto\"]'::jsonb, capabilities = jsonb_set(capabilities, '{parameters}', COALESCE(capabilities->'parameters','[]'::jsonb) || $1::jsonb, true), mapping_version=COALESCE(mapping_version,0)+1, updated_at=now() WHERE model_id IN ('seedream-5.0','seedream-4.5') AND provider_id='volcengine' AND provider_model_id IN ('doubao-seedream-5-0-260128','doubao-seedream-4-5-251128')", [j(PLATFORM_PARAMS)]);
  console.log('[seedream] resolution buckets updated:', r.rowCount);
}

function seedanceModel(id, task, endpoint, promptRequired) {
  const isI2V = task === 'i2v';
  const params = [
    { type: 'STRING', label: 'prompt', fieldKey: 'prompt', required: promptRequired, maxLength: 20480, description: 'Text prompt for video generation.' },
    { type: 'LIST', label: 'resolution', fieldKey: 'resolution', required: false, options: opts(SEEDANCE_RES), defaultValue: '720p' },
    { type: 'LIST', label: 'duration', fieldKey: 'duration', required: true, options: opts(DURATIONS), defaultValue: '5' },
  ];
  if (isI2V) {
    params.push({ type: 'STRING', label: 'firstFrameUrl', fieldKey: 'firstFrameUrl', required: true });
    params.push({ type: 'STRING', label: 'lastFrameUrl', fieldKey: 'lastFrameUrl', required: false });
  }
  params.push({ type: 'BOOLEAN', label: 'generateAudio', fieldKey: 'generateAudio', required: false, defaultValue: true });
  params.push({ type: 'LIST', label: 'ratio', fieldKey: 'ratio', required: false, options: opts(RATIOS), defaultValue: 'adaptive' });
  if (isI2V) params.push({ type: 'BOOLEAN', label: 'realPersonMode', fieldKey: 'realPersonMode', required: false, defaultValue: false });
  params.push({ type: 'BOOLEAN', label: 'returnLastFrame', fieldKey: 'returnLastFrame', required: false, defaultValue: false });
  params.push({ type: 'INTEGER', label: 'seed', fieldKey: 'seed', required: false, min: -1, defaultValue: -1 });
  return {
    id, model_id: 'seedance-2.0', provider_id: 'runninghub', provider_model_id: endpoint, enabled: true, priority: 100,
    cost_config: { currency: 'USD', cost_per_output_second: 0.20 },
    parameter_mapping: Object.assign({ aspect_ratio: 'ratio', generate_audio: 'generateAudio' }, isI2V ? { first_frame_url: 'firstFrameUrl', end_frame_url: 'lastFrameUrl' } : {}),
    capabilities: { input_types: isI2V ? ['text','image'] : ['text'], output_types: ['video'], output_type: 'video', resolutions: SEEDANCE_RES, durations: DURATIONS, aspect_ratios: RATIOS, qualities: ['standard','hd'], parameters: PLATFORM_PARAMS.concat(isI2V ? ['firstFrameUrl','lastFrameUrl'] : []), supported_task_types: isI2V ? ['i2v','image_to_video'] : ['t2v','text_to_video'], registry_managed: true, source_api: 'https://www.runninghub.ai/runninghub-api-doc-en/' + (isI2V ? 'api-448184358' : 'api-448184418') },
    endpoint_config: { params, category: 'RunningHub/Seedance', endpoint, providerEndpoint: endpoint, providerModelId: id, output_type: 'video', taskType: isI2V ? 'image-to-video' : 'text-to-video', registry_source: 'RunningHub official OpenAPI docs', registry_version: '2026-10-19' },
    timeout: 900000, max_retries: 1, supports_webhook: false, supports_polling: true, concurrency_limit: 10, rate_limit: 60,
    metadata: { endpoint, registry_managed: true, registry_version: '2026-10-19' }, review_status: 'approved', provider_model_version: '', provider_endpoint: endpoint,
    supported_task_types: isI2V ? ['i2v','image_to_video'] : ['t2v','text_to_video'], supported_resolutions: SEEDANCE_RES, supported_durations: DURATIONS, supported_qualities: ['standard','hd'], supported_regions: ['global'], license_requirements: [], mapping_version: 1,
    specification_reviewed_at: new Date().toISOString(), specification_reviewed_by: 'lead-2026-10-19',
  };
}

async function upsert(table, row) {
  const cols = Object.keys(row);
  const ph = cols.map((_, i) => '$' + (i + 1));
  const upd = cols.filter((c) => c !== 'id').map((c) => c + '=EXCLUDED.' + c).join(', ');
  const values = cols.map((c) => { const v = row[c]; return v instanceof Date ? v.toISOString() : (v !== null && typeof v === 'object' ? JSON.stringify(v) : v); });
  const hasUpdatedAt = table === 'ai_studio.provider_models';
  await client.query('INSERT INTO ' + table + ' (' + cols.join(',') + ', created_at' + (hasUpdatedAt ? ', updated_at' : '') + ') VALUES (' + ph.join(',') + ', now()' + (hasUpdatedAt ? ', now()' : '') + ') ON CONFLICT (id) DO UPDATE SET ' + upd + (hasUpdatedAt ? ', updated_at=now()' : ''), values);
  console.log('[upsert]', table, row.id);
}

function seedancePrice(pmId, id, task) {
  const now = new Date().toISOString();
  return { id, provider_model_id: pmId, version_no: 1, price_type: 'official_public', billing_unit: 'per_output_second', currency: 'USD', price_config: { currency: 'USD', cost_per_output_second: 0.20, cost_per_second: 0.20 }, applicability: { billing: 'per_output_second', task_type: task, durations: DURATIONS, resolution: '720p' }, source_url: 'https://www.runninghub.ai/call-api/search-api/standard-model', source_api: 'https://www.runninghub.ai/runninghub-api-doc-en/' + (task === 'i2v' ? 'api-448184358' : 'api-448184418'), source_observed_at: now, fetched_at: now, effective_at: now, expires_at: null, status: 'active', manually_locked: false, change_summary: { reason: 'Seedance 2.0 Global, observed USD 1.00 for a 5s 720p task', priceSourceObservedOn: '2026-10-19' }, previous_version_id: null, modified_by: 'lead-2026-10-19', approved_by: 'lead-2026-10-19', approved_at: now };
}

async function main() {
  await client.connect();
  await client.query('BEGIN');
  try {
    await updateRunningHubContracts();
    await ensureSeedream();
    await disableMismatched();
    await upsert('ai_studio.provider_models', seedanceModel('pm_runninghub_seedance20_global_t2v', 't2v', SEEDANCE_T2V, true));
    await upsert('ai_studio.provider_models', seedanceModel('pm_runninghub_seedance20_global_i2v', 'i2v', SEEDANCE_I2V, false));
    await upsert('ai_studio.provider_model_price_versions', seedancePrice('pm_runninghub_seedance20_global_t2v', 'pver_runninghub_seedance20_global_t2v_20261019', 't2v'));
    await upsert('ai_studio.provider_model_price_versions', seedancePrice('pm_runninghub_seedance20_global_i2v', 'pver_runninghub_seedance20_global_i2v_20261019', 'i2v'));
    await client.query("UPDATE ai_studio.ai_providers SET available_quota=COALESCE(available_quota,18100), quota_checked_at=now(), balance_checked_at=now(), updated_at=now() WHERE id='runninghub'");
    const check = await client.query("SELECT model_id, provider_id, enabled, provider_model_id FROM ai_studio.provider_models WHERE model_id IN ('seedance-2.0','kling-3.0','seedream-5.0') ORDER BY model_id, enabled DESC, provider_id");
    for (const row of check.rows) console.log(' ', row.model_id, row.provider_id, row.enabled ? 'ON ' : 'off', row.provider_model_id);
    if (APPLY) { await client.query('COMMIT'); console.log('COMMITTED'); } else { await client.query('ROLLBACK'); console.log('DRY RUN ROLLED BACK'); }
  } catch (e) { await client.query('ROLLBACK'); throw e; } finally { await client.end(); }
}
main().catch((e) => { console.error(e); process.exit(1); });
