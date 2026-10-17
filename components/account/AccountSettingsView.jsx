'use client';

import React, { useState } from 'react';
import ProfileTab from './tabs/ProfileTab';
import SystemPreferencesSection from './settings/SystemPreferencesSection';
import { UserRound, SlidersHorizontal } from 'lucide-react';

export default function AccountSettingsView({
  user,
  profileName: propProfileName,
  setProfileName: propSetProfileName,
  onSaveProfile,
  onProfileUpdated,
  busy = false,
  initialSubTab = 'profile',
  embedded = false,
  className = '',
}) {
  const [subTab, setSubTab] = useState(initialSubTab); // 'profile' | 'preferences'

  return (
    <div className={`w-full ${className}`}>
      {/* 顶部子模式切换胶囊 */}
      <div className="flex items-center gap-2 mb-6 border-b border-line-subtle pb-3 select-none">
        <button
          type="button"
          onClick={() => setSubTab('profile')}
          className={`flex items-center gap-2 px-3.5 py-1.5 rounded-full text-xs font-semibold transition-all cursor-pointer ${
            subTab === 'profile'
              ? 'bg-brand text-white shadow-elevation-1'
              : 'text-ink-muted hover:text-ink hover:bg-wash'
          }`}
        >
          <UserRound className="size-3.5" />
          <span>账户资料与安全</span>
        </button>

        <button
          type="button"
          onClick={() => setSubTab('preferences')}
          className={`flex items-center gap-2 px-3.5 py-1.5 rounded-full text-xs font-semibold transition-all cursor-pointer ${
            subTab === 'preferences'
              ? 'bg-brand text-white shadow-elevation-1'
              : 'text-ink-muted hover:text-ink hover:bg-wash'
          }`}
        >
          <SlidersHorizontal className="size-3.5" />
          <span>系统与偏好设置</span>
        </button>
      </div>

      {/* 内容区域 */}
      {subTab === 'profile' ? (
        <ProfileTab
          user={user}
          profileName={propProfileName}
          setProfileName={propSetProfileName}
          onSaveProfile={onSaveProfile}
          onProfileUpdated={onProfileUpdated}
          busy={busy}
        />
      ) : (
        <SystemPreferencesSection user={user} />
      )}
    </div>
  );
}
