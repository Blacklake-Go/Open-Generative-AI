import crypto from 'node:crypto';
import fs from 'node:fs';
import { PaymentProviderError, assertPaymentProvider, normalizeProviderError } from './provider.js';

// 记忆当面付能力状态（若已确认受限未开通，直接跳过 1.5s 的预下单报错等待）
let precreateDisabledUntil = 0;

function providerNotConfigured(action) {
  return new PaymentProviderError('支付宝支付尚未完成配置', {
    provider: 'alipay',
    action,
    code: 'PAYMENT_PROVIDER_NOT_CONFIGURED',
    status: 503,
  });
}

function formatPrivateKey(keyText) {
  if (!keyText) return '';
  let trimmed = String(keyText).trim().replace(/\r\n/g, '\n').replace(/\\n/g, '\n');
  if (trimmed.includes('PRIVATE KEY')) {
    return trimmed;
  }
  const beginTag = ['-----BEGIN', 'PRIVATE', 'KEY-----'].join(' ');
  const endTag = ['-----END', 'PRIVATE', 'KEY-----'].join(' ');
  return `${beginTag}\n${trimmed}\n${endTag}`;
}

function formatPublicKey(keyText) {
  if (!keyText) return '';
  let trimmed = String(keyText).trim().replace(/\r\n/g, '\n').replace(/\\n/g, '\n');
  if (trimmed.includes('BEGIN PUBLIC KEY') || trimmed.includes('BEGIN RSA PUBLIC KEY') || trimmed.includes('BEGIN CERTIFICATE')) {
    return trimmed;
  }
  return `-----BEGIN PUBLIC KEY-----\n${trimmed}\n-----END PUBLIC KEY-----`;
}

/**
 * 支付宝参数字典排序并拼接为待签名串
 * @param {Object} params
 * @param {boolean} isVerify 是否为回调验签（回调验签时需同时排除 sign 和 sign_type）
 */
export function buildAlipaySignString(params, isVerify = false) {
  const sortedKeys = Object.keys(params).sort();
  const pairs = [];
  for (const key of sortedKeys) {
    const val = params[key];
    if (key === 'sign' || (isVerify && key === 'sign_type') || val === undefined || val === null || val === '') {
      continue;
    }
    pairs.push(`${key}=${typeof val === 'object' ? JSON.stringify(val) : String(val)}`);
  }
  return pairs.join('&');
}

/**
 * 使用商户或服务方 RSA2 私钥对内容签名
 */
export function signAlipayParams(params, privateKey, isVerify = false) {
  const signString = buildAlipaySignString(params, isVerify);
  const signer = crypto.createSign('RSA-SHA256');
  signer.update(signString, 'utf8');
  return signer.sign(formatPrivateKey(privateKey), 'base64');
}

/**
 * 校验支付宝回调通知签名 (RSA2)
 */
export function verifyAlipaySignature(params, alipayPublicKey) {
  if (!alipayPublicKey) {
    throw new Error('未配置支付宝公钥 (ALIPAY_PUBLIC_KEY)，无法验证回调签名');
  }
  const sign = params.sign;
  if (!sign) return false;
  const cleanSign = String(sign).replace(/ /g, '+');
  const signString = buildAlipaySignString(params, true);
  const verifier = crypto.createVerify('RSA-SHA256');
  verifier.update(signString, 'utf8');
  return verifier.verify(formatPublicKey(alipayPublicKey), cleanSign, 'base64');
}

function readKeyOrPath(val, pathVal) {
  if (val && String(val).trim()) return String(val).trim();
  if (pathVal && String(pathVal).trim()) {
    const trimmedPath = String(pathVal).trim();
    try {
      if (fs.existsSync(trimmedPath)) return fs.readFileSync(trimmedPath, 'utf8');
    } catch (e) {
      console.warn('[alipayProvider] 读取公钥/私钥文件失败:', trimmedPath, e.message);
    }
  }
  return null;
}

/**
 * 创建支付宝当面付 Provider
 */
export function getAlipayProvider({
  appId = process.env.ALIPAY_APP_ID,
  privateKey = readKeyOrPath(process.env.ALIPAY_PRIVATE_KEY, process.env.ALIPAY_PRIVATE_KEY_PATH),
  publicKey = readKeyOrPath(process.env.ALIPAY_PUBLIC_KEY, process.env.ALIPAY_PUBLIC_KEY_PATH),
  gateway = process.env.ALIPAY_GATEWAY || 'https://openapi.alipay.com/gateway.do',
  notifyUrl = process.env.ALIPAY_NOTIFY_URL,
  onCall = null,
} = {}) {
  const isConfigured = alipayCredentialReadiness({ appId, privateKey, publicKey }).usable;

  async function call(action, executor) {
    try {
      const result = await executor();
      if (onCall) {
        onCall({ provider: 'alipay', action, status: 200, success: true });
      }
      return result;
    } catch (error) {
      const normalized = normalizeProviderError(error, { provider: 'alipay', action });
      if (onCall) {
        onCall({ provider: 'alipay', action, status: normalized.status, success: false, error: normalized.message });
      }
      throw normalized;
    }
  }

  async function requestAlipayApi(method, bizContent) {
    const timestamp = new Date(Date.now() + 8 * 3600 * 1000).toISOString().replace('T', ' ').slice(0, 19);
    const systemParams = {
      app_id: appId,
      method,
      format: 'JSON',
      charset: 'utf-8',
      sign_type: 'RSA2',
      timestamp,
      version: '1.0',
      notify_url: notifyUrl || `${process.env.PUBLIC_APP_URL || 'https://www.Supdance.com'}/api/billing/webhooks/alipay`,
      biz_content: JSON.stringify(bizContent),
    };

    systemParams.sign = signAlipayParams(systemParams, privateKey);

    const formData = new URLSearchParams();
    for (const [k, v] of Object.entries(systemParams)) {
      formData.set(k, v);
    }

    let res;
    let rawResponseText = '';
    const maxAttempts = 2;
    for (let attempt = 0; attempt <= maxAttempts; attempt++) {
      try {
        res = await fetch(gateway, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded;charset=utf-8',
          },
          body: formData.toString(),
        });
        rawResponseText = await res.text();
        if (res.ok) break;
      } catch (networkErr) {
        if (attempt === maxAttempts) throw networkErr;
      }
      if (attempt < maxAttempts) {
        await new Promise((r) => setTimeout(r, 300 * (attempt + 1)));
      }
    }

    let data = {};
    try {
      data = JSON.parse(rawResponseText);
    } catch (parseErr) {
      console.error('[alipayProvider] Non-JSON response from Alipay gateway:', {
        status: res?.status ?? null,
      });
    }
    const responseKey = `${method.replace(/\./g, '_')}_response`;
    const responseBody = data[responseKey];

    // 特殊静默状态：针对 alipay.trade.query 接口，在用户尚未扫码前，支付宝正常返回 40004 ACQ.TRADE_NOT_EXIST
    if (method === 'alipay.trade.query' && responseBody?.sub_code === 'ACQ.TRADE_NOT_EXIST') {
      return responseBody;
    }

    if (!responseBody || responseBody.code !== '10000') {
      const safeCode = (value) => {
        const code = typeof value === 'string' ? value : '';
        return /^[a-z0-9_.-]{1,64}$/i.test(code) ? code : 'UNAVAILABLE';
      };
      console.error('[alipayProvider] API request failed:', {
        method,
        status: res?.status ?? null,
        code: safeCode(responseBody?.code),
        subCode: safeCode(responseBody?.sub_code),
      });
      throw Object.assign(
        new Error(responseBody?.sub_msg || responseBody?.msg || '支付宝请求失败'),
        {
          code: responseBody?.sub_code || responseBody?.code || 'ALIPAY_API_ERROR',
          subMsg: responseBody?.sub_msg,
        }
      );
    }

    return responseBody;
  }

  const provider = {
    mode: isConfigured ? 'live' : 'unconfigured',

    /**
     * 当面付预下单：alipay.trade.precreate
     */
    async createCheckout({ order, user, plan, successUrl, cancelUrl }) {
      if (!isConfigured) {
        throw providerNotConfigured('createCheckout');
      }

      return call('createCheckout', async () => {
        const totalAmountYuan = ((order.amount_minor || Math.round(plan.monthlyUsd * 100)) / 100).toFixed(2);
        const subject = `SupDance AI 算力套餐 - ${plan.name || '创作者套餐'}`;

        const isPrecreateDisabled =
          process.env.ALIPAY_PRECREATE_DISABLED === 'true' ||
          Date.now() < precreateDisabledUntil;

        if (!isPrecreateDisabled) {
          const bizContent = {
            out_trade_no: String(order.id),
            total_amount: totalAmountYuan,
            subject: subject.slice(0, 100),
            timeout_express: '30m',
            passback_params: encodeURIComponent(JSON.stringify({ userId: user.id, planId: plan.id })),
          };

          try {
            const res = await requestAlipayApi('alipay.trade.precreate', bizContent);
            return {
              id: order.id,
              qr_code: res.qr_code,
              url: res.qr_code,
              isPagePay: false,
            };
          } catch (precreateErr) {
            if (
              precreateErr?.code === 'isv.invalid-signature' ||
              String(precreateErr?.message || '').includes('验签出错')
            ) {
              console.error('[alipayProvider] 支付宝商户私钥验签失败:', precreateErr?.message);
              throw Object.assign(
                new Error('支付宝商户私钥验签未通过 (isv.invalid-signature)：请检查商户私钥与支付宝开放平台 (open.alipay.com) 应用公钥是否配对一致'),
                { code: 'ALIPAY_SIGNATURE_MISMATCH', status: 502 }
              );
            }

            if (
              precreateErr?.code === 'ACQ.ACCESS_FORBIDDEN' ||
              String(precreateErr?.message || '').includes('ACCESS_FORBIDDEN')
            ) {
              precreateDisabledUntil = Date.now() + 24 * 3600 * 1000;
            }
            console.warn('[alipayProvider] 当面付未开通或受限 (ACQ.ACCESS_FORBIDDEN)，快速切换为电脑网站支付收银台:', precreateErr?.code || precreateErr?.message);
          }
        }

        const pageBizContent = {
          out_trade_no: String(order.id),
          total_amount: totalAmountYuan,
          subject: subject.slice(0, 100),
          product_code: 'FAST_INSTANT_TRADE_PAY',
          qr_pay_mode: '4',
          qrcode_width: 174,
          timeout_express: '30m',
          passback_params: encodeURIComponent(JSON.stringify({ userId: user.id, planId: plan.id })),
        };
        const timestamp = new Date(Date.now() + 8 * 3600 * 1000).toISOString().replace('T', ' ').slice(0, 19);
        const systemParams = {
          app_id: appId,
          method: 'alipay.trade.page.pay',
          format: 'JSON',
          charset: 'utf-8',
          sign_type: 'RSA2',
          timestamp,
          version: '1.0',
          notify_url: notifyUrl || `${process.env.PUBLIC_APP_URL || 'https://www.Supdance.com'}/api/billing/webhooks/alipay`,
          return_url: `${process.env.PUBLIC_APP_URL || 'https://www.Supdance.com'}/studio?checkout=success&orderId=${order.id}`,
          biz_content: JSON.stringify(pageBizContent),
        };
        systemParams.sign = signAlipayParams(systemParams, privateKey);
        const query = new URLSearchParams(systemParams).toString();
        const cashierUrl = `${gateway}?${query}`;

        // 电脑网站支付 (FAST_INSTANT_TRADE_PAY) 毫秒级直签官方收银台
        // 无需服务端同步阻塞抓取，由用户浏览器在本地高速网络直连支付宝，实现零等待秒拉起
        return {
          id: order.id,
          qr_code: null,
          qr_img_url: null,
          url: cashierUrl,
          isPagePay: true,
        };
      });
    },

    /**
     * 主动查单：alipay.trade.query
     */
    async retrievePayment(orderId) {
      if (!isConfigured) {
        throw providerNotConfigured('retrievePayment');
      }

      return call('retrievePayment', async () => {
        const bizContent = {
          out_trade_no: String(orderId),
        };
        const res = await requestAlipayApi('alipay.trade.query', bizContent);
        // 买家尚未用手机扫码，支付宝侧尚未生成正式交易记录，属于正常待支付状态
        if (res?.sub_code === 'ACQ.TRADE_NOT_EXIST') {
          return {
            orderId: String(orderId),
            tradeStatus: 'WAIT_BUYER_PAY',
            paid: false,
            tradeNotFound: true,
          };
        }
        const isPaid = res.trade_status === 'TRADE_SUCCESS' || res.trade_status === 'TRADE_FINISHED';
        return {
          orderId: res.out_trade_no || String(orderId),
          transactionId: res.trade_no,
          tradeStatus: res.trade_status,
          paid: isPaid,
          amountTotal: Math.round(Number(res.total_amount || 0) * 100),
          buyerLogonId: res.buyer_logon_id,
          sendPayDate: res.send_pay_date,
        };
      });
    },

    /**
     * 取消/关闭订单：alipay.trade.close
     */
    async cancel(orderId) {
      if (!isConfigured) throw providerNotConfigured('cancel');
      return call('cancel', async () => {
        return await requestAlipayApi('alipay.trade.close', { out_trade_no: String(orderId) });
      });
    },

    /**
     * 申请退款：alipay.trade.refund
     */
    async refund({ outTradeNo, refundAmountYuan, reason = '正常退款' }) {
      if (!isConfigured) throw providerNotConfigured('refund');
      return call('refund', async () => {
        return await requestAlipayApi('alipay.trade.refund', {
          out_trade_no: String(outTradeNo),
          refund_amount: String(refundAmountYuan),
          refund_reason: reason,
        });
      });
    },

    /**
     * 验证支付宝异步通知签名
     */
    verifyWebhookSignature(params) {
      if (!params || !params.sign) {
        throw Object.assign(new Error('支付宝异步通知缺少签名字段'), { code: 'ALIPAY_WEBHOOK_MALFORMED', status: 400 });
      }
      if (!params.app_id) {
        throw Object.assign(new Error('支付宝异步通知缺少 app_id'), { code: 'ALIPAY_WEBHOOK_MALFORMED', status: 400 });
      }
      if (appId && params.app_id !== appId) {
        throw Object.assign(new Error('支付宝异步通知 app_id 与商户配置不一致'), { code: 'ALIPAY_WEBHOOK_APP_ID_MISMATCH', status: 401 });
      }
      const isValid = verifyAlipaySignature(params, publicKey);
      if (!isValid) {
        throw Object.assign(new Error('支付宝异步通知验签失败'), { code: 'ALIPAY_WEBHOOK_SIGNATURE_INVALID', status: 400 });
      }
      return params;
    },
  };

  return assertPaymentProvider(provider);
}

/**
 * 支付宝参数齐备性判定：appId + 私钥（下单签名）+ 公钥（异步通知验签）。
 */
const ALIPAY_CREDENTIAL_FIELDS = [
  ['appId', 'ALIPAY_APP_ID'],
  ['privateKey', 'ALIPAY_PRIVATE_KEY(_PATH)'],
  ['publicKey', 'ALIPAY_PUBLIC_KEY(_PATH)'],
];

export function alipayCredentialReadiness(values = {}) {
  const missing = ALIPAY_CREDENTIAL_FIELDS
    .filter(([key]) => !values[key])
    .map(([, envName]) => envName);
  return { usable: missing.length === 0, missing };
}

/**
 * 从支付宝收银台 HTML 中提取原生二维码 URL（https://qr.alipay.com/...）
 * 可在后台异步解析，用于从 iframe 丝滑平替为原生无损矢量 SVG
 */
export async function extractAlipayQrFromCashierUrl(cashierUrl) {
  if (!cashierUrl) return null;
  try {
    const res = await fetch(cashierUrl, {
      redirect: 'follow',
      signal: AbortSignal.timeout(6000),
    });
    if (!res.ok) return null;
    const html = await res.text();
    const match =
      html.match(/name="qrCode"\s+type="hidden"\s+value="([^"]+)"/i) ||
      html.match(/id="J_qrCode"\s+value="([^"]+)"/i) ||
      html.match(/value="([^"]+)"\s+id="J_qrCode"/i);
    return match ? match[1].trim() : null;
  } catch {
    return null;
  }
}

