import test from 'node:test';
import assert from 'node:assert/strict';
import { register } from 'node:module';

try {
  register('../scripts/server-only-loader.mjs', import.meta.url);
} catch {}

const {
  RunningHubAdapter,
  mapRunningHubErrorCode,
  extractRunningHubResults,
  normalizeRunningHubStatus,
  validateRunningHubPayload,
} = await import('../lib/adapters/RunningHubAdapter.js');
const { PROVIDER_ERROR_CODES } = await import('../lib/adapters/BaseAdapter.js');

test('1. RunningHub 错误码归一化映射', () => {
  // 余额不足
  assert.equal(mapRunningHubErrorCode('416'), PROVIDER_ERROR_CODES.INSUFFICIENT_PROVIDER_BALANCE);
  assert.equal(mapRunningHubErrorCode('812'), PROVIDER_ERROR_CODES.INSUFFICIENT_PROVIDER_BALANCE);
  assert.equal(mapRunningHubErrorCode('TASK_CREATE_FAILED_BY_NOT_ENOUGH_WALLET'), PROVIDER_ERROR_CODES.INSUFFICIENT_PROVIDER_BALANCE);

  // 并发与限流
  assert.equal(mapRunningHubErrorCode('415'), PROVIDER_ERROR_CODES.RATE_LIMIT);
  assert.equal(mapRunningHubErrorCode('421'), PROVIDER_ERROR_CODES.RATE_LIMIT);
  assert.equal(mapRunningHubErrorCode('1003'), PROVIDER_ERROR_CODES.RATE_LIMIT);

  // 内容安全（含 1505 真人人像限制）
  assert.equal(mapRunningHubErrorCode('1501'), PROVIDER_ERROR_CODES.CONTENT_POLICY);
  assert.equal(mapRunningHubErrorCode('1505'), PROVIDER_ERROR_CODES.CONTENT_POLICY);

  // 鉴权错误
  assert.equal(mapRunningHubErrorCode('412'), PROVIDER_ERROR_CODES.AUTH_ERROR);
  assert.equal(mapRunningHubErrorCode('802'), PROVIDER_ERROR_CODES.AUTH_ERROR);
  assert.equal(mapRunningHubErrorCode('1014'), PROVIDER_ERROR_CODES.AUTH_ERROR);

  // 参数与输入
  assert.equal(mapRunningHubErrorCode('301'), PROVIDER_ERROR_CODES.INVALID_INPUT);
  assert.equal(mapRunningHubErrorCode('803'), PROVIDER_ERROR_CODES.INVALID_INPUT);
  assert.equal(mapRunningHubErrorCode('1001'), PROVIDER_ERROR_CODES.INVALID_INPUT);
  assert.equal(mapRunningHubErrorCode('1008'), PROVIDER_ERROR_CODES.INVALID_INPUT);

  // 超时
  assert.equal(mapRunningHubErrorCode('1006'), PROVIDER_ERROR_CODES.TIMEOUT);
  assert.equal(mapRunningHubErrorCode('1504'), PROVIDER_ERROR_CODES.TIMEOUT);

  // 服务端错误
  assert.equal(mapRunningHubErrorCode('500'), PROVIDER_ERROR_CODES.PROVIDER_INTERNAL_ERROR);
  assert.equal(mapRunningHubErrorCode('1000'), PROVIDER_ERROR_CODES.PROVIDER_INTERNAL_ERROR);

  // 空值或未识别
  assert.equal(mapRunningHubErrorCode(null), null);
  assert.equal(mapRunningHubErrorCode('UNKNOWN_CODE_9999'), null);
});

test('2. 任务状态归一化', () => {
  assert.equal(normalizeRunningHubStatus('SUCCESS'), 'succeeded');
  assert.equal(normalizeRunningHubStatus('SUCCEEDED'), 'succeeded');
  assert.equal(normalizeRunningHubStatus('QUEUED'), 'submitted');
  assert.equal(normalizeRunningHubStatus('QUEUE'), 'submitted');
  assert.equal(normalizeRunningHubStatus('RUNNING'), 'processing');
  assert.equal(normalizeRunningHubStatus('FAILED'), 'failed');
  assert.equal(normalizeRunningHubStatus('CANCELLED'), 'cancelled');
  assert.equal(normalizeRunningHubStatus('UNKNOWN_STATUS'), 'processing');
});

test('3. 多结果提取 extractRunningHubResults', () => {
  const v2Data = {
    results: [
      { url: 'https://cdn.runninghub.ai/out1.png', outputType: 'image' },
      { url: 'https://cdn.runninghub.ai/out2.png', outputType: 'image' },
    ],
  };
  const extracted = extractRunningHubResults(v2Data);
  assert.equal(extracted.length, 2);
  assert.equal(extracted[0].url, 'https://cdn.runninghub.ai/out1.png');
  assert.equal(extracted[0].outputType, 'image');
  assert.equal(extracted[1].url, 'https://cdn.runninghub.ai/out2.png');

  // fallback generic scan
  const fallbackData = {
    nested: {
      result_url: 'https://cdn.runninghub.ai/out3.mp4',
    },
  };
  const extractedFallback = extractRunningHubResults(fallbackData);
  assert.equal(extractedFallback.length, 1);
  assert.equal(extractedFallback[0].url, 'https://cdn.runninghub.ai/out3.mp4');
});

test('4. 请求参数契约验证 validateRunningHubPayload', () => {
  const endpointConfig = {
    params: [
      { fieldKey: 'prompt', label: '提示词', required: true, type: 'TEXT' },
      { fieldKey: 'aspectRatio', label: '比例', required: false, options: ['1:1', '16:9', '9:16'] },
      { fieldKey: 'duration', label: '时长', required: false, min: 3, max: 10 },
    ],
  };

  // 必填项缺失
  const missingPrompt = validateRunningHubPayload({ aspectRatio: '1:1' }, endpointConfig);
  assert.equal(missingPrompt.ok, false);
  assert.ok(missingPrompt.problems.some((p) => p.includes('prompt is required')));

  // 枚举不匹配
  const invalidRatio = validateRunningHubPayload({ prompt: 'test', aspectRatio: '4:3' }, endpointConfig);
  assert.equal(invalidRatio.ok, false);
  assert.ok(invalidRatio.problems.some((p) => p.includes('aspectRatio must be one of')));

  // 数值超出范围
  const invalidDuration = validateRunningHubPayload({ prompt: 'test', duration: 15 }, endpointConfig);
  assert.equal(invalidDuration.ok, false);
  assert.ok(invalidDuration.problems.some((p) => p.includes('duration must be <= 10')));

  // 合法配置
  const valid = validateRunningHubPayload({ prompt: 'a cat', aspectRatio: '16:9', duration: 5 }, endpointConfig);
  assert.equal(valid.ok, true);
  assert.equal(valid.problems.length, 0);
});

test('5. createTask 提交生命周期与错误拦截', async () => {
  // 无 Key 拦截
  const unauthed = new RunningHubAdapter({ apiKey: '' });
  await assert.rejects(
    () => unauthed.createTask({ providerEndpoint: 'openapi/v2/run' }),
    (err) => err.code === PROVIDER_ERROR_CODES.AUTH_ERROR,
  );

  // 非法 OpenAPI 端点拦截
  const authed = new RunningHubAdapter({ apiKey: 'test_key' });
  await assert.rejects(
    () => authed.createTask({ providerEndpoint: 'v1/invalid/endpoint', prompt: 'test' }),
    (err) => err.code === PROVIDER_ERROR_CODES.INVALID_INPUT,
  );

  // 参数校验在发起 HTTP 之前拦截
  const contract = {
    params: [{ fieldKey: 'prompt', required: true }],
  };
  await assert.rejects(
    () => authed.createTask({ providerEndpoint: 'openapi/v2/run', endpointConfig: contract, parameters: {} }),
    (err) => err.code === PROVIDER_ERROR_CODES.INVALID_INPUT && err.message.includes('rejected before submission'),
  );

  // 正常提交模拟
  const mockFetch = async (url, options) => {
    assert.ok(url.includes('/openapi/v2/seedance'));
    assert.equal(options.method, 'POST');
    assert.ok(options.headers.Authorization.includes('Bearer test_key'));
    return {
      ok: true,
      status: 200,
      json: async () => ({
        code: '0',
        data: { taskId: 'rh_task_12345', status: 'QUEUED' },
      }),
    };
  };

  const adapter = new RunningHubAdapter({ apiKey: 'test_key', fetchImpl: mockFetch });
  const result = await adapter.createTask({
    providerEndpoint: 'openapi/v2/seedance',
    prompt: 'a running dog',
  });

  assert.equal(result.providerRequestId, 'rh_task_12345');
  assert.equal(result.status, 'processing'); // QUEUED 未产生结果，归一为 processing
  assert.equal(result.metadata.endpoint, 'openapi/v2/seedance');
});

test('6. getTask 轮询、瞬态错误防护与空结果保护', async () => {
  // 6.1 成功并返回多结果
  const successFetch = async () => ({
    ok: true,
    status: 200,
    json: async () => ({
      status: 'SUCCESS',
      results: [{ url: 'https://cdn.rh.ai/res.mp4', outputType: 'video' }],
    }),
  });
  const adapterSuccess = new RunningHubAdapter({ apiKey: 'test_key', fetchImpl: successFetch });
  const resSuccess = await adapterSuccess.getTask('task_1');
  assert.equal(resSuccess.status, 'succeeded');
  assert.equal(resSuccess.resultUrl, 'https://cdn.rh.ai/res.mp4');
  assert.equal(resSuccess.progress, 100);

  // 6.2 报 SUCCESS 但没有产物：判定为 failed + EMPTY_RESULT，保护用户不扣冤枉钱
  const emptyFetch = async () => ({
    ok: true,
    status: 200,
    json: async () => ({
      status: 'SUCCESS',
      results: [],
    }),
  });
  const adapterEmpty = new RunningHubAdapter({ apiKey: 'test_key', fetchImpl: emptyFetch });
  const resEmpty = await adapterEmpty.getTask('task_2');
  assert.equal(resEmpty.status, 'failed');
  assert.equal(resEmpty.providerErrorCode, 'EMPTY_RESULT');

  // 6.3 瞬态网络/服务端 500 轮询故障：返回 processing + pollError，不中断任务也不触发错误切流
  const serverErrorFetch = async () => ({
    ok: false,
    status: 500,
    json: async () => ({
      code: '500',
      message: 'RunningHub gateway timeout',
    }),
  });
  const adapterTransient = new RunningHubAdapter({ apiKey: 'test_key', fetchImpl: serverErrorFetch });
  const resTransient = await adapterTransient.getTask('task_3');
  assert.equal(resTransient.status, 'processing');
  assert.ok(resTransient.pollError);
  assert.equal(resTransient.pollError.code, PROVIDER_ERROR_CODES.PROVIDER_INTERNAL_ERROR);

  // 6.4 任务不存在（423 / 807）：抛出错误且标记 taskNotFound
  const notFoundFetch = async () => ({
    ok: true,
    status: 200,
    json: async () => ({
      code: '807',
      msg: 'APIKEY_TASK_NOT_FOUND',
    }),
  });
  const adapterNotFound = new RunningHubAdapter({ apiKey: 'test_key', fetchImpl: notFoundFetch });
  await assert.rejects(
    () => adapterNotFound.getTask('task_4'),
    (err) => err.taskNotFound === true,
  );
});

test('7. uploadMedia 媒体上传契约', async () => {
  const adapter = new RunningHubAdapter({
    apiKey: 'test_key',
    fetchImpl: async (url, options) => {
      assert.ok(url.includes('/openapi/v2/media/upload/binary'));
      assert.equal(options.method, 'POST');
      return {
        ok: true,
        status: 200,
        json: async () => ({
          code: 0,
          data: {
            download_url: 'https://cdn.runninghub.ai/uploaded_media.jpg',
            filename: 'photo.jpg',
            size: 1024,
          },
        }),
      };
    },
  });

  // 空文件拦截
  await assert.rejects(
    () => adapter.uploadMedia({ data: new Uint8Array([]) }),
    (err) => err.code === PROVIDER_ERROR_CODES.INVALID_INPUT,
  );

  // 正常上传
  const uploadResult = await adapter.uploadMedia({
    data: new Uint8Array([1, 2, 3, 4]),
    filename: 'photo.jpg',
    mimeType: 'image/jpeg',
  });
  assert.equal(uploadResult.url, 'https://cdn.runninghub.ai/uploaded_media.jpg');
  assert.equal(uploadResult.fileName, 'photo.jpg');
});

test('8. getAccountStatus 与 healthCheck 探针契约', async () => {
  // 正常有余额
  const healthyFetch = async (url, options) => {
    assert.ok(url.includes('/uc/openapi/accountStatus'));
    const body = JSON.parse(options.body);
    assert.equal(body.apikey, 'valid_key');
    return {
      ok: true,
      status: 200,
      json: async () => ({
        code: 0,
        data: {
          remainCoins: '120.5',
          remainMoney: '50.0',
          currency: 'CNY',
          currentTaskCounts: '2',
          apiType: 'Enterprise-Shared',
        },
      }),
    };
  };

  const healthyAdapter = new RunningHubAdapter({ apiKey: 'valid_key', fetchImpl: healthyFetch });
  const status = await healthyAdapter.getAccountStatus();
  assert.equal(status.remainCoins, 120.5);
  assert.equal(status.remainMoney, 50.0);
  assert.equal(status.currency, 'CNY');
  assert.equal(status.currentTaskCounts, 2);
  assert.equal(status.apiType, 'Enterprise-Shared');

  const health = await healthyAdapter.healthCheck();
  assert.equal(health.healthy, true);
  assert.equal(health.probeKind, 'http');
  assert.ok(health.message.includes('已连通'));

  // 余额为 0 判定为 unhealthy（避免线上提交 416 报错）
  const zeroBalanceFetch = async () => ({
    ok: true,
    status: 200,
    json: async () => ({
      code: 0,
      data: { remainCoins: '0', remainMoney: '0', currency: 'CNY' },
    }),
  });
  const zeroAdapter = new RunningHubAdapter({ apiKey: 'valid_key', fetchImpl: zeroBalanceFetch });
  const zeroHealth = await zeroAdapter.healthCheck();
  assert.equal(zeroHealth.healthy, false);
  assert.equal(zeroHealth.probeKind, 'http');
  assert.ok(zeroHealth.message.includes('余额为 0'));
});

test('9. 文生图端点契约：imageUrls 不得强制必填并安全默认为空数组', async () => {
  const t2iEndpointConfig = {
    taskType: 'text-to-image',
    params: [
      { fieldKey: 'prompt', label: '提示词', required: true, type: 'TEXT' },
      { fieldKey: 'imageUrls', label: '参考图列表', required: true, type: 'LIST' },
    ],
  };

  // 1) validateRunningHubPayload 在文生图端点下不将 imageUrls 判定为必填项错误
  const payloadWithoutImages = { prompt: 'a beautiful sunset' };
  const valResult = validateRunningHubPayload(payloadWithoutImages, t2iEndpointConfig);
  assert.equal(valResult.ok, true);
  assert.equal(valResult.problems.length, 0);

  // 2) createTask 在文生图端点提交时自动将缺失的 imageUrls 补全为空数组 []
  let capturedBody = null;
  const mockFetch = async (_url, options) => {
    capturedBody = JSON.parse(options.body);
    return {
      ok: true,
      status: 200,
      json: async () => ({ code: '0', data: { taskId: 't2i-task-123', status: 'QUEUED' } }),
    };
  };

  const adapter = new RunningHubAdapter({ apiKey: 'test_key', fetchImpl: mockFetch });
  await adapter.createTask({
    providerEndpoint: 'openapi/v2/bytedance/jimeng-4.6/text-to-image',
    prompt: 'a cinematic mountain',
    endpointConfig: t2iEndpointConfig,
    parameters: {},
  });

  assert.ok(capturedBody);
  assert.equal(capturedBody.prompt, 'a cinematic mountain');
  assert.ok(Array.isArray(capturedBody.imageUrls));
  assert.equal(capturedBody.imageUrls.length, 0);
});

test('10. 连贯生图 sequentialImageGeneration：非法/空值安全清理或移除，避免 301 报错', async () => {
  const contract = {
    params: [
      { fieldKey: 'prompt', required: true },
      { fieldKey: 'sequentialImageGeneration', required: false, options: ['disabled', 'auto'] },
    ],
  };

  // 1) 传入空字符串、null 或非法枚举值（如 'none', 'off', 'false'），validateRunningHubPayload 不报 301
  assert.equal(validateRunningHubPayload({ prompt: 'test', sequentialImageGeneration: '' }, contract).ok, true);
  assert.equal(validateRunningHubPayload({ prompt: 'test', sequentialImageGeneration: 'none' }, contract).ok, true);
  assert.equal(validateRunningHubPayload({ prompt: 'test', sequentialImageGeneration: 'off' }, contract).ok, true);
  assert.equal(validateRunningHubPayload({ prompt: 'test', sequentialImageGeneration: 'auto' }, contract).ok, true);

  // 2) createTask 提交时，非法值被清除，合法值保留
  let capturedBody = null;
  const mockFetch = async (_url, options) => {
    capturedBody = JSON.parse(options.body);
    return {
      ok: true,
      status: 200,
      json: async () => ({ code: '0', data: { taskId: 'seq-task-123', status: 'QUEUED' } }),
    };
  };

  const adapter = new RunningHubAdapter({ apiKey: 'test_key', fetchImpl: mockFetch });

  // 测试非法枚举被安全移除
  await adapter.createTask({
    providerEndpoint: 'openapi/v2/test/endpoint',
    prompt: 'test prompt',
    endpointConfig: contract,
    parameters: { sequentialImageGeneration: 'invalid_mode' },
  });
  assert.equal(capturedBody.sequentialImageGeneration, undefined);

  // 测试合法枚举正常透传
  await adapter.createTask({
    providerEndpoint: 'openapi/v2/test/endpoint',
    prompt: 'test prompt',
    endpointConfig: contract,
    parameters: { sequentialImageGeneration: 'auto' },
  });
  assert.equal(capturedBody.sequentialImageGeneration, 'auto');
});

test('11. 分辨率 resolution：空/默认值正确对齐端点枚举（如 2k 或 ""）', async () => {
  // 端点配置 A: 支持 ['1k', '2k', '4k']
  const configWith2k = {
    params: [
      { fieldKey: 'prompt', required: true },
      { fieldKey: 'resolution', required: false, options: ['1k', '2k', '4k'] },
    ],
  };

  let capturedBody = null;
  const mockFetch = async (_url, options) => {
    capturedBody = JSON.parse(options.body);
    return {
      ok: true,
      status: 200,
      json: async () => ({ code: '0', data: { taskId: 'res-task-123', status: 'QUEUED' } }),
    };
  };
  const adapter = new RunningHubAdapter({ apiKey: 'test_key', fetchImpl: mockFetch });

  // 空值自动映射为 '2k'
  await adapter.createTask({
    providerEndpoint: 'openapi/v2/test/endpoint',
    prompt: 'test prompt',
    endpointConfig: configWith2k,
    parameters: { resolution: '' },
  });
  assert.equal(capturedBody.resolution, '2k');

  // 大写 '2K' 自动归一化为小写 '2k'
  await adapter.createTask({
    providerEndpoint: 'openapi/v2/test/endpoint',
    prompt: 'test prompt',
    endpointConfig: configWith2k,
    parameters: { resolution: '2K' },
  });
  assert.equal(capturedBody.resolution, '2k');

  // 端点配置 B: 包含 '' 空枚举选项
  const configWithEmpty = {
    params: [
      { fieldKey: 'prompt', required: true },
      { fieldKey: 'resolution', required: false, options: ['', 'standard', 'hd'] },
    ],
  };
  await adapter.createTask({
    providerEndpoint: 'openapi/v2/test/endpoint',
    prompt: 'test prompt',
    endpointConfig: configWithEmpty,
    parameters: { resolution: 'default' },
  });
  assert.equal(capturedBody.resolution, '');
});

test('12. 边界契约：无内置 params 配置或直接调用 validate 时安全处理三要素', async () => {
  let capturedBody = null;
  const mockFetch = async (_url, options) => {
    capturedBody = JSON.parse(options.body);
    return {
      ok: true,
      status: 200,
      json: async () => ({ code: '0', data: { taskId: 'edge-task-999', status: 'QUEUED' } }),
    };
  };
  const adapter = new RunningHubAdapter({ apiKey: 'test_key', fetchImpl: mockFetch });

  // 1) 模拟真实数据库 pm_seedream_5_0_lite_runninghub 的空 endpointConfig
  await adapter.createTask({
    providerModelId: 'openapi/v2/bytedance/jimeng-4.6/text-to-image',
    prompt: 'a tranquil lake',
    endpointConfig: {},
    parameters: {
      sequentialImageGeneration: 'invalid_choice',
      resolution: '',
    },
  });

  assert.ok(capturedBody);
  assert.equal(capturedBody.prompt, 'a tranquil lake');
  assert.ok(Array.isArray(capturedBody.imageUrls), 'T2I 端点在空配置下也必须默认补全为 []');
  assert.equal(capturedBody.imageUrls.length, 0);
  assert.equal(capturedBody.sequentialImageGeneration, undefined, '非法 sequentialImageGeneration 必须被移除');
  assert.equal(capturedBody.resolution, '2k', '空分辨率在无 options 情况下映射为 2k');

  // 2) 直接调用 validateRunningHubPayload 时在 body 上对 resolution/sequential 进行安全规范化
  const bodyToValidate = {
    prompt: 'cat',
    sequentialImageGeneration: 'not-valid',
    resolution: 'default',
  };
  const res = validateRunningHubPayload(bodyToValidate, {
    taskType: 'text-to-image',
    params: [
      { fieldKey: 'prompt', required: true },
      { fieldKey: 'resolution', required: true, options: ['1k', '2k'] },
      { fieldKey: 'imageUrls', required: true },
      { fieldKey: 'sequentialImageGeneration', required: false, options: ['disabled', 'auto'] },
    ],
  });
  assert.equal(res.ok, true, 'validateRunningHubPayload 规范化后不应报错误');
  assert.equal(bodyToValidate.sequentialImageGeneration, undefined, '非法 sequentialImageGeneration 必须被移除');
  assert.equal(bodyToValidate.resolution, '2k', 'default 分辨率必须被对齐到 2k');
  assert.ok(Array.isArray(bodyToValidate.imageUrls), 'imageUrls 在 T2I 必须被自动填充为 []');
});
