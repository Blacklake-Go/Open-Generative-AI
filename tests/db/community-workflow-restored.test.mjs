import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

if (process.env.SUPDANCE_RESTORED_DRILL !== 'true' || new URL(process.env.DATABASE_URL).hostname !== 'one-db') throw new Error('Named restored ONE database required');
const storage = await mkdtemp(join(tmpdir(), 'supdance-community-media-'));
process.env.AMH_STORAGE_DIR = storage;
process.env.STORAGE_PROVIDER = 'amh';
const db = await import('../../lib/db/index.js');
const { allocateUserId } = await import('../../lib/auth/user-id.js');
const auth = await import('../../lib/repositories/auth.js');
const assets = await import('../../lib/repositories/assets.js');
const posts = await import('../../lib/repositories/community.js');
const { submitCommunityWork, moderateCommunityWork, listOwnCommunitySubmissions } = await import('../../lib/community/submissions.js');
const { serveCommunityMedia } = await import('../../lib/community/media.js');

async function seedUser(role = 'user') {
  const id = await allocateUserId({ reserve: (value, digits) => auth.reserveUserId(value, digits),
    findFirstAvailable: (digits) => auth.findFirstAvailableUserId(digits), isExhausted: (digits) => auth.isUserIdPoolExhausted(digits) });
  await db.execute("INSERT INTO auth_usr.users(id,email,role,credits,status) VALUES($1,$2,$3,0,'active')", [id, `${id}@example.test`, role]);
  return { id, role };
}

test('owned asset -> pending -> review -> public media -> hidden -> withdrawn preserves assets', async () => {
  await db.execute(await readFile('lib/db/migrations/089_supdance_community_workflow.sql', 'utf8'));
  const owner = await seedUser(); const stranger = await seedUser(); const moderator = await seedUser('operations_admin');
  const image = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aV2kAAAAASUVORK5CYII=', 'base64');
  await mkdir(join(storage, 'qa'), { recursive: true });
  await writeFile(join(storage, 'qa/owned.png'), image);
  const asset = await assets.createUserAsset({ userId: owner.id, assetType: 'image', kind: 'image', title: 'QA owned image', objectKey: 'qa/owned.png',
    mediaUrl: '/private/owned', mimeType: 'image/png', visibility: 'private', fileSizeBytes: image.length });
  await assert.rejects(() => submitCommunityWork({ userId: stranger.id, assetId: asset.id, title: 'forged owner' }), { code: 'COMMUNITY_ASSET_NOT_OWNED' });
  const post = await submitCommunityWork({ userId: owner.id, assetId: asset.id, title: 'QA creator submission', mediaUrl: 'https://untrusted.example/override', status: 'published' });
  assert.equal(post.status, 'pending');
  assert.equal(post.media_url, `/api/community/posts/${post.id}/media`);
  assert.equal((await submitCommunityWork({ userId: owner.id, assetId: asset.id, title: 'retry' })).id, post.id);
  assert.equal(await posts.getCommunityPostById(post.id, owner.id), null);
  assert.equal((await serveCommunityMedia(post.id)).status, 404);
  assert.equal((await serveCommunityMedia(post.id, stranger)).status, 404);
  assert.deepEqual(Buffer.from(await (await serveCommunityMedia(post.id, owner)).arrayBuffer()), image);
  await assert.rejects(() => posts.toggleCommunityLike(post.id, stranger.id), { code: 'COMMUNITY_NOT_FOUND' });
  await assert.rejects(() => posts.addCommunityComment({ postId: post.id, userId: stranger.id, content: 'hidden comment' }), { code: 'COMMUNITY_NOT_FOUND' });
  await assert.rejects(() => posts.recordRemixCount(post.id), { code: 'COMMUNITY_NOT_FOUND' });
  assert.ok((await listOwnCommunitySubmissions(owner.id)).submissions.some((row) => row.id === post.id));
  assert.ok(!(await listOwnCommunitySubmissions(stranger.id)).submissions.some((row) => row.id === post.id));
  await assert.rejects(() => moderateCommunityWork(post.id, { status: 'published' }, owner, 1), { code: 'FORBIDDEN' });
  await assert.rejects(() => moderateCommunityWork(post.id, { status: 'published' }, { ...owner, role: 'admin' }, 1), { code: 'FORBIDDEN' });
  const published = await moderateCommunityWork(post.id, { status: 'published', moderationReason: 'reviewed QA asset' }, moderator, 1);
  assert.equal(published.moderation_version, 2);
  assert.ok(await posts.getCommunityPostById(post.id));
  const publicMedia = await serveCommunityMedia(post.id);
  assert.equal(publicMedia.headers.get('cache-control'), 'no-store');
  assert.deepEqual(Buffer.from(await publicMedia.arrayBuffer()), image);
  await assert.rejects(() => moderateCommunityWork(post.id, { status: 'hidden', moderationReason: 'stale review' }, moderator, 1), { code: 'COMMUNITY_VERSION_CONFLICT' });
  await moderateCommunityWork(post.id, { status: 'hidden', moderationReason: 'QA withdrawal verification' }, moderator, 2);
  assert.equal(await posts.getCommunityPostById(post.id), null);
  assert.equal((await serveCommunityMedia(post.id)).status, 404);
  assert.equal(await posts.deleteCommunityPost(post.id, stranger.id), false);
  assert.equal(await posts.deleteCommunityPost(post.id, owner.id), true);
  assert.equal((await db.queryOne('SELECT status FROM ai_studio.community_posts WHERE id=$1', [post.id])).status, 'withdrawn');
  assert.equal((await assets.getUserAssetById(owner.id, asset.id)).status, 'ready');
  assert.equal((await db.queryOne('SELECT count(*)::int count FROM ai_studio.community_moderation_events WHERE post_id=$1', [post.id])).count, 4);
});

test('pagination has no double offset and featured filtering is applied', async () => {
  const owner = await seedUser();
  const prefix = `qa-pagination-${Date.now()}`;
  for (let index = 0; index < 6; index++) {
    await db.execute(`INSERT INTO ai_studio.community_posts(id,user_id,title,media_type,media_url,status,is_featured,created_at)
      VALUES($1,$2,$3,'image','/qa/image','published',$4,$5)`, [`${prefix}-${index}`, owner.id, prefix, index % 2 === 0, new Date(Date.now() + index * 1000).toISOString()]);
  }
  const first = await posts.listCommunityPosts({ q: prefix, sort: 'newest', limit: 2, offset: 0 });
  const second = await posts.listCommunityPosts({ q: prefix, sort: 'newest', limit: 2, offset: 2 });
  const third = await posts.listCommunityPosts({ q: prefix, sort: 'newest', limit: 2, offset: 4 });
  assert.equal(new Set([...first, ...second, ...third].map((row) => row.id)).size, 6);
  assert.deepEqual(first.map((row) => row.id), [`${prefix}-5`, `${prefix}-4`]);
  assert.deepEqual(second.map((row) => row.id), [`${prefix}-3`, `${prefix}-2`]);
  const featured = await posts.listCommunityPosts({ q: prefix, featuredOnly: true });
  assert.equal(featured.length, 3);
  assert.ok(featured.every((row) => row.is_featured));
});

test.after(async () => { await db.closePgPool(); await rm(storage, { recursive: true, force: true }); });
