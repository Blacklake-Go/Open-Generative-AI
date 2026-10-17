import test from 'node:test';
import assert from 'node:assert/strict';
import { register } from 'node:module';

try {
  register('../scripts/server-only-loader.mjs', import.meta.url);
} catch {}

if (!process.env.DATABASE_URL) {
  try {
    process.loadEnvFile?.('.env.local');
  } catch {}
}

const { createSession, deleteSession } = await import('../lib/services/auth.js');
const { GET } = await import('../app/api/canvas/models/route.js');
const { query, closePgPool } = await import('../lib/db/index.js');

test('GET /api/canvas/models returns mounted seedream models with correct capabilities and pricing', async () => {
  // Ensure volcengine and runninghub health is fresh
  await query("UPDATE ai_studio.ai_providers SET last_health_check_at = NOW(), health_status = 'healthy' WHERE id IN ('volcengine', 'runninghub')");

  // Get active test user
  const userRes = await query("SELECT id FROM users WHERE status = 'active' LIMIT 1");
  assert.ok(userRes.rows.length > 0, 'Must have at least one active user in DB');
  const userId = userRes.rows[0].id;

  // Create session
  const { token } = await createSession(userId);

  try {
    const request = new Request('https://canvas.supdance.com/api/canvas/models', {
      method: 'GET',
      headers: {
        origin: 'https://canvas.supdance.com',
        cookie: `ko_session=${token}`,
      },
    });

    const response = await GET(request);
    assert.equal(response.status, 200, `Expected 200 OK, got ${response.status}`);

    const body = await response.json();
    assert.ok(Array.isArray(body.models), 'Response body must contain models array');

    const modelMap = new Map(body.models.map((m) => [m.id, m]));

    // Check seedream-4.5
    assert.ok(modelMap.has('seedream-4.5'), 'Must return seedream-4.5');
    const m45 = modelMap.get('seedream-4.5');
    assert.equal(m45.capability, 'image');
    assert.equal(m45.available, true);
    assert.equal(m45.creditsPrice, 15);
    assert.equal(m45.supportsReference, true);

    // Check seedream-5.0-pro
    assert.ok(modelMap.has('seedream-5.0-pro'), 'Must return seedream-5.0-pro');
    const m50pro = modelMap.get('seedream-5.0-pro');
    assert.equal(m50pro.capability, 'image');
    assert.equal(m50pro.available, true);
    assert.equal(m50pro.creditsPrice, 28);
    assert.equal(m50pro.supportsReference, true);

    // Check seedream-5.0-lite
    assert.ok(modelMap.has('seedream-5.0-lite'), 'Must return seedream-5.0-lite');
    const m50lite = modelMap.get('seedream-5.0-lite');
    assert.equal(m50lite.capability, 'image');
    assert.equal(m50lite.available, true);
    assert.equal(m50lite.creditsPrice, 12);
    assert.equal(m50lite.supportsReference, true);

    console.log('Verified models in /api/canvas/models:');
    console.log('- seedream-4.5:', m45.name, `(${m45.creditsPrice} credits)`);
    console.log('- seedream-5.0-pro:', m50pro.name, `(${m50pro.creditsPrice} credits)`);
    console.log('- seedream-5.0-lite:', m50lite.name, `(${m50lite.creditsPrice} credits)`);
  } finally {
    await deleteSession(token);
    await closePgPool();
  }
});
