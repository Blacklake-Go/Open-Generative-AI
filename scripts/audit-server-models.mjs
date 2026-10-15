import path from 'node:path';
import fs from 'node:fs';

async function main() {
  const cwd = process.cwd();
  const { queryMany } = await import(path.join(cwd, 'lib/db/index.js'));
  const { listActiveModels } = await import(path.join(cwd, 'lib/services/models.js'));
  const { isSelectablePublicModel } = await import(path.join(cwd, 'lib/modelCenter/publicDirectory.js'));

  const allDbModels = await queryMany(
    'SELECT id, name, category, status, tier, is_visible, auto_route_eligible FROM ai_studio.ai_models ORDER BY category, id'
  );
  const pricings = await queryMany(
    'SELECT model_id, base_credits, is_active FROM ai_studio.model_pricing WHERE is_active = true'
  );
  const priceMap = new Map(pricings.map(p => [p.model_id, p.base_credits]));

  const routes = await queryMany(
    'SELECT pm.model_id, pm.provider_id, pm.enabled, p.enabled as prov_enabled FROM ai_studio.provider_models pm JOIN ai_studio.ai_providers p ON p.id = pm.provider_id WHERE pm.enabled = true AND p.enabled = true'
  );
  const routeMap = new Map();
  for (const r of routes) {
    if (!routeMap.has(r.model_id)) routeMap.set(r.model_id, []);
    routeMap.get(r.model_id).push(r.provider_id);
  }

  const activeModelsFromService = await listActiveModels();
  const selectableModels = activeModelsFromService.filter(isSelectablePublicModel);
  const selectableIds = new Set(selectableModels.map(m => m.id));

  console.log('=== AUDIT SUMMARY ===');
  console.log('Total AI models in database:', allDbModels.length);
  console.log('Selectable in public directory (api/models/active):', selectableModels.length);
  console.log('Selectable IDs:', [...selectableIds]);

  const unavailable = [];
  const reasonCounts = {};
  const categoryCounts = {};

  for (const m of allDbModels) {
    if (selectableIds.has(m.id)) continue;
    const reasons = [];
    if (m.status !== 'active') reasons.push(`status: ${m.status}`);
    if (m.tier !== 'core') reasons.push(`tier: ${m.tier || 'null'}`);
    if (m.is_visible === false) reasons.push('is_visible: false');
    if (!priceMap.has(m.id) || priceMap.get(m.id) <= 0) reasons.push(`missing/zero price (credits: ${priceMap.get(m.id)})`);
    if (!routeMap.has(m.id) || routeMap.get(m.id).length === 0) reasons.push('no enabled provider routes');

    const svcModel = activeModelsFromService.find(x => x.id === m.id);
    if (svcModel) {
      if (!svcModel.hasWorkingRoute) reasons.push('hasWorkingRoute: false');
      if (!svcModel.auto_route_eligible) reasons.push('auto_route_eligible: false');
      if (!svcModel.is_active) reasons.push('service is_active: false');
    } else {
      reasons.push('excluded from modelsRepo.listActiveModels()');
    }

    const cat = m.category || 'unknown';
    categoryCounts[cat] = (categoryCounts[cat] || 0) + 1;
    for (const r of reasons) {
      reasonCounts[r] = (reasonCounts[r] || 0) + 1;
    }

    unavailable.push({
      id: m.id,
      name: m.name,
      category: m.category,
      tier: m.tier,
      status: m.status,
      isVisible: m.is_visible,
      creditsPrice: priceMap.get(m.id) || null,
      providerRoutes: routeMap.get(m.id) || [],
      reasons: reasons.length > 0 ? reasons : ['failed admission check']
    });
  }

  console.log('\nUnavailable by category:');
  console.table(categoryCounts);

  console.log('\nUnavailable primary reasons breakdown:');
  console.table(reasonCounts);

  fs.writeFileSync('/tmp/audit_models_result.json', JSON.stringify({
    totalDbModels: allDbModels.length,
    selectableCount: selectableModels.length,
    selectableIds: [...selectableIds],
    unavailableCount: unavailable.length,
    unavailableByCategory: categoryCounts,
    unavailableByReason: reasonCounts,
    unavailable
  }, null, 2));

  console.log('\nFull JSON report written to /tmp/audit_models_result.json');
  process.exit(0);
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});
