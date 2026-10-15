import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { NextRequest } from 'next/server';

const testUrl = String(process.env.TEST_DATABASE_URL || '').trim();
if (testUrl && process.env.DATABASE_URL && testUrl === process.env.DATABASE_URL) {
  throw new Error('TEST_DATABASE_URL must not be the same as DATABASE_URL.');
}
if (testUrl) process.env.DATABASE_URL = testUrl;
process.env.PUBLIC_APP_URL = 'http://127.0.0.1:3100';

const db = await import('../../lib/db/index.js');
const authService = await import('../../lib/services/auth.js');
const authRepo = await import('../../lib/repositories/auth.js');
const { allocateUserId } = await import('../../lib/auth/user-id.js');
const assetsRoute = await import('../../app/api/assets/route.js');
const assetDetailRoute = await import('../../app/api/assets/[id]/route.js');
const assetDownloadRoute = await import('../../app/api/assets/[id]/download/route.js');
const assetBatchRoute = await import('../../app/api/assets/batch/route.js');
const assetFolderRoute = await import('../../app/api/assets/folders/[id]/route.js');
const creationsRoute = await import('../../app/api/creations/route.js');
const ledgerRoute = await import('../../app/api/financial/credits/ledger/route.js');
const adminCommunityRoute = await import('../../app/api/admin/community/posts/route.js');

const origin = 'http://127.0.0.1:3100';

function nextRequest(path, token, method = 'GET', body) {
  const headers = new Headers({ Origin: origin });
  if (body !== undefined) headers.set('Content-Type', 'application/json');
  if (token) headers.set('Cookie', `ko_session=${token}`);
  return new NextRequest(new URL(path, origin), {
    method,
    headers,
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}

async function seedUser(label, role = 'user') {
  const id = await allocateUserId({
    reserve: (candidate, digits) => authRepo.reserveUserId(candidate, digits),
    findFirstAvailable: (digits) => authRepo.findFirstAvailableUserId(digits),
    isExhausted: (digits) => authRepo.isUserIdPoolExhausted(digits),
  });
  await db.execute(
    'INSERT INTO users (id, email, password_hash, password_salt, role, credits, status) VALUES ($1, $2, $3, $4, $5, 0, $6)',
    [id, `isolation-${label}-${crypto.randomUUID()}@example.test`, 'test-hash', 'test-salt', role, 'active'],
  );
  return id;
}

test('authenticated user asset, creation, and credit APIs return only that user data', { skip: !testUrl }, async () => {
  let userA;
  let userB;
  let assetA;
  let cosAssetA;
  let folderA;
  let creationA;
  let creationB;
  try {
    userA = await seedUser('a');
    userB = await seedUser('b');
    const sessionA = await authService.createSession(userA);
    const sessionB = await authService.createSession(userB);

    assetA = `ast_isolation_${crypto.randomUUID()}`;
    folderA = `fld_isolation_${crypto.randomUUID()}`;
    creationA = `cr_isolation_a_${crypto.randomUUID()}`;
    creationB = `cr_isolation_b_${crypto.randomUUID()}`;
    await db.execute(
      `INSERT INTO ai_studio.creations (id, user_id, studio_id, label, result_url, status)
       VALUES ($1, $2, 'image', 'A private creation', 'https://example.test/a.webp', 'succeeded'),
              ($3, $4, 'image', 'B private creation', 'https://example.test/b.webp', 'succeeded')`,
      [creationA, userA, creationB, userB],
    );
    await db.execute(
      `INSERT INTO ai_studio.asset_folders (id, user_id, name) VALUES ($1, $2, 'A private folder')`,
      [folderA, userA],
    );
    await db.execute(
      `INSERT INTO ai_studio.user_assets (id, user_id, folder_id, creation_id, asset_type, studio_id, title, media_url)
       VALUES ($1, $2, $3, $4, 'image', 'image', 'A private asset', 'https://example.test/private-a.webp')`,
      [assetA, userA, folderA, creationA],
    );
    cosAssetA = `ast_cos_isolation_${crypto.randomUUID()}`;
    const privateObjectKey = `development/${userA}/images/2026/09/${cosAssetA}.webp`;
    await db.execute(
      `INSERT INTO ai_studio.user_assets (id,user_id,asset_type,studio_id,title,object_key,visibility)
       VALUES ($1,$2,'image','image','A private COS asset',$3,'private')`,
      [cosAssetA, userA, privateObjectKey],
    );
    await db.execute(
      `INSERT INTO ops_bill.credit_ledger_v2 (id, user_id, bucket_type, delta, balance_after, action_type, description)
       VALUES ($1, $2, 'free', -7, 13, 'GENERATION', 'A private ledger entry'),
              ($3, $4, 'free', -9, 11, 'GENERATION', 'B private ledger entry')`,
      [`led_a_${crypto.randomUUID()}`, userA, `led_b_${crypto.randomUUID()}`, userB],
    );

    const assetList = await assetsRoute.GET(nextRequest('/api/assets', sessionB.token));
    assert.equal(assetList.status, 200);
    const assetListBody = await assetList.json();
    assert.ok(!assetListBody.assets.some((asset) => asset.id === assetA));

    const crossUserAsset = await assetDetailRoute.GET(nextRequest(`/api/assets/${assetA}`, sessionB.token), { params: Promise.resolve({ id: assetA }) });
    assert.equal(crossUserAsset.status, 404);
    const ownerDownload = await assetDownloadRoute.GET(
      nextRequest(`/api/assets/${assetA}/download`, sessionA.token),
      { params: Promise.resolve({ id: assetA }) },
    );
    assert.equal(ownerDownload.status, 307);
    assert.equal(ownerDownload.headers.get('location'), 'https://example.test/private-a.webp');
    const crossUserDownload = await assetDownloadRoute.GET(
      nextRequest(`/api/assets/${assetA}/download`, sessionB.token),
      { params: Promise.resolve({ id: assetA }) },
    );
    assert.equal(crossUserDownload.status, 404);

    const ownerAmhDownload = await assetDownloadRoute.GET(
      nextRequest(`/api/assets/${cosAssetA}/download`, sessionA.token),
      { params: Promise.resolve({ id: cosAssetA }) },
    );
    assert.equal(ownerAmhDownload.status, 307);
    const downloadLocation = ownerAmhDownload.headers.get('location');
    const downloadUrl = new URL(downloadLocation);
    assert.equal(downloadUrl.pathname, `/uploads/${privateObjectKey}`);
    assert.equal(downloadUrl.searchParams.get('disposition'), 'attachment');

    const crossUserAmhDownload = await assetDownloadRoute.GET(
      nextRequest(`/api/assets/${cosAssetA}/download`, sessionB.token),
      { params: Promise.resolve({ id: cosAssetA }) },
    );
    assert.equal(crossUserAmhDownload.status, 404);

    const patchCrossUserAsset = await assetDetailRoute.PATCH(
      nextRequest(`/api/assets/${assetA}`, sessionB.token, 'PATCH', { title: 'changed by B' }),
      { params: Promise.resolve({ id: assetA }) },
    );
    assert.equal(patchCrossUserAsset.status, 404);
    const deleteCrossUserAsset = await assetDetailRoute.DELETE(
      nextRequest(`/api/assets/${assetA}`, sessionB.token, 'DELETE'),
      { params: Promise.resolve({ id: assetA }) },
    );
    assert.equal(deleteCrossUserAsset.status, 404);
    const stillOwnedByA = await db.queryOne('SELECT user_id, title FROM ai_studio.user_assets WHERE id = $1', [assetA]);
    assert.equal(stillOwnedByA.user_id, userA);
    assert.equal(stillOwnedByA.title, 'A private asset');
    const batchDeleteCrossUserAsset = await assetBatchRoute.POST(
      nextRequest('/api/assets/batch', sessionB.token, 'POST', { action: 'delete', assetIds: [assetA] }),
    );
    assert.equal(batchDeleteCrossUserAsset.status, 200);
    assert.equal((await batchDeleteCrossUserAsset.json()).count, 0);
    const unchangedAssetAfterBatch = await db.queryOne('SELECT user_id,folder_id,status FROM ai_studio.user_assets WHERE id=$1', [assetA]);
    assert.equal(unchangedAssetAfterBatch.user_id, userA);
    assert.equal(unchangedAssetAfterBatch.folder_id, folderA);
    assert.equal(unchangedAssetAfterBatch.status, 'ready');

    const patchCrossUserFolder = await assetFolderRoute.PATCH(
      nextRequest(`/api/assets/folders/${folderA}`, sessionB.token, 'PATCH', { name: 'changed by B' }),
      { params: Promise.resolve({ id: folderA }) },
    );
    assert.equal(patchCrossUserFolder.status, 404);
    const deleteCrossUserFolder = await assetFolderRoute.DELETE(
      nextRequest(`/api/assets/folders/${folderA}`, sessionB.token, 'DELETE'),
      { params: Promise.resolve({ id: folderA }) },
    );
    assert.equal(deleteCrossUserFolder.status, 404);
    assert.equal((await db.queryOne('SELECT user_id,name FROM ai_studio.asset_folders WHERE id=$1', [folderA])).name, 'A private folder');

    const creationList = await creationsRoute.GET(nextRequest(`/api/creations?userId=${userA}`, sessionB.token));
    assert.equal(creationList.status, 200);
    const creations = (await creationList.json()).creations;
    assert.ok(creations.some((creation) => creation.id === creationB));
    assert.ok(!creations.some((creation) => creation.id === creationA));
    const deleteCrossUserCreation = await creationsRoute.DELETE(nextRequest(`/api/creations?id=${creationA}`, sessionB.token, 'DELETE'));
    assert.equal(deleteCrossUserCreation.status, 404);
    assert.equal((await db.queryOne('SELECT user_id FROM ai_studio.creations WHERE id = $1', [creationA])).user_id, userA);

    const ledger = await ledgerRoute.GET(nextRequest('/api/financial/credits/ledger', sessionB.token));
    assert.equal(ledger.status, 200);
    const ledgerRows = (await ledger.json()).ledger;
    assert.ok(ledgerRows.some((row) => row.title === 'B private ledger entry'));
    assert.ok(!ledgerRows.some((row) => row.title === 'A private ledger entry'));
  } finally {
    if (cosAssetA) await db.execute('DELETE FROM ai_studio.user_assets WHERE id = $1', [cosAssetA]).catch(() => {});
    if (userA) await db.execute('DELETE FROM users WHERE id = $1', [userA]).catch(() => {});
    if (userB) await db.execute('DELETE FROM users WHERE id = $1', [userB]).catch(() => {});
    if (folderA) await db.execute('DELETE FROM ai_studio.asset_folders WHERE id = $1', [folderA]).catch(() => {});
    for (const userId of [userA, userB].filter(Boolean)) {
      await db.execute('DELETE FROM user_id_allocations WHERE user_id = $1', [userId]).catch(() => {});
    }
  }
});

test('admin community API rejects ordinary and auditor accounts while allowing an authorized operations admin', { skip: !testUrl }, async () => {
  let userId;
  let auditorId;
  let operationsId;
  try {
    userId = await seedUser('admin-boundary-user');
    auditorId = await seedUser('admin-boundary-auditor', 'auditor');
    operationsId = await seedUser('admin-boundary-operations', 'operations_admin');
    const userSession = await authService.createSession(userId);
    const auditorSession = await authService.createSession(auditorId);
    const operationsSession = await authService.createSession(operationsId);

    const unauthenticated = await adminCommunityRoute.GET(nextRequest('/api/admin/community/posts', null));
    assert.equal(unauthenticated.status, 401);
    const ordinaryUser = await adminCommunityRoute.GET(nextRequest('/api/admin/community/posts', userSession.token));
    assert.equal(ordinaryUser.status, 403);
    const auditor = await adminCommunityRoute.GET(nextRequest('/api/admin/community/posts', auditorSession.token));
    assert.equal(auditor.status, 403, 'auditor is read-only and must not receive content management access');
    const operationsAdmin = await adminCommunityRoute.GET(nextRequest('/api/admin/community/posts', operationsSession.token));
    assert.equal(operationsAdmin.status, 200);
    assert.ok((await operationsAdmin.json()).data);
  } finally {
    for (const cleanupUserId of [userId, auditorId, operationsId].filter(Boolean)) {
      await db.execute('DELETE FROM users WHERE id = $1', [cleanupUserId]).catch(() => {});
      await db.execute('DELETE FROM user_id_allocations WHERE user_id = $1', [cleanupUserId]).catch(() => {});
    }
  }
});

test.after(async () => {
  await db.closePgPool();
});
