import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToString } from 'react-dom/server';
import { useUserSession } from '../lib/hooks/useUserSession.js';

function Account({ initialUser }) {
  const { user, credits, isPaidUser } = useUserSession(initialUser);
  return React.createElement('output', null, `${user?.id || 'anonymous'}:${credits ?? 'unknown'}:${isPaidUser}`);
}

test('stored account and entitlements cannot change the server hydration snapshot', () => {
  const beforeWindow = globalThis.window;
  const beforeStorage = globalThis.localStorage;
  try {
    delete globalThis.window;
    const anonymous = renderToString(React.createElement(Account));
    const initialUser = { id: 'current-owner', credits: 7, plan_id: 'free' };
    const signedIn = renderToString(React.createElement(Account, { initialUser }));
    globalThis.window = {};
    globalThis.localStorage = { getItem(key) { return key === 'ko_user' ? JSON.stringify({ id: 'previous-owner', credits: 999, plan_id: 'vip' }) : JSON.stringify({ planId: 'vip', credits: 999 }); } };
    assert.equal(renderToString(React.createElement(Account)), anonymous);
    assert.equal(renderToString(React.createElement(Account, { initialUser })), signedIn);
    assert.doesNotMatch(signedIn, /previous-owner|999/);
  } finally {
    if (beforeWindow === undefined) delete globalThis.window; else globalThis.window = beforeWindow;
    if (beforeStorage === undefined) delete globalThis.localStorage; else globalThis.localStorage = beforeStorage;
  }
});
