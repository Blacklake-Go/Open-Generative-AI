'use client';

import React, { useState, useEffect } from 'react';
import { Card } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { getLocaleConfig, LOCALE_CONFIGS, SUPPORTED_LOCALES } from '@/lib/locales';
import { switchLocale as switchLocaleVia } from '@/lib/client/localeSwitch';
import { Bell, Eye, Globe, CheckCircle2, AlertCircle } from 'lucide-react';

const SUPPORTED_LANGUAGES = SUPPORTED_LOCALES.map((code) => ({
  code,
  label: LOCALE_CONFIGS[code]?.nativeName || code,
}));

export default function SystemPreferencesSection({ className = '' }) {
  const [notifications, setNotifications] = useState(true);
  const [highQualityPreview, setHighQualityPreview] = useState(true);
  const [currentLocale, setCurrentLocale] = useState('zh-CN');
  const [loading, setLoading] = useState(true);
  const [toastMessage, setToastMessage] = useState('');
  const [toastType, setToastType] = useState('success');
  const activeLangLabel = SUPPORTED_LANGUAGES.find((l) => l.code === currentLocale)?.label || currentLocale;

  // 1. 从后端加载真实偏好设置
  useEffect(() => {
    let mounted = true;
    async function loadPreferences() {
      try {
        const res = await fetch('/api/user/preferences');
        if (res.ok) {
          const data = await res.json();
          if (mounted && data.preferences) {
            setNotifications(data.preferences.notifyOnComplete ?? true);
            setHighQualityPreview(data.preferences.highQualityPreview ?? true);
            setCurrentLocale(data.preferences.locale || 'zh-CN');
          }
        }
      } catch (err) {
        console.error('加载偏好设置失败:', err);
      } finally {
        if (mounted) setLoading(false);
      }
    }
    loadPreferences();
    return () => {
      mounted = false;
    };
  }, []);

  // 2. 实时保存偏好设置至数据库
  const savePreference = async (updates) => {
    try {
      const res = await fetch('/api/user/preferences', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates),
      });
      if (res.ok) {
        const data = await res.json();
        setToastType('success');
        setToastMessage('偏好设置已同步至数据库');
        setTimeout(() => setToastMessage(''), 2500);
        return data;
      } else {
        setToastType('error');
        setToastMessage('设置保存失败');
        setTimeout(() => setToastMessage(''), 2500);
      }
    } catch {
      setToastType('error');
      setToastMessage('网络异常，无法保存偏好设置');
      setTimeout(() => setToastMessage(''), 2500);
    }
  };

  const handleToggleNotifications = async (val) => {
    setNotifications(val);
    await savePreference({ notifyOnComplete: val });
  };

  const handleTogglePreview = async (val) => {
    setHighQualityPreview(val);
    await savePreference({ highQualityPreview: val });
  };

  const handleLanguageChange = async (val) => {
    setCurrentLocale(val);
    await savePreference({ locale: val });
    try {
      await switchLocaleVia(val);
    } catch (err) {
      console.warn('Locale cookie write failed, falling back to reload', err);
      window.location.reload();
    }
  };

  return (
    <div className={`space-y-6 ${className}`}>
      {toastMessage && (
        <div
          role="status"
          className={`flex items-center gap-2 p-3 rounded-xl text-xs animate-in fade-in ${
            toastType === 'success'
              ? 'bg-emerald-500/10 border border-emerald-500/20 text-emerald-400'
              : 'bg-red-500/10 border border-red-500/20 text-red-400'
          }`}
        >
          {toastType === 'success' ? <CheckCircle2 className="size-4 shrink-0" /> : <AlertCircle className="size-4 shrink-0" />}
          <span>{toastMessage}</span>
        </div>
      )}

      {/* 偏好设置卡片 */}
      <Card className="p-5 sm:p-6 bg-surface-raised border-line-subtle rounded-2xl shadow-elevation-1">
        <h3 className="text-sm font-semibold text-ink mb-4 flex items-center gap-2">
          <span>偏好与体验</span>
        </h3>

        <div className="space-y-4">
          {/* 通知设置 */}
          <div className="flex items-center justify-between py-2 border-b border-line-subtle">
            <div className="flex items-center gap-3">
              <div className="size-8 rounded-lg bg-wash border border-line-subtle flex items-center justify-center shrink-0">
                <Bell className="size-4 text-ink-muted" />
              </div>
              <div>
                <p className="text-body-sm font-medium text-ink">生成完成通知</p>
                <p className="text-caption text-ink-muted">在视频、音频或图像生成完毕后推送提醒</p>
              </div>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={notifications}
                disabled={loading}
                onChange={(e) => handleToggleNotifications(e.target.checked)}
                className="sr-only peer"
              />
              <div className="w-11 h-6 bg-well peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-brand"></div>
            </label>
          </div>

          {/* 高画质预览 */}
          <div className="flex items-center justify-between py-2 border-b border-line-subtle">
            <div className="flex items-center gap-3">
              <div className="size-8 rounded-lg bg-wash border border-line-subtle flex items-center justify-center shrink-0">
                <Eye className="size-4 text-ink-muted" />
              </div>
              <div>
                <p className="text-body-sm font-medium text-ink">高画质即时预览</p>
                <p className="text-caption text-ink-muted">在工作区使用全保真动态预览（消耗更多显存与带宽）</p>
              </div>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={highQualityPreview}
                disabled={loading}
                onChange={(e) => handleTogglePreview(e.target.checked)}
                className="sr-only peer"
              />
              <div className="w-11 h-6 bg-well peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-brand"></div>
            </label>
          </div>

          {/* 多语言切换 */}
          <div className="flex items-center justify-between py-2">
            <div className="flex items-center gap-3">
              <div className="size-8 rounded-lg bg-wash border border-line-subtle flex items-center justify-center shrink-0">
                <Globe className="size-4 text-ink-muted" />
              </div>
              <div>
                <p className="text-body-sm font-medium text-ink">界面语言</p>
                <p className="text-caption text-ink-muted">当前选择：{activeLangLabel}</p>
              </div>
            </div>
            <div className="w-40">
              <Select value={currentLocale} onValueChange={handleLanguageChange} disabled={loading}>
                <SelectTrigger className="w-full bg-well border-line-subtle text-xs rounded-xl h-9">
                  <SelectValue placeholder="选择语言" />
                </SelectTrigger>
                <SelectContent className="bg-overlay border-line-subtle rounded-xl">
                  {SUPPORTED_LANGUAGES.map((lang) => (
                    <SelectItem key={lang.code} value={lang.code} className="text-xs">
                      {lang.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>
      </Card>
    </div>
  );
}
