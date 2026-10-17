import 'server-only';

import { nowIso } from './db/index.js';
import { verifyAdminPassword } from './admin/authz.js';
import { logAudit } from './admin/audit.js';
import { EMAIL_PROVIDERS, EMAIL_SMTP_PROVIDER, getEmailSmtpConfiguration, getEmailSmtpPassword, QQ_EXMAIL_SMTP_HOST } from './emailConfig.js';
import { getEmailCircuitStatus, resetEmailCircuitBreaker, resetEmailTransportPool, sendEmailSmtpTest as deliverEmailSmtpTest, verifyEmailSmtp } from './emailService.js';
import { saveSystemSetting } from './services/settings.js';
import * as providerRepo from './repositories/providers.js';
import * as sendLogRepo from './repositories/emailSendLogs.js';
import { consumeRateLimit } from './security/requestGuard.js';
import { runEmailQualityDiagnosis } from './emailDiagnostics.js';

export const listEmailSendLogs = sendLogRepo.listEmailSendLogs;
export const getEmailSendStats = sendLogRepo.getEmailSendStats;
export const getEmailSendLogById = sendLogRepo.getEmailSendLogById;

function validEmail(value) {
  const email = String(value || '').trim().toLowerCase();
  return email.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : null;
}

export async function getEmailSmtpOverview() {
  const [config, qqPass, aliyunPass, resendPass, customPass, healthRows] = await Promise.all([
    getEmailSmtpConfiguration(),
    getEmailSmtpPassword('qq'),
    getEmailSmtpPassword('aliyun'),
    getEmailSmtpPassword('resend'),
    getEmailSmtpPassword('custom'),
    providerRepo.getLatestHealthChecks(),
  ]);
  const passwords = {
    qq: Boolean(qqPass),
    aliyun: Boolean(aliyunPass),
    resend: Boolean(resendPass),
    custom: Boolean(customPass),
  };
  const password = qqPass;
  const health = healthRows.find((row) => row.provider === EMAIL_SMTP_PROVIDER) || null;
  const configured = Boolean(config.username && password);

  // 线路健康与配置汇总
  const channelList = Object.entries(EMAIL_PROVIDERS).map(([key, def]) => {
    const channelConf = config.providers?.[key] || {};
    const isPrimary = (config.activeProvider || 'qq') === key;
    const isBackup = config.backupProvider === key;
    const hasUser = Boolean(channelConf.username || (isPrimary && config.username));
    return {
      id: key,
      name: def.name,
      host: channelConf.host || def.host,
      port: channelConf.port || def.port,
      secure: channelConf.secure !== undefined ? channelConf.secure : def.secure,
      description: def.description,
      isPrimary,
      isBackup,
      configured: Boolean(hasUser && passwords[key]),
      enabled: channelConf.enabled !== false,
      username: channelConf.username || (isPrimary ? config.username : ''),
      fromName: channelConf.fromName || (isPrimary ? config.fromName : 'SupDance'),
    };
  });

  return {
    config,
    passwordConfigured: Boolean(password),
    passwordsConfigured: passwords,
    configured,
    status: !config.enabled ? 'disabled' : !configured ? 'unavailable' : health?.status || 'not_checked',
    lastHealthCheck: health?.checked_at || null,
    lastHealthLatencyMs: health?.latency_ms ?? null,
    lastHealthError: health?.error_code || null,
    recommended: { host: QQ_EXMAIL_SMTP_HOST, port: 465, secure: true },
    channels: channelList,
    circuit: getEmailCircuitStatus(config),
    quota: {
      perMinute: config.rateLimitPerMinute || 60,
      activeConnections: 5,
      poolMax: 5,
    },
  };
}

export async function saveEmailSmtpConfiguration({ actor, body, requestId }) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return { error: '邮箱配置格式无效' };

  if (body.resetCircuit === true) {
    resetEmailCircuitBreaker();
    await logAudit({
      actor,
      action: 'email.smtp.reset_circuit',
      targetType: 'email_provider',
      targetId: EMAIL_SMTP_PROVIDER,
      riskLevel: 'low',
      requestId,
    });
    return { success: true, circuitReset: true };
  }

  const prevConfig = await getEmailSmtpConfiguration();
  const activeProvider = String(body.activeProvider || prevConfig.activeProvider || 'qq').toLowerCase();
  const activeDef = EMAIL_PROVIDERS[activeProvider] || EMAIL_PROVIDERS.qq;

  const targetChannel = String(body.channel || activeProvider).toLowerCase();
  const username = body.username !== undefined ? validEmail(body.username) : null;
  if (body.username && !username) return { error: '请输入有效的邮箱地址' };

  const fromName = String(body.fromName || prevConfig.fromName || 'SupDance').trim();
  if (fromName.length > 100) return { error: '发件人名称不能超过 100 个字符' };

  // 密码与配置一次提交：填了新密码就必须重新验证管理员身份，留空则保留既有密钥。
  const nextPassword = typeof body.password === 'string' ? body.password.trim() : '';
  if (nextPassword) {
    if (!(await verifyAdminPassword(actor.id, body.adminPassword))) return { error: '管理员密码验证失败' };
    if (nextPassword.length < 8 || nextPassword.length > 1024) return { error: 'SMTP 客户端密码长度无效' };
    const providerTarget = targetChannel !== 'qq' ? `smtp_password_${targetChannel}` : 'smtp_password';
    await providerRepo.saveProviderSecret({ provider: EMAIL_SMTP_PROVIDER, name: providerTarget, secretValue: nextPassword });
    await logAudit({
      actor,
      action: 'email.smtp.rotate_secret',
      targetType: 'email_provider',
      targetId: EMAIL_SMTP_PROVIDER,
      riskLevel: 'high',
      after: { secretName: providerTarget, channel: targetChannel, updatedAt: nowIso() },
      requestId,
    });
  }

  // 重置持久连接池单例，确保新凭证立即生效
  resetEmailTransportPool();

  const nextProviders = {
    ...prevConfig.providers,
    ...(body.providers || {}),
  };

  // If channel-specific edits were submitted
  if (body.channel && nextProviders[body.channel]) {
    nextProviders[body.channel] = {
      ...nextProviders[body.channel],
      ...(body.channelUsername ? { username: String(body.channelUsername).trim() } : {}),
      ...(body.channelFromName ? { fromName: String(body.channelFromName).trim() } : {}),
      ...(body.channelEnabled !== undefined ? { enabled: Boolean(body.channelEnabled) } : {}),
    };
    if (body.channel === 'custom') {
      if (body.customHost !== undefined) nextProviders.custom.host = String(body.customHost).trim();
      if (body.customPort !== undefined) nextProviders.custom.port = Number(body.customPort) || 465;
      if (body.customSecure !== undefined) nextProviders.custom.secure = Boolean(body.customSecure);
    }
  }

  const activeChannelConfig = nextProviders[activeProvider] || {};
  const effectiveUsername = username || activeChannelConfig.username || prevConfig.username || '';
  const effectiveFromName = fromName || activeChannelConfig.fromName || prevConfig.fromName || 'SupDance';

  const config = {
    enabled: body.enabled === true,
    activeProvider,
    backupProvider: body.backupProvider !== undefined ? body.backupProvider : prevConfig.backupProvider,
    failoverEnabled: body.failoverEnabled !== undefined ? Boolean(body.failoverEnabled) : prevConfig.failoverEnabled,
    rateLimitPerMinute: Number(body.rateLimitPerMinute || prevConfig.rateLimitPerMinute || 60),
    circuitBreaker: {
      failureThreshold: Number(body.circuitBreaker?.failureThreshold || 5),
      coolingPeriodSec: Number(body.circuitBreaker?.coolingPeriodSec || 60),
    },
    host: body.host || activeChannelConfig.host || activeDef.host || QQ_EXMAIL_SMTP_HOST,
    port: Number(body.port || activeChannelConfig.port || activeDef.port || 465),
    secure: body.secure !== undefined ? Boolean(body.secure) : (activeChannelConfig.secure ?? (activeDef.secure ?? true)),
    username: effectiveUsername,
    fromName: effectiveFromName,
    providers: nextProviders,
  };

  const saved = await saveSystemSetting({ actor, key: 'email_smtp', value: config, visibility: 'private', requestId });
  if (saved.error) return { error: saved.error };

  await logAudit({
    actor,
    action: 'email.smtp.configure',
    targetType: 'email_provider',
    targetId: EMAIL_SMTP_PROVIDER,
    riskLevel: 'medium',
    after: { ...config, username: effectiveUsername ? `${effectiveUsername.slice(0, 2)}***@${effectiveUsername.split('@')[1]}` : '' },
    requestId,
  });
  return { success: true };
}

export async function runEmailSmtpHealthCheck({ actor, channel = null, requestId }) {
  const result = await verifyEmailSmtp({ channel });
  await providerRepo.recordHealthCheck({
    provider: EMAIL_SMTP_PROVIDER,
    status: result.status,
    latencyMs: result.latencyMs,
    errorCode: result.errorCode,
    details: { probe: 'smtp_verify', channel: channel || 'active' },
  });
  await logAudit({
    actor,
    action: 'email.smtp.health_check',
    targetType: 'email_provider',
    targetId: EMAIL_SMTP_PROVIDER,
    riskLevel: 'low',
    after: { status: result.status, latencyMs: result.latencyMs, errorCode: result.errorCode, channel },
    requestId,
  });
  return result;
}

export async function runEmailSmtpDiagnostics({ actor, channel = null, requestId }) {
  const config = await getEmailSmtpConfiguration();
  const targetChannel = channel || config.activeProvider || 'qq';
  const channelConf = config.providers?.[targetChannel] || {};
  const channelDef = EMAIL_PROVIDERS[targetChannel] || EMAIL_PROVIDERS.qq;

  const diagnosis = await runEmailQualityDiagnosis({
    host: channelConf.host || (targetChannel === 'qq' ? QQ_EXMAIL_SMTP_HOST : channelDef.host),
    port: channelConf.port || channelDef.port || 465,
    username: channelConf.username || (targetChannel === config.activeProvider ? config.username : ''),
  });

  await logAudit({
    actor,
    action: 'email.smtp.diagnose',
    targetType: 'email_provider',
    targetId: EMAIL_SMTP_PROVIDER,
    riskLevel: 'low',
    after: { channel: targetChannel, overallHealth: diagnosis.overallHealth, target: diagnosis.target },
    requestId,
  });
  return diagnosis;
}

export async function sendEmailSmtpTest({ actor, to, requestId }) {
  const recipient = validEmail(to);
  if (!recipient) return { error: '请输入有效的测试收件邮箱' };
  const limit = await consumeRateLimit({ scope: 'admin_email_smtp_test', subject: actor.id, limit: 3, windowMs: 60 * 60 * 1000 });
  if (!limit.allowed) return { error: '测试邮件发送过于频繁，请稍后再试', status: 429 };

  const result = await deliverEmailSmtpTest({ to: recipient, actorId: actor.id });
  await providerRepo.recordProviderCall({
    provider: EMAIL_SMTP_PROVIDER,
    action: 'test_send',
    requestId,
    status: 'success',
    latencyMs: result.latencyMs,
    usage: { recipientDomain: recipient.split('@')[1] },
  });
  await logAudit({
    actor,
    action: 'email.smtp.test_send',
    targetType: 'email_provider',
    targetId: EMAIL_SMTP_PROVIDER,
    riskLevel: 'medium',
    after: { recipientDomain: recipient.split('@')[1], latencyMs: result.latencyMs },
    requestId,
  });
  return { success: true, message: 'SMTP 服务已接受测试邮件；请检查收件箱及垃圾邮件文件夹。', latencyMs: result.latencyMs };
}
