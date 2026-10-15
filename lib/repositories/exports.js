import { queryMany } from '../db/index.js';

function filtersFor(filters = {}) {
  const values = [];
  const clauses = ['1 = 1'];
  let index = 0;
  const next = (value) => { values.push(value); return `$${++index}`; };
  const q = String(filters.q || '').trim().slice(0, 100);
  if (q) {
    const param = next(`%${q}%`);
    clauses.push(`(CAST(id AS TEXT) ILIKE ${param} OR email ILIKE ${param} OR display_name ILIKE ${param})`);
  }
  const from = String(filters.from || '').trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(from)) clauses.push(`created_at >= ${next(from)}::date`);
  const to = String(filters.to || '').trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(to)) clauses.push(`created_at < (${next(to)}::date + INTERVAL '1 day')`);
  return { clauses: clauses.join(' AND '), values };
}

export async function exportUsers(filters) {
  const { clauses, values } = filtersFor(filters);
  return await queryMany(`SELECT id, email, phone, display_name, role, status, created_at, last_login_at FROM users WHERE ${clauses} ORDER BY created_at DESC`, values);
}
export async function exportOrders(filters) {
  const { clauses, values } = filtersFor(filters);
  return await queryMany(`SELECT o.id, u.email, o.provider, o.plan_id, o.status, (o.amount_minor / 100.0) AS amount, o.currency, o.created_at, o.paid_at, o.refunded_at FROM orders o JOIN users u ON u.id = o.user_id WHERE ${clauses.replaceAll('id', 'o.id').replaceAll('email', 'u.email').replaceAll('display_name', 'u.display_name').replaceAll('created_at', 'o.created_at')} ORDER BY o.created_at DESC`, values);
}
export async function exportCreations(filters) {
  const { clauses, values } = filtersFor(filters);
  return await queryMany(`SELECT c.id, u.email, c.provider, c.model, c.studio_id, c.status, c.credit_cost, c.duration_ms, c.created_at, c.completed_at FROM creations c JOIN users u ON u.id = c.user_id WHERE ${clauses.replaceAll('id', 'c.id').replaceAll('email', 'u.email').replaceAll('display_name', 'u.display_name').replaceAll('created_at', 'c.created_at')} ORDER BY c.created_at DESC LIMIT 10000`, values);
}
export async function exportInvites() {
  return await queryMany(`
    SELECT
      ic.code,
      ic.status,
      ic.used_count,
      ic.max_uses,
      COALESCE(ic.notes, '') AS notes,
      MODE() WITHIN GROUP (ORDER BY cr.model) AS preferred_model,
      ROUND(COUNT(DISTINCT o.user_id)::numeric / NULLIF(COUNT(DISTINCT u.id), 0) * 100, 1) AS paying_rate,
      ic.created_at,
      ic.expires_at
    FROM invite_codes ic
    LEFT JOIN users u ON u.invited_by_code_id = ic.id
    LEFT JOIN creations cr ON cr.user_id = u.id AND cr.model IS NOT NULL
    LEFT JOIN orders o ON o.user_id = u.id AND o.status = 'succeeded'
    GROUP BY ic.id
    ORDER BY ic.created_at DESC
  `);
}
