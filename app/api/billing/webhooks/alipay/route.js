import crypto from 'node:crypto';
import { resolveAlipayProvider } from '@/lib/services/paymentService';
import { handleProviderPaymentWebhook, recordRejectedWebhookReceipt } from '@/lib/services/webhookDispatcher';

export const runtime = 'nodejs';

function parseNotify(rawText) {
  const params = {};
  for (const [key, value] of new URLSearchParams(rawText).entries()) {
    params[key] = value;
  }
  // URLSearchParams 会将 Base64 签名串中的 '+' 解析为空格，验签前必须还原
  if (params.sign) {
    params.sign = String(params.sign).replace(/ /g, '+');
  }
  return params;
}

// 通知原文可能带签名与厂商侧标识，落库审计只保留业务字段
function notifySummary(params) {
  return {
    app_id: params.app_id || null,
    out_trade_no: params.out_trade_no || null,
    trade_no: params.trade_no || null,
    trade_status: params.trade_status || null,
    total_amount: params.total_amount || null,
    refund_amount: params.refund_amount || null,
    receipt_amount: params.receipt_amount || null,
    seller_id: params.seller_id || null,
    sign_type: params.sign_type || null,
    charset: params.charset || null,
  };
}

function codeHeader(code) {
  return String(code || 'REJECTED').replace(/[^A-Za-z0-9_.:-]/g, '').slice(0, 60);
}

function fail(code) {
  return new Response('fail', {
    status: 400,
    headers: { 'Content-Type': 'text/plain', 'x-webhook-code': codeHeader(code) },
  });
}

function receiptHeaders(request) {
  return {
    'user-agent': request.headers.get('user-agent') || null,
    'x-forwarded-for': request.headers.get('x-forwarded-for') || null,
  };
}

export function validateAlipayNoticeRouting(params) {
  if (!params?.trade_status) {
    return { code: 'ALIPAY_WEBHOOK_TRADE_STATUS_MISSING', reason: '通知缺少 trade_status' };
  }
  if (!params?.out_trade_no) {
    return { code: 'ALIPAY_WEBHOOK_ORDER_ID_MISSING', reason: '通知缺少 out_trade_no' };
  }
  return null;
}

async function reject({ request, rawText, params, code, reason }) {
  const digest = crypto.createHash('sha256').update(String(rawText || '')).digest('hex').slice(0, 32);
  try {
    await recordRejectedWebhookReceipt({
      provider: 'alipay',
      eventId: `reject_${digest}`,
      eventType: 'alipay.notify_rejected',
      payload: { code, reason, notify: notifySummary(params) },
      headers: receiptHeaders(request),
      errorMessage: `${code}: ${reason}`,
    });
  } catch (error) {
    console.error('[webhook/alipay] 拒绝回执写入失败', { code: error.code || 'WEBHOOK_RECEIPT_WRITE_FAILED' });
  }
  console.warn('[webhook/alipay] 通知被拒绝', { code });
  return fail(code);
}

export async function POST(request) {
  let rawText = '';
  try {
    rawText = await request.text();
  } catch (error) {
    console.error('[webhook/alipay] 请求体读取失败', { code: error.code || 'BODY_UNREADABLE' });
    return fail('ALIPAY_WEBHOOK_UNREADABLE');
  }

  const params = parseNotify(rawText);
  if (!params.sign || !params.app_id) {
    return reject({ request, rawText, params, code: 'ALIPAY_WEBHOOK_MALFORMED', reason: '通知缺少 sign 或 app_id' });
  }

  let alipay;
  try {
    alipay = await resolveAlipayProvider();
  } catch (error) {
    console.error('[webhook/alipay/config]', { code: error.code || 'PROVIDER_RESOLVE_FAILED' });
    return new Response('fail', { status: 503, headers: { 'Content-Type': 'text/plain', 'x-webhook-code': 'ALIPAY_PROVIDER_NOT_CONFIGURED' } });
  }

  try {
    alipay.verifyWebhookSignature(params);
  } catch (error) {
    const code = error.code || 'ALIPAY_WEBHOOK_SIGNATURE_INVALID';
    if (code === 'ALIPAY_WEBHOOK_APP_ID_MISMATCH' || code === 'ALIPAY_WEBHOOK_MALFORMED') {
      return reject({ request, rawText, params, code, reason: '通知 app_id 与站点配置不一致或参数不完整' });
    }
    return reject({ request, rawText, params, code, reason: '异步通知验签失败' });
  }

  const routingError = validateAlipayNoticeRouting(params);
  if (routingError) {
    return reject({ request, rawText, params, ...routingError });
  }

  const tradeStatus = params.trade_status;
  const outTradeNo = params.out_trade_no;
  const isPaid = tradeStatus === 'TRADE_SUCCESS' || tradeStatus === 'TRADE_FINISHED';
  // TRADE_CLOSED 既可能是超时未付款关单，也可能是全额退款后关单；
  // 未入账的订单会在 dispatcher 内被识别为 refund_notice_not_paid，不动账本。
  const isClosed = tradeStatus === 'TRADE_CLOSED';
  // 关单通知与成功通知共用同一 trade_no，事件号必须区分，否则会被幂等留痕判为重复而丢失核销
  const eventId = `alipay_${params.trade_no || outTradeNo || crypto.createHash('sha256').update(rawText).digest('hex').slice(0, 32)}${isClosed ? '_closed' : ''}`;

  let receipt;
  try {
    receipt = await handleProviderPaymentWebhook({
      provider: 'alipay',
      eventId,
      eventType: `alipay.${String(tradeStatus || 'unknown').toLowerCase()}`,
      payment: isPaid && outTradeNo ? {
        out_trade_no: outTradeNo,
        trade_no: params.trade_no || null,
        amount_total: Math.round(Number(params.total_amount || 0) * 100),
        currency: 'CNY',
        raw: notifySummary(params),
      } : null,
      refund: isClosed && outTradeNo ? {
        out_trade_no: outTradeNo,
        trade_no: params.trade_no || null,
        refund_amount_minor: Math.round(Number(params.refund_amount || params.total_amount || 0) * 100),
        currency: 'CNY',
        raw: notifySummary(params),
      } : null,
      skipReason: `交易状态 ${tradeStatus} 无需履约`,
      headers: receiptHeaders(request),
    });
  } catch (error) {
    console.error('[webhook/alipay] 履约异常', { code: error.code || 'WEBHOOK_ERROR', eventId });
    return new Response('fail', { status: 500, headers: { 'Content-Type': 'text/plain', 'x-webhook-code': codeHeader(error.code || 'WEBHOOK_ERROR') } });
  }

  if (!receipt.success) {
    console.warn('[webhook/alipay] 履约未完成，交由厂商重试', { code: receipt.error || 'FULFILMENT_FAILED', eventId });
    return new Response('fail', { status: 500, headers: { 'Content-Type': 'text/plain', 'x-webhook-code': 'ALIPAY_WEBHOOK_FULFILMENT_PENDING' } });
  }

  return new Response('success', { status: 200, headers: { 'Content-Type': 'text/plain' } });
}
