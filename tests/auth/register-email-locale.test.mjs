import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

test('email registration sends the active locale through the verification-code request', async () => {
  const [modal, route] = await Promise.all([
    fs.readFile(path.join(repoRoot, 'components/AuthModal.js'), 'utf8'),
    fs.readFile(path.join(repoRoot, 'app/api/auth/register/send-code/route.js'), 'utf8'),
  ]);

  assert.match(modal, /fetch\('\/api\/auth\/register\/send-code'[\s\S]{0,260}body:\s*JSON\.stringify\(\{\s*email:\s*cleanEmail,\s*locale:\s*activeLocale\s*\}\)/);
  assert.match(route, /requestEmailRegisterCode\(\{[\s\S]{0,180}locale:\s*body\.locale\s*\|\|\s*'zh-CN'/);
});
