import fs from 'node:fs/promises';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { closePgPool, queryOne, withTransaction } from '../lib/db/index.js';
import { getOrderProductType } from '../lib/payments/planFulfillment.js';
import { transferPaymentCreditsToSubscription } from '../lib/financial/creditService.js';

const execFileAsync = promisify(execFile);
const __filename = fileURLToPath(import.meta.url);
const PERPETUAL = 'PERPETUAL';
const SUBSCRIPTION = 'SUBSCRIPTION';

function parseArgs(argv) {
  const options = { apply: false, orderId: null, webBackup: null, databaseBackup: null, confirmedDatabase: null };
  for (const argument of argv) {
    if (argument === '--apply') options.apply = true;
    else if (argument.startsWith('--order=')) options.orderId = argument.slice('--order='.length).trim();
    else if (argument.startsWith('--web-backup=')) options.webBackup = argument.slice('--web-backup='.length).trim();
    else if (argument.startsWith('--database-backup=')) options.databaseBackup = argument.slice('--database-backup='.length).trim();
    else if (argument.startsWith('--confirm-database=')) options.confirmedDatabase = argument.slice('--confirm-database='.length).trim();
    else if (argument === '--help') options.help = true;
    else throw Object.assign(new Error('Unknown argument'), { code: 'ARGUMENT_INVALID' });
  }
  return options;
}

export function analyzeLegacySubscriptionCreditLedger({
  order,
  productType,
  grantRows = [],
  perpetualRows = [],
  wallet,
  paymentSuccessCount = 0,
  paymentRefundCount = 0,
  creditRefundCount = 0,
  priorTransferCount = 0,
  pendingObligationCount = 0,
  activeSubscription = null,
  activeReservationCount = 0,
  now = new Date(),
}) {
  const blockers = [];
  const block = (code) => { if (!blockers.includes(code)) blockers.push(code); };
  const orderId = String(order?.id || '');

  if (!order) block('ORDER_NOT_FOUND');
  if (String(order?.status || '').toLowerCase() !== 'paid') block('ORDER_NOT_PAID');
  if (productType !== 'subscription') block('ORDER_NOT_SUBSCRIPTION');
  if (!['monthly', 'quarterly', 'yearly'].includes(String(order?.billing_cycle || '').toLowerCase())) {
    block('BILLING_CYCLE_UNSUPPORTED');
  }
  if (paymentSuccessCount !== 1) block('PAYMENT_SUCCESS_LEDGER_MISMATCH');
  if (paymentRefundCount > 0 || creditRefundCount > 0) block('ORDER_ALREADY_REFUNDED');
  if (priorTransferCount > 0) block('ORDER_ALREADY_TRANSFERRED');
  if (pendingObligationCount > 0) block('REFUND_OBLIGATION_PENDING');
  if (!wallet) block('CREDIT_WALLET_NOT_FOUND');
  if (activeReservationCount > 0 || Number(wallet?.frozen_credits || 0) > 0) block('CREDITS_CURRENTLY_RESERVED');

  const currentTime = new Date(now).getTime();
  const expiresAt = activeSubscription?.current_period_end
    ? new Date(activeSubscription.current_period_end)
    : null;
  if (!activeSubscription || String(activeSubscription.status || '').toLowerCase() !== 'active'
    || !expiresAt || Number.isNaN(expiresAt.getTime()) || expiresAt.getTime() <= currentTime) {
    block('ACTIVE_SUBSCRIPTION_NOT_FOUND');
  }

  const walletSubscriptionExpiry = wallet?.subscription_expires_at
    ? new Date(wallet.subscription_expires_at).getTime()
    : null;
  const currentSubscriptionBalance = walletSubscriptionExpiry && walletSubscriptionExpiry <= currentTime
    ? 0
    : Number(wallet?.subscription_credits || 0);
  if (currentSubscriptionBalance > 0) block('SUBSCRIPTION_BUCKET_NOT_EMPTY');

  if (grantRows.length !== 1) block('ORDER_GRANT_COUNT_MISMATCH');
  const grant = grantRows[0] || null;
  const grantAmount = Number(grant?.delta || 0);
  if (String(grant?.bucket_type || '').toUpperCase() !== PERPETUAL
    || !Number.isSafeInteger(grantAmount) || grantAmount <= 0) {
    block('ORDER_GRANT_NOT_PERPETUAL');
  }
  if (grant && String(grant.reference_id || '') !== orderId) block('ORDER_GRANT_REFERENCE_MISMATCH');

  const sortedRows = [...perpetualRows].sort((a, b) => {
    const timeDiff = new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
    return timeDiff || String(a.id || '').localeCompare(String(b.id || ''));
  });
  const grantIndex = sortedRows.findIndex((row) => row.id === grant?.id);
  if (grantIndex < 0) block('ORDER_GRANT_NOT_IN_PERPETUAL_LEDGER');
  if (grantIndex >= 0 && sortedRows.slice(0, grantIndex).some((row) => Number(row.delta) !== 0)) {
    block('OLDER_PERPETUAL_ACTIVITY_UNATTRIBUTED');
  }

  let activityBeforeLaterGrant = 0;
  let laterPerpetualGrants = 0;
  let crossedLaterGrant = false;
  if (grantIndex >= 0) {
    for (const row of sortedRows.slice(grantIndex + 1)) {
      const delta = Number(row.delta || 0);
      const action = String(row.action_type || '').toUpperCase();
      const isOtherGrant = action === 'CREDIT_GRANT' && delta > 0 && String(row.reference_id || '') !== orderId;
      if (isOtherGrant) {
        crossedLaterGrant = true;
        laterPerpetualGrants += delta;
        continue;
      }
      if (['TASK_RESERVE', 'TASK_RELEASE'].includes(action) && !crossedLaterGrant) {
        activityBeforeLaterGrant += delta;
        continue;
      }
      if (action === 'TASK_COMMIT' && delta === 0) continue;
      block(crossedLaterGrant ? 'PERPETUAL_ACTIVITY_AFTER_LATER_GRANT' : 'PERPETUAL_ACTIVITY_UNSUPPORTED');
    }
  }

  const transferAmount = grantAmount + activityBeforeLaterGrant;
  if (!Number.isSafeInteger(transferAmount) || transferAmount <= 0 || transferAmount > grantAmount) {
    block('REMAINING_ORDER_GRANT_INVALID');
  }
  if (wallet && Number(wallet.perpetual_credits || 0) !== transferAmount + laterPerpetualGrants) {
    block('PERPETUAL_WALLET_LEDGER_MISMATCH');
  }
  const perpetualLedgerTotal = sortedRows.reduce((sum, row) => sum + Number(row.delta || 0), 0);
  if (wallet && perpetualLedgerTotal !== Number(wallet.perpetual_credits || 0)) {
    block('PERPETUAL_LEDGER_WALLET_MISMATCH');
  }

  return {
    eligible: blockers.length === 0,
    blockers,
    transferAmount: blockers.length === 0 ? transferAmount : null,
    originalGrantAmount: grantAmount || null,
    consumedBeforeMigration: Number.isSafeInteger(grantAmount - transferAmount) ? grantAmount - transferAmount : null,
    preservedLaterPerpetualCredits: laterPerpetualGrants,
    perpetualAfter: wallet && blockers.length === 0 ? Number(wallet.perpetual_credits) - transferAmount : null,
    subscriptionAfter: blockers.length === 0 ? transferAmount : null,
    expiresAt: expiresAt && !Number.isNaN(expiresAt.getTime()) ? expiresAt.toISOString() : null,
  };
}

async function inspectOrder(tx, orderId, { lock = false } = {}) {
  const lockClause = lock ? ' FOR UPDATE' : '';
  const order = await tx.queryOne(`
    SELECT id, user_id, plan_id, status, billing_cycle, metadata_json
    FROM orders WHERE id = $1${lockClause}
  `, [orderId]);
  if (!order) return { order: null, plan: analyzeLegacySubscriptionCreditLedger({ order: null }) };

  let productType = null;
  try { productType = getOrderProductType(order); }
  catch { productType = 'invalid'; }
  // Match the production settlement lock order: order/subscription/wallet.
  // In particular, lock the wallet before reading the reservation count or
  // ledger timeline so a generation reserve cannot slip between preflight and
  // the transfer.
  const subscription = await tx.queryOne(`
    SELECT plan_id, status, current_period_end
    FROM subscriptions
    WHERE user_id = $1 AND plan_id = $2 AND status = 'active' AND current_period_end > now()
    ORDER BY current_period_end DESC LIMIT 1${lock ? ' FOR UPDATE' : ''}
  `, [order.user_id, order.plan_id]);
  const wallet = await tx.queryOne(`
    SELECT daily_free_credits, daily_expires_at, subscription_credits, subscription_expires_at,
      perpetual_credits, frozen_credits
    FROM credit_wallets WHERE user_id = $1${lock ? ' FOR UPDATE' : ''}
  `, [order.user_id]);
  const payment = await tx.queryOne(`
    SELECT COUNT(*) FILTER (WHERE entry_type = 'payment_succeeded')::integer AS success_count,
      COUNT(*) FILTER (WHERE entry_type = 'payment_refund')::integer AS refund_count
    FROM payment_ledger WHERE order_id = $1
  `, [orderId]);
  const grantRows = await tx.queryMany(`
    SELECT id, bucket_type, delta, reference_id, created_at
    FROM credit_ledger_v2
    WHERE user_id = $1 AND reference_id = $2 AND action_type = 'CREDIT_GRANT' AND delta > 0
    ORDER BY created_at, id
  `, [order.user_id, orderId]);
  const perpetualRows = await tx.queryMany(`
    SELECT id, bucket_type, delta, action_type, reference_id, created_at
    FROM credit_ledger_v2 WHERE user_id = $1 AND bucket_type = 'PERPETUAL'
    ORDER BY created_at, id
  `, [order.user_id]);
  const creditCounts = await tx.queryOne(`
    SELECT COUNT(*) FILTER (WHERE action_type = 'PAYMENT_REFUND')::integer AS refund_count,
      COUNT(*) FILTER (WHERE action_type = 'CREDIT_TRANSFER')::integer AS transfer_count
    FROM credit_ledger_v2 WHERE user_id = $1 AND reference_id = $2
  `, [order.user_id, orderId]);
  const reservation = await tx.queryOne(`
    SELECT COUNT(*)::integer AS entry_count
    FROM credit_reservations WHERE user_id = $1 AND status = 'RESERVED'
  `, [order.user_id]);
  const obligation = await tx.queryOne(`
    SELECT COUNT(*)::integer AS entry_count
    FROM credit_refund_obligations WHERE user_id = $1 AND reference_id = $2 AND status = 'PENDING'
  `, [order.user_id, orderId]);

  return {
    order,
    plan: analyzeLegacySubscriptionCreditLedger({
      order,
      productType,
      grantRows,
      perpetualRows,
      wallet,
      paymentSuccessCount: Number(payment?.success_count || 0),
      paymentRefundCount: Number(payment?.refund_count || 0),
      creditRefundCount: Number(creditCounts?.refund_count || 0),
      priorTransferCount: Number(creditCounts?.transfer_count || 0),
      pendingObligationCount: Number(obligation?.entry_count || 0),
      activeSubscription: subscription,
      activeReservationCount: Number(reservation?.entry_count || 0),
    }),
  };
}

async function requireFreshPrivateFile(filePath, label) {
  if (!path.isAbsolute(filePath)) throw Object.assign(new Error(`${label} path must be absolute`), { code: 'BACKUP_PATH_INVALID' });
  const stat = await fs.stat(filePath);
  if (!stat.isFile() || stat.size <= 0 || (stat.mode & 0o077) !== 0) {
    throw Object.assign(new Error(`${label} must be a non-empty private regular file`), { code: 'BACKUP_FILE_INVALID' });
  }
  if (Date.now() - stat.mtimeMs > 2 * 60 * 60 * 1000) {
    throw Object.assign(new Error(`${label} is older than two hours`), { code: 'BACKUP_STALE' });
  }
  return stat;
}

async function verifyBackups(options) {
  if (!options.webBackup || !options.databaseBackup) {
    throw Object.assign(new Error('Apply requires both current Web and PostgreSQL backups'), { code: 'BACKUP_REQUIRED' });
  }
  await requireFreshPrivateFile(options.webBackup, 'Web backup');
  await requireFreshPrivateFile(options.databaseBackup, 'Database backup');
  const { stdout: webEntries } = await execFileAsync('tar', ['-tf', options.webBackup], { maxBuffer: 16 * 1024 * 1024 });
  const normalizedEntries = webEntries.split(/\r?\n/).map((entry) => entry.replace(/^\.\//, '').replace(/\/$/, ''));
  for (const expected of ['.next/BUILD_ID', 'lib/financial/creditService.js', 'lib/payments/planFulfillment.js']) {
    if (!normalizedEntries.includes(expected)) {
      throw Object.assign(new Error('Web backup is missing a required restore path'), { code: 'WEB_BACKUP_INCOMPLETE' });
    }
  }
  const { stdout: databaseEntries } = await execFileAsync('pg_restore', ['--list', options.databaseBackup], { maxBuffer: 16 * 1024 * 1024 });
  if (!databaseEntries.includes('credit_ledger_v2') || !databaseEntries.includes('orders')) {
    throw Object.assign(new Error('Database backup is missing required billing tables'), { code: 'DATABASE_BACKUP_INCOMPLETE' });
  }
}

function printHelp() {
  console.log('Usage: node scripts/reconcile-subscription-credit-bucket.mjs --order=<order-id> [--apply --confirm-database=supdance_ai --web-backup=<private-tar> --database-backup=<private-pg-dump>]');
  console.log('Without --apply, this command only performs a read-only dry run.');
}

async function verifyTransferLedger(tx, userId, orderId, migrationKey, expectedAmount) {
  const rows = await tx.queryMany(`
    SELECT user_id, reference_id, bucket_type, delta, idempotency_key
    FROM credit_ledger_v2
    WHERE user_id = $1 AND reference_id = $2 AND action_type = 'CREDIT_TRANSFER'
    ORDER BY id
    FOR UPDATE
  `, [userId, orderId]);
  const out = rows.find((row) => row.idempotency_key === `${migrationKey}:out`);
  const incoming = rows.find((row) => row.idempotency_key === `${migrationKey}:in`);
  if (rows.length !== 2 || !out || !incoming
    || out.user_id !== userId || incoming.user_id !== userId
    || out.reference_id !== orderId || incoming.reference_id !== orderId
    || String(out.bucket_type).toUpperCase() !== PERPETUAL
    || String(incoming.bucket_type).toUpperCase() !== SUBSCRIPTION
    || Number(out.delta) !== -expectedAmount
    || Number(incoming.delta) !== expectedAmount) {
    throw Object.assign(new Error('Transfer ledger verification failed'), { code: 'MIGRATION_LEDGER_INVALID' });
  }
  return rows;
}

async function verifyWalletAfterTransfer(tx, userId, orderId, expected) {
  const wallet = await tx.queryOne(`
    SELECT daily_free_credits, daily_expires_at, perpetual_credits,
      subscription_credits, subscription_expires_at
    FROM credit_wallets WHERE user_id = $1 FOR UPDATE
  `, [userId]);
  const user = await tx.queryOne('SELECT credits FROM users WHERE id = $1', [userId]);
  const transferRows = await tx.queryMany(`
    SELECT bucket_type, delta, idempotency_key
    FROM credit_ledger_v2
    WHERE user_id = $1 AND reference_id = $2 AND action_type = 'CREDIT_TRANSFER'
    ORDER BY id
    FOR UPDATE
  `, [userId, orderId]);
  const ledger = await tx.queryOne(`
    SELECT COUNT(*)::integer AS entry_count,
      COALESCE(SUM(delta), 0)::integer AS net_delta,
      COALESCE(SUM(CASE WHEN bucket_type = 'PERPETUAL' THEN delta ELSE 0 END), 0)::integer AS perpetual_delta,
      COALESCE(SUM(CASE WHEN bucket_type = 'SUBSCRIPTION' THEN delta ELSE 0 END), 0)::integer AS subscription_delta
    FROM credit_ledger_v2
    WHERE user_id = $1 AND reference_id = $2 AND action_type = 'CREDIT_TRANSFER'
  `, [userId, orderId]);
  const now = Date.now();
  const daily = wallet?.daily_expires_at && new Date(wallet.daily_expires_at).getTime() <= now
    ? 0
    : Number(wallet?.daily_free_credits || 0);
  const subscription = wallet?.subscription_expires_at && new Date(wallet.subscription_expires_at).getTime() <= now
    ? 0
    : Number(wallet?.subscription_credits || 0);
  const walletTotal = wallet
    ? daily + subscription + Number(wallet.perpetual_credits)
    : null;
  const expectedExpiry = new Date(expected.expiresAt).getTime();
  const actualExpiry = wallet?.subscription_expires_at
    ? new Date(wallet.subscription_expires_at).getTime()
    : null;
  if (Number(wallet?.perpetual_credits) !== Number(expected.perpetualCredits)
    || Number(wallet?.subscription_credits) !== Number(expected.subscriptionCredits)
    || actualExpiry !== expectedExpiry
    || Number(user?.credits) !== Number(expected.totalAvailable)
    || walletTotal !== Number(expected.totalAvailable)
    || Number(ledger?.entry_count) !== 2
    || Number(ledger?.net_delta) !== 0
    || Number(ledger?.perpetual_delta) !== -Number(expected.transferredAmount)
    || Number(ledger?.subscription_delta) !== Number(expected.transferredAmount)
    || transferRows.length !== 2) {
    throw Object.assign(new Error('Post-transfer wallet and ledger verification failed'), { code: 'MIGRATION_POSTCHECK_FAILED' });
  }
}

export async function runReconciliation(argv = process.argv.slice(2)) {
  const options = parseArgs(argv);
  if (options.help) { printHelp(); return { success: true, help: true }; }
  if (!options.orderId) throw Object.assign(new Error('--order=<order-id> is required'), { code: 'ORDER_REQUIRED' });
  if (options.apply && options.confirmedDatabase !== 'supdance_ai') {
    throw Object.assign(new Error('--apply requires --confirm-database=supdance_ai'), { code: 'DATABASE_CONFIRMATION_REQUIRED' });
  }

  const database = await queryOne('SELECT current_database() AS database');
  if (database?.database !== 'supdance_ai') {
    throw Object.assign(new Error('The reconciliation script is restricted to the production database name'), { code: 'DATABASE_TARGET_MISMATCH' });
  }
  if (options.apply) await verifyBackups(options);

  if (!options.apply) {
    const { plan } = await withTransaction((tx) => inspectOrder(tx, options.orderId));
    const result = { mode: 'dry-run', ...plan };
    console.log(JSON.stringify(result));
    return result;
  }

  const result = await withTransaction(async (tx) => {
    const orderLock = await tx.queryOne('SELECT id, user_id FROM orders WHERE id = $1 FOR UPDATE', [options.orderId]);
    if (!orderLock) throw Object.assign(new Error('Order not found'), { code: 'ORDER_NOT_FOUND' });
    const migrationKey = `migration:${options.orderId}:subscription-bucket-v1`;
    const existingTransfer = await tx.queryMany(`
      SELECT user_id, reference_id, bucket_type, delta, idempotency_key
      FROM credit_ledger_v2
      WHERE user_id = $1 AND reference_id = $2 AND action_type = 'CREDIT_TRANSFER'
      ORDER BY id
      FOR UPDATE
    `, [orderLock.user_id, options.orderId]);
    if (existingTransfer.length > 0) {
      const amount = Number(existingTransfer.find((row) => row.idempotency_key === `${migrationKey}:in`)?.delta);
      await verifyTransferLedger(tx, orderLock.user_id, options.orderId, migrationKey, amount);
      return { success: true, idempotent: true, verified: true, transferredAmount: amount };
    }

    const { order, plan } = await inspectOrder(tx, options.orderId, { lock: true });
    if (!plan.eligible) {
      throw Object.assign(new Error(`Preflight rejected: ${plan.blockers.join(',')}`), { code: 'MIGRATION_PREFLIGHT_REJECTED' });
    }
    const transfer = await transferPaymentCreditsToSubscription({
      userId: order.user_id,
      referenceId: order.id,
      amount: plan.transferAmount,
      expiresAt: plan.expiresAt,
      reason: '历史已付订阅积分桶校正',
      idempotencyKey: migrationKey,
      transaction: tx,
    });
    await verifyTransferLedger(tx, order.user_id, order.id, migrationKey, transfer.transferredAmount);
    await verifyWalletAfterTransfer(tx, order.user_id, order.id, transfer);
    return { ...transfer, verified: true };
  });
  console.log(JSON.stringify({ mode: 'applied', success: true, ...result }));
  return result;
}

if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) {
  try {
    await runReconciliation();
  } catch (error) {
    console.error(JSON.stringify({ success: false, code: error?.code || 'RECONCILIATION_FAILED' }));
    process.exitCode = 1;
  } finally {
    await closePgPool().catch(() => {});
  }
}
