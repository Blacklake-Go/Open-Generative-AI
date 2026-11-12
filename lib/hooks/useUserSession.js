'use client';

import { useEffect, useCallback, useMemo, useSyncExternalStore } from 'react';

let cachedUser = null;
let cachedCredits = null;
let cachedEntitlements = null;
let fetchPromise = null;
let isInitialized = false;

// Hydrate storage only after React has matched the server snapshot; subsequent
// client navigation reads the in-memory session without a second empty render.
function initFromStorage() {
  if (typeof window === 'undefined' || isInitialized) return;
  isInitialized = true;
  try {
    const stored = localStorage.getItem('ko_user');
    if (stored) {
      const parsed = JSON.parse(stored);
      if (parsed && typeof parsed === 'object') {
        cachedUser = parsed;
        if (typeof parsed.credits === 'number') {
          cachedCredits = parsed.credits;
        }
      }
    }
    const storedEnt = localStorage.getItem('ko_entitlements');
    if (storedEnt) {
      const parsedEnt = JSON.parse(storedEnt);
      if (parsedEnt && typeof parsedEnt === 'object') {
        cachedEntitlements = parsedEnt;
      }
    }
  } catch {}
}

const listeners = new Set();
function sessionSnapshot(user, credits, entitlements) {
  const isPaidUser = Boolean(user?.is_subscribed || user?.isSubscribed ||
    (user?.plan_id && String(user.plan_id).toLowerCase() !== 'free'));
  const fallbackEntitlements = isPaidUser ? {
    planId: user.plan_id || 'vip', planName: String(user.plan_id || 'VIP').toUpperCase(),
    isPaidSubscription: true, credits: user.credits ?? 0,
  } : null;
  return { user, credits, entitlements: entitlements || fallbackEntitlements, isPaidUser };
}
let currentSnapshot;
let snapshotEntitlements;
function getSessionSnapshot() {
  if (!currentSnapshot || currentSnapshot.user !== cachedUser || currentSnapshot.credits !== cachedCredits || snapshotEntitlements !== cachedEntitlements) {
    currentSnapshot = sessionSnapshot(cachedUser, cachedCredits, cachedEntitlements);
    snapshotEntitlements = cachedEntitlements;
  }
  return currentSnapshot;
}
function subscribeSession(listener) { listeners.add(listener); return () => listeners.delete(listener); }
function notifyListeners() {
  listeners.forEach((listener) => { try { listener(); } catch {} });
}

export function fetchUserSession(force = false) {
  if (fetchPromise && !force) return fetchPromise;

  const runFetch = (retriesLeft = 2) => {
    return fetch('/api/auth/me', { cache: 'no-store' })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (!data?.user && cachedUser && retriesLeft > 0) {
          // 若本地已存在有效会话用户，但服务端接口暂时未返回用户（可能由于跨进程 cookie 尚未同步完成），延迟重试一次避免误清除
          return new Promise((resolve) => {
            setTimeout(() => {
              resolve(runFetch(retriesLeft - 1));
            }, 250);
          });
        }
        fetchPromise = null;
        if (data?.user) {
          cachedUser = data.user;
          cachedCredits = data.entitlements?.credits ?? data.user.credits ?? 0;
          cachedEntitlements = data.entitlements || null;
          try {
            localStorage.setItem('ko_user', JSON.stringify(data.user));
            if (data.user.locale) {
              const norm = data.user.locale;
              localStorage.setItem('NEXT_LOCALE', norm);
              localStorage.setItem('locale', norm);
              const hostname = typeof window !== 'undefined' ? window.location.hostname : '';
              const cookieDomain = hostname.endsWith('.supdance.com')
                ? '; domain=.supdance.com'
                : hostname === 'supdance.com'
                  ? '; domain=.supdance.com'
                  : '';
              document.cookie = `NEXT_LOCALE=${encodeURIComponent(norm)}; path=/; max-age=31536000; SameSite=Lax${cookieDomain}`;
              document.cookie = `locale=${encodeURIComponent(norm)}; path=/; max-age=31536000; SameSite=Lax${cookieDomain}`;
            }
            if (data.user.preferences) {
              localStorage.setItem('supdance_user_preferences', JSON.stringify(data.user.preferences));
            }
            if (data.entitlements) {
              localStorage.setItem('ko_entitlements', JSON.stringify(data.entitlements));
            } else {
              localStorage.removeItem('ko_entitlements');
            }
          } catch {}
        } else {
          cachedUser = null;
          cachedCredits = null;
          cachedEntitlements = null;
          try {
            localStorage.removeItem('ko_user');
            localStorage.removeItem('ko_entitlements');
          } catch {}
        }
        notifyListeners();
        return { user: cachedUser, credits: cachedCredits, entitlements: cachedEntitlements };
      })
      .catch(() => {
        fetchPromise = null;
        return { user: cachedUser, credits: cachedCredits, entitlements: cachedEntitlements };
      });
  };

  fetchPromise = runFetch(2);
  return fetchPromise;
}

/**
 * 全局用户登录态与积分单例 Hook (消除路由切换时的用户状态闪屏)
 * @param {Object|null|undefined} initialUser 服务端注入的初始用户信息（避免客户端水合跳闪）
 */
export function useUserSession(initialUser = undefined) {
  // React uses the same request-owned snapshot for SSR and the first hydration
  // render. Normal client navigation reads the shared cache synchronously.
  const serverSnapshot = useMemo(() => sessionSnapshot(initialUser || null, initialUser?.credits ?? null, null), [initialUser]);
  const readServerSnapshot = useCallback(() => serverSnapshot, [serverSnapshot]);
  const state = useSyncExternalStore(subscribeSession, getSessionSnapshot, readServerSnapshot);
  const isPaidUser = state.isPaidUser;

  useEffect(() => {
    initFromStorage();
    if (initialUser !== undefined) {
      cachedUser = initialUser;
      cachedCredits = initialUser?.credits ?? null;
      cachedEntitlements = null;
    }
    notifyListeners();

    // 挂载时后台静默校验刷新一次
    fetchUserSession();

    // 监听资料与头像即时更新事件总线
    const handleProfileUpdated = (e) => {
      if (e.detail?.user) {
        cachedUser = { ...cachedUser, ...e.detail.user };
        notifyListeners();
      } else if (e.detail?.avatarUrl !== undefined && cachedUser) {
        cachedUser = {
          ...cachedUser,
          avatar_url: e.detail.avatarUrl,
          avatar: e.detail.avatarUrl,
        };
        notifyListeners();
      }
      fetchUserSession(true);
    };

    const handleStorage = (e) => {
      if (e.key === 'ko_user') {
        try {
          cachedUser = e.newValue ? JSON.parse(e.newValue) : null;
          notifyListeners();
        } catch {}
      } else if (e.key === 'ko_entitlements') {
        try {
          cachedEntitlements = e.newValue ? JSON.parse(e.newValue) : null;
          notifyListeners();
        } catch {}
      }
    };

    const handleAuthSuccess = (e) => {
      if (e.detail?.user) {
        cachedUser = e.detail.user;
        if (typeof e.detail.user.credits === 'number') {
          cachedCredits = e.detail.user.credits;
        }
        if (e.detail.entitlements) {
          cachedEntitlements = e.detail.entitlements;
          try {
            localStorage.setItem('ko_entitlements', JSON.stringify(e.detail.entitlements));
          } catch {}
        }
        notifyListeners();
      }
      fetchUserSession(true);
    };

    window.addEventListener('user-profile-updated', handleProfileUpdated);
    window.addEventListener('storage', handleStorage);
    window.addEventListener('supdance-auth-success', handleAuthSuccess);

    return () => {
      window.removeEventListener('user-profile-updated', handleProfileUpdated);
      window.removeEventListener('storage', handleStorage);
      window.removeEventListener('supdance-auth-success', handleAuthSuccess);
    };
  }, [initialUser]);

  const refresh = useCallback((force = true) => {
    return fetchUserSession(force);
  }, []);

  const mutate = useCallback((updater) => {
    if (typeof updater === 'function') {
      const next = updater({ user: cachedUser, credits: cachedCredits, entitlements: cachedEntitlements });
      if (next.user !== undefined) cachedUser = next.user;
      if (next.credits !== undefined) cachedCredits = next.credits;
      if (next.entitlements !== undefined) cachedEntitlements = next.entitlements;
    } else if (updater && typeof updater === 'object') {
      if (updater.user !== undefined) cachedUser = updater.user;
      if (updater.credits !== undefined) cachedCredits = updater.credits;
      if (updater.entitlements !== undefined) cachedEntitlements = updater.entitlements;
    }
    notifyListeners();
  }, []);

  return {
    user: state.user,
    credits: state.credits,
    entitlements: state.entitlements,
    isPaidUser,
    refresh,
    mutate,
  };
}
