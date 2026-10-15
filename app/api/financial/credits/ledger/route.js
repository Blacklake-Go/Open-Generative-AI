import { getUserFromRequest, json } from '@/lib/services/auth';
import { query } from '@/lib/application/dataAccess.js';

export const runtime = 'nodejs';

export async function GET(request) {
  const user = await getUserFromRequest(request);
  if (!user) return json({ error: '请先登录' }, { status: 401 });

  try {
    const result = await query(
      `SELECT id, bucket_type, delta, balance_after, action_type, description, created_at
       FROM credit_ledger_v2
       WHERE user_id = $1
       ORDER BY created_at DESC
       LIMIT 50`,
      [user.id]
    );

    const items = result.rows.map((row) => ({
      id: row.id,
      type: Number(row.delta) > 0 ? (row.action_type === 'DAILY_CHECKIN' ? 'checkin' : 'recharge') : 'task',
      title: row.description || (Number(row.delta) > 0 ? '算力入账' : '模型任务消耗'),
      delta: Number(row.delta) > 0 ? `+${row.delta} 积分` : `${row.delta} 积分`,
      balanceAfter: `${row.balance_after} 积分`,
      time: new Date(row.created_at).toLocaleString('zh-CN', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
      }),
      status: '成功',
    }));

    return json({ ledger: items });
  } catch (error) {
    console.error('[credits/ledger error]', error);
    return json({ error: '获取账本流水失败' }, { status: 500 });
  }
}
