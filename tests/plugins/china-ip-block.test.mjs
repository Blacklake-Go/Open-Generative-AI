import test from 'node:test';
import assert from 'node:assert/strict';
import {
  inspectChinaRequest,
  testIpAddress,
  isIpInWhitelist,
  build403Response,
  render403Html,
  getPluginConfig,
  updatePluginConfig,
  handleChinaIpBlockMiddleware,
} from '../../plugins/china-ip-block/index.js';

test('[china-ip-block] 权威中国大陆 IPv4 地址准确识别', () => {
  const cnIps = [
    '114.114.114.114',
    '223.5.5.5',
    '119.29.29.29',
    '180.76.76.76',
    '202.96.128.86',
    '210.22.84.3',
    '211.136.192.6',
  ];

  for (const ip of cnIps) {
    const res = testIpAddress(ip);
    assert.equal(res.isChina, true, `IP ${ip} 必须被识别为中国大陆 IP`);
    assert.equal(res.type, 'IPv4');
  }
});

test('[china-ip-block] 权威中国大陆 IPv6 地址准确识别 (三大运营商)', () => {
  const cnIpv6s = [
    '240e:e1:8b00:2000::1', // 电信
    '2408:8000::1',         // 联通
    '2409:8000::1',         // 移动
    '2001:250:1::1',        // 教育网 CERNET
  ];

  for (const ip of cnIpv6s) {
    const res = testIpAddress(ip);
    assert.equal(res.isChina, true, `IPv6 ${ip} 必须被识别为中国大陆 IP`);
    assert.equal(res.type, 'IPv6');
  }
});

test('[china-ip-block] 海外与非中国公网 IP 准确放行', () => {
  const overseasIps = [
    '8.8.8.8',
    '1.1.1.1',
    '208.67.222.222',
    '2001:4860:4860::8888',
  ];

  for (const ip of overseasIps) {
    const res = testIpAddress(ip);
    assert.equal(res.isChina, false, `海外 IP ${ip} 不应被误判为中国 IP`);
  }
});

test('[china-ip-block] CDN 边缘直出国家标头 (cf-ipcountry: CN) 触发阻断判定', () => {
  const mockReq = {
    headers: new Headers({
      'cf-ipcountry': 'CN',
      'x-real-ip': '8.8.8.8', // 即使真实IP被覆盖，CDN国家标头依然能保底识别
    }),
  };

  const detection = inspectChinaRequest(mockReq);
  assert.equal(detection.isChina, true);
  assert.equal(detection.reason, 'cdn_header:cf-ipcountry');
});

test('[china-ip-block] 反向代理链 (Cloudflare / Nginx) 场景真实中国 IP 无法逃逸', () => {
  // 场景：访客为中国真实 IP (114.114.114.114)，经 Cloudflare (海外回源 IP 104.16.1.1)
  const mockReq = {
    headers: new Headers({
      'x-real-ip': '104.16.1.1',
      'cf-connecting-ip': '114.114.114.114',
      'cf-ipcountry': 'US', // 伪造或中转错误国家头
    }),
  };

  const detection = inspectChinaRequest(mockReq);
  assert.equal(detection.isChina, true, '只要候选IP包含中国IP，必须识别拦截');
  assert.equal(detection.matchedIp, '114.114.114.114');
});

test('[china-ip-block] X-Forwarded-For 链路中包含中国 IP 触发识别', () => {
  const mockReq = {
    headers: new Headers({
      'x-forwarded-for': '8.8.8.8, 114.114.114.114, 1.1.1.1',
    }),
  };

  const detection = inspectChinaRequest(mockReq);
  assert.equal(detection.isChina, true);
  assert.equal(detection.matchedIp, '114.114.114.114');
});

test('[china-ip-block] 403 Forbidden 响应契约 (页面返回 HTML，API 返回 JSON)', async () => {
  // 1. 普通页面请求 -> HTML 403
  const pageReq = {
    nextUrl: { pathname: '/studio' },
  };
  const pageRes = build403Response(pageReq);
  assert.equal(pageRes.status, 403);
  assert.match(pageRes.headers.get('content-type'), /text\/html/);
  assert.match(pageRes.headers.get('cache-control'), /no-store/);
  const htmlBody = await pageRes.text();
  assert.match(htmlBody, /403 Forbidden/);

  // 2. API 请求 -> JSON 403
  const apiReq = {
    nextUrl: { pathname: '/api/v1/generate' },
  };
  const apiRes = build403Response(apiReq);
  assert.equal(apiRes.status, 403);
  assert.match(apiRes.headers.get('content-type'), /application\/json/);
  const jsonBody = await apiRes.json();
  assert.equal(jsonBody.error.code, 'FORBIDDEN');
});

test('[china-ip-block] 白名单与 CIDR 掩码放行机制验证', () => {
  const whitelist = '114.114.114.114\n120.24.0.0/16';

  // 精确单 IP 白名单
  assert.equal(isIpInWhitelist('114.114.114.114', whitelist), true);
  // CIDR 网段白名单
  assert.equal(isIpInWhitelist('120.24.10.5', whitelist), true);
  // 不在白名单内的中国 IP
  assert.equal(isIpInWhitelist('223.5.5.5', whitelist), false);
});

test('[china-ip-block] 中间件全流程拦截验证 (开关控制、管理员豁免、白名单豁免)', () => {
  // 1. 关闭状态下：中国 IP 放行
  updatePluginConfig({ enabled: false });
  const req1 = {
    nextUrl: { pathname: '/studio' },
    headers: new Headers({ 'x-real-ip': '114.114.114.114' }),
  };
  assert.equal(handleChinaIpBlockMiddleware(req1), null);

  // 2. 开启状态下：中国 IP 拦截返回 403
  updatePluginConfig({ enabled: true, exemptAdmin: true, whitelistIps: '' });
  const blockRes = handleChinaIpBlockMiddleware(req1);
  assert.notEqual(blockRes, null);
  assert.equal(blockRes.status, 403);

  // 3. 管理员路径豁免：/admin 正常放行，防止自锁
  const adminReq = {
    nextUrl: { pathname: '/admin/settings' },
    headers: new Headers({ 'x-real-ip': '114.114.114.114' }),
  };
  assert.equal(handleChinaIpBlockMiddleware(adminReq), null);

  // 4. 白名单放行：命中白名单的中国 IP 放行
  updatePluginConfig({ enabled: true, exemptAdmin: true, whitelistIps: '114.114.114.114' });
  assert.equal(handleChinaIpBlockMiddleware(req1), null);

  // 5. 还原开关为关闭
  updatePluginConfig({ enabled: false, whitelistIps: '' });
  assert.equal(handleChinaIpBlockMiddleware(req1), null);
});
