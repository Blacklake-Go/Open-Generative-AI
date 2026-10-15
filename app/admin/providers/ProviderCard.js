'use client';

import { useState } from 'react';
import { Card, StatusBadge } from '@/components/admin/AdminUi';

export default function ProviderCard({ provider }) {
  const [testing, setTesting] = useState(false);
  const [channelEnabled, setChannelEnabled] = useState(provider.channelEnabled !== false);
  const [channelBusy, setChannelBusy] = useState(false);
  const [testResult, setTestResult] = useState(provider.lastCheck || null);
  const [showRotate, setShowRotate] = useState(false);
  const [newKey, setNewKey] = useState('');
  const [adminPassword, setAdminPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');

  const togglePaymentChannel = async () => {
    setChannelBusy(true);
    setMessage('');
    try {
      const response = await fetch(`/api/admin/providers/${provider.id}/enabled`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', 'Idempotency-Key': crypto.randomUUID() },
        body: JSON.stringify({ enabled: !channelEnabled }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result?.error?.message || '支付渠道状态更新失败');
      setChannelEnabled(!channelEnabled);
      setMessage(!channelEnabled ? '渠道已启用；仅在配置完整时向用户显示' : '渠道已停用，已从前台隐藏');
    } catch (err) {
      setMessage(err.message || '支付渠道状态更新失败');
    } finally {
      setChannelBusy(false);
    }
  };

  const runTest = async () => {
    setTesting(true);
    setMessage('');
    try {
      const res = await fetch(`/api/admin/providers/${provider.id}/test`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Idempotency-Key': crypto.randomUUID(),
        },
      });
      const data = await res.json();
      if (res.ok && data.data) {
        setTestResult(data.data);
        setMessage(`健康探针探测完成：${data.data.status} (${data.data.latency_ms || data.data.latencyMs || 0}ms)`);
      } else {
        setMessage(data?.error?.message || data?.error || '健康检查失败');
      }
    } catch (err) {
      setMessage(err.message || '网络连接异常');
    } finally {
      setTesting(false);
    }
  };


  const handleRotate = async (e) => {
    e.preventDefault();
    if (!window.confirm('轮换密钥将立即覆盖现有生产凭证，是否确认提交？')) return;

    setBusy(true);
    setMessage('');
    try {
      const res = await fetch(`/api/admin/providers/${provider.id}/secret`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Idempotency-Key': crypto.randomUUID(),
        },
        body: JSON.stringify({
          secretName: provider.kind === 'ai' ? 'api_key' : 'secret_key',
          secretValue: newKey,
          adminPassword,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error?.message || '轮换失败');
      setMessage('密钥轮换成功，已安全加密存盘');
      setNewKey('');
      setAdminPassword('');
      setShowRotate(false);
      setTimeout(() => window.location.reload(), 1000);
    } catch (err) {
      setMessage(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card className="flex flex-col justify-between relative overflow-hidden border-white/[0.08] bg-surface/90 backdrop-blur-md hover:border-brand/30 hover:shadow-brand/5 transition-all duration-200 shadow-xl shadow-black/40">
      <div>
        <div className="flex items-start justify-between border-b border-white/[0.08] pb-3.5 mb-4">
          <div>
            <span className="font-mono text-[11px] font-semibold uppercase tracking-[0.08em] text-brand">
              {provider.kind === 'ai' ? 'AI MODEL ENGINE' : 'PAYMENT GATEWAY'}
            </span>
            <h3 className="mt-1 text-base font-semibold text-white tracking-[-0.01em] leading-6">{provider.name}</h3>
          </div>
          <StatusBadge tone={provider.configured ? 'good' : 'warn'}>
            {provider.configured ? '已就绪' : '待配置'}
          </StatusBadge>
        </div>

        <p className="text-xs text-gray-400 mb-4 leading-5 tracking-[-0.005em]">{provider.description}</p>

        {provider.kind === 'payment' && (
          <div className="mb-4 flex items-center justify-between rounded-xl border border-white/[0.08] bg-[#070709]/70 px-3.5 py-3">
            <div>
              <p className="text-xs font-medium text-white">前台支付渠道</p>
              <p className="mt-1 text-[11px] text-zinc-400">{channelEnabled ? '已启用' : '已隐藏'}</p>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={channelEnabled}
              aria-label={`${provider.name}${channelEnabled ? '停用' : '启用'}`}
              disabled={channelBusy}
              onClick={togglePaymentChannel}
              className={`relative h-6 w-11 rounded-full transition disabled:opacity-50 ${channelEnabled ? 'bg-emerald-500' : 'bg-zinc-700'}`}
            >
              <span className={`absolute top-1 size-4 rounded-full bg-white transition-all ${channelEnabled ? 'left-6' : 'left-1'}`} />
            </button>
          </div>
        )}

        <div className="space-y-2.5 rounded-xl border border-white/[0.06] bg-[#070709]/70 p-3.5 text-xs">
          <div className="flex justify-between items-center">
            <span className="text-gray-400 tracking-[0.01em]">通信模式</span>
            <span className="font-mono text-gray-200">{provider.mode}</span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-gray-400 tracking-[0.01em]">密钥存储机制</span>
            <span className="text-brand font-medium">写入式（不可反显明文）</span>
          </div>
          {testResult && (
            <div className="flex justify-between items-center border-t border-white/[0.05] pt-2">
              <span className="text-gray-400 tracking-[0.01em]">最近健康状况</span>
              <span className={testResult.status === 'healthy' ? 'text-emerald-400 font-semibold' : 'text-amber-300'}>
                {testResult.status} ({testResult.latency_ms}ms)
              </span>
            </div>
          )}
        </div>

        {/* 密钥轮换折叠表单 */}
        {showRotate && (
          <form onSubmit={handleRotate} className="mt-4 rounded-xl border border-white/[0.08] bg-[#070709]/80 p-4 space-y-3.5 backdrop-blur-sm">
            <p className="text-xs font-semibold text-brand tracking-[-0.005em]">安全密钥轮换（仅限超管）</p>
            <div>
              <label className="block text-xs text-gray-400 font-medium tracking-[0.01em] mb-1">新密钥明文（只写一次）</label>
              <input
                type="password"
                required
                value={newKey}
                onChange={(e) => setNewKey(e.target.value)}
                placeholder="sk-..."
                className="h-[38px] w-full rounded-lg border border-white/[0.10] bg-canvas px-3 text-xs text-white font-mono placeholder:text-gray-500 focus:border-brand focus:ring-2 focus:ring-brand/20 outline-none transition-all"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-400 font-medium tracking-[0.01em] mb-1">当前超管密码（二次确认）</label>
              <input
                type="password"
                required
                value={adminPassword}
                onChange={(e) => setAdminPassword(e.target.value)}
                placeholder="你的管理员密码"
                className="h-[38px] w-full rounded-lg border border-white/[0.10] bg-canvas px-3 text-xs text-white font-mono placeholder:text-gray-500 focus:border-brand focus:ring-2 focus:ring-brand/20 outline-none transition-all"
              />
            </div>
            <div className="flex justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={() => setShowRotate(false)}
                className="h-8 rounded-lg border border-white/[0.10] bg-transparent px-3 text-xs font-medium text-gray-400 hover:bg-white/[0.06] hover:text-white transition active:scale-[0.98]"
              >
                取消
              </button>
              <button
                type="submit"
                disabled={busy}
                className="h-8 rounded-lg bg-brand hover:bg-brand-hover px-4 text-xs font-semibold text-white active:scale-[0.98] transition disabled:opacity-50"
              >
                {busy ? '轮换中…' : '确认轮换'}
              </button>
            </div>
          </form>
        )}
      </div>

      <div className="mt-5 pt-3.5 border-t border-white/[0.06] flex items-center justify-between">
        <button
          type="button"
          disabled={testing}
          onClick={runTest}
          className="inline-flex h-[38px] items-center gap-1.5 rounded-lg border border-white/[0.10] bg-white/[0.04] px-3.5 text-xs font-medium text-gray-300 hover:bg-white/[0.08] hover:text-white transition active:scale-[0.98] disabled:opacity-50 tracking-[-0.005em]"
        >
          {testing ? '探针发送中…' : '心跳诊断探针'}
        </button>

        <button
          type="button"
          onClick={() => setShowRotate(!showRotate)}
          className="inline-flex h-[38px] items-center rounded-lg border border-brand/20 bg-brand/10 px-4 text-xs font-semibold text-brand hover:bg-brand/15 active:scale-[0.98] transition tracking-[-0.005em]"
        >
          {showRotate ? '收起' : '轮换密钥 ⚙'}
        </button>
      </div>

      {message && <p className="mt-2 text-xs text-brand">{message}</p>}
    </Card>
  );
}
