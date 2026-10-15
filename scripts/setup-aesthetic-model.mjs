import pg from 'pg';

const { Pool } = pg;
const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://postgres@127.0.0.1:5432/koyosim_ai',
});

async function main() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    console.log('Connecting and configuring image-aesthetic-v8.2...');

    // 1. Upsert canonical model in ai_studio.ai_models
    await client.query(`
      INSERT INTO ai_studio.ai_models (
        id, slug, name, display_name, category, description, status, sort,
        is_visible, tier, auto_route_eligible, capabilities
      ) VALUES (
        'image-aesthetic-v8.2',
        'image-aesthetic-v8-2',
        '图片美学模型 V8.2',
        '图片美学模型 V8.2',
        'image',
        '专注美学创作，生成高美感、艺术感图片',
        'active',
        3,
        true,
        'core',
        true,
        jsonb_build_object(
          'badge', '✦',
          'description', '专注美学创作，生成高美感、艺术感图片',
          'aspect_ratios', jsonb_build_array('1:1', '4:3', '3:4', '16:9', '9:16', '3:2', '2:3'),
          'resolutions', jsonb_build_array('1024x1024', '2048x2048', 'auto'),
          'supported_task_types', jsonb_build_array('t2i', 'i2i', 'text_to_image', 'image_to_image'),
          'supported_input_types', jsonb_build_array('text', 'image')
        )
      )
      ON CONFLICT (id) DO UPDATE SET
        name = EXCLUDED.name,
        display_name = EXCLUDED.display_name,
        category = EXCLUDED.category,
        description = EXCLUDED.description,
        status = 'active',
        sort = 3,
        is_visible = true,
        tier = 'core',
        auto_route_eligible = true,
        capabilities = EXCLUDED.capabilities,
        updated_at = NOW();
    `);

    // 2. Set pricing in ai_studio.model_pricing
    await client.query(`
      INSERT INTO ai_studio.model_pricing (
        id, model_id, base_credits, pricing_type, is_active, updated_at
      ) VALUES (
        'mp_image_aesthetic_v82', 'image-aesthetic-v8.2', 25, 'fixed', true, NOW()
      )
      ON CONFLICT (model_id) DO UPDATE SET
        base_credits = 25,
        pricing_type = 'fixed',
        is_active = true,
        updated_at = NOW();
    `);

    // 3. Connect RunningHub provider_models mapping
    const pmCheck = await client.query(`
      SELECT id FROM ai_studio.provider_models 
      WHERE model_id = 'image-aesthetic-v8.2' AND provider_id = 'runninghub'
    `);
    
    let pmId;
    if (pmCheck.rows.length === 0) {
      const pmRes = await client.query(`
        INSERT INTO ai_studio.provider_models (
          id, model_id, provider_id, provider_model_id, enabled, priority,
          cost_config, endpoint_config, review_status, provider_endpoint,
          supported_task_types, supported_resolutions
        ) VALUES (
          'pm_aesthetic_v82_rh',
          'image-aesthetic-v8.2',
          'runninghub',
          'openapi/v2/youchuan/text-to-image-v82',
          true,
          100,
          jsonb_build_object('currency', 'USD', 'base_cost', 0.025),
          jsonb_build_object('endpoint', '/openapi/v2/youchuan/text-to-image-v82'),
          'approved',
          '/openapi/v2/youchuan/text-to-image-v82',
          jsonb_build_array('t2i', 'i2i', 'text_to_image'),
          jsonb_build_array('1024x1024', '2048x2048', 'auto')
        ) RETURNING id;
      `);
      pmId = pmRes.rows[0].id;
    } else {
      pmId = pmCheck.rows[0].id;
      await client.query(`
        UPDATE ai_studio.provider_models SET
          enabled = true,
          review_status = 'approved',
          provider_endpoint = '/openapi/v2/youchuan/text-to-image-v82',
          cost_config = jsonb_build_object('currency', 'USD', 'base_cost', 0.025),
          updated_at = NOW()
        WHERE id = $1
      `, [pmId]);
    }

    // 4. Ensure active price version for this provider_model
    const pvCheck = await client.query(`
      SELECT id FROM ai_studio.provider_model_price_versions
      WHERE provider_model_id = $1 AND status = 'active'
    `, [pmId]);

    if (pvCheck.rows.length === 0) {
      await client.query(`
        INSERT INTO ai_studio.provider_model_price_versions (
          id, provider_model_id, version_no, price_type, billing_unit, currency,
          price_config, status, created_at, effective_at
        ) VALUES (
          'pver_aesthetic_v82_' || substr(md5(random()::text), 1, 8),
          $1, 1, 'official_public', 'call', 'USD',
          jsonb_build_object('currency', 'USD', 'base_cost', 0.025),
          'active', NOW(), NOW()
        );
      `, [pmId]);
    }

    // 5. Update sort order of all image models to guarantee clean sequence
    await client.query(`
      UPDATE ai_studio.ai_models SET sort = 1, is_visible = true WHERE id = 'seedream-5.0-pro';
      UPDATE ai_studio.ai_models SET sort = 2, is_visible = true WHERE id = 'seedream-5.0-flash';
      UPDATE ai_studio.ai_models SET sort = 3, is_visible = true WHERE id = 'image-aesthetic-v8.2';
      UPDATE ai_studio.ai_models SET sort = 4, is_visible = true WHERE id = 'seedream-5.0-lite';
      UPDATE ai_studio.ai_models SET sort = 5, is_visible = true WHERE id = 'seedream-4.5';
      UPDATE ai_studio.ai_models SET is_visible = false WHERE id = 'seedream-5.0-edit';
      UPDATE ai_studio.ai_models SET is_visible = false, backup_model_id = 'seedream-4.5' WHERE id = 'seedream-4.0';
      UPDATE ai_studio.ai_models SET is_visible = false, backup_model_id = 'image-aesthetic-v8.2' WHERE id = 'rh-youchuan-text-to-image-v82-a8366f77';
    `);

    await client.query('COMMIT');
    console.log('Successfully set up image-aesthetic-v8.2 and refreshed sort sequence!');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Failed to configure aesthetic model:', err);
    throw err;
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch(() => process.exit(1));
