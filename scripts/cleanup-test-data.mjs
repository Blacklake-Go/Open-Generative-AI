import 'server-only';
import { queryMany, withTransaction } from '../lib/db/index.js';

const APPLY = process.argv.includes('--apply');

async function main() {
  const orderRows = await queryMany(`
    SELECT id, user_id, provider, status, amount_minor, created_at FROM ops_bill.orders WHERE
    (status='pending' AND created_at < now() - interval '30 minutes')
    OR metadata_json::text ILIKE '%test_event%'
    OR checkout_url ILIKE '%mock%'
    OR COALESCE(metadata_json->>'simulated','false') = 'true'
    ORDER BY created_at
  `);
  const userRows = await queryMany(`
    SELECT id, email, role FROM auth_usr.users WHERE
    email ILIKE '%@test.com' OR email ILIKE '%@supdance.test' OR email ILIKE '%@example.com' OR email ILIKE 'verify_%@%'
    OR id LIKE 'usr_test_%' OR id LIKE 'c_user_%' OR id LIKE 'sub_tester_%' OR id LIKE 'verify_%'
    ORDER BY created_at
  `);
  const userIds = userRows.map((u) => u.id);
  let userOrderRows = [];
  if (userIds.length) userOrderRows = await queryMany('SELECT id FROM ops_bill.orders WHERE user_id = ANY($1::text[])', [userIds]);
  const allOrderIds = [...new Set([...orderRows.map((o) => o.id), ...userOrderRows.map((o) => o.id)])];

  console.log('=== 清理预览 (' + (APPLY ? 'APPLY' : 'DRY-RUN') + ') ===');
  console.log('目标订单: ' + orderRows.length + ' / 测试用户: ' + userRows.length + ' / 关联订单: ' + userOrderRows.length + ' / 待删订单合计: ' + allOrderIds.length);
  if (!APPLY) { console.log('DRY-RUN 未删除。确认后用 --apply。'); return; }

  await withTransaction(async (tx) => {
    if (allOrderIds.length) {
      await tx.execute('DELETE FROM ops_bill.payment_ledger WHERE order_id = ANY($1::text[])', [allOrderIds]);
      await tx.execute('DELETE FROM ops_bill.provider_call_logs WHERE order_id = ANY($1::text[])', [allOrderIds]);
      await tx.execute('DELETE FROM ops_bill.payment_attempts WHERE order_id = ANY($1::text[])', [allOrderIds]);
      await tx.execute('DELETE FROM ops_bill.webhook_events WHERE provider_object_id = ANY($1::text[])', [allOrderIds]);
      await tx.execute('DELETE FROM ops_bill.orders WHERE id = ANY($1::text[])', [allOrderIds]);
    }
    if (userIds.length) {
      await tx.execute('DELETE FROM ops_bill.credit_ledger_v2 WHERE user_id = ANY($1::text[])', [userIds]);
      await tx.execute('DELETE FROM ops_bill.credit_ledger WHERE user_id = ANY($1::text[])', [userIds]);
      await tx.execute('DELETE FROM ops_bill.credit_reservations WHERE user_id = ANY($1::text[])', [userIds]);
      await tx.execute('DELETE FROM ops_bill.credit_wallets WHERE user_id = ANY($1::text[])', [userIds]);
      await tx.execute('DELETE FROM ops_bill.currency_wallets WHERE user_id = ANY($1::text[])', [userIds]);
      await tx.execute('DELETE FROM ops_bill.currency_transfers WHERE sender_id = ANY($1::text[]) OR receiver_id = ANY($1::text[])', [userIds]);
      await tx.execute('DELETE FROM ops_bill.currency_journal_entries WHERE user_id = ANY($1::text[])', [userIds]);
      await tx.execute('DELETE FROM ops_bill.subscriptions WHERE user_id = ANY($1::text[])', [userIds]);
      await tx.execute('DELETE FROM auth_usr.sessions WHERE user_id = ANY($1::text[])', [userIds]);
      await tx.execute('DELETE FROM auth_usr.oauth_accounts WHERE user_id = ANY($1::text[])', [userIds]);
      await tx.execute('DELETE FROM auth_usr.users WHERE id = ANY($1::text[])', [userIds]);
    }
  });
  console.log('清理完成: 删除订单 ' + allOrderIds.length + ' 笔，测试用户 ' + userRows.length + ' 个。');
}
main().then(() => process.exit(0)).catch((e) => { console.error('CLEANUP_FAILED:', e.message); process.exit(1); });
