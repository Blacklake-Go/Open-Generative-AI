import { getDatabase } from './lib/billing.js';

try {
  const db = getDatabase();
  const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map(r => r.name);
  console.log('线上数据库包含数据表:', tables);
  
  const userCols = db.prepare("PRAGMA table_info(users)").all().map(c => c.name);
  console.log('users 表包含字段:', userCols);

  const hasOAuth = tables.includes('oauth_accounts');
  const hasLedger = tables.includes('credit_ledger');
  const hasCredits = userCols.includes('credits');

  console.log(`校验结果 -> oauth_accounts: ${hasOAuth}, credit_ledger: ${hasLedger}, users.credits: ${hasCredits}`);
  if (!hasOAuth || !hasLedger || !hasCredits) {
    console.error('数据库校验未完全通过！');
    process.exit(1);
  }
  console.log('✅ 数据库架构完全正确！');
} catch (err) {
  console.error('数据库执行异常:', err);
  process.exit(1);
}
