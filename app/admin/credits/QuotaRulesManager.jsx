'use client';

import React, { useState, useMemo } from 'react';
import {
  Sparkles,
  Gift,
  CheckCircle2,
  AlertTriangle,
  Info,
  Calendar,
  ShieldAlert,
  ArrowRight,
  TrendingUp,
  Cpu,
  RefreshCw,
  Save,
  Check,
  Zap,
} from 'lucide-react';
import { Card, StatusBadge } from '@/components/admin/AdminUi';
import { verifyQuotaPricingConsistency } from '@/lib/services/quotaRulesPolicy';

export default function QuotaRulesManager({ initialRules, initialConsistency }) {
  const [rules, setRules] = useState(initialRules || {
    initialSignupCredits: 40,
    onboardingRewardCredits: 50,
    dailyCheckinCredits: 10,
    dailyCheckinValidity: 'today',
    onboardingGateEnabled: true,
    dailySignupIpLimit: 5,
  });

  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState({ type: '', text: '' });

  // 动态根据当前表单值计算一致性与单位经济学模型
  const consistency = useMemo(() => {
    return verifyQuotaPricingConsistency(rules);
  }, [rules]);

  const handleChange = (field, value) => {
    setRules((prev) => ({ ...prev, [field]: value }));
  };

  const handleSave = async (e) => {
    e?.preventDefault();
    if (saving) return;

    setSaving(true);
    setFeedback({ type: '', text: '' });

    try {
      const res = await fetch('/api/admin/quota-rules', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Idempotency-Key': `quota-rules-${Date.now()}-${crypto.randomUUID()}`,
        },
        body: JSON.stringify(rules),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data?.error?.message || data?.error || '保存失败');
      }

      setFeedback({ type: 'success', text: '新用户额度与签到规则已成功生效，操作已留存审计日志' });
      setTimeout(() => {
        setFeedback({ type: '', text: '' });
      }, 4000);
    } catch (err) {
      setFeedback({ type: 'error', text: err?.message || '网络连接异常' });
    } finally {
      setSaving(false);
    }
  };

  const uE = consistency.unitEconomics;

  return (
    <div className="space-y-6">
      {/* 顶部核心指标 KPI 仪表盘 */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {/* 初始注册 */}
        <Card className="border-cyan-500/20 bg-cyan-500/[0.03]">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-cyan-300">注册初始赠送</span>
            <span className="rounded-full bg-cyan-500/10 px-2 py-0.5 text-[10px] font-mono text-cyan-300">即时到账</span>
          </div>
          <div className="mt-2 flex items-baseline gap-1.5">
            <span className="font-mono text-2xl font-extrabold text-white">{rules.initialSignupCredits}</span>
            <span className="text-xs text-white/50">积分</span>
          </div>
          <p className="mt-1.5 text-[11px] text-white/60">
            价值约 ¥{(rules.initialSignupCredits * 0.07).toFixed(2)}，可立即体验 4 张万相 Turbo 生图
          </p>
        </Card>

        {/* 引导奖励 */}
        <Card className="border-brand/25 bg-brand/[0.03]">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-brand">新手入驻奖励</span>
            <span className="rounded-full bg-brand/10 px-2 py-0.5 text-[10px] font-mono text-brand">设昵称即享</span>
          </div>
          <div className="mt-2 flex items-baseline gap-1.5">
            <span className="font-mono text-2xl font-extrabold text-white">+{rules.onboardingRewardCredits}</span>
            <span className="text-xs text-white/50">积分</span>
          </div>
          <p className="mt-1.5 text-[11px] text-white/60">
            激励创作者完善身份，累计总额达 <strong className="text-white font-mono">{uE.totalNewcomerCredits} 分</strong>
          </p>
        </Card>

        {/* 每日签到 */}
        <Card className="border-emerald-500/20 bg-emerald-500/[0.03]">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-emerald-300">每日签到积分</span>
            <span className="rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-mono text-emerald-300">
              {rules.dailyCheckinValidity === 'today' ? '当日有效' : '24h有效'}
            </span>
          </div>
          <div className="mt-2 flex items-baseline gap-1.5">
            <span className="font-mono text-2xl font-extrabold text-white">+{rules.dailyCheckinCredits}</span>
            <span className="text-xs text-white/50">积分 / 日</span>
          </div>
          <p className="mt-1.5 text-[11px] text-white/60">
            严格对齐 FREE 套餐设计，单日日活留存成本仅 ¥{uE.dailyCheckinCost}
          </p>
        </Card>

        {/* 获客成本 (CAC) 测算 */}
        <Card className="border-purple-500/20 bg-purple-500/[0.03]">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-purple-300">单客算力成本 (CAC)</span>
            <StatusBadge tone={consistency.isConsistent ? 'good' : 'warn'}>
              {consistency.isConsistent ? '模型安全' : '有偏离风险'}
            </StatusBadge>
          </div>
          <div className="mt-2 flex items-baseline gap-1.5">
            <span className="font-mono text-2xl font-extrabold text-white">¥{uE.estimatedCac}</span>
            <span className="text-xs text-white/50">/ 新用户</span>
          </div>
          <p className="mt-1.5 text-[11px] text-white/60">
            用户感知价值 ¥{uE.perceivedValueCny}，成本控制在毛利率 75% 边界内
          </p>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-12">
        {/* 左侧：规则配置表单 (7 Cols) */}
        <div className="lg:col-span-7 space-y-6">
          <Card className="border-white/10 bg-black/40">
            <div className="flex items-center justify-between border-b border-white/[0.08] pb-3 mb-5">
              <div>
                <h2 className="text-sm font-bold text-white">额度赠送与入驻规则配置</h2>
                <p className="text-xs text-white/50 mt-0.5">
                  动态控制全站注册、第三方登录与签到发放策略，变更实时生效且留存审计
                </p>
              </div>
              <StatusBadge tone="good">动态热更新</StatusBadge>
            </div>

            <form onSubmit={handleSave} className="space-y-4">
              {/* 1. 注册初始赠送 */}
              <div className="grid gap-2 sm:grid-cols-2">
                <div>
                  <label className="block text-xs font-semibold text-white/80 mb-1">
                    新用户注册初始赠送积分
                  </label>
                  <div className="flex items-center rounded-xl border border-white/10 bg-[#0a0c10] px-3">
                    <input
                      type="number"
                      min={0}
                      max={500}
                      value={rules.initialSignupCredits}
                      onChange={(e) => handleChange('initialSignupCredits', Number(e.target.value))}
                      className="w-full bg-transparent py-2 text-xs font-mono text-white outline-none"
                    />
                    <span className="text-[11px] text-white/40">分</span>
                  </div>
                  <p className="mt-1 text-[11px] text-white/40">永久有效，注册或第三方首登时入账</p>
                </div>

                {/* 2. 引导入驻完成奖励 */}
                <div>
                  <label className="block text-xs font-semibold text-white/80 mb-1">
                    完成新手引导奖励积分
                  </label>
                  <div className="flex items-center rounded-xl border border-white/10 bg-[#0a0c10] px-3">
                    <input
                      type="number"
                      min={0}
                      max={500}
                      value={rules.onboardingRewardCredits}
                      onChange={(e) => handleChange('onboardingRewardCredits', Number(e.target.value))}
                      className="w-full bg-transparent py-2 text-xs font-mono text-white outline-none"
                    />
                    <span className="text-[11px] text-white/40">分</span>
                  </div>
                  <p className="mt-1 text-[11px] text-white/40">完成昵称与偏好设定后单次发放</p>
                </div>
              </div>

              {/* 3. 每日签到积分与有效期 */}
              <div className="grid gap-2 sm:grid-cols-2 border-t border-white/[0.06] pt-4">
                <div>
                  <label className="block text-xs font-semibold text-white/80 mb-1">
                    每日签到赠送积分
                  </label>
                  <div className="flex items-center rounded-xl border border-white/10 bg-[#0a0c10] px-3">
                    <input
                      type="number"
                      min={0}
                      max={100}
                      value={rules.dailyCheckinCredits}
                      onChange={(e) => handleChange('dailyCheckinCredits', Number(e.target.value))}
                      className="w-full bg-transparent py-2 text-xs font-mono text-white outline-none"
                    />
                    <span className="text-[11px] text-white/40">分 / 日</span>
                  </div>
                  <p className="mt-1 text-[11px] text-white/40">对齐 FREE 体验档 10 积分标准</p>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-white/80 mb-1">
                    签到积分有效周期
                  </label>
                  <select
                    value={rules.dailyCheckinValidity}
                    onChange={(e) => handleChange('dailyCheckinValidity', e.target.value)}
                    className="w-full rounded-xl border border-white/10 bg-[#0a0c10] px-3 py-2 text-xs text-white outline-none focus:border-cyan-400"
                  >
                    <option value="today">当日有效 (23:59:59 过期 - 推荐)</option>
                    <option value="24h">24小时滑动有效期</option>
                    <option value="perpetual">永久有效 (不推荐，易屯分)</option>
                  </select>
                  <p className="mt-1 text-[11px] text-white/40">避免非活跃账号长期积攒沉淀算力</p>
                </div>
              </div>

              {/* 4. 新用户引导拦截开关与 IP 防刷限制 */}
              <div className="rounded-xl border border-white/[0.06] bg-black/20 p-3.5 space-y-3 border-t border-white/[0.06] pt-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs font-semibold text-white">新用户强制引导入驻拦截</p>
                    <p className="text-[11px] text-white/40">开启后未完成用户名设置的用户进工作台自动弹出引导</p>
                  </div>
                  <input
                    type="checkbox"
                    checked={rules.onboardingGateEnabled}
                    onChange={(e) => handleChange('onboardingGateEnabled', e.target.checked)}
                    className="size-4 rounded border-white/20 bg-black/40 text-cyan-400 focus:ring-cyan-400 cursor-pointer"
                  />
                </div>

                <div className="flex items-center justify-between border-t border-white/[0.05] pt-3">
                  <div>
                    <p className="text-xs font-semibold text-white">单 IP 每日注册受赠上限 (防刷风控)</p>
                    <p className="text-[11px] text-white/40">同 IP 当日超出此账号数的注册不自动发放初始额度</p>
                  </div>
                  <div className="flex items-center w-24 rounded-lg border border-white/10 bg-[#0a0c10] px-2.5">
                    <input
                      type="number"
                      min={1}
                      max={50}
                      value={rules.dailySignupIpLimit}
                      onChange={(e) => handleChange('dailySignupIpLimit', Number(e.target.value))}
                      className="w-full bg-transparent py-1 text-xs font-mono text-white outline-none"
                    />
                    <span className="text-[10px] text-white/40">个</span>
                  </div>
                </div>
              </div>

              {/* 反馈与保存按钮 */}
              <div className="flex items-center justify-between pt-3">
                <div>
                  {feedback.text && (
                    <span className={`text-xs ${feedback.type === 'error' ? 'text-red-400' : 'text-cyan-300'}`}>
                      {feedback.text}
                    </span>
                  )}
                </div>

                <button
                  type="submit"
                  disabled={saving}
                  className="inline-flex items-center gap-1.5 rounded-xl bg-cyan-400 px-5 py-2.5 text-xs font-bold text-black transition-all hover:bg-cyan-300 active:scale-[0.98] disabled:opacity-50 shadow-lg shadow-cyan-500/20 cursor-pointer"
                >
                  {saving ? <RefreshCw className="size-3.5 animate-spin" /> : <Save className="size-3.5" />}
                  <span>{saving ? '保存中…' : '保存额度策略'}</span>
                </button>
              </div>
            </form>
          </Card>
        </div>

        {/* 右侧：定价表一致性核验看板 (5 Cols) */}
        <div className="lg:col-span-5 space-y-6">
          <Card className={`border-2 ${consistency.isConsistent ? 'border-emerald-500/40 bg-emerald-950/10' : 'border-amber-500/40 bg-amber-950/10'}`}>
            <div className="flex items-center justify-between border-b border-white/[0.08] pb-3 mb-4">
              <div className="flex items-center gap-2">
                <span className={`flex size-2 rounded-full ${consistency.isConsistent ? 'bg-emerald-400 animate-pulse' : 'bg-amber-400'}`} />
                <h3 className="text-xs font-bold text-white uppercase tracking-wider">
                  定价表一致性核验看板
                </h3>
              </div>
              <StatusBadge tone={consistency.isConsistent ? 'good' : 'warn'}>
                {consistency.statusText}
              </StatusBadge>
            </div>

            {/* 核验检查项列表 */}
            <div className="space-y-2 mb-4">
              {consistency.checks.map((check) => (
                <div
                  key={check.id}
                  className={`flex items-start gap-2 rounded-lg p-2.5 text-[11px] ${
                    check.passed
                      ? 'bg-emerald-500/[0.06] text-emerald-300/90'
                      : 'bg-amber-500/[0.08] text-amber-300'
                  }`}
                >
                  {check.passed ? (
                    <CheckCircle2 className="size-3.5 shrink-0 text-emerald-400 mt-0.5" />
                  ) : (
                    <AlertTriangle className="size-3.5 shrink-0 text-amber-400 mt-0.5" />
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold text-white/90">{check.title}</p>
                    <p className="mt-0.5 text-white/60 leading-normal">{check.description}</p>
                  </div>
                </div>
              ))}
            </div>

            {/* 代表模型兑换矩阵 */}
            <div className="border-t border-white/[0.08] pt-4">
              <h4 className="text-[11px] font-bold text-white/70 mb-2.5">
                新用户开局额度兑换能力 ({uE.totalNewcomerCredits} 积分)
              </h4>
              <div className="space-y-2">
                {consistency.modelTrials.map((m) => (
                  <div
                    key={m.id}
                    className="flex items-center justify-between rounded-lg border border-white/[0.06] bg-black/30 px-3 py-2 text-xs"
                  >
                    <div>
                      <span className="font-medium text-white">{m.name}</span>
                      <span className="ml-2 font-mono text-[11px] text-white/40">{m.creditsPerRun}分/次</span>
                    </div>

                    <div className="text-right">
                      {m.canAffordWithTotal ? (
                        <span className="inline-flex items-center gap-1 font-mono font-bold text-emerald-400">
                          可生成 {m.totalRunsPossible} 次
                        </span>
                      ) : (
                        <span className="text-[11px] text-white/30">额度不足</span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* 商业套餐转化漏斗比例 */}
            <div className="mt-4 rounded-xl border border-white/[0.06] bg-black/40 p-3 text-[11px] text-white/60">
              <div className="flex items-center justify-between text-white font-medium mb-1">
                <span>入门版 Starter (¥{consistency.starterPlan.monthlyCny}/月)</span>
                <span className="font-mono text-cyan-300">{consistency.starterPlan.monthlyCredits} 积分</span>
              </div>
              <p>
                商业套餐包含专属并发、无水印与个人商用许可，额度为免费总额度的 <strong className="text-white font-mono">{uE.freeVsStarterRatio} 倍</strong>，转化漏斗梯度健康。
              </p>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
