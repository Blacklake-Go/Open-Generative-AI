import fs from 'node:fs/promises';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { findSecretFindings } from './secret-scan-rules.mjs';

const result = spawnSync('git', ['ls-files', '-co', '--exclude-standard'], { encoding: 'utf8' });
if (result.status !== 0) throw new Error(result.stderr || 'git ls-files failed');
const ignored = new Set(['.env.example', 'package-lock.json']);
const knownCiDatabaseUrl = /postgresql:\/\/ci_user:ci_pass@localhost:5432\/open_generative_ai(?:_test)?/g;
const findings = [];
for (const name of result.stdout.split(/\r?\n/).filter(Boolean)) {
  if (ignored.has(name) || /(^|[\\/])tests([\\/]|$)/.test(name) || /(^|[\\/])\.env/.test(name)) continue;
  let content;
  try { content = (await fs.readFile(name, 'utf8')).replace(knownCiDatabaseUrl, 'postgresql://<isolated-ci-test-database>'); } catch { continue; }
  for (const finding of findSecretFindings(content)) findings.push(`${name}: ${finding}`);
}
if (findings.length) { console.error(findings.join('\n')); process.exitCode = 1; }
else console.log('secret scan passed (test fixtures and environment templates excluded)');
