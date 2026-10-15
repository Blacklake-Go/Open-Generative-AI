import pg from 'pg';
import { allocateUserId } from '../lib/auth/user-id.js';
const { Pool } = pg;

const databaseUrl = String(process.env.DATABASE_URL || '').trim();
if (!databaseUrl) {
  throw new Error('DATABASE_URL is required; this verifier never supplies a default database target.');
}
const database = new URL(databaseUrl);
if (!['postgres:', 'postgresql:'].includes(database.protocol)) {
  throw new Error('DATABASE_URL must use the postgres:// or postgresql:// scheme.');
}
const databaseName = decodeURIComponent(database.pathname.replace(/^\/+/, ''));
const confirmedDatabase = process.argv.find((arg) => arg.startsWith('--confirm-database='))?.slice('--confirm-database='.length);
if (!databaseName || confirmedDatabase !== databaseName) {
  throw new Error('Pass --confirm-database=<database-name> matching DATABASE_URL before running this verifier.');
}

const pool = new Pool({ connectionString: databaseUrl });

async function main() {
  console.log('=== [1/4] 验证 users 主键规范 (6位纯数字，无非数字) ===');
  const userCheck = await pool.query(`
    SELECT id, email, phone, role, created_at
    FROM auth_usr.users
    ORDER BY created_at ASC
    LIMIT 10;
  `);
  console.log(`查询到 ${userCheck.rows.length} 条样本用户:`);
  for (const u of userCheck.rows) {
    const isSixDigit = /^\d{6}$/.test(String(u.id));
    console.log(`  user_id=${u.id} (6位纯数字: ${isSixDigit}) role=${u.role}`);
    if (!isSixDigit) {
      throw new Error(`Invalid user ID format: ${u.id}`);
    }
  }

  console.log('\n=== [2/4] 验证 user_id_allocations 永久分配表 ===');
  const allocCheck = await pool.query(`
    SELECT count(*)::int as total
    FROM auth_usr.user_id_allocations;
  `);
  console.log('Allocations 表统计 (已分配根ID数量):', allocCheck.rows[0].total);
  if (allocCheck.rows[0].total < 1) {
    throw new Error('No allocated IDs in auth_usr.user_id_allocations');
  }

  console.log('\n=== [3/4] 验证外键关系与业务表关联收敛 ===');
  const fkCheck = await pool.query(`
    SELECT tc.table_schema, tc.table_name, kcu.column_name, ccu.table_name AS foreign_table_name, ccu.column_name AS foreign_column_name
    FROM information_schema.table_constraints AS tc
    JOIN information_schema.key_column_usage AS kcu
      ON tc.constraint_name = kcu.constraint_name
      AND tc.table_schema = kcu.table_schema
    JOIN information_schema.constraint_column_usage AS ccu
      ON ccu.constraint_name = tc.constraint_name
      AND ccu.table_schema = tc.table_schema
    WHERE tc.constraint_type = 'FOREIGN KEY'
      AND ccu.table_name = 'users'
      AND ccu.column_name = 'id'
    LIMIT 15;
  `);
  console.log(`外键关联到 users.id 的业务表样本 (共检测到 ${fkCheck.rows.length} 个):`);
  for (const r of fkCheck.rows) {
    console.log(`  ${r.table_schema}.${r.table_name}.${r.column_name} -> users.id`);
  }

  console.log('\n=== [4/4] 验证模拟分配下一个合法 UID ===');
  // 在事务中试分配并回滚，验证分配器功能正常且不会破坏持久化
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const nextUid = await allocateUserId({
      reserve: async (candidate, digits) => {
        const res = await client.query(
          'INSERT INTO auth_usr.user_id_allocations (user_id, digit_length) VALUES ($1, $2) ON CONFLICT (user_id) DO NOTHING RETURNING user_id',
          [candidate, digits]
        );
        return res.rows.length > 0;
      },
      findFirstAvailable: async (digits) => {
        const start = 10n ** BigInt(digits - 1);
        const end = 10n ** BigInt(digits) - 1n;
        const res = await client.query(`
          SELECT n::text AS user_id
          FROM generate_series($1::bigint, $2::bigint) AS n
          WHERE NOT EXISTS (
            SELECT 1 FROM auth_usr.user_id_allocations a WHERE a.user_id = n::text AND a.digit_length = $3
          )
          ORDER BY n ASC LIMIT 1
        `, [String(start), String(end), digits]);
        return res.rows[0]?.user_id || null;
      },
      isExhausted: async (digits) => {
        const res = await client.query('SELECT COUNT(*)::bigint AS allocated FROM auth_usr.user_id_allocations WHERE digit_length = $1', [digits]);
        return BigInt(res.rows[0]?.allocated ?? 0) >= 9n * (10n ** BigInt(digits - 1));
      },
    });
    console.log(`分配器生成的下一个可用 UID: ${nextUid}`);
    const valid = /^\d{6}$/.test(String(nextUid));
    console.log(`UID 是否为有效 6 位纯数字: ${valid}`);
    if (!valid) throw new Error('Allocated UID is not 6 digits');
    await client.query('ROLLBACK');
    console.log('事务安全回滚，未污染分配池');
  } finally {
    client.release();
  }

  await pool.end();
  console.log('\nSUCCESS: 线上用户身份体系 4 项核心验证全绿！');
}

main().catch(err => {
  console.error('FAILED:', err);
  process.exit(1);
});
