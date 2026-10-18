import fs from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import { NextResponse } from 'next/server.js';
import {
  isIpV4InChina,
  isIpV6InChina,
  isLoopbackOrPrivate,
  ipToInt,
} from '../../lib/security/chinaIpBlock.js';

/**
 * 临时插件：中国流量屏蔽 (China IP Block Plugin)
 * 
 * 核心设计目标：
 * 1. 确保所有来自中国大陆的访客 IP 均被准确识别并拦截返回 403 Forbidden 响应
 * 2. 毫秒级内存缓存与二分查找，零数据库请求开销，不增加正常访问延迟
 * 3. 严格模块化隔离，支持通过 `node plugins/china-ip-block/uninstall.mjs` 一键完全移除
 */

const STATE_FILE_PATH = path.join(process.cwd(), 'plugins', 'china-ip-block', 'state.json');

const DEFAULT_CONFIG = {
  enabled: false,
  exemptAdmin: true,
  whitelistIps: '',
  pageTitle: '403 Forbidden',
  updatedAt: new Date().toISOString(),
  updatedBy: 'system',
};

// 内存热缓存（2 秒刷新周期，保证多请求并发性能）
let memoryConfig = null;
let memoryConfigTime = 0;
const CACHE_TTL_MS = 2000;

export function getPluginConfig() {
  const now = Date.now();
  if (memoryConfig && now - memoryConfigTime < CACHE_TTL_MS) {
    return memoryConfig;
  }

  try {
    if (fs.existsSync(STATE_FILE_PATH)) {
      const raw = fs.readFileSync(STATE_FILE_PATH, 'utf-8');
      const parsed = JSON.parse(raw);
      memoryConfig = { ...DEFAULT_CONFIG, ...parsed };
      memoryConfigTime = now;
      return memoryConfig;
    }
  } catch (err) {
    console.warn('[ChinaIpBlockPlugin] 读取 state.json 失败，使用内存预设:', err.message);
  }

  if (!memoryConfig) {
    memoryConfig = { ...DEFAULT_CONFIG };
    memoryConfigTime = now;
  }
  return memoryConfig;
}

export function updatePluginConfig(partialConfig) {
  const current = getPluginConfig();
  const nextConfig = {
    ...current,
    ...partialConfig,
    updatedAt: new Date().toISOString(),
  };

  memoryConfig = nextConfig;
  memoryConfigTime = Date.now();

  try {
    const dir = path.dirname(STATE_FILE_PATH);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(STATE_FILE_PATH, JSON.stringify(nextConfig, null, 2), 'utf-8');
  } catch (err) {
    console.error('[ChinaIpBlockPlugin] 写入 state.json 失败:', err);
  }

  return nextConfig;
}

export const syncChinaIpBlockState = updatePluginConfig;

/**
 * 校验指定 IP 是否在管理员白名单内（支持单 IP 及 CIDR）
 */
export function isIpInWhitelist(ip, whitelistStr) {
  if (!whitelistStr || typeof whitelistStr !== 'string' || !ip) return false;
  const targetV4Int = ipToInt(ip);

  const entries = whitelistStr
    .split(/[\n,;\s]+/)
    .map((s) => s.trim())
    .filter(Boolean);

  for (const entry of entries) {
    if (entry === ip) return true;

    // IPv4 CIDR 掩码匹配 (如 192.168.1.0/24)
    if (entry.includes('/') && targetV4Int !== null) {
      const [subnet, prefixStr] = entry.split('/');
      const prefix = parseInt(prefixStr, 10);
      const subnetInt = ipToInt(subnet);
      if (subnetInt !== null && !isNaN(prefix) && prefix >= 0 && prefix <= 32) {
        const mask = prefix === 0 ? 0 : (~0 << (32 - prefix)) >>> 0;
        if ((targetV4Int & mask) === (subnetInt & mask)) {
          return true;
        }
      }
    }
  }

  return false;
}

/**
 * 深度嗅探请求是否来自于中国大陆 IP
 * 
 * 关键保障：
 * 1. 优先校验 CDN 原生国家标头（Cloudflare cf-ipcountry / Vercel x-vercel-ip-country 等）
 * 2. 穷举检查链路上全部候选 IP（cf-connecting-ip, true-client-ip, x-real-ip, x-forwarded-for 各段）
 * 3. 每一个提取出的公网 IP 均通过权威 APNIC 中国大陆 IPv4 / IPv6 网段库二分查找
 * 4. 只要任何一条可信线索指向中国大陆，即判定为中国流量
 */
export function inspectChinaRequest(request) {
  const headers = request.headers;
  const getHeader = (name) => {
    if (!headers) return null;
    if (typeof headers.get === 'function') return headers.get(name);
    return headers[name] || headers[name.toLowerCase()] || null;
  };

  // 1. 检查 CDN 边缘节点直出国家代码（不可由外网客户端随意伪造）
  const cdnCountryHeaders = [
    { name: 'cf-ipcountry', val: getHeader('cf-ipcountry') },
    { name: 'x-vercel-ip-country', val: getHeader('x-vercel-ip-country') },
    { name: 'x-country-code', val: getHeader('x-country-code') },
    { name: 'x-geoip-country', val: getHeader('x-geoip-country') },
  ];

  for (const item of cdnCountryHeaders) {
    if (item.val && String(item.val).trim().toUpperCase() === 'CN') {
      return {
        isChina: true,
        reason: `cdn_header:${item.name}`,
        matchedHeader: item.name,
        country: 'CN',
        candidateIps: [],
      };
    }
  }

  // 2. 收集请求头中所有公网客户端 IP 候选值
  const candidateIps = [];
  const addCandidate = (raw) => {
    if (!raw) return;
    const str = String(raw).trim();
    // 兼容规范化 IPv4-mapped IPv6 地址 (::ffff:114.114.114.114)
    const mapped = str.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/i)?.[1];
    const ip = mapped || str;
    if (net.isIP(ip) && !isLoopbackOrPrivate(ip)) {
      if (!candidateIps.includes(ip)) candidateIps.push(ip);
    }
  };

  addCandidate(getHeader('cf-connecting-ip'));
  addCandidate(getHeader('true-client-ip'));
  addCandidate(getHeader('x-real-ip'));
  addCandidate(getHeader('x-client-ip'));

  for (const xffHeader of ['x-forwarded-for', 'x-vercel-forwarded-for']) {
    const rawVal = getHeader(xffHeader);
    if (rawVal) {
      const parts = String(rawVal).split(',').map((s) => s.trim()).filter(Boolean);
      for (const p of parts) {
        addCandidate(p);
      }
    }
  }

  if (request.ip) {
    addCandidate(request.ip);
  }

  // 3. 逐个将候选公网 IP 送入 APNIC 中国大陆网段库二分查找
  for (const ip of candidateIps) {
    if (ip.includes('.')) {
      if (isIpV4InChina(ip)) {
        return {
          isChina: true,
          reason: 'apnic_ipv4_range',
          matchedIp: ip,
          candidateIps,
        };
      }
    } else if (ip.includes(':')) {
      if (isIpV6InChina(ip)) {
        return {
          isChina: true,
          reason: 'apnic_ipv6_range',
          matchedIp: ip,
          candidateIps,
        };
      }
    }
  }

  return {
    isChina: false,
    reason: 'not_in_china',
    candidateIps,
  };
}

/**
 * 诊断辅助函数：单独测试某一个 IP 是否属于中国大陆
 */
export function testIpAddress(ip) {
  if (!ip || typeof ip !== 'string') {
    return { isChina: false, reason: 'invalid_ip', ip };
  }
  const clean = ip.trim();
  const mapped = clean.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/i)?.[1];
  const target = mapped || clean;

  if (!net.isIP(target)) {
    return { isChina: false, reason: 'not_an_ip', ip: target };
  }
  if (isLoopbackOrPrivate(target)) {
    return { isChina: false, reason: 'loopback_or_private', ip: target };
  }

  if (target.includes('.')) {
    const inChina = isIpV4InChina(target);
    return {
      isChina: inChina,
      type: 'IPv4',
      ip: target,
      reason: inChina ? 'apnic_ipv4_range' : 'overseas_ipv4',
    };
  } else {
    const inChina = isIpV6InChina(target);
    return {
      isChina: inChina,
      type: 'IPv6',
      ip: target,
      reason: inChina ? 'apnic_ipv6_range' : 'overseas_ipv6',
    };
  }
}

/**
 * 渲染标准 403 Forbidden HTML 页面
 */
export function render403Html() {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>403 Forbidden</title>
  <meta name="robots" content="noindex, nofollow, noarchive">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <style>
    * { box-sizing: border-box; }
    body {
      margin: 0;
      padding: 0;
      background-color: #050505;
      color: #ededf0;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      display: flex;
      align-items: center;
      justify-content: center;
      min-height: 100vh;
      text-align: center;
    }
    .container {
      max-width: 520px;
      padding: 40px 24px;
    }
    h1 {
      font-size: 32px;
      font-weight: 700;
      margin: 0 0 12px 0;
      letter-spacing: -0.02em;
      color: #ffffff;
    }
    hr {
      border: 0;
      border-top: 1px solid rgba(255, 255, 255, 0.15);
      margin: 16px auto 20px auto;
      max-width: 360px;
    }
    p {
      font-size: 14px;
      line-height: 1.6;
      color: rgba(255, 255, 255, 0.6);
      margin: 0;
    }
    .footer {
      margin-top: 28px;
      font-size: 12px;
      color: rgba(255, 255, 255, 0.3);
    }
  </style>
</head>
<body>
  <div class="container">
    <h1>403 Forbidden</h1>
    <hr>
    <p>Access to this server or resource is strictly forbidden.</p>
    <div class="footer">nginx</div>
  </div>
</body>
</html>
`;
}

/**
 * 构建 403 Forbidden 响应对象（对 API 请求返回 JSON，对页面请求返回 HTML）
 */
export function build403Response(request) {
  const pathname = request.nextUrl?.pathname || '';
  const isApi = pathname.startsWith('/api/');

  const headers = {
    'Cache-Control': 'no-cache, no-store, must-revalidate, max-age=0',
    'Pragma': 'no-cache',
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
  };

  if (isApi) {
    return new NextResponse(
      JSON.stringify({
        error: {
          code: 'FORBIDDEN',
          message: '403 Forbidden - Access Denied',
        },
      }),
      {
        status: 403,
        headers: {
          ...headers,
          'Content-Type': 'application/json; charset=utf-8',
        },
      }
    );
  }

  return new NextResponse(render403Html(), {
    status: 403,
    headers: {
      ...headers,
      'Content-Type': 'text/html; charset=utf-8',
    },
  });
}

/**
 * Next.js Middleware 核心拦截挂钩入口
 *
 * 逻辑流：
 * 1. 检查插件是否开启：若未开启，耗时为 0ms，立即放行
 * 2. 检查静态资源与系统免检路径放行
 * 3. 检查管理员路径 (/admin) 豁免，确保管理员可在后台开关此功能而不被自锁
 * 4. 提取客户端 IP 并核对白名单
 * 5. 检测是否为中国大陆 IP：命中则直接中断并返回 403 响应，否则放行
 */
export function handleChinaIpBlockMiddleware(request) {
  const config = getPluginConfig();
  if (!config.enabled) {
    return null;
  }

  const url = request.nextUrl;
  const pathname = url.pathname;

  // 1. 静态构建产物与系统关键探针放行
  if (
    pathname.startsWith('/_next') ||
    pathname.startsWith('/.well-known') ||
    pathname === '/favicon.ico' ||
    pathname === '/robots.txt' ||
    pathname === '/sitemap.xml'
  ) {
    return null;
  }

  // 2. 管理员路径豁免（防止管理员开启后把自己关在后台外面无法管理）
  if (config.exemptAdmin) {
    if (
      pathname === '/admin' ||
      pathname.startsWith('/admin/') ||
      pathname === '/api/admin' ||
      pathname.startsWith('/api/admin/')
    ) {
      return null;
    }
  }

  // 3. 深度嗅探中国大陆访问标识
  const detection = inspectChinaRequest(request);
  if (!detection.isChina) {
    return null;
  }

  // 4. 白名单检查（若命中的中国 IP 位于管理员允许的白名单内，则豁免放行）
  if (config.whitelistIps && detection.candidateIps?.length) {
    for (const ip of detection.candidateIps) {
      if (isIpInWhitelist(ip, config.whitelistIps)) {
        return null;
      }
    }
  }
  if (detection.matchedIp && isIpInWhitelist(detection.matchedIp, config.whitelistIps)) {
    return null;
  }

  // 5. 阻断并返回 403 页面
  return build403Response(request);
}
