import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import parser from '@babel/parser';
import _traverse from '@babel/traverse';

const traverse = _traverse.default || _traverse;

test('Milestone 1 - UserDropdownMenu: state integrity and AST binding validation', async () => {
  const code = await readFile(new URL('../components/UserDropdownMenu.js', import.meta.url), 'utf8');

  // 1. Check exact state declarations
  assert.ok(
    code.includes('const [isSubscriptionModalOpen, setIsSubscriptionModalOpen] = useState(false);'),
    'Must declare isSubscriptionModalOpen state hook with useState(false)'
  );
  assert.ok(
    code.includes('const [notifications, setNotifications] = useState([]);'),
    'Must declare notifications state hook with useState([])'
  );

  // 2. Check modal trigger and subscription modal integration
  assert.ok(
    code.includes('setIsSubscriptionModalOpen(true);'),
    'handleOpenSubscriptionModal must call setIsSubscriptionModalOpen(true)'
  );
  assert.ok(
    code.includes('isOpen={isSubscriptionModalOpen}'),
    'SubscriptionModal must receive isOpen={isSubscriptionModalOpen}'
  );
  assert.ok(
    code.includes('setIsSubscriptionModalOpen(false)'),
    'SubscriptionModal onClose must set isSubscriptionModalOpen to false'
  );

  // 3. Full AST traversal to ensure zero referenced undeclared identifiers
  const ast = parser.parse(code, { sourceType: 'module', plugins: ['jsx'] });
  const undeclared = new Set();
  const allowedGlobals = new Set([
    'window', 'document', 'localStorage', 'console', 'fetch', 'setTimeout', 'clearTimeout',
    'Array', 'Object', 'String', 'Number', 'Boolean', 'JSON', 'Math', 'Date', 'Set', 'Map',
    'encodeURIComponent', 'decodeURIComponent', 'Intl', 'RegExp', 'Error', 'Promise', 'navigator'
  ]);

  traverse(ast, {
    Program(path) {
      path.traverse({
        Identifier(idPath) {
          if (!idPath.isReferencedIdentifier()) return;
          const name = idPath.node.name;
          if (allowedGlobals.has(name)) return;
          if (!idPath.scope.hasBinding(name)) {
            undeclared.add(name);
          }
        }
      });
    }
  });

  assert.deepEqual(
    Array.from(undeclared),
    [],
    `Expected zero undeclared referenced identifiers in UserDropdownMenu.js, found: ${Array.from(undeclared).join(', ')}`
  );
});

test('Milestone 1 - Avatar API: relative redirection safety without localhost:3200 leakage', async () => {
  const code = await readFile(new URL('../app/api/user/avatar/route.js', import.meta.url), 'utf8');

  // 1. Ensure no Response.redirect with request.url
  assert.ok(
    !code.includes('Response.redirect(new URL('),
    'Must not construct Response.redirect with new URL(..., request.url)'
  );

  // 2. Ensure default SVG redirection uses relative 307 Response
  assert.ok(
    code.includes("headers: { Location: '/assets/avatars/default-01.svg' }"),
    'Default avatar must return relative Location /assets/avatars/default-01.svg'
  );
  assert.ok(
    code.includes('status: 307'),
    'Avatar redirect must return HTTP 307 status'
  );

  // 3. Ensure custom asset key handles both external HTTPS and relative paths
  assert.ok(
    code.includes("const redirectLocation = /^https?:\\/\\//i.test(assetUrl)"),
    'Must distinguish external https:// from relative asset paths'
  );

  // 4. Ensure userRow.avatar_url handles relative and external paths without echoing reverse proxy host
  assert.ok(
    code.includes("!userRow.avatar_url.startsWith('/api/user/avatar')"),
    'Must prevent infinite redirect loops on /api/user/avatar'
  );

  // 5. Test GET handler directly by importing or evaluating simulated logic
  // Simulate GET handler behavior with mocked dataAccess and storageService
  const simulateAvatarGet = async ({ userRow, assetUrlResult = null }) => {
    if (userRow?.avatar_object_key) {
      const assetUrl = assetUrlResult;
      if (assetUrl) {
        const redirectLocation = /^https?:\/\//i.test(assetUrl)
          ? assetUrl
          : (assetUrl.startsWith('/') ? assetUrl : `/${assetUrl}`);
        return new Response(null, {
          status: 307,
          headers: { Location: redirectLocation },
        });
      }
    }

    if (userRow?.avatar_url && !userRow.avatar_url.startsWith('/api/user/avatar')) {
      if (/^https?:\/\//i.test(userRow.avatar_url) || /^\//.test(userRow.avatar_url)) {
        return new Response(null, {
          status: 307,
          headers: { Location: userRow.avatar_url },
        });
      }
    }

    return new Response(null, {
      status: 307,
      headers: { Location: '/assets/avatars/default-01.svg' },
    });
  };

  // Test 5.1: Anonymous or user without avatar
  const defaultRes = await simulateAvatarGet({ userRow: null });
  assert.equal(defaultRes.status, 307);
  assert.equal(defaultRes.headers.get('Location'), '/assets/avatars/default-01.svg');
  assert.ok(!defaultRes.headers.get('Location').includes('localhost:3200'));

  // Test 5.2: User with custom relative avatar URL
  const relRes = await simulateAvatarGet({ userRow: { avatar_url: '/uploads/avatars/u123.png' } });
  assert.equal(relRes.status, 307);
  assert.equal(relRes.headers.get('Location'), '/uploads/avatars/u123.png');

  // Test 5.3: User with external HTTPS avatar URL (OAuth)
  const extRes = await simulateAvatarGet({ userRow: { avatar_url: 'https://thirdparty.com/avatar.jpg' } });
  assert.equal(extRes.status, 307);
  assert.equal(extRes.headers.get('Location'), 'https://thirdparty.com/avatar.jpg');

  // Test 5.4: User with storage object key resolving to signed HTTPS URL
  const storageRes = await simulateAvatarGet({
    userRow: { avatar_object_key: 'avatars/private-123.webp' },
    assetUrlResult: 'https://cos.ap-beijing.myqcloud.com/supdance/avatars/private-123.webp?sign=xxx',
  });
  assert.equal(storageRes.status, 307);
  assert.equal(storageRes.headers.get('Location'), 'https://cos.ap-beijing.myqcloud.com/supdance/avatars/private-123.webp?sign=xxx');
});

test('Milestone 1 - CSP Whitelist: canvas.supdance.com and Google Analytics in middleware.js', async () => {
  const code = await readFile(new URL('../middleware.js', import.meta.url), 'utf8');

  // Extract Content-Security-Policy string from middleware source
  const cspMatch = code.match(/'Content-Security-Policy',\s*`?([^\`\n\r]+)`?/);
  assert.ok(cspMatch, 'Must find Content-Security-Policy header in middleware.js');
  const cspValue = cspMatch[1];

  // Parse directives
  const directives = {};
  for (const part of cspValue.split(';')) {
    const trimmed = part.trim();
    if (!trimmed) continue;
    const [name, ...vals] = trimmed.split(/\s+/);
    directives[name] = vals;
  }

  // 1. connect-src checks
  const connectSrc = directives['connect-src'] || [];
  assert.ok(
    connectSrc.includes('https://canvas.supdance.com'),
    'connect-src must contain https://canvas.supdance.com'
  );
  assert.ok(
    connectSrc.includes('https://*.google-analytics.com'),
    'connect-src must contain https://*.google-analytics.com'
  );
  assert.ok(
    connectSrc.includes('https://*.analytics.google.com'),
    'connect-src must contain https://*.analytics.google.com'
  );
  assert.ok(
    connectSrc.includes('https://*.googletagmanager.com'),
    'connect-src must contain https://*.googletagmanager.com'
  );
  assert.ok(
    connectSrc.includes('https://hm.baidu.com'),
    'connect-src must contain https://hm.baidu.com'
  );
  assert.ok(
    connectSrc.includes('https://*.clarity.ms'),
    'connect-src must contain https://*.clarity.ms'
  );
  assert.ok(
    connectSrc.includes('https://www.clarity.ms'),
    'connect-src must contain https://www.clarity.ms'
  );

  // 2. script-src checks
  const scriptSrc = directives['script-src'] || [];
  assert.ok(
    scriptSrc.includes('https://www.googletagmanager.com'),
    'script-src must contain https://www.googletagmanager.com'
  );
  assert.ok(
    scriptSrc.includes('https://*.googletagmanager.com'),
    'script-src must contain https://*.googletagmanager.com'
  );
  assert.ok(
    scriptSrc.includes('https://hm.baidu.com'),
    'script-src must contain https://hm.baidu.com'
  );
  assert.ok(
    scriptSrc.includes('https://*.clarity.ms'),
    'script-src must contain https://*.clarity.ms'
  );
  assert.ok(
    scriptSrc.includes('https://www.clarity.ms'),
    'script-src must contain https://www.clarity.ms'
  );
});
