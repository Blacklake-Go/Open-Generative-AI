import 'server-only';

import * as activityRepo from '../repositories/activity.js';
import * as usersRepo from '../repositories/users.js';
import { aggregateBrands } from '../utils/modelBrands.js';

export async function recordUserActivity({
  userId = null,
  sessionId = null,
  category = 'general',
  action,
  targetType = null,
  targetId = null,
  modelName = null,
  metadata = {},
  ip = null,
  userAgent = null,
}) {
  try {
    return await activityRepo.insertActivityLog({
      userId,
      sessionId,
      category,
      action,
      targetType,
      targetId,
      modelName,
      metadata,
      ip,
      userAgent,
    });
  } catch (err) {
    console.error('[activity service] 记录用户行为失败:', err.message);
    return null;
  }
}

function formatLocalDate(d) {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * 构造 Trae 风格的 52 周完整贡献热力图网格数据
 * 严格按照本地时间 YYYY-MM-DD 匹配，杜绝 toISOString 时区退天
 */
function build52WeekHeatmap(dateCountMap) {
  const weeks = [];
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // 计算本周的周日作为终止周的基准，回溯 51 周作为起始周日（共 52 周）
  const currentDayOfWeek = today.getDay(); // 0 是周日, 1 是周一... 6 是周六
  const thisWeekSunday = new Date(today);
  thisWeekSunday.setDate(today.getDate() - currentDayOfWeek);

  const startDate = new Date(thisWeekSunday);
  startDate.setDate(thisWeekSunday.getDate() - 51 * 7);

  let currentWeek = [];
  let iterDate = new Date(startDate);
  let lastLabeledMonth = -1;

  // 遍历 52 周 × 7 天
  for (let w = 0; w < 52; w++) {
    let weekMonthName = null;

    for (let d = 0; d < 7; d++) {
      const dateStr = formatLocalDate(iterDate);
      const isFuture = iterDate.getTime() > today.getTime();
      const count = isFuture ? 0 : Number(dateCountMap[dateStr] || 0);

      // 计算活跃等级 0-4 级色阶
      let level = 0;
      if (count > 0 && count <= 2) level = 1;
      else if (count > 2 && count <= 5) level = 2;
      else if (count > 5 && count <= 10) level = 3;
      else if (count > 10) level = 4;

      const currentMonth = iterDate.getMonth() + 1;
      // 当月第一周或者月初几天打上月份标记
      if (iterDate.getDate() <= 7 && currentMonth !== lastLabeledMonth && !weekMonthName) {
        weekMonthName = `${currentMonth}月`;
        lastLabeledMonth = currentMonth;
      }

      currentWeek.push({
        date: dateStr,
        count,
        level,
        dayOfWeek: d,
        isFuture,
      });

      iterDate.setDate(iterDate.getDate() + 1);
    }

    weeks.push({
      weekIndex: w,
      days: currentWeek,
      monthName: weekMonthName,
    });
    currentWeek = [];
  }

  return weeks;
}

export async function getActivityDashboardData(userId) {
  const user = await usersRepo.findUserById(userId);
  if (!user) return null;

  const [dateMap, metrics, topModels, allModelUsage, preferences] = await Promise.all([
    activityRepo.getDailyHeatmap(userId),
    activityRepo.getCreationMetrics(userId),
    activityRepo.getTopModels(userId, 5),
    activityRepo.getUserModelUsage(userId, 50),
    activityRepo.getModelPreferences(userId),
  ]);

  const topBrands = aggregateBrands(allModelUsage, metrics.totalCreations).slice(0, 5);

  // 若用户今日已登录访问个人中心但尚无行为记录，轻量记录一条今日活跃日志，避免活跃网格与天数全空
  const todayStr = formatLocalDate(new Date());
  if (!dateMap[todayStr]) {
    try {
      await activityRepo.insertActivityLog({
        userId,
        category: 'general',
        action: 'dashboard_view',
        metadata: { source: 'account_center' },
      });
      dateMap[todayStr] = 1;
    } catch {
      // 容错处理，不阻塞仪表盘加载
    }
  }

  const distinctDaysCount = Object.keys(dateMap).length;
  const activeDays = Math.max(Number(metrics.activeDays || 0), distinctDaysCount);
  const totalContributions = Object.values(dateMap).reduce((a, b) => a + Number(b || 0), 0);

  const createdAt = user.created_at ? new Date(user.created_at) : new Date();
  const daysSinceCreated = Math.max(1, Math.ceil((Date.now() - createdAt.getTime()) / (1000 * 60 * 60 * 24)));

  // 计算专属称号标签（参考 Trae #探险家）
  let badgeTitle = '#探险家';
  if (metrics.totalCreations >= 100 || daysSinceCreated >= 90) {
    badgeTitle = '#光影大师';
  } else if (metrics.totalCreations >= 20 || daysSinceCreated >= 30) {
    badgeTitle = '#创想先锋';
  }

  const heatmapWeeks = build52WeekHeatmap(dateMap);

  return {
    user: {
      id: user.id,
      userNumber: user.user_number || (user.id ? String(user.id) : null),
      displayName: user.display_name || `创作者#${user.user_number || user.id || '新星'}`,
      avatarUrl: user.avatar_url,
      daysActive: daysSinceCreated,
      badgeTitle,
      isActivityPublic: user.is_activity_public !== false,
      privacySettings: user.privacy_settings || { hide_activity: false, hide_stats: false },
    },
    metrics: {
      totalCreations: metrics.totalCreations,
      activeDays,
      totalCredits: metrics.totalCredits,
    },
    heatmap: {
      weeks: heatmapWeeks,
      totalContributions,
    },
    topBrands,
    topModels,
    preferences,
    hasData: metrics.totalCreations > 0 || distinctDaysCount > 0,
  };
}

export async function toggleFollowCreator(followerId, targetUserId) {
  return await activityRepo.toggleFollow(followerId, targetUserId);
}

export async function checkFollowStatus(followerId, targetUserId) {
  return await activityRepo.checkIsFollowing(followerId, targetUserId);
}
