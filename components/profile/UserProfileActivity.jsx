'use client';

import React from 'react';
import { EyeOff } from 'lucide-react';
import { Button } from '@/components/ui/button';
import ActivityTab from '@/components/account/tabs/ActivityTab';

export default function UserProfileActivity({
  creator,
  currentUser = null,
  onSwitchToCreations,
}) {
  if (!creator) return null;

  const isOwner = currentUser && (currentUser.id === creator.id || currentUser.userNumber === creator.userNumber);
  const isActivityHiddenForViewer = !isOwner && creator.isActivityPublic === false;

  if (isActivityHiddenForViewer) {
    return (
      <div className="rounded-2xl border border-line-subtle bg-surface-raised p-8 sm:p-12 text-center flex flex-col items-center justify-center">
        <div className="size-12 rounded-full bg-wash border border-line-subtle flex items-center justify-center text-amber-400 mb-3">
          <EyeOff className="size-6" />
        </div>
        <h3 className="text-base font-semibold text-ink">创作者已将活跃面板设为私密</h3>
        <p className="text-xs text-ink-muted mt-1 max-w-md leading-relaxed">
          为保护创作隐私，该创作者开启了活跃记录隐藏设置。您可以浏览其公开发布在「我的创作」中的作品展。
        </p>
        {onSwitchToCreations && (
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={onSwitchToCreations}
            className="mt-5 rounded-full px-5 text-xs font-semibold cursor-pointer"
          >
            浏览全部公开作品
          </Button>
        )}
      </div>
    );
  }

  return (
    <div>
      {isOwner && creator.isActivityPublic === false && (
        <div className="mb-4 p-3 rounded-xl border border-amber-500/30 bg-amber-500/10 text-amber-300 text-xs flex items-center gap-2">
          <EyeOff className="size-4 shrink-0" />
          <span>提示：您已开启「对外隐藏活跃记录」，此面板当前仅您本人可见，普通访客将无法查看。</span>
        </div>
      )}
      <ActivityTab user={creator} />
    </div>
  );
}
