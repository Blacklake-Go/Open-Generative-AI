'use client';

import { useCallback, useEffect } from 'react';
import AuthModal from '@/components/AuthModal';

export default function EmbeddedAuth({ parentOrigin, mode, tab, locale }) {
  const notify = useCallback((action) => {
    // The parent re-fetches its authoritative session. No identity or credentials cross this channel.
    window.parent.postMessage({ type: 'supdance:embed-auth', action }, parentOrigin);
  }, [parentOrigin]);

  useEffect(() => {
    const controller = new AbortController();
    fetch('/api/auth/me', { credentials: 'same-origin', cache: 'no-store', signal: controller.signal })
      .then(async (response) => { if (response.ok && (await response.json()).user) notify('success'); })
      .catch(() => {});
    const onKey = (event) => { if (event.key === 'Escape') notify('close'); };
    const onSession = () => notify('session');
    window.addEventListener('keydown', onKey);
    window.addEventListener('supdance-auth-success', onSession);
    notify('ready');
    return () => { controller.abort(); window.removeEventListener('keydown', onKey); window.removeEventListener('supdance-auth-success', onSession); };
  }, [notify]);

  return <><style>{'html,body{margin:0;height:100%;overflow:hidden;background:transparent!important}'}</style><AuthModal locale={locale} initialMode={mode} initialTab={tab} onSuccess={() => notify('success')} onClose={() => notify('close')} /></>;
}
