import crypto from 'node:crypto';
import { NextResponse } from 'next/server';
import { getWechatProvider } from '@/lib/payments/wechatProvider';
import { handleProviderPaymentWebhook, recordRejectedWebhookReceipt } from '@/lib/services/webhookDispatcher';
import { getProviderSecret } from '@/lib/application/dataAccess.js';

export const runtime = 'nodejs';

function codeHeader(code) {
  return String(code || 'REJECTED').replace(/[^A-Za-z0-9_.:-]/g, '').slice(0, 60);
}

function fail(code, status) {
  return NextResponse.json(
    { code: 'FAIL', error: codeHeader(code) },
    { status, headers: { 'x-webhook-code': codeHeader(code) } },
  );
}

function requestHeaders(request) {
  return {
    'wechatpay-signature': request.headers.get('wechatpay-signature') || '',
    'wechatpay-timestamp': request.headers.get('wechatpay-timestamp') || '',
    'wechatpay-nonce': request.headers.get('wechatpay-nonce') || '',
    'wechatpay-serial': request.headers.get('wechatpay-serial') || '',
    'user-agent': request.headers.get('user-agent') || null,
    'x-forwarded-for': request.headers.get('x-forwarded-for') || null,
  };
}

function notifyDigest(rawBody) {
  return `wx_${crypto.createHash('sha256').update(String(rawBody || '')).digest('hex').slice(0, 32)}`;
}

async function reject({ request, rawBody, headers, code, reason }) {
  try {
    await recordRejectedWebhookReceipt({
      provider: 'wechat',
      eventId: notifyDigest(rawBody).replace('wx_', 'reject_'),
      eventType: 'wechatpay.notify_rejected',
      payload: { code, reason, body: String(rawBody || '').slice(0, 2000) },
      headers,
      errorMessage: `${code}: ${reason}`,
    });
  } catch (error) {
    console.error('[webhook/wechat] 拒绝回执写入失败', { code: error.code || 'WEBHOOK_RECEIPT_WRITE_FAILED' });
  }
  console.warn('[webhook/wechat] 通知被拒绝', { code });
  return fail(code, 400);
}

export async function POST(request) {
  const headers = requestHeaders(request);
  let rawBody = '';
  try {
    rawBody = await request.text();
  } catch (error) {
    console.error('[webhook/wechat] 请求体读取失败', { code: error.code || 'BODY_UNREADABLE' });
    return fail('WECHAT_WEBHOOK_UNREADABLE', 400);
  }

  if (!headers['wechatpay-signature'] || !headers['wechatpay-timestamp'] || !headers['wechatpay-nonce']) {
    return reject({ request, rawBody, headers, code: 'WECHAT_WEBHOOK_MALFORMED', reason: '缺少签名头部' });
  }

  let wechat;
  try {
    const apiV3Key = process.env.WECHAT_API_V3_KEY || (await getProviderSecret('wechat', 'api_v3_key'));
    const publicKey = process.env.WECHAT_PUBLIC_KEY || (await getProviderSecret('wechat', 'public_key'));
    wechat = getWechatProvider({ apiV3Key: apiV3Key || undefined, publicKey: publicKey || undefined });
  } catch (error) {
    console.error('[webhook/wechat/config]', { code: error.code || 'PROVIDER_RESOLVE_FAILED' });
    return fail('WECHAT_PROVIDER_NOT_CONFIGURED', 503);
  }

  let decrypted;
  try {
    decrypted = wechat.verifyWebhookSignature(rawBody, headers);
  } catch (error) {
    return reject({ request, rawBody, headers, code: error.code || 'WECHAT_WEBHOOK_SIGNATURE_INVALID', reason: '通知验签失败' });
  }

  const outTradeNo = decrypted?.out_trade_no || null;
  const transactionId = decrypted?.transaction_id || null;
  const configuredMchId = process.env.WECHAT_MCH_ID || (await getProviderSecret('wechat', 'mch_id'));
  if (configuredMchId && decrypted?.mchid && String(configuredMchId) !== String(decrypted.mchid)) {
    return reject({ request, rawBody, headers, code: 'WECHAT_WEBHOOK_MCH_ID_MISMATCH', reason: '通知商户号与配置不一致' });
  }

  const isRefundNotice = String(decrypted?.event_type || '').startsWith('REFUND.');
  // 退款异常/关闭（ABNORMAL、CLOSED）表示钱没退出去，不能核销积分
  const isRefunded = isRefundNotice && decrypted?.refund_status === 'SUCCESS' && Boolean(outTradeNo);
  const isPaid = !isRefundNotice && Boolean(outTradeNo) && decrypted?.trade_state === 'SUCCESS';
  // 退款通知与原支付通知共用 transaction_id，事件号必须区分，否则会被幂等留痕判为重复
  const eventId = isRefunded
    ? `wx_${decrypted?.refund_id || transactionId || outTradeNo}_refund`
    : `wx_${transactionId || outTradeNo || notifyDigest(rawBody).slice(3)}`;

  let receipt;
  try {
    receipt = await handleProviderPaymentWebhook({
      provider: 'wechat',
      eventId,
      eventType: decrypted?.event_type || 'wechatpay.transaction',
      payment: isPaid ? {
        out_trade_no: outTradeNo,
        transaction_id: transactionId,
        amount_total: Number(decrypted?.amount?.total || 0),
        currency: decrypted?.amount?.currency || 'CNY',
        raw: { out_trade_no: outTradeNo, transaction_id: transactionId, trade_state: decrypted?.trade_state, mchid: decrypted?.mchid || null, amount: decrypted?.amount || null, payer: decrypted?.payer || null },
      } : null,
      refund: isRefunded ? {
        out_trade_no: outTradeNo,
        transaction_id: transactionId,
        refund_id: decrypted?.refund_id || null,
        refund_amount_minor: Number(decrypted?.amount?.refund || 0),
        currency: decrypted?.amount?.refund_currency || decrypted?.amount?.currency || 'CNY',
        raw: { out_trade_no: outTradeNo, transaction_id: transactionId, out_refund_no: decrypted?.out_refund_no || null, refund_id: decrypted?.refund_id || null, refund_status: decrypted?.refund_status || null, amount: decrypted?.amount || null },
      } : null,
      skipReason: isPaid
        ? null
        : (isRefundNotice
          ? `退款通知状态 ${decrypted?.refund_status || '未知'} 无需核销`
          : `交易状态 ${decrypted?.trade_state || decrypted?.event_type || '未知'} 无需履约`),
      headers,
    });
  } catch (error) {
    console.error('[webhook/wechat] 履约异常', { code: error.code || 'WEBHOOK_ERROR', eventId });
    return fail(error.code || 'WEBHOOK_ERROR', 500);
  }

  if (!receipt.success) {
    console.warn('[webhook/wechat] 履约未完成，交由厂商重试', { code: receipt.error || 'FULFILMENT_FAILED', eventId });
    return fail('WECHAT_WEBHOOK_FULFILMENT_PENDING', 500);
  }

  return NextResponse.json({ code: 'SUCCESS', message: '成功' }, { status: 200 });
}
