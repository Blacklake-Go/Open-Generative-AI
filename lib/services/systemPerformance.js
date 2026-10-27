import os from 'node:os';
import fs from 'node:fs';
import { getPgStats, healthCheck } from '../db/index.js';

function readDisk() {
  try {
    const stats = fs.statfsSync(process.cwd());
    const totalBytes = stats.blocks * stats.bsize;
    const freeBytes = stats.bfree * stats.bsize;
    const usedBytes = totalBytes - freeBytes;
    let writable = true;
    try {
      fs.accessSync(process.cwd(), fs.constants.W_OK);
    } catch {
      writable = false;
    }
    return {
      available: true,
      writable,
      totalBytes,
      usedBytes,
      freeBytes: stats.bavail * stats.bsize,
      usagePercent: totalBytes ? (usedBytes / totalBytes) * 100 : 0,
    };
  } catch {
    return { available: false, writable: false, totalBytes: 0, usedBytes: 0, freeBytes: 0, usagePercent: 0 };
  }
}

function readHost() {
  return {
    hostname: os.hostname(),
    system: `${os.platform()} / ${os.arch()}`,
    cpuCores: os.cpus().length,
    loadAverage: os.loadavg(),
    processId: process.pid,
    uptimeSeconds: Math.floor(process.uptime()),
    hostUptimeSeconds: Math.floor(os.uptime()),
    nodeVersion: process.version,
  };
}

function readMemory() {
  const mem = process.memoryUsage();
  const totalBytes = os.totalmem();
  const usedBytes = totalBytes - os.freemem();
  return {
    totalBytes,
    usedBytes,
    usagePercent: totalBytes ? (usedBytes / totalBytes) * 100 : 0,
    rssBytes: mem.rss,
    heapTotalBytes: mem.heapTotal,
    heapUsedBytes: mem.heapUsed,
    externalBytes: mem.external + mem.arrayBuffers,
  };
}

export async function collectSystemPerformance({ database = null, migrations = null } = {}) {
  const db = database || (await healthCheck().catch(() => ({ ok: false, latencyMs: null, pool: { total: 0, idle: 0, waiting: 0, max: 0 } })));
  const postgres = await getPgStats().catch(() => null);
  const applied = migrations?.applied?.length ?? 0;
  const pending = migrations?.pending?.length ?? 0;
  return {
    collectedAt: new Date().toISOString(),
    host: readHost(),
    memory: readMemory(),
    disk: readDisk(),
    database: {
      connected: Boolean(db.ok),
      latencyMs: db.latencyMs,
      pool: db.pool || { total: 0, idle: 0, waiting: 0, max: 0 },
      schema: { current: applied, expected: applied + pending, ready: applied > 0 && pending === 0 },
      latestMigration: migrations?.latest || null,
      postgres,
    },
  };
}
