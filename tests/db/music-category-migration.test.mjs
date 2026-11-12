import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';

const testUrl = String(process.env.TEST_DATABASE_URL || '').trim();
if (testUrl && process.env.DATABASE_URL && testUrl === process.env.DATABASE_URL) {
  throw new Error('TEST_DATABASE_URL must not be the same as DATABASE_URL.');
}
if (testUrl) process.env.DATABASE_URL = testUrl;

const db = testUrl ? await import('../../lib/db/index.js') : null;

test('music category migration is idempotent and splits legacy canvas audio mounts without losing models', {
  skip: !testUrl,
}, async () => {
  const { migrationStatements } = await import('../../lib/db/migrations.js');
  const sql = await fs.readFile(path.join(process.cwd(), 'lib/db/migrations', '083_music_capability_category.sql'), 'utf8');
  const statements = migrationStatements(sql);
  assert.ok(statements.length >= 3, 'migration should contain the constraint, backfill and canvas config statements');

  const suffix = `${Date.now()}_${Math.random().toString(16).slice(2, 10)}`;
  const musicId = `music_fixture_${suffix}`;
  const speechId = `speech_fixture_${suffix}`;
  const invalidId = `invalid_fixture_${suffix}`;
  const settingsKey = 'canvas_model_config';

  const apply = async () => {
    for (const statement of statements) await db.execute(statement);
  };

  try {
    // 迁移器已应用过 083；此处写入旧形态数据后重放，验证回填、拆分与幂等。
    await db.execute(`INSERT INTO ai_studio.ai_models
      (id,slug,name,display_name,category,status,tier,is_visible,auto_route_eligible,capabilities)
      VALUES ($1,$1,'Music fixture','Music fixture','audio','active','core',TRUE,TRUE,'{"modality":"music"}'::jsonb)`,
    [musicId]);
    await db.execute(`INSERT INTO ai_studio.ai_models
      (id,slug,name,display_name,category,status,tier,is_visible,auto_route_eligible,capabilities)
      VALUES ($1,$1,'Speech fixture','Speech fixture','audio','active','core',TRUE,TRUE,'{"sub_type":"speech"}'::jsonb)`,
    [speechId]);

    const legacyConfig = {
      schemaVersion: 1,
      mountedModelIds: { image: [], video: [], text: [], audio: [speechId, musicId] },
      defaults: {
        imageModelId: '', videoModelId: '', textModelId: '',
        audioModelId: musicId, musicModelId: '',
        canvasImageCount: '2', audioVoice: 'alloy', audioFormat: 'mp3',
        audioSpeed: '1', audioInstructions: '', systemPrompt: 'system prompt',
      },
    };
    await db.execute(`INSERT INTO ops_bill.system_settings (key,value_json,visibility)
      VALUES ($1,$2::jsonb,'private')
      ON CONFLICT (key) DO UPDATE SET value_json = EXCLUDED.value_json`, [settingsKey, JSON.stringify(legacyConfig)]);

    await apply();

    const musicRow = await db.queryOne('SELECT category FROM ai_studio.ai_models WHERE id = $1', [musicId]);
    assert.equal(musicRow.category, 'music');
    const speechRow = await db.queryOne('SELECT category FROM ai_studio.ai_models WHERE id = $1', [speechId]);
    assert.equal(speechRow.category, 'audio');

    const first = await db.queryOne('SELECT value_json FROM ops_bill.system_settings WHERE key = $1', [settingsKey]);
    const firstConfig = first.value_json;
    assert.deepEqual(firstConfig.mountedModelIds.audio, [speechId]);
    assert.deepEqual(firstConfig.mountedModelIds.music, [musicId]);
    assert.equal(firstConfig.defaults.audioModelId, speechId);
    assert.equal(firstConfig.defaults.musicModelId, musicId);
    // 迁移只处理挂载与默认值，不丢其他编辑器默认配置。
    assert.equal(firstConfig.defaults.canvasImageCount, '2');
    assert.equal(firstConfig.defaults.systemPrompt, 'system prompt');

    await apply();

    const second = await db.queryOne('SELECT value_json FROM ops_bill.system_settings WHERE key = $1', [settingsKey]);
    assert.deepEqual(second.value_json, firstConfig);
    const afterSecond = await db.queryOne('SELECT category FROM ai_studio.ai_models WHERE id = $1', [musicId]);
    assert.equal(afterSecond.category, 'music');

    // CHECK 约束实际接受 music，并继续拒绝未定义类别。
    const accepted = await db.queryOne(`SELECT category FROM ai_studio.ai_models WHERE id = $1`, [musicId]);
    assert.equal(accepted.category, 'music');
    await assert.rejects(
      db.execute(`INSERT INTO ai_studio.ai_models (id,slug,name,display_name,category,status)
        VALUES ($1,$1,'Invalid fixture','Invalid fixture','bogus','active')`, [invalidId]),
      (error) => error.code === '23514' || /category_check/.test(String(error.message)),
    );
  } finally {
    await db.execute('DELETE FROM ai_studio.ai_models WHERE id = $1', [musicId]);
    await db.execute('DELETE FROM ai_studio.ai_models WHERE id = $1', [speechId]);
    await db.execute('DELETE FROM ai_studio.ai_models WHERE id = $1', [invalidId]);
    await db.execute('DELETE FROM ops_bill.system_settings WHERE key = $1', [settingsKey]);
  }
});
