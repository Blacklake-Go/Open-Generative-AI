const { getProviderAdapter } = await import('@/lib/adapters/index.js');
const { routeGenerationTask } = await import('@/lib/services/smartRouter.js');
const { queryMany } = await import('@/lib/db/index.js');
const models = await queryMany("SELECT id, category FROM ai_studio.ai_models WHERE status='active' ORDER BY category, id");
const keyCache = {};
async function hasKey(p) { if (!(p in keyCache)) { try { const a = await getProviderAdapter(p); keyCache[p] = Boolean(a.apiKey); } catch { keyCache[p] = false; } } return keyCache[p]; }
const rows = [];
for (const m of models) {
  try {
    const d = await routeGenerationTask({ modelId: m.id });
    const sel = d.selectedProviderId;
    rows.push({ model: m.id, cat: m.category, selected: sel, pmid: d.selectedProviderModelId, score: d.finalScore, keyOk: await hasKey(sel), candidates: d.allCandidates.map((c) => c.providerId + '=' + c.totalScore).join(',') });
  } catch (e) { rows.push({ model: m.id, cat: m.category, error: e.code || e.message }); }
}
console.log('PROVIDER_KEY_AVAILABILITY=' + JSON.stringify(keyCache));
const bad = rows.filter((r) => r.error || !r.keyOk);
console.log('TOTAL=' + rows.length + ' WOULD_FAIL_WITHOUT_VENDOR_KEYS=' + bad.length);
console.log('---- models whose winning channel has NO credential (would fail even with MuAPI key) ----');
for (const r of bad) console.log(JSON.stringify(r));
console.log('---- models whose winning channel is muapi (OK once MUAPI_API_KEY set) ----');
console.log(rows.filter((r) => r.keyOk).map((r) => r.model + '(' + r.cat + ')').join(', '));
process.exit(0);
