import 'server-only';

import crypto from 'node:crypto';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { StorageAdapter } from './storageAdapter.js';

/**
 * 腾讯云私有对象存储 (COS) 适配器
 *
 * 核心安全特性：
 * 1. 产物转存：生成任务完成后，产物直接转存入平台专属私有 COS 桶，彻底切断外部供应商临时外链与公网 public/uploads 静态目录。
 * 2. 临时防盗链签名：默认签发 10 分钟 (TTL 600s) 临时防盗链签名 URL (q-sign-algorithm=sha1)，支持 attachment/inline disposition。
 * 3. 私有化隔离：桶权限为私有读写 (Private)，拒绝匿名遍历与非法直连下载。
 * 4. 离线/测试容错：在未配置真实 COS 密钥的本地测试环境下，安全将数据隔离于 private 存储目录，并保持严格的 10 分钟签名契约。
 */
export class CosStorageAdapter extends StorageAdapter {
  constructor(config = {}) {
    super('cos');
    this.provider = 'cos';
    this.secretId = String(config.secretId || process.env.COS_SECRET_ID || process.env.TENCENT_SECRET_ID || '').trim();
    this.secretKey = String(config.secretKey || process.env.COS_SECRET_KEY || process.env.TENCENT_SECRET_KEY || '').trim();
    this.bucket = String(config.bucket || process.env.COS_BUCKET || '').trim();
    this.region = String(config.region || process.env.COS_REGION || 'ap-guangzhou').trim();
    this.endpointHost = String(config.endpoint || '')
      .trim()
      .replace(/^https?:\/\//i, '')
      .replace(/\/.*$/, '');
    this.pathPrefix = String(config.pathPrefix || '').replace(/^\/+|\/+$/g, '');
    this.customDomain = String(config.customDomain || process.env.COS_CUSTOM_DOMAIN || '').trim().replace(/\/+$/, '');
    this.signedUrlTtl = Math.max(60, Number(config.signedUrlTtl || process.env.COS_SIGNED_URL_TTL) || 600); // 10 分钟 (600 秒)

    // 本地私有隔离目录（防止回落到 public/uploads 造成公网泄露）
    const defaultPrivateDir = path.resolve(process.cwd(), 'storage', 'private_cos');
    this.privateStorageDir = config.privateStorageDir
      ? path.resolve(config.privateStorageDir)
      : (process.env.COS_PRIVATE_STORAGE_DIR ? path.resolve(process.env.COS_PRIVATE_STORAGE_DIR) : defaultPrivateDir);
  }

  get configured() {
    return Boolean(this.secretId && this.secretKey && this.bucket);
  }

  get host() {
    if (this.customDomain) {
      return this.customDomain.replace(/^https?:\/\//i, '');
    }
    const bucket = this.bucket || 'private-bucket';
    if (this.endpointHost) {
      return this.endpointHost.startsWith(`${bucket}.`) ? this.endpointHost : `${bucket}.${this.endpointHost}`;
    }
    return `${bucket}.cos.${this.region}.myqcloud.com`;
  }

  normalizeKey(key) {
    const raw = String(key || '').replace(/\\/g, '/');
    const cleaned = raw.replace(/^\/+/, '');
    if (!cleaned || cleaned.includes('..') || cleaned.includes('\0')) {
      throw Object.assign(new Error('对象 Key 无效或存在安全风险'), { code: 'STORAGE_OBJECT_KEY_INVALID' });
    }
    return this.pathPrefix ? `${this.pathPrefix}/${cleaned}` : cleaned;
  }

  async ensurePrivateDir(dirPath) {
    await fsp.mkdir(dirPath, { recursive: true, mode: 0o700 });
  }

  resolveLocalPath(key) {
    const normalized = this.normalizeKey(key);
    const fullPath = path.resolve(this.privateStorageDir, normalized);
    if (!fullPath.startsWith(this.privateStorageDir + path.sep) && fullPath !== this.privateStorageDir) {
      throw Object.assign(new Error('对象路径超出私有存储根目录'), { code: 'STORAGE_OBJECT_PATH_OUT_OF_BOUNDS' });
    }
    return { fullPath, normalizedKey: normalized };
  }

  /**
   * 生成腾讯云 COS V5 标准 Authorization 字符串或签名参数
   */
  generateCosSignature({
    method = 'get',
    pathname = '/',
    queryParams = {},
    headers = {},
    startTime = Math.floor(Date.now() / 1000),
    expiresIn = 600,
  } = {}) {
    const signAlgorithm = 'sha1';
    const endTime = startTime + expiresIn;
    const signTime = `${startTime};${endTime}`;
    const keyTime = signTime;

    const secretKey = this.secretKey || 'mock_secret_key';
    const secretId = this.secretId || 'mock_secret_id';

    // 1. 生成 SignKey = HMAC-SHA1(SecretKey, KeyTime)
    const signKey = crypto.createHmac('sha1', secretKey).update(keyTime).digest('hex');

    // 2. 格式化参数
    const sortedParamKeys = Object.keys(queryParams).map((k) => k.toLowerCase()).sort();
    const urlParamList = sortedParamKeys.join(';');
    const formatParameters = sortedParamKeys
      .map((k) => `${k}=${encodeURIComponent(queryParams[k] ?? '')}`)
      .join('&');

    // 3. 格式化头部
    const sortedHeaderKeys = Object.keys(headers).map((k) => k.toLowerCase()).sort();
    const headerList = sortedHeaderKeys.join(';');
    const formatHeaders = sortedHeaderKeys
      .map((k) => `${k}=${encodeURIComponent(headers[k] ?? '')}`)
      .join('&');

    // 4. 格式化请求字符串 FormatString
    const lowerMethod = method.toLowerCase();
    const cleanPath = pathname.startsWith('/') ? pathname : `/${pathname}`;
    const formatString = `${lowerMethod}\n${cleanPath}\n${formatParameters}\n${formatHeaders}\n`;

    // 5. 生成 StringToSign
    const stringToSign = `sha1\n${signTime}\n${crypto.createHash('sha1').update(formatString).digest('hex')}\n`;

    // 6. 生成 Signature
    const signature = crypto.createHmac('sha1', signKey).update(stringToSign).digest('hex');

    return {
      signAlgorithm,
      secretId,
      signTime,
      keyTime,
      headerList,
      urlParamList,
      signature,
      authorization: `q-sign-algorithm=${signAlgorithm}&q-ak=${secretId}&q-sign-time=${signTime}&q-key-time=${keyTime}&q-header-list=${headerList}&q-url-param-list=${urlParamList}&q-signature=${signature}`,
    };
  }

  getUrl({ key } = {}) {
    if (!key) return '';
    const raw = String(key || '').trim();
    if (/^https?:\/\//i.test(raw) || raw.startsWith('data:')) return raw;
    const normalized = this.normalizeKey(raw);
    return `https://${this.host}/${normalized}`;
  }

  /**
   * 生成 10 分钟临时防盗链签名 URL (TTL 600s)
   * 严禁直接输出裸直链，彻底切断公网 public/uploads 匿名访问
   */
  async getSignedUrl({ key, disposition = 'inline', expires = 600 } = {}) {
    if (!key) return '';
    const raw = String(key || '').trim();
    if (/^https?:\/\//i.test(raw) && !raw.includes(this.host)) return raw;
    if (raw.startsWith('data:')) return raw;

    const normalizedKey = this.normalizeKey(raw);
    const ttl = Math.max(60, Math.min(86400, Number(expires) || this.signedUrlTtl));
    const nowSec = Math.floor(Date.now() / 1000);

    const queryParams = {};
    if (disposition === 'attachment') {
      queryParams['response-content-disposition'] = 'attachment';
    }

    const {
      signAlgorithm,
      secretId,
      signTime,
      keyTime,
      headerList,
      urlParamList,
      signature,
    } = this.generateCosSignature({
      method: 'get',
      pathname: `/${normalizedKey}`,
      queryParams,
      startTime: nowSec,
      expiresIn: ttl,
    });

    const queryParts = [
      `q-sign-algorithm=${signAlgorithm}`,
      `q-ak=${encodeURIComponent(secretId)}`,
      `q-sign-time=${signTime}`,
      `q-key-time=${keyTime}`,
      `q-header-list=${headerList}`,
      `q-url-param-list=${urlParamList}`,
      `q-signature=${signature}`,
    ];

    if (disposition === 'attachment') {
      queryParts.push('response-content-disposition=attachment');
    }

    return `https://${this.host}/${normalizedKey}?${queryParts.join('&')}`;
  }

  async upload({ key, body, contentType = 'application/octet-stream', size } = {}) {
    const normalizedKey = this.normalizeKey(key);
    const buffer = Buffer.isBuffer(body)
      ? body
      : (typeof body === 'string' ? Buffer.from(body) : (body instanceof Uint8Array ? Buffer.from(body) : null));

    if (!buffer && (!body || !body.filePath)) {
      throw Object.assign(new Error('上传内容格式无效，必须为 Buffer、Uint8Array 或包含 filePath'), { code: 'STORAGE_UPLOAD_BODY_INVALID' });
    }

    const uploadBuffer = buffer || await fsp.readFile(body.filePath);

    if (this.configured) {
      const pathname = `/${normalizedKey}`;
      const auth = this.generateCosSignature({
        method: 'put',
        pathname,
        headers: {
          host: this.host,
          'content-type': contentType,
        },
      });

      const url = `https://${this.host}${pathname}`;
      const response = await fetch(url, {
        method: 'PUT',
        headers: {
          Host: this.host,
          'Content-Type': contentType,
          Authorization: auth.authorization,
        },
        body: uploadBuffer,
      });

      if (!response.ok) {
        const errorText = await response.text().catch(() => '');
        throw Object.assign(new Error(`COS 上传失败 HTTP ${response.status}: ${errorText.slice(0, 200)}`), {
          code: 'STORAGE_COS_UPLOAD_FAILED',
          statusCode: response.status,
        });
      }
    } else {
      // 离线/测试环境：存入本地隔离私有存储目录
      const { fullPath } = this.resolveLocalPath(normalizedKey);
      await this.ensurePrivateDir(path.dirname(fullPath));
      await fsp.writeFile(fullPath, uploadBuffer, { mode: 0o600 });
    }

    return {
      provider: this.provider,
      key: normalizedKey,
      bucket: this.bucket || 'private-cos',
      region: this.region,
      size: uploadBuffer.length,
      location: this.getUrl({ key: normalizedKey }),
    };
  }

  async multipartUpload({ key, filePath, contentType = 'application/octet-stream' } = {}) {
    const buffer = await fsp.readFile(filePath);
    return this.upload({ key, body: buffer, contentType, size: buffer.length });
  }

  async download({ key } = {}) {
    const normalizedKey = this.normalizeKey(key);

    if (this.configured) {
      const pathname = `/${normalizedKey}`;
      const auth = this.generateCosSignature({
        method: 'get',
        pathname,
        headers: { host: this.host },
      });
      const response = await fetch(`https://${this.host}${pathname}`, {
        headers: {
          Host: this.host,
          Authorization: auth.authorization,
        },
      });
      if (!response.ok) {
        throw Object.assign(new Error(`COS 下载失败 HTTP ${response.status}`), {
          code: 'STORAGE_FILE_NOT_FOUND',
          statusCode: response.status,
        });
      }
      const arrayBuffer = await response.arrayBuffer();
      return {
        body: Buffer.from(arrayBuffer),
        contentType: response.headers.get('content-type') || 'application/octet-stream',
        size: Number(response.headers.get('content-length') || 0),
      };
    }

    const { fullPath } = this.resolveLocalPath(normalizedKey);
    if (!fs.existsSync(fullPath)) {
      throw Object.assign(new Error('私有文件不存在'), { code: 'STORAGE_FILE_NOT_FOUND' });
    }
    const body = await fsp.readFile(fullPath);
    return {
      body,
      contentType: 'application/octet-stream',
      size: body.length,
    };
  }

  async downloadStream({ key } = {}) {
    const result = await this.download({ key });
    const { Readable } = await import('node:stream');
    return Readable.from(result.body);
  }

  async exists({ key } = {}) {
    const normalizedKey = this.normalizeKey(key);

    if (this.configured) {
      const pathname = `/${normalizedKey}`;
      const auth = this.generateCosSignature({
        method: 'head',
        pathname,
        headers: { host: this.host },
      });
      try {
        const response = await fetch(`https://${this.host}${pathname}`, {
          method: 'HEAD',
          headers: { Host: this.host, Authorization: auth.authorization },
        });
        return response.ok;
      } catch {
        return false;
      }
    }

    const { fullPath } = this.resolveLocalPath(normalizedKey);
    return fs.existsSync(fullPath);
  }

  async delete({ key } = {}) {
    const normalizedKey = this.normalizeKey(key);

    if (this.configured) {
      const pathname = `/${normalizedKey}`;
      const auth = this.generateCosSignature({
        method: 'delete',
        pathname,
        headers: { host: this.host },
      });
      const response = await fetch(`https://${this.host}${pathname}`, {
        method: 'DELETE',
        headers: { Host: this.host, Authorization: auth.authorization },
      });
      return { deleted: response.ok, key: normalizedKey };
    }

    const { fullPath } = this.resolveLocalPath(normalizedKey);
    if (fs.existsSync(fullPath)) {
      await fsp.unlink(fullPath).catch(() => {});
      return { deleted: true, key: normalizedKey };
    }
    return { deleted: false, key: normalizedKey };
  }

  async getMetadata({ key } = {}) {
    const normalizedKey = this.normalizeKey(key);

    if (this.configured) {
      const pathname = `/${normalizedKey}`;
      const auth = this.generateCosSignature({
        method: 'head',
        pathname,
        headers: { host: this.host },
      });
      const response = await fetch(`https://${this.host}${pathname}`, {
        method: 'HEAD',
        headers: { Host: this.host, Authorization: auth.authorization },
      });
      if (!response.ok) {
        throw Object.assign(new Error('对象不存在'), { code: 'STORAGE_FILE_NOT_FOUND' });
      }
      return {
        key: normalizedKey,
        provider: this.provider,
        bucket: this.bucket,
        region: this.region,
        size: Number(response.headers.get('content-length') || 0),
        mimeType: response.headers.get('content-type') || 'application/octet-stream',
        lastModified: response.headers.get('last-modified') || new Date().toISOString(),
      };
    }

    const { fullPath } = this.resolveLocalPath(normalizedKey);
    if (!fs.existsSync(fullPath)) {
      throw Object.assign(new Error('私有文件不存在'), { code: 'STORAGE_FILE_NOT_FOUND' });
    }
    const stat = await fsp.stat(fullPath);
    return {
      key: normalizedKey,
      provider: this.provider,
      bucket: this.bucket || 'private-cos',
      region: this.region,
      size: stat.size,
      mimeType: 'application/octet-stream',
      lastModified: stat.mtime.toISOString(),
    };
  }

  async testConnection() {
    if (this.configured) {
      const testKey = `health-check/cos-probe-${crypto.randomUUID()}.txt`;
      const pathname = `/${testKey}`;
      const probePayload = Buffer.from(`cos-probe ${Date.now()}`);
      const auth = this.generateCosSignature({
        method: 'put',
        pathname,
        headers: { host: this.host, 'content-type': 'text/plain' },
      });
      const start = Date.now();
      const response = await fetch(`https://${this.host}${pathname}`, {
        method: 'PUT',
        headers: { Host: this.host, 'Content-Type': 'text/plain', Authorization: auth.authorization },
        body: probePayload,
      });
      const latencyMs = Date.now() - start;
      if (response.ok) {
        // 清理探针文件
        const delAuth = this.generateCosSignature({ method: 'delete', pathname, headers: { host: this.host } });
        await fetch(`https://${this.host}${pathname}`, { method: 'DELETE', headers: { Host: this.host, Authorization: delAuth.authorization } }).catch(() => {});
        return {
          provider: this.provider,
          status: 'healthy',
          bucket: this.bucket,
          region: this.region,
          latencyMs,
        };
      }
      return {
        provider: this.provider,
        status: 'degraded',
        statusCode: response.status,
        bucket: this.bucket,
        region: this.region,
      };
    }

    // 离线/测试模式
    await this.ensurePrivateDir(this.privateStorageDir);
    return {
      provider: this.provider,
      status: 'healthy',
      bucket: this.bucket || 'local-test-bucket',
      region: this.region,
      privateStorageDir: this.privateStorageDir,
    };
  }
}
