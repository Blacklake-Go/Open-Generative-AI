import crypto from 'node:crypto';
import { getServerProviderApiKey } from './providerSecrets.js';

function parseInput(creation) {
  if (creation?.input_summary_json && typeof creation.input_summary_json === 'object') return creation.input_summary_json;
  try { return JSON.parse(creation?.input_summary_json || '{}'); } catch { return {}; }
}

function reportedCostUsd(value) {
  if (value === null || value === undefined || value === '') return null;
  const amount = Number(value);
  return Number.isFinite(amount) && amount >= 0 ? amount : null;
}

export function createMockGenerationProvider({ outcome = 'succeeded', resultUrl = 'https://mock.invalid/generated/result.png' } = {}) {
  return {
    async generate({ creation, signal }) {
      if (outcome === 'failed') {
        // An explicit provider refusal/terminal failure. Marking it lets
        // settlement release credits exactly once instead of parking the task
        // in reconciliation as an unknown submission outcome.
        throw Object.assign(new Error('模拟供应商返回失败'), { code: 'MOCK_PROVIDER_FAILED', terminalFailure: true });
      }
      return {
        providerRequestId: `mock_${crypto.randomBytes(8).toString('hex')}`,
        resultUrl,
        actualCostUsd: 0,
        metadata: { provider: 'mock', model: creation.model },
      };
    },
  };
}

export function createHttpGenerationProvider({ baseUrl = process.env.UPSTREAM_AI_BASE || 'https://api.muapi.ai', fetchImpl = globalThis.fetch } = {}) {
  return {
    async generate({ creation, signal }) {
      const input = parseInput(creation);
      const endpoint = input.endpoint || creation.model;
      const providerName = String(creation.provider || 'muapi').toLowerCase();

      // 多提供商智能凭据匹配与自动回退机制
      let apiKey = await getServerProviderApiKey({ provider: providerName });
      let activeProvider = providerName;

      // 如果未配置该特定供应商的独立密钥，平滑回退到主聚合网关 (Muapi)
      if (!apiKey && providerName !== 'muapi') {
        apiKey = await getServerProviderApiKey({ provider: 'muapi' });
        activeProvider = 'muapi';
      }

      // 如果是 DashScope 专用直连并且有专用 Key
      if (activeProvider === 'dashscope' || activeProvider === 'alibaba') {
        const dashscopeKey = await getServerProviderApiKey({ provider: 'dashscope' });
        if (dashscopeKey) {
          return await executeDashScopeGeneration({ creation, input, apiKey: dashscopeKey, signal, fetchImpl });
        }
      }

      // 如果是 DeepSeek 专用直连并且有专用 Key
      if (activeProvider === 'deepseek') {
        const deepseekKey = await getServerProviderApiKey({ provider: 'deepseek' });
        if (deepseekKey) {
          return await executeDeepSeekGeneration({ creation, input, apiKey: deepseekKey, signal, fetchImpl });
        }
      }

      if (!apiKey) {
        throw Object.assign(new Error(`系统未配置模型供应商凭据 (请在后台或环境中配置 ${providerName.toUpperCase()}_API_KEY 或 MUAPI_API_KEY)`), {
          code: 'PROVIDER_NOT_CONFIGURED',
        });
      }

      const response = await fetchImpl(`${baseUrl}/api/v1/${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey },
        body: JSON.stringify(input.parameters || input),
        signal,
      });
      const data = await response.json().catch(() => null);
      if (!response.ok || !data) {
        throw Object.assign(new Error(data?.error || response.statusText || '供应商请求失败'), {
          code: `UPSTREAM_${response.status || 'ERROR'}`,
          providerStatus: response.status,
        });
      }

      let resultUrl = data.outputs?.[0] || data.url || data.output?.url || null;
      const requestId = data.request_id || data.id || null;

      if (!resultUrl && requestId) {
        const pollUrl = `${baseUrl}/api/v1/predictions/${requestId}/result`;
        const maxAttempts = Math.max(10, Math.min(300, Number(process.env.PROVIDER_POLL_MAX_ATTEMPTS) || 90));
        const pollInterval = Math.max(1000, Number(process.env.PROVIDER_POLL_INTERVAL_MS) || 2000);

        for (let attempt = 1; attempt <= maxAttempts; attempt++) {
          if (signal?.aborted) break;
          await new Promise((resolve) => setTimeout(resolve, pollInterval));
          try {
            const pollRes = await fetchImpl(pollUrl, {
              headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey },
              signal,
            });
            if (pollRes.ok) {
              const pollData = await pollRes.json().catch(() => ({}));
              const status = String(pollData.status || '').toLowerCase();
              if (['completed', 'succeeded', 'success'].includes(status)) {
                resultUrl = pollData.outputs?.[0] || pollData.url || pollData.output?.url || null;
                break;
              }
              if (['failed', 'error', 'cancelled', 'canceled'].includes(status)) {
                const failReason = pollData.error || pollData.message || (typeof pollData.detail === 'string' ? pollData.detail : null) || '模型供应商生成失败';
                // The provider accepted this task and then reported a terminal
                // failure; it is not an unknown submission outcome.
                throw Object.assign(new Error(failReason), {
                  code: 'UPSTREAM_GENERATION_FAILED',
                  providerRequestId: requestId,
                  terminalFailure: true,
                });
              }
            }
          } catch (err) {
            if (err.code === 'UPSTREAM_GENERATION_FAILED') throw err;
          }
        }
      }

      return {
        providerRequestId: requestId,
        resultUrl,
        actualCostUsd: reportedCostUsd(data.cost?.amount_usd ?? data.cost_usd),
        metadata: { upstreamStatus: response.status, provider: activeProvider },
      };
    },
  };
}

/**
 * 阿里云百炼 (DashScope) 原生直连适配器（用于 Wan 2.1 视频与文生图）
 */
async function executeDashScopeGeneration({ creation, input, apiKey, signal, fetchImpl }) {
  const isVideo = String(creation.model || '').includes('video') || String(input.endpoint || '').includes('video');
  const dashscopeBase = 'https://dashscope.aliyuncs.com/api/v1/services/aigc';
  const url = isVideo
    ? `${dashscopeBase}/video-generation/video-synthesis`
    : `${dashscopeBase}/text2image/image-synthesis`;

  const modelName = creation.model.includes('wan')
    ? (isVideo ? 'wanx2.1-t2v-turbo' : 'wanx2.1-t2i-turbo')
    : 'wanx-v1';

  const params = input.parameters || input;
  const body = {
    model: modelName,
    input: {
      prompt: input.prompt || params.prompt || '',
      ...(params.image_url ? { img_url: params.image_url } : {}),
    },
    parameters: {
      size: params.resolution || '1280*720',
      ...(params.aspect_ratio ? { aspect_ratio: params.aspect_ratio } : {}),
    },
  };

  const response = await fetchImpl(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
      'X-DashScope-Async': 'enable',
    },
    body: JSON.stringify(body),
    signal,
  });

  const submitData = await response.json().catch(() => ({}));
  if (!response.ok || !submitData.output?.task_id) {
    throw Object.assign(new Error(submitData.message || 'DashScope 百炼服务响应异常'), {
      code: `DASHSCOPE_${submitData.code || response.status}`,
    });
  }

  const taskId = submitData.output.task_id;
  const pollUrl = `https://dashscope.aliyuncs.com/api/v1/tasks/${taskId}`;
  const maxAttempts = 120;
  const pollInterval = 3000;
  let resultUrl = null;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    if (signal?.aborted) break;
    await new Promise((resolve) => setTimeout(resolve, pollInterval));
    const pollRes = await fetchImpl(pollUrl, {
      headers: { Authorization: `Bearer ${apiKey}` },
      signal,
    });
    if (pollRes.ok) {
      const pollData = await pollRes.json().catch(() => ({}));
      const taskStatus = pollData.output?.task_status;
      if (taskStatus === 'SUCCEEDED') {
        resultUrl = pollData.output?.video_url || pollData.output?.results?.[0]?.url || null;
        break;
      }
      if (taskStatus === 'FAILED') {
        throw Object.assign(new Error(pollData.output?.message || 'DashScope 生成任务失败'), {
          code: 'DASHSCOPE_GENERATION_FAILED',
          providerRequestId: taskId,
          terminalFailure: true,
        });
      }
    }
  }

  return {
    providerRequestId: taskId,
    resultUrl,
    // DashScope's documented task response does not report settled account cost.
    actualCostUsd: null,
    metadata: { provider: 'dashscope', taskId },
  };
}

/**
 * DeepSeek 官方接口原生直连适配器
 */
async function executeDeepSeekGeneration({ creation, input, apiKey, signal, fetchImpl }) {
  const modelName = creation.model || input.endpoint || 'deepseek-chat';
  const params = input.parameters || input;
  const messages = Array.isArray(params.messages) && params.messages.length > 0
    ? params.messages
    : [
        ...(params.system ? [{ role: 'system', content: params.system }] : []),
        { role: 'user', content: input.prompt || params.prompt || '' },
      ];

  const response = await fetchImpl('https://api.deepseek.com/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: modelName,
      messages,
      stream: false,
      ...(params.temperature !== undefined ? { temperature: params.temperature } : {}),
      ...(params.max_tokens ? { max_tokens: params.max_tokens } : {}),
    }),
    signal,
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data.choices?.[0]?.message) {
    throw Object.assign(new Error(data.error?.message || 'DeepSeek 服务响应异常'), {
      code: `DEEPSEEK_${response.status}`,
    });
  }

  const content = data.choices[0].message?.content || '';
  return {
    providerRequestId: data.id || `ds_${Date.now()}`,
    resultUrl: null,
    output: content,
    actualCostUsd: null,
    metadata: { provider: 'deepseek', model: modelName, usage: data.usage },
  };
}

export function getGenerationProvider({ provider, fetchImpl } = {}) {
  if (provider === 'mock' || process.env.GENERATION_PROVIDER_MODE === 'mock') {
    // A mock provider is only valid for an isolated automated test run.  A
    // staging or developer server must fail closed as well; otherwise a
    // copied environment variable can make the UI report fake generations.
    const explicitlyAllowed = process.env.ALLOW_MOCK_GENERATION === 'true'
      && (process.env.E2E_TEST_MODE === 'true' || process.env.NODE_ENV === 'test');
    if (!explicitlyAllowed) {
      throw Object.assign(new Error('生产环境禁止使用模拟模型供应商'), { code: 'MOCK_PROVIDER_DISABLED' });
    }
    return createMockGenerationProvider({ outcome: process.env.MOCK_PROVIDER_OUTCOME || 'succeeded' });
  }
  return createHttpGenerationProvider({ fetchImpl });
}
