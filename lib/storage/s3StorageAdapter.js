import 'server-only';

import crypto from 'node:crypto';
import fsp from 'node:fs/promises';

const UNSIGNED_PAYLOAD = 'UNSIGNED-PAYLOAD';
const EMPTY_SHA256 = crypto.createHash('sha256').update(Buffer.alloc(0)).digest('hex');

function sha256Hex(data) {
  return crypto.createHash('sha256').update(data).digest('hex');
}

function hmac(key, data) {
  return crypto.createHmac('sha256', key).update(data).digest();
}

function rfc3986(value) {
  return encodeURIComponent(String(value)).replace(/[!'()*]/g, (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`);
}

function encodePath(key) {
  return String(key).split('/').map(rfc3986).join('/');
}

function amzDate(date = new Date()) {
  return date.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
}

function canonicalQuery(params = {}) {
  return Object.keys(params)
    .sort()
    .map((key) => `${rfc3986(key)}=${rfc3986(params[key] ?? '')}`)
    .join('&');
}

function standardAwsEndpoint(endpoint) {
  try {
    const host = new URL(endpoint).hostname.toLowerCase();
    return host === 's3.amazonaws.com'
      || (host.startsWith('s3.') && (host.endsWith('.amazonaws.com') || host.endsWith('.amazonaws.com.cn')))
      || (host.startsWith('s3-') && host.endsWith('.amazonaws.com'));
  } catch {
    return false;
  }
}

function storageError(code, message, extra = {}) {
  return Object.assign(new Error(message), { code, ...extra });
}

export class S3CompatibleStorageAdapter {
  constructor(config = {}) {
    this.provider = config.provider || 's3';
    this.endpoint = String(config.endpoint || '').trim().replace(/\/+$/, '');
    this.region = String(config.region || 'us-east-1').trim() || 'us-east-1';
    this.bucket = String(config.bucket || '').trim();
    this.accessKeyId = String(config.accessKeyId || '').trim();
    this.accessKeySecret = String(config.accessKeySecret || '');
    this.sessionToken = String(config.sessionToken || '');
    this.pathPrefix = String(config.pathPrefix || '').replace(/^\/+|\/+$/g, '');
    this.publicBaseUrl = String(config.publicBaseUrl || '').replace(/\/+$/, '');
    this.signedUrlTtl = Math.max(60, Number(config.signedUrlTtl) || 600);
    this.pathStyle = Boolean(config.pathStyle) || !standardAwsEndpoint(this.endpoint);
    this.timeoutMs = Math.max(1000, Number(config.timeoutMs) || 60000);
  }

  get configured() {
    return Boolean(this.endpoint && this.region && this.bucket && this.accessKeyId && this.accessKeySecret);
  }

  normalizeKey(key) {
    const raw = String(key || '').replace(/\\/g, '/').replace(/^\/+/, '');
    if (!raw || raw.includes('..') || raw.includes('\0')) {
      throw storageError('STORAGE_OBJECT_KEY_INVALID', '对象 Key 无效或存在安全风险');
    }
    if (!this.pathPrefix) return raw;
    return `${this.pathPrefix}/${raw}`;
  }

  buildTarget(key) {
    if (!this.endpoint) throw storageError('STORAGE_S3_NOT_CONFIGURED', 'S3 Endpoint 未配置');
    const endpoint = new URL(this.endpoint);
    const basePath = endpoint.pathname.replace(/\/+$/, '');
    const objectKey = encodePath(this.normalizeKey(key));
    if (this.pathStyle) {
      return {
        protocol: endpoint.protocol,
        host: endpoint.host,
        path: `${basePath}/${encodePath(this.bucket)}/${objectKey}`,
      };
    }
    return {
      protocol: endpoint.protocol,
      host: `${this.bucket}.${endpoint.host}`,
      path: `${basePath}/${objectKey}`,
    };
  }

  signRequest({ method, key, headers = {}, query = {}, payloadHash = UNSIGNED_PAYLOAD }) {
    const { protocol, host, path } = this.buildTarget(key);
    const now = new Date();
    const stamp = amzDate(now);
    const dateStamp = stamp.slice(0, 8);
    const lowerHeaders = { host, 'x-amz-content-sha256': payloadHash, 'x-amz-date': stamp };
    for (const [name, value] of Object.entries(headers)) {
      if (value !== undefined && value !== null && value !== '') lowerHeaders[name.toLowerCase()] = String(value);
    }
    if (this.sessionToken) lowerHeaders['x-amz-security-token'] = this.sessionToken;

    const signedHeaders = Object.keys(lowerHeaders).sort();
    const canonicalHeaders = signedHeaders.map((name) => `${name}:${String(lowerHeaders[name]).trim()}\n`).join('');
    const canonicalRequest = [
      method,
      path,
      canonicalQuery(query),
      canonicalHeaders,
      signedHeaders.join(';'),
      payloadHash,
    ].join('\n');

    const scope = `${dateStamp}/${this.region}/s3/aws4_request`;
    const stringToSign = ['AWS4-HMAC-SHA256', stamp, scope, sha256Hex(canonicalRequest)].join('\n');
    const signingKey = hmac(hmac(hmac(hmac(`AWS4${this.accessKeySecret}`, dateStamp), this.region), 's3'), 'aws4_request');
    const signature = crypto.createHmac('sha256', signingKey).update(stringToSign).digest('hex');
    const authorization = `AWS4-HMAC-SHA256 Credential=${this.accessKeyId}/${scope}, SignedHeaders=${signedHeaders.join(';')}, Signature=${signature}`;

    const sentHeaders = { ...headers, 'x-amz-content-sha256': payloadHash, 'x-amz-date': stamp };
    if (this.sessionToken) sentHeaders['x-amz-security-token'] = this.sessionToken;
    sentHeaders.Authorization = authorization;
    const queryString = canonicalQuery(query);
    return { url: `${protocol}//${host}${path}${queryString ? `?${queryString}` : ''}`, headers: sentHeaders };
  }

  async request({ method, key, headers = {}, query = {}, body = null, payloadHash }) {
    const signed = this.signRequest({
      method,
      key,
      headers,
      query,
      payloadHash: payloadHash || (body ? sha256Hex(body) : EMPTY_SHA256),
    });
    const response = await fetch(signed.url, {
      method,
      headers: signed.headers,
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
      headers: { 'content-type': contentType },
      body: buffer,
    });
    if (!response.ok) {
      const text = await response.text().catch(() => '');
      throw storageError('STORAGE_S3_UPLOAD_FAILED', `${this.provider.toUpperCase()} 上传失败 HTTP ${response.status}: ${text.slice(0, 200)}`, { statusCode: response.status });
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
    const response = await this.request({
      method: 'GET',
      key,
      headers: range ? { range } : {},
    });
    if (!response.ok) {
      throw storageError('STORAGE_S3_DOWNLOAD_FAILED', `${this.provider.toUpperCase()} 读取失败 HTTP ${response.status}`, { statusCode: response.status });
    }
    return {
      body: Buffer.from(await response.arrayBuffer()),
      contentType: response.headers.get('content-type'),
      contentLength: Number(response.headers.get('content-length') || 0),
    };
  }

  async downloadStream({ key, range } = {}) {
    const response = await this.request({ method: 'GET', key, headers: range ? { range } : {} });
    if (!response.ok) {
      throw storageError('STORAGE_S3_DOWNLOAD_FAILED', `${this.provider.toUpperCase()} 读取失败 HTTP ${response.status}`, { statusCode: response.status });
    }
    return response.body;
  }

  async getMetadata({ key } = {}) {
    const response = await this.request({ method: 'HEAD', key });
    if (!response.ok) {
      throw storageError('STORAGE_S3_METADATA_FAILED', `${this.provider.toUpperCase()} 元数据读取失败 HTTP ${response.status}`, { statusCode: response.status });
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
      throw storageError('STORAGE_S3_DELETE_FAILED', `${this.provider.toUpperCase()} 删除失败 HTTP ${response.status}: ${text.slice(0, 200)}`, { statusCode: response.status });
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

    const { protocol, host, path } = this.buildTarget(raw);
    const now = new Date();
    const stamp = amzDate(now);
    const dateStamp = stamp.slice(0, 8);
    const ttl = Math.min(86400, Math.max(60, Number(expires) || this.signedUrlTtl));
    const scope = `${dateStamp}/${this.region}/s3/aws4_request`;
    const query = {
      'X-Amz-Algorithm': 'AWS4-HMAC-SHA256',
      'X-Amz-Credential': `${this.accessKeyId}/${scope}`,
      'X-Amz-Date': stamp,
      'X-Amz-Expires': String(ttl),
      'X-Amz-SignedHeaders': 'host',
    };
    if (this.sessionToken) query['X-Amz-Security-Token'] = this.sessionToken;
    if (disposition === 'attachment') query['response-content-disposition'] = 'attachment';

    const canonicalRequest = [
      'GET',
      path,
      canonicalQuery(query),
      `host:${host}\n`,
      'host',
      UNSIGNED_PAYLOAD,
    ].join('\n');
    const stringToSign = ['AWS4-HMAC-SHA256', stamp, scope, sha256Hex(canonicalRequest)].join('\n');
    const signingKey = hmac(hmac(hmac(hmac(`AWS4${this.accessKeySecret}`, dateStamp), this.region), 's3'), 'aws4_request');
    query['X-Amz-Signature'] = crypto.createHmac('sha256', signingKey).update(stringToSign).digest('hex');
    return `${protocol}//${host}${path}?${canonicalQuery(query)}`;
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
