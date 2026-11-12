import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { getProviderAdapter } from '../../lib/adapters/index.js';
import { createResilientProvider } from '../../lib/services/providerRuntime.js';
import {
  invalidateProviderCredentialConsumers,
  providerCredentialFamily,
} from '../../lib/services/providerCredentialChange.js';

function readRepoFile(relativePath) {
  return readFileSync(new URL(`../../${relativePath}`, import.meta.url), 'utf8');
}

/**
 * 取函数体，供源码契约断言使用。只依赖相邻 export 的边界，不解析 JS。
 */
function functionBody(source, name) {
  const start = source.indexOf(`export async function ${name}`);
  assert.notEqual(start, -1, `缺少 ${name}`);
  const nextExport = source.indexOf('\nexport ', start + 1);
  return source.slice(start, nextExport === -1 ? source.length : nextExport);
}

test('适配器没有实例缓存：环境变量换密钥后下一次构造直接使用新值', async () => {
  const previousPrimary = process.env.MUAPI_API_KEY;
  const previousAlias = process.env.MUAPI_KEY;
  delete process.env.MUAPI_KEY;
  try {
    process.env.MUAPI_API_KEY = 'unit-first-key';
    const first = await getProviderAdapter('muapi');

    process.env.MUAPI_API_KEY = 'unit-second-key';
    const second = await getProviderAdapter('muapi');

    assert.notEqual(first, second, '每次调用都应构造新适配器');
    assert.equal(first.apiKey, 'unit-first-key');
    assert.equal(second.apiKey, 'unit-second-key');
    assert.equal(second.providerId, 'muapi');
  } finally {
    if (previousPrimary === undefined) delete process.env.MUAPI_API_KEY;
    else process.env.MUAPI_API_KEY = previousPrimary;
    if (previousAlias === undefined) delete process.env.MUAPI_KEY;
    else process.env.MUAPI_KEY = previousAlias;
  }
});

test('旧密钥打开的熔断在凭据变更后释放，下一次调用真正触达供应商', async () => {
  const providerName = 'unit-key-rotation-circuit';
  let calls = 0;
  const provider = {
    async generate() {
      calls += 1;
      throw Object.assign(new Error('invalid api key'), { code: 'AUTH_ERROR', status: 401 });
    },
  };
  const resilient = createResilientProvider({
    provider,
    providerName,
    maxAttempts: 1,
    failureThreshold: 1,
    resetMs: 60_000,
    sleep: async () => {},
  });

  await assert.rejects(() => resilient.generate({ prompt: 'first' }), (error) => error.code === 'AUTH_ERROR');
  assert.equal(calls, 1);

  // 熔断期内，新密钥的调用在本地就被拦下，这正是保存密钥后必须清理的状态。
  await assert.rejects(
    () => resilient.generate({ prompt: 'blocked' }),
    (error) => error.code === 'PROVIDER_CIRCUIT_OPEN',
  );
  assert.equal(calls, 1);

  const result = await invalidateProviderCredentialConsumers(providerName, {
    invalidateCatalog: async () => true,
  });
  assert.equal(result.circuitsReset, true);
  assert.equal(result.catalogInvalidated, true);

  await assert.rejects(() => resilient.generate({ prompt: 'after-rotation' }), (error) => error.code === 'AUTH_ERROR');
  assert.equal(calls, 2, '熔断清除后请求应重新发出，由新凭据决定结果');
});

test('失效钩子归一化渠道 ID、清理同族渠道并吞掉缓存清理异常', async () => {
  const resetIds = [];
  let catalogCalls = 0;
  const normal = await invalidateProviderCredentialConsumers(' MuAPI ', {
    resetCircuit: (id) => resetIds.push(id),
    invalidateCatalog: async () => { catalogCalls += 1; return true; },
  });

  assert.equal(normal.provider, 'muapi');
  assert.deepEqual(normal.providerFamily, ['muapi']);
  assert.deepEqual(resetIds, ['muapi']);
  assert.equal(normal.circuitsReset, true);
  assert.equal(normal.catalogInvalidated, true);
  assert.equal(catalogCalls, 1);

  const resetFailure = await invalidateProviderCredentialConsumers('openai', {
    resetCircuit: () => { throw new Error('circuit store unavailable'); },
    invalidateCatalog: async () => true,
  });
  assert.equal(resetFailure.circuitsReset, false);
  assert.equal(resetFailure.catalogInvalidated, true, '一项失败不能让另一项失效也停下');

  const catalogFailure = await invalidateProviderCredentialConsumers('openai', {
    resetCircuit: () => {},
    invalidateCatalog: async () => { throw new Error('catalog module unavailable'); },
  });
  assert.equal(catalogFailure.circuitsReset, true);
  assert.equal(catalogFailure.catalogInvalidated, false, '清理目录失败不应向保存密钥的请求抛出');

  assert.deepEqual(providerCredentialFamily('aliyun'), ['alibaba', 'dashscope', 'aliyun']);
  assert.deepEqual(providerCredentialFamily('ark'), ['volcengine', 'bytedance', 'ark']);
  assert.deepEqual(providerCredentialFamily('kling'), ['kling']);
  assert.deepEqual(providerCredentialFamily(''), []);
});

test('保存、轮换、切换生效环境和删除供应商都接入了凭据失效钩子', () => {
  const route = readRepoFile('app/api/admin/models/providers/route.js');
  const service = readRepoFile('lib/services/providers.js');

  const saveBranch = route.slice(
    route.indexOf('if (body.apiKey'),
    route.indexOf('const [credential, secrets]'),
  );
  assert.match(saveBranch, /saveProviderSecret/);
  assert.match(saveBranch, /invalidateProviderCredentialConsumers\(id\)/);

  const deleteBranch = route.slice(route.indexOf('async function handleDELETE'));
  assert.match(deleteBranch, /deleteProvider\(id\)/);
  assert.match(deleteBranch, /invalidateProviderCredentialConsumers\(id\)/);

  const rotateBody = functionBody(service, 'rotateProviderSecret');
  assert.match(rotateBody, /withTransaction/);
  const rotateCommit = rotateBody.indexOf('return rotated;');
  const rotateInvalidate = rotateBody.indexOf('invalidateProviderCredentialConsumers(provider)');
  assert.ok(rotateInvalidate !== -1 && rotateInvalidate < rotateCommit, '轮换应先失效再返回成功');

  const envBody = functionBody(service, 'setActiveProviderKeyEnv');
  assert.match(envBody, /providers\.rotate_key_env/);
  assert.match(envBody, /invalidateProviderCredentialConsumers\(provider\)/);
});
