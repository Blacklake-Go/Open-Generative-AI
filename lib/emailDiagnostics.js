import 'server-only';

import net from 'node:net';
import tls from 'node:tls';
import dns from 'node:dns/promises';

/**
 * 诊断 SMTP 端口 TCP 连通性
 */
export async function diagnoseTcpHandshake(host, port, timeoutMs = 5000) {
  if (!host) {
    return { ok: false, latencyMs: 0, error: '未配置发信主机地址', code: 'HOST_EMPTY' };
  }
  const startedAt = Date.now();
  return new Promise((resolve) => {
    const socket = new net.Socket();
    let isResolved = false;

    const timer = setTimeout(() => {
      if (!isResolved) {
        isResolved = true;
        socket.destroy();
        resolve({
          ok: false,
          latencyMs: Date.now() - startedAt,
          error: `连接超时 (${timeoutMs}ms)`,
          code: 'ETIMEDOUT',
        });
      }
    }, timeoutMs);

    socket.connect(port, host, () => {
      if (!isResolved) {
        isResolved = true;
        clearTimeout(timer);
        const latencyMs = Date.now() - startedAt;
        socket.destroy();
        resolve({
          ok: true,
          latencyMs,
          remoteAddress: socket.remoteAddress,
          remotePort: socket.remotePort,
        });
      }
    });

    socket.on('error', (err) => {
      if (!isResolved) {
        isResolved = true;
        clearTimeout(timer);
        resolve({
          ok: false,
          latencyMs: Date.now() - startedAt,
          error: err.message,
          code: err.code || 'ECONNREFUSED',
        });
      }
    });
  });
}

/**
 * 诊断 TLS 握手与证书状态
 */
export async function diagnoseTlsNegotiation(host, port, timeoutMs = 8000) {
  if (!host) {
    return { ok: false, latencyMs: 0, error: '未配置发信主机地址', code: 'HOST_EMPTY' };
  }
  const startedAt = Date.now();
  return new Promise((resolve) => {
    let isResolved = false;
    const socket = tls.connect({
      host,
      port,
      servername: host,
      minVersion: 'TLSv1.2',
      rejectUnauthorized: true,
      timeout: timeoutMs,
    }, () => {
      if (!isResolved) {
        isResolved = true;
        const cert = socket.getPeerCertificate();
        const cipher = socket.getCipher();
        const protocol = socket.getProtocol();
        const latencyMs = Date.now() - startedAt;
        socket.destroy();
        resolve({
          ok: true,
          protocol,
          cipher: cipher?.name,
          validTo: cert?.valid_to,
          issuer: cert?.issuer?.O || cert?.issuer?.CN,
          subject: cert?.subject?.CN,
          latencyMs,
        });
      }
    });

    socket.on('timeout', () => {
      if (!isResolved) {
        isResolved = true;
        socket.destroy();
        resolve({
          ok: false,
          latencyMs: Date.now() - startedAt,
          error: `TLS 握手超时 (${timeoutMs}ms)`,
          code: 'ETIMEDOUT',
        });
      }
    });

    socket.on('error', (err) => {
      if (!isResolved) {
        isResolved = true;
        resolve({
          ok: false,
          latencyMs: Date.now() - startedAt,
          error: err.message,
          code: err.code || 'TLS_ERROR',
        });
      }
    });
  });
}

/**
 * 查询发信域名的 SPF 记录
 */
export async function diagnoseSpfRecord(domain) {
  if (!domain) return { status: 'unknown', record: null, advice: '请先配置有效的邮箱账号' };
  try {
    const txtRecords = await dns.resolveTxt(domain);
    const spfRecord = txtRecords
      .map((chunks) => chunks.join(''))
      .find((txt) => txt.toLowerCase().startsWith('v=spf1'));

    if (spfRecord) {
      return {
        status: 'healthy',
        record: spfRecord,
        advice: '已检测到有效的 SPF 声明，符合主流收件方安全准入标准',
      };
    }
    return {
      status: 'warn',
      record: null,
      advice: `未检测到 SPF 记录。建议在域名 DNS 添加 TXT 记录：v=spf1 include:spf.mail.qq.com ~all`,
    };
  } catch (error) {
    return {
      status: 'warn',
      record: null,
      error: error.message,
      advice: `SPF DNS 查询未命中。请确保已在域名解析中配置 SPF TXT 记录`,
    };
  }
}

/**
 * 查询发信域名的 DMARC 记录
 */
export async function diagnoseDmarcRecord(domain) {
  if (!domain) return { status: 'unknown', record: null, advice: '请先配置有效的邮箱账号' };
  try {
    const dmarcDomain = `_dmarc.${domain}`;
    const txtRecords = await dns.resolveTxt(dmarcDomain);
    const dmarcRecord = txtRecords
      .map((chunks) => chunks.join(''))
      .find((txt) => txt.toUpperCase().startsWith('V=DMARC1'));

    if (dmarcRecord) {
      return {
        status: 'healthy',
        record: dmarcRecord,
        advice: '已配置 DMARC 投递策略保护，有效防范仿冒伪造邮件',
      };
    }
    return {
      status: 'warn',
      record: null,
      advice: `未检测到 DMARC 策略。建议在 DNS 添加 _dmarc.${domain} TXT 记录：v=DMARC1; p=none; sp=none;`,
    };
  } catch (error) {
    return {
      status: 'warn',
      record: null,
      error: error.message,
      advice: `DMARC 记录未配置。建议添加 _dmarc.${domain} TXT 记录以提高投递信誉度`,
    };
  }
}

/**
 * 发信质量全维度综合诊断
 */
export async function runEmailQualityDiagnosis({ host, port = 465, username = '' }) {
  const domain = String(username || '').split('@')[1] || '';

  const [tcpResult, tlsResult, spfResult, dmarcResult] = await Promise.all([
    diagnoseTcpHandshake(host, port),
    port === 465 ? diagnoseTlsNegotiation(host, port) : Promise.resolve({ ok: true, protocol: 'STARTTLS (587)', latencyMs: 0 }),
    diagnoseSpfRecord(domain),
    diagnoseDmarcRecord(domain),
  ]);

  const overallHealth =
    tcpResult.ok && tlsResult.ok && spfResult.status === 'healthy'
      ? 'healthy'
      : tcpResult.ok && tlsResult.ok
      ? 'good'
      : 'degraded';

  return {
    timestamp: new Date().toISOString(),
    overallHealth,
    target: { host, port, domain },
    tcp: tcpResult,
    tls: tlsResult,
    dns: {
      spf: spfResult,
      dmarc: dmarcResult,
      dkim: {
        status: 'info',
        advice: 'DKIM 签名由邮件服务商自动完成（如企业邮箱管理后台已托管）',
      },
    },
  };
}
