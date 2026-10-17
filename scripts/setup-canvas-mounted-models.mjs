import { register } from 'node:module';
try {
  register('./server-only-loader.mjs', import.meta.url);
} catch {}

import pg from 'pg';

const client = new pg.Client({
  connectionString: process.env.DATABASE_URL,
});

await client.connect();

console.log('=== 1. Starting DB Migration for Canvas Mounted Models ===');
await client.query('BEGIN');

try {
  // 1. ai_studio.ai_models
  console.log('Inserting/updating ai_studio.ai_models...');
  await client.query(`
    INSERT INTO ai_studio.ai_models (
      id, slug, name, display_name, category, description,
      status, sort, is_featured, capabilities, default_parameters,
      supported_resolutions, supported_durations, supported_ratios,
      supported_input_types, supported_output_types, tier, is_visible,
      auto_route_eligible, is_pinned, created_at, updated_at
    ) VALUES
    (
      'seedream-4.5', 'seedream-4.5', 'Seedream 4.5', 'Seedream 4.5', 'image',
      'ByteDance Seedream 4.5 text-to-image and image-to-image model.',
      'active', 10, true,
      '{"badge": "官方推荐", "is_pinned": true, "supports_reference": true, "supports_edit": false, "aspect_ratios": ["1:1", "16:9", "9:16", "4:3", "3:4", "21:9", "3:2", "2:3", "auto"], "supported_resolutions": ["1024x1024", "1280x720", "720x1280", "1920x1080", "1080x1920", "2048x2048", "3840x2160", "auto"]}'::jsonb,
      '{}'::jsonb,
      '["1024x1024", "1280x720", "720x1280", "1920x1080", "1080x1920", "2048x2048", "3840x2160", "auto"]'::jsonb,
      '[]'::jsonb,
      '["1:1", "16:9", "9:16", "4:3", "3:4", "21:9", "3:2", "2:3", "auto"]'::jsonb,
      '["text", "image"]'::jsonb,
      '["image"]'::jsonb,
      'core', true, true, true, NOW(), NOW()
    ),
    (
      'seedream-5.0-pro', 'seedream-5.0-pro', 'Seedream 5.0 Pro', 'Seedream 5.0 Pro', 'image',
      'ByteDance Seedream 5.0 Pro high-fidelity text-to-image model.',
      'active', 11, true,
      '{"badge": "旗舰画质", "is_pinned": true, "supports_reference": true, "supports_edit": false, "aspect_ratios": ["1:1", "16:9", "9:16", "4:3", "3:4", "21:9", "3:2", "2:3", "auto"], "supported_resolutions": ["1024x1024", "1280x720", "720x1280", "1920x1080", "1080x1920", "2048x2048", "3840x2160", "auto"]}'::jsonb,
      '{}'::jsonb,
      '["1024x1024", "1280x720", "720x1280", "1920x1080", "1080x1920", "2048x2048", "3840x2160", "auto"]'::jsonb,
      '[]'::jsonb,
      '["1:1", "16:9", "9:16", "4:3", "3:4", "21:9", "3:2", "2:3", "auto"]'::jsonb,
      '["text", "image"]'::jsonb,
      '["image"]'::jsonb,
      'core', true, true, true, NOW(), NOW()
    ),
    (
      'seedream-5.0-lite', 'seedream-5.0-lite', 'Seedream 5.0 Lite', 'Seedream 5.0 Lite', 'image',
      'ByteDance Seedream 5.0 Lite fast generation model.',
      'active', 12, false,
      '{"badge": "极速生成", "is_pinned": false, "supports_reference": true, "supports_edit": false, "aspect_ratios": ["1:1", "16:9", "9:16", "4:3", "3:4", "21:9", "3:2", "2:3", "auto"], "supported_resolutions": ["1024x1024", "1280x720", "720x1280", "1920x1080", "1080x1920", "2048x2048", "3840x2160", "auto"]}'::jsonb,
      '{}'::jsonb,
      '["1024x1024", "1280x720", "720x1280", "1920x1080", "1080x1920", "2048x2048", "3840x2160", "auto"]'::jsonb,
      '[]'::jsonb,
      '["1:1", "16:9", "9:16", "4:3", "3:4", "21:9", "3:2", "2:3", "auto"]'::jsonb,
      '["text", "image"]'::jsonb,
      '["image"]'::jsonb,
      'core', true, true, false, NOW(), NOW()
    )
    ON CONFLICT (id) DO UPDATE SET
      slug = EXCLUDED.slug,
      name = EXCLUDED.name,
      display_name = EXCLUDED.display_name,
      category = EXCLUDED.category,
      description = EXCLUDED.description,
      status = EXCLUDED.status,
      sort = EXCLUDED.sort,
      is_featured = EXCLUDED.is_featured,
      capabilities = EXCLUDED.capabilities,
      supported_resolutions = EXCLUDED.supported_resolutions,
      supported_ratios = EXCLUDED.supported_ratios,
      supported_input_types = EXCLUDED.supported_input_types,
      supported_output_types = EXCLUDED.supported_output_types,
      tier = EXCLUDED.tier,
      is_visible = EXCLUDED.is_visible,
      auto_route_eligible = EXCLUDED.auto_route_eligible,
      is_pinned = EXCLUDED.is_pinned,
      updated_at = NOW();
  `);

  // 2. ai_studio.model_pricing
  console.log('Inserting/updating ai_studio.model_pricing...');
  await client.query(`
    INSERT INTO ai_studio.model_pricing (
      id, model_id, pricing_type, base_credits, formula_config,
      subscription_discounts, min_credits, min_gross_margin_rate,
      is_active, site_price_currency, price_locked, pricing_mode,
      created_at, updated_at
    ) VALUES
    ('prc_seedream_4_5', 'seedream-4.5', 'fixed', 15, '{}'::jsonb, '{}'::jsonb, 10, 0.3000, true, 'CNY', false, 'auto', NOW(), NOW()),
    ('prc_seedream_5_0_pro', 'seedream-5.0-pro', 'fixed', 28, '{}'::jsonb, '{}'::jsonb, 10, 0.3000, true, 'CNY', false, 'auto', NOW(), NOW()),
    ('prc_seedream_5_0_lite', 'seedream-5.0-lite', 'fixed', 12, '{}'::jsonb, '{}'::jsonb, 10, 0.3000, true, 'CNY', false, 'auto', NOW(), NOW())
    ON CONFLICT (id) DO UPDATE SET
      model_id = EXCLUDED.model_id,
      pricing_type = EXCLUDED.pricing_type,
      base_credits = EXCLUDED.base_credits,
      is_active = EXCLUDED.is_active,
      min_credits = EXCLUDED.min_credits,
      updated_at = NOW();
  `);

  // 3. ai_studio.provider_models
  console.log('Inserting/updating ai_studio.provider_models...');
  await client.query(`
    INSERT INTO ai_studio.provider_models (
      id, model_id, provider_id, provider_model_id, enabled,
      priority, cost_config, parameter_mapping, capabilities,
      endpoint_config, timeout, max_retries, supports_webhook,
      supports_polling, concurrency_limit, rate_limit, metadata,
      review_status, provider_endpoint, supported_task_types,
      supported_resolutions, supported_durations, supported_qualities,
      supported_regions, license_requirements, mapping_version,
      created_at, updated_at
    ) VALUES
    (
      'pm_seedream_4_5_volcengine', 'seedream-4.5', 'volcengine', 'seedream-4.5', true,
      500, '{"currency": "USD", "base_cost": 0.006944, "unit_cost": 0.006944}'::jsonb, '{}'::jsonb,
      '{"input_types": ["text", "image"], "output_types": ["image"], "aspect_ratios": ["1:1", "16:9", "9:16", "4:3", "3:4", "21:9", "3:2", "2:3", "auto"], "supported_task_types": ["t2i", "i2i", "text_to_image", "image_to_image"]}'::jsonb,
      '{}'::jsonb, 120000, 2, false, true, 10, 60, '{"primary": true}'::jsonb,
      'approved', '/images/generations', '["t2i", "i2i", "text_to_image", "image_to_image"]'::jsonb,
      '["1024x1024", "1280x720", "720x1280", "1920x1080", "1080x1920", "2048x2048", "3840x2160", "auto"]'::jsonb,
      '[]'::jsonb, '[]'::jsonb, '[]'::jsonb, '[]'::jsonb, 1, NOW(), NOW()
    ),
    (
      'pm_seedream_5_0_pro_volcengine', 'seedream-5.0-pro', 'volcengine', 'seedream-5.0-pro', true,
      500, '{"currency": "USD", "base_cost": 0.011111, "unit_cost": 0.011111}'::jsonb, '{}'::jsonb,
      '{"input_types": ["text", "image"], "output_types": ["image"], "aspect_ratios": ["1:1", "16:9", "9:16", "4:3", "3:4", "21:9", "3:2", "2:3", "auto"], "supported_task_types": ["t2i", "i2i", "text_to_image", "image_to_image"]}'::jsonb,
      '{}'::jsonb, 120000, 2, false, true, 10, 60, '{"primary": true}'::jsonb,
      'approved', '/images/generations', '["t2i", "i2i", "text_to_image", "image_to_image"]'::jsonb,
      '["1024x1024", "1280x720", "720x1280", "1920x1080", "1080x1920", "2048x2048", "3840x2160", "auto"]'::jsonb,
      '[]'::jsonb, '[]'::jsonb, '[]'::jsonb, '[]'::jsonb, 1, NOW(), NOW()
    ),
    (
      'pm_seedream_5_0_lite_runninghub', 'seedream-5.0-lite', 'runninghub', 'openapi/v2/bytedance/jimeng-4.6/text-to-image', true,
      500, '{"currency": "USD", "base_cost": 0.025, "unit_cost": 0.025}'::jsonb, '{}'::jsonb,
      '{"input_types": ["text", "image"], "output_types": ["image"], "aspect_ratios": ["1:1", "16:9", "9:16", "4:3", "3:4", "21:9", "3:2", "2:3", "auto"], "supported_task_types": ["t2i", "i2i", "text_to_image", "image_to_image"]}'::jsonb,
      '{}'::jsonb, 120000, 2, false, true, 10, 60, '{"primary": true}'::jsonb,
      'approved', '/task/openapi/create', '["t2i", "i2i", "text_to_image", "image_to_image"]'::jsonb,
      '["1024x1024", "1K", "2K", "4K", "*"]'::jsonb,
      '[]'::jsonb, '[]'::jsonb, '[]'::jsonb, '[]'::jsonb, 1, NOW(), NOW()
    )
    ON CONFLICT (id) DO UPDATE SET
      model_id = EXCLUDED.model_id,
      provider_id = EXCLUDED.provider_id,
      provider_model_id = EXCLUDED.provider_model_id,
      enabled = EXCLUDED.enabled,
      priority = EXCLUDED.priority,
      cost_config = EXCLUDED.cost_config,
      capabilities = EXCLUDED.capabilities,
      review_status = EXCLUDED.review_status,
      provider_endpoint = EXCLUDED.provider_endpoint,
      supported_task_types = EXCLUDED.supported_task_types,
      supported_resolutions = EXCLUDED.supported_resolutions,
      updated_at = NOW();
  `);

  // 4. ai_studio.provider_model_price_versions
  console.log('Inserting/updating ai_studio.provider_model_price_versions...');
  await client.query(`
    INSERT INTO ai_studio.provider_model_price_versions (
      id, provider_model_id, version_no, price_type, billing_unit,
      currency, price_config, applicability, source_api, source_observed_at,
      fetched_at, effective_at, status, manually_locked, change_summary,
      created_at
    ) VALUES
    (
      'pver_seedream_4_5_volcengine', 'pm_seedream_4_5_volcengine', 1, 'manual', 'per_request',
      'USD', '{"currency": "USD", "base_cost": 0.006944}'::jsonb, '{}'::jsonb, 'volcengine_ark', NOW(),
      NOW(), NOW(), 'active', false, '{}'::jsonb, NOW()
    ),
    (
      'pver_seedream_5_0_pro_volcengine', 'pm_seedream_5_0_pro_volcengine', 1, 'manual', 'per_request',
      'USD', '{"currency": "USD", "base_cost": 0.011111}'::jsonb, '{}'::jsonb, 'volcengine_ark', NOW(),
      NOW(), NOW(), 'active', false, '{}'::jsonb, NOW()
    ),
    (
      'pver_seedream_5_0_lite_runninghub', 'pm_seedream_5_0_lite_runninghub', 1, 'manual', 'per_request',
      'USD', '{"currency": "USD", "base_cost": 0.025}'::jsonb, '{}'::jsonb, 'runninghub_openapi', NOW(),
      NOW(), NOW(), 'active', false, '{}'::jsonb, NOW()
    )
    ON CONFLICT (id) DO UPDATE SET
      provider_model_id = EXCLUDED.provider_model_id,
      price_type = EXCLUDED.price_type,
      billing_unit = EXCLUDED.billing_unit,
      currency = EXCLUDED.currency,
      price_config = EXCLUDED.price_config,
      status = EXCLUDED.status,
      effective_at = EXCLUDED.effective_at,
      source_observed_at = EXCLUDED.source_observed_at,
      fetched_at = EXCLUDED.fetched_at;
  `);

  // 5. ai_studio.routing_policies
  console.log('Inserting/updating ai_studio.routing_policies...');
  await client.query(`
    INSERT INTO ai_studio.routing_policies (
      id, model_id, routing_mode, weights, circuit_breaker_config,
      failover_enabled, created_at, updated_at
    ) VALUES
    (
      'rp_seedream_4_5', 'seedream-4.5', 'balanced',
      '{"cost": 0.4, "speed": 0.2, "quality": 0.3, "capacity": 0.1}'::jsonb,
      '{"error_threshold_percentage": 50, "recovery_time_ms": 30000, "minimum_requests": 5}'::jsonb,
      true, NOW(), NOW()
    ),
    (
      'rp_seedream_5_0_pro', 'seedream-5.0-pro', 'balanced',
      '{"cost": 0.4, "speed": 0.2, "quality": 0.3, "capacity": 0.1}'::jsonb,
      '{"error_threshold_percentage": 50, "recovery_time_ms": 30000, "minimum_requests": 5}'::jsonb,
      true, NOW(), NOW()
    ),
    (
      'rp_seedream_5_0_lite', 'seedream-5.0-lite', 'balanced',
      '{"cost": 0.4, "speed": 0.2, "quality": 0.3, "capacity": 0.1}'::jsonb,
      '{"error_threshold_percentage": 50, "recovery_time_ms": 30000, "minimum_requests": 5}'::jsonb,
      true, NOW(), NOW()
    )
    ON CONFLICT (id) DO UPDATE SET
      model_id = EXCLUDED.model_id,
      routing_mode = EXCLUDED.routing_mode,
      weights = EXCLUDED.weights,
      circuit_breaker_config = EXCLUDED.circuit_breaker_config,
      failover_enabled = EXCLUDED.failover_enabled,
      updated_at = NOW();
  `);

  await client.query('COMMIT');
  console.log('=== DB Transaction Committed Successfully ===');
} catch (err) {
  await client.query('ROLLBACK');
  console.error('Migration failed:', err);
  process.exit(1);
} finally {
  await client.end();
}
