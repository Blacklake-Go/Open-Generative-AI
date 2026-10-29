/**
 * 供应商凭据来源与验证等级的可展示口径。
 *
 * 纯逻辑、不读环境变量也不碰数据库：解析结果由 providerSecrets.js 提供，
 * 探测与生成证据由 circuitBreaker 的渠道视图提供，这里只负责把它们翻译成
 * 管理员能核对的一句话。口径必须单调：没有证据就不能把「密钥非空」升级成
 * 「鉴权通过」或「真实生成通过」。
 */

export const CREDENTIAL_SOURCE = Object.freeze({
  ENVIRONMENT: 'environment',
  ENCRYPTED_DATABASE: 'encrypted_database',
  NONE: 'none',
});

export const CREDENTIAL_SOURCE_LABELS = Object.freeze({
  environment: '服务器环境变量',
  encrypted_database: '加密数据库',
  none: '未配置',
});

export const CREDENTIAL_ENVIRONMENT_LABELS = Object.freeze({
  production: '生产',
  sandbox: '沙盒',
});

export const CREDENTIAL_DECRYPT_LABELS = Object.freeze({
  ok: '读取正常',
  missing: '无存盘记录',
  error: '解密 / 读取失败',
  unknown: '未校验',
});

export const CREDENTIAL_STATE_LABELS = Object.freeze({
  configured: '已配置',
  unconfigured: '未配置',
  read_error: '读取失败',
});

/** 验证等级的状态词。未知与未验证分开：没测过不是测失败。 */
export const VERIFICATION_STATE_LABELS = Object.freeze({
  verified: '已验证',
  failed: '未通过',
  credential_only: '仅凭据校验',
  unknown: '未知',
  unverified: '未验证',
});

export const VERIFICATION_TIER_LABELS = Object.freeze({
  config: '凭据配置',
  auth: '认证验证',
  modelAccess: '模型权限',
  generation: '生成验证',
});

const TONES = Object.freeze({
  configured: 'success',
  verified: 'success',
  unconfigured: 'warning',
  credential_only: 'warning',
  read_error: 'danger',
  failed: 'danger',
  unknown: 'neutral',
  unverified: 'neutral',
});

function isoOrNull(value) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function sanitizeNames(names) {
  if (!Array.isArray(names)) return [];
  return names
    .map((name) => String(name ?? '').trim())
    .filter((name) => /^[A-Z0-9_]+$/.test(name));
}

function tier(key, state, at, note) {
  const normalized = VERIFICATION_STATE_LABELS[state] ? state : 'unknown';
  return {
    key,
    label: VERIFICATION_TIER_LABELS[key],
    state: normalized,
    stateLabel: VERIFICATION_STATE_LABELS[normalized],
    tone: TONES[normalized] || 'neutral',
    at: isoOrNull(at),
    note: note || '',
  };
}

/**
 * 把 resolveServerCredential 的快照翻译成后台展示对象。
 *
 * 两条硬规则：
 * - 状态是 error 时不能因为旧 configured 标志为真就说「已配置」；
 * - 环境变量优先时，库内密钥即便存在也不是当前生效凭据，必须显式提示。
 */
export function buildCredentialView({
  snapshot = {},
  storedSecrets = [],
  envNames = [],
} = {}) {
  const status = String(snapshot?.status || '').toLowerCase();
  const readError = status === 'error';
  const records = Array.isArray(storedSecrets)
    ? storedSecrets
        .map((record) => ({
          name: String(record?.name ?? '').trim(),
          updatedAt: isoOrNull(record?.updatedAt),
        }))
        .filter((record) => record.name)
    : [];
  const hasStoredSecret = records.length > 0;
  const configured = snapshot?.configured === true && !readError;

  let source = CREDENTIAL_SOURCE.NONE;
  if (configured && snapshot?.source === CREDENTIAL_SOURCE.ENVIRONMENT) source = CREDENTIAL_SOURCE.ENVIRONMENT;
  else if (configured && snapshot?.source === CREDENTIAL_SOURCE.ENCRYPTED_DATABASE) source = CREDENTIAL_SOURCE.ENCRYPTED_DATABASE;

  const selectedEnvironment = snapshot?.selectedEnvironment === 'sandbox' ? 'sandbox'
    : snapshot?.selectedEnvironment === 'production' ? 'production'
      : null;
  // 环境变量不区分生产/沙盒，只有加密数据库里的双密钥才有「当前环境」。
  const environment = source === CREDENTIAL_SOURCE.ENCRYPTED_DATABASE ? selectedEnvironment : null;
  const environmentLabel = environment
    ? CREDENTIAL_ENVIRONMENT_LABELS[environment]
    : source === CREDENTIAL_SOURCE.ENVIRONMENT
      ? '环境变量（不区分环境）'
      : '—';

  // 变更时间取「当前生效的那条密钥」；解析器没有声明名称时才退到库内最新记录。
  const activeSecretName = String(snapshot?.secretName || '').trim() || null;
  const activeRecord = activeSecretName ? records.find((record) => record.name === activeSecretName) : null;
  const timestamps = records.map((record) => record.updatedAt).filter(Boolean).sort();
  const storedSecretUpdatedAt = activeRecord?.updatedAt || (timestamps.length > 0 ? timestamps[timestamps.length - 1] : null);

  const decryptStatus = readError
    ? 'error'
    : source === CREDENTIAL_SOURCE.ENCRYPTED_DATABASE
      ? 'ok'
      : hasStoredSecret
        ? 'unknown'
        : 'missing';

  return {
    source,
    sourceLabel: readError ? '读取异常' : CREDENTIAL_SOURCE_LABELS[source],
    configured,
    readError,
    decryptStatus,
    decryptStatusLabel: CREDENTIAL_DECRYPT_LABELS[decryptStatus],
    environment,
    environmentLabel,
    // 只有加密数据库来源才有可解释的变更时间；环境变量的改动时间在进程环境里无从得知。
    updatedAt: source === CREDENTIAL_SOURCE.ENCRYPTED_DATABASE ? storedSecretUpdatedAt : null,
    storedSecretUpdatedAt,
    hasStoredSecret,
    storedSecretNames: records.map((record) => record.name),
    activeSecretName,
    envNames: sanitizeNames(envNames),
    configState: readError ? 'read_error' : configured ? 'configured' : 'unconfigured',
    overrideNote: source === CREDENTIAL_SOURCE.ENVIRONMENT && hasStoredSecret
      ? '当前执行使用服务器环境变量；库内另有加密备用密钥，保存新密钥不会切换执行凭据。'
      : null,
    readErrorNote: readError
      ? '加密凭据读取失败，无法确认当前是否可用；请检查加密密钥与数据库连接后重试。'
      : null,
  };
}

/**
 * 四个验证维度各自独立取证据：
 * - 凭据配置看解析结果与变更时间；
 * - 认证验证只看最近一次探针口径，credential 探针没有发出网络请求；
 * - 模型权限目前没有持久化证据，保持未知而不是默认通过；
 * - 生成验证看真实生成 attempt 的最近成功时间。
 */
export function buildVerificationView({
  credential = null,
  probe = null,
  generation = null,
  modelAccess = null,
} = {}) {
  const config = tier(
    'config',
    credential?.configState || 'unconfigured',
    credential?.updatedAt || null,
    credential?.readError
      ? credential.readErrorNote
      : credential?.configured
        ? '凭据已解析，尚未代表鉴权或生成通过'
        : '尚无可用凭据'
  );

  const probeKind = probe?.probeKind === 'credential' ? 'credential'
    : probe?.probeKind === 'http' ? 'http'
      : null;
  const probeAt = probe?.checkedAt || null;
  const probeHealthy = probe?.healthStatus === 'healthy' || probe?.status === 'healthy';
  let auth;
  if (!probe || (!probeKind && !probeAt)) {
    auth = tier('auth', 'unverified', null, '尚未执行健康探测');
  } else if (probeKind === 'credential') {
    auth = tier('auth', 'credential_only', probeAt, '最近一次仅校验凭据是否配齐，未请求上游鉴权');
  } else if (probeKind === 'http') {
    auth = tier(
      'auth',
      probeHealthy ? 'verified' : 'failed',
      probeAt,
      probeHealthy ? '最近一次实测请求已被上游接口接受' : '最近一次实测请求未通过，需排查网络、鉴权或上游故障'
    );
  } else {
    auth = tier('auth', 'unknown', probeAt, '最近一次探测未声明口径，不能据此判断鉴权结果');
  }

  const modelAccessAt = modelAccess?.lastSuccessAt || null;
  const modelAccessTier = modelAccessAt
    ? tier('modelAccess', 'verified', modelAccessAt, '最近一次模型目录同步成功')
    : tier('modelAccess', 'unknown', null, '尚无模型列表权限的持久化证据');

  const lastSuccessAt = generation?.lastSuccessAt || null;
  const lastAttemptAt = generation?.lastAttemptAt || null;
  let generationTier;
  if (lastSuccessAt) {
    generationTier = tier('generation', 'verified', lastSuccessAt, '最近一次真实生成成功');
  } else if (lastAttemptAt) {
    generationTier = tier('generation', 'failed', lastAttemptAt, '有生成调用记录但尚无成功终态');
  } else {
    generationTier = tier('generation', 'unverified', null, '尚无生成调用记录');
  }

  return { config, auth, modelAccess: modelAccessTier, generation: generationTier };
}
