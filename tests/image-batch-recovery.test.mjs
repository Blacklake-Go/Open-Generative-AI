import test from 'node:test';
import assert from 'node:assert/strict';
import { runImageBatch } from '../packages/studio/src/imageBatch.js';
import { hasTemporaryReferenceUrl } from '../packages/studio/src/stableAssetReference.js';
import { submitPlatformGeneration } from '../packages/studio/src/platformGeneration.js';

class Storage {
  values = new Map();
  getItem(key) { return this.values.get(key) ?? null; }
  setItem(key, value) { this.values.set(key, value); }
  removeItem(key) { this.values.delete(key); }
}

test('batch members are distinct; an uncertain member resumes with its original key without repeating successes', async () => {
  const storage = new Storage();
  const calls = [];
  let failOnce = true;
  const run = () => runImageBatch({
    descriptor: { model: 'image', prompt: 'same', count: 2 }, count: 2, storage,
    generate: async (index, key) => {
      calls.push({ index, key });
      if (index === 1 && failOnce) { failOnce = false; throw new Error('connection lost'); }
      return { id: `job-${index}`, url: `/image-${index}` };
    },
    recover: async (id) => ({ id, url: `/recovered-${id}` }),
  });
  const first = await run();
  assert.deepEqual(first.settled.map((x) => x.status), ['fulfilled', 'rejected']);
  assert.notEqual(calls[0].key, calls[1].key);
  const second = await run();
  assert.deepEqual(second.settled.map((x) => x.status), ['fulfilled', 'fulfilled']);
  assert.equal(calls.length, 3);
  assert.equal(calls[1].key, calls[2].key);
  assert.equal(storage.values.size, 0);
  await run();
  assert.notEqual(calls[3].key, calls[0].key);
});

test('terminal partial failures are reported without collapsing task identities', async () => {
  const result = await runImageBatch({
    descriptor: { model: 'image', count: 2 }, count: 2, storage: new Storage(),
    generate: async (index) => {
      if (index) throw Object.assign(new Error('rejected'), { status: 422 });
      return { id: 'job-1', url: '/image' };
    },
    recover: async () => { throw new Error('unexpected recovery'); },
  });
  assert.deepEqual(result.settled.map((item) => item.status), ['fulfilled', 'rejected']);
});

test('pending reconciliation retains the member key and requests read-only recovery next time', async()=>{
  const storage=new Storage(),seen=[];
  const run=()=>runImageBatch({descriptor:{model:'pending-fixture'},count:1,storage,
    generate:async (_index,key,_context,recovery)=>{
      seen.push({key,recovery});
      throw Object.assign(new Error('still uncertain'),{status:409,code:'GENERATION_RECONCILIATION_REQUIRED',pending:true,requestId:'original-job'});
    }});
  await run();await run();
  assert.equal(seen[0].key,seen[1].key);
  assert.equal(seen[0].recovery.resumeExistingTask,false);
  assert.equal(seen[1].recovery.resumeExistingTask,true);
  assert.equal(storage.values.size,1);
});

test('a duplicated server task is reported as a failure instead of another image', async () => {
  const result = await runImageBatch({
    descriptor: { model: 'image', count: 2 }, count: 2, storage: new Storage(),
    generate: async () => ({ id: 'same-job', url: '/image' }),
    recover: async () => { throw new Error('unexpected recovery'); },
  });
  assert.deepEqual(result.settled.map((item) => item.status), ['fulfilled', 'rejected']);
  assert.equal(result.settled[1].reason.code, 'DUPLICATE_BATCH_TASK');
});

test('resumed batches reuse their uploaded asset and do not expose signed URLs in session storage', async () => {
  const storage = new Storage();
  let uploads = 0;
  let attempts = 0;
  const run = () => runImageBatch({
    descriptor: { imageDigest: 'abc', count: 1 }, count: 1, storage,
    prepare: async () => { uploads++; return '/api/assets/asset_12345678/download?inline=1'; },
    generate: async (_index, _key, reference) => {
      assert.equal(reference, '/api/assets/asset_12345678/download?inline=1');
      if (!attempts++) throw new Error('network');
      return { id: 'job-1', url: '/asset' };
    },
    recover: async () => { throw new Error('unexpected recovery'); },
  });
  await run();
  await run();
  assert.equal(uploads, 1);
  assert.equal(hasTemporaryReferenceUrl(['https://bucket.example/img?X-Amz-Signature=secret']), true);
  assert.equal(hasTemporaryReferenceUrl(['/api/assets/asset_12345678/download?inline=1']), false);
});

test('batch member identities reach both quote and generation requests and survive a lost response', async () => {
  const storage = new Storage(), keys = [], quoteKeys = [], jobs = new Map();
  let drop = true;
  const json = (body) => ({ ok: true, status: 200, json: async () => body });
  const fetchImpl = async (url, options) => {
    if (url === '/api/generation/quote') { quoteKeys.push(options.headers['Idempotency-Key']); return json({ quoteId: 'quote' }); }
    if (url === '/api/generations') {
      const key = options.headers['Idempotency-Key']; keys.push(key);
      if (!jobs.has(key)) jobs.set(key, `job-${jobs.size + 1}`);
      if (key.endsWith(':1') && drop) { drop = false; throw new Error('connection lost'); }
      return json({ creation: { id: jobs.get(key), status: 'succeeded', result_url: '/image' } });
    }
    throw new Error('unexpected request');
  };
  const run = () => runImageBatch({ descriptor: { prompt: 'same' }, count: 2, storage,
    generate: (_index, idempotencyKey) => submitPlatformGeneration({ modelId: 'model', prompt: 'same', idempotencyKey, fetchImpl }),
    recover: async (id) => ({ id, url: '/image' }),
  });
  assert.deepEqual((await run()).settled.map((x) => x.status), ['fulfilled', 'rejected']);
  assert.deepEqual((await run()).settled.map((x) => x.status), ['fulfilled', 'fulfilled']);
  assert.equal(jobs.size, 2);
  assert.notEqual(keys[0], keys[1]);
  assert.equal(keys[1], keys[2]);
  assert.equal(quoteKeys[1], quoteKeys[2]);
});
