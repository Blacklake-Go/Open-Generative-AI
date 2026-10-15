import { nowIso, queryOne, randomId } from '../db/index.js';

export async function findUserInTransaction(userId, transaction) {
  return transaction.queryOne('SELECT id FROM users WHERE id = $1', [userId]);
}

export async function lockOrderInTransaction(orderId, transaction) {
  return transaction.queryOne('SELECT * FROM orders WHERE id = $1 FOR UPDATE', [orderId]);
}

export async function lockOrderByProviderPaymentInTransaction(paymentId, transaction) {
  return transaction.queryOne('SELECT * FROM orders WHERE provider_payment_id = $1 OR provider_order_id = $1 FOR UPDATE', [paymentId]);
}

export async function recordPaymentSuccess({ eventId, order, userId, amountMinor, currency, providerPaymentId, payload, transaction, provider = null }) {
  const actualProvider = provider || order?.provider || 'stripe';
  return transaction.queryOne(`
    INSERT INTO payment_ledger
      (id, provider, event_id, order_id, user_id, entry_type, amount_minor, currency, provider_payment_id, idempotency_key, payload_json)
    VALUES ($1, $2, $3, $4, $5, 'payment_succeeded', $6, $7, $8, $9, $10::jsonb)
    ON CONFLICT DO NOTHING RETURNING id
  `, [randomId('pay'), actualProvider, eventId, order.id, userId, amountMinor, currency, providerPaymentId, `${actualProvider}:${eventId}:payment_succeeded`, JSON.stringify(payload || {})]);
}

export async function markOrderPaid({ orderId, providerOrderId, providerPaymentId, providerCustomerId, paidAmountMinor, payload, timestamp, transaction }) {
  return transaction.queryOne(`
    UPDATE orders
    SET status = CASE WHEN status = 'refunded' THEN status ELSE 'paid' END,
        provider_order_id = COALESCE(provider_order_id, $1), provider_payment_id = COALESCE($2, provider_payment_id),
        provider_customer_id = COALESCE($3, provider_customer_id), paid_amount_minor = COALESCE($4, paid_amount_minor),
        provider_payload_json = $5::jsonb, paid_at = COALESCE(paid_at, $6), updated_at = $6, version = version + 1
    WHERE id = $7
    RETURNING id, status
  `, [providerOrderId, providerPaymentId, providerCustomerId, paidAmountMinor, JSON.stringify(payload || {}), timestamp, orderId]);
}

export async function markOrderPaymentFailed({ orderId, providerPaymentId, failureCode, timestamp, transaction }) {
  return transaction.execute("UPDATE orders SET status = 'failed', failure_code = $1, provider_payment_id = COALESCE($2, provider_payment_id), updated_at = $3, version = version + 1 WHERE id = $4", [failureCode, providerPaymentId, timestamp, orderId]);
}

export async function recordPaymentRefund({ eventId, order, paymentIntentId, amountMinor, currency, payload, transaction, provider = null }) {
  const actualProvider = provider || order?.provider || 'stripe';
  return transaction.queryOne(`
    INSERT INTO payment_ledger
      (id, provider, event_id, order_id, user_id, entry_type, amount_minor, currency, provider_payment_id, idempotency_key, payload_json)
    VALUES ($1, $2, $3, $4, $5, 'payment_refund', $6, $7, $8, $9, $10::jsonb)
    ON CONFLICT (provider, event_id, entry_type) DO NOTHING RETURNING id
  `, [randomId('pay'), actualProvider, eventId, order.id, order.user_id, amountMinor, currency, paymentIntentId, `${actualProvider}:${eventId}:payment_refund`, JSON.stringify(payload || {})]);
}

export async function getPaymentRefundSummary({ orderId, refundId = null, transaction }) {
  return transaction.queryOne(`
    SELECT COALESCE(SUM(amount_minor), 0)::bigint AS refunded_amount_minor,
      COALESCE(BOOL_OR(payload_json->>'source' = 'charge_snapshot'), FALSE) AS has_charge_snapshot,
      COALESCE(BOOL_OR($2::text IS NOT NULL AND payload_json->>'refund_id' = $2), FALSE) AS has_refund_object
    FROM payment_ledger
    WHERE order_id = $1 AND entry_type = 'payment_refund'
  `, [orderId, refundId]);
}

export async function markOrderRefundedFromWebhook(orderId, timestamp, transaction) {
  return transaction.execute("UPDATE orders SET status = 'refunded', refunded_at = COALESCE(refunded_at, $1), updated_at = $1, version = version + 1 WHERE id = $2 AND status <> 'refunded'", [timestamp, orderId]);
}

export async function cancelPaymentSubscriptionForOrder({ orderId, userId, provider, timestamp, transaction }) {
  return transaction.queryOne(`
    UPDATE subscriptions SET status = 'canceled', updated_at = $1, version = version + 1
    WHERE user_id = $2 AND provider = $3 AND provider_subscription_id = $4
      AND status IN ('active', 'trialing', 'past_due')
    RETURNING id
  `, [timestamp, userId, provider, orderId]);
}

export async function syncStripeSubscription({ userId, providerCustomerId, providerSubscriptionId, planId, status, currentPeriodEnd, eventCreatedAt, transaction }) {
  const now = nowIso();
  return transaction.queryOne(`
    INSERT INTO subscriptions
      (id, user_id, provider, provider_customer_id, provider_subscription_id, plan_id, status, current_period_end, last_synced_at, last_provider_event_created_at, version, created_at, updated_at)
    VALUES ($1, $2, 'stripe', $3, $4, $5, $6, $7, $8, $9, 1, $8, $8)
    ON CONFLICT (provider, provider_subscription_id) DO UPDATE SET
      user_id = EXCLUDED.user_id, provider_customer_id = EXCLUDED.provider_customer_id,
      plan_id = EXCLUDED.plan_id, status = EXCLUDED.status, current_period_end = EXCLUDED.current_period_end,
      last_synced_at = EXCLUDED.last_synced_at, last_provider_event_created_at = EXCLUDED.last_provider_event_created_at,
      version = subscriptions.version + 1, updated_at = EXCLUDED.updated_at
    WHERE subscriptions.last_provider_event_created_at IS NULL
       OR (EXCLUDED.last_provider_event_created_at IS NOT NULL
           AND EXCLUDED.last_provider_event_created_at >= subscriptions.last_provider_event_created_at)
    RETURNING *
  `, [randomId('sub'), userId, providerCustomerId, providerSubscriptionId, planId, status, currentPeriodEnd, now, eventCreatedAt]);
}

export async function syncPaymentSubscription({ userId, provider, providerCustomerId, providerSubscriptionId, planId, billingCycle = 'monthly', status = 'active', currentPeriodEnd, eventCreatedAt, transaction }) {
  const now = nowIso();
  const normalizedCycle = ['yearly', 'quarterly', 'monthly'].includes(billingCycle) ? billingCycle : 'monthly';
  const existing = await transaction.queryOne(
    'SELECT id, current_period_end FROM subscriptions WHERE user_id = $1 AND provider = $2 ORDER BY updated_at DESC LIMIT 1 FOR UPDATE',
    [userId, provider]
  );
  if (existing) {
    return transaction.queryOne(`
      UPDATE subscriptions
      SET plan_id = $1, status = $2, current_period_end = $3,
          billing_cycle = $4,
          provider_customer_id = COALESCE($5, provider_customer_id),
          provider_subscription_id = COALESCE($6, provider_subscription_id),
          last_synced_at = $7, updated_at = $7, version = version + 1
      WHERE id = $8
      RETURNING *
    `, [planId, status, currentPeriodEnd, normalizedCycle, providerCustomerId, providerSubscriptionId, now, existing.id]);
  }

  return transaction.queryOne(`
    INSERT INTO subscriptions
      (id, user_id, provider, provider_customer_id, provider_subscription_id, plan_id, billing_cycle, status, current_period_end, last_synced_at, last_provider_event_created_at, version, created_at, updated_at)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, 1, $10, $10)
    RETURNING *
  `, [randomId('sub'), userId, provider, providerCustomerId, providerSubscriptionId, planId, normalizedCycle, status, currentPeriodEnd, now, eventCreatedAt || now]);
}


export async function claimWebhookEvent({ provider, eventId, eventType = null, eventCreatedAt = null, payload, headers, timestamp, transaction }) {
  return transaction.queryOne(`
    INSERT INTO webhook_events
      (provider, event_id, event_type, event_created_at, status, attempts, payload_json, headers_json, received_at, last_attempt_at, created_at)
    VALUES ($1, $2, $3, $4, 'received', 1, $5::jsonb, $6::jsonb, $7, $7, $7)
    ON CONFLICT (provider, event_id) DO NOTHING RETURNING event_id
  `, [provider, eventId, eventType, eventCreatedAt, JSON.stringify(payload ?? {}), headers ? JSON.stringify(headers) : null, timestamp]);
}

export async function recordRejectedWebhook({ provider, eventId, eventType = null, payload, headers, errorMessage, timestamp, transaction }) {
  return transaction.queryOne(`
    INSERT INTO webhook_events
      (provider, event_id, event_type, status, attempts, last_error, payload_json, headers_json, received_at, last_attempt_at, created_at)
    VALUES ($1, $2, $3, 'rejected', 1, $4, $5::jsonb, $6::jsonb, $7, $7, $7)
    ON CONFLICT (provider, event_id) DO UPDATE SET
      status = 'rejected', attempts = webhook_events.attempts + 1,
      last_error = EXCLUDED.last_error, last_attempt_at = EXCLUDED.last_attempt_at
    RETURNING event_id
  `, [provider, eventId, eventType, errorMessage, JSON.stringify(payload ?? {}), headers ? JSON.stringify(headers) : null, timestamp]);
}

export async function getWebhookEventForUpdate({ provider, eventId, transaction }) {
  return transaction.queryOne('SELECT status FROM webhook_events WHERE provider = $1 AND event_id = $2 FOR UPDATE', [provider, eventId]);
}

export async function markWebhookReceived({ provider, eventId, timestamp, transaction }) {
  return transaction.execute("UPDATE webhook_events SET status = 'received', attempts = attempts + 1, last_error = NULL, next_retry_at = NULL, last_attempt_at = $1 WHERE provider = $2 AND event_id = $3", [timestamp, provider, eventId]);
}

export async function markWebhookFailed({ provider, eventId, errorMessage, retryAt, transaction }) {
  return transaction.execute("UPDATE webhook_events SET status = 'failed', last_error = $1, next_retry_at = $2, attempts = attempts + 1, last_attempt_at = $2 WHERE provider = $3 AND event_id = $4", [errorMessage, retryAt, provider, eventId]);
}

export async function markWebhookProcessed({ provider, eventId, timestamp, transaction }) {
  return transaction.execute("UPDATE webhook_events SET status = 'processed', processed_at = COALESCE(processed_at, $1), last_error = NULL, next_retry_at = NULL, last_attempt_at = $1 WHERE provider = $2 AND event_id = $3", [timestamp, provider, eventId]);
}

export async function findWebhookEvent(eventId, provider = null) {
  return queryOne('SELECT * FROM webhook_events WHERE event_id = $1 AND ($2::text IS NULL OR provider = $2) ORDER BY created_at DESC LIMIT 1', [eventId, provider]);
}

export async function markWebhookReplay({ provider, eventId, status, replayedAt, lastError, transaction }) {
  return transaction.execute('UPDATE webhook_events SET status = $1, replayed_at = $2, last_error = $3 WHERE provider = $4 AND event_id = $5', [status, replayedAt, lastError, provider, eventId]);
}

export async function markWebhookFailedAfterRollback({ provider, eventId, errorCode, retryAt }) {
  return queryOne("UPDATE webhook_events SET status = 'failed', last_error = $1, next_retry_at = $2, attempts = attempts + 1, last_attempt_at = now() WHERE provider = $3 AND event_id = $4 RETURNING event_id", [errorCode, retryAt, provider, eventId]);
}
