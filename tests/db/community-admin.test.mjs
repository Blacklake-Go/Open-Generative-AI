import test from 'node:test';
import assert from 'node:assert/strict';

const testUrl = String(process.env.TEST_DATABASE_URL || '').trim();
if (testUrl && process.env.DATABASE_URL && testUrl === process.env.DATABASE_URL) {
  throw new Error('TEST_DATABASE_URL must not be the same as DATABASE_URL.');
}
if (testUrl) process.env.DATABASE_URL = testUrl;

const db = await import('../../lib/db/index.js');
const { allocateUserId } = await import('../../lib/auth/user-id.js');
const authRepo = await import('../../lib/repositories/auth.js');
const communityRepo = await import('../../lib/repositories/community.js');

async function seedUser() {
  const id = await allocateUserId({
    reserve: (candidate, digits) => authRepo.reserveUserId(candidate, digits),
    findFirstAvailable: (digits) => authRepo.findFirstAvailableUserId(digits),
    isExhausted: (digits) => authRepo.isUserIdPoolExhausted(digits),
  });
  await db.execute(
    'INSERT INTO users (id, email, password_hash, password_salt, role, credits, status) VALUES ($1, $2, $3, $4, $5, 0, $6)',
    [id, `${id}@example.test`, 'hash', 'salt', 'user', 'active'],
  );
  return id;
}

test('admin community repository filters, summarizes, and updates posts safely', { skip: !testUrl }, async () => {
  await (await import('../../lib/db/migrations.js')).runMigrations();
  const userId = await seedUser();
  const postId = `community_admin_${Date.now()}_${Math.random().toString(16).slice(2)}`;
  try {
    await db.execute(`
      INSERT INTO ai_studio.community_posts
        (id, user_id, title, description, media_type, media_url, cover_url, prompt, model_name, tags, status, is_featured)
      VALUES ($1, $2, 'Admin integration seed', 'seed description', 'image', 'https://example.test/image.png',
        'https://example.test/cover.png', 'seed prompt', 'test-model', ARRAY['seed'], 'published', FALSE)
    `, [postId, userId]);

    const listed = await communityRepo.listAdminCommunityPosts({ q: 'integration seed', mediaType: 'image', featured: 'false' });
    const row = listed.rows.find((item) => item.id === postId);
    assert.ok(row, 'filtered admin listing should include the seeded post');
    assert.ok(Number(listed.summary.total) >= 1);

    const updated = await communityRepo.updateCommunityPostForAdmin(postId, {
      title: 'Admin integration updated',
      description: 'updated description',
      modelName: 'test-model-v2',
      tags: ['safe', 'checked'],
      status: 'hidden',
      isFeatured: true,
    });
    assert.equal(updated.title, 'Admin integration updated');
    assert.equal(updated.status, 'hidden');
    assert.equal(updated.is_featured, true);
    assert.deepEqual(updated.tags, ['safe', 'checked']);

    await assert.rejects(
      () => communityRepo.updateCommunityPostForAdmin(postId, { status: 'DROP TABLE community_posts' }),
      /作品状态无效/,
    );
    assert.equal(await communityRepo.updateCommunityPostForAdmin('missing-community-post', { title: 'missing' }), null);
  } finally {
    await db.execute('DELETE FROM ai_studio.community_posts WHERE id = $1', [postId]).catch(() => {});
    await db.execute('DELETE FROM auth_usr.users WHERE id = $1', [userId]).catch(() => {});
    await db.execute('DELETE FROM auth_usr.user_id_allocations WHERE user_id = $1', [userId]).catch(() => {});
    await db.closePgPool();
  }
});
