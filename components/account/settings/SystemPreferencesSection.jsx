'use client';

import React, { useState, useEffect } from 'react';
import { Card } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { DEFAULT_LOCALE, getLocaleConfig, LOCALE_CONFIGS, SUPPORTED_LOCALES, normalizeLocale } from '@/lib/locales';
import { switchLocale as switchLocaleVia } from '@/lib/client/localeSwitch';
import { Bell, Eye, Globe, CheckCircle2, AlertCircle } from 'lucide-react';

const SUPPORTED_LANGUAGES = SUPPORTED_LOCALES.map((code) => ({
  code,
  label: LOCALE_CONFIGS[code]?.nativeName || code,
}));

export default function SystemPreferencesSection({ user = null, className = '' }) {
  const [notifications, setNotifications] = useState(() => user?.preferences?.notifyOnComplete ?? true);
  const [highQualityPreview, setHighQualityPreview] = useState(() => user?.preferences?.highQualityPreview ?? true);
  const [currentLocale, setCurrentLocale] = useState(() => normalizeLocale(user?.locale || DEFAULT_LOCALE));
  const [loading, setLoading] = useState(true);
  const [toastMessage, setToastMessage] = useState('');
  const [toastType, setToastType] = useState('success');

  const normalizedLocale = normalizeLocale(currentLocale);
  const activeLangLabel = SUPPORTED_LANGUAGES.find((l) => l.code === normalizedLocale)?.label || normalizedLocale;

  const isZh = normalizedLocale.startsWith('zh');
  const copy = {
    title: isZh ? '偏好与体验' : (normalizedLocale === 'ja-JP' ? '環境設定と体験' : (normalizedLocale === 'ko-KR' ? '환경설정 및 경험' : (normalizedLocale === 'es' ? 'Preferencias y experiencia' : 'Preferences & Experience'))),
    notifications: isZh ? '生成完成通知' : (normalizedLocale === 'ja-JP' ? '生成完了通知' : (normalizedLocale === 'ko-KR' ? '생성 완료 알림' : (normalizedLocale === 'es' ? 'Notificaciones de generación' : 'Generation Notifications'))),
    notificationsDesc: isZh ? '在视频、音频或图像生成完毕后推送提醒' : (normalizedLocale === 'ja-JP' ? '画像・動画・音声の生成完了時にプッシュ通知' : (normalizedLocale === 'ko-KR' ? '이미지, 비디오 또는 오디오 생성 완료 시 푸시 알림' : (normalizedLocale === 'es' ? 'Recibir notificaciones cuando se completen las generaciones' : 'Receive push notifications when image, video, or audio tasks complete'))),
    preview: isZh ? '高画质即时预览' : (normalizedLocale === 'ja-JP' ? '高画質リアルタイムプレビュー' : (normalizedLocale === 'ko-KR' ? '고화질 실시간 미리보기' : (normalizedLocale === 'es' ? 'Vista previa de alta calidad' : 'High-Quality Live Preview'))),
    previewDesc: isZh ? '在工作区使用全保真动态预览（消耗更多显存与带宽）' : (normalizedLocale === 'ja-JP' ? 'ワークスペースで全解像度プレビューを使用（メモリ・帯域幅消費）' : (normalizedLocale === 'ko-KR' ? '작업 공간에서 전체 해상도 미리보기 사용 (메모리 및 대역폭 추가 소모)' : (normalizedLocale === 'es' ? 'Usar vista previa de fidelidad total en el espacio de trabajo' : 'Render full-fidelity preview in workspace (uses more memory and bandwidth)'))),
    language: isZh ? '界面语言' : (normalizedLocale === 'ja-JP' ? 'インターフェース言語' : (normalizedLocale === 'ko-KR' ? '인터페이스 언어' : (normalizedLocale === 'es' ? 'Idioma de la interfaz' : 'Interface Language'))),
    currentLang: isZh ? `当前选择：${activeLangLabel}` : (normalizedLocale === 'ja-JP' ? `現在の選択：${activeLangLabel}` : (normalizedLocale === 'ko-KR' ? `현재 선택: ${activeLangLabel}` : (normalizedLocale === 'es' ? `Selección actual: ${activeLangLabel}` : `Current selection: ${activeLangLabel}`))),
    placeholder: isZh ? '选择语言' : (normalizedLocale === 'ja-JP' ? '言語を選択' : (normalizedLocale === 'ko-KR' ? '언어 선택' : (normalizedLocale === 'es' ? 'Seleccionar idioma' : 'Select Language'))),
    syncedToast: isZh ? '偏好设置已同步至数据库' : (normalizedLocale === 'ja-JP' ? '設定がデータベースに同期されました' : (normalizedLocale === 'ko-KR' ? '환경설정이 데이터베이스에 동기화되었습니다' : (normalizedLocale === 'es' ? 'Preferencias sincronizadas con la base de datos' : 'Preferences synced to database'))),
    saveFailed: isZh ? '设置保存失败' : (normalizedLocale === 'ja-JP' ? '設定の保存に失敗しました' : (normalizedLocale === 'ko-KR' ? '설정 저장에 실패했습니다' : (normalizedLocale === 'es' ? 'Error al guardar ajustes' : 'Failed to save settings'))),
    networkError: isZh ? '网络异常，无法保存偏好设置' : (normalizedLocale === 'ja-JP' ? '网络连接异常' : (normalizedLocale === 'ko-KR' ? '네트워크 오류가 발생했습니다' : (normalizedLocale === 'es' ? 'Error de red' : 'Network error, unable to save preferences'))),
  };

  // 1. 从后端加载真实偏好设置，若有本地快照先即时应用
  useEffect(() => {
    let mounted = true;
    if (typeof window !== 'undefined') {
      try {
        const local = JSON.parse(localStorage.getItem('supdance_user_preferences') || '{}');
        if (local.notifyOnComplete !== undefined) setNotifications(local.notifyOnComplete);
        if (local.highQualityPreview !== undefined) setHighQualityPreview(local.highQualityPreview);
        if (local.locale) setCurrentLocale(normalizeLocale(local.locale));
      } catch {}
    }

    async function loadPreferences() {
      try {
        const res = await fetch('/api/user/preferences');
        if (res.ok) {
          const data = await res.json();
          if (mounted && data.preferences) {
            const notif = data.preferences.notifyOnComplete ?? true;
            const hq = data.preferences.highQualityPreview ?? true;
            const loc = normalizeLocale(data.preferences.locale || DEFAULT_LOCALE);
            setNotifications(notif);
            setHighQualityPreview(hq);
            setCurrentLocale(loc);
            try {
              localStorage.setItem('supdance_user_preferences', JSON.stringify({
                notifyOnComplete: notif,
                highQualityPreview: hq,
                locale: loc,
              }));
            } catch {}
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

  // 2. 实时保存偏好设置至本地与后端数据库
  const savePreference = async (updates) => {
    if (typeof window !== 'undefined') {
      try {
        const current = JSON.parse(localStorage.getItem('supdance_user_preferences') || '{}');
        const next = { ...current, ...updates };
        localStorage.setItem('supdance_user_preferences', JSON.stringify(next));
        if (updates.highQualityPreview !== undefined) {
          localStorage.setItem('supdance_high_quality_preview', String(updates.highQualityPreview));
        }
        window.dispatchEvent(new CustomEvent('supdance-preferences-changed', { detail: next }));
      } catch {}
    }

    try {
      const res = await fetch('/api/user/preferences', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates),
      });
      if (res.ok) {
        const data = await res.json();
        setToastType('success');
        setToastMessage(copy.syncedToast);
        setTimeout(() => setToastMessage(''), 2500);
        return data;
      } else {
        setToastType('error');
        setToastMessage(copy.saveFailed);
        setTimeout(() => setToastMessage(''), 2500);
      }
    } catch {
      setToastType('error');
      setToastMessage(copy.networkError);
      setTimeout(() => setToastMessage(''), 2500);
    }
  };

  const handleToggleNotifications = async (val) => {
    setNotifications(val);
    if (val && typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'default') {
      try {
        await Notification.requestPermission();
      } catch {}
    }
    await savePreference({ notifyOnComplete: val });
  };

  const handleTogglePreview = async (val) => {
    setHighQualityPreview(val);
    await savePreference({ highQualityPreview: val });
  };

  const handleLanguageChange = async (val) => {
    const norm = normalizeLocale(val);
    setCurrentLocale(norm);
    await savePreference({ locale: norm });
    try {
      const pathname = typeof window !== 'undefined' ? window.location.pathname : '/';
      const search = typeof window !== 'undefined' ? window.location.search : '';
      await switchLocaleVia({ targetLocale: norm, pathname, search });
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
          <span>{copy.title}</span>
        </h3>

        <div className="space-y-4">
          {/* 通知设置 */}
          <div className="flex items-center justify-between py-2 border-b border-line-subtle">
            <div className="flex items-center gap-3">
              <div className="size-8 rounded-lg bg-wash border border-line-subtle flex items-center justify-center shrink-0">
                <Bell className="size-4 text-ink-muted" />
              </div>
              <div>
                <p className="text-body-sm font-medium text-ink">{copy.notifications}</p>
                <p className="text-caption text-ink-muted">{copy.notificationsDesc}</p>
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
                <p className="text-body-sm font-medium text-ink">{copy.preview}</p>
                <p className="text-caption text-ink-muted">{copy.previewDesc}</p>
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
                <p className="text-body-sm font-medium text-ink">{copy.language}</p>
                <p className="text-caption text-ink-muted">{copy.currentLang}</p>
              </div>
            </div>
            <div className="w-40">
              <Select value={normalizedLocale} onValueChange={handleLanguageChange} disabled={loading}>
                <SelectTrigger className="w-full bg-well border-line-subtle text-xs rounded-xl h-9">
                  <SelectValue placeholder={copy.placeholder} />
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
