import { NextResponse } from 'next/server.js';

const PRODUCTION_CANVAS_ORIGINS = new Set([
  'https://www.supdance.com',
  'https://supdance.com',
  'https://canvas.supdance.com',
]);
const MAX_JSON_BYTES = 256 * 1024;
const CANVAS_HEADERS = ['x-supdance-canvas'];
const CANVAS_HEADER_VALUE = 'infinite-canvas-v1';

function isAllowedOrigin(origin) {
  if (!origin) return false;
  const lower = String(origin).trim().toLowerCase();
  if (PRODUCTION_CANVAS_ORIGINS.has(lower)) return true;
  return process.env.NODE_ENV !== 'production'
    && /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(String(origin || ''));
}

function originOf(request) {
  return String(request?.headers?.get?.('origin') || '').trim();
}

function attachCors(request, response) {
  const origin = originOf(request);
  if (isAllowedOrigin(origin)) {
    response.headers.set('Access-Control-Allow-Origin', origin);
    response.headers.set('Access-Control-Allow-Credentials', 'true');
    response.headers.set('Vary', 'Origin');
  }
  response.headers.set('Cache-Control', 'private, no-store');
  return response;
}

export function canvasJson(request, payload, init = {}) {
  return attachCors(request, NextResponse.json(payload, init));
}

export function canvasResponse(request, response) {
  return attachCors(request, response);
}

export function canvasOriginGuard(request) {
  if (!isAllowedOrigin(originOf(request))) {
    return NextResponse.json({ error: 'Canvas 请求来源无效', code: 'CANVAS_ORIGIN_INVALID' }, { status: 403 });
  }
  return null;
}

export function canvasPreflight(request, methods = 'GET, POST, PUT, DELETE, OPTIONS') {
  const blocked = canvasOriginGuard(request);
  if (blocked) return blocked;
  const response = new NextResponse(null, { status: 204 });
  attachCors(request, response);
  response.headers.set('Access-Control-Allow-Methods', methods);
  response.headers.set('Access-Control-Allow-Headers', 'Content-Type, Idempotency-Key, X-SupDance-Canvas, X-KoyoSIM-Canvas');
  response.headers.set('Access-Control-Max-Age', '600');
  return response;
}

export function canvasMutationGuard(request, { maxBytes = MAX_JSON_BYTES, multipart = false } = {}) {
  const blocked = canvasOriginGuard(request);
  if (blocked) return blocked;
  const headerVal = request.headers.get('x-supdance-canvas') || '';
  if (String(headerVal) !== CANVAS_HEADER_VALUE) {
    return canvasJson(request, { error: 'Canvas 客户端标识无效', code: 'CANVAS_CLIENT_REQUIRED' }, { status: 403 });
  }
  const contentType = String(request.headers.get('content-type') || '').toLowerCase();
  if (multipart ? !contentType.startsWith('multipart/form-data;') : !contentType.includes('application/json')) {
    return canvasJson(request, { error: '请求内容类型无效', code: 'INVALID_CONTENT_TYPE' }, { status: 415 });
  }
  const contentLength = Number(request.headers.get('content-length') || 0);
  if (Number.isFinite(contentLength) && contentLength > maxBytes) {
    return canvasJson(request, { error: '请求内容过大', code: 'BODY_TOO_LARGE' }, { status: 413 });
  }
  return null;
}

export async function readCanvasJson(request, maxBytes = MAX_JSON_BYTES) {
  const text = await request.text();
  if (Buffer.byteLength(text, 'utf8') > maxBytes) {
    const error = new Error('请求内容过大');
    error.code = 'BODY_TOO_LARGE';
    throw error;
  }
  try {
    const value = JSON.parse(text);
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('请求体必须是对象');
    return value;
  } catch {
    const error = new Error('请求 JSON 格式无效');
    error.code = 'INVALID_JSON';
    throw error;
  }
}

export function validateCanvasSnapshot(snapshot) {
  if (!snapshot || typeof snapshot !== 'object' || Array.isArray(snapshot)) {
    throw Object.assign(new Error('项目快照格式无效'), { code: 'INVALID_PROJECT_SNAPSHOT' });
  }
  const serialized = JSON.stringify(snapshot);
  if (Buffer.byteLength(serialized, 'utf8') > 2 * 1024 * 1024) {
    throw Object.assign(new Error('项目快照超过 2 MB，请先将媒体上传到素材库'), { code: 'PROJECT_SNAPSHOT_TOO_LARGE' });
  }
  const pending = [snapshot];
  let visited = 0;
  while (pending.length) {
    const current = pending.pop();
    if (typeof current === 'string') {
      if (/^data:[^,]{0,120};base64,/i.test(current)) {
        throw Object.assign(new Error('项目不能保存内嵌 Base64 媒体，请先将媒体上传到素材库'), { code: 'INLINE_MEDIA_UPLOAD_REQUIRED' });
      }
      continue;
    }
    if (!current || typeof current !== 'object') continue;
    visited += 1;
    if (visited > 50_000) throw Object.assign(new Error('项目结构过于复杂'), { code: 'PROJECT_SNAPSHOT_TOO_COMPLEX' });
    for (const value of Object.values(current)) pending.push(value);
  }
  return snapshot;
}
