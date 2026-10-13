'use client';

import { useState } from 'react';
import { BarChart3, CheckCircle2, X } from 'lucide-react';
import ActivityTab from '@/components/account/tabs/ActivityTab';
import UsageTab from '@/components/account/tabs/UsageTab';

const PANELS = [
  { id: 'activity', label: '创作活跃度' },
  { id: 'usage', label: '当前使用量明细' },
];

export default function LoginSummaryModal({ user, onComplete, onClose }) {
  const [activePanel, setActivePanel] = useState('activity');

  const finish = () => {
    onComplete?.();
  };

  return (
    <div
      className="fixed inset-0 z-toast flex items-center justify-center bg-black/80 px-4 py-5 backdrop-blur-md"
      role="dialog"
      aria-modal="true"
      aria-labelledby="login-summary-title"
    >
      <div className="relative flex max-h-[92vh] w-full max-w-6xl flex-col overflow-hidden rounded-[28px] border border-white/[0.10] bg-[#10131a] shadow-[0_24px_90px_rgba(0,0,0,0.72)]">
        <div className="flex shrink-0 items-start justify-between gap-4 border-b border-white/[0.08] px-5 py-5 sm:px-7">
          <div>
            <div className="mb-2 flex items-center gap-2 text-sm font-medium text-emerald-300">
              <CheckCircle2 className="size-4" />
              <span>登录成功</span>
            </div>
            <h2 id="login-summary-title" className="text-xl font-semibold tracking-[-0.02em] text-white sm:text-2xl">
              你的创作账户概览
            </h2>
            <p className="mt-1 text-xs text-gray-400">登录后数据直接来自账户接口，未同步的数据会明确显示为空状态。</p>
          </div>
          <button
            type="button"
            onClick={onClose || finish}
            aria-label="关闭账户概览"
            className="flex size-9 shrink-0 items-center justify-center rounded-xl text-gray-500 transition-colors duration-300 hover:bg-white/[0.06] hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/60"
          >
            <X className="size-4" />
          </button>
        </div>

        <div className="flex shrink-0 items-center gap-2 overflow-x-auto border-b border-white/[0.08] px-5 py-3 sm:px-7">
          {PANELS.map((panel) => (
            <button
              key={panel.id}
              type="button"
              onClick={() => setActivePanel(panel.id)}
              className={`inline-flex shrink-0 items-center gap-2 rounded-xl px-3.5 py-2 text-xs font-semibold transition-colors duration-300 ${activePanel === panel.id ? 'bg-cyan-400/15 text-cyan-200' : 'text-gray-400 hover:bg-white/[0.05] hover:text-white'}`}
            >
              {panel.id === 'activity' ? <BarChart3 className="size-3.5" /> : <CheckCircle2 className="size-3.5" />}
              {panel.label}
            </button>
          ))}
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5 sm:px-7 sm:py-6">
          {activePanel === 'activity' ? <ActivityTab user={user} /> : <UsageTab />}
        </div>

        <div className="flex shrink-0 justify-end border-t border-white/[0.08] px-5 py-4 sm:px-7">
          <button
            type="button"
            onClick={finish}
            className="inline-flex h-11 items-center justify-center rounded-xl bg-cyan-400 px-5 text-sm font-semibold text-[#071014] transition-colors duration-300 hover:bg-cyan-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300/70"
          >
            进入创作
          </button>
        </div>
      </div>
    </div>
  );
}
