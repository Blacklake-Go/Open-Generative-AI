import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {
  withAdminErrorBoundary,
  requirePermission,
  okResponse,
  errorResponse,
} from '@/lib/admin/authz';
import { PERMISSIONS } from '@/lib/admin/permissions';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MAX_LINES = 100;
const MAX_BYTES = 256 * 1024;

function resolveLogFile(type) {
  const appName = process.env.PM2_APP_NAME || 'supdance-ai-studio';
  const logDir = process.env.PM2_LOG_DIR || path.join(os.homedir(), '.pm2', 'logs');
  const fileName = type === 'error' ? `${appName}-error.log` : `${appName}-out.log`;
  return path.join(logDir, fileName);
}

async function tailLog(filePath) {
  let stat;
  try {
    stat = await fs.stat(filePath);
  } catch (error) {
    if (error?.code === 'ENOENT') return { lines: '', missing: true };
    throw error;
  }

  const bytesToRead = Math.min(stat.size, MAX_BYTES);
  if (bytesToRead <= 0) return { lines: '', missing: false };

  const handle = await fs.open(filePath, 'r');
  try {
    const buffer = Buffer.alloc(bytesToRead);
    await handle.read(buffer, 0, bytesToRead, Math.max(0, stat.size - bytesToRead));
    let text = buffer.toString('utf8');
    if (stat.size > bytesToRead) {
      const firstBreak = text.indexOf('\n');
      text = firstBreak === -1 ? '' : text.slice(firstBreak + 1);
    }
    const lines = text.split(/\r?\n/);
    if (lines.at(-1) === '') lines.pop();
    return { lines: lines.slice(-MAX_LINES).join('\n'), missing: false };
  } finally {
    await handle.close();
  }
}

async function handleGET(request) {
  const guard = await requirePermission(request, PERMISSIONS.healthRead);
  if (!guard.ok) return guard.response;

  const requestedType = request.nextUrl.searchParams.get('type') || 'out';
  if (!['out', 'error'].includes(requestedType)) {
    return errorResponse('VALIDATION_ERROR', '日志类型必须是 out 或 error', 422, guard.requestId);
  }

  const filePath = resolveLogFile(requestedType);
  try {
    const result = await tailLog(filePath);
    return okResponse(
      {
        type: requestedType,
        path: filePath,
        lines: result.lines,
        missing: result.missing,
        maxLines: MAX_LINES,
      },
      guard.requestId
    );
  } catch (error) {
    return errorResponse('LOG_READ_FAILED', '读取服务端日志失败', 500, guard.requestId);
  }
}

export const GET = withAdminErrorBoundary(handleGET);
