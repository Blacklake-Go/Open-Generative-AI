import 'server-only';

import { readOne, readMany, write, now } from '../repositories/runtimeDb.js';
import { getSettingByKey, updateSettingValue } from '../repositories/settings.js';
import { logAudit } from '../admin/audit.js';

export const DEFAULT_BANNER_CONFIG = {
  id: 'banner-default',
  title: 'Flova 风格沉浸式横幅',
  enabled: true,
  highlightText: '上新特惠：',
  message: '年会员享 Flova Image 2.5、Seedance 2.5 最低4折，1K 低至 ¥0.058/张',
  ctaText: '立即订阅',
  linkUrl: '/studio?account=open&tab=membership',
  linkTarget: '_self',
  theme: 'indigo', // 'indigo' | 'cyan' | 'emerald' | 'amber' | 'rose' | 'purple'
  ambientGlow: true, // 是否开启弥散光晕效果
  glowStyle: 'aurora', // 'aurora' | 'cyan' | 'amber' | 'rose'
  dynamicEffect: 'breathe', // 'breathe' | 'drift' | 'shimmer' | 'none'
  dismissible: true,
  autoHideDays: 7,
  badgeText: 'HOT',
  showPulseDot: true,
  targetScope: 'all', // 'all' | 'studio' | 'home'
};

export const DEFAULT_MOTION_CONFIG = {
  motionLevel: 'full', // 'full' (炫酷高帧) | 'balanced' (平衡) | 'minimal' (节能/极简)
  ambientGlow: true, // 顶部氛围弥散光晕
  cardTiltHover: true, // 模块卡片微动悬停
  bannerPulse: true, // 横幅呼吸小光点
};

/**
 * 获取当前生效的横幅配置
 */
export async function getBannerConfig() {
  try {
    const row = await getSettingByKey('site_banner');
    if (!row?.value || typeof row.value !== 'object') {
      return { ...DEFAULT_BANNER_CONFIG };
    }
    return {
      ...DEFAULT_BANNER_CONFIG,
      ...row.value,
    };
  } catch (err) {
    console.error('[content] getBannerConfig fallback:', err?.message || err);
    return { ...DEFAULT_BANNER_CONFIG };
  }
}

/**
 * 获取历史横幅列表
 */
export async function getBannerHistory() {
  try {
    const rows = await readMany(
      `SELECT 
        id, title, message, highlight_text AS "highlightText", cta_text AS "ctaText",
        link_url AS "linkUrl", link_target AS "linkTarget", theme,
        ambient_glow AS "ambientGlow", glow_style AS "glowStyle", dynamic_effect AS "dynamicEffect",
        badge_text AS "badgeText", show_pulse_dot AS "showPulseDot", dismissible,
        auto_hide_days AS "autoHideDays", target_scope AS "targetScope", is_active AS "isActive",
        created_by AS "createdBy", created_at AS "createdAt", updated_at AS "updatedAt"
       FROM ops_bill.banner_history
       ORDER BY created_at DESC
       LIMIT 50`
    );

    if (rows && rows.length > 0) {
      return rows;
    }

    // 若历史表为空，回落返回当前横幅快照
    const current = await getBannerConfig();
    return [{
      ...current,
      id: current.id || 'banner-default',
      title: current.title || '当前线上生效横幅',
      isActive: true,
      createdAt: new Date().toISOString(),
    }];
  } catch (err) {
    console.warn('[content] getBannerHistory fallback:', err?.message || err);
    const current = await getBannerConfig();
    return [{
      ...current,
      id: current.id || 'banner-default',
      title: current.title || '当前线上生效横幅',
      isActive: true,
      createdAt: new Date().toISOString(),
    }];
  }
}

/**
 * 保存横幅配置（同时更新 settings 并归档至历史记录）
 */
export async function saveBannerConfig({ actor, config, requestId }) {
  if (!config || typeof config !== 'object') {
    return { error: { code: 'INVALID_CONFIG', message: '横幅配置必须为有效对象' } };
  }

  const previous = await getBannerConfig();
  const nextConfig = {
    ...DEFAULT_BANNER_CONFIG,
    ...config,
    id: config.id || `banner-${Date.now()}`,
    title: String(config.title || '').trim() || (config.message ? config.message.slice(0, 30) : '未命名横幅'),
    enabled: Boolean(config.enabled),
    highlightText: String(config.highlightText || '').trim(),
    message: String(config.message || '').trim() || DEFAULT_BANNER_CONFIG.message,
    ctaText: String(config.ctaText || '').trim(),
    linkUrl: String(config.linkUrl || '').trim() || '#',
    linkTarget: config.linkTarget === '_self' ? '_self' : '_blank',
    theme: ['indigo', 'cyan', 'emerald', 'amber', 'rose', 'purple'].includes(config.theme)
      ? config.theme
      : 'indigo',
    ambientGlow: config.ambientGlow !== false,
    glowStyle: ['aurora', 'cyan', 'amber', 'rose'].includes(config.glowStyle)
      ? config.glowStyle
      : 'aurora',
    dynamicEffect: ['breathe', 'drift', 'shimmer', 'none'].includes(config.dynamicEffect)
      ? config.dynamicEffect
      : 'breathe',
    dismissible: config.dismissible !== false,
    autoHideDays: Math.max(0, parseInt(config.autoHideDays, 10) || 7),
    badgeText: String(config.badgeText || '').trim().slice(0, 10),
    showPulseDot: Boolean(config.showPulseDot),
    targetScope: ['all', 'studio', 'home'].includes(config.targetScope)
      ? config.targetScope
      : 'all',
  };

  try {
    // 1. 更新当前全局生效设置
    await updateSettingValue({
      key: 'site_banner',
      value: nextConfig,
      updatedBy: actor?.email || 'admin',
    });

    // 2. 将当前横幅归档保存至历史表
    try {
      await write('UPDATE ops_bill.banner_history SET is_active = false');
      await write(
        `INSERT INTO ops_bill.banner_history (
          id, title, message, highlight_text, cta_text, link_url, link_target, theme,
          ambient_glow, glow_style, dynamic_effect, badge_text, show_pulse_dot,
          dismissible, auto_hide_days, target_scope, is_active, created_by, created_at, updated_at
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, true, $17, now(), now()
        )
        ON CONFLICT (id) DO UPDATE SET
          title = EXCLUDED.title,
          message = EXCLUDED.message,
          highlight_text = EXCLUDED.highlight_text,
          cta_text = EXCLUDED.cta_text,
          link_url = EXCLUDED.link_url,
          link_target = EXCLUDED.link_target,
          theme = EXCLUDED.theme,
          ambient_glow = EXCLUDED.ambient_glow,
          glow_style = EXCLUDED.glow_style,
          dynamic_effect = EXCLUDED.dynamic_effect,
          badge_text = EXCLUDED.badge_text,
          show_pulse_dot = EXCLUDED.show_pulse_dot,
          dismissible = EXCLUDED.dismissible,
          auto_hide_days = EXCLUDED.auto_hide_days,
          target_scope = EXCLUDED.target_scope,
          is_active = true,
          updated_at = now()`,
        [
          nextConfig.id,
          nextConfig.title,
          nextConfig.message,
          nextConfig.highlightText,
          nextConfig.ctaText,
          nextConfig.linkUrl,
          nextConfig.linkTarget,
          nextConfig.theme,
          nextConfig.ambientGlow,
          nextConfig.glowStyle,
          nextConfig.dynamicEffect,
          nextConfig.badgeText,
          nextConfig.showPulseDot,
          nextConfig.dismissible,
          nextConfig.autoHideDays,
          nextConfig.targetScope,
          actor?.email || 'admin',
        ]
      );
    } catch (histErr) {
      console.warn('[content] archive banner_history non-fatal warning:', histErr?.message || histErr);
    }

    // 3. 审计留痕
    await logAudit({
      actor,
      action: 'content.banner_update',
      targetType: 'content_banner',
      targetId: nextConfig.id,
      riskLevel: 'medium',
      before: previous,
      after: nextConfig,
      requestId,
    });

    return { success: true, banner: nextConfig };
  } catch (err) {
    console.error('[content] saveBannerConfig error:', err);
    return { error: { code: 'DB_ERROR', message: `保存横幅配置失败: ${err.message}` } };
  }
}

/**
 * 激活指定历史横幅为当前线上版本
 */
export async function activateHistoricalBanner({ id, actor, requestId }) {
  if (!id) {
    return { error: { code: 'VALIDATION_ERROR', message: '历史横幅 ID 不能为空' } };
  }

  try {
    const historical = await readOne(
      `SELECT 
        id, title, message, highlight_text AS "highlightText", cta_text AS "ctaText",
        link_url AS "linkUrl", link_target AS "linkTarget", theme,
        ambient_glow AS "ambientGlow", glow_style AS "glowStyle", dynamic_effect AS "dynamicEffect",
        badge_text AS "badgeText", show_pulse_dot AS "showPulseDot", dismissible,
        auto_hide_days AS "autoHideDays", target_scope AS "targetScope"
       FROM ops_bill.banner_history WHERE id = $1`,
      [id]
    );

    if (!historical) {
      return { error: { code: 'NOT_FOUND', message: '未找到该历史横幅记录' } };
    }

    return await saveBannerConfig({
      actor,
      config: { ...historical, enabled: true },
      requestId,
    });
  } catch (err) {
    return { error: { code: 'DB_ERROR', message: `激活历史横幅失败: ${err.message}` } };
  }
}

/**
 * 删除指定历史横幅
 */
export async function deleteHistoricalBanner({ id, actor, requestId }) {
  if (!id) {
    return { error: { code: 'VALIDATION_ERROR', message: '历史横幅 ID 不能为空' } };
  }

  try {
    const target = await readOne(
      'SELECT id, is_active AS "isActive" FROM ops_bill.banner_history WHERE id = $1',
      [id]
    );

    if (!target) {
      return { error: { code: 'NOT_FOUND', message: '历史横幅记录不存在' } };
    }

    if (target.isActive) {
      return { error: { code: 'FORBIDDEN', message: '当前正在生效中的横幅无法直接删除，请先切换其他横幅' } };
    }

    await write('DELETE FROM ops_bill.banner_history WHERE id = $1', [id]);

    await logAudit({
      actor,
      action: 'content.banner_history_delete',
      targetType: 'content_banner_history',
      targetId: id,
      riskLevel: 'medium',
      before: target,
      after: null,
      requestId,
    });

    return { success: true };
  } catch (err) {
    return { error: { code: 'DB_ERROR', message: `删除历史横幅失败: ${err.message}` } };
  }
}

/**
 * 获取当前生效的动效配置
 */
export async function getMotionConfig() {
  try {
    const row = await getSettingByKey('homepage_motion');
    if (!row?.value || typeof row.value !== 'object') {
      return { ...DEFAULT_MOTION_CONFIG };
    }
    return {
      ...DEFAULT_MOTION_CONFIG,
      ...row.value,
    };
  } catch (err) {
    console.error('[content] getMotionConfig fallback:', err?.message || err);
    return { ...DEFAULT_MOTION_CONFIG };
  }
}

/**
 * 保存首页/全局动效配置
 */
export async function saveMotionConfig({ actor, config, requestId }) {
  if (!config || typeof config !== 'object') {
    return { error: { code: 'INVALID_CONFIG', message: '动效配置必须为有效对象' } };
  }

  const previous = await getMotionConfig();
  const nextConfig = {
    ...DEFAULT_MOTION_CONFIG,
    ...config,
    motionLevel: ['full', 'balanced', 'minimal'].includes(config.motionLevel)
      ? config.motionLevel
      : 'full',
    ambientGlow: Boolean(config.ambientGlow),
    cardTiltHover: Boolean(config.cardTiltHover),
    bannerPulse: Boolean(config.bannerPulse),
  };

  try {
    await updateSettingValue({
      key: 'homepage_motion',
      value: nextConfig,
      updatedBy: actor?.email || 'admin',
    });

    await logAudit({
      actor,
      action: 'content.motion_update',
      targetType: 'content_motion',
      targetId: 'global',
      riskLevel: 'low',
      before: previous,
      after: nextConfig,
      requestId,
    });

    return { success: true, motion: nextConfig };
  } catch (err) {
    console.error('[content] saveMotionConfig error:', err);
    return { error: { code: 'DB_ERROR', message: `保存动效配置失败: ${err.message}` } };
  }
}

/**
 * 记录用户交互事件埋点（曝光 impression / 点击 click / 关闭 dismiss）
 */
export async function recordBannerEvent({
  bannerId = 'default',
  eventType = 'click',
  userId = null,
  anonymousId = null,
  targetUrl = null,
  pagePath = '/',
  locale = 'zh-CN',
  userAgent = '',
  ip = '',
}) {
  const allowedTypes = ['impression', 'click', 'dismiss'];
  if (!allowedTypes.includes(eventType)) return false;

  try {
    await write(`
      INSERT INTO ops_bill.banner_events (
        banner_id, event_type, user_id, anonymous_id,
        target_url, page_path, locale, user_agent, ip, created_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
    `, [
      String(bannerId || 'default').slice(0, 64),
      eventType,
      userId ? String(userId).slice(0, 64) : null,
      anonymousId ? String(anonymousId).slice(0, 64) : null,
      targetUrl ? String(targetUrl).slice(0, 500) : null,
      pagePath ? String(pagePath).slice(0, 200) : '/',
      locale ? String(locale).slice(0, 16) : 'zh-CN',
      userAgent ? String(userAgent).slice(0, 500) : null,
      ip ? String(ip).slice(0, 64) : null,
      now(),
    ]);
    return true;
  } catch (err) {
    // 埋点不阻塞主流程，静默记录
    console.warn('[analytics] recordBannerEvent warning:', err?.message || err);
    return false;
  }
}

/**
 * 获取横幅点击与转化统计指标 + 明细流水
 */
export async function getBannerAnalytics({ bannerId = null, limit = 50, offset = 0 } = {}) {
  const safeLimit = Math.min(100, Math.max(10, parseInt(limit, 10) || 50));
  const safeOffset = Math.max(0, parseInt(offset, 10) || 0);

  try {
    // 1. 聚合指标统计
    const summaryRow = await readOne(`
      SELECT
        COUNT(*) FILTER (WHERE event_type = 'impression') AS total_impressions,
        COUNT(*) FILTER (WHERE event_type = 'click') AS total_clicks,
        COUNT(*) FILTER (WHERE event_type = 'dismiss') AS total_dismissals,
        COUNT(DISTINCT anonymous_id) AS unique_visitors
      FROM ops_bill.banner_events
      WHERE ($1::text IS NULL OR banner_id = $1::text)
    `, [bannerId]);

    const impressions = parseInt(summaryRow?.total_impressions || 0, 10);
    const clicks = parseInt(summaryRow?.total_clicks || 0, 10);
    const dismissals = parseInt(summaryRow?.total_dismissals || 0, 10);
    const uniqueVisitors = parseInt(summaryRow?.unique_visitors || 0, 10);
    const ctr = impressions > 0 ? Number(((clicks / impressions) * 100).toFixed(2)) : 0;

    // 2. 总条数
    const countRow = await readOne(`
      SELECT COUNT(*) AS total_count
      FROM ops_bill.banner_events
      WHERE ($1::text IS NULL OR banner_id = $1::text)
    `, [bannerId]);
    const totalEvents = parseInt(countRow?.total_count || 0, 10);

    // 3. 分页明细列表 (按时间倒序)
    const rows = await readMany(`
      SELECT
        id, banner_id, event_type, user_id, anonymous_id,
        target_url, page_path, locale, user_agent, ip, created_at
      FROM ops_bill.banner_events
      WHERE ($1::text IS NULL OR banner_id = $1::text)
      ORDER BY created_at DESC
      LIMIT $2 OFFSET $3
    `, [bannerId, safeLimit, safeOffset]);

    return {
      kpi: {
        impressions,
        clicks,
        dismissals,
        ctr,
        uniqueVisitors,
      },
      events: rows.map((r) => ({
        id: String(r.id),
        bannerId: r.banner_id,
        eventType: r.event_type,
        userId: r.user_id,
        anonymousId: r.anonymous_id,
        targetUrl: r.target_url,
        pagePath: r.page_path,
        locale: r.locale,
        ip: r.ip ? r.ip.replace(/(\d+)\.(\d+)\.(\d+)\.(\d+)/, '$1.$2.*.*') : '未知',
        userAgent: r.user_agent,
        createdAt: r.created_at,
      })),
      pagination: {
        total: totalEvents,
        limit: safeLimit,
        offset: safeOffset,
      },
    };
  } catch (err) {
    console.error('[content] getBannerAnalytics error:', err);
    return {
      kpi: { impressions: 0, clicks: 0, dismissals: 0, ctr: 0, uniqueVisitors: 0 },
      events: [],
      pagination: { total: 0, limit: safeLimit, offset: safeOffset },
    };
  }
}

/**
 * 重置/清空横幅统计数据
 */
export async function resetBannerAnalytics({ actor, requestId }) {
  try {
    await write('TRUNCATE TABLE ops_bill.banner_events');

    await logAudit({
      actor,
      action: 'content.banner_analytics_reset',
      targetType: 'banner_events',
      targetId: 'all',
      riskLevel: 'high',
      before: null,
      after: { action: 'TRUNCATE' },
      requestId,
    });

    return { success: true };
  } catch (err) {
    console.error('[content] resetBannerAnalytics error:', err);
    return { error: { code: 'DB_ERROR', message: `清空统计失败: ${err.message}` } };
  }
}
