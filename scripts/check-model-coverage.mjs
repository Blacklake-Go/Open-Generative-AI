import 'server-only';
import { queryMany } from '../lib/db/index.js';

async function main() {
  const missingFromLegacy = await queryMany(`
    SELECT id, name, provider, type
    FROM models_config
    WHERE LOWER(id) NOT IN (SELECT LOWER(id) FROM ai_studio.ai_models)
  `);
  console.log('Models in legacy models_config NOT in ai_models:', missingFromLegacy.length);
  if (missingFromLegacy.length > 0) {
    console.log('First 20 missing from legacy:', missingFromLegacy.slice(0, 20));
  }

  const mainstreamKeywords = [
    'kling', 'minimax', 'hailuo', 'wan', 'seedream', 'seedance', 'veo', 'imagen', 'gemini',
    'sora', 'gpt', 'dall', 'midjourney', 'flux', 'luma', 'runway', 'vidu', 'pika', 'hunyuan',
    'grok', 'suno', 'udio', 'speech', 'voice'
  ];

  const summary = {};
  for (const kw of mainstreamKeywords) {
    const res = await queryMany(`
      SELECT
        COUNT(*)::int AS total,
        COUNT(*) FILTER (WHERE status = 'active')::int AS active
      FROM ai_studio.ai_models
      WHERE id ILIKE $1 OR name ILIKE $1
    `, [`%${kw}%`]);
    summary[kw] = res[0];
  }
  console.log('Mainstream keyword coverage in ai_models:');
  console.table(summary);
}

main().catch(console.error);
