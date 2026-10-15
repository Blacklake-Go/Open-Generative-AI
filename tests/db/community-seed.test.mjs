import test from 'node:test';
import assert from 'node:assert/strict';

const testUrl = String(process.env.TEST_DATABASE_URL || '').trim();
if (testUrl && process.env.DATABASE_URL && testUrl === process.env.DATABASE_URL) {
  throw new Error('TEST_DATABASE_URL must not be the same as DATABASE_URL.');
}
if (testUrl) process.env.DATABASE_URL = testUrl;

test('community seed uses stable numeric creator IDs and is idempotent', { skip: !testUrl }, async () => {
  const { BUILTIN_COMMUNITY_CASES } = await import('../../lib/community/builtinCases.js');
  const { seedCommunityCases } = await import('../../scripts/seed-community-cases.mjs');
  const { query, closePgPool } = await import('../../lib/db/pg.js');

  try {
    await seedCommunityCases();
    const first = await query(`
      SELECT p.id, p.user_id, p.creation_id, u.role, u.display_name
      FROM ai_studio.community_posts p
      JOIN auth_usr.users u ON u.id = p.user_id
      WHERE p.id = ANY($1::text[])
      ORDER BY p.id
    `, [BUILTIN_COMMUNITY_CASES.map((item) => String(item.id))]);
    assert.equal(first.rows.length, BUILTIN_COMMUNITY_CASES.length);
    assert.ok(first.rows.every((row) => /^[1-9][0-9]{5,63}$/.test(row.user_id)));
    assert.ok(first.rows.every((row) => row.role === 'creator'));
    assert.ok(first.rows.every((row) => row.creation_id === null));

    await seedCommunityCases();
    const second = await query(`
      SELECT p.id, p.user_id
      FROM ai_studio.community_posts p
      WHERE p.id = ANY($1::text[])
      ORDER BY p.id
    `, [BUILTIN_COMMUNITY_CASES.map((item) => String(item.id))]);
    assert.deepEqual(second.rows, first.rows.map(({ id, user_id }) => ({ id, user_id })));
    const allocationCount = await query(`
      SELECT COUNT(*)
      FROM auth_usr.user_id_allocations
      WHERE user_id IN (
        SELECT DISTINCT user_id FROM ai_studio.community_posts WHERE id = ANY($1::text[])
      )
    `, [BUILTIN_COMMUNITY_CASES.map((item) => String(item.id))]);
    assert.equal(Number(allocationCount.rows[0].count), BUILTIN_COMMUNITY_CASES.length);
  } finally {
    await closePgPool();
  }
});
