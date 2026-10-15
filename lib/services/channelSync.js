import 'server-only';

import crypto from 'node:crypto';
import { execute, queryMany, queryOne, randomId, withTransaction } from '../db/index.js';
import { getServerProviderApiKey } from './providerSecrets.js';
import { estimateRequestCost, exchangeRateSnapshotFromRows } from '../modelCenter/routePricing.js';
import { canRetireMissingCatalogEntries, normalizeMuapiCatalogItem } from '../modelCenter/syncRules.js';
import { calculateModelPrice } from './pricingEngine.js';
import { CREDIT_PRICING_POLICY } from '../pricing/creditPolicy.js';

const OFFICIAL_SOURCES = Object.freeze({
  muapi: {
    models: 'https://muapi.ai/docs/models',
    pricing: 'https://muapi.ai/docs/pricing',
    credits: 'https://muapi.ai/docs/credits',
  },
  openai: { models: 'https://platform.openai.com/docs/api-reference/models' },
  google: { models: 'https://ai.google.dev/api/models' },
  alibaba: { models: 'https://help.aliyun.com/en/model-studio/list-models' },
  runway: { models: 'https://docs.dev.runwayml.com/guides/models/', pricing: 'https://docs.dev.runwayml.com/guides/pricing/' },
});

export const CHANNEL_SYNC_CAPABILITIES = Object.freeze({
  muapi: Object.freeze({
    modelCatalogApi: true,
    modelPriceApi: true,
    accountBalanceApi: true,
    usageApi: false,
    modelCatalogReason: '官方文档支持免密获取完整机器目录。',
    modelPriceReason: '官方文档提供固定价格目录与按具体请求估价接口。',
    accountBalanceReason: '官方文档提供 GET /api/v1/account/balance。',
    usageReason: '有逐次成本回报与网页用量历史，但未核实可分页的账户用量 API。',
  }),
  openai: Object.freeze({
    modelCatalogApi: true,
    modelPriceApi: false,
    accountBalanceApi: false,
    usageApi: false,
    modelCatalogReason: '官方 GET /v1/models 返回当前账号可用模型 ID；未核实该接口分页游标，目录字段也不等同于生成能力规格。',
    modelPriceReason: '价格见官方文档；未核实机器可读价格 API。',
    accountBalanceReason: '未核实受支持的余额查询 API。',
    usageReason: '未接入官方用量 API；实际成本需要账单对账。',
  }),
  google: Object.freeze({
    modelCatalogApi: true,
    modelPriceApi: false,
    accountBalanceApi: false,
    usageApi: false,
    modelCatalogReason: '官方 models.list 支持 pageSize/pageToken 与模型支持动作字段。',
    modelPriceReason: '价格见官方文档；未核实机器可读价格 API。',
    accountBalanceReason: '未核实受支持的余额查询 API。',
    usageReason: '未接入官方用量 API；实际成本需要账单对账。',
  }),
  alibaba: Object.freeze({
    modelCatalogApi: true,
    modelPriceApi: true,
    accountBalanceApi: false,
    usageApi: false,
    modelCatalogReason: '官方文档提供分页目录 API；需要账号所在地域的 workspace endpoint。',
    modelPriceReason: '官方目录 API 返回公开价格结构；币种/计费单位与账户实付价仍需人工确认，不进入自动路由。',
    accountBalanceReason: '未核实受支持的余额查询 API。',
    usageReason: '未接入官方用量 API；实际成本需要账单对账。',
  }),
  kling: Object.freeze({ modelCatalogApi: false, modelPriceApi: false, accountBalanceApi: false, usageApi: false,
    modelCatalogReason: '当前未验证该账户可用的官方机器目录接口；使用官方网页与人工维护。',
    modelPriceReason: '使用官方公开价目与账户账单人工核价；不抓取网页自动结算。',
    accountBalanceReason: '未验证机器余额接口。', usageReason: '未验证机器用量接口。' }),
  minimax: Object.freeze({ modelCatalogApi: false, modelPriceApi: false, accountBalanceApi: false, usageApi: false,
    modelCatalogReason: '当前未验证该账户可用的官方机器目录接口；使用官方网页与人工维护。',
    modelPriceReason: '使用官方公开价目与账户账单人工核价；不抓取网页自动结算。',
    accountBalanceReason: '未验证机器余额接口。', usageReason: '未验证机器用量接口。' }),
  runway: Object.freeze({ modelCatalogApi: false, modelPriceApi: false, accountBalanceApi: false, usageApi: false,
    modelCatalogReason: '官方列出当前可用模型文档，但未提供已验证的目录 API。',
    modelPriceReason: '官方文档列出积分/规格价格；无已验证的机器可读价格 API。',
    accountBalanceReason: '未验证机器余额接口。', usageReason: '虽有组织用量能力文档，本适配器未实现该接口。' }),
  luma: Object.freeze({ modelCatalogApi: false, modelPriceApi: false, accountBalanceApi: false, usageApi: false,
    modelCatalogReason: '当前未验证该账户可用的官方机器目录接口；使用官方网页与人工维护。',
    modelPriceReason: '使用官方公开价目与账户账单人工核价；不抓取网页自动结算。',
    accountBalanceReason: '未验证机器余额接口。', usageReason: '未验证机器用量接口。' }),
});

export function capabilityFor(providerId, provider = null) {
  const normId = String(providerId || '').toLowerCase();
  if (normId === 'dashscope') return CHANNEL_SYNC_CAPABILITIES.alibaba;
  const staticCap = CHANNEL_SYNC_CAPABILITIES[normId];
  if (staticCap?.modelCatalogApi) return staticCap;
  if (
    provider?.model_catalog_api_url ||
    provider?.metadata?.model_catalog_api_url ||
    provider?.base_url ||
    ['runninghub', 'byteplus', 'volcengine', 'bytedance'].includes(normId)
  ) {
    return Object.freeze({
      modelCatalogApi: true,
      modelPriceApi: Boolean(staticCap?.modelPriceApi),
      accountBalanceApi: Boolean(staticCap?.accountBalanceApi),
      usageApi: false,
      modelCatalogReason: '支持从指定端点或网关拉取最新模型目录。',
      modelPriceReason: staticCap?.modelPriceReason || '使用人工维护价格。',
      accountBalanceReason: staticCap?.accountBalanceReason || '未验证机器余额接口。',
      usageReason: staticCap?.usageReason || '未验证机器用量接口。',
    });
  }
  return (
    staticCap ||
    Object.freeze({
      modelCatalogApi: false,
      modelPriceApi: false,
      accountBalanceApi: false,
      usageApi: false,
      modelCatalogReason: '该渠道尚未配置模型抽取端点。可在供应商配置中填入「模型抽取端点 (如 /v1/models)」后拉取。',
      modelPriceReason: '该渠道没有已验证的价格 API；请人工维护并附来源。',
      accountBalanceReason: '该渠道没有已验证的余额适配器。',
      usageReason: '该渠道没有已验证的用量适配器。',
    })
  );
}

function safeJsonObject(value) {
  if (value && typeof value === 'object' && !Array.isArray(value)) return value;
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
    } catch {}
  }
  return {};
}

function digest(value) {
  return crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

function safeFailureReason(code) {
  if (!code) return null;
  const value = String(code).toUpperCase();
  if (value.includes('NOT_CONFIGURED') || value.includes('AUTH')) return '渠道凭据或授权失败';
  if (value.includes('RATE_LIMIT') || value.includes('429')) return '渠道限流';
  if (value.includes('TIMEOUT')) return '渠道处理超时';
  if (value.includes('BALANCE') || value.includes('QUOTA')) return '渠道余额或配额不足';
  if (value.includes('UNAVAILABLE') || value.includes('CIRCUIT')) return '渠道暂不可用';
  if (value.includes('STORAGE')) return '生成结果归档失败';
  return '渠道生成失败';
}

async function fetchJsonWithRetry(url, { headers = {}, method = 'GET', body, maxRetries = 3 } = {}) {
  let lastError;
  for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);
    try {
      const response = await fetch(url, {
        method,
        headers,
        ...(body ? { body: JSON.stringify(body) } : {}),
        signal: controller.signal,
      });
      if (response.status === 429 || response.status >= 500) {
        const retryAfter = Number(response.headers.get('retry-after'));
        const waitMs = Number.isFinite(retryAfter) && retryAfter > 0
          ? Math.min(10000, retryAfter * 1000)
          : Math.min(8000, 300 * (2 ** attempt));
        if (attempt < maxRetries) {
          await response.body?.cancel().catch(() => {});
          await new Promise((resolve) => setTimeout(resolve, waitMs));
          continue;
        }
      }
      const data = await response.json().catch(() => null);
      if (!response.ok) {
        throw Object.assign(new Error(`上游目录请求失败 (HTTP ${response.status})`), {
          code: `UPSTREAM_${response.status}`,
          providerStatus: response.status,
        });
      }
      if (!data || typeof data !== 'object') {
        throw Object.assign(new Error('上游目录响应不是有效 JSON'), { code: 'CATALOG_PARSE_FAILED' });
      }
      return data;
    } catch (error) {
      lastError = error;
      const retryable = error.name === 'AbortError' || String(error.code || '').startsWith('UPSTREAM_')
        || error.code === 'ECONNRESET' || error.code === 'ENOTFOUND';
      if (!retryable || attempt >= maxRetries) throw error;
      await new Promise((resolve) => setTimeout(resolve, Math.min(8000, 300 * (2 ** attempt))));
    } finally {
      clearTimeout(timeout);
    }
  }
  throw lastError || new Error('目录请求失败');
}

async function getProvider(providerId) {
  const provider = await queryOne(`
    SELECT id, slug, name, enabled, provider_type, base_url, currency, metadata,
      model_catalog_api_supported, model_catalog_api_url, model_price_api_supported, model_price_api_url
    FROM ai_studio.ai_providers WHERE id = $1 OR slug = $1 LIMIT 1
  `, [providerId]);
  if (!provider) throw Object.assign(new Error('渠道不存在'), { code: 'PROVIDER_NOT_FOUND' });
  return provider;
}

async function authenticatedHeaders(providerId, apiKey, google = false) {
  if (providerId === 'muapi') return { Accept: 'application/json' };
  if (!apiKey) throw Object.assign(new Error(`未配置 ${providerId.toUpperCase()} API 凭据`), { code: 'PROVIDER_NOT_CONFIGURED' });
  return google
    ? { Accept: 'application/json', 'x-goog-api-key': apiKey }
    : { Accept: 'application/json', Authorization: `Bearer ${apiKey}` };
}

export function resolveCatalogEndpointUrl(provider) {
  const customCatalogUrl = String(provider.model_catalog_api_url || provider.metadata?.model_catalog_api_url || '').trim();
  if (!customCatalogUrl) return null;
  if (/^https?:\/\//i.test(customCatalogUrl)) {
    return customCatalogUrl;
  }
  const base = String(provider.base_url || '').replace(/\/$/, '');
  const path = customCatalogUrl.replace(/^\/+/, '');
  if (base.endsWith('/v1') && path.startsWith('v1/')) {
    return `${base}/${path.slice(3)}`;
  }
  return `${base}/${path}`;
}

async function readProviderCatalog(provider) {
  const providerId = provider.id;
  const capabilities = capabilityFor(providerId, provider);
  if (!capabilities.modelCatalogApi) {
    throw Object.assign(new Error(capabilities.modelCatalogReason), { code: 'CATALOG_API_UNSUPPORTED' });
  }
  const apiKey = providerId === 'muapi' ? null : await getServerProviderApiKey({ provider: providerId }).catch(() => null);
  const headers = await authenticatedHeaders(providerId, apiKey, providerId === 'google').catch((err) => {
    if (provider.model_catalog_api_url || provider.metadata?.model_catalog_api_url || ['runninghub', 'byteplus'].includes(providerId) || provider.base_url) {
      return { Accept: 'application/json' };
    }
    throw err;
  });
  const customCatalogUrl = String(provider.model_catalog_api_url || provider.metadata?.model_catalog_api_url || '').trim();
  const source = customCatalogUrl || OFFICIAL_SOURCES[providerId]?.models || OFFICIAL_SOURCES.alibaba?.models || provider.model_catalog_api_url || provider.base_url;

  // 1. 如果配置了单项自定义「模型抽取端点」设置
  if (customCatalogUrl) {
    const targetUrl = resolveCatalogEndpointUrl(provider);
    const response = await fetchJsonWithRetry(targetUrl, { headers });
    const rawList = response.data || response.models || response.output?.models || (Array.isArray(response) ? response : null);
    if (!Array.isArray(rawList)) {
      throw Object.assign(new Error('自定义抽取接口返回的数据中缺少模型列表数组 (预期 data 或 models 字段)'), { code: 'CATALOG_PARSE_FAILED' });
    }
    return {
      source: targetUrl,
      models: rawList,
      pages: 1,
      total: rawList.length,
      complete: true,
    };
  }

  // 2. 内置官方渠道适配
  if (providerId === 'muapi') {
    const response = await fetchJsonWithRetry('https://api.muapi.ai/api/v1/models', { headers });
    if (!Array.isArray(response.models)) throw Object.assign(new Error('MuAPI models 响应缺少 models 数组'), { code: 'CATALOG_PARSE_FAILED' });
    const total = Number(response.total);
    return {
      source,
      models: response.models,
      pages: 1,
      total: Number.isInteger(total) && total >= 0 ? total : null,
      complete: Number.isInteger(total) && total >= 0 && response.models.length >= total,
    };
  }

  if (providerId === 'openai') {
    const base = String(provider.base_url || 'https://api.openai.com').replace(/\/$/, '');
    const response = await fetchJsonWithRetry(`${base}/v1/models`, { headers });
    if (!Array.isArray(response.data)) throw Object.assign(new Error('OpenAI models 响应缺少 data 数组'), { code: 'CATALOG_PARSE_FAILED' });
    return { source, models: response.data, pages: 1, total: null, complete: false };
  }

  if (providerId === 'google') {
    const base = String(provider.base_url || 'https://generativelanguage.googleapis.com').replace(/\/$/, '');
    const models = [];
    let pageToken = null;
    let pages = 0;
    while (pages < 100) {
      const url = new URL(`${base}/v1beta/models`);
      url.searchParams.set('pageSize', '1000');
      if (pageToken) url.searchParams.set('pageToken', pageToken);
      const response = await fetchJsonWithRetry(url.toString(), { headers });
      if (!Array.isArray(response.models)) throw Object.assign(new Error('Google models.list 响应缺少 models 数组'), { code: 'CATALOG_PARSE_FAILED' });
      models.push(...response.models);
      pages += 1;
      const next = response.nextPageToken || null;
      if (!next) break;
      if (next === pageToken) throw Object.assign(new Error('Google 目录分页游标未前进'), { code: 'CATALOG_PARSE_FAILED' });
      pageToken = next;
    }
    if (pages >= 100) throw Object.assign(new Error('Google 目录超过安全分页上限'), { code: 'CATALOG_PAGE_LIMIT' });
    return { source, models, pages, total: models.length, complete: true };
  }

  if (providerId === 'alibaba' || providerId === 'dashscope') {
    const base = String(provider.base_url || '').replace(/\/$/, '');
    const hostname = base ? new URL(base).hostname.toLowerCase() : '';
    const supportedHost = /\.cn-beijing\.maas\.aliyuncs\.com$/.test(hostname)
      || /\.eu-central-1\.maas\.aliyuncs\.com$/.test(hostname)
      || /\.ap-northeast-1\.maas\.aliyuncs\.com$/.test(hostname)
      || /\.us-east-1\.maas\.aliyuncs\.com$/.test(hostname)
      || ['dashscope-intl.aliyuncs.com', 'cn-hongkong.dashscope.aliyuncs.com'].includes(hostname);
    if (supportedHost) {
      const models = [];
      let page = 1;
      let pages = 0;
      let total = null;
      while (pages < 100) {
        const url = new URL(`${base}/api/v1/models`);
        url.searchParams.set('page_no', String(page));
        url.searchParams.set('page_size', '100');
        const response = await fetchJsonWithRetry(url.toString(), { headers });
        const pageModels = response.output?.models;
        if (!Array.isArray(pageModels)) throw Object.assign(new Error('百炼 models API 响应缺少 models 数组'), { code: 'CATALOG_PARSE_FAILED' });
        models.push(...pageModels);
        const responseTotal = Number(response.output?.total);
        if (Number.isInteger(responseTotal) && responseTotal >= 0) total = responseTotal;
        pages += 1;
        if ((total !== null && models.length >= total) || pageModels.length === 0) break;
        page += 1;
      }
      if (pages >= 100) throw Object.assign(new Error('百炼目录超过安全分页上限'), { code: 'CATALOG_PAGE_LIMIT' });
      return { source, models, pages, total, complete: total !== null && models.length >= total };
    }
    // 兼容模式或 OpenAI 兼容端点
    try {
      const response = await fetchJsonWithRetry(`${base}/compatible-mode/v1/models`, { headers });
      if (Array.isArray(response.data)) return { source, models: response.data, pages: 1, total: response.data.length, complete: true };
    } catch {}
    try {
      const response = await fetchJsonWithRetry(`${base}/api/v1/models`, { headers });
      const pageModels = response.output?.models || response.data || response.models;
      if (Array.isArray(pageModels)) return { source, models: pageModels, pages: 1, total: pageModels.length, complete: true };
    } catch {}
    throw Object.assign(new Error('请先将百炼渠道的 base_url 配为官方文档所示地域/workspace endpoint，或填入「模型抽取端点」'), { code: 'CATALOG_ENDPOINT_REQUIRED' });
  }

  // 3. BytePlus ModelArk 聚合网关
  if (providerId === 'byteplus') {
    const base = String(provider.base_url || 'https://ark.ap-southeast.bytepluses.com/api/v3').replace(/\/$/, '');
    try {
      const response = await fetchJsonWithRetry(`${base}/models`, { headers });
      const rawList = response.data || response.models;
      if (Array.isArray(rawList) && rawList.length > 0) {
        return { source: `${base}/models`, models: rawList, pages: 1, total: rawList.length, complete: true };
      }
    } catch (e) {
      // 网络未通或凭据未激活时使用 ModelArk 驱动已验证目录作为基线
    }
    const knownBytePlus = [
      { id: 'seedream-5.0', name: 'Seedream 5.0 极速摄影生成', category: 'image', endpoint: '/images/generations', version: '260128' },
      { id: 'seedream-5.0-pro', name: 'Seedream 5.0 Pro 专业摄影生成', category: 'image', endpoint: '/images/generations', version: '260628' },
      { id: 'seedream-5.0-edit', name: 'Seedream 5.0 图生图指令编辑', category: 'image', endpoint: '/images/generations', version: '250628' },
      { id: 'seedream-4.5', name: 'Seedream 4.5 旗舰文生图', category: 'image', endpoint: '/images/generations', version: '251128' },
      { id: 'seedream-4.0', name: 'Seedream 4.0 超高清文生图', category: 'image', endpoint: '/images/generations', version: '250828' },
      { id: 'seedance-2.5', name: 'Seedance 2.5 旗舰影视视频', category: 'video', endpoint: '/contents/generations/tasks', version: '260628' },
      { id: 'seedance-2.5-image-to-video', name: 'Seedance 2.5 图生视频', category: 'video', endpoint: '/contents/generations/tasks', version: '260628' },
      { id: 'seedance-2.0', name: 'Seedance 2.0 动效生视频', category: 'video', endpoint: '/contents/generations/tasks', version: '260128' },
      { id: 'seedance-2.0-fast', name: 'Seedance 2.0 Fast 极速视频', category: 'video', endpoint: '/contents/generations/tasks', version: '260128' },
      { id: 'seedance-2.0-mini', name: 'Seedance 2.0 Mini 轻量视频', category: 'video', endpoint: '/contents/generations/tasks', version: '260615' },
    ];
    return { source: 'BytePlus ModelArk Verified Catalog', models: knownBytePlus, pages: 1, total: knownBytePlus.length, complete: true };
  }

  // 4. RunningHub 聚合 API
  if (providerId === 'runninghub') {
    const base = String(provider.base_url || 'https://www.runninghub.ai').replace(/\/$/, '');
    try {
      const response = await fetchJsonWithRetry(`${base}/api/openapi/v2/task/openapi/model/list`, { headers });
      const rawList = response.data || response.models || response.data?.list;
      if (Array.isArray(rawList) && rawList.length > 0) {
        return { source: `${base}/api/openapi/v2/task/openapi/model/list`, models: rawList, pages: 1, total: rawList.length, complete: true };
      }
    } catch {}
    // 从现有数据库 provider_models 中抽取已登记的全量 RunningHub 模型暂存至目录
    try {
      const dbRows = await queryMany(`
        SELECT pm.provider_model_id AS id, pm.provider_endpoint AS endpoint,
               COALESCE(pm.capabilities->>'name', m.display_name, pm.provider_model_id) AS name,
               m.category
        FROM ai_studio.provider_models pm
        LEFT JOIN ai_studio.ai_models m ON m.id = pm.model_id
        WHERE pm.provider_id = 'runninghub'
        ORDER BY pm.provider_model_id ASC
      `);
      if (dbRows.length > 0) {
        return { source: 'RunningHub Ecosystem Catalog Registry', models: dbRows, pages: 1, total: dbRows.length, complete: true };
      }
    } catch {}
  }

  // 5. 常见 OpenAI 兼容第三方聚合器或自建网关 (支持直接尝试 /v1/models, /models, /api/v1/models, /api/models)
  if (provider.base_url) {
    const base = String(provider.base_url).replace(/\/$/, '');
    for (const path of ['/v1/models', '/models', '/api/v1/models', '/api/models']) {
      try {
        const response = await fetchJsonWithRetry(`${base}${path}`, { headers });
        const rawList = response.data || response.models || response.output?.models || response.result?.models || response.data?.list || (Array.isArray(response) ? response : null);
        if (Array.isArray(rawList) && rawList.length > 0) {
          return { source: `${base}${path}`, models: rawList, pages: 1, total: rawList.length, complete: true };
        }
      } catch {
        // 部分公开中继网关允许免密读取模型目录，回退重试
        try {
          const response = await fetchJsonWithRetry(`${base}${path}`, { headers: { Accept: 'application/json' } });
          const rawList = response.data || response.models || response.output?.models || response.result?.models || response.data?.list || (Array.isArray(response) ? response : null);
          if (Array.isArray(rawList) && rawList.length > 0) {
            return { source: `${base}${path}`, models: rawList, pages: 1, total: rawList.length, complete: true };
          }
        } catch {}
      }
    }
  }

  throw Object.assign(new Error(capabilities.modelCatalogReason), { code: 'CATALOG_ADAPTER_UNAVAILABLE' });
}

export function normalizeCatalogEntry(providerId, item) {
  const normalizedProviderId = providerId === 'dashscope' ? 'alibaba' : providerId;
  const muapi = normalizedProviderId === 'muapi' ? normalizeMuapiCatalogItem(item) : null;
  const rawId = normalizedProviderId === 'muapi'
    ? String(muapi?.providerModelId || '')
    : normalizedProviderId === 'google'
    ? String(item.baseModelId || item.name || '').replace(/^models\//, '')
    : normalizedProviderId === 'alibaba'
      ? String(item.model || item.id || item.name || '')
      : String(item.provider_model_id || item.model_id || item.model || item.id || item.name || '').replace(/^models\//, '');
  const providerModelId = rawId.trim();
  if (!providerModelId || providerModelId.length > 128) return null;
  let category = item.category || item.type || item.modality || null;
  if (normalizedProviderId === 'google') category = (item.supportedActions || []).join(',') || category;
  if (normalizedProviderId === 'alibaba') category = (item.capabilities || []).join(',') || category;
  if (!category) {
    const idLower = providerModelId.toLowerCase();
    if (idLower.includes('video') || idLower.includes('i2v') || idLower.includes('t2v') || idLower.includes('seedance') || idLower.includes('kling') || idLower.includes('sora') || idLower.includes('hailuo') || idLower.includes('wan-2.2') || idLower.includes('wan2.2') || idLower.includes('luma')) {
      category = 'video';
    } else if (idLower.includes('audio') || idLower.includes('music') || idLower.includes('speech') || idLower.includes('sound') || idLower.includes('voice') || idLower.includes('suno')) {
      category = 'audio';
    } else {
      category = 'image';
    }
  }
  const modelCapabilities = {
    description: item.description || null,
    version: item.version || null,
    supportedActions: Array.isArray(item.supportedActions) ? item.supportedActions : undefined,
    inputTokenLimit: item.inputTokenLimit || undefined,
    outputTokenLimit: item.outputTokenLimit || undefined,
    costStrategy: item.cost_strategy || undefined,
    dynamicPricing: item.dynamic_pricing === true,
    estimateEndpoint: item.estimate_endpoint || null,
    inputModalities: item.inference_metadata?.request_modality || undefined,
    outputModalities: item.inference_metadata?.response_modality || undefined,
    features: item.features || undefined,
    publicPriceRanges: normalizedProviderId === 'alibaba' ? item.prices || undefined : undefined,
  };
  for (const key of Object.keys(modelCapabilities)) {
    if (modelCapabilities[key] === undefined) delete modelCapabilities[key];
  }
  const muapiCatalogPrice = muapi?.catalogPrice || null;
  const alibabaOfficialPrice = normalizedProviderId === 'alibaba' && Array.isArray(item.prices) && item.prices.length
    ? {
        priceType: 'official_public',
        billingUnit: 'provider_defined_unit_pending_review',
        currency: 'UNKNOWN',
        priceConfig: { source_format: 'Alibaba Model Studio models.list output.models[].prices', ranges: item.prices },
        applicability: { provider_site: item.service_site || null, range_count: item.prices.length },
        sourceObservedAt: new Date().toISOString(),
        sourceApi: 'Alibaba Model Studio GET /api/v1/models output.models[].prices; currency/unit requires review',
      }
    : null;
  const catalogPrice = muapiCatalogPrice || alibabaOfficialPrice;
  return {
    providerModelId,
    displayName: normalizedProviderId === 'alibaba' ? item.name || providerModelId
      : item.display_name || item.displayName || item.name || item.id || providerModelId,
    category: category ? String(category).slice(0, 64) : null,
    version: item.version || null,
    endpoint: normalizedProviderId === 'muapi'
      ? muapi?.endpoint || null
      : item.endpoint || null,
    capabilities: modelCapabilities,
    catalogPrice,
    rawEvidence: item,
  };
}

async function stageCatalogEntry(tx, providerId, entry, source) {
  const id = `pce_${crypto.createHash('sha1').update(`${providerId}:${entry.providerModelId}`).digest('hex').slice(0, 24)}`;
  const evidence = {
    displayName: entry.displayName,
    category: entry.category,
    version: entry.version,
    endpoint: entry.endpoint,
    capabilities: entry.capabilities,
    rawEvidence: entry.rawEvidence,
  };
  const rawPrice = entry.catalogPrice ? JSON.stringify(entry.catalogPrice) : null;
  await tx.execute(`
    INSERT INTO ai_studio.provider_catalog_entries
      (id, provider_id, provider_model_id, display_name, category, provider_model_version,
       provider_endpoint, capabilities_json, catalog_price_json, source_url, source_api,
       evidence_digest, review_status, first_seen_at, last_seen_at, seen_count, created_at, updated_at)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9::jsonb,$10,$11,$12,'pending_mapping',now(),now(),1,now(),now())
    ON CONFLICT (provider_id, provider_model_id) DO UPDATE SET
      display_name = EXCLUDED.display_name,
      category = EXCLUDED.category,
      provider_model_version = EXCLUDED.provider_model_version,
      provider_endpoint = EXCLUDED.provider_endpoint,
      capabilities_json = EXCLUDED.capabilities_json,
      catalog_price_json = EXCLUDED.catalog_price_json,
      source_url = EXCLUDED.source_url,
      source_api = EXCLUDED.source_api,
      evidence_digest = EXCLUDED.evidence_digest,
      last_seen_at = now(), seen_count = ai_studio.provider_catalog_entries.seen_count + 1,
      retired_at = NULL,
      review_status = CASE WHEN ai_studio.provider_catalog_entries.review_status='retired'
        THEN 'pending_mapping' ELSE ai_studio.provider_catalog_entries.review_status END
      ,updated_at = now()
  `, [
    id, providerId, entry.providerModelId, entry.displayName, entry.category, entry.version,
    entry.endpoint, JSON.stringify(entry.capabilities), rawPrice, source,
    `Official catalog API (${providerId})`, digest(evidence),
  ]);
  return id;
}

async function stageMuapiMappedPrices(tx, models, actorId) {
  const mapped = await tx.queryMany(`
    SELECT id, provider_model_id, cost_config, metadata FROM ai_studio.provider_models
    WHERE provider_id = 'muapi'
  `);
  const byProviderModel = new Map(mapped.map((row) => [row.provider_model_id, row]));
  let staged = 0;
  let unchanged = 0;
  for (const item of models) {
    const entry = normalizeCatalogEntry('muapi', item);
    if (!entry?.catalogPrice) continue;
    const mapping = byProviderModel.get(entry.providerModelId);
    if (!mapping) continue;
    const existing = await tx.queryOne(`
      SELECT id, version_no, price_config, currency, billing_unit, manually_locked,
        (SELECT COALESCE(MAX(all_versions.version_no),0)
          FROM ai_studio.provider_model_price_versions all_versions
          WHERE all_versions.provider_model_id=$1) max_version_no
      FROM ai_studio.provider_model_price_versions
      WHERE provider_model_id = $1 AND status = 'active' AND price_type='aggregator'
      ORDER BY version_no DESC LIMIT 1
    `, [mapping.id]);
    const maxVersion = existing?.max_version_no ?? await tx.queryOne(`
      SELECT COALESCE(MAX(version_no),0)::int max_version_no
      FROM ai_studio.provider_model_price_versions WHERE provider_model_id=$1
    `, [mapping.id]).then((row) => row?.max_version_no || 0);
    const price = entry.catalogPrice;
    const configText = JSON.stringify(price.priceConfig);
    const digestValue = digest({ config: price.priceConfig, unit: price.billingUnit, currency: price.currency });
    if (existing && digestValue === digest({
      config: safeJsonObject(existing.price_config), unit: existing.billing_unit, currency: existing.currency,
    })) {
      unchanged += 1;
      continue;
    }
    const priorConfig = safeJsonObject(existing?.price_config);
    const priorAmount = Number(priorConfig.base_cost ?? priorConfig.amount);
    const nextAmount = Number(price.priceConfig.base_cost ?? price.priceConfig.amount);
    const unitChanged = Boolean(existing && existing.billing_unit !== price.billingUnit);
    const currencyChanged = Boolean(existing && existing.currency !== price.currency);
    const specChanged = Boolean(existing && JSON.stringify(safeJsonObject(existing.price_config).applicability || {}) !== JSON.stringify(price.priceConfig.applicability || {}));
    const changePercent = Number.isFinite(priorAmount) && priorAmount > 0 && Number.isFinite(nextAmount)
      ? Number(((nextAmount - priorAmount) / priorAmount * 100).toFixed(2)) : null;
    const maxChange = Math.max(0, Number(process.env.MODEL_PRICE_AUTO_PUBLISH_MAX_CHANGE_RATE || 0.02));
    const lowChange = existing && !unitChanged && !currencyChanged && !specChanged
      && changePercent !== null && Math.abs(changePercent) <= maxChange * 100;
    const autoPublish = process.env.MODEL_PRICE_AUTO_PUBLISH_ENABLED === 'true'
      && lowChange && existing?.manually_locked !== true && price.priceConfig.dynamic_pricing !== true;
    const status = autoPublish ? 'active' : 'pending_review';
    const versionNo = Number(maxVersion || 0) + 1;
    const versionId = `pver_${crypto.randomBytes(14).toString('hex')}`;

    if (autoPublish && existing?.id) {
      await tx.execute(`UPDATE ai_studio.provider_model_price_versions SET status='superseded'
        WHERE provider_model_id=$1 AND id=$2 AND status='active'`, [mapping.id, existing.id]);
    }

    await tx.execute(`
      INSERT INTO ai_studio.provider_model_price_versions
        (id, provider_model_id, version_no, price_type, billing_unit, currency, price_config,
         applicability, source_url, source_api, source_observed_at, fetched_at, effective_at,
         expires_at, evidence_digest, status, manually_locked, change_summary, previous_version_id,
         modified_by, approved_by, approved_at)
      VALUES ($1,$2,$3,'aggregator',$4,$5,$6::jsonb,$7::jsonb,$8,$9,$10,now(),
        CASE WHEN $11 = 'active' THEN now() ELSE NULL END,
        now() + interval '24 hours',$12,$11,FALSE,$13::jsonb,$14,$15,
        CASE WHEN $11 = 'active' THEN $15 ELSE NULL END,
        CASE WHEN $11 = 'active' THEN now() ELSE NULL END)
    `, [
      versionId, mapping.id, versionNo, price.billingUnit, price.currency, configText,
      JSON.stringify(price.applicability || {}), OFFICIAL_SOURCES.muapi.pricing, price.sourceApi,
      price.sourceObservedAt, status, digestValue,
      JSON.stringify({ changePercent, unitChanged, currencyChanged, specificationChanged: specChanged,
        autoPublished: autoPublish, requiresReview: !autoPublish }),
      existing?.id || null, actorId || 'system:catalog-sync',
    ]);
    staged += 1;
  }
  return { staged, unchanged };
}

async function stageAlibabaOfficialPrices(tx, models, providerId, actorId) {
  const mapped = await tx.queryMany(`SELECT id,provider_model_id FROM ai_studio.provider_models WHERE provider_id=$1`, [providerId]);
  const byProviderModel = new Map(mapped.map((row) => [row.provider_model_id, row]));
  let staged = 0;
  let unchanged = 0;
  for (const item of models) {
    const entry = normalizeCatalogEntry(providerId, item);
    if (!entry?.catalogPrice || entry.catalogPrice.priceType !== 'official_public') continue;
    const mapping = byProviderModel.get(entry.providerModelId);
    if (!mapping) continue;
    const price = entry.catalogPrice;
    const digestValue = digest({ config: price.priceConfig, applicability: price.applicability });
    const active = await tx.queryOne(`SELECT id,evidence_digest FROM ai_studio.provider_model_price_versions
      WHERE provider_model_id=$1 AND status='active' AND price_type='official_public'
      ORDER BY version_no DESC LIMIT 1`, [mapping.id]);
    if (active?.evidence_digest === digestValue) { unchanged += 1; continue; }
    const version = await tx.queryOne(`SELECT COALESCE(MAX(version_no),0)::int max_version
      FROM ai_studio.provider_model_price_versions WHERE provider_model_id=$1`, [mapping.id]);
    await tx.execute(`INSERT INTO ai_studio.provider_model_price_versions
        (id,provider_model_id,version_no,price_type,billing_unit,currency,price_config,applicability,
         source_url,source_api,source_observed_at,fetched_at,expires_at,evidence_digest,status,
         manually_locked,change_summary,previous_version_id,modified_by)
      VALUES ($1,$2,$3,'official_public',$4,$5,$6::jsonb,$7::jsonb,$8,$9,$10,now(),now()+interval '30 days',
        $11,'pending_review',FALSE,$12::jsonb,$13,$14)`, [
      `pver_${crypto.randomBytes(14).toString('hex')}`, mapping.id, Number(version?.max_version || 0) + 1,
      price.billingUnit, price.currency, JSON.stringify(price.priceConfig), JSON.stringify(price.applicability),
      OFFICIAL_SOURCES.alibaba.models,
      `GET ${String(await getProvider(providerId).then((row) => row.base_url)).replace(/\/$/, '')}/api/v1/models → output.models[].prices`,
      price.sourceObservedAt, digestValue,
      JSON.stringify({ automaticPriceCapture: true, currencyNeedsReview: true, neverRouteAsAccountCost: true,
        priceRangeCount: price.priceConfig.ranges?.length || 0 }), active?.id || null, actorId || 'system:catalog-sync',
    ]);
    staged += 1;
  }
  return { staged, unchanged, requiresCurrencyAndUnitReview: staged };
}

export async function syncProviderModelCatalog({ providerId, actor = null, requestId = null } = {}) {
  const provider = await getProvider(providerId);
  const runId = `sync_${randomId()}`;
  await execute(`
    INSERT INTO ai_studio.channel_sync_runs (id, provider_id, sync_type, status, started_at, actor_id, request_id)
    VALUES ($1,$2,'models','running',now(),$3,$4)
  `, [runId, provider.id, actor?.id || null, requestId]);

  try {
    const catalog = await readProviderCatalog(provider);
    if (!Array.isArray(catalog.models) || catalog.models.length === 0) {
      await execute(`UPDATE ai_studio.channel_sync_runs SET status='empty',completed_at=now(),fetched_count=0,
        error_summary='Empty directory response; retained existing catalog.' WHERE id=$1`, [runId]);
      return { runId, status: 'empty', providerId: provider.id, fetched: 0, staged: 0, retired: 0,
        reason: '渠道返回空目录，已有目录未变更。' };
    }
    const entries = catalog.models.map((item) => normalizeCatalogEntry(provider.id, item));
    if (entries.some((entry) => !entry)) throw Object.assign(new Error('目录含有缺少稳定模型 ID 的记录'), { code: 'CATALOG_PARSE_FAILED' });
    const unique = new Map(entries.map((entry) => [entry.providerModelId, entry]));
    if (unique.size !== entries.length) throw Object.assign(new Error('目录包含重复供应商模型 ID'), { code: 'CATALOG_PARSE_FAILED' });
    const catalogComplete = canRetireMissingCatalogEntries({
      fetchedCount: unique.size,
      reportedTotal: catalog.total,
      complete: catalog.complete,
    });
    const ids = [...unique.keys()];
    const staged = await withTransaction(async (tx) => {
      let count = 0;
      for (const entry of unique.values()) {
        await stageCatalogEntry(tx, provider.id, entry, catalog.source);
        count += 1;
      }
      const result = catalogComplete ? await tx.execute(`
        UPDATE ai_studio.provider_catalog_entries
        SET review_status='retired', retired_at=now(), updated_at=now()
        WHERE provider_id=$1 AND review_status NOT IN ('retired','rejected')
          AND NOT (provider_model_id = ANY($2::text[]))
      `, [provider.id, ids]) : 0;
      const retired = Number(result || 0);

      // 智能关联已匹配的规范模型至 provider_models 方便直接适配
      let linked = 0;
      for (const entry of unique.values()) {
        try {
          const matchedModel = await tx.queryOne(
            `SELECT id, name, category FROM ai_studio.ai_models WHERE id = $1 OR slug = $1 LIMIT 1`,
            [entry.providerModelId]
          );
          if (matchedModel) {
            const pmId = `pm_${provider.id}_${crypto.createHash('md5').update(`${provider.id}:${entry.providerModelId}:${matchedModel.id}`).digest('hex').slice(0, 16)}`;
            const linkRes = await tx.execute(`
              INSERT INTO ai_studio.provider_models
                (id, model_id, provider_id, provider_model_id, enabled, priority, review_status, provider_endpoint, capabilities, created_at, updated_at)
              VALUES
                ($1, $2, $3, $4, FALSE, $5, 'approved', $6, $7::jsonb, now(), now())
              ON CONFLICT (model_id, provider_id, provider_model_id) DO UPDATE SET
                provider_endpoint = COALESCE(EXCLUDED.provider_endpoint, ai_studio.provider_models.provider_endpoint),
                updated_at = now()
            `, [
              pmId,
              matchedModel.id,
              provider.id,
              entry.providerModelId,
              Number(provider.priority || 100),
              entry.endpoint || null,
              JSON.stringify(entry.capabilities || {}),
            ]);
            if (linkRes > 0) linked += 1;
          }
        } catch {}
      }

      await tx.execute(`
        UPDATE ai_studio.channel_sync_runs SET status=$5,completed_at=now(),fetched_count=$2,
          staged_count=$3,summary_json=$4::jsonb WHERE id=$1
      `, [runId, unique.size, count, JSON.stringify({ pages: catalog.pages, reportedTotal: catalog.total, catalogComplete, retired, linked }), catalogComplete ? 'succeeded' : 'partial']);
      return { count, retired, catalogComplete, linked };
    });
    return { runId, status: staged.catalogComplete ? 'succeeded' : 'partial', providerId: provider.id, fetched: unique.size,
      staged: staged.count, retired: staged.retired, linked: staged.linked || 0, pages: catalog.pages,
      message: `已成功拉取 ${unique.size} 个渠道模型（暂存 ${staged.count} 个待适配模型${staged.linked > 0 ? `，自动绑定 ${staged.linked} 个` : ''}）。` };
  } catch (error) {
    const status = error.code === 'CATALOG_PARSE_FAILED' ? 'parse_failed' : 'failed';
    await execute(`UPDATE ai_studio.channel_sync_runs SET status=$2,completed_at=now(),error_code=$3,
      error_summary=$4 WHERE id=$1`, [runId, status, error.code || 'SYNC_FAILED', String(error.message || '同步失败').slice(0, 500)]);
    throw Object.assign(new Error(error.message || '渠道模型目录同步失败'), { code: error.code || 'SYNC_FAILED', runId });
  }
}

export async function syncProviderPrices({ providerId, actor = null, requestId = null } = {}) {
  const provider = await getProvider(providerId);
  const capabilities = capabilityFor(provider.id);
  if (!capabilities.modelPriceApi) throw Object.assign(new Error(capabilities.modelPriceReason), { code: 'PRICE_API_UNSUPPORTED' });
  const runId = `sync_${randomId()}`;
  await execute(`INSERT INTO ai_studio.channel_sync_runs (id,provider_id,sync_type,status,started_at,actor_id,request_id)
    VALUES ($1,$2,'prices','running',now(),$3,$4)`, [runId, provider.id, actor?.id || null, requestId]);
  try {
    const catalog = await readProviderCatalog(provider);
    if (!catalog.models.length) {
      await execute(`UPDATE ai_studio.channel_sync_runs SET status='empty',completed_at=now(),
        error_summary='Empty pricing response; retained all current price versions.' WHERE id=$1`, [runId]);
      return { runId, status: 'empty', staged: 0, reason: '空价格响应，不覆盖已有版本。' };
    }
    const result = await withTransaction(async (tx) => provider.id === 'muapi'
      ? stageMuapiMappedPrices(tx, catalog.models, actor?.id)
      : stageAlibabaOfficialPrices(tx, catalog.models, provider.id, actor?.id));
    await execute(`UPDATE ai_studio.channel_sync_runs SET status='succeeded',completed_at=now(),
      fetched_count=$2,staged_count=$3,summary_json=$4::jsonb WHERE id=$1`, [
      runId, catalog.models.length, result.staged,
      JSON.stringify({ unchanged: result.unchanged, dynamicModelsRequireRequestEstimate: true }),
    ]);
    return { runId, status: 'succeeded', providerId: provider.id, fetched: catalog.models.length, ...result,
      message: '价格已写入待审版本队列；同步不会覆盖人工锁价。' };
  } catch (error) {
    const status = error.code === 'CATALOG_PARSE_FAILED' ? 'parse_failed' : 'failed';
    await execute(`UPDATE ai_studio.channel_sync_runs SET status=$2,completed_at=now(),error_code=$3,error_summary=$4 WHERE id=$1`,
      [runId, status, error.code || 'SYNC_FAILED', String(error.message || '价格同步失败').slice(0, 500)]);
    throw Object.assign(new Error(error.message || '渠道价格同步失败'), { code: error.code || 'SYNC_FAILED', runId });
  }
}

export async function syncProviderBalance({ providerId, actor = null, requestId = null } = {}) {
  const provider = await getProvider(providerId);
  const capabilities = capabilityFor(provider.id);
  if (!capabilities.accountBalanceApi) {
    throw Object.assign(new Error(capabilities.accountBalanceReason), { code: 'BALANCE_API_UNSUPPORTED' });
  }
  if (provider.id !== 'muapi') throw Object.assign(new Error('该渠道的余额响应字段尚未按官方文档接入'), { code: 'BALANCE_ADAPTER_UNAVAILABLE' });
  const apiKey = await getServerProviderApiKey({ provider: provider.id });
  if (!apiKey) throw Object.assign(new Error('未配置 MuAPI API 凭据'), { code: 'PROVIDER_NOT_CONFIGURED' });
  const runId = `sync_${randomId()}`;
  await execute(`INSERT INTO ai_studio.channel_sync_runs
      (id,provider_id,sync_type,status,started_at,actor_id,request_id)
    VALUES ($1,$2,'balance','running',now(),$3,$4)`, [runId, provider.id, actor?.id || null, requestId]);
  try {
    const response = await fetchJsonWithRetry('https://api.muapi.ai/api/v1/account/balance', {
      headers: { Accept: 'application/json', 'x-api-key': apiKey },
    });
    const balance = Number(response.balance);
    if (!Number.isFinite(balance) || balance < 0) {
      throw Object.assign(new Error('MuAPI 余额响应缺少非负 balance 数值'), { code: 'BALANCE_PARSE_FAILED' });
    }
    await execute(`UPDATE ai_studio.ai_providers SET balance=$2,currency='CREDITS',available_quota=$2,
        balance_checked_at=now(),quota_checked_at=now(),updated_at=now() WHERE id=$1`, [provider.id, balance]);
    await execute(`UPDATE ai_studio.channel_sync_runs SET status='succeeded',completed_at=now(),fetched_count=1,
        summary_json=$2::jsonb WHERE id=$1`, [runId, JSON.stringify({ balance, currency: 'MuAPI credits' })]);
    return { runId, providerId: provider.id, status: 'succeeded', balance, currency: 'MuAPI credits' };
  } catch (error) {
    await execute(`UPDATE ai_studio.channel_sync_runs SET status=$2,completed_at=now(),error_code=$3,error_summary=$4 WHERE id=$1`,
      [runId, error.code === 'BALANCE_PARSE_FAILED' ? 'parse_failed' : 'failed', error.code || 'BALANCE_SYNC_FAILED', String(error.message || '余额同步失败').slice(0, 500)]);
    throw Object.assign(new Error(error.message || '渠道余额同步失败'), { code: error.code || 'BALANCE_SYNC_FAILED', runId });
  }
}

function callRangeTimestamp(value, { endExclusive = false } = {}) {
  if (!value) return null;
  const input = String(value).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(input)) {
    const start = new Date(`${input}T00:00:00.000Z`);
    if (endExclusive) start.setUTCDate(start.getUTCDate() + 1);
    return Number.isFinite(start.getTime()) ? start.toISOString() : null;
  }
  const parsed = new Date(input);
  return Number.isFinite(parsed.getTime()) ? parsed.toISOString() : null;
}

export async function getPricingControlSnapshot({ callFrom = null, callTo = null } = {}) {
  const normalizedCallFrom = callRangeTimestamp(callFrom);
  const normalizedCallTo = callRangeTimestamp(callTo, { endExclusive: true });
  if ((callFrom && !normalizedCallFrom) || (callTo && !normalizedCallTo)) {
    throw Object.assign(new Error('调用查询时间格式无效'), { code: 'CALL_DATE_RANGE_INVALID' });
  }
  if (normalizedCallFrom && normalizedCallTo
    && (new Date(normalizedCallTo).getTime() <= new Date(normalizedCallFrom).getTime()
      || new Date(normalizedCallTo).getTime() - new Date(normalizedCallFrom).getTime() > 366 * 86400000)) {
    throw Object.assign(new Error('调用查询范围最多 366 天，且结束时间必须晚于开始时间'), { code: 'CALL_DATE_RANGE_INVALID' });
  }
  const effectiveCallFrom = normalizedCallFrom || new Date(Date.now() - 30 * 86400000).toISOString();
  const effectiveCallTo = normalizedCallTo || new Date(Date.now() + 1000).toISOString();
  const [modelRows, routeRows, metricsRows, pendingPrices, pendingCatalog, providerRows, fxRows, callRows, syncRows] = await Promise.all([
    queryMany(`SELECT m.id,m.name,m.display_name,m.category,m.status,m.capabilities,m.default_parameters,
        COALESCE(m.tier, 'backup') AS tier,
        COALESCE(m.is_visible, true) AS is_visible,
        COALESCE(m.auto_route_eligible, false) AS auto_route_eligible,
        m.backup_model_id, m.backup_provider_id,
        mp.pricing_type,mp.base_credits,mp.formula_config,mp.min_credits,mp.min_gross_margin_rate,
        mp.site_price_cny,mp.site_price_currency,mp.price_locked,mp.price_valid_from,mp.price_valid_until,
        mp.override_reason,mp.override_expires_at,mp.active_site_price_version_id,
        COALESCE(rp.routing_mode,'cost') routing_mode,
        COALESCE(rp.failover_enabled, true) AS failover_enabled
      FROM ai_studio.ai_models m
      LEFT JOIN ai_studio.model_pricing mp ON mp.model_id=m.id
      LEFT JOIN ai_studio.routing_policies rp ON rp.model_id=m.id
      ORDER BY m.sort,m.id`),
    queryMany(`SELECT pm.id,pm.model_id,pm.provider_id,pm.provider_model_id,pm.enabled,pm.priority,pm.cost_config,
        pm.parameter_mapping,pm.capabilities,pm.endpoint_config,pm.provider_model_version,pm.provider_endpoint,
        pm.supported_task_types,pm.supported_resolutions,pm.supported_durations,pm.supported_qualities,
        pm.supported_regions,pm.license_requirements,pm.review_status,pm.mapping_version,pm.concurrency_limit,
        p.name provider_name,p.provider_type,p.enabled provider_enabled,p.health_status,p.last_health_check_at,
        p.circuit_state,p.balance provider_balance,p.available_quota,p.quota_checked_at,
        pv.id price_version_id,pv.version_no price_version_no,pv.price_type,pv.billing_unit,pv.currency price_currency,
        pv.price_config,pv.applicability,pv.source_url,pv.source_api,pv.source_observed_at,pv.fetched_at,
        pv.effective_at,pv.expires_at,pv.status price_status,pv.manually_locked,pv.evidence_digest,
        pv.conservative_upper_bound_config,pv.conservative_upper_bound_currency,
        pv.conservative_upper_bound_expires_at,pv.conservative_upper_bound_reason,
        pending.id pending_price_version_id,pending.version_no pending_price_version_no,
        pending.price_type pending_price_type,pending.billing_unit pending_billing_unit,
        pending.currency pending_price_currency,pending.price_config pending_price_config,
        pending.source_url pending_source_url,pending.source_observed_at pending_source_observed_at,
        pending.expires_at pending_expires_at,
        official.id official_price_version_id,official.version_no official_price_version_no,
        official.price_config official_price_config,official.billing_unit official_billing_unit,
        official.currency official_price_currency,official.source_api official_price_source_api,
        official.source_url official_source_url,official.source_observed_at official_source_observed_at,
        (SELECT count(*)::int FROM ai_studio.generation_attempts att
          WHERE att.provider_id=pm.provider_id AND att.provider_model_id=pm.provider_model_id
            AND att.status IN ('submitted','processing')) active_attempt_count
      FROM ai_studio.provider_models pm
      JOIN ai_studio.ai_providers p ON p.id=pm.provider_id
      LEFT JOIN LATERAL (
        SELECT * FROM ai_studio.provider_model_price_versions v
        WHERE v.provider_model_id=pm.id AND v.status='active'
          AND v.price_type IN ('account_actual','aggregator','manual')
        ORDER BY CASE v.price_type WHEN 'account_actual' THEN 0 WHEN 'manual' THEN 1 ELSE 2 END,
          v.version_no DESC LIMIT 1
      ) pv ON TRUE
      LEFT JOIN LATERAL (
        SELECT * FROM ai_studio.provider_model_price_versions v
        WHERE v.provider_model_id=pm.id AND v.status IN ('pending_review','staged')
        ORDER BY v.version_no DESC LIMIT 1
      ) pending ON TRUE
      LEFT JOIN LATERAL (
        SELECT * FROM ai_studio.provider_model_price_versions v
        WHERE v.provider_model_id=pm.id AND v.price_type='official_public'
          AND v.status IN ('active','pending_review','staged')
        ORDER BY CASE v.status WHEN 'active' THEN 0 ELSE 1 END,v.version_no DESC LIMIT 1
      ) official ON TRUE
      ORDER BY pm.model_id,pm.priority DESC,pm.provider_id`),
    queryMany(`WITH per_call AS (
        SELECT c.id,c.model,c.created_at,c.status,c.credit_cost,
          CASE WHEN count(pc.id)=0 AND c.status IN ('failed','cancelled')
                AND (attempt_state.attempt_count=0 OR attempt_state.not_billable_count=attempt_state.attempt_count) THEN 0::numeric
            WHEN count(pc.id)=0 THEN c.actual_cost_usd
            WHEN count(*) FILTER (WHERE pc.actual_cost_usd IS NULL) > 0 THEN NULL
            ELSE sum(pc.actual_cost_usd)::numeric END actual_cost_usd,
          CASE WHEN count(pc.id)=0 AND c.status IN ('failed','cancelled')
                AND (attempt_state.attempt_count=0 OR attempt_state.not_billable_count=attempt_state.attempt_count) THEN 0::numeric
            WHEN count(pc.id)=0 AND c.actual_cost_usd=0 THEN 0::numeric
            WHEN count(pc.id)=0 THEN c.actual_cost_usd * COALESCE(
              NULLIF(q.fx_snapshot_json->>'usdToCny','')::numeric,
              NULLIF(q.fx_snapshot_json->>'usd_to_cny','')::numeric)
            WHEN count(*) FILTER (WHERE pc.actual_cost_usd IS NULL
              OR COALESCE(NULLIF(pc.fx_snapshot_json->>'usdToCny','')::numeric,
                          NULLIF(pc.fx_snapshot_json->>'usd_to_cny','')::numeric) IS NULL) > 0 THEN NULL
            ELSE sum(pc.actual_cost_usd * COALESCE(NULLIF(pc.fx_snapshot_json->>'usdToCny','')::numeric,
                                                  NULLIF(pc.fx_snapshot_json->>'usd_to_cny','')::numeric))::numeric
          END actual_cost_cny,
          CASE WHEN c.status <> 'succeeded' THEN 0::numeric ELSE site_price.site_price END actual_revenue_cny
        FROM ai_studio.creations c
        LEFT JOIN ai_studio.generation_quotes q ON q.id=c.quote_id
        LEFT JOIN ai_studio.model_site_price_versions site_price ON site_price.id=q.site_price_version_id
        LEFT JOIN ai_studio.provider_cost_records pc ON pc.job_id=c.id
        LEFT JOIN LATERAL (
          SELECT count(*)::int attempt_count,
            count(*) FILTER (WHERE a.reconciliation_status='not_billable')::int not_billable_count
          FROM ai_studio.generation_attempts a WHERE a.creation_id=c.id
        ) attempt_state ON TRUE
        GROUP BY c.id,c.model,c.created_at,c.status,c.credit_cost,c.actual_cost_usd,q.fx_snapshot_json,site_price.site_price
          ,attempt_state.attempt_count,attempt_state.not_billable_count
      )
      SELECT model model_id,
        count(*) FILTER (WHERE created_at >= date_trunc('day',now()))::int calls_today,
        count(*) FILTER (WHERE created_at >= now()-interval '30 days')::int calls_30d,
        count(*) FILTER (WHERE created_at >= now()-interval '30 days' AND status='failed')::int failures_30d,
        sum(credit_cost) FILTER (WHERE created_at >= now()-interval '30 days')::bigint credits_30d,
        CASE WHEN count(*) FILTER (WHERE created_at >= now()-interval '30 days') = 0
          OR count(*) FILTER (WHERE created_at >= now()-interval '30 days' AND actual_cost_usd IS NULL) > 0
          THEN NULL ELSE sum(actual_cost_usd) FILTER (WHERE created_at >= now()-interval '30 days')::numeric
        END actual_cost_30d_usd,
        CASE WHEN count(*) FILTER (WHERE created_at >= now()-interval '30 days') = 0
          OR count(*) FILTER (WHERE created_at >= now()-interval '30 days' AND actual_cost_cny IS NULL) > 0
          THEN NULL ELSE sum(actual_cost_cny) FILTER (WHERE created_at >= now()-interval '30 days')::numeric
        END actual_cost_30d_cny,
        CASE WHEN count(*) FILTER (WHERE created_at >= now()-interval '30 days' AND status='succeeded') = 0
          OR count(*) FILTER (WHERE created_at >= now()-interval '30 days' AND actual_cost_cny IS NULL) > 0
          OR count(*) FILTER (WHERE created_at >= now()-interval '30 days' AND status='succeeded'
            AND actual_revenue_cny IS NULL) > 0
          OR sum(actual_revenue_cny) FILTER (WHERE created_at >= now()-interval '30 days') <= 0
          THEN NULL ELSE ((sum(actual_revenue_cny) FILTER (WHERE created_at >= now()-interval '30 days')
            - sum(actual_cost_cny) FILTER (WHERE created_at >= now()-interval '30 days'))
            / sum(actual_revenue_cny) FILTER (WHERE created_at >= now()-interval '30 days'))::numeric
        END actual_gross_margin_30d
      FROM per_call GROUP BY model`),
    queryMany(`SELECT pv.*, pm.model_id, pm.provider_id, pm.provider_model_id,
        p.name AS provider_name,
        COALESCE(m.display_name, m.name) AS model_name,
        m.category
      FROM ai_studio.provider_model_price_versions pv
      JOIN ai_studio.provider_models pm ON pm.id=pv.provider_model_id
      JOIN ai_studio.ai_providers p ON p.id=pm.provider_id
      LEFT JOIN ai_studio.ai_models m ON m.id=pm.model_id
      WHERE pv.status IN ('staged','pending_review') ORDER BY pv.fetched_at DESC LIMIT 300`),
    queryMany(`SELECT * FROM ai_studio.provider_catalog_entries WHERE review_status IN ('pending_mapping','mapped_pending_review')
      ORDER BY last_seen_at DESC LIMIT 500`),
    queryMany(`SELECT * FROM ai_studio.ai_providers ORDER BY provider_type,priority DESC,id`),
    queryMany(`SELECT DISTINCT ON (base_currency,quote_currency)
        id,base_currency,quote_currency,rate,source_type,source_url,observed_at,expires_at
      FROM ai_studio.exchange_rate_snapshots
      ORDER BY base_currency,quote_currency,observed_at DESC`),
    queryMany(`SELECT c.id,c.user_id,c.model,c.status,c.credit_cost,c.created_at,c.duration_ms,
        c.quote_id,c.selected_provider_id,
        CASE WHEN cost_rollup.record_count=0 AND c.status IN ('failed','cancelled')
              AND (attempt_state.attempt_count=0 OR attempt_state.not_billable_count=attempt_state.attempt_count) THEN 0::numeric
          WHEN cost_rollup.record_count=0 THEN c.actual_cost_usd
          WHEN cost_rollup.unknown_actual_count>0 THEN NULL ELSE cost_rollup.actual_cost_usd END actual_cost_usd,
        CASE WHEN cost_rollup.record_count=0 THEN c.estimated_cost_usd
          WHEN cost_rollup.unknown_estimate_count>0 THEN NULL ELSE cost_rollup.estimated_cost_usd END estimated_cost_usd,
        c.error_code,
        c.input_summary_json,q.id quote_row_id,q.site_price_version_id,q.pricing_breakdown_json,q.route_snapshot_json,
        COALESCE((SELECT jsonb_agg(jsonb_build_object('attemptNumber',a.attempt_number,'providerId',a.provider_id,
          'providerModelId',a.provider_model_id,'providerEndpoint',a.provider_endpoint,
          'providerModelVersion',a.provider_model_version,'mappingVersion',a.mapping_version,
          'providerRequestId',a.provider_request_id,'status',a.status,
          'estimatedCostUsd',a.estimated_cost_usd,'actualCostUsd',a.actual_cost_usd,'reconciliationStatus',a.reconciliation_status,
          'durationMs',a.duration_ms,'errorCode',a.error_code) ORDER BY a.attempt_number)
          FROM ai_studio.generation_attempts a WHERE a.creation_id=c.id),'[]'::jsonb) attempts
      FROM ai_studio.creations c
      LEFT JOIN ai_studio.generation_quotes q ON q.id=c.quote_id
      LEFT JOIN LATERAL (SELECT count(*)::int record_count,
          count(*) FILTER (WHERE pc.actual_cost_usd IS NULL)::int unknown_actual_count,
          sum(pc.actual_cost_usd)::numeric actual_cost_usd,
          count(*) FILTER (WHERE pc.estimated_cost_usd IS NULL)::int unknown_estimate_count,
          sum(pc.estimated_cost_usd)::numeric estimated_cost_usd
        FROM ai_studio.provider_cost_records pc WHERE pc.job_id=c.id) cost_rollup ON TRUE
      LEFT JOIN LATERAL (
        SELECT count(*)::int attempt_count,
          count(*) FILTER (WHERE a.reconciliation_status='not_billable')::int not_billable_count
        FROM ai_studio.generation_attempts a WHERE a.creation_id=c.id
      ) attempt_state ON TRUE
      WHERE c.created_at >= $1::timestamptz AND c.created_at < $2::timestamptz
      ORDER BY c.created_at DESC LIMIT 1000`, [effectiveCallFrom, effectiveCallTo]),
    queryMany(`SELECT id,provider_id,sync_type,status,started_at,completed_at,fetched_count,staged_count,
        approved_count,error_code,error_summary,summary_json FROM ai_studio.channel_sync_runs
      ORDER BY started_at DESC LIMIT 100`),
  ]);
  const fxSnapshot = exchangeRateSnapshotFromRows(fxRows);
  const fxDisplayRow = fxRows.find((row) => row.base_currency === 'USD' && row.quote_currency === 'CNY')
    || fxRows.find((row) => row.base_currency === 'CNY' && row.quote_currency === 'USD') || null;
  const metrics = new Map(metricsRows.map((row) => [row.model_id, row]));
  const routes = new Map();
  for (const row of routeRows) {
    const list = routes.get(row.model_id) || [];
    list.push({
      ...row,
      active_price_version: row.price_version_id ? {
        id: row.price_version_id,
        version_no: row.price_version_no,
        price_type: row.price_type,
        billing_unit: row.billing_unit,
        currency: row.price_currency,
        price_config: row.price_config,
        applicability: row.applicability,
        source_url: row.source_url,
        source_api: row.source_api,
        source_observed_at: row.source_observed_at,
        fetched_at: row.fetched_at,
        effective_at: row.effective_at,
        expires_at: row.expires_at,
        status: row.price_status,
        manually_locked: row.manually_locked,
        evidence_digest: row.evidence_digest,
        conservative_upper_bound_config: row.conservative_upper_bound_config,
        conservative_upper_bound_currency: row.conservative_upper_bound_currency,
        conservative_upper_bound_expires_at: row.conservative_upper_bound_expires_at,
        conservative_upper_bound_reason: row.conservative_upper_bound_reason,
      } : null,
      pending_price_version: row.pending_price_version_id ? {
        id: row.pending_price_version_id,
        version_no: row.pending_price_version_no,
        price_type: row.pending_price_type,
        billing_unit: row.pending_billing_unit,
        currency: row.pending_price_currency,
        price_config: row.pending_price_config,
        source_url: row.pending_source_url,
        source_observed_at: row.pending_source_observed_at,
        expires_at: row.pending_expires_at,
      } : null,
      official_price_version: row.official_price_version_id ? {
        id: row.official_price_version_id,
        version_no: row.official_price_version_no,
        price_config: row.official_price_config,
        billing_unit: row.official_billing_unit,
        currency: row.official_price_currency,
        source_url: row.official_source_url,
        source_api: row.official_price_source_api,
        source_observed_at: row.official_source_observed_at,
      } : null,
    });
    routes.set(row.model_id, list);
  }
  const providerCapabilities = providerRows.map((provider) => {
    const declared = capabilityFor(provider.id);
    return {
      id: provider.id,
      slug: provider.slug,
      name: provider.name,
      providerType: provider.provider_type,
      enabled: provider.enabled,
      capabilities: declared,
      sources: OFFICIAL_SOURCES[provider.id] || (provider.id === 'dashscope' ? OFFICIAL_SOURCES.alibaba : {}),
      catalogSyncEnabled: declared.modelCatalogApi,
      priceSyncEnabled: declared.modelPriceApi,
      balanceSyncEnabled: declared.accountBalanceApi,
      usageSyncEnabled: declared.usageApi,
      balance: provider.balance === null || provider.balance === undefined ? null : Number(provider.balance),
      balanceCurrency: provider.currency,
      balanceCheckedAt: provider.balance_checked_at,
      healthStatus: provider.health_status || 'unknown',
      circuitState: provider.circuit_state || 'unknown',
      lastHealthCheckAt: provider.last_health_check_at || null,
      availableQuota: provider.available_quota === null || provider.available_quota === undefined
        ? null : Number(provider.available_quota),
      quotaCheckedAt: provider.quota_checked_at || null,
    };
  });
  const models = modelRows.map((model) => ({
    ...model,
    routes: (routes.get(model.id) || []).map((route) => {
      const price = route.active_price_version;
      if (!price) return { ...route, estimated_cost_cny: null, estimated_cost_usd: null, estimate_reason: 'PRICE_MISSING' };
      let defaultParameters = model.default_parameters || {};
      if (typeof defaultParameters === 'string') {
        try { defaultParameters = JSON.parse(defaultParameters); } catch { defaultParameters = {}; }
      }
      const estimate = estimateRequestCost(price.price_config, defaultParameters, {
        currency: price.currency,
        billingUnit: price.billing_unit,
        fxSnapshot,
      });
      return { ...route, estimated_cost_cny: estimate.estimatedCostCny ?? null,
        estimated_cost_usd: estimate.estimatedCostUsd ?? null, estimate_reason: estimate.known ? null : estimate.reason };
    }),
    metrics: metrics.get(model.id) || { calls_today: 0, calls_30d: 0, failures_30d: 0,
      credits_30d: 0, actual_cost_30d_usd: null, actual_cost_30d_cny: null, actual_gross_margin_30d: null },
  }));
  let nextMarginModel = 0;
  const marginWorkers = Array.from({ length: Math.min(8, models.length) }, async () => {
    while (nextMarginModel < models.length) {
      const index = nextMarginModel++;
      const model = models[index];
      let parameters = model.default_parameters || {};
      if (typeof parameters === 'string') {
        try { parameters = JSON.parse(parameters); } catch { parameters = {}; }
      }
      try {
        const pricing = await calculateModelPrice({ modelId: model.id, parameters });
        const estimatesByMapping = new Map((pricing.evaluatedChannels || []).map((candidate) => [
          `${candidate.providerId}:${candidate.providerModelId}`, candidate,
        ]));
        model.routes = model.routes.map((route) => {
          const estimate = estimatesByMapping.get(`${route.provider_id}:${route.provider_model_id}`);
          return estimate ? { ...route,
            estimated_cost_cny: estimate.estimatedCostCny,
            estimated_cost_usd: estimate.estimatedCostUsd,
            estimate_reason: null,
            estimated_cost_source: estimate.estimatedCostSource,
            conservative_upper_bound_expires_at: estimate.conservativeUpperBoundExpiresAt,
          } : route;
        });
        model.marginPreview = {
          sitePriceCny: pricing.sitePriceCny,
          credits: pricing.credits,
          selectedCostCny: pricing.marginCheck.selectedCostCny,
          worstEligibleCostCny: pricing.marginCheck.worstEligibleCostCny,
          grossMarginRate: pricing.marginCheck.grossMarginRate,
          minimumGrossMarginRate: pricing.marginCheck.minimumGrossMarginRate,
          passed: pricing.marginCheck.passed,
          selectedProviderId: pricing.pricingBreakdown.costSource.providerId,
          eligibleChannels: pricing.eligibleChannels,
          evaluatedChannels: pricing.evaluatedChannels,
          error: null,
        };
      } catch (error) {
        model.marginPreview = { sitePriceCny: model.site_price_cny ?? null, credits: model.base_credits ?? null,
          selectedCostCny: null, worstEligibleCostCny: null, grossMarginRate: null,
          minimumGrossMarginRate: Number(error.details?.minMarginRate || 0.75), passed: false,
          eligibleChannels: error.details?.eligibleChannels || [],
          evaluatedChannels: [],
          selectedCostCny: error.details?.lowestCostCny ?? null,
          worstEligibleCostCny: error.details?.lowestCostCny ?? null,
          grossMarginRate: error.details?.grossMarginRate ?? null,
          error: error.code || 'PRICE_UNAVAILABLE' };
      }
    }
  });
  await Promise.all(marginWorkers);
  return {
    models,
    providers: providerCapabilities,
    pendingPrices,
    pendingCatalog,
    calls: callRows.map((row) => ({
      ...row,
      user_id: String(row.user_id),
      actual_cost_usd: row.actual_cost_usd === null ? null : Number(row.actual_cost_usd),
      estimated_cost_usd: row.estimated_cost_usd === null ? null : Number(row.estimated_cost_usd),
      pricing_breakdown: row.pricing_breakdown_json && typeof row.pricing_breakdown_json === 'string'
        ? JSON.parse(row.pricing_breakdown_json) : row.pricing_breakdown_json || {},
      route_snapshot: row.route_snapshot_json && typeof row.route_snapshot_json === 'string'
        ? JSON.parse(row.route_snapshot_json) : row.route_snapshot_json || {},
      attempts: (typeof row.attempts === 'string' ? JSON.parse(row.attempts) : row.attempts || [])
        .map((attempt) => ({ ...attempt, errorReason: safeFailureReason(attempt.errorCode) })),
      request_spec: (() => {
        let input = row.input_summary_json;
        if (typeof input === 'string') { try { input = JSON.parse(input); } catch { input = {}; } }
        const parameters = input?.parameters && typeof input.parameters === 'object' ? input.parameters : {};
        const safe = {};
        for (const key of ['task_type','taskType','generation_mode','resolution','size','duration','video_duration',
          'output_duration','quality','quality_mode','mode','n','count','num_images','batch_size','region']) {
          if (['string','number','boolean'].includes(typeof parameters[key])) safe[key] = parameters[key];
        }
        return safe;
      })(),
      error_reason: safeFailureReason(row.error_code),
      input_summary_json: undefined,
      quote_row_id: undefined,
      pricing_breakdown_json: undefined,
      route_snapshot_json: undefined,
    })),
    callsRange: { from: effectiveCallFrom, toExclusive: effectiveCallTo, limit: 1000 },
    syncRuns: syncRows,
    exchangeRate: fxDisplayRow ? {
      id: fxDisplayRow.id,
      baseCurrency: fxDisplayRow.base_currency === 'CNY' ? 'USD' : fxDisplayRow.base_currency,
      quoteCurrency: fxDisplayRow.quote_currency === 'USD' ? 'CNY' : fxDisplayRow.quote_currency,
      rate: Number(fxDisplayRow.base_currency === 'CNY' ? 1 / Number(fxDisplayRow.rate) : fxDisplayRow.rate),
      sourceType: fxDisplayRow.source_type,
      sourceUrl: fxDisplayRow.source_url,
      observedAt: fxDisplayRow.observed_at,
      expiresAt: fxDisplayRow.expires_at,
      expired: Boolean(fxDisplayRow.expires_at && new Date(fxDisplayRow.expires_at).getTime() <= Date.now()),
    } : null,
    exchangeRates: fxRows.map((row) => ({
      id: row.id, baseCurrency: row.base_currency, quoteCurrency: row.quote_currency,
      rate: Number(row.rate), sourceType: row.source_type, sourceUrl: row.source_url,
      observedAt: row.observed_at, expiresAt: row.expires_at,
      expired: Boolean(row.expires_at && new Date(row.expires_at).getTime() <= Date.now()),
    })),
    fxSnapshot,
    creditPolicy: {
      cnyPerCredit: CREDIT_PRICING_POLICY.cnyPerCredit,
      providerCostReserveRate: CREDIT_PRICING_POLICY.providerCostReserveRate,
      targetContributionMarginRate: CREDIT_PRICING_POLICY.targetContributionMarginRate,
      creditRounding: CREDIT_PRICING_POLICY.creditRounding,
      minimumCredits: CREDIT_PRICING_POLICY.minimumCredits,
    },
    generatedAt: new Date().toISOString(),
  };
}
