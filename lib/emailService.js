import 'server-only';

import nodemailer from 'nodemailer';
import { buildAuthRecoveryEmail } from './emailTemplates/authRecovery.js';
import { EMAIL_SMTP_PROVIDER, getEmailSmtpConfiguration, getEmailSmtpPassword } from './emailConfig.js';

function smtpErrorCode(error) {
  const code = String(error?.code || '').toUpperCase();
  const responseCode = Number(error?.responseCode || 0);
  if (code === 'EAUTH' || responseCode === 535 || responseCode === 534) return 'SMTP_AUTH_FAILED';
  if (code.includes('TIMEOUT') || code === 'ETIMEDOUT') return 'SMTP_TIMEOUT';
  if (['ECONNECTION', 'ECONNREFUSED', 'ENOTFOUND', 'EHOSTUNREACH'].includes(code)) return 'SMTP_UNAVAILABLE';
  if (responseCode >= 400) return 'SMTP_REJECTED';
  return 'SMTP_ERROR';
}

function validEmail(value) {
  const email = String(value || '').trim();
  return email.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : null;
}

// 缓存持久化 SMTP 连接池单例（按 host + port + secure + username 组合作为缓存 Key）
const poolRegistry = new Map();

// 内存熔断器单例（统计连续失败、冷却周期与半开试发状态）
const circuitState = {
  state: 'closed', // 'closed' | 'open' | 'half_open'
  consecutiveFailures: 0,
  lastFailureAt: null,
  openedAt: null,
  lastError: null,
};

export function getEmailCircuitStatus(config = null) {
  const threshold = Number(config?.circuitBreaker?.failureThreshold || 5);
  const coolingPeriodSec = Number(config?.circuitBreaker?.coolingPeriodSec || 60);

  if (circuitState.state === 'open') {
    const elapsed = Date.now() - (circuitState.openedAt || 0);
    if (elapsed >= coolingPeriodSec * 1000) {
      circuitState.state = 'half_open';
    }
  }

  return {
    state: circuitState.state,
    consecutiveFailures: circuitState.consecutiveFailures,
    failureThreshold: threshold,
    coolingPeriodSec,
    lastFailureAt: circuitState.lastFailureAt,
    openedAt: circuitState.openedAt,
    lastError: circuitState.lastError,
  };
}

export function resetEmailCircuitBreaker() {
  circuitState.state = 'closed';
  circuitState.consecutiveFailures = 0;
  circuitState.lastFailureAt = null;
  circuitState.openedAt = null;
  circuitState.lastError = null;
  return getEmailCircuitStatus();
}

function recordCircuitSuccess() {
  circuitState.state = 'closed';
  circuitState.consecutiveFailures = 0;
  circuitState.lastError = null;
  circuitState.openedAt = null;
}

function recordCircuitFailure(error, threshold = 5) {
  circuitState.consecutiveFailures += 1;
  circuitState.lastFailureAt = Date.now();
  circuitState.lastError = error?.message || String(error);

  if (circuitState.consecutiveFailures >= threshold) {
    circuitState.state = 'open';
    circuitState.openedAt = Date.now();
  }
}

export function resetEmailTransportPool(key = null) {
  if (key && poolRegistry.has(key)) {
    try { poolRegistry.get(key).close(); } catch {}
    poolRegistry.delete(key);
  } else if (!key) {
    for (const [, transporter] of poolRegistry.entries()) {
      try { transporter.close(); } catch {}
    }
    poolRegistry.clear();
  }
}

async function createEmailTransport({ requireEnabled = false, timeoutMs = 20000, channel = null } = {}) {
  const config = await getEmailSmtpConfiguration();
  const targetChannel = channel || config.activeProvider || 'qq';
  const channelConf = config.providers?.[targetChannel] || {
    host: config.host,
    port: config.port,
    secure: config.secure,
    username: config.username,
    fromName: config.fromName,
  };

  const password = await getEmailSmtpPassword(targetChannel);
  if ((requireEnabled && !config.enabled) || !channelConf.username || !password) {
    throw Object.assign(new Error('SMTP credentials are not configured'), { code: 'SMTP_NOT_CONFIGURED' });
  }

  const poolKey = `${channelConf.host}:${channelConf.port}:${channelConf.secure}:${channelConf.username}`;
  let transporter = poolRegistry.get(poolKey);

  if (!transporter) {
    transporter = nodemailer.createTransport({
      pool: true,
      maxConnections: 5,
      maxMessages: 100,
      host: channelConf.host,
      port: channelConf.port,
      secure: channelConf.secure,
      auth: { user: channelConf.username, pass: password },
      connectionTimeout: Math.min(10000, Math.max(1000, Number(timeoutMs) || 20000)),
      greetingTimeout: Math.min(10000, Math.max(1000, Number(timeoutMs) || 20000)),
      socketTimeout: Math.min(20000, Math.max(1000, Number(timeoutMs) || 20000)),
      tls: { minVersion: 'TLSv1.2', rejectUnauthorized: true },
      logger: false,
      debug: false,
    });
    poolRegistry.set(poolKey, transporter);
  }

  const effectiveConfig = {
    ...config,
    host: channelConf.host,
    port: channelConf.port,
    secure: channelConf.secure,
    username: channelConf.username,
    fromEmail: channelConf.username,
    fromName: channelConf.fromName || config.fromName || 'SupDance',
    provider: targetChannel,
  };

  return { config: effectiveConfig, transporter };
}

async function logSend(entry) {
  try {
    const { recordEmailSendLog } = await import('./repositories/emailSendLogs.js');
    await recordEmailSendLog(entry);
  } catch (error) {
    console.error('[email/send-log]', { code: error?.code || 'SEND_LOG_FAILED' });
  }
}

async function deliverEmail({ to, subject, text, html, purpose, requireEnabled = false, userId = null, actorId = null }) {
  const recipient = validEmail(to);
  if (!recipient) {
    throw Object.assign(new Error('请输入有效的收件邮箱'), { code: 'EMAIL_INVALID_RECIPIENT' });
  }

  let transport;
  const startedAt = Date.now();
  if (!text && html) {
    text = html.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  }

  const fullConfig = await getEmailSmtpConfiguration();
  const primaryChannel = fullConfig.activeProvider || 'qq';
  const backupChannel = fullConfig.failoverEnabled && fullConfig.backupProvider ? fullConfig.backupProvider : null;

  // 1. 发信速率限流检测
  if (fullConfig.rateLimitPerMinute > 0) {
    try {
      const { consumeRateLimit } = await import('./security/requestGuard.js');
      const rateCheck = await consumeRateLimit({
        scope: 'email_smtp_outbound',
        subject: 'system',
        limit: fullConfig.rateLimitPerMinute || 60,
        windowMs: 60 * 1000,
      });
      if (!rateCheck.allowed) {
        throw Object.assign(
          new Error(`邮件发送过于频繁，已达限流配额 (${fullConfig.rateLimitPerMinute} 封/分钟)，请稍后重试`),
          { code: 'RATE_LIMIT_EXCEEDED' }
        );
      }
    } catch (rateErr) {
      if (rateErr?.code === 'RATE_LIMIT_EXCEEDED') throw rateErr;
    }
  }

  // 2. 熔断器状态判定与主线路熔断分流
  const circuit = getEmailCircuitStatus(fullConfig);
  let useBackupDirectly = false;
  if (circuit.state === 'open') {
    if (backupChannel) {
      console.warn(`[email/circuit] 主线路 ${primaryChannel} 处于熔断开启状态，直接调度备用线路 ${backupChannel}`);
      useBackupDirectly = true;
    } else {
      const remainingSec = Math.max(1, Math.ceil((circuit.coolingPeriodSec * 1000 - (Date.now() - (circuit.openedAt || 0))) / 1000));
      throw Object.assign(
        new Error(`邮件发信通道已进入熔断保护（连续失败 ${circuit.consecutiveFailures} 次），冷却探测剩余 ${remainingSec} 秒`),
        { code: 'SMTP_CIRCUIT_OPEN' }
      );
    }
  }

  let created;
  let targetChannel = useBackupDirectly ? backupChannel : primaryChannel;
  try {
    try {
      created = await createEmailTransport({ requireEnabled, channel: targetChannel });
    } catch (err) {
      if (!useBackupDirectly && backupChannel && err?.code !== 'EMAIL_INVALID_RECIPIENT') {
        console.warn(`[email/failover] 主线路 ${primaryChannel} 初始化失败，自动调度备用线路 ${backupChannel}`);
        recordCircuitFailure(err, fullConfig.circuitBreaker?.failureThreshold || 5);
        created = await createEmailTransport({ requireEnabled, channel: backupChannel });
      } else {
        throw err;
      }
    }

    transport = created.transporter;
    let effectiveProvider = created.config.provider;

    const mailOptions = {
      from: { name: created.config.fromName || 'SupDance', address: created.config.fromEmail || created.config.username },
      to: recipient,
      subject,
      headers: { 'X-Auto-Response-Suppress': 'All' },
    };
    if (text) mailOptions.text = text;
    if (html) mailOptions.html = html;

    let result;
    try {
      result = await transport.sendMail(mailOptions);
      if (effectiveProvider === primaryChannel) {
        recordCircuitSuccess();
      }
    } catch (sendErr) {
      if (effectiveProvider === primaryChannel) {
        recordCircuitFailure(sendErr, fullConfig.circuitBreaker?.failureThreshold || 5);
      }
      if (backupChannel && effectiveProvider !== backupChannel) {
        console.warn(`[email/failover] 主线路 ${primaryChannel} 投递异常 (${sendErr.message})，正在经由备用线路 ${backupChannel} 容灾重试...`);
        const backupCreated = await createEmailTransport({ requireEnabled, channel: backupChannel });
        effectiveProvider = backupCreated.config.provider;
        const backupMailOptions = {
          ...mailOptions,
          from: { name: backupCreated.config.fromName || 'SupDance', address: backupCreated.config.fromEmail || backupCreated.config.username },
        };
        result = await backupCreated.transporter.sendMail(backupMailOptions);
      } else {
        throw sendErr;
      }
    }

    if (!Array.isArray(result.accepted) || result.accepted.length === 0) {
      throw Object.assign(new Error(`SMTP server did not accept the ${purpose} recipient`), { code: 'SMTP_REJECTED' });
    }
    const latencyMs = Date.now() - startedAt;
    await logSend({ purpose, recipient, subject, body: text, status: 'success', latencyMs, provider: effectiveProvider, userId, actorId });
    return { success: true, latencyMs };
  } catch (error) {
    const code = ['EMAIL_INVALID_RECIPIENT', 'SMTP_NOT_CONFIGURED', 'RATE_LIMIT_EXCEEDED', 'SMTP_CIRCUIT_OPEN'].includes(error?.code)
      ? error.code
      : smtpErrorCode(error);
    await logSend({
      purpose,
      recipient,
      subject,
      body: text,
      status: 'failed',
      errorCode: code,
      latencyMs: Date.now() - startedAt,
      provider: created?.config?.provider || targetChannel,
      userId,
      actorId,
    });
    console.error('[email/send]', { purpose, code });
    throw error;
  }
}

export async function verifyEmailSmtp({ timeoutMs = 10000, channel = null } = {}) {
  let transport;
  const startedAt = Date.now();
  try {
    const created = await createEmailTransport({ timeoutMs, channel });
    transport = created.transporter;
    await transport.verify();
    return { status: 'healthy', latencyMs: Date.now() - startedAt, errorCode: null };
  } catch (error) {
    const errorCode = error?.code === 'SMTP_NOT_CONFIGURED' ? error.code : smtpErrorCode(error);
    return { status: 'unavailable', latencyMs: Date.now() - startedAt, errorCode };
  }
}

export async function sendEmailSmtpTest({ to, actorId = null }) {
  const recipient = validEmail(to);
  if (!recipient) throw Object.assign(new Error('请输入有效的测试收件邮箱'), { code: 'EMAIL_INVALID_RECIPIENT' });

  try {
    return await deliverEmail({
      to: recipient,
      subject: '[SupDance] SMTP 邮件服务配置与连通性测试',
      text: `这是一封 SupDance 管理后台发出的 SMTP 连通性测试邮件。\n发送时间：${new Date().toISOString()}\n若你收到此邮件，说明当前邮件通道已配置妥当并连通正常。`,
      purpose: 'test',
      actorId,
    });
  } catch (error) {
    if (error.code === 'EMAIL_INVALID_RECIPIENT') throw error;
    throw Object.assign(new Error('测试邮件发送失败，请检查后台 SMTP 配置和收件地址'), { code: error.code });
  }
}

async function sendAuthRecoveryMessage({ to, code, flow, locale = 'zh-CN', userId = null }) {
  const recipient = validEmail(to);
  if (!recipient || !/^\d{6}$/.test(String(code || ''))) {
    throw Object.assign(new Error('Email verification input is invalid'), { code: 'EMAIL_VERIFICATION_INPUT_INVALID' });
  }
  const message = buildAuthRecoveryEmail({ code: String(code), flow, locale });
  try {
    return await deliverEmail({
      to: recipient,
      subject: message.subject,
      text: message.text,
      html: message.html,
      purpose: 'verification',
      requireEnabled: true,
      userId,
    });
  } catch (error) {
    if (['EMAIL_INVALID_RECIPIENT', 'EMAIL_VERIFICATION_INPUT_INVALID'].includes(error.code)) throw error;
    throw Object.assign(new Error('验证码邮件发送失败，请稍后重试'), { code: error.code });
  }
}

export async function sendEmailVerificationCode({ to, code, userId = null, locale = 'zh-CN' }) {
  return sendAuthRecoveryMessage({ to, code, flow: 'verify', locale, userId });
}

export async function sendPasswordResetEmail({ to, code, userId = null, locale = 'zh-CN' }) {
  return sendAuthRecoveryMessage({ to, code, flow: 'password', locale, userId });
}

export async function sendUsernameRecoveryEmail({ to, code, userId = null, locale = 'zh-CN' }) {
  return sendAuthRecoveryMessage({ to, code, flow: 'username', locale, userId });
}

export async function sendGenericEmail({ to, subject, text, html, purpose = 'system', requireEnabled = false, userId = null, actorId = null }) {
  return deliverEmail({ to, subject, text, html, purpose, requireEnabled, userId, actorId });
}
