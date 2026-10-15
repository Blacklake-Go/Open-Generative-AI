import 'server-only';

import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { pipeline } from 'node:stream/promises';
import { StorageAdapter } from './storageAdapter.js';

const MIME_EXTENSIONS = new Map([
  ['image/jpeg', 'jpg'], ['image/png', 'png'], ['image/webp', 'webp'], ['image/gif', 'gif'], ['image/avif', 'avif'],
  ['video/mp4', 'mp4'], ['video/quicktime', 'mov'], ['video/webm', 'webm'],
  ['audio/mpeg', 'mp3'], ['audio/wav', 'wav'], ['audio/x-wav', 'wav'], ['audio/aac', 'aac'], ['audio/mp4', 'm4a'], ['audio/flac', 'flac'], ['audio/ogg', 'ogg'],
  ['application/pdf', 'pdf'],
]);
const EXT_MIMES = new Map([...MIME_EXTENSIONS.entries()].map(([mime, ext]) => [ext, mime]));

function extensionFromName(name) {
  const ext = path.extname(String(name || '')).slice(1).toLowerCase();
  return ext.replace(/[^a-z0-9]/g, '');
}

function detectMimeFromBuffer(head, declaredMime = '', filename = '') {
  const declared = String(declaredMime || '').split(';')[0].trim().toLowerCase();
  const ext = extensionFromName(filename);
  if (head?.length >= 8 && head.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'image/png';
  if (head?.length >= 3 && head[0] === 0xff && head[1] === 0xd8 && head[2] === 0xff) return 'image/jpeg';
  if (head?.length >= 12 && head.toString('ascii', 0, 4) === 'RIFF' && head.toString('ascii', 8, 12) === 'WEBP') return 'image/webp';
  if (head?.length >= 6 && /^GIF8[79]a/.test(head.toString('ascii', 0, 6))) return 'image/gif';
  if (head?.length >= 12 && head.toString('ascii', 4, 8) === 'ftyp') return ext === 'mov' ? 'video/quicktime' : 'video/mp4';
  if (declared && (MIME_EXTENSIONS.has(declared) || declared.startsWith('video/') || declared.startsWith('audio/'))) return declared;
  return EXT_MIMES.get(ext) || 'application/octet-stream';
}

function resolveDefaultStorageDir() {
  const configured = String(process.env.AMH_STORAGE_DIR || process.env.STORAGE_LOCAL_DIR || '').trim();
  if (configured) return path.resolve(configured);
  return path.resolve(process.cwd(), 'public', 'uploads');
}

function resolveDefaultUrlPrefix() {
  const configured = String(process.env.AMH_STORAGE_URL_PREFIX || process.env.STORAGE_PUBLIC_URL_PREFIX || '').trim();
  if (configured) return configured.replace(/\/+$/, '');
  return '/uploads';
}

export class AmhStorageAdapter extends StorageAdapter {
  constructor(config = {}) {
    super('amh');
    this.provider = 'amh';
    this.storageDir = config.storageDir ? path.resolve(config.storageDir) : resolveDefaultStorageDir();
    this.publicUrlPrefix = config.publicUrlPrefix ? String(config.publicUrlPrefix).replace(/\/+$/, '') : resolveDefaultUrlPrefix();
  }

  get configured() {
    return Boolean(this.storageDir);
  }

  resolvePath(key) {
    const raw = String(key || '').replace(/\\/g, '/');
    const cleaned = raw.replace(/^\/+/, '');
    if (!cleaned || cleaned.includes('..') || cleaned.includes('\0')) {
      throw Object.assign(new Error('对象 Key 无效或存在安全风险'), { code: 'STORAGE_OBJECT_KEY_INVALID' });
    }
    const fullPath = path.resolve(this.storageDir, cleaned);
    if (!fullPath.startsWith(this.storageDir + path.sep) && fullPath !== this.storageDir) {
      throw Object.assign(new Error('对象路径超出存储根目录'), { code: 'STORAGE_OBJECT_PATH_OUT_OF_BOUNDS' });
    }
    return { fullPath, normalizedKey: cleaned };
  }

  async ensureDir(dirPath) {
    await fsp.mkdir(dirPath, { recursive: true, mode: 0o755 });
  }

  async upload({ key, body, contentType = 'application/octet-stream', size } = {}) {
    if (body && typeof body === 'object' && body.filePath) {
      return this.multipartUpload({ key, filePath: body.filePath, contentType });
    }
    if (!Buffer.isBuffer(body) && typeof body !== 'string' && !(body instanceof Uint8Array)) {
      throw Object.assign(new Error('上传内容格式无效，必须为 Buffer、Uint8Array 或包含 filePath'), { code: 'STORAGE_UPLOAD_BODY_INVALID' });
    }
    const buffer = Buffer.isBuffer(body) ? body : Buffer.from(body);
    const { fullPath, normalizedKey } = this.resolvePath(key);
    await this.ensureDir(path.dirname(fullPath));

    const tempPath = `${fullPath}.${crypto.randomUUID()}.tmp`;
    try {
      await fsp.writeFile(tempPath, buffer, { mode: 0o644 });
      await fsp.rename(tempPath, fullPath);
    } catch (err) {
      await fsp.unlink(tempPath).catch(() => {});
      throw err;
    }

    return {
      provider: this.provider,
      key: normalizedKey,
      size: buffer.length,
      location: this.getUrl({ key: normalizedKey }),
    };
  }

  async multipartUpload({ key, filePath, contentType = 'application/octet-stream', onProgress } = {}) {
    if (!filePath || !fs.existsSync(filePath)) {
      throw Object.assign(new Error('待上传源文件不存在'), { code: 'STORAGE_UPLOAD_FILE_NOT_FOUND' });
    }
    const { fullPath, normalizedKey } = this.resolvePath(key);
    await this.ensureDir(path.dirname(fullPath));

    const stat = await fsp.stat(filePath);
    const tempPath = `${fullPath}.${crypto.randomUUID()}.tmp`;
    try {
      await fsp.copyFile(filePath, tempPath);
      await fsp.rename(tempPath, fullPath);
      onProgress?.({ loaded: stat.size, total: stat.size, percent: 100 });
    } catch (err) {
      await fsp.unlink(tempPath).catch(() => {});
      throw err;
    }

    return {
      provider: this.provider,
      key: normalizedKey,
      size: stat.size,
      location: this.getUrl({ key: normalizedKey }),
    };
  }

  async download({ key, range } = {}) {
    const { fullPath } = this.resolvePath(key);
    if (!fs.existsSync(fullPath)) {
      throw Object.assign(new Error('存储文件不存在'), { code: 'STORAGE_FILE_NOT_FOUND', statusCode: 404 });
    }
    let buffer = await fsp.readFile(fullPath);
    if (range && typeof range === 'string') {
      const match = range.match(/bytes=(\d+)-(\d+)?/);
      if (match) {
        const start = parseInt(match[1], 10);
        const end = match[2] ? parseInt(match[2], 10) + 1 : buffer.length;
        buffer = buffer.subarray(start, end);
      }
    }
    return {
      body: buffer,
      metadata: await this.getMetadata({ key }),
    };
  }

  async downloadStream({ key, range } = {}) {
    const { fullPath } = this.resolvePath(key);
    if (!fs.existsSync(fullPath)) {
      throw Object.assign(new Error('存储文件不存在'), { code: 'STORAGE_FILE_NOT_FOUND', statusCode: 404 });
    }
    let options = {};
    if (range && typeof range === 'string') {
      const match = range.match(/bytes=(\d+)-(\d+)?/);
      if (match) {
        options.start = parseInt(match[1], 10);
        if (match[2]) options.end = parseInt(match[2], 10);
      }
    }
    return fs.createReadStream(fullPath, options);
  }

  async delete({ key } = {}) {
    const { fullPath, normalizedKey } = this.resolvePath(key);
    if (fs.existsSync(fullPath)) {
      await fsp.unlink(fullPath).catch(() => {});
    }
    return { provider: this.provider, key: normalizedKey, deleted: true };
  }

  async exists({ key } = {}) {
    try {
      const { fullPath } = this.resolvePath(key);
      return fs.existsSync(fullPath);
    } catch {
      return false;
    }
  }

  async getMetadata({ key } = {}) {
    const { fullPath, normalizedKey } = this.resolvePath(key);
    if (!fs.existsSync(fullPath)) {
      throw Object.assign(new Error('存储文件不存在'), { code: 'STORAGE_FILE_NOT_FOUND', statusCode: 404 });
    }
    const stat = await fsp.stat(fullPath);
    const fd = await fsp.open(fullPath, 'r');
    const sample = Buffer.alloc(Math.min(4096, stat.size));
    if (stat.size > 0) {
      await fd.read(sample, 0, sample.length, 0);
    }
    await fd.close();

    const mimeType = detectMimeFromBuffer(sample, '', normalizedKey);
    return {
      provider: this.provider,
      key: normalizedKey,
      size: stat.size,
      mimeType,
      lastModified: stat.mtime.toISOString(),
    };
  }

  getUrl({ key } = {}) {
    if (!key) return '';
    const raw = String(key || '').trim();
    if (/^https?:\/\//i.test(raw) || raw.startsWith('data:')) return raw;
    if (raw.startsWith('/')) return raw;
    const normalized = raw.replace(/^\/+/, '').replace(/\\/g, '/');
    const encodedSegments = normalized.split('/').map(encodeURIComponent).join('/');
    return `${this.publicUrlPrefix}/${encodedSegments}`;
  }

  async getSignedUrl({ key, disposition } = {}) {
    const directUrl = this.getUrl({ key });
    if (disposition === 'attachment') {
      const sep = directUrl.includes('?') ? '&' : '?';
      return `${directUrl}${sep}disposition=attachment`;
    }
    return directUrl;
  }

  async copy({ sourceKey, destinationKey } = {}) {
    const src = this.resolvePath(sourceKey).fullPath;
    const { fullPath: dst, normalizedKey: dstKey } = this.resolvePath(destinationKey);
    if (!fs.existsSync(src)) {
      throw Object.assign(new Error('源文件不存在'), { code: 'STORAGE_FILE_NOT_FOUND' });
    }
    await this.ensureDir(path.dirname(dst));
    await fsp.copyFile(src, dst);
    const stat = await fsp.stat(dst);
    return { provider: this.provider, key: dstKey, size: stat.size };
  }

  async move({ sourceKey, destinationKey } = {}) {
    const src = this.resolvePath(sourceKey).fullPath;
    const { fullPath: dst, normalizedKey: dstKey } = this.resolvePath(destinationKey);
    if (!fs.existsSync(src)) {
      throw Object.assign(new Error('源文件不存在'), { code: 'STORAGE_FILE_NOT_FOUND' });
    }
    await this.ensureDir(path.dirname(dst));
    await fsp.rename(src, dst);
    const stat = await fsp.stat(dst);
    return { provider: this.provider, key: dstKey, size: stat.size };
  }

  async testConnection() {
    const testDir = path.join(this.storageDir, 'health-check');
    await this.ensureDir(testDir);
    const testKey = `health-check/amh-probe-${crypto.randomUUID()}.txt`;
    const { fullPath } = this.resolvePath(testKey);
    const timings = {};
    const testPayload = Buffer.from(`amh-storage-probe ${Date.now()}`);

    let written = false;
    try {
      let started = Date.now();
      await fsp.writeFile(fullPath, testPayload);
      timings.writeMs = Date.now() - started;
      written = true;

      started = Date.now();
      const readBack = await fsp.readFile(fullPath);
      timings.readMs = Date.now() - started;

      if (!readBack.equals(testPayload)) {
        throw Object.assign(new Error('AMH 存储读写校验失败'), { code: 'STORAGE_VERIFY_FAILED' });
      }

      started = Date.now();
      await fsp.unlink(fullPath);
      timings.deleteMs = Date.now() - started;

      return {
        provider: this.provider,
        status: 'healthy',
        storageDir: this.storageDir,
        timings,
      };
    } catch (error) {
      if (written) await fsp.unlink(fullPath).catch(() => {});
      throw Object.assign(new Error(`AMH 存储目录检测失败: ${error.message}`), {
        code: error.code || 'STORAGE_UNAVAILABLE',
        provider: this.provider,
        storageDir: this.storageDir,
        timings,
      });
    }
  }
}
