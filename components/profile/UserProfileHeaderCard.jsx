'use client';

import React from 'react';
import { Hash, Copy, Check, Calendar, UserPlus, UserCheck } from 'lucide-react';
import UserAvatar from '@/components/ui/UserAvatar';
import { Button } from '@/components/ui/button';

export default function UserProfileHeaderCard({
  creator,
  currentUser = null,
  isFollowing = false,
  followersCount = 0,
  followBusy = false,
  onToggleFollow,
  onCopyUid,
  copiedUid = false,
  compact = false,
  className = '',
}) {
  if (!creator) return null;

  const isOwner = currentUser && (currentUser.id === creator.id || currentUser.userNumber === creator.userNumber);

  return (
    <div
      className={`relative rounded-3xl border border-line-subtle bg-surface-raised p-5 sm:p-7 shadow-elevation-2 overflow-hidden ${className}`}
    >
      {/* 顶部微透环境光晕 */}
      <div
        className="absolute top-0 right-0 w-80 h-80 rounded-full blur-3xl pointer-events-none opacity-20"
        style={{ background: 'radial-gradient(circle, rgba(255,45,120,0.12) 0%, transparent 70%)' }}
      />

      <div className={`flex ${compact ? 'flex-col gap-4' : 'flex-col sm:flex-row sm:items-center justify-between gap-6'} relative z-10`}>
        <div className="flex items-center gap-4 sm:gap-5 min-w-0">
          {/* 头像 */}
          <div className={`${compact ? 'size-16' : 'size-20 sm:size-24'} rounded-full overflow-hidden bg-wash border-2 border-line-subtle flex items-center justify-center text-2xl font-bold text-brand shrink-0 shadow-elevation-1`}>
            <UserAvatar
              src={creator.avatarUrl}
              name={creator.displayName}
              className="size-full object-cover"
              fallbackClassName="text-2xl font-bold text-brand"
            />
          </div>

          {/* 昵称、UID与简介 */}
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className={`${compact ? 'text-lg' : 'text-xl sm:text-2xl'} font-bold text-ink tracking-tight truncate`}>
                {creator.displayName || '创作者'}
              </h2>
              <button
                type="button"
                onClick={onCopyUid}
                title="点击复制用户 ID"
                className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-mono border border-brand-line/40 bg-brand-soft text-brand hover:bg-brand-soft/80 active:scale-95 transition-all cursor-pointer"
              >
                <Hash className="size-3" />
                <span>UID: {creator.userNumber || creator.id}</span>
                {copiedUid ? <Check className="size-3 ml-0.5" /> : <Copy className="size-3 ml-0.5 opacity-60" />}
              </button>
              {isOwner && (
                <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-wash text-ink-muted border border-line-subtle">
                  我的主页
                </span>
              )}
            </div>

            <p className="mt-1.5 text-xs sm:text-sm text-ink-muted max-w-xl leading-relaxed line-clamp-2">
              {creator.bio || '这位创作者很神秘，还没有填写个人简介。'}
            </p>

            {/* 粉丝与关注数 */}
            <div className="mt-3 flex items-center gap-4 sm:gap-5 text-xs text-ink-muted">
              <div>
                <span className="font-semibold text-ink font-mono">{followersCount}</span> 粉丝
              </div>
              <div>
                <span className="font-semibold text-ink font-mono">{creator.followingCount || 0}</span> 关注
              </div>
              <div className="text-[11px] text-ink-subtle flex items-center gap-1 hidden sm:flex">
                <Calendar className="size-3" />
                <span>加入于 {new Date(creator.createdAt || Date.now()).toLocaleDateString('zh-CN')}</span>
              </div>
            </div>
          </div>
        </div>

        {/* 关注按钮 */}
        {!isOwner && (
          <Button
            type="button"
            variant={isFollowing ? 'secondary' : 'primary'}
            size="md"
            disabled={followBusy}
            onClick={onToggleFollow}
            className={`rounded-full px-5 text-xs font-semibold shrink-0 cursor-pointer self-start sm:self-auto ${
              isFollowing
                ? 'border-line-subtle bg-wash text-ink hover:bg-red-500/15 hover:text-red-300 hover:border-red-500/30'
                : 'bg-white text-black hover:bg-zinc-200'
            }`}
          >
            {isFollowing ? (
              <>
                <UserCheck className="size-3.5 mr-1.5" />
                已关注
              </>
            ) : (
              <>
                <UserPlus className="size-3.5 mr-1.5" />
                关注创作者
              </>
            )}
          </Button>
        )}
      </div>
    </div>
  );
}
