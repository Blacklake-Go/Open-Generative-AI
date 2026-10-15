const { getProviderAdapter } = await import('@/lib/adapters/index.js');
const { routeGenerationTask } = await import('@/lib/services/smartRouter.js');
const { queryMany, queryOne } = await import('@/lib/db/index.js');
const models = await queryMany("SELECT id, category FROM ai_studio.ai_models WHERE status='active' ORDER BY id");
let mu = [], off = [], err = [];
for (const m of models) {
  try {
    const d = await routeGenerationTask({ modelId: m.id });
    if (d.selectedProviderId === 'muapi') mu.push(m.id); else off.push(m.id + '->' + d.selectedProviderId + '(' + d.selectedProviderModelId + ')');
  } catch (e) { err.push(m.id + ':' + (e.code || e.message)); }
}
console.log('ACTIVE_MODELS=' + models.length);
console.log('WINNER_MUAPI=' + mu.length);
console.log('WINNER_VENDOR=' + off.length + ' :: ' + off.join(' | '));
console.log('ROUTE_ERRORS=' + err.length + ' :: ' + err.join(' | '));
const chan = await queryMany("SELECT pm.id, pm.model_id, pm.provider_id, pm.provider_model_id, pm.priority, pm.concurrency_limit, pm.enabled, pm.cost_config::text AS cost FROM ai_studio.provider_models pm WHERE pm.model_id IN ('nano-banana','minimax-hailuo-2.3-standard-t2v','hailuo-2.3','imagen-4','kling-2.6') ORDER BY pm.model_id, pm.provider_id");
console.log('CHANNELS=' + JSON.stringify(chan, null, 0));
const prov = await queryOne("SELECT count(*)::int AS n FROM ai_studio.provider_models WHERE provider_id='muapi' AND concurrency_limit < 20");
console.log('MUAPI_CHANNELS_LOW_CONCURRENCY=' + JSON.stringify(prov));
process.exit(0);
