import 'server-only';

import { query, queryOne } from '../db/index.js';

export const REPORT_TIMEZONE = 'Asia/Shanghai';

function safeNumber(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

/**
 * 获取用户数据看板聚合数据
 * @param {'day' | 'week' | 'month' | 'year' | 'all'} period 
 */
export async function getUserDashboardData(period = 'day') {
  const normalizedPeriod = ['day', 'week', 'month', 'year', 'all'].includes(period) ? period : 'day';

  // 1. 核心大盘实时与切片指标
  let timeClauseUsers = "created_at >= (NOW() AT TIME ZONE 'Asia/Shanghai')::date";
  let prevTimeClauseUsers = "created_at >= ((NOW() AT TIME ZONE 'Asia/Shanghai')::date - INTERVAL '1 day') AND created_at < (NOW() AT TIME ZONE 'Asia/Shanghai')::date";
  let timeClauseCreations = "created_at >= (NOW() AT TIME ZONE 'Asia/Shanghai')::date";

  if (normalizedPeriod === 'week') {
    timeClauseUsers = "created_at >= NOW() - INTERVAL '7 days'";
    prevTimeClauseUsers = "created_at >= NOW() - INTERVAL '14 days' AND created_at < NOW() - INTERVAL '7 days'";
    timeClauseCreations = "created_at >= NOW() - INTERVAL '7 days'";
  } else if (normalizedPeriod === 'month') {
    timeClauseUsers = "created_at >= NOW() - INTERVAL '30 days'";
    prevTimeClauseUsers = "created_at >= NOW() - INTERVAL '60 days' AND created_at < NOW() - INTERVAL '30 days'";
    timeClauseCreations = "created_at >= NOW() - INTERVAL '30 days'";
  } else if (normalizedPeriod === 'year') {
    timeClauseUsers = "created_at >= NOW() - INTERVAL '365 days'";
    prevTimeClauseUsers = "created_at >= NOW() - INTERVAL '730 days' AND created_at < NOW() - INTERVAL '365 days'";
    timeClauseCreations = "created_at >= NOW() - INTERVAL '365 days'";
  } else if (normalizedPeriod === 'all') {
    timeClauseUsers = "1=1";
    prevTimeClauseUsers = "1=0";
    timeClauseCreations = "1=1";
  }

  // 并发拉取核心指标
  const [
    overviewStats,
    onlineSessionsRes,
    recentActiveRes,
    trendRes,
    channelsRes,
    preferencesRes,
    lifecycleRes,
    streamRes,
  ] = await Promise.all([
    // 综合统计
    queryOne(`
      SELECT 
        (SELECT count(*) FROM auth_usr.users) as total_users,
        (SELECT count(*) FROM auth_usr.users WHERE ${timeClauseUsers}) as period_new_users,
        (SELECT count(*) FROM auth_usr.users WHERE ${prevTimeClauseUsers}) as prev_period_new_users,
        (SELECT count(distinct user_id) FROM ops_bill.orders WHERE status IN ('paid', 'completed')) as paying_users,
        (SELECT count(distinct user_id) FROM ops_bill.subscriptions WHERE status IN ('active', 'trialing')) as active_subscribers,
        (SELECT count(distinct user_id) FROM ai_studio.creations WHERE ${timeClauseCreations}) as active_creators,
        (SELECT count(*) FROM ai_studio.creations WHERE ${timeClauseCreations}) as period_creations,
        (SELECT COALESCE(SUM(credit_cost), 0) FROM ai_studio.creations WHERE ${timeClauseCreations}) as period_credits,
        (SELECT count(*) FROM auth_usr.users WHERE status = 'suspended') as suspended_users,
        (SELECT count(*) FROM auth_usr.users WHERE (last_login_at < NOW() - INTERVAL '14 days' OR last_login_at IS NULL) AND created_at < NOW() - INTERVAL '14 days') as churn_risk_users
    `),

    // 在线会话与心跳活跃
    queryOne(`
      SELECT count(distinct user_id) as n
      FROM auth_usr.sessions
      WHERE expires_at > NOW() AND revoked_at IS NULL
    `),

    // 10秒内与近15分钟用户动态活跃
    queryOne(`
      SELECT 
        COUNT(DISTINCT user_id) FILTER (WHERE created_at >= NOW() - INTERVAL '10 seconds') as live_10s_count,
        COUNT(DISTINCT user_id) FILTER (WHERE created_at >= NOW() - INTERVAL '15 minutes') as active_15m_count
      FROM sys_core.user_activity_logs
    `),

    // 趋势数据 (根据所选周期自动生成时间轴)
    fetchTrendData(normalizedPeriod),

    // 登录渠道与注册来源分布
    query(`
      SELECT 
        COALESCE(provider, 'email') as provider,
        count(*) as count
      FROM auth_usr.auth_accounts
      GROUP BY provider
      ORDER BY count DESC
      LIMIT 8
    `),

    // AI 创作模态偏好分布
    query(`
      SELECT 
        CASE 
          WHEN studio_id LIKE '%video%' OR model LIKE '%kling%' OR model LIKE '%veo%' OR model LIKE '%hailuo%' OR model LIKE '%sora%' OR model LIKE '%wan%' OR model LIKE '%hunyuan%' THEN 'video'
          WHEN studio_id LIKE '%audio%' OR model LIKE '%suno%' OR model LIKE '%minimax%' OR model LIKE '%udio%' THEN 'audio'
          ELSE 'image'
        END as modality,
        count(distinct user_id) as user_count,
        count(*) as creation_count
      FROM ai_studio.creations
      GROUP BY 1
      ORDER BY creation_count DESC
    `),

    // 用户生命周期金字塔分层
    queryOne(`
      SELECT 
        COUNT(*) FILTER (WHERE created_at >= NOW() - INTERVAL '3 days') as stage_new,
        COUNT(*) FILTER (WHERE created_at < NOW() - INTERVAL '3 days' AND id IN (SELECT user_id FROM ai_studio.creations)) as stage_activated,
        COUNT(*) FILTER (WHERE id IN (SELECT user_id FROM ops_bill.orders WHERE status IN ('paid', 'completed')) OR id IN (SELECT user_id FROM ops_bill.subscriptions WHERE status IN ('active', 'trialing'))) as stage_paying,
        COUNT(*) FILTER (WHERE (last_login_at < NOW() - INTERVAL '14 days' OR last_login_at IS NULL) AND created_at < NOW() - INTERVAL '14 days') as stage_churn_risk
      FROM auth_usr.users
    `),

    // 实时动态流水流 (10-Second Live Activity Stream)
    fetchLiveActivityStream(15),
  ]);

  const totalUsers = safeNumber(overviewStats?.total_users, 0);
  const periodNewUsers = safeNumber(overviewStats?.period_new_users, 0);
  const prevPeriodNewUsers = safeNumber(overviewStats?.prev_period_new_users, 0);
  const payingUsers = safeNumber(overviewStats?.paying_users, 0);
  const activeSubscribers = safeNumber(overviewStats?.active_subscribers, 0);
  const activeCreators = safeNumber(overviewStats?.active_creators, 0);
  const periodCreations = safeNumber(overviewStats?.period_creations, 0);
  const periodCredits = safeNumber(overviewStats?.period_credits, 0);
  const suspendedUsers = safeNumber(overviewStats?.suspended_users, 0);
  const churnRiskUsers = safeNumber(overviewStats?.churn_risk_users, 0);

  const onlineSessions = safeNumber(onlineSessionsRes?.n, 0);
  const live10sCount = safeNumber(recentActiveRes?.live_10s_count, 0);
  const active15mCount = safeNumber(recentActiveRes?.active_15m_count, 0);

  // 计算增长率与付费转化率
  let growthRate = 0;
  if (prevPeriodNewUsers > 0) {
    growthRate = Math.round(((periodNewUsers - prevPeriodNewUsers) / prevPeriodNewUsers) * 100);
  } else if (periodNewUsers > 0) {
    growthRate = 100;
  }

  const payingConversionRate = totalUsers > 0
    ? ((payingUsers / totalUsers) * 100).toFixed(1)
    : '0.0';

  // 渠道占比处理
  const totalChannelCount = channelsRes.rows.reduce((acc, cur) => acc + safeNumber(cur.count), 0) || 1;
  const channelDistribution = channelsRes.rows.map(row => ({
    provider: row.provider,
    count: safeNumber(row.count),
    percentage: Math.round((safeNumber(row.count) / totalChannelCount) * 100),
  }));

  // 创作模态偏好
  const totalModalCreations = preferencesRes.rows.reduce((acc, cur) => acc + safeNumber(cur.creation_count), 0) || 1;
  const modalityPreferences = preferencesRes.rows.map(row => ({
    modality: row.modality,
    label: row.modality === 'video' ? 'AI 视频' : row.modality === 'audio' ? 'AI 音频音乐' : 'AI 图像生成',
    userCount: safeNumber(row.user_count),
    creationCount: safeNumber(row.creation_count),
    percentage: Math.round((safeNumber(row.creation_count) / totalModalCreations) * 100),
  }));

  return {
    meta: {
      period: normalizedPeriod,
      reportTimezone: REPORT_TIMEZONE,
      updatedAt: new Date().toISOString(),
      liveHeartbeatIntervalSeconds: 10,
    },
    metrics: {
      onlineSessions,
      live10sCount: Math.max(live10sCount, onlineSessions > 0 ? 1 : 0),
      active15mCount: Math.max(active15mCount, onlineSessions),
      totalUsers,
      periodNewUsers,
      prevPeriodNewUsers,
      growthRate,
      payingUsers,
      activeSubscribers,
      payingConversionRate,
      activeCreators,
      periodCreations,
      periodCredits,
      suspendedUsers,
      churnRiskUsers,
    },
    trends: trendRes,
    distribution: {
      channels: channelDistribution,
      modality: modalityPreferences,
      lifecycle: {
        newUsers: safeNumber(lifecycleRes?.stage_new, 0),
        activated: safeNumber(lifecycleRes?.stage_activated, 0),
        paying: safeNumber(lifecycleRes?.stage_paying, 0),
        churnRisk: safeNumber(lifecycleRes?.stage_churn_risk, 0),
      },
    },
    stream: streamRes,
  };
}

/**
 * 依据周期动态生成趋势序列
 */
async function fetchTrendData(period) {
  if (period === 'day') {
    // 24小时分布 (00:00 - 23:00)
    const res = await query(`
      SELECT 
        to_char(series.hour, 'HH24:00') as label,
        COUNT(DISTINCT u.id)::int as new_users,
        COUNT(DISTINCT c.id)::int as creations,
        COALESCE(SUM(c.credit_cost), 0)::int as credits_used
      FROM generate_series(
        date_trunc('day', NOW() AT TIME ZONE 'Asia/Shanghai'),
        date_trunc('day', NOW() AT TIME ZONE 'Asia/Shanghai') + INTERVAL '23 hours',
        INTERVAL '1 hour'
      ) AS series(hour)
      LEFT JOIN auth_usr.users u ON date_trunc('hour', u.created_at AT TIME ZONE 'Asia/Shanghai') = series.hour
      LEFT JOIN ai_studio.creations c ON date_trunc('hour', c.created_at AT TIME ZONE 'Asia/Shanghai') = series.hour
      GROUP BY series.hour
      ORDER BY series.hour ASC
    `);
    return res.rows.map(r => ({
      label: r.label,
      newUsers: safeNumber(r.new_users),
      creations: safeNumber(r.creations),
      creditsUsed: safeNumber(r.credits_used),
    }));
  }

  if (period === 'week') {
    // 近 7 天分布
    const res = await query(`
      SELECT 
        to_char(series.day, 'MM/DD') as label,
        COUNT(DISTINCT u.id)::int as new_users,
        COUNT(DISTINCT c.id)::int as creations,
        COALESCE(SUM(c.credit_cost), 0)::int as credits_used
      FROM generate_series(
        date_trunc('day', (NOW() AT TIME ZONE 'Asia/Shanghai') - INTERVAL '6 days'),
        date_trunc('day', NOW() AT TIME ZONE 'Asia/Shanghai'),
        INTERVAL '1 day'
      ) AS series(day)
      LEFT JOIN auth_usr.users u ON date_trunc('day', u.created_at AT TIME ZONE 'Asia/Shanghai') = series.day
      LEFT JOIN ai_studio.creations c ON date_trunc('day', c.created_at AT TIME ZONE 'Asia/Shanghai') = series.day
      GROUP BY series.day
      ORDER BY series.day ASC
    `);
    return res.rows.map(r => ({
      label: r.label,
      newUsers: safeNumber(r.new_users),
      creations: safeNumber(r.creations),
      creditsUsed: safeNumber(r.credits_used),
    }));
  }

  if (period === 'month') {
    // 近 30 天分布
    const res = await query(`
      SELECT 
        to_char(series.day, 'MM/DD') as label,
        COUNT(DISTINCT u.id)::int as new_users,
        COUNT(DISTINCT c.id)::int as creations,
        COALESCE(SUM(c.credit_cost), 0)::int as credits_used
      FROM generate_series(
        date_trunc('day', (NOW() AT TIME ZONE 'Asia/Shanghai') - INTERVAL '29 days'),
        date_trunc('day', NOW() AT TIME ZONE 'Asia/Shanghai'),
        INTERVAL '1 day'
      ) AS series(day)
      LEFT JOIN auth_usr.users u ON date_trunc('day', u.created_at AT TIME ZONE 'Asia/Shanghai') = series.day
      LEFT JOIN ai_studio.creations c ON date_trunc('day', c.created_at AT TIME ZONE 'Asia/Shanghai') = series.day
      GROUP BY series.day
      ORDER BY series.day ASC
    `);
    return res.rows.map(r => ({
      label: r.label,
      newUsers: safeNumber(r.new_users),
      creations: safeNumber(r.creations),
      creditsUsed: safeNumber(r.credits_used),
    }));
  }

  // year & all: 近 12 个月
  const res = await query(`
    SELECT 
      to_char(series.month, 'YY/MM') as label,
      COUNT(DISTINCT u.id)::int as new_users,
      COUNT(DISTINCT c.id)::int as creations,
      COALESCE(SUM(c.credit_cost), 0)::int as credits_used
    FROM generate_series(
      date_trunc('month', (NOW() AT TIME ZONE 'Asia/Shanghai') - INTERVAL '11 months'),
      date_trunc('month', NOW() AT TIME ZONE 'Asia/Shanghai'),
      INTERVAL '1 month'
    ) AS series(month)
    LEFT JOIN auth_usr.users u ON date_trunc('month', u.created_at AT TIME ZONE 'Asia/Shanghai') = series.month
    LEFT JOIN ai_studio.creations c ON date_trunc('month', c.created_at AT TIME ZONE 'Asia/Shanghai') = series.month
    GROUP BY series.month
    ORDER BY series.month ASC
  `);
  return res.rows.map(r => ({
    label: r.label,
    newUsers: safeNumber(r.new_users),
    creations: safeNumber(r.creations),
    creditsUsed: safeNumber(r.credits_used),
  }));
}

/**
 * 实时动态流水流 (10-Second Live Activity Stream)
 */
async function fetchLiveActivityStream(limit = 15) {
  const res = await query(`
    (
      SELECT 
        'creation' as type, 
        c.id as id, 
        c.user_id, 
        COALESCE(u.display_name, u.email, u.phone, '用户#' || c.user_id) as user_name,
        '生成任务: ' || c.model || ' (' || c.status || ', 消耗 ' || c.credit_cost || ' 算力)' as summary,
        c.created_at
      FROM ai_studio.creations c
      LEFT JOIN auth_usr.users u ON c.user_id = u.id
      ORDER BY c.created_at DESC
      LIMIT 10
    )
    UNION ALL
    (
      SELECT 
        'signup' as type, 
        u.id as id, 
        u.id as user_id, 
        COALESCE(u.display_name, u.email, u.phone, '用户#' || u.id) as user_name,
        '新用户注册 (' || COALESCE(u.registration_source, 'web') || ')' as summary,
        u.created_at
      FROM auth_usr.users u
      ORDER BY u.created_at DESC
      LIMIT 8
    )
    UNION ALL
    (
      SELECT 
        'payment' as type, 
        o.id as id, 
        o.user_id, 
        COALESCE(u.display_name, u.email, u.phone, '用户#' || o.user_id) as user_name,
        '完成支付: ' || COALESCE(o.plan_id, '算力包') || ' (' || UPPER(o.currency) || ' ' || (o.amount_minor / 100.0)::text || ')' as summary,
        o.created_at
      FROM ops_bill.orders o
      LEFT JOIN auth_usr.users u ON o.user_id = u.id
      WHERE o.status IN ('paid', 'completed')
      ORDER BY o.created_at DESC
      LIMIT 5
    )
    ORDER BY created_at DESC
    LIMIT $1
  `, [limit]);

  return res.rows.map(item => ({
    id: item.id,
    type: item.type,
    userId: item.user_id,
    userName: item.user_name,
    summary: item.summary,
    createdAt: item.created_at ? new Date(item.created_at).toISOString() : null,
  }));
}
