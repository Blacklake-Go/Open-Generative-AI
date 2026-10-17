import 'server-only';

import { getSettingByKey } from './services/settings.js';
import { getProviderSecret } from './repositories/providers.js';

export const EMAIL_SMTP_PROVIDER = 'email_smtp';
export const QQ_EXMAIL_SMTP_HOST = 'smtp.exmail.qq.com';

export const EMAIL_PROVIDERS = Object.freeze({
  qq: {
    id: 'qq',
    name: 'QQ 企业邮箱',
    host: 'smtp.exmail.qq.com',
    port: 465,
    secure: true,
    defaultFromName: 'SupDance',
    description: '腾讯官方企业邮 TLS 465 专属专线，连接稳定，高送达率',
  },
  aliyun: {
    id: 'aliyun',
    name: '阿里云 DirectMail',
    host: 'smtpdm.aliyun.com',
    port: 465,
    secure: true,
    defaultFromName: 'SupDance',
    description: '阿里云邮件推送服务，企业级发信通道，支持事务与批量营销',
  },
  resend: {
    id: 'resend',
    name: 'Resend',
    host: 'smtp.resend.com',
    port: 465,
    secure: true,
    defaultFromName: 'SupDance',
    description: '全球开发者级邮件投递基础设施，现代化极速通道',
  },
  custom: {
    id: 'custom',
    name: '自定义 SMTP 服务器',
    host: '',
    port: 465,
    secure: true,
    defaultFromName: 'SupDance',
    description: '支持任何符合 RFC 5321 协议的标准 SMTP/SMTPS 服务器',
  },
});

const DEFAULT_CONFIG = Object.freeze({
  enabled: false,
  activeProvider: 'qq',
  backupProvider: null,
  failoverEnabled: true,
  rateLimitPerMinute: 60,
  circuitBreaker: {
    failureThreshold: 5,
    coolingPeriodSec: 60,
  },
  host: QQ_EXMAIL_SMTP_HOST,
  port: 465,
  secure: true,
  username: '',
  fromName: 'SupDance',
  providers: {
    qq: { enabled: true, username: '', host: QQ_EXMAIL_SMTP_HOST, port: 465, secure: true, fromName: 'SupDance' },
    aliyun: { enabled: false, username: '', host: 'smtpdm.aliyun.com', port: 465, secure: true, fromName: 'SupDance' },
    resend: { enabled: false, username: '', host: 'smtp.resend.com', port: 465, secure: true, fromName: 'SupDance' },
    custom: { enabled: false, username: '', host: '', port: 465, secure: true, fromName: 'SupDance' },
  },
});

export async function getEmailSmtpConfiguration() {
  let saved = null;
  try {
    const setting = await getSettingByKey('email_smtp');
    saved = setting?.value && typeof setting.value === 'object' ? setting.value : null;
  } catch {
    // Keep server environment defaults if the optional admin setting is absent.
  }

  const activeProvider = String(saved?.activeProvider || 'qq').toLowerCase();
  const providerDef = EMAIL_PROVIDERS[activeProvider] || EMAIL_PROVIDERS.qq;

  const savedProviders = saved?.providers && typeof saved.providers === 'object' ? saved.providers : {};
  const activeChannelConfig = savedProviders[activeProvider] || {};

  const host = String(activeChannelConfig.host || saved?.host || providerDef.host || QQ_EXMAIL_SMTP_HOST).trim();
  const port = Number(activeChannelConfig.port || saved?.port || providerDef.port || 465);
  const secure = activeChannelConfig.secure !== undefined ? Boolean(activeChannelConfig.secure) : (saved?.secure !== undefined ? Boolean(saved.secure) : true);

  const username = String(activeChannelConfig.username || saved?.username || process.env.EMAIL_SMTP_USER || '').trim().toLowerCase();
  const fromName = String(activeChannelConfig.fromName || saved?.fromName || process.env.EMAIL_SMTP_FROM_NAME || DEFAULT_CONFIG.fromName).trim().slice(0, 100);

  return {
    enabled: saved?.enabled === true,
    activeProvider,
    backupProvider: saved?.backupProvider || null,
    failoverEnabled: saved?.failoverEnabled !== false,
    rateLimitPerMinute: Number(saved?.rateLimitPerMinute || 60),
    circuitBreaker: {
      failureThreshold: Number(saved?.circuitBreaker?.failureThreshold || 5),
      coolingPeriodSec: Number(saved?.circuitBreaker?.coolingPeriodSec || 60),
    },
    host,
    port,
    secure,
    username,
    fromEmail: username,
    fromName,
    providers: {
      qq: {
        host: QQ_EXMAIL_SMTP_HOST,
        port: 465,
        secure: true,
        username: String(savedProviders.qq?.username || (activeProvider === 'qq' ? username : '')).trim(),
        fromName: String(savedProviders.qq?.fromName || (activeProvider === 'qq' ? fromName : 'SupDance')).trim(),
        enabled: savedProviders.qq?.enabled !== false,
      },
      aliyun: {
        host: 'smtpdm.aliyun.com',
        port: 465,
        secure: true,
        username: String(savedProviders.aliyun?.username || (activeProvider === 'aliyun' ? username : '')).trim(),
        fromName: String(savedProviders.aliyun?.fromName || (activeProvider === 'aliyun' ? fromName : 'SupDance')).trim(),
        enabled: Boolean(savedProviders.aliyun?.enabled),
      },
      resend: {
        host: 'smtp.resend.com',
        port: 465,
        secure: true,
        username: String(savedProviders.resend?.username || (activeProvider === 'resend' ? username : '')).trim(),
        fromName: String(savedProviders.resend?.fromName || (activeProvider === 'resend' ? fromName : 'SupDance')).trim(),
        enabled: Boolean(savedProviders.resend?.enabled),
      },
      custom: {
        host: String(savedProviders.custom?.host || (activeProvider === 'custom' ? host : '')).trim(),
        port: Number(savedProviders.custom?.port || (activeProvider === 'custom' ? port : 465)),
        secure: savedProviders.custom?.secure !== undefined ? Boolean(savedProviders.custom?.secure) : true,
        username: String(savedProviders.custom?.username || (activeProvider === 'custom' ? username : '')).trim(),
        fromName: String(savedProviders.custom?.fromName || (activeProvider === 'custom' ? fromName : 'SupDance')).trim(),
        enabled: Boolean(savedProviders.custom?.enabled),
      },
    },
  };
}

export async function getEmailSmtpPassword(channel = null) {
  const envPassword = String(process.env.EMAIL_SMTP_PASSWORD || '').trim();
  if (channel && channel !== 'qq') {
    try {
      const channelValue = await getProviderSecret(EMAIL_SMTP_PROVIDER, `smtp_password_${channel}`);
      return typeof channelValue === 'string' && channelValue.trim() ? channelValue.trim() : null;
    } catch {
      return null;
    }
  }
  if (envPassword) return envPassword;
  try {
    const value = await getProviderSecret(EMAIL_SMTP_PROVIDER, 'smtp_password');
    return typeof value === 'string' && value.trim() ? value.trim() : (envPassword || null);
  } catch {
    return envPassword || null;
  }
}

export async function hasEmailSmtpPassword(channel = null) {
  return Boolean(await getEmailSmtpPassword(channel));
}
