import 'server-only';
import { execute } from '../lib/db/index.js';

async function fix() {
  console.log('Fixing zero-cost and disabled muapi channels...');

  // 1. Update all provider_models with base_cost = 0 or NULL to realistic costs
  const res1 = await execute(`
    UPDATE ai_studio.provider_models pm
    SET cost_config = jsonb_build_object(
      'base_cost', CASE 
        WHEN m.category = 'video' THEN 0.05 
        WHEN m.category = 'audio' THEN 0.015 
        ELSE 0.025 
      END,
      'currency', 'USD'
    ),
    enabled = true,
    updated_at = now()
    FROM ai_studio.ai_models m
    WHERE m.id = pm.model_id
      AND pm.enabled = true
      AND COALESCE((pm.cost_config->>'base_cost')::numeric, 0) = 0
      AND COALESCE((pm.cost_config->>'cost_per_output_second')::numeric, 0) = 0
      AND COALESCE((pm.cost_config->>'cost_per_second')::numeric, 0) = 0
  `);
  console.log('Updated zero-cost channels:', res1);

  // 2. Enable muapi channels for models that currently only have unconfigured official providers
  const res2 = await execute(`
    UPDATE ai_studio.provider_models pm
    SET enabled = true,
        cost_config = jsonb_build_object(
          'base_cost', CASE 
            WHEN m.category = 'video' THEN 0.05 
            WHEN m.category = 'audio' THEN 0.015 
            ELSE 0.025 
          END,
          'currency', 'USD'
        ),
        updated_at = now()
    FROM ai_studio.ai_models m
    WHERE m.id = pm.model_id
      AND pm.provider_id = 'muapi'
      AND pm.enabled = false
      AND NOT EXISTS (
        SELECT 1 FROM ai_studio.provider_models pm2
        JOIN ai_studio.ai_providers p2 ON p2.id = pm2.provider_id AND p2.enabled = true
        WHERE pm2.model_id = pm.model_id AND pm2.enabled = true
          AND p2.id IN ('kling', 'minimax', 'volcengine', 'google')
      )
  `);
  console.log('Enabled fallback muapi channels:', res2);

  console.log('Done fixing channel costs!');
}

fix().catch(console.error);
