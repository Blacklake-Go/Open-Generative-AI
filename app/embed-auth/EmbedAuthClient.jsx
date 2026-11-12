'use client';

import { useCallback, useEffect, useState } from 'react';
import AuthModal from '@/components/AuthModal';

const ALLOWED_PARENT_ORIGINS = new Set([
  'https://www.supdance.com',
  'https://supdance.com',
  'https://canvas.supdance.com',
]);

export const EMBED_AUTH_MESSAGE_TYPE = 'supdance:embed-auth';

function pickAllowedOrigin(value) {
  if (!value) return null;
  try {
    const { origin } = new URL(value);
    return ALLOWED_PARENT_ORIGINS.has(origin) ? origin : null;
  } catch {
    return null;
  }
}

export default function EmbedAuthClient({ locale, mode, tab, parentOrigin }) {
  const [open, setOpen] = useState(true);
  const [resolvedParentOrigin, setResolvedParentOrigin] = useState(null);

  useEffect(() => {
    const fromQuery = pickAllowedOrigin(parentOrigin);
    if (fromQuery) {
      setResolvedParentOrigin(fromQuery);
      return;
    }
    setResolvedParentOrigin(pickAllowedOrigin(document.referrer));
  }, [parentOrigin]);

  const postToParent = useCallback(
    (action, payload = {}) => {
      if (!resolvedParentOrigin || window.parent === window) return;
      window.parent.postMessage({ type: EMBED_AUTH_MESSAGE_TYPE, action, ...payload }, resolvedParentOrigin);
    },
    [resolvedParentOrigin]
  );

  const handleClose = useCallback(() => {
    postToParent('close');
    setOpen(false);
  }, [postToParent]);

  const handleSuccess = useCallback(
    (user, meta) => {
      postToParent('success', { user, meta: meta || null });
      setOpen(false);
    },
    [postToParent]
  );

  // 登录后主站会继续展示签到/资产弹层，先通知画布刷新会话，避免底层页面仍是未登录态
  useEffect(() => {
    const handleAuthSuccess = () => postToParent('session');
    window.addEventListener('supdance-auth-success', handleAuthSuccess);
    return () => window.removeEventListener('supdance-auth-success', handleAuthSuccess);
  }, [postToParent]);

  useEffect(() => {
    postToParent('ready');
  }, [postToParent]);

  return (
    <>
      <style>{'html,body{margin:0;height:100%;overflow:hidden;background:transparent!important}'}</style>
      <AuthModal
        isOpen={open}
        locale={locale}
        initialMode={mode}
        initialTab={tab}
        forceOAuthPopup
        onClose={handleClose}
        onSuccess={handleSuccess}
      />
    </>
  );
}
