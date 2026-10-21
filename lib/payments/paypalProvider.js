import { PaymentProviderError, assertPaymentProvider, normalizeProviderError } from './provider.js';

export const PAYPAL_CREDENTIAL_FIELDS = Object.freeze([
  ['clientId', 'PAYPAL_CLIENT_ID'],
  ['clientSecret', 'PAYPAL_CLIENT_SECRET'],
]);

export function paypalCredentialReadiness(values = {}) {
  const missing = PAYPAL_CREDENTIAL_FIELDS
    .filter(([key]) => !values[key])
    .map(([, envName]) => envName);
  return { usable: missing.length === 0, missing };
}

function providerNotConfigured(action) {
  return new PaymentProviderError('PayPal 支付尚未完成配置', {
    provider: 'paypal',
    action,
    code: 'PAYMENT_PROVIDER_NOT_CONFIGURED',
    status: 503,
  });
}

function resolveApiBaseUrl(mode) {
  return String(mode).toLowerCase() === 'sandbox'
    ? 'https://api-m.sandbox.paypal.com'
    : 'https://api-m.paypal.com';
}

export function createPaypalProvider({
  client = null,
  clientId = process.env.PAYPAL_CLIENT_ID,
  clientSecret = process.env.PAYPAL_CLIENT_SECRET,
  webhookId = process.env.PAYPAL_WEBHOOK_ID,
  mode = process.env.PAYPAL_MODE || (process.env.NODE_ENV === 'production' ? 'live' : 'sandbox'),
  onCall = null,
} = {}) {
  const readiness = paypalCredentialReadiness({ clientId, clientSecret });
  const isConfigured = Boolean(client || readiness.usable);
  const baseUrl = resolveApiBaseUrl(mode);

  let cachedToken = null;
  let tokenExpiresAt = 0;

  async function call(action, callback) {
    const startedAt = Date.now();
    try {
      const result = await callback();
      try { await onCall?.({ provider: 'paypal', action, status: 200, success: true, latencyMs: Date.now() - startedAt }); } catch {}
      return result;
    } catch (error) {
      const normalized = normalizeProviderError(error, { provider: 'paypal', action });
      try { await onCall?.({ provider: 'paypal', action, status: normalized.status || 500, success: false, latencyMs: Date.now() - startedAt, errorCode: normalized.code }); } catch {}
      throw normalized;
    }
  }

  async function getAccessToken() {
    if (!isConfigured) throw providerNotConfigured('getAccessToken');
    if (cachedToken && Date.now() < tokenExpiresAt - 60_000) {
      return cachedToken;
    }

    const auth = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
    const res = await fetch(`${baseUrl}/v1/oauth2/token`, {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${auth}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: 'grant_type=client_credentials',
      signal: AbortSignal.timeout(10_000),
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      throw new PaymentProviderError(`PayPal 认证授权失败 (HTTP ${res.status}): ${errText}`, {
        provider: 'paypal',
        action: 'getAccessToken',
        status: res.status,
      });
    }

    const data = await res.json();
    cachedToken = data.access_token;
    tokenExpiresAt = Date.now() + (Number(data.expires_in) || 3600) * 1000;
    return cachedToken;
  }

  async function requestApi(endpoint, { method = 'GET', body = null, headers = {} } = {}) {
    if (!isConfigured) throw providerNotConfigured(endpoint);
    const token = await getAccessToken();
    const reqHeaders = {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...headers,
    };

    const res = await fetch(`${baseUrl}${endpoint}`, {
      method,
      headers: reqHeaders,
      body: body ? (typeof body === 'string' ? body : JSON.stringify(body)) : undefined,
      signal: AbortSignal.timeout(15_000),
    });

    const resText = await res.text().catch(() => '');
    let resJson = null;
    try {
      resJson = resText ? JSON.parse(resText) : {};
    } catch {
      resJson = { raw: resText };
    }

    if (!res.ok) {
      const msg = resJson?.message || resJson?.error_description || `PayPal 请求失败 (HTTP ${res.status})`;
      throw new PaymentProviderError(msg, {
        provider: 'paypal',
        action: endpoint,
        status: res.status,
        code: resJson?.name || `HTTP_${res.status}`,
      });
    }

    return resJson;
  }

  const provider = {
    mode,
    clientId,
    webhookId,

    async createCheckout({
      order,
      user,
      plan,
      successUrl,
      cancelUrl,
      amountMinor = null,
      billingCycle = 'monthly',
      creditAmount = null,
      productType = 'subscription',
      periodDays = null,
    }) {
      return call('createCheckout', async () => {
        if (client?.createCheckout) {
          return client.createCheckout({ order, user, plan, successUrl, cancelUrl, amountMinor, billingCycle, creditAmount, productType, periodDays });
        }

        const normalizedProductType = ['subscription', 'credit_pack', 'exclusive_pack'].includes(String(productType))
          ? String(productType)
          : 'subscription';
        const isSubscription = normalizedProductType === 'subscription';
        const normalizedCycle = isSubscription
          ? (['monthly', 'quarterly', 'yearly'].includes(billingCycle) ? billingCycle : 'monthly')
          : 'one_time';

        const computedAmountMinor = Number(amountMinor || order?.amount_minor || 0);
        const amountUsd = (computedAmountMinor / 100).toFixed(2);

        const metadata = {
          user_id: user.id,
          order_id: order.id,
          plan_id: plan?.id || order.plan_id,
          product_type: normalizedProductType,
          billing_cycle: normalizedCycle,
          credit_amount: String(creditAmount || 0),
          ...(Number.isSafeInteger(Number(periodDays)) && Number(periodDays) > 0 ? { period_days: String(periodDays) } : {}),
        };

        const payload = {
          intent: 'CAPTURE',
          purchase_units: [
            {
              reference_id: String(order.id),
              description: `${plan?.name || 'SupDance Plan'} (${normalizedCycle})`,
              custom_id: JSON.stringify(metadata),
              amount: {
                currency_code: String(order.currency || 'USD').toUpperCase(),
                value: amountUsd,
              },
            },
          ],
          application_context: {
            brand_name: 'SupDance AI',
            landing_page: 'NO_PREFERENCE',
            user_action: 'PAY_NOW',
            return_url: successUrl,
            cancel_url: cancelUrl,
          },
        };

        const response = await requestApi('/v2/checkout/orders', {
          method: 'POST',
          body: payload,
          headers: {
            'PayPal-Request-Id': `checkout_${order.id}`,
          },
        });

        const approveLink = (response?.links || []).find((l) => l.rel === 'approve' || l.rel === 'payer-action');
        if (!approveLink?.href) {
          throw new PaymentProviderError('PayPal 未返回有效的支付审批链接', {
            provider: 'paypal',
            action: 'createCheckout',
            status: 502,
          });
        }

        return {
          id: response.id,
          url: approveLink.href,
          status: response.status,
        };
      });
    },

    async retrievePayment(providerOrderId) {
      return call('retrievePayment', async () => {
        if (client?.retrievePayment) {
          return client.retrievePayment(providerOrderId);
        }

        const data = await requestApi(`/v2/checkout/orders/${providerOrderId}`);
        const purchaseUnit = data?.purchase_units?.[0] || {};
        const capture = purchaseUnit?.payments?.captures?.[0];
        const status = data?.status;

        // 如果买家已批准但尚未捕获，主动发起 Capture
        if (status === 'APPROVED') {
          try {
            const captureRes = await requestApi(`/v2/checkout/orders/${providerOrderId}/capture`, {
              method: 'POST',
              headers: {
                'PayPal-Request-Id': `capture_${providerOrderId}`,
              },
            });
            const capturedItem = captureRes?.purchase_units?.[0]?.payments?.captures?.[0];
            const isPaid = captureRes?.status === 'COMPLETED' || capturedItem?.status === 'COMPLETED';
            return {
              id: providerOrderId,
              status: captureRes?.status,
              paid: isPaid,
              transactionId: capturedItem?.id || providerOrderId,
              amountTotal: Math.round(parseFloat(capturedItem?.amount?.value || purchaseUnit?.amount?.value || 0) * 100),
              currency: capturedItem?.amount?.currency_code || purchaseUnit?.amount?.currency_code || 'USD',
              raw: captureRes,
            };
          } catch (captureErr) {
            console.warn('[paypalProvider] capture order error:', captureErr.message);
          }
        }

        const isPaid = status === 'COMPLETED' || capture?.status === 'COMPLETED';
        return {
          id: providerOrderId,
          status,
          paid: isPaid,
          transactionId: capture?.id || providerOrderId,
          amountTotal: Math.round(parseFloat(capture?.amount?.value || purchaseUnit?.amount?.value || 0) * 100),
          currency: capture?.amount?.currency_code || purchaseUnit?.amount?.currency_code || 'USD',
          raw: data,
        };
      });
    },

    async capturePayment(providerOrderId) {
      return call('capturePayment', async () => {
        if (client?.capturePayment) {
          return client.capturePayment(providerOrderId);
        }
        return requestApi(`/v2/checkout/orders/${providerOrderId}/capture`, {
          method: 'POST',
          headers: {
            'PayPal-Request-Id': `capture_${providerOrderId}`,
          },
        });
      });
    },

    async cancel(providerOrderId) {
      return call('cancel', async () => {
        if (client?.cancel) {
          return client.cancel(providerOrderId);
        }
        return { id: providerOrderId, status: 'canceled' };
      });
    },

    async refund({ paymentIntentId, captureId, amountMinor, currency = 'USD', reason = null, idempotencyKey = null }) {
      return call('refund', async () => {
        if (client?.refund) {
          return client.refund({ paymentIntentId, captureId, amountMinor, currency, reason, idempotencyKey });
        }

        const targetCaptureId = captureId || paymentIntentId;
        if (!targetCaptureId) {
          throw new PaymentProviderError('PayPal 退款缺少 Capture 标识', {
            provider: 'paypal',
            action: 'refund',
            status: 400,
          });
        }

        const payload = {
          note_to_payer: reason || '退款申请',
          ...(Number(amountMinor) > 0 ? {
            amount: {
              value: (Number(amountMinor) / 100).toFixed(2),
              currency_code: String(currency || 'USD').toUpperCase(),
            },
          } : {}),
        };

        const response = await requestApi(`/v2/payments/captures/${targetCaptureId}/refund`, {
          method: 'POST',
          body: payload,
          headers: {
            'PayPal-Request-Id': idempotencyKey || `refund_${targetCaptureId}_${Date.now()}`,
          },
        });

        return {
          id: response.id,
          status: response.status || 'COMPLETED',
          raw: response,
        };
      });
    },

    async verifyWebhookSignature(rawBody, headers = {}, targetWebhookId = webhookId) {
      if (client?.verifyWebhookSignature) {
        return client.verifyWebhookSignature(rawBody, headers, targetWebhookId);
      }
      if (!isConfigured) return false;

      const activeWebhookId = targetWebhookId || webhookId;
      if (!activeWebhookId) {
        console.warn('[paypalProvider] 未配置 PAYPAL_WEBHOOK_ID，无法调用官方验签端点');
        return false;
      }

      try {
        const eventBody = typeof rawBody === 'string' ? JSON.parse(rawBody) : rawBody;
        const normalizedHeaders = {};
        for (const [k, v] of Object.entries(headers)) {
          normalizedHeaders[k.toLowerCase()] = v;
        }

        const authAlgo = normalizedHeaders['paypal-auth-algo'];
        const certUrl = normalizedHeaders['paypal-cert-url'];
        const transmissionId = normalizedHeaders['paypal-transmission-id'];
        const transmissionSig = normalizedHeaders['paypal-transmission-sig'];
        const transmissionTime = normalizedHeaders['paypal-transmission-time'];

        if (!authAlgo || !certUrl || !transmissionId || !transmissionSig || !transmissionTime) {
          return false;
        }

        const verificationPayload = {
          auth_algo: authAlgo,
          cert_url: certUrl,
          transmission_id: transmissionId,
          transmission_sig: transmissionSig,
          transmission_time: transmissionTime,
          webhook_id: activeWebhookId,
          webhook_event: eventBody,
        };

        const res = await requestApi('/v1/notifications/verify-webhook-signature', {
          method: 'POST',
          body: verificationPayload,
        });

        return res?.verification_status === 'SUCCESS';
      } catch (err) {
        console.error('[paypalProvider] webhook signature verify failed:', err.message);
        return false;
      }
    },
  };

  return assertPaymentProvider(provider);
}

export function getPaypalProvider(options = {}) {
  return createPaypalProvider(options);
}
