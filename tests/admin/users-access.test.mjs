import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { getExportDefinition, maskEmail, maskPhone, normalizeExportRows } from '../../lib/services/exports.js';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

test('导出模块支持 invites 邀请码与电话脱敏', () => {
  const invitesDef = getExportDefinition('invites');
  assert.ok(invitesDef, '必须包含 invites 导出定义');
  assert.ok(invitesDef.headers.includes('code'));
  assert.ok(invitesDef.headers.includes('preferred_model'));
  assert.ok(invitesDef.headers.includes('paying_rate'));

  const usersDef = getExportDefinition('users');
  assert.ok(usersDef.headers.includes('phone_masked'));

  assert.equal(maskPhone('13812345678'), '138****5678');
  assert.equal(maskPhone('123'), '123');
  assert.equal(maskPhone(''), '');

  assert.equal(maskEmail('alice@supdance.com'), 'al***@supdance.com');

  const normalized = normalizeExportRows('invites', [
    { code: 'BETA888', email: 'test@example.com', phone: '13900001111', preferred_model: 'nano-v2', paying_rate: 45.5 },
  ]);
  assert.equal(normalized[0].phone_masked, '139****1111');
  assert.equal(normalized[0].paying_rate, '45.5%');
  assert.equal(normalized[0].preferred_model, 'nano-v2');
});

test('用户与权限全套 API 路由文件与导出方法完备', async () => {
  const expectedRoutes = [
    { file: 'app/api/admin/users/[id]/credits/route.js', methods: ['POST'] },
    { file: 'app/api/admin/users/[id]/notes/route.js', methods: ['POST'] },
    { file: 'app/api/admin/users/[id]/sessions/route.js', methods: ['DELETE', 'POST'] },
    { file: 'app/api/admin/security/sessions/[hash]/route.js', methods: ['DELETE', 'POST'] },
    { file: 'app/api/admin/invites/route.js', methods: ['GET', 'POST'] },
    { file: 'app/api/admin/invites/switch/route.js', methods: ['GET', 'POST'] },
  ];

  for (const { file, methods } of expectedRoutes) {
    const fullPath = path.join(repoRoot, file);
    const content = await fs.readFile(fullPath, 'utf8');
    for (const m of methods) {
      assert.ok(
        content.includes(`export const ${m} =`) || content.includes(`export async function ${m}`),
        `${file} 必须导出 ${m} 方法`
      );
    }
  }
});

test('角色变更仅保留带密码二次校验的管理员端点', async () => {
  const legacyPath = path.join(repoRoot, 'app/api/admin/users/[id]/role/route.js');
  await assert.rejects(fs.access(legacyPath), '无二次校验的旧角色变更端点必须已删除');

  const tabs = await fs.readFile(path.join(repoRoot, 'app/admin/users/[id]/UserDetailTabs.js'), 'utf8');
  assert.ok(tabs.includes('/api/admin/admins/${user.id}/role'), '用户详情必须复用带二次校验的管理员角色端点');
  assert.ok(tabs.includes('adminPassword'), '角色变更表单必须收集操作者密码做二次校验');

  const adminsRole = await fs.readFile(path.join(repoRoot, 'app/api/admin/admins/[id]/role/route.js'), 'utf8');
  assert.ok(adminsRole.includes('verifyAdminPassword'), '管理员角色端点必须保留密码二次校验');
});

test('AdminActionForm 支持多字段类型与别名兼容', async () => {
  const formPath = path.join(repoRoot, 'components/admin/AdminActionForm.js');
  const content = await fs.readFile(formPath, 'utf8');

  assert.ok(content.includes('submitLabel'), '必须兼容 submitLabel');
  assert.ok(content.includes('confirmText'), '必须兼容 confirmText');
  assert.ok(content.includes('field.type === \'select\''), '必须支持 select 渲染');
  assert.ok(content.includes('field.type === \'textarea\''), '必须支持 textarea 渲染');
  assert.ok(content.includes('good:'), '必须支持 good 状态 tone');
  assert.ok(content.includes('attention:'), '必须支持 attention 状态 tone');
});

test('会话与用户检索 SQL 包含新增维度', async () => {
  const sessionsRepoPath = path.join(repoRoot, 'lib/repositories/sessions.js');
  const sessionsContent = await fs.readFile(sessionsRepoPath, 'utf8');
  assert.ok(sessionsContent.includes('u.phone ILIKE'), '会话查询必须支持 u.phone ILIKE');
  assert.ok(sessionsContent.includes('u.display_name ILIKE'), '会话查询必须支持 u.display_name ILIKE');

  const usersRepoPath = path.join(repoRoot, 'lib/repositories/users.js');
  const usersContent = await fs.readFile(usersRepoPath, 'utf8');
  assert.ok(usersContent.includes('user_number::text ILIKE'), '用户查询必须支持 user_number ILIKE');
});
