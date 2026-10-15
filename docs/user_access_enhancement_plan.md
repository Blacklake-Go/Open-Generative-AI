# 方案设计：运营后台「用户与权限」模块全链路深度治理与功能补齐

## 一、概述与治理目标
本方案针对 KoyoSIM 运营管理后台核心分组**「用户与权限」（Users & Access）**的所有主菜单与子菜单开展全方位治理，彻底消除虚假功能、死链和 404 API，大幅提升管理员操作便利度与系统响应效率。
严格遵循两项 UI 规范：
1. `docs/UI_DESIGN_SYSTEM.md`：设计系统、色盘、圆角嵌套、阴影 elevation、排版规范；
2. `docs/UI_REPAIR_INSTRUCTION.md`：胶囊几何、内外圆角比、指针事件安全、键盘可访问性。

---

## 二、子模块审计与治理详细清单

### 1. 核心通用层：`AdminActionForm` 组件全面增强
- **痛点**：属性不兼容（`submitLabel` vs `label`，`confirmText` vs `confirmMessage`），不支持 `<select>` 与 `<textarea>`，缺少 `good`/`attention` 色调样式。
- **治理**：
  - 双向兼容属性名：`label || submitLabel`、`confirmMessage || confirmText`。
  - 支持字段类型：`text`、`password`、`number`、`hidden`、`select`（支持 options 下拉菜单）、`textarea`（多行文本域）。
  - 完善 tone 样式：
    - `primary`: 赛博青高光背景 `bg-cyan-300 text-black hover:bg-cyan-200`
    - `good`: 翡翠绿态 `border border-emerald-500/30 bg-emerald-500/10 text-emerald-300 hover:bg-emerald-500/20`
    - `attention`: 琥珀橙态 `border border-amber-500/30 bg-amber-500/10 text-amber-300 hover:bg-amber-500/20`
    - `danger`: 珊瑚红态 `border border-red-500/30 bg-red-500/10 text-red-300 hover:bg-red-500/20`
    - `secondary`: 白透磨砂 `border border-white/15 bg-white/5 text-white/80 hover:bg-white/10`
  - 操作完成联动：支持通过 Next.js `router.refresh()` 局部刷新，配合视觉反馈，告别粗暴的页面全量刷新。

---

### 2. 用户管理与详情（`/admin/users` & `/admin/users/[id]`）
- **痛点**：用户详情中额度调整 404、添加备注 404、会话全量注销 404、修改角色 404。
- **治理**：
  1. **新建 API：`POST /api/admin/users/[id]/credits`**
     - 支持调整用户额度，幂等处理，自动写入流水与审计日志。
  2. **新建 API：`POST /api/admin/users/[id]/notes`**
     - 接入 `addUserAdminNote`，支持客服/运营记录跟进备忘。
  3. **新建 API：`DELETE /api/admin/users/[id]/sessions`**
     - 接入 `revokeUserSessions`，支持一键清退用户全部会话。
  4. **新建 API：`PATCH /api/admin/users/[id]/role`**
     - 接入 `setUserRole`，要求管理员二次密码验证（超管安全契约），完成后强制会话下线。
  5. **列表页优化**：
     - 搜索支持：邮箱、手机号、昵称、用户 ID，增加 `user_number` 匹配。
     - 状态与标签高亮联动，支持重置与状态筛选。

---

### 3. 管理员与角色（`/admin/admins`）
- **痛点**：手动输入 ID 极不便利；列表无任何直接操作按钮；无快捷停用/启用入口。
- **治理**：
  1. **管理员列表行内快捷操作**：
     - 每位管理员卡片新增快捷操作区：
       - **“快速调整角色”**：一键将该管理员 ID 与当前角色填入右侧表单并自动聚焦。
       - **“停用/启用状态”**：支持超管一键切换该管理员账号的启用状态（`active` <-> `suspended`）。
  2. **新建/变更管理员搜索辅助**：
     - 右侧操作区新增“从现有用户快速检索”建议下拉，输入关键词自动匹配用户，无需手动去别的页面复制 ID。
  3. **全流程二次密码校验与安全审计**：
     - 变更角色与停用操作全程保留二次密码输入与风险审计。

---

### 4. 会话与安全（`/admin/security/sessions`）
- **痛点**：只能全量下线用户，无法单会话精准下线；搜索不支持手机号与昵称；缺少终端/IP 信息。
- **治理**：
  1. **新建单会话撤销 API：`DELETE /api/admin/security/sessions/[hash]`**
     - 接入 `sessionRepo.revokeSessionByHash(tokenHash)`，精确移除指定会话。
  2. **列表操作双轨制**：
     - 提供“下线此设备”与“下线该用户所有设备”两个清晰的操作按钮。
  3. **搜索增强**：
     - SQL 检索支持 `u.phone ILIKE ...` 与 `u.display_name ILIKE ...`，适配移动端用户。
  4. **信息展示丰富**：
     - 表格展示展示用户的手机号/昵称、Token Hash 缩略、最后活跃时间。

---

### 5. 邀请码与使用习惯（`/admin/invites`）
- **增强**：
  - 增加 CSV 导出功能（一键导出所有邀请码及其兑换使用习惯与众数偏好模型），方便运营人员在 Excel 中汇报与分析。

---

## 三、数据库与性能优化
1. **查询优化**：
   - 检查 `sessions(token_hash)`、`sessions(user_id)`、`users(phone)` 索引覆盖，保证大数据量下毫秒级响应。
2. **事务与幂等**：
   - 调额、封禁、角色变更均封装在 `withTransaction` 保证原子性，全链路携带 `Idempotency-Key` 防重。

---

## 四、验证与部署计划
1. 本地全套测试集执行（路由契约、多语言测试、ESLint、安全检查）。
2. 构建 Next.js 生产版本。
3. 通过 `scripts/deploy.sh` 同步部署至生产服务器。
4. 线上 cURL 与管理端全量行为验证。
