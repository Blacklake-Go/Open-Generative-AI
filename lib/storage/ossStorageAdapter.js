import 'server-only';

import crypto from 'node:crypto';
import fsp from 'node:fs/promises';

function hmacSha1Base64(secret, data) {
  return crypto.createHmac('sha1', secret).update(data).digest('base64');
}

function encodePath(key) {
  return String(key).split('/').map((part) => encodeURIComponent(part).replace(/[!'()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`)).join('/');
}

function storageError(code, message, extra = {}) {
  return Object.assign(new Error(message), { code, ...extra });
}

export class AliyunOssStorageAdapter {
  constructor(config = {}) {
    this.provider = 'oss';
    this.region = String(config.region || 'cn-hangzhou').trim();
    this.endpoint = String(config.endpoint || `https://oss-${this.region}.aliyuncs.com`).trim().replace(/\/+$/, '');
    this.bucket = String(config.bucket || '').trim();
    this.accessKeyId = String(config.accessKeyId || '').trim();
    this.accessKeySecret = String(config.accessKeySecret || '');
    this.pathPrefix = String(config.pathPrefix || '').replace(/^\/+|\/+$/g, '');
    this.publicBaseUrl = String(config.publicBaseUrl || '').replace(/\/+$/, '');
    this.pathStyle = Boolean(config.pathStyle);
    this.signedUrlTtl = Math.max(60, Number(config.signedUrlTtl) || 600);
    this.timeoutMs = Math.max(1000, Number(config.timeoutMs) || 60000);
  }

  get configured() {
    return Boolean(this.endpoint && this.bucket && this.accessKeyId && this.accessKeySecret);
  }

  normalizeKey(key) {
    const raw = String(key || '').replace(/\\/g, '/').replace(/^\/+/, '');
    if (!raw || raw.includes('..') || raw.includes('\0')) {
      throw storageError('STORAGE_OBJECT_KEY_INVALID', '对象 Key 无效或存在安全风险');
    }
    return this.pathPrefix ? `${this.pathPrefix}/${raw}` : raw;
  }

  buildTarget(key) {
    const endpoint = new URL(this.endpoint);
    const objectKey = this.normalizeKey(key);
    if (this.pathStyle) {
      return {
        protocol: endpoint.protocol,
        host: endpoint.host,
        path: `${endpoint.pathname.replace(/\/+$/, '')}/${encodeURIComponent(this.bucket)}/${encodePath(objectKey)}`,
        resource: `/${this.bucket}/${objectKey}`,
      };
    }
    return {
      protocol: endpoint.protocol,
      host: `${this.bucket}.${endpoint.host}`,
      path: `${endpoint.pathname.replace(/\/+$/, '')}/${encodePath(objectKey)}`,
      resource: `/${this.bucket}/${objectKey}`,
    };
  }

  signHeaders({ method, key, contentType = '', date = new Date().toUTCString() }) {
    const { resource } = this.buildTarget(key);
    const stringToSign = `${method}\n\n${contentType}\n${date}\n${resource}`;
    const signature = hmacSha1Base64(this.accessKeySecret, stringToSign);
    return { Date: date, Authorization: `OSS ${this.accessKeyId}:${signature}` };
  }

  async request({ method, key, headers = {}, body = null }) {
    const { protocol, host, path } = this.buildTarget(key);
    const url = `${protocol}//${host}${path}`;
    const authHeaders = this.signHeaders({ method, key, contentType: headers['Content-Type'] || headers['content-type'] || '' });
    const response = await fetch(url, {
      method,
      headers: { ...headers, ...authHeaders },
      body: body || undefined,
      signal: AbortSignal.timeout(this.timeoutMs),
    });
    return response;
  }

  async upload({ key, body, contentType = 'application/octet-stream', size } = {}) {
    const buffer = Buffer.isBuffer(body)
      ? body
      : (typeof body === 'string' ? Buffer.from(body) : (body instanceof Uint8Array ? Buffer.from(body) : null));
    if (!buffer) throw storageError('STORAGE_UPLOAD_BODY_INVALID', '上传内容格式无效');
    if (Number.isFinite(Number(size)) && Number(size) !== buffer.length) {
      throw storageError('STORAGE_UPLOAD_BODY_INVALID', '上传内容长度与声明不一致');
    }
    const response = await this.request({
      method: 'PUT',
      key,
      headers: { 'Content-Type': contentType },
      body: buffer,
    });
    if (!response.ok) {
      const text = await response.text().catch(() => '');
      throw storageError('STORAGE_OSS_UPLOAD_FAILED', `阿里云 OSS 上传失败 HTTP ${response.status}: ${text.slice(0, 200)}`, { statusCode: response.status });
    }
    return {
      provider: this.provider,
      key: this.normalizeKey(key),
      bucket: this.bucket,
      region: this.region,
      etag: (response.headers.get('etag') || '').replace(/"/g, ''),
    };
  }

  async multipartUpload({ key, filePath, contentType = 'application/octet-stream' } = {}) {
    const buffer = await fsp.readFile(filePath);
    return this.upload({ key, body: buffer, contentType, size: buffer.length });
  }

  async download({ key, range } = {}) {
    const response = await this.request({ method: 'GET', key, headers: range ? { Range: range } : {} });
    if (!response.ok) {
      throw storageError('STORAGE_OSS_DOWNLOAD_FAILED', `阿里云 OSS 读取失败 HTTP ${response.status}`, { statusCode: response.status });
    }
    return {
      body: Buffer.from(await response.arrayBuffer()),
      contentType: response.headers.get('content-type'),
      contentLength: Number(response.headers.get('content-length') || 0),
    };
  }

  async downloadStream({ key, range } = {}) {
    const response = await this.request({ method: 'GET', key, headers: range ? { Range: range } : {} });
    if (!response.ok) {
      throw storageError('STORAGE_OSS_DOWNLOAD_FAILED', `阿里云 OSS 读取失败 HTTP ${response.status}`, { statusCode: response.status });
    }
    return response.body;
  }

  async getMetadata({ key } = {}) {
    const response = await this.request({ method: 'HEAD', key });
    if (!response.ok) {
      throw storageError('STORAGE_OSS_METADATA_FAILED', `阿里云 OSS 元数据读取失败 HTTP ${response.status}`, { statusCode: response.status });
    }
    return {
      size: Number(response.headers.get('content-length') || 0),
      mimeType: response.headers.get('content-type') || '',
      lastModified: response.headers.get('last-modified') || null,
      etag: (response.headers.get('etag') || '').replace(/"/g, ''),
    };
  }

  async exists({ key } = {}) {
    const response = await this.request({ method: 'HEAD', key });
    return response.ok;
  }

  async delete({ key } = {}) {
    const response = await this.request({ method: 'DELETE', key });
    if (!response.ok && response.status !== 404) {
      const text = await response.text().catch(() => '');
      throw storageError('STORAGE_OSS_DELETE_FAILED', `阿里云 OSS 删除失败 HTTP ${response.status}: ${text.slice(0, 200)}`, { statusCode: response.status });
    }
    return true;
  }

  getUrl({ key } = {}) {
    if (!key) return '';
    const normalized = this.normalizeKey(key);
    if (this.publicBaseUrl) return `${this.publicBaseUrl}/${encodePath(normalized)}`;
    const { protocol, host, path } = this.buildTarget(key);
    return `${protocol}//${host}${path}`;
  }

  async getSignedUrl({ key, disposition = 'inline', expires } = {}) {
    if (!key) return '';
    const raw = String(key).trim();
    if (/^https?:\/\//i.test(raw) || raw.startsWith('data:')) return raw;
    if (this.publicBaseUrl) return `${this.publicBaseUrl}/${encodePath(this.normalizeKey(raw))}`;

    const ttl = Math.min(86400, Math.max(60, Number(expires) || this.signedUrlTtl));
    const expiresAt = Math.floor(Date.now() / 1000) + ttl;
    const { protocol, host, path, resource } = this.buildTarget(raw);
    const stringToSign = `GET\n\n\n${expiresAt}\n${resource}`;
    const signature = hmacSha1Base64(this.accessKeySecret, stringToSign);
    const query = new URLSearchParams({
      OSSAccessKeyId: this.accessKeyId,
      Expires: String(expiresAt),
      Signature: signature,
    });
    if (disposition === 'attachment') query.set('response-content-disposition', 'attachment');
    return `${protocol}//${host}${path}?${query.toString()}`;
  }

  async testConnection() {
    const key = `${this.pathPrefix ? `${this.pathPrefix}/` : ''}.storage-tests/${crypto.randomUUID()}.txt`;
    const payload = Buffer.from('supdance-storage-test');
    const startedAt = Date.now();
    await this.upload({ key, body: payload, contentType: 'text/plain', size: payload.length });
    try {
      const got = await this.download({ key });
      if (!got.body.equals(payload)) {
        throw storageError('STORAGE_TEST_READ_MISMATCH', '对象存储读取内容与写入不一致');
      }
    } finally {
      await this.delete({ key }).catch(() => {});
    }
    return { ok: true, provider: this.provider, latencyMs: Date.now() - startedAt };
  }
}
