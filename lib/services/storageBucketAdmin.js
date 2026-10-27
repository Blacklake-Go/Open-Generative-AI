import 'server-only';

import { readStorageSettings } from '../storage/storageSettingsV2.js';
import {
  publicBucketAdminSettings,
  readBucketAdminSettings,
  saveBucketAdminSettings,
} from '../storage/storageBucketAdminSettings.js';
import {
  readCosBucketConfig,
  testCosBucketAdminCredentials,
  updateCosBucketAcl,
  updateCosBucketCors,
  updateCosBucketEncryption,
  updateCosBucketLifecycle,
  updateCosBucketPolicy,
  updateCosBucketReferer,
  updateCosBucketVersioning,
} from '../storage/cosBucketConfig.js';

const UPDATERS = {
  acl: updateCosBucketAcl,
  cors: updateCosBucketCors,
  versioning: updateCosBucketVersioning,
  encryption: updateCosBucketEncryption,
  referer: updateCosBucketReferer,
  lifecycle: updateCosBucketLifecycle,
  policy: updateCosBucketPolicy,
};

function bucketTarget(settings) {
  return {
    region: settings?.region || '',
    bucket: settings?.bucket || '',
    endpoint: settings?.endpoint || '',
  };
}

function requireCosTarget(settings) {
  if (!settings || settings.provider !== 'cos') {
    throw Object.assign(new Error('当前生效存储不是腾讯云 COS，桶级配置不可用'), {
      code: 'BUCKET_ADMIN_UNSUPPORTED',
      statusCode: 422,
    });
  }
  if (!settings.bucket) {
    throw Object.assign(new Error('当前 COS 配置缺少 Bucket'), { code: 'BUCKET_ADMIN_UNSUPPORTED', statusCode: 422 });
  }
  return bucketTarget(settings);
}

async function readAdminCredentials() {
  const admin = await readBucketAdminSettings({ fresh: true });
  if (!admin?.accessKeyId || !admin?.accessKeySecret) {
    throw Object.assign(new Error('请先保存桶级管理 Access Key，再读写桶级配置'), {
      code: 'BUCKET_ADMIN_NOT_CONFIGURED',
      statusCode: 409,
    });
  }
  return admin;
}

export async function getBucketAdminOverview() {
  const settings = await readStorageSettings({ fresh: true });
  let admin = null;
  let credentialsError = '';
  try {
    admin = await readBucketAdminSettings();
  } catch (error) {
    credentialsError = String(error?.message || '桶级管理密钥读取失败').slice(0, 300);
  }
  const credentials = publicBucketAdminSettings(admin);

  if (!settings || settings.provider !== 'cos') {
    return {
      supported: false,
      configured: false,
      reason: '当前生效存储不是腾讯云 COS；切换为 COS 后可在这里读写桶级配置。',
      credentials,
      target: null,
    };
  }

  const target = bucketTarget(settings);
  if (credentialsError) {
    return { supported: true, configured: false, credentials, target, error: credentialsError };
  }
  if (!admin?.accessKeyId || !admin?.accessKeySecret) {
    return { supported: true, configured: false, credentials, target };
  }

  try {
    const config = await readCosBucketConfig({
      accessKeyId: admin.accessKeyId,
      accessKeySecret: admin.accessKeySecret,
      ...target,
    });
    return { supported: true, configured: true, credentials, target, config };
  } catch (error) {
    return {
      supported: true,
      configured: true,
      credentials,
      target,
      error: String(error?.message || '桶级配置读取失败').slice(0, 300),
    };
  }
}

export async function saveBucketAdminCredentials({ accessKeyId = '', accessKeySecret = '', actorEmail = 'system' } = {}) {
  const settings = await readStorageSettings({ fresh: true });
  const target = requireCosTarget(settings);
  const current = await readBucketAdminSettings({ fresh: true }).catch(() => null);

  const candidate = {
    accessKeyId: String(accessKeyId || '').trim() || current?.accessKeyId || '',
    accessKeySecret: String(accessKeySecret || '') || current?.accessKeySecret || '',
  };
  if (!candidate.accessKeyId || !candidate.accessKeySecret) {
    throw Object.assign(new Error('请填写桶级管理 Access Key ID 与 Secret'), {
      code: 'BUCKET_ADMIN_KEY_REQUIRED',
      statusCode: 422,
    });
  }

  try {
    await testCosBucketAdminCredentials({ ...candidate, ...target });
  } catch (error) {
    throw Object.assign(new Error(`桶级管理密钥校验失败：${error?.message || '无权访问该存储桶'}`), {
      code: 'BUCKET_ADMIN_TEST_FAILED',
      statusCode: 422,
    });
  }

  const saved = await saveBucketAdminSettings({ ...candidate, actorEmail });
  return {
    credentials: publicBucketAdminSettings(saved),
    overview: await getBucketAdminOverview(),
  };
}

export async function updateBucketAdminConfig({ section = '', value = {}, actorEmail = 'system' } = {}) {
  const updater = UPDATERS[section];
  if (!updater) {
    throw Object.assign(new Error('不支持的桶级配置项'), { code: 'BUCKET_ADMIN_SECTION_INVALID', statusCode: 422 });
  }

  const settings = await readStorageSettings({ fresh: true });
  const target = requireCosTarget(settings);
  const admin = await readAdminCredentials();

  try {
    await updater({ accessKeyId: admin.accessKeyId, accessKeySecret: admin.accessKeySecret, ...target }, value);
  } catch (error) {
    throw Object.assign(new Error(String(error?.message || '桶级配置更新失败').slice(0, 300)), {
      code: error?.code || 'BUCKET_ADMIN_UPDATE_FAILED',
      statusCode: error?.statusCode || 422,
    });
  }

  return await getBucketAdminOverview();
}
