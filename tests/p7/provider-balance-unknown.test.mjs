import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { mapChannelBalance } from '../../lib/services/providerBalance.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const source = (relative) => fs.readFileSync(path.join(root, relative), 'utf8');

test('未知余额保持 null，不会被数据库默认 0 冒充', () => {
  const unknown = mapChannelBalance({ balance: null, currency: 'USD' });
  assert.equal(unknown.balance, null);
  // 未知余额没有币种可言，避免界面出现「未知 USD」。
  assert.equal(unknown.currency, null);
  assert.equal(unknown.balanceCheckedAt, null);

  const missing = mapChannelBalance({});
  assert.equal(missing.balance, null);
  assert.equal(missing.currency, null);
  assert.equal(missing.availableQuota, null);
});

test('0 是真实观测值，必须与未知区分', () => {
  const zero = mapChannelBalance({ balance: 0, currency: 'USD', balance_checked_at: '2026-10-29T00:00:00.000Z' });
  assert.equal(zero.balance, 0);
  assert.equal(zero.currency, 'USD');
  assert.equal(zero.balanceCheckedAt, '2026-10-29T00:00:00.000Z');

  const zeroString = mapChannelBalance({ balance: '0' });
  assert.equal(zeroString.balance, 0);
  assert.notEqual(zeroString.balance, null);
});

test('数值字符串与配额被规范化为数字，脏值回落为未知', () => {
  const parsed = mapChannelBalance({ balance: '12.5', available_quota: '88', currency: ' CNY ' });
  assert.equal(parsed.balance, 12.5);
  assert.equal(parsed.availableQuota, 88);
  assert.equal(parsed.currency, 'CNY');

  assert.equal(mapChannelBalance({ balance: '' }).balance, null);
  assert.equal(mapChannelBalance({ balance: '   ' }).balance, null);
  assert.equal(mapChannelBalance({ balance: 'not-a-number' }).balance, null);
  assert.equal(mapChannelBalance({ available_quota: 'NaN' }).availableQuota, null);
});

test('余额来源保持三态，且不会把未登记说成不支持', () => {
  const supported = mapChannelBalance({
    account_balance_api_supported: true,
    account_balance_api_url: 'https://api.example.com/balance',
    account_balance_api_reason: null,
  });
  assert.equal(supported.balanceApi.supported, true);
  assert.equal(supported.balanceApi.url, 'https://api.example.com/balance');
  assert.equal(supported.balanceApi.reason, null);

  const unsupported = mapChannelBalance({
    account_balance_api_supported: false,
    account_balance_api_reason: '供应商未提供余额接口',
  });
  assert.equal(unsupported.balanceApi.supported, false);
  assert.equal(unsupported.balanceApi.reason, '供应商未提供余额接口');

  const unregistered = mapChannelBalance({});
  assert.equal(unregistered.balanceApi.supported, null);
  assert.equal(unregistered.balanceApi.url, null);
  assert.equal(unregistered.balanceApi.reason, null);
});

test('迁移 084 只放宽约束并把未观测的默认 0 归一为未知', () => {
  const migration = source('lib/db/migrations/084_provider_balance_observed_values.sql');
  assert.match(migration, /ALTER COLUMN balance DROP NOT NULL/);
  assert.match(migration, /ALTER COLUMN balance DROP DEFAULT/);
  assert.match(migration, /WHERE balance = 0\s+AND balance_checked_at IS NULL/);
  // 已观测过的真实余额不能被回填脚本改写。
  assert.doesNotMatch(migration, /SET balance = NULL\s*;/);
});

test('健康总览复用同一余额口径，不再把 NULL 折算成 0', () => {
  const breaker = source('lib/services/circuitBreaker.js');
  assert.match(breaker, /import \{ mapChannelBalance \} from '\.\/providerBalance\.js'/);
  assert.match(breaker, /p\.balance_checked_at, p\.available_quota, p\.quota_checked_at/);
  assert.match(breaker, /p\.account_balance_api_supported, p\.account_balance_api_url, p\.account_balance_api_reason/);
  assert.match(breaker, /\.\.\.mapChannelBalance\(row\)/);
  assert.doesNotMatch(breaker, /Number\(row\.balance \|\| 0\)/);
});

test('供应商仓储不再伪造 0 余额，并在观测时记录时间', () => {
  const catalog = source('lib/repositories/aiCatalog.js');
  assert.doesNotMatch(catalog, /Number\(providerData\.balance \|\| 0\)/);
  assert.match(catalog, /providerData\.balance === null \|\| providerData\.balance === undefined \|\| providerData\.balance === ''/);
  assert.match(catalog, /balance_checked_at = \$2/);
  assert.match(catalog, /updates\.balance === null \|\| updates\.balance === ''/);
});

test('后台供应商页展示余额未知、来源与观测时间', () => {
  const client = source('app/admin/models/providers/ProvidersManagerClient.jsx');
  assert.match(client, /上游余额:/);
  assert.match(client, /未知/);
  assert.match(client, /c\.balanceApi\?\.url/);
  assert.match(client, /观测于/);
  assert.match(client, /未观测/);
  assert.match(client, /function formatAdminTime\(/);
  // 展示层不能把空余额强行格式化为 0。
  assert.doesNotMatch(client, /Number\(c\.balance \|\| 0\)/);
});
