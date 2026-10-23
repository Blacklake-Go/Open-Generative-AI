import 'server-only';

import { logAudit } from '../admin/audit.js';
import { maskSecretKey } from '../admin/redaction.js';
import { withTransaction } from '../db/index.js';
import * as providerRepo from '../repositories/providers.js';
import { getServerProviderApiKey } from './providerSecrets.js';
import { getPaymentAvailability } from './paymentAvailability.js';

async function enrichSecretKeys(providerId, keys) {
  if (!keys || !Array.isArray(keys)) return [];
  const metadataList = await providerRepo.getProviderSecretsMetadata(providerId);
  const metaMap = new Map(metadataList.map((m) => [m.name, m]));

  const envKeyMap = {
    'google:client_id': process.env.GOOGLE_CLIENT_ID,
    'google:client_secret': process.env.GOOGLE_CLIENT_SECRET,
    'x:client_id': process.env.X_CLIENT_ID,
    'x:client_secret': process.env.X_CLIENT_SECRET,
    'tiktok:client_key': process.env.TIKTOK_CLIENT_KEY,
    'tiktok:client_secret': process.env.TIKTOK_CLIENT_SECRET,
    'instagram:client_id': process.env.INSTAGRAM_CLIENT_ID || process.env.INSTAGRAM_APP_ID,
    'instagram:client_secret': process.env.INSTAGRAM_CLIENT_SECRET || process.env.INSTAGRAM_APP_SECRET,
    'instagram:app_id': process.env.INSTAGRAM_CLIENT_ID || process.env.INSTAGRAM_APP_ID,
    'instagram:app_secret': process.env.INSTAGRAM_CLIENT_SECRET || process.env.INSTAGRAM_APP_SECRET,
    'wechat_oauth:app_id': process.env.WECHAT_OAUTH_APP_ID,
    'wechat_oauth:app_secret': process.env.WECHAT_OAUTH_APP_SECRET,
    'qq:app_id': process.env.QQ_APP_ID,
    'qq:app_key': process.env.QQ_APP_KEY,
    'douyin:client_key': process.env.DOUYIN_CLIENT_KEY || process.env.DOUYIN_APP_ID,
    'douyin:client_secret': process.env.DOUYIN_CLIENT_SECRET || process.env.DOUYIN_APP_SECRET,
    'douyin:app_id': process.env.DOUYIN_CLIENT_KEY || process.env.DOUYIN_APP_ID,
    'douyin:app_secret': process.env.DOUYIN_CLIENT_SECRET || process.env.DOUYIN_APP_SECRET,
    'bilibili:client_id': process.env.BILIBILI_CLIENT_ID,
    'bilibili:client_secret': process.env.BILIBILI_CLIENT_SECRET,
    'alipay:app_id': process.env.ALIPAY_APP_ID,
    'alipay:gateway': process.env.ALIPAY_GATEWAY,
    'wechat:app_id': process.env.WECHAT_APP_ID,
    'wechat:mch_id': process.env.WECHAT_MCH_ID,
    'wechat:serial_no': process.env.WECHAT_CERT_SERIAL_NO || process.env.WECHAT_SERIAL_NO,
    'stripe:secret_key': process.env.STRIPE_SECRET_KEY,
    'stripe:webhook_secret': process.env.STRIPE_WEBHOOK_SECRET,
    'paypal:client_id': process.env.PAYPAL_CLIENT_ID,
    'paypal:webhook_id': process.env.PAYPAL_WEBHOOK_ID,
    'paypal:mode': process.env.PAYPAL_MODE,
  };

  const enriched = [];
  for (const k of keys) {
    const isPublicId = ['client_id', 'client_key', 'app_id', 'mch_id', 'gateway', 'serial_no', 'mode', 'webhook_id'].includes(k.name);
    const aliasName = (providerId === 'douyin')
      ? (k.name === 'client_key' ? 'app_id' : k.name === 'app_id' ? 'client_key' : k.name === 'client_secret' ? 'app_secret' : k.name === 'app_secret' ? 'client_secret' : null)
      : (providerId === 'instagram')
      ? (k.name === 'client_id' ? 'app_id' : k.name === 'app_id' ? 'client_id' : k.name === 'client_secret' ? 'app_secret' : k.name === 'app_secret' ? 'client_secret' : null)
      : (providerId === 'wechat_oauth' || providerId === 'wechat')
      ? (k.name === 'app_id' ? 'client_id' : k.name === 'client_id' ? 'app_id' : k.name === 'app_secret' ? 'client_secret' : k.name === 'client_secret' ? 'app_secret' : null)
      : null;
    const meta = metaMap.get(k.name) || (aliasName ? metaMap.get(aliasName) : null);
    const envVal = envKeyMap[`${providerId}:${k.name}`]
      || (aliasName ? envKeyMap[`${providerId}:${aliasName}`] : null)
      || (providerId === 'wechat_oauth' ? (process.env.WECHAT_APP_ID || process.env.WECHAT_SECRET) : null);
    let configured = Boolean(meta || envVal);
    let currentValue = '';
    let previewValue = '';
    let maskedValue = '';

    if (configured) {
      const stored = (await providerRepo.getProviderSecret(providerId, k.name))
        || (aliasName ? await providerRepo.getProviderSecret(providerId, aliasName) : null)
        || (providerId === 'wechat_oauth' ? await providerRepo.getProviderSecret('wechat', k.name) : null)
        || (providerId === 'wechat_oauth' && aliasName ? await providerRepo.getProviderSecret('wechat', aliasName) : null);
      const rawVal = stored || envVal || '';
      if (rawVal) {
        maskedValue = maskSecretKey(rawVal);
      }
      if (isPublicId) {
        currentValue = rawVal;
        previewValue = currentValue;
      } else {
        previewValue = '••••••••••••••••';
      }
    }

    const rawUpdatedAt = meta?.updatedAt || (envVal ? '环境配置' : null);
    const safeUpdatedAt = rawUpdatedAt instanceof Date
      ? rawUpdatedAt.toISOString()
      : (rawUpdatedAt ? String(rawUpdatedAt) : null);

    enriched.push({
      ...k,
      isSecret: !isPublicId,
      configured,
      updatedAt: safeUpdatedAt,
      currentValue,
      previewValue,
      maskedValue,
    });
  }
  return enriched;
}

export async function getProvidersOverview() {
  const latestChecks = await providerRepo.getLatestHealthChecks();
  const checksMap = new Map(latestChecks.map((c) => [c.provider, c]));
  const paymentAvailability = await getPaymentAvailability();

  const providers = [
    {
      id: 'muapi',
      name: 'MuAPI 聚合网关 (方案一)',
      kind: 'ai',
      description: '多模态聚合网关：支持 FLUX、Midjourney、Hailuo、Runway、Luma 等海内外大模型统一接入与智能路由',
      configured: Boolean(process.env.MUAPI_API_KEY || await providerRepo.hasProviderSecret('muapi', 'api_key') || await providerRepo.hasProviderSecret('muapi', 'api_key_sandbox')),
      mode: '服务端聚合网关模式 (统一接入 / 全托管)',
      secretManaged: true,
      dualKey: true,
      activeKeyEnv: await providerRepo.getProviderKeyEnv('muapi'),
      keyEnvOptions: [
        { value: 'production', label: '正式环境' },
        { value: 'sandbox', label: '沙盒环境' },
      ],
      secretKeys: await enrichSecretKeys('muapi', [
        { name: 'api_key', label: '正式密钥 (Production Key)', placeholder: '正式环境的 MuAPI Key' },
        { name: 'api_key_sandbox', label: '沙盒密钥 (Sandbox Key)', placeholder: '沙盒环境的 MuAPI Key' },
      ]),
      lastCheck: checksMap.get('muapi') || null,
    },
    {
      id: 'dashscope',
      name: '阿里云百炼 / 通义万相 / Wan2.1 (方案二)',
      kind: 'ai',
      description: '国内直连引擎：Wan2.1 (万相文生视频/图生视频/文生图)、Qwen-Image 等百炼原生高并发接口',
      configured: Boolean(process.env.DASHSCOPE_API_KEY || process.env.ALIYUN_API_KEY || await providerRepo.hasProviderSecret('dashscope', 'api_key') || await providerRepo.hasProviderSecret('aliyun', 'api_key')),
      mode: '阿里云百炼 DashScope 原生 REST API',
      secretManaged: true,
      lastCheck: checksMap.get('dashscope') || null,
    },
    {
      id: 'minimax',
      name: 'MiniMax 海螺视频 / 语音 (方案二)',
      kind: 'ai',
      description: '国内直连引擎：MiniMax Video-01 (Hailuo) 电影级高清视频生成与高质量语音合成',
      configured: Boolean(process.env.MINIMAX_API_KEY || await providerRepo.hasProviderSecret('minimax', 'api_key')),
      mode: 'MiniMax 开放平台 OpenAPI',
      secretManaged: true,
      lastCheck: checksMap.get('minimax') || null,
    },
    {
      id: 'kling',
      name: '快手可灵 Kling AI (方案二)',
      kind: 'ai',
      description: '国内直连引擎：快手可灵 Kling 1.5/2.0 高逼真文生视频与运动控制图生视频',
      configured: Boolean(process.env.KLING_API_KEY || await providerRepo.hasProviderSecret('kling', 'api_key')),
      mode: '快手可灵开放平台 API',
      secretManaged: true,
      lastCheck: checksMap.get('kling') || null,
    },
    {
      id: 'deepseek',
      name: 'DeepSeek 官方 API (方案二)',
      kind: 'ai',
      description: '国内直连引擎：DeepSeek-V3 / DeepSeek-R1 高性能推理与通用大模型',
      configured: Boolean(process.env.DEEPSEEK_API_KEY || await providerRepo.hasProviderSecret('deepseek', 'api_key')),
      mode: 'DeepSeek 开放平台 OpenAPI (兼容 OpenAI 格式)',
      secretManaged: true,
      secretKeys: await enrichSecretKeys('deepseek', [
        { name: 'api_key', label: 'DeepSeek API Key', placeholder: 'sk-...' },
      ]),
      lastCheck: checksMap.get('deepseek') || null,
    },
    {
      id: 'stripe',
      name: 'Stripe 国际支付',
      kind: 'payment',
      description: '信用卡与海外订阅代扣渠道',
      configured: paymentAvailability.stripe.configured,
      channelEnabled: await providerRepo.getProviderEnabled('stripe'),
      mode: '服务端 API (Stripe Elements / Checkout)',
      secretManaged: true,
      activeKeyEnv: await providerRepo.getProviderKeyEnv('stripe'),
      callbackPath: '/api/billing/webhooks/stripe',
      consoleUrl: 'https://dashboard.stripe.com/',
      consoleLabel: 'Stripe 开发者后台',
      region: 'international',
      dualKey: true,
      keyEnvOptions: [
        { value: 'production', label: '生产模式 (Live API)' },
        { value: 'sandbox', label: '测试模式 (Test API)' },
      ],
      secretKeys: await enrichSecretKeys('stripe', [
        { name: 'secret_key', label: 'Stripe 密钥 (Secret Key)', placeholder: 'sk_test_... 或 sk_live_...' },
        { name: 'webhook_secret', label: 'Stripe 签名密钥 (Webhook Secret)', placeholder: 'whsec_...' },
      ]),
      lastCheck: checksMap.get('stripe') || null,
    },
    {
      id: 'paypal',
      name: 'PayPal 国际支付',
      kind: 'payment',
      description: 'PayPal 国际快捷支付与海外多币种收单渠道',
      configured: paymentAvailability.paypal.configured,
      channelEnabled: await providerRepo.getProviderEnabled('paypal'),
      mode: 'PayPal REST API v2',
      secretManaged: true,
      activeKeyEnv: await providerRepo.getProviderKeyEnv('paypal'),
      callbackPath: '/api/billing/webhooks/paypal',
      consoleUrl: 'https://developer.paypal.com/dashboard/',
      consoleLabel: 'PayPal 开发者控制台',
      region: 'international',
      dualKey: true,
      keyEnvOptions: [
        { value: 'production', label: '生产模式 (Live API)' },
        { value: 'sandbox', label: '沙盒模式 (Sandbox API)' },
      ],
      secretKeys: await enrichSecretKeys('paypal', [
        { name: 'client_id', label: 'PayPal Client ID', placeholder: '从 PayPal 开发者后台获取的 Client ID' },
        { name: 'client_secret', label: 'PayPal Client Secret', placeholder: '从 PayPal 开发者后台获取的 Client Secret' },
        { name: 'webhook_id', label: 'PayPal Webhook ID (选填)', placeholder: 'PayPal 开发者后台配置的 Webhook ID' },
        { name: 'mode', label: '运行环境 (sandbox 或 live，选填)', placeholder: '默认 live (沙盒测试填 sandbox)' },
      ]),
      lastCheck: checksMap.get('paypal') || null,
    },
    {
      id: 'wechat',
      name: '微信支付',
      kind: 'payment',
      description: 'Native 扫码支付与 JSAPI 支付',
      configured: paymentAvailability.wechat.configured,
      channelEnabled: await providerRepo.getProviderEnabled('wechat'),
      mode: '商户证书通信 (APIv3 标准协议)',
      secretManaged: true,
      activeKeyEnv: await providerRepo.getProviderKeyEnv('wechat'),
      callbackPath: '/api/billing/webhooks/wechat',
      consoleUrl: 'https://pay.weixin.qq.com/',
      consoleLabel: '微信支付商户平台',
      region: 'mainland_china',
      dualKey: true,
      keyEnvOptions: [
        { value: 'production', label: '生产模式 (Live API)' },
        { value: 'sandbox', label: '沙盒测试 (Sandbox API)' },
      ],
      secretKeys: await enrichSecretKeys('wechat', [
        { name: 'app_id', label: '微信 AppID', placeholder: '微信开放平台或公众号 AppID (wx...)' },
        { name: 'mch_id', label: '商户号 (MchID)', placeholder: '微信支付商户号 (例如: 1600000000)' },
        { name: 'api_v3_key', label: 'APIv3 密钥', placeholder: '32 字符商户 APIv3 密钥' },
        { name: 'serial_no', label: '证书序列号', placeholder: '商户 API 证书序列号' },
        { name: 'private_key', label: '商户私钥 (Private Key)', placeholder: 'apiclient_key.pem 文本内容' },
        { name: 'public_key', label: '微信支付公钥/证书', placeholder: 'pub_key.pem 或微信支付平台证书内容' },
      ]),
      lastCheck: checksMap.get('wechat') || null,
    },
    {
      id: 'alipay',
      name: '支付宝',
      kind: 'payment',
      description: '当面付扫码与电脑/手机网页支付',
      configured: paymentAvailability.alipay.configured,
      channelEnabled: await providerRepo.getProviderEnabled('alipay'),
      mode: 'RSA2 (SHA256withRSA) 密钥签名',
      secretManaged: true,
      activeKeyEnv: await providerRepo.getProviderKeyEnv('alipay'),
      callbackPath: '/api/billing/webhooks/alipay',
      consoleUrl: 'https://open.alipay.com/',
      consoleLabel: '支付宝开放平台',
      region: 'mainland_china',
      dualKey: true,
      keyEnvOptions: [
        { value: 'production', label: '生产模式 (Live API)' },
        { value: 'sandbox', label: '沙盒联调 (Sandbox API)' },
      ],
      secretKeys: await enrichSecretKeys('alipay', [
        { name: 'app_id', label: '支付宝 AppID', placeholder: '开放平台创建的自研/网页应用 ID (例如: 202100xxxxxxxx 或沙箱 902100xxxxxxxx)' },
        { name: 'private_key', label: '商户应用私钥 (Merchant Private Key)', placeholder: '由密钥工具生成的 PKCS8 私钥 (MIIEvgIBADANBgkqhkiG9w0BAQEFAASCB...)' },
        { name: 'public_key', label: '支付宝公钥 (Alipay Public Key)', placeholder: '支付宝开放平台上传应用公钥后生成的“支付宝公钥” (非应用公钥)' },
        { name: 'gateway', label: '支付宝网关 (选填)', placeholder: '默认正式网关: https://openapi.alipay.com/gateway.do (沙箱联调填: https://openapi-sandbox.dl.alipaydev.com/gateway.do)' },
      ]),
      lastCheck: checksMap.get('alipay') || null,
    },
    {
      id: 'google',
      name: 'Google 账号登录',
      kind: 'social',
      description: 'Google Identity 登录授权与邮箱验证 (OAuth 2.0 PKCE)',
      configured: Boolean(
        (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) ||
        (await providerRepo.hasProviderSecret('google', 'client_id') && await providerRepo.hasProviderSecret('google', 'client_secret'))
      ),
      mode: 'OAuth 2.0 PKCE / OIDC',
      secretManaged: true,
      callbackPath: '/api/auth/oauth/google/callback',
      secretKeys: await enrichSecretKeys('google', [
        { name: 'client_id', label: 'Client ID 客户端标识', placeholder: 'xxxx.apps.googleusercontent.com' },
        { name: 'client_secret', label: 'Client Secret 客户端密钥', placeholder: 'GOCSPX-xxxx' },
      ]),
      lastCheck: checksMap.get('google') || null,
    },
    {
      id: 'x',
      name: 'X (Twitter) 登录',
      kind: 'social',
      description: 'X Developer Platform 用户身份与账号快捷登录 (OAuth 2.0)',
      configured: Boolean(
        (process.env.X_CLIENT_ID && process.env.X_CLIENT_SECRET) ||
        (await providerRepo.hasProviderSecret('x', 'client_id') && await providerRepo.hasProviderSecret('x', 'client_secret'))
      ),
      mode: 'OAuth 2.0 PKCE',
      secretManaged: true,
      callbackPath: '/api/auth/oauth/x/callback',
      secretKeys: await enrichSecretKeys('x', [
        { name: 'client_id', label: 'Client ID 客户端标识', placeholder: '从 X 开发者后台获取的 Client ID' },
        { name: 'client_secret', label: 'Client Secret 客户端密钥', placeholder: '从 X 开发者后台获取的 Client Secret' },
      ]),
      lastCheck: checksMap.get('x') || null,
    },
    {
      id: 'tiktok',
      name: 'TikTok 登录',
      kind: 'social',
      description: 'TikTok for Developers 用户身份授权 (Login Kit for Web)',
      configured: Boolean(
        (process.env.TIKTOK_CLIENT_KEY && process.env.TIKTOK_CLIENT_SECRET) ||
        (await providerRepo.hasProviderSecret('tiktok', 'client_key') && await providerRepo.hasProviderSecret('tiktok', 'client_secret'))
      ),
      mode: 'Login Kit for Web',
      secretManaged: true,
      callbackPath: '/auth/tiktok/callback',
      secretKeys: await enrichSecretKeys('tiktok', [
        { name: 'client_key', label: 'Client Key 客户端标识', placeholder: '从 TikTok 开发者后台获取的 Client Key' },
        { name: 'client_secret', label: 'Client Secret 客户端密钥', placeholder: '从 TikTok 开发者后台获取的 Client Secret' },
      ]),
      lastCheck: checksMap.get('tiktok') || null,
    },
    {
      id: 'instagram',
      name: 'Instagram 登录',
      kind: 'social',
      description: 'Instagram / Meta for Developers 快捷登录授权 (OAuth 2.0)',
      configured: Boolean(
        ((process.env.INSTAGRAM_CLIENT_ID || process.env.INSTAGRAM_APP_ID) &&
         (process.env.INSTAGRAM_CLIENT_SECRET || process.env.INSTAGRAM_APP_SECRET)) ||
        ((await providerRepo.hasProviderSecret('instagram', 'client_id') || await providerRepo.hasProviderSecret('instagram', 'app_id')) &&
         (await providerRepo.hasProviderSecret('instagram', 'client_secret') || await providerRepo.hasProviderSecret('instagram', 'app_secret')))
      ),
      mode: 'Instagram Graph API / OAuth 2.0',
      secretManaged: true,
      callbackPath: '/api/auth/oauth/instagram/callback',
      callbackHint: '请在 Meta for Developers 注册 Instagram 应用并添加「Instagram 登录」，将有效 OAuth 跳转 URI 配置为此完整地址。',
      secretKeys: await enrichSecretKeys('instagram', [
        { name: 'client_id', label: 'Instagram App ID 客户端标识', placeholder: '从 Meta 开发者后台获取的 Instagram App ID' },
        { name: 'client_secret', label: 'Instagram App Secret 客户端密钥', placeholder: '从 Meta 开发者后台获取的 App Secret' },
      ]),
      lastCheck: checksMap.get('instagram') || null,
    },
    {
      id: 'wechat_oauth',
      name: '微信登录',
      kind: 'social',
      description: '微信开放平台「网站应用」扫码登录 (OAuth 2.0，与微信支付商户号相互独立)',
      configured: Boolean(
        ((process.env.WECHAT_OAUTH_APP_ID || process.env.WECHAT_APP_ID || process.env.WECHAT_CLIENT_ID || process.env.WECHAT_OPEN_APP_ID) &&
         (process.env.WECHAT_OAUTH_APP_SECRET || process.env.WECHAT_APP_SECRET || process.env.WECHAT_CLIENT_SECRET || process.env.WECHAT_OPEN_APP_SECRET)) ||
        ((await providerRepo.hasProviderSecret('wechat_oauth', 'app_id') || await providerRepo.hasProviderSecret('wechat_oauth', 'client_id') ||
          await providerRepo.hasProviderSecret('wechat', 'app_id') || await providerRepo.hasProviderSecret('wechat', 'client_id')) &&
         (await providerRepo.hasProviderSecret('wechat_oauth', 'app_secret') || await providerRepo.hasProviderSecret('wechat_oauth', 'client_secret') ||
          await providerRepo.hasProviderSecret('wechat', 'app_secret') || await providerRepo.hasProviderSecret('wechat', 'client_secret')))
      ),
      mode: 'WeChat Open Platform 扫码授权',
      secretManaged: true,
      callbackPath: '/api/auth/oauth/wechat/callback',
      secretKeys: await enrichSecretKeys('wechat_oauth', [
        { name: 'app_id', label: '微信 AppID', placeholder: '开放平台网站应用的 AppID (wx 开头 16 位)' },
        { name: 'app_secret', label: '微信 AppSecret', placeholder: '开放平台网站应用的 AppSecret' },
      ]),
      lastCheck: checksMap.get('wechat_oauth') || null,
    },
    {
      id: 'qq',
      name: 'QQ 登录',
      kind: 'social',
      description: 'QQ 互联网页扫码登录 (OAuth 2.0)',
      configured: Boolean(
        ((process.env.QQ_APP_ID || process.env.QQ_CLIENT_ID) &&
         (process.env.QQ_APP_KEY || process.env.QQ_CLIENT_SECRET)) ||
        ((await providerRepo.hasProviderSecret('qq', 'app_id') || await providerRepo.hasProviderSecret('qq', 'client_id')) &&
         (await providerRepo.hasProviderSecret('qq', 'app_key') || await providerRepo.hasProviderSecret('qq', 'client_secret')))
      ),
      mode: 'QQ Connect 网页授权',
      secretManaged: true,
      callbackPath: '/api/auth/qq/callback',
      secretKeys: await enrichSecretKeys('qq', [
        { name: 'app_id', label: 'QQ AppID', placeholder: 'QQ 互联应用的 AppID (纯数字)' },
        { name: 'app_key', label: 'QQ AppKey', placeholder: 'QQ 互联应用的 AppKey' },
        { name: 'redirect_uri', label: '回调地址 (选填，须与QQ互联后台完全一致)', placeholder: '默认: https://www.supdance.com/api/auth/qq/callback' },
      ]),
      lastCheck: checksMap.get('qq') || null,
    },
    {
      id: 'bilibili',
      name: '哔哩哔哩登录',
      kind: 'social',
      description: '哔哩哔哩开放平台网页 OAuth 2.0 登录',
      configured: Boolean(
        ((process.env.BILIBILI_CLIENT_ID || process.env.BILIBILI_APP_ID) &&
         (process.env.BILIBILI_CLIENT_SECRET || process.env.BILIBILI_APP_SECRET)) ||
        ((await providerRepo.hasProviderSecret('bilibili', 'client_id') || await providerRepo.hasProviderSecret('bilibili', 'app_id')) &&
         (await providerRepo.hasProviderSecret('bilibili', 'client_secret') || await providerRepo.hasProviderSecret('bilibili', 'app_secret')))
      ),
      mode: '哔哩哔哩网页授权 OAuth 2.0',
      secretManaged: true,
      callbackPath: '/api/auth/oauth/bilibili/callback',
      callbackHint: '请在哔哩哔哩开放平台申请 USER_INFO 用户信息权限，并将授权回调域配置为此完整地址。',
      secretKeys: await enrichSecretKeys('bilibili', [
        { name: 'client_id', label: 'Client ID 客户端标识', placeholder: '哔哩哔哩开放平台应用 Client ID' },
        { name: 'client_secret', label: 'Client Secret 客户端密钥', placeholder: '哔哩哔哩开放平台应用密钥' },
      ]),
      lastCheck: checksMap.get('bilibili') || null,
    },
    {
      id: 'douyin',
      name: '抖音登录',
      kind: 'social',
      description: '抖音开放平台网页应用登录 (Login Kit，scope=user_info)',
      configured: Boolean(
        ((process.env.DOUYIN_CLIENT_KEY || process.env.DOUYIN_APP_ID) &&
         (process.env.DOUYIN_CLIENT_SECRET || process.env.DOUYIN_APP_SECRET)) ||
        ((await providerRepo.hasProviderSecret('douyin', 'client_key') || await providerRepo.hasProviderSecret('douyin', 'app_id')) &&
         (await providerRepo.hasProviderSecret('douyin', 'client_secret') || await providerRepo.hasProviderSecret('douyin', 'app_secret')))
      ),
      mode: 'Douyin Login Kit',
      secretManaged: true,
      callbackPath: '/api/auth/oauth/douyin/callback',
      callbackHint: '抖音开放平台已升级为域名+Path完整校验，必须配置完整的回调 URL。',
      secretKeys: await enrichSecretKeys('douyin', [
        { name: 'client_key', label: '抖音 Client Key', placeholder: '抖音开放平台网页应用的 Client Key' },
        { name: 'client_secret', label: '抖音 Client Secret', placeholder: '抖音开放平台网页应用的 Client Secret' },
        {
          name: 'redirect_uri',
          label: '自定义回调地址（选填，留空则默认 https://www.supdance.com/api/auth/oauth/douyin/callback）',
          placeholder: '例如：https://supdance.com/api/auth/oauth/douyin/callback',
          isSecret: false,
        },
      ]),
      lastCheck: checksMap.get('douyin') || null,
    },
  ];

  return providers;
}


export async function rotateProviderSecret({ actor, provider, secretName, secretValue, requestId }) {
  const cleanValue = typeof secretValue === 'string' ? secretValue.trim() : '';
  if (!cleanValue || cleanValue.length < 3) {
    return { error: '密钥内容格式无效或长度不足' };
  }

  return await withTransaction(async (tx) => {
    const result = await providerRepo.saveProviderSecret({
      provider,
      name: secretName,
      secretValue: cleanValue,
      transaction: tx,
    });

    await logAudit({
      actor,
      action: 'providers.rotate_secret',
      targetType: 'provider',
      targetId: `${provider}:${secretName}`,
      riskLevel: 'high',
      after: { provider, secretName, updatedAt: result.updatedAt },
      requestId,
      transaction: tx,
    });

    return { success: true, provider, secretName, updatedAt: result.updatedAt };
  });
}

export async function getActiveProviderKeyEnv(provider) {
  return providerRepo.getProviderKeyEnv(provider);
}

export async function setActiveProviderKeyEnv({ actor, provider, env, requestId }) {
  const normalized = env === 'sandbox' ? 'sandbox' : 'production';
  const previous = await providerRepo.getProviderKeyEnv(provider);
  const next = await providerRepo.setProviderKeyEnv(provider, normalized);
  await logAudit({
    actor,
    action: 'providers.rotate_key_env',
    targetType: 'provider',
    targetId: provider,
    riskLevel: 'high',
    before: { activeKeyEnv: previous },
    after: { activeKeyEnv: next },
    requestId,
  });
  return { provider, activeKeyEnv: next, previousKeyEnv: previous };
}

export async function testProviderHealth(input) {
  const { actor = null, provider, env = null, requestId = null } = typeof input === 'string' ? { provider: input } : (input || {});
  const start = Date.now();
  let status = 'healthy';
  let errorCode = null;
  let details = {};

  try {
    if (provider === 'muapi') {
      const apiKey = await getServerProviderApiKey({ provider: 'muapi' });
      if (!apiKey) {
        status = 'unconfigured';
        errorCode = 'PROVIDER_NOT_CONFIGURED';
        details = { httpStatus: null };
      } else {
        const res = await fetch('https://api.muapi.ai/api/v1/models', {
          method: 'GET',
          headers: { 'x-api-key': apiKey },
          cache: 'no-store',
        });
        if (!res.ok) {
          status = 'degraded';
          errorCode = `HTTP_${res.status}`;
        }
        details = { httpStatus: res.status };
      }
    } else if (provider === 'dashscope' || provider === 'aliyun') {
      const apiKey = await getServerProviderApiKey({ provider: 'dashscope' });
      if (!apiKey) {
        status = 'unconfigured';
        errorCode = 'PROVIDER_NOT_CONFIGURED';
        details = { error: '尚未配置阿里云百炼 API-KEY (DASHSCOPE_API_KEY)' };
      } else {
        const res = await fetch('https://dashscope.aliyuncs.com/api/v1/models', {
          method: 'GET',
          headers: { 'Authorization': `Bearer ${apiKey}` },
          cache: 'no-store',
          signal: AbortSignal.timeout(6000),
        }).catch(() => null);
        if (!res) {
          status = 'offline';
          errorCode = 'NETWORK_TIMEOUT';
          details = { error: '连通阿里云百炼 DashScope 超时' };
        } else if (!res.ok && res.status !== 404) {
          status = 'degraded';
          errorCode = `HTTP_${res.status}`;
          details = { httpStatus: res.status, endpoint: 'DashScope API' };
        } else {
          status = 'healthy';
          details = { httpStatus: res.status, endpoint: 'DashScope API' };
        }
      }
    } else if (provider === 'minimax') {
      const apiKey = await getServerProviderApiKey({ provider: 'minimax' });
      if (!apiKey) {
        status = 'unconfigured';
        errorCode = 'PROVIDER_NOT_CONFIGURED';
        details = { error: '尚未配置 MiniMax API Key' };
      } else {
        status = 'healthy';
        details = { endpoint: 'MiniMax OpenAPI Gateway' };
      }
    } else if (provider === 'kling') {
      const apiKey = await getServerProviderApiKey({ provider: 'kling' });
      if (!apiKey) {
        status = 'unconfigured';
        errorCode = 'PROVIDER_NOT_CONFIGURED';
        details = { error: '尚未配置快手可灵 Kling API Key' };
      } else {
        status = 'healthy';
        details = { endpoint: 'Kling AI Gateway' };
      }
    } else if (provider === 'deepseek') {
      const apiKey = await getServerProviderApiKey({ provider: 'deepseek' });
      if (!apiKey) {
        status = 'unconfigured';
        errorCode = 'PROVIDER_NOT_CONFIGURED';
        details = { error: '尚未配置 DeepSeek API Key (DEEPSEEK_API_KEY)' };
      } else {
        const res = await fetch('https://api.deepseek.com/models', {
          method: 'GET',
          headers: { Authorization: `Bearer ${apiKey}` },
          cache: 'no-store',
          signal: AbortSignal.timeout(6000),
        }).catch(() => null);
        if (!res) {
          status = 'offline';
          errorCode = 'NETWORK_TIMEOUT';
          details = { error: '连通 DeepSeek API 超时' };
        } else if (!res.ok) {
          status = 'degraded';
          errorCode = `HTTP_${res.status}`;
          details = { httpStatus: res.status, endpoint: 'DeepSeek API' };
        } else {
          status = 'healthy';
          details = { httpStatus: res.status, endpoint: 'DeepSeek API' };
        }
      }
    } else if (provider === 'google') {
      const hasId = process.env.GOOGLE_CLIENT_ID || await providerRepo.hasProviderSecret('google', 'client_id');
      const hasSecret = process.env.GOOGLE_CLIENT_SECRET || await providerRepo.hasProviderSecret('google', 'client_secret');
      if (!hasId || !hasSecret) {
        status = 'unconfigured';
        errorCode = 'PROVIDER_NOT_CONFIGURED';
        details = { error: '尚未录入 Client ID 或 Client Secret' };
      } else {
        const res = await fetch('https://accounts.google.com/.well-known/openid-configuration', {
          method: 'GET',
          cache: 'no-store',
          signal: AbortSignal.timeout(6000),
        }).catch(() => null);
        if (!res) {
          status = 'offline';
          errorCode = 'NETWORK_TIMEOUT';
          details = { error: '无法连通 Google OIDC 网关（请求超时或网络受限）' };
        } else if (!res.ok) {
          status = 'degraded';
          errorCode = `HTTP_${res.status}`;
          details = { httpStatus: res.status, endpoint: 'Google OIDC Discovery' };
        } else {
          status = 'healthy';
          details = { httpStatus: res.status, endpoint: 'Google OIDC Discovery' };
        }
      }
    } else if (provider === 'x') {
      const hasId = process.env.X_CLIENT_ID || await providerRepo.hasProviderSecret('x', 'client_id');
      const hasSecret = process.env.X_CLIENT_SECRET || await providerRepo.hasProviderSecret('x', 'client_secret');
      if (!hasId || !hasSecret) {
        status = 'unconfigured';
        errorCode = 'PROVIDER_NOT_CONFIGURED';
        details = { error: '尚未录入 Client ID 或 Client Secret' };
      } else {
        const res = await fetch('https://api.x.com/2/oauth2/token', {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: 'grant_type=client_credentials',
          signal: AbortSignal.timeout(6000),
        }).catch(() => null);
        if (!res) {
          status = 'offline';
          errorCode = 'NETWORK_TIMEOUT';
        } else {
          status = 'healthy';
        }
        details = { httpStatus: res?.status || 200, endpoint: 'X API v2 Gateway' };
      }
    } else if (provider === 'tiktok') {
      const hasKey = process.env.TIKTOK_CLIENT_KEY || await providerRepo.hasProviderSecret('tiktok', 'client_key');
      const hasSecret = process.env.TIKTOK_CLIENT_SECRET || await providerRepo.hasProviderSecret('tiktok', 'client_secret');
      if (!hasKey || !hasSecret) {
        status = 'unconfigured';
        errorCode = 'PROVIDER_NOT_CONFIGURED';
        details = { error: '尚未录入 Client Key 或 Client Secret' };
      } else {
        const res = await fetch('https://www.tiktok.com/v2/auth/authorize/', {
          method: 'GET',
          cache: 'no-store',
          signal: AbortSignal.timeout(6000),
        }).catch(() => null);
        if (!res) {
          status = 'offline';
          errorCode = 'NETWORK_TIMEOUT';
        } else {
          status = 'healthy';
        }
        details = { httpStatus: res?.status || 200, endpoint: 'TikTok Authorize Gateway' };
      }
    } else if (provider === 'instagram') {
      const hasId = process.env.INSTAGRAM_CLIENT_ID || process.env.INSTAGRAM_APP_ID ||
        await providerRepo.hasProviderSecret('instagram', 'client_id') || await providerRepo.hasProviderSecret('instagram', 'app_id');
      const hasSecret = process.env.INSTAGRAM_CLIENT_SECRET || process.env.INSTAGRAM_APP_SECRET ||
        await providerRepo.hasProviderSecret('instagram', 'client_secret') || await providerRepo.hasProviderSecret('instagram', 'app_secret');
      if (!hasId || !hasSecret) {
        status = 'unconfigured';
        errorCode = 'PROVIDER_NOT_CONFIGURED';
        details = { error: '尚未录入 Instagram App ID 或 App Secret' };
      } else {
        const res = await fetch('https://www.instagram.com/oauth/authorize', {
          method: 'GET',
          cache: 'no-store',
          signal: AbortSignal.timeout(6000),
        }).catch(() => null);
        if (!res) {
          status = 'offline';
          errorCode = 'NETWORK_TIMEOUT';
        } else {
          status = 'healthy';
        }
        details = { httpStatus: res?.status || 200, endpoint: 'Instagram OAuth Gateway' };
      }
    } else if (provider === 'alipay') {
      const targetEnv = env || await providerRepo.getProviderKeyEnv('alipay');
      const isSandbox = targetEnv === 'sandbox';
      const defaultGateway = isSandbox
        ? 'https://openapi-sandbox.dl.alipaydev.com/gateway.do'
        : 'https://openapi.alipay.com/gateway.do';
      const customGateway = !isSandbox && (process.env.ALIPAY_GATEWAY || await providerRepo.getProviderSecret('alipay', 'gateway'));
      const gateway = customGateway || defaultGateway;
      const hasId = process.env.ALIPAY_APP_ID || await providerRepo.hasProviderSecret('alipay', 'app_id');
      const hasKey = process.env.ALIPAY_PRIVATE_KEY || await providerRepo.hasProviderSecret('alipay', 'private_key');
      if (!isSandbox && (!hasId || !hasKey)) {
        status = 'unconfigured';
        errorCode = 'PROVIDER_NOT_CONFIGURED';
        details = { error: '尚未配置支付宝正式环境 AppID 或商户私钥', mode: targetEnv, endpoint: gateway };
      } else {
        const res = await fetch(gateway, {
          method: 'GET',
          signal: AbortSignal.timeout(6000),
        }).catch(() => null);
        if (!res) {
          status = 'offline';
          errorCode = 'NETWORK_TIMEOUT';
          details = { error: `支付宝网关网络连通超时 (${gateway})`, mode: targetEnv, endpoint: gateway };
        } else {
          status = 'healthy';
          details = {
            httpStatus: res.status,
            endpoint: gateway,
            mode: targetEnv,
            note: isSandbox ? '支付宝沙盒联调网关连通正常' : '支付宝生产网关连通正常',
          };
        }
      }
    } else if (provider === 'paypal') {
      const targetEnv = env || await providerRepo.getProviderKeyEnv('paypal');
      const isSandbox = targetEnv === 'sandbox';
      const clientId = process.env.PAYPAL_CLIENT_ID || await providerRepo.getProviderSecret('paypal', 'client_id');
      const clientSecret = process.env.PAYPAL_CLIENT_SECRET || await providerRepo.getProviderSecret('paypal', 'client_secret');
      const baseUrl = isSandbox ? 'https://api-m.sandbox.paypal.com' : 'https://api-m.paypal.com';
      if (!isSandbox && (!clientId || !clientSecret)) {
        status = 'unconfigured';
        errorCode = 'PROVIDER_NOT_CONFIGURED';
        details = { error: '尚未配置 PayPal Client ID 或 Client Secret', mode: targetEnv, endpoint: baseUrl };
      } else if (clientId && clientSecret) {
        const res = await fetch(`${baseUrl}/v1/oauth2/token`, {
          method: 'POST',
          headers: {
            'Authorization': `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}`,
            'Content-Type': 'application/x-www-form-urlencoded',
          },
          body: 'grant_type=client_credentials',
          signal: AbortSignal.timeout(6000),
        }).catch(() => null);
        if (!res) {
          status = 'offline';
          errorCode = 'NETWORK_TIMEOUT';
          details = { error: `无法连通 PayPal 网关 (${baseUrl})`, mode: targetEnv, endpoint: baseUrl };
        } else if (res.ok) {
          status = 'healthy';
          details = {
            httpStatus: res.status,
            endpoint: baseUrl,
            mode: targetEnv,
            note: isSandbox ? 'PayPal 沙盒凭据与网关鉴权正常' : 'PayPal 生产凭据与网关鉴权正常',
          };
        } else {
          status = 'degraded';
          errorCode = `HTTP_${res.status}`;
          details = { httpStatus: res.status, endpoint: baseUrl, mode: targetEnv, error: 'PayPal 凭证鉴权未通过' };
        }
      } else {
        const res = await fetch(`${baseUrl}/v1/oauth2/token`, {
          method: 'GET',
          signal: AbortSignal.timeout(6000),
        }).catch(() => null);
        status = res ? 'healthy' : 'offline';
        details = { endpoint: baseUrl, mode: targetEnv, note: isSandbox ? 'PayPal 沙盒网关可达' : 'PayPal 生产网关可达' };
      }
    } else if (provider === 'stripe') {
      const targetEnv = env || await providerRepo.getProviderKeyEnv('stripe');
      const isSandbox = targetEnv === 'sandbox';
      const secret = await providerRepo.getProviderSecret('stripe', 'secret_key') || process.env.STRIPE_SECRET_KEY;
      const endpoint = 'https://api.stripe.com/v1/balance';
      if (!secret && !isSandbox) {
        status = 'unconfigured';
        errorCode = 'PROVIDER_NOT_CONFIGURED';
        details = { error: '尚未配置 Stripe 密钥 (STRIPE_SECRET_KEY)', mode: targetEnv, endpoint };
      } else {
        const res = await fetch(endpoint, {
          method: 'GET',
          headers: secret ? { Authorization: `Bearer ${secret}` } : {},
          signal: AbortSignal.timeout(6000),
        }).catch(() => null);
        if (!res) {
          status = 'offline';
          errorCode = 'NETWORK_TIMEOUT';
          details = { error: '连通 Stripe 官方 API 超时', mode: targetEnv, endpoint };
        } else if (res.ok || res.status === 401) {
          status = res.ok ? 'healthy' : secret ? 'degraded' : 'healthy';
          details = {
            httpStatus: res.status,
            endpoint,
            mode: targetEnv,
            note: res.ok
              ? isSandbox
                ? 'Stripe 沙盒密钥与 API 鉴权正常'
                : 'Stripe 生产密钥与 API 鉴权正常'
              : 'Stripe 国际网关网络可达',
          };
        } else {
          status = 'degraded';
          errorCode = `HTTP_${res.status}`;
          details = { httpStatus: res.status, endpoint, mode: targetEnv };
        }
      }
    } else if (provider === 'wechat') {
      const targetEnv = env || await providerRepo.getProviderKeyEnv('wechat');
      const isSandbox = targetEnv === 'sandbox';
      const endpoint = isSandbox
        ? 'https://api.mch.weixin.qq.com/sandboxnew/pay/getsignkey'
        : 'https://api.mch.weixin.qq.com/v3/certificates';
      const hasId = process.env.WECHAT_APP_ID || await providerRepo.hasProviderSecret('wechat', 'app_id');
      const hasMch = process.env.WECHAT_MCH_ID || await providerRepo.hasProviderSecret('wechat', 'mch_id');
      if (!isSandbox && (!hasId || !hasMch)) {
        status = 'unconfigured';
        errorCode = 'PROVIDER_NOT_CONFIGURED';
        details = { error: '尚未录入微信支付商户号或 AppID', mode: targetEnv, endpoint };
      } else {
        const res = await fetch(endpoint, {
          method: isSandbox ? 'POST' : 'GET',
          cache: 'no-store',
          signal: AbortSignal.timeout(6000),
        }).catch(() => null);
        if (!res) {
          status = 'offline';
          errorCode = 'NETWORK_TIMEOUT';
          details = { error: `无法连通微信支付${isSandbox ? '沙盒' : '官方'}网关（网络超时或受限）`, mode: targetEnv, endpoint };
        } else {
          status = 'healthy';
          details = {
            httpStatus: res.status,
            endpoint,
            mode: targetEnv,
            note: isSandbox ? '微信支付沙盒测试网关连通正常' : '微信支付生产网关连通正常',
          };
        }
      }
    } else if (provider === 'wechat_oauth') {
      const hasId = process.env.WECHAT_OAUTH_APP_ID || process.env.WECHAT_APP_ID || process.env.WECHAT_CLIENT_ID || process.env.WECHAT_OPEN_APP_ID ||
        await providerRepo.hasProviderSecret('wechat_oauth', 'app_id') || await providerRepo.hasProviderSecret('wechat_oauth', 'client_id');
      const hasSecret = process.env.WECHAT_OAUTH_APP_SECRET || process.env.WECHAT_APP_SECRET || process.env.WECHAT_CLIENT_SECRET || process.env.WECHAT_OPEN_APP_SECRET ||
        await providerRepo.hasProviderSecret('wechat_oauth', 'app_secret') || await providerRepo.hasProviderSecret('wechat_oauth', 'client_secret');
      if (!hasId || !hasSecret) {
        status = 'unconfigured';
        errorCode = 'PROVIDER_NOT_CONFIGURED';
        details = { error: '尚未录入微信开放平台 AppID 或 AppSecret' };
      } else {
        const res = await fetch('https://api.weixin.qq.com/sns/oauth2/access_token', {
          method: 'GET',
          cache: 'no-store',
          signal: AbortSignal.timeout(6000),
        }).catch(() => null);
        if (!res) {
          status = 'offline';
          errorCode = 'NETWORK_TIMEOUT';
          details = { error: '无法连通微信开放平台网关（网络超时或受限）' };
        } else {
          status = 'healthy';
          details = { httpStatus: res.status, endpoint: 'WeChat Open API Gateway' };
        }
      }
    } else if (provider === 'qq') {
      const hasId = process.env.QQ_APP_ID || process.env.QQ_CLIENT_ID ||
        await providerRepo.hasProviderSecret('qq', 'app_id') || await providerRepo.hasProviderSecret('qq', 'client_id');
      const hasKey = process.env.QQ_APP_KEY || process.env.QQ_CLIENT_SECRET ||
        await providerRepo.hasProviderSecret('qq', 'app_key') || await providerRepo.hasProviderSecret('qq', 'client_secret');
      if (!hasId || !hasKey) {
        status = 'unconfigured';
        errorCode = 'PROVIDER_NOT_CONFIGURED';
        details = { error: '尚未录入 QQ 互联 AppID 或 AppKey' };
      } else {
        const res = await fetch('https://graph.qq.com/oauth2.0/token', {
          method: 'GET',
          cache: 'no-store',
          signal: AbortSignal.timeout(6000),
        }).catch(() => null);
        if (!res) {
          status = 'offline';
          errorCode = 'NETWORK_TIMEOUT';
          details = { error: '无法连通 QQ 互联开放平台网关（网络超时或受限）' };
        } else {
          status = 'healthy';
          details = { httpStatus: res.status, endpoint: 'QQ Connect Gateway' };
        }
      }
    } else if (provider === 'douyin') {
      const hasKey = process.env.DOUYIN_CLIENT_KEY || process.env.DOUYIN_APP_ID ||
        await providerRepo.hasProviderSecret('douyin', 'client_key') || await providerRepo.hasProviderSecret('douyin', 'app_id');
      const hasSecret = process.env.DOUYIN_CLIENT_SECRET || process.env.DOUYIN_APP_SECRET ||
        await providerRepo.hasProviderSecret('douyin', 'client_secret') || await providerRepo.hasProviderSecret('douyin', 'app_secret');
      if (!hasKey || !hasSecret) {
        status = 'unconfigured';
        errorCode = 'PROVIDER_NOT_CONFIGURED';
        details = { error: '尚未录入抖音开放平台 Client Key 或 Client Secret' };
      } else {
        const res = await fetch('https://open.douyin.com/oauth/access_token/', {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: 'grant_type=client_credential',
          signal: AbortSignal.timeout(6000),
        }).catch(() => null);
        if (!res) {
          status = 'offline';
          errorCode = 'NETWORK_TIMEOUT';
          details = { error: '无法连通抖音开放平台网关（网络超时或受限）' };
        } else {
          status = 'healthy';
          details = { httpStatus: res.status, endpoint: 'Douyin Open Gateway' };
        }
      }
    } else if (provider === 'bilibili') {
      const hasId = process.env.BILIBILI_CLIENT_ID || process.env.BILIBILI_APP_ID ||
        await providerRepo.hasProviderSecret('bilibili', 'client_id') || await providerRepo.hasProviderSecret('bilibili', 'app_id');
      const hasSecret = process.env.BILIBILI_CLIENT_SECRET || process.env.BILIBILI_APP_SECRET ||
        await providerRepo.hasProviderSecret('bilibili', 'client_secret') || await providerRepo.hasProviderSecret('bilibili', 'app_secret');
      if (!hasId || !hasSecret) {
        status = 'unconfigured';
        errorCode = 'PROVIDER_NOT_CONFIGURED';
        details = { error: '尚未录入哔哩哔哩开放平台 Client ID 或 Client Secret' };
      } else {
        const res = await fetch('https://api.bilibili.com/x/account-oauth2/v1/token', {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: 'client_id=test',
          signal: AbortSignal.timeout(6000),
        }).catch(() => null);
        if (!res) {
          status = 'offline';
          errorCode = 'NETWORK_TIMEOUT';
          details = { error: '无法连通哔哩哔哩开放平台网关（网络超时或受限）' };
        } else {
          status = 'healthy';
          details = { httpStatus: res.status, endpoint: 'Bilibili OAuth Gateway' };
        }
      }
    } else {
      details = { note: '已执行本地环境变量与配置校验' };
    }
  } catch (err) {
    status = 'offline';
    errorCode = err.code || 'NETWORK_ERROR';
    details = { error: err.message };
  }

  const latencyMs = Date.now() - start;
  const record = await providerRepo.recordHealthCheck({
    provider,
    status,
    latencyMs,
    errorCode,
    details,
  });

  await logAudit({
    actor,
    action: 'providers.test_health',
    targetType: 'provider',
    targetId: provider,
    riskLevel: 'low',
    after: { status, latencyMs, errorCode },
    requestId,
  });

  return record;
}
