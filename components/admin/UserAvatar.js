'use client';

import React from 'react';
import UnifiedUserAvatar from '@/components/ui/UserAvatar';

// 统一复用全站工业级防破碎用户头像能力
export function UserAvatar({ src, alt, letter, className = 'size-full object-cover' }) {
  return (
    <UnifiedUserAvatar
      src={src}
      alt={alt}
      name={letter || alt}
      className={className}
      fallbackClassName="select-none font-bold"
    >
      <span className="select-none">{letter}</span>
    </UnifiedUserAvatar>
  );
}

export default UserAvatar;
