/**
 * Legacy AuthModal - Deprecated in favor of unified full-screen /login and /zh/login routes.
 *
 * Preserved for backwards compatibility with studio DOM adapters. Automatically forwards
 * callers to the modern account requirement workflow or redirects to the unified login page.
 */
export function AuthModal(onSuccess) {
    if (typeof window === 'undefined') return null;

    if (typeof window.__KOYOSIM_REQUIRE_ACCOUNT__ === 'function') {
        window.__KOYOSIM_REQUIRE_ACCOUNT__()
            .then((user) => {
                if (user && typeof onSuccess === 'function') {
                    onSuccess(user);
                }
            })
            .catch(() => {});
        return null;
    }

    try {
        window.dispatchEvent(new CustomEvent('koyosim:open-auth', { detail: { mode: 'login' } }));
    } catch {}

    const isZh = window.location.pathname.startsWith('/zh');
    const loginUrl = `${isZh ? '/zh/login' : '/login'}?redirect=${encodeURIComponent(window.location.href)}`;
    window.location.href = loginUrl;
    return null;
}
