import crypto from 'node:crypto';
import { resolvePaypalProvider } from '@/lib/payments/providerCredentials.js';
import { handleProviderPaymentWebhook, recordRejectedWebhookReceipt } from '@/lib/services/webhookDispatcher.js';

export const runtime = 'nodejs';

function codeHeader(code) {
  return String(code || 'REJECTED').replace(/[^A-Za-z0-9_.:-]/g, '').slice(0, 60);
}

function fail(code, status = 400) {
  return new Response(JSON.stringify({ error: code }), {
    status,
    headers: { 'Content-Type': 'application/json', 'x-webhook-code': codeHeader(code) },
  });
}

function receiptHeaders(request) {
  const headers = {};
  for (const [key, value] of request.headers.entries()) {
    if (key.startsWith('paypal-') || key === 'user-agent' || key === 'x-forwarded-for') {
      headers[key] = value;
    }
  }
  return headers;
}

function extractMetadata(resource) {
  const customId = resource?.custom_id || resource?.purchase_units?.[0]?.custom_id;
  if (!customId) return {};
  try {
    return JSON.parse(customId);
  } catch {
    return { raw_custom_id: customId };
  }
}

function extractOrderId(resource, metadata) {
  return metadata?.order_id
    || resource?.purchase_units?.[0]?.reference_id
    || resource?.supplementary_data?.related_ids?.order_id
    || resource?.invoice_id
    || null;
}

export async function POST(request) {
  let rawBody = '';
  try {
    rawBody = await request.text();
  } catch (error) {
    console.error('[webhook/paypal] 请求体读取失败', { code: error.code || 'BODY_UNREADABLE' });
    return fail('PAYPAL_WEBHOOK_UNREADABLE', 400);
  }

  let event = null;
  try {
    event = JSON.parse(rawBody);
  } catch {
    return fail('PAYPAL_WEBHOOK_MALFORMED', 400);
  }

  const eventId = event?.id || `pp_${crypto.createHash('sha256').update(rawBody).digest('hex').slice(0, 24)}`;
  const eventType = String(event?.event_type || 'unknown').toUpperCase();
  const headers = receiptHeaders(request);

  let paypal;
  try {
    paypal = await resolvePaypalProvider();
  } catch (error) {
    console.error('[webhook/paypal/config]', { code: error.code || 'PROVIDER_RESOLVE_FAILED' });
    return fail('PAYPAL_PROVIDER_NOT_CONFIGURED', 503);
  }

  // 验签（若已配置 WEBHOOK_ID 则强制验签）
  if (paypal.webhookId || process.env.PAYPAL_WEBHOOK_ID) {
    const verified = await paypal.verifyWebhookSignature(rawBody, headers);
    if (!verified) {
      console.warn('[webhook/paypal] 签名验证未通过', { eventId, eventType });
      try {
        await recordRejectedWebhookReceipt({
          provider: 'paypal',
          eventId: `reject_${eventId}`,
          eventType: `paypal.${eventType.toLowerCase()}`,
          payload: { eventId, eventType, summary: event?.summary },
          headers,
          errorMessage: 'PAYPAL_WEBHOOK_SIGNATURE_INVALID: 签名验证失败',
        });
      } catch {}
      return fail('PAYPAL_WEBHOOK_SIGNATURE_INVALID', 400);
    }
  }

  const resource = event?.resource || {};
  const metadata = extractMetadata(resource);
  const outTradeNo = extractOrderId(resource, metadata);

  const isCaptureCompleted = eventType === 'PAYMENT.CAPTURE.COMPLETED';
  const isOrderApproved = eventType === 'CHECKOUT.ORDER.APPROVED';
  const isRefunded = eventType === 'PAYMENT.CAPTURE.REFUNDED' || eventType === 'PAYMENT.CAPTURE.REVERSED';

  let payment = null;
  let refund = null;
  let skipReason = null;

  if (isCaptureCompleted && outTradeNo) {
    const amountVal = parseFloat(resource?.amount?.value || 0);
    payment = {
      out_trade_no: outTradeNo,
      transaction_id: resource.id,
      amount_total: Math.round(amountVal * 100),
      currency: resource?.amount?.currency_code || 'USD',
      raw: { id: resource.id, status: resource.status, create_time: resource.create_time },
    };
  } else if (isOrderApproved && outTradeNo) {
    // 买家在 PayPal 审批了订单，主动执行 Capture
    try {
      const captureResult = await paypal.capturePayment(resource.id);
      const capturedItem = captureResult?.purchase_units?.[0]?.payments?.captures?.[0];
      const amountVal = parseFloat(capturedItem?.amount?.value || resource?.purchase_units?.[0]?.amount?.value || 0);
      if (captureResult?.status === 'COMPLETED' || capturedItem?.status === 'COMPLETED') {
        payment = {
          out_trade_no: outTradeNo,
          transaction_id: capturedItem?.id || resource.id,
          amount_total: Math.round(amountVal * 100),
          currency: capturedItem?.amount?.currency_code || 'USD',
          raw: captureResult,
        };
      } else {
        skipReason = `订单已批准但 Capture 状态为 ${captureResult?.status}`;
      }
    } catch (captureErr) {
      console.warn('[webhook/paypal] Capture 触发失败:', captureErr.message);
      skipReason = `Capture 触发失败: ${captureErr.message}`;
    }
  } else if (isRefunded && outTradeNo) {
    const refundVal = parseFloat(resource?.amount?.value || 0);
    refund = {
      out_trade_no: outTradeNo,
      transaction_id: resource.id,
      refund_amount_minor: Math.round(refundVal * 100),
      currency: resource?.amount?.currency_code || 'USD',
      raw: { id: resource.id, status: resource.status },
    };
  } else {
    skipReason = !outTradeNo
      ? '通知缺少 out_trade_no，无法定位平台订单'
      : `事件类型 ${eventType} 无需直接履约`;
  }

  let receipt;
  try {
    receipt = await handleProviderPaymentWebhook({
      provider: 'paypal',
      eventId,
      eventType: `paypal.${eventType.toLowerCase()}`,
      payment,
      refund,
      skipReason,
      headers,
    });
  } catch (error) {
    console.error('[webhook/paypal] 履约异常', { code: error.code || 'WEBHOOK_ERROR', eventId });
    return fail(error.code || 'WEBHOOK_ERROR', 500);
  }

  if (!receipt.success) {
    console.warn('[webhook/paypal] 履约未完成，等待重试', { code: receipt.error || 'FULFILMENT_FAILED', eventId });
    return fail('PAYPAL_WEBHOOK_FULFILMENT_PENDING', 500);
  }

  return new Response(JSON.stringify({ status: 'success' }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}
