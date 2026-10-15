import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const projectRoot = process.cwd();

test('StandaloneShell passes signedIn, onRequireAuth and initialModel to AgentStudio', () => {
  const shellPath = path.join(projectRoot, 'components/StandaloneShell.js');
  const shellContent = fs.readFileSync(shellPath, 'utf8');

  assert.match(
    shellContent,
    /<AgentStudio\b[^>]*signedIn=\{!!accountUser\}[^>]*onRequireAuth=\{[^}]+\}[^>]*initialModel=\{selectedModelKey\}/,
    'StandaloneShell must pass signedIn, onRequireAuth and initialModel to AgentStudio',
  );
});

test('AgentStudio accepts signedIn, onRequireAuth, initialModel and resolves effectiveApiKey', () => {
  const studioPath = path.join(projectRoot, 'packages/studio/src/components/AgentStudio.jsx');
  const studioContent = fs.readFileSync(studioPath, 'utf8');

  // Must accept the props
  assert.match(
    studioContent,
    /export default function AgentStudio\(\{\s*apiKey,\s*locale\s*=\s*"en",\s*signedIn\s*=\s*false,\s*onRequireAuth,\s*initialModel/,
    'AgentStudio signature must accept apiKey, locale, signedIn, onRequireAuth, initialModel',
  );

  // Must resolve effectiveApiKey using supdance-account-session
  assert.match(
    studioContent,
    /const effectiveApiKey = apiKey \|\| \(signedIn \? ['"]supdance-account-session['"] : null\);/,
    'AgentStudio must resolve effectiveApiKey with supdance-account-session fallback',
  );

  // Must have FALLBACK_TEMPLATES to ensure templates always render
  assert.match(
    studioContent,
    /const FALLBACK_TEMPLATES = \[/,
    'AgentStudio must declare FALLBACK_TEMPLATES',
  );

  // Must have retry state and retrigger logic
  assert.match(
    studioContent,
    /const \[retryCount, setRetryCount\] = useState\(0\);/,
    'AgentStudio must have retryCount state for retrying',
  );

  // Must render auth prompt card when unauthenticated
  assert.match(
    studioContent,
    /copy\.auth\?\.heading/,
    'AgentStudio must render auth prompt card using copy.auth.heading',
  );
});

test('MuAPI agent endpoints support session credentials and supdance-account-session key', () => {
  const muapiPath = path.join(projectRoot, 'packages/studio/src/muapi.js');
  const muapiContent = fs.readFileSync(muapiPath, 'utf8');

  assert.match(
    muapiContent,
    /function resolveAgentKey\(apiKey\)/,
    'muapi.js must declare resolveAgentKey helper',
  );
  assert.match(
    muapiContent,
    /['"]supdance-account-session['"]/,
    'muapi.js must support supdance-account-session fallback for agent endpoints',
  );
  assert.match(
    muapiContent,
    /credentials:\s*['"]include['"]/,
    'muapi.js must pass credentials include for session cookies',
  );
});

test('app/api/agents route permits public templates reading without requiring user session', () => {
  const routePath = path.join(projectRoot, 'app/api/agents/[[...path]]/route.js');
  const routeContent = fs.readFileSync(routePath, 'utf8');

  assert.match(
    routeContent,
    /function isPublicAgentGet\(pathSegments\)/,
    'route.js must declare isPublicAgentGet helper',
  );
  assert.match(
    routeContent,
    /if \(!user && !isPublic\) return NextResponse\.json\(\{ error: '请先登录' \}, \{ status: 401 \}\);/,
    'route.js must only require user session for non-public agent endpoints',
  );
});
