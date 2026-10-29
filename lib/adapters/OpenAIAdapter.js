import 'server-only';

import { BaseAdapter } from './BaseAdapter.js';

export class OpenAIAdapter extends BaseAdapter {
  constructor(options = {}) {
    super({
      providerId: 'openai',
      baseUrl: options.baseUrl || 'https://api.openai.com',
      apiKey: options.apiKey,
      config: options.config || {},
    });
  }

  async createTask({ providerModelId, providerEndpoint, prompt, parameters = {}, idempotencyKey, signal } = {}) {
    if (!this.apiKey) {
      throw this.normalizeError(new Error('OpenAI API 密钥未配置'));
    }

    const task = parameters.task_type || 't2i';
    const mode = task === 't2t' ? 'text' : task === 't2a' ? 'audio' : task === 't2i' ? 'image' : null;
    if (!mode || (mode === 'audio' && !parameters.voice)) {
      throw Object.assign(new Error('渠道能力或必填参数未配置'), {code:'INVALID_INPUT',providerStatus:400});
    }
    const fallbackPath = mode === 'text' ? '/v1/chat/completions' : mode === 'audio' ? '/v1/audio/speech' : '/v1/images/generations';
    const url = this.resolveProviderEndpoint(providerEndpoint, fallbackPath);
    const model = providerModelId;
    if (!model) throw Object.assign(new Error('缺少已审核的供应商模型映射'),{code:'INVALID_INPUT',providerStatus:400});
    const allowed = mode === 'text'
      ? ['temperature','top_p','max_tokens','max_completion_tokens','reasoning_effort','response_format','seed','stop','frequency_penalty','presence_penalty']
      : mode === 'audio' ? ['voice','response_format','speed','instructions']
        : ['quality','background','output_format','output_compression','moderation'];
    const declared = Object.fromEntries(allowed.filter(key=>parameters[key] !== undefined).map(key=>[key,parameters[key]]));
    const body = mode === 'text'
      ? {...declared,model,messages:parameters.messages?.length ? parameters.messages : [{role:'user',content:prompt || ''}],stream:false}
      : mode === 'audio' ? {...declared,model,input:parameters.input || parameters.text || prompt || '',stream_format:'audio'}
        : {...declared,model,prompt:prompt || '',n:1,size:parameters.resolution || parameters.size || '1024x1024'};

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.apiKey}`,
          ...(idempotencyKey ? {'Idempotency-Key':idempotencyKey} : {}),
        },
        body: JSON.stringify(body),
        signal,
      });

      const providerRequestId = response.headers.get('x-request-id') || null;
      if (mode === 'audio' && response.ok) {
        const mime = response.headers.get('content-type')?.split(';')[0];
        if (!mime?.startsWith('audio/')) throw Object.assign(new Error('供应商未返回音频文件'),{code:'EMPTY_RESULT_URL',providerRequestId});
        const buffer = Buffer.from(await response.arrayBuffer());
        if (!buffer.length) throw Object.assign(new Error('供应商返回空音频文件'),{code:'EMPTY_RESULT_URL',providerRequestId});
        return {providerRequestId,status:'succeeded',resultUrl:`data:${mime};base64,${buffer.toString('base64')}`,actualCostUsd:null};
      }
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw Object.assign(new Error(data.error?.message || '供应商拒绝生成请求'),{providerStatus:response.status});
      }
      const resultText = mode === 'text' ? data.choices?.[0]?.message?.content : null;
      const image = data.data?.[0];
      const resultUrl = mode === 'image' ? image?.url || (image?.b64_json ? `data:image/png;base64,${image.b64_json}` : null) : null;
      if (!resultUrl && !resultText) throw Object.assign(new Error('供应商未返回可用的生成结果'),{code:'EMPTY_RESULT_URL',providerRequestId});
      return {providerRequestId:data.id || providerRequestId,status:'succeeded',resultUrl,output:resultText,resultText,actualCostUsd:null};
    } catch (error) {
      throw this.normalizeError(error);
    }
  }

  async getTask(providerTaskId, { signal } = {}) {
    return {
      status: 'processing',
      resultUrl: null,
      reconciliationRequired: true,
      reason: 'SYNCHRONOUS_RESULT_NOT_RECOVERABLE',
    };
  }

  async healthCheck() {
    const startedAt = Date.now();
    try {
      if (!this.apiKey) return { healthy: false, latencyMs: 0, message: '未配置 OPENAI_API_KEY' };
      const res = await fetch(`${this.baseUrl}/v1/models`, {
        headers: { Authorization: `Bearer ${this.apiKey}` },
        signal: AbortSignal.timeout(6000),
      });
      return { healthy: res.ok, latencyMs: Date.now() - startedAt, message: res.ok ? 'OK' : `HTTP ${res.status}` };
    } catch (err) {
      return { healthy: false, latencyMs: Date.now() - startedAt, message: err.message };
    }
  }
}
