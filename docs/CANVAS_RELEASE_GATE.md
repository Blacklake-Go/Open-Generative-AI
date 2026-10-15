# Canvas 生产发布门禁

状态（2026-10-09 10:42 UTC）：**10:37 UTC 生产五类备份/隔离恢复再次通过；线上后端 BUILD_ID `om1ROBUzYLkFrZtnIewSF`，Provider readiness 仍为 503；Canvas 候选仍在本地未推送/部署。** `/home/ubuntu/backups/koyosim-canvas-release.json` 匹配 HEAD `39c02816ae2a71530177e64fce5d14ac580efa45` 和源树 SHA-256 `dd50bf7ca263b0a660aef3d815e851bbbf4c25dcf9b47484d0cc8b0b4c2b0923`；10:40 UTC 复核 `/api/live=200`、Canvas `200`、`/api/ready=503`。

09:31 UTC 更新：用户确认近期 admin 源码修改、生产构建和服务重启为其发起或确认。新鲜源码、配置、数据库、对象、构建备份已在 `/home/ubuntu/backups/canvas-release-20261009T092144Z/` 生成并完成隔离恢复；当前清单通过校验，旧清单副本保留。用户没有独立 Linux x64 构建机；主站/后端仓库没有本地 Git remote，不能把脏生产树安全送入该 runner。画布客户端仓库有自己的 remote，但其 GitHub Pages workflow 目标不是 `canvas.koyosim.com`。后续同一 Vite 构建 SHA 与线上当前静态 JS/CSS 完全相同，说明当前前端产物已经在线。`/api/ready=503` 与 Provider 路由缺口仍阻断后端发布。

09:37 UTC 更新：用生产清单再次核验，HEAD、BUILD_ID、源码树摘要和五类备份仍匹配。未经 sudo 的普通 SSH 预检因读取生产 root-only 文件返回 EACCES；本地 `scripts/deploy-canvas-safe.sh` 已改用已验证可用的 `sudo -n` 执行只读预检，`bash -n` 通过。没有运行发布脚本。Vite 构建 JS `index-D0tjSC91.js` 和 CSS `index-B4mM0CrD.css` 的本地/线上 SHA-256 分别一致，因此未重复推送或部署前端。09:40 UTC 公网复核：`/api/live=200`、Canvas Session 匿名 `401` 且 ACAO 精确允许目标 Origin、OPTIONS `204`；`/api/ready=503`，数据库、迁移、Worker、Storage、Email healthy，Provider unhealthy。

09:49 UTC 更新：用新前端候选修复云素材和历史结果的账号切换竞态；本地类型检查与 Server Mode Vite 构建通过，隔离 owner-guard 测试 3/3 通过。生产 Canvas 仍返回旧 JS `index-D0tjSC91.js`，本地候选 `index-6koEQLOK.js` 未部署；本轮无生产写入。公网 `/api/live=200`、Session `401`、OPTIONS `204`、`/api/ready=503`；HEAD、BUILD_ID、路由 11/11 和五类备份恢复校验均重新核对通过。

## 必须的备份清单

清单固定放在 `/home/ubuntu/backups/koyosim-canvas-release.json`，至少包含：

```json
{
  "schema": "koyosim-production-backup/v1",
  "status": "verified",
  "capturedAt": "UTC timestamp",
  "production": {
    "head": "40-character Git HEAD",
    "buildId": "current Next.js BUILD_ID",
    "sourceTreeSha256": "64-character SHA-256"
  },
  "components": {
    "source": { "path": "...", "sha256": "...", "format": "tar_gzip", "restoreEvidence": { "path": "...", "sha256": "..." } },
    "config": { "path": "...", "sha256": "...", "format": "tar_gzip", "restoreEvidence": { "path": "...", "sha256": "..." } },
    "database": { "path": "...", "sha256": "...", "format": "pg_custom", "restoreEvidence": { "path": "...", "sha256": "..." } },
    "objects": { "path": "...", "sha256": "...", "format": "tar_gzip", "restoreEvidence": { "path": "...", "sha256": "..." } },
    "build": { "path": "...", "sha256": "...", "format": "tar_gzip", "restoreEvidence": { "path": "...", "sha256": "..." } }
  },
  "rollbackEvidence": { "path": "...", "sha256": "..." }
}
```

所有路径必须位于 `/home/ubuntu/backups`，文件哈希必须匹配且不能是符号链接。清单不能超过 24 小时；其中源码 HEAD、源码树摘要和 BUILD_ID 必须与当前线上状态一致。PostgreSQL dump 要能被 `pg_restore --list` 读取；四个 tar 备份都必须可列出，当前构建归档内的 BUILD_ID 必须匹配。

每个 `restoreEvidence` 文件须是独立隔离恢复记录，包含 `status: "passed"`、`target: "isolated"`、`component`、`backupSha256`、`verifiedAt` 和非零恢复计数。源码记录还要含匹配的 `restoredTreeSha256`，构建记录要含匹配的 `restoredBuildId`。`rollbackEvidence` 必须证明这五份备份的摘要及源码树、当前构建都能恢复。只有数据库 dump、只有对象清单或只写一个 `verified: true` 均不能通过。

## 必须的候选快照

单独的候选目录需有 `.koyosim-production-snapshot.json`，标明其生产基线 HEAD、BUILD_ID、源码树摘要，以及候选源码摘要和构建来源。候选构建必须是 Linux x64 构建、BUILD_ID 与产物一致，源码在构建后未变化，并且运行 manifest 含客户端依赖的全部 11 个 Canvas API 路由。主站当前脏工作树不能直接作为候选构建源。

## 切换与恢复行为

`remote-deploy-canvas-safe.sh` 在生产路径写入前重新核对备份和快照，先把候选源码及 `.next` 解压到独立 staging 目录，再检查依赖锁文件没有变化及路由完整性。它不会同步数据库迁移或 Provider 渠道，不会删除 `data/static_archive`、用户上传、旧备份或历史回滚构建。

切换前它会再做一次当前源码归档并演练解压摘要，停止 Web/Worker 后切换源码和构建。服务重启后需通过本机与公开 `/api/ready`、Session 401、Canvas Origin CORS 与 OPTIONS 验收；失败时会恢复源码归档和旧 `.next`，保留失败版本供调查。数据库、配置和对象在此发布流程中不变；若需要修改它们，必须另行制定并验证相应迁移/恢复步骤。

## 当前状态

2026-10-09 08:35 UTC 最新状态：公开 Canvas 页面 200、`/api/live` 正常、`/api/ready` 503（Provider unhealthy）。生产 HEAD `39c02816ae2a71530177e64fce5d14ac580efa45`、BUILD_ID `o3In_YauyDD0gb7JS-x4K`。服务器 `/home/ubuntu/backups/koyosim-canvas-release.json` 现已通过 `scripts/verify-production-backup.mjs`：源码、配置、数据库、对象、当前构建五类备份均哈希匹配并完成隔离恢复，rollback 证据通过。源码树在首次打包后发生变更，现使用重新归档且与恢复副本一致的摘要。独立 `.koyosim-production-snapshot.json` 和 Linux x64 候选构建来源证明仍缺失；Provider unhealthy 阻断真实图片交易，因此没有部署或开放收费 E2E。

08:47 UTC 更新：备份门禁再次校验通过，`/api/ready` 仍 503。独立候选从最新源备份和已审核模型健康时效过滤文件构建，但因服务器约 1.9 GiB RAM 下 Node heap OOM 退出 134；候选 `.next` 与 node_modules 副本已清理，没有 marker、构建产物或部署。需在有足够内存的隔离 Linux x64 构建环境重试。

09:07 UTC 更新：部署授权已收到，但重新核对时发现当前生产 BUILD_ID、源树在旧备份后发生变化；旧清单对新状态拒绝通过。生产服务于 09:01 UTC stop/start，admin 登录源码在 08:53–08:59 UTC 修改，来源未确认。候选构建分别在 850 MB Node heap 和 1.25 GB cgroup 限制下失败/受控停止，配置已还原、候选 `.next`/node_modules 已清理。页面仍 200、`/api/live` 200、`/api/ready` 503。远端脚本要求 READY 200，当前不会启动切换；需确认当前生产变更、制作与当前状态匹配的新五类备份并在独立高内存 Linux x64 builder 生成候选。

历史快照（2026-10-09 01:52 UTC）：Canvas 页面与 `/api/live` 为 200；`/api/ready` 为 503，`status=not_ready`、`providers=unhealthy`。带正确 Canvas Origin 和请求标记的匿名 Session/models/config/projects/jobs/assets 均为 401；生产运行 manifest 的 11 个 Canvas API OPTIONS 均为 204 且精确允许 Origin，错误 Origin 的 projects GET 为 403。生产 HEAD `39c02816ae2a71530177e64fce5d14ac580efa45`、`git status --short` 548 行、BUILD_ID `TNgLPal6DP6uKN4qqO9eH`、路由 11/11。模型目录 44 项、仅 1 个 `autoRouteEligible`；生产有效 `CANVAS_E2E_VERIFIED_MODEL_IDS` 无法读取，状态为 `Unknown`。当时发布备份清单与 `.koyosim-production-snapshot.json` 均缺失。

本地候选验证（01:52 UTC）：Canvas owner 隔离 helper 断言 9/9、`pnpm exec tsc --noEmit --incremental false`、Server Mode Vite build（`/tmp/koyosim-canvas-candidate-20261009-r6`）和 `git diff --check` 通过；构建仍有既存动态/静态导入及大包警告。Canvas Bun 测试因环境缺少 Bun 未运行；本地无 `TEST_DATABASE_URL`，隔离数据库测试未运行。该验证不替代双账户浏览器、真实交易或备份恢复验收。

2026-10-09 02:12 UTC 更新：线上 Canvas 与 `/api/live` 返回 200，`/api/ready` 503（Provider unhealthy）；匿名 Session/models/config/projects/jobs/assets 为 401，错误 Origin 项目 GET 为 403，11 个 Canvas 路由的 16 个 CORS 方法预检全部为 204。生产 HEAD `39c02816ae2a71530177e64fce5d14ac580efa45`、脏清单 558、BUILD_ID `YeQLGbUVePzz3ghHnfyRv`、路由 11/11。模型目录 44 个、一个 `autoRouteEligible`；发布备份清单和生产快照仍缺失。短时间内生产脏清单与 BUILD_ID 变化，禁止发布。

本地跨账号写请求 owner guard 已接入项目创建/保存/删除、上传、报价与 job；owner helper 测试 2/2、Canvas TypeScript、Server Mode Vite 候选构建通过。此实现尚未部署且未经登录双账户验收，不改变门禁状态。当前仍为**不放行发布/付费 E2E**；无恢复备份、Provider 仍 unhealthy、有效白名单未知、消费上限和隔离测试账户缺失。

02:15 UTC：Server Mode 图片文生图、图生图、节点和重试统一走 Koyo 图片适配器；插件宿主阻断旧 Provider。反推提示词、蒙版、超分等未验收动作新增回调层拦截。Canvas TypeScript 通过，Server Mode Vite build `/tmp/koyosim-canvas-candidate-owner-guard-server-20261009-r2` 成功，仍有既有导入与 chunk warning。代码仍为本地 Candidate，没有认证浏览器可做双账户验收。

## 2026-10-09 10:02 UTC 账户数据契约与认证候选

- 09:52 UTC `/api/ready` 仍为 503（`providers=unhealthy`）。Canvas 静态目录与主站后端 API 分属不同发布目标；本次没有向生产写入。当前已授权推送代码，但生产发布继续被 readiness 与候选闭环门禁阻止。
- 按生产主站源码核对订单、额度、活跃 API 契约，修正 Canvas 账户页：订单显示服务端 `amount/plan/status/createdAt`，额度流水使用 `delta/reason/action_type/created_at`，活跃卡片使用 `activeDays`。加载失败显示错误/重试，缺失余额显示未知值；不再用前端默认值把失败显示成免费、0 或今日次数。
- 本地主站候选 `/api/billing/usage` 不再吞掉钱包/账本读取错误并返回 200 假零值；改为读取异常返回 503，没有可核实的钱包分桶时返回 null。该路由目前为本地未跟踪候选，未部署。
- OAuth 回调来源改为只接受当前 Canvas origin 或精确 KoyoSIM 主站 origin；登录只有在刷新后确认相同服务端用户时才完成，注册条款默认未勾选。账户面板按 user ID remount，避免切换账号后保留上一个账户的数据。
- 生产匿名路径只读检查：Canvas 域 `/api/auth/me` 与 `/api/auth/social-options` 为 200 JSON；这不代表任何账户认证或 OAuth 登录验收。无认证账户、双账号切换、订单/余额实际值、生成/积分交易与跨设备验收。
- `ready=503`、没有独立 Linux x64 构建机、真实账户闭环未验收；继续保持 Candidate，不发布、不标记 Verified/READY。

## 2026-10-09 10:05 UTC 推送与线上复核

- Canvas 客户端候选提交为本地 commit `a640b3b`（90 个文件）；Bun 测试 24/24、类型检查、Server Mode Vite 构建、主站额度路由 `node --check` 均通过。Vite 仍有既存动态/静态导入与主包体积警告。
- 推送到 `origin/koyo-canvas-ui-i18n` 被 GitHub HTTP 403 拒绝，当前凭据对该远端没有写权限；远端分支未创建。提交保留在本地，未尝试替换或绕过凭据。
- 10:05 UTC 生产 `/api/ready=503`、`providers=unhealthy`；公开 Canvas 仍加载 `index-D0tjSC91.js` 与 `index-B4mM0CrD.css`。本地候选未部署，没有生产写入。需远端开通写权限后才能推送；生产发布仍需 Provider/readiness、构建来源和真实账户闭环验收。

## 2026-10-09 10:22 UTC 当前备份与放行结果

- 新五类备份：`/home/ubuntu/backups/canvas-release-20261009T102218Z/`；生产清单 `/home/ubuntu/backups/koyosim-canvas-release.json`。捕获时间 `2026-10-09T10:22:20Z`，生产 HEAD `39c02816ae2a71530177e64fce5d14ac580efa45`、BUILD_ID `Yd01yW5kLy6QwyGF9wv7q`、源码树 SHA-256 `7b7285fcf9e0db937e051f903ff86c753ecaf40afce269434d06b4d3f51e213c`。
- 隔离恢复：源码 7,305 个文件且树摘要一致；配置 149 项恢复/比对；数据库隔离恢复 27,223 行并删除临时库；对象 130 个；构建 BUILD_ID 一致。前后源树、构建及 dirty 计数稳定；当前 manifest 和带时间戳备份 manifest 校验均通过。
- Canvas 客户端 `a640b3b` 推送返回 HTTP 403，未更新远端。生产静态 Canvas 继续加载旧资产。后端 `/api/ready=503`、Provider unhealthy；不能声称交易已验收或开放真实生成。
- 不执行后端切换：Provider readiness 门禁失败、独立 Linux x64 后端候选快照/成品缺失、真实隔离账户商业闭环未通过。仅完成了当前线上可恢复备份子门禁；生产应用未写入。

10:24 UTC 即时复核：`/api/live=200`、Canvas 页面 200，`/api/ready=503`、Provider unhealthy；Canvas 页面仍引用旧 JS/CSS。新 canonical 备份清单再次通过校验。

## 2026-10-09 10:32–10:34 UTC 运行构建漂移与最新备份

- 10:22 备份之后，生产源码摘要和 BUILD_ID 再次变化；新值分别为 `dd50bf7ca263b0a660aef3d815e851bbbf4c25dcf9b47484d0cc8b0b4c2b0923` 与 `om1ROBUzYLkFrZtnIewSF`，HEAD 未变、dirty 计数 526。三个模型展示文件、Canvas quote route 与测试文件相对旧归档有变化；操作者未确定。当前 quote route 文件与本地候选一致，运行 `.next` 中也能找到 fail-closed 文案。
- 10:32:19 UTC 新五类备份位于 `/home/ubuntu/backups/canvas-release-20261009T103217Z/`；恢复证据为源码 7,305 文件、配置 149 项、隔离数据库 27,241 行、对象 130 个、build ID 匹配。`/home/ubuntu/backups/koyosim-canvas-release.json` 已更新并二次校验通过。
- 10:34 UTC `live=200`、Canvas `200`、`ready=503`（Provider unhealthy）；新 Next 服务进程启动时间晚于该 `.next` 构建时间，11 条 Canvas API 路由仍在构建清单。Canvas 静态客户端仍引用旧 JS/CSS。有效 `CANVAS_E2E_VERIFIED_MODEL_IDS` 缺失；44 个 active model 中只有 1 个 auto-route eligible。
- 生产新构建/源码漂移不等于 Canvas 图片交易验收。尚无隔离账户/明确消费上限、报价到 Provider 终态、资产读取、项目/历史回查及积分结算证据；本阶段不放行真实生成。恢复备份门通过，发布与商业闭环仍未通过。

## 2026-10-09 10:42 UTC 备份复核与云项目恢复竞态

- 用户确认可冻结并备份后，10:37 UTC 在服务器重新运行 `scripts/verify-production-backup.mjs`：成功；HEAD `39c02816ae2a71530177e64fce5d14ac580efa45`、BUILD_ID `om1ROBUzYLkFrZtnIewSF`、源树 SHA-256 `dd50bf7ca263b0a660aef3d815e851bbbf4c25dcf9b47484d0cc8b0b4c2b0923` 与 10:32:19 UTC 五类备份相符，五类数据及隔离恢复证据均有效。无需重复生成相同归档；没有生产应用写入。
- 10:40 UTC 公网 `/api/live=200`，`/api/ready=503`（Provider unhealthy），Canvas 页面 `200`。现有安全发布脚本要求冻结生产候选、匹配 Linux x64 的 Next 构建和内部/公网 readiness `200`；当前缺少该候选且 readiness 未通过，因此没有运行发布脚本，也不会把 Vite 静态包冒充为 Next 发布产物。
- Canvas 本地候选新增云项目恢复身份守卫：项目读取、云素材下载和本机 IndexedDB 写入期间核对原账户，账户变化时取消提交/导航。类型检查和 Koyo Server Mode Vite 构建通过；Vite SSR 隔离回归覆盖下载中切号、写入中切号以及账号不变正常恢复。Bun 不可用，Bun 测试套件未运行；双账户线上验收未完成。更改保留在本地工作树，未推送或部署。
- 10:43 UTC 直连复查用户给定 Canvas 页面仍为 `200`，继续引用旧 `index-D0tjSC91.js` / `index-B4mM0CrD.css`；本地新 Vite 包为 `index-DLnKfRhn.js` / `index-obs6VlO9.css`。`/api/ready` 仍为 `503`。

## 2026-10-09 10:55 UTC 线上复核

- 10:54 UTC 生产备份校验器返回 `ok=true`：当前 HEAD `39c02816ae2a71530177e64fce5d14ac580efa45`、BUILD_ID `om1ROBUzYLkFrZtnIewSF`、源树 SHA-256 `dd50bf7ca263b0a660aef3d815e851bbbf4c25dcf9b47484d0cc8b0b4c2b0923` 与 10:32:19 UTC 五类备份一致。
- 10:54 UTC 公网 `/api/ready=503`，providers unhealthy；Canvas `200` 仍引用旧 JS/CSS。本轮没有生产写入。账号切换后的图片结果守卫在 Canvas 客户端仍属 Candidate，尚未推送或部署。
- 继续阻断发布：readiness 未达 200；无独立 Linux x64 Next 候选；GitHub 推送曾被 403 拒绝；真实登录、双账户、Provider 终态、历史/下载及积分扣退 E2E 未通过。


## 2026-10-09 11:06 UTC Canvas 独立静态前端发布

- 静态目标核实为 `/home/wwwroot/AI/domain/canvas.koyosim.com/web`。发布前完整归档 76 个文件并隔离恢复比对通过：`/home/ubuntu/backups/canvas-static-release-20261009T110035Z/web.tar.gz`；发布证据在同目录 `static-deploy-evidence.json`。旧站点 index SHA-256 为 `f9653dba...`，候选 index SHA-256 为 `c2f24d96...`。
- 仅新增 `assets/index-DGXNEaem.js`、`assets/index-obs6VlO9.css` 和异步 chunk，并原子替换 `index.html`；运行时 `config.js` 保持原 SHA-256，旧资产保留可回滚。公网 HTML/JS/CSS/chunk 均为 200，下载后 SHA-256 与候选逐字节相同。
- 前端候选对应本地提交 `3a8a1aa6c70318f120a5b78b5d96198c8d440375`。GitHub push 仍为 HTTP 403；此次是用户已授权的直连静态发布，不涉及主站 Next 源码、数据库、Provider 或服务重启。
- 后端 `/api/ready=503`（Provider unhealthy），真实认证生成、扣退积分、资产/历史下载及双账户验证未通过；因此本次只完成前端静态发布，不代表后端发布或融合验收完成。

## 2026-10-11 12:15 UTC 新鲜备份与候选重验

- 12:15 UTC 线上复核：Canvas 页面 `200`，仍引用 `index-NWKTYABj.js` / `index-BeuqV5CY.css`；`/api/ready=503`（DB、migration、Worker、Storage、Email healthy，Provider unhealthy）。生产 HEAD `39c02816ae2a71530177e64fce5d14ac580efa45`、BUILD_ID `RPf47wofgu89YhaGdRdwV`、Canvas API 路由 11/11，生产树未提交状态计数 530。
- 新五类备份在 `/home/ubuntu/backups/canvas-release-20261011T120738Z/`，生产清单已原子更新到 `/home/ubuntu/backups/koyosim-canvas-release.json`。隔离恢复实测：源码摘要 `869068d663e7d4125abea2b4a2d95fcb058e145cc62c9c0b044ea578665fc163` 一致；配置恢复 85 项；PostgreSQL dump 恢复到临时隔离库并逐表读回 32,713 行后删除；对象恢复 130 个；当前构建 BUILD_ID 一致。服务器现有校验器和更新后的本地校验器均通过。
- 校准发布校验器与线上实际源码哈希规则：线上校验器把 `.next-backup-*` / `.next-pre-*` 根目录计入源码摘要，本地旧校验器曾忽略它们。当前回滚归档会包含这些目录以证明完整快照；生产 rsync 仍将它们排除以保护现存回滚构建。新增测试并通过，避免下次快照校验或回滚归档误拒绝。
- 服务器后端候选 `/home/wwwroot/AI/.koyosim-canvas-e2e-candidate-20261011-r2` 重新锚定到当前 HEAD/BUILD_ID/源码摘要，生产快照验证通过：候选树 SHA-256 `f629bba5fffe1ff3e13d41c519c82eba4c9985af53b822ccdfa3362310520a8e`，Linux x64 BUILD_ID `QixMCSw8HApMSsexkiKam`，Canvas API 路由 11/11，依赖清单与当前生产匹配。候选含服务端 UID 定向测试模型资格与报价失败关闭改动；候选仍未部署。
- Canvas 客户端服务器候选 `/home/ubuntu/backups/canvas-client-candidate-20261011-r1/source/dist` 由冻结的 `pnpm-lock.yaml` 在网站服务器构建成功，JS/CSS 哈希与本地构建一致；本地 typecheck/Vite 构建通过。生产客户端仍引用旧 JS/CSS，没有部署。
- 验证：`node --conditions=react-server --test tests/p3/production-backup-manifest.test.mjs tests/p3/deploy-entrypoint.test.mjs` 8/8；`bash -n` 两个安全发布脚本通过；主站 Canvas 测试 35/35、客户端 typecheck 与 Server Mode Vite 构建通过。客户端 Bun 测试未运行（服务器/本机均无 Bun）。
- 放行：新鲜五类备份和隔离恢复门通过，后端候选快照及 11 路由门通过；不放行生产切换或真实收费验收，因为 `/api/ready=503` 且隔离账户的 Canvas 模型 API 尚为空。账户余额未变，本轮 quote/job/积分消费均为 0；图片仍为 Candidate、未部署、未验收。

## 2026-10-11 12:22 UTC 加速核查

- 阶段 1 重新核对：公开 `https://canvas.koyosim.com/canvas` 为 200，仍加载旧 `index-NWKTYABj.js` / `index-BeuqV5CY.css`；公开 `/api/ready` 为 503（`not_ready`，数据库/迁移/Worker/Storage/Email healthy、Providers unhealthy）。生产 HEAD `39c02816ae2a71530177e64fce5d14ac580efa45`、BUILD_ID `RPf47wofgu89YhaGdRdwV`、Canvas API 路由 11/11、dirty entries 530。`/api/models/active` 返回 44 项，当前仅 `seedream-5.0` 为 `autoRouteEligible`。生产代码仍未部署候选。
- 阶段 2 再验证：用脚本规定的 manifest / productionRoot 参数调用五组件恢复备份门，返回 `ok=true`；源 HEAD、BUILD_ID、树摘要精确匹配，rollbackVerifiedAt `2026-10-11T12:10:01Z`。候选 Next 快照重新通过验证，Linux x64 BUILD_ID `QixMCSw8HApMSsexkiKam`、候选树摘要 `f629bba5fffe1ff3e13d41c519c82eba4c9985af53b822ccdfa3362310520a8e`、Canvas API 路由 11/11。先前一次调用因把 manifest 路径误当作 CLI 唯一参数而报错；改用导出函数并显式传 productionRoot 后恢复通过，不是生产状态变化。客户端候选仍未部署。
- 阶段 3 只读 Provider 核查：公开核心模型路由表 168 行汇总为 `ok=22`、`NOT_APPROVED=92`、`NO_ENDPOINT=29`、`NO_MAPPING=16`、`NO_CREDENTIAL=3`、`PRICE_MISSING=3`、`PROVIDER_DISABLED=2`、`MAPPING_DISABLED=1`。这解释了全站 readiness 的系统级 unhealthy；不能把它直接当成 Seedream 可用性结论。`seedream-5.0` 的 Volcengine 路由为 enabled、approved、provider enabled、endpoint configured、health healthy、circuit closed、active `account_actual` CNY 报价；source observed 为 2026-10-09 19:22:51+08:00。该配置/健康/报价证据仍不等于真实 Provider 终态交易，未做 quote/job。
- 失败/限制：从浏览器直接打开 `/api/canvas/models` 得到 `CANVAS_ORIGIN_INVALID`（缺少 Canvas 客户端请求来源），因此不能用直达 API 页确认 UID 808405 的线上 Canvas 会话模型列表；需要经真实 Canvas UI 发起合法来源请求后再验证。没有生成、失败/取消、重试、资产、历史或积分账本交易证据；本轮消费仍为 0。
- 放行：阶段 1 快照完成；阶段 2 备份和后端候选门通过，但因 readiness 不健康，生产发布不放行。阶段 3 部分通过：Seedream 5.0 有健康且带报价的映射，继续代码/API UI 只读验证；真实图像验收仍须先确认 Canvas 用户身份和合法 quote。图片项保持 Candidate、未部署、未验收。
- 回滚：本轮没有生产应用、配置、数据库或对象写入。可恢复生产快照为 `/home/ubuntu/backups/canvas-release-20261011T120738Z/`；静态 Canvas 当前引用的旧 JS/CSS 均仍保留。文档和本地门禁调整可由工作区 Git 快照恢复，不能重置整个脏工作树。

## 2026-10-11 12:27 UTC Canvas 会话与客户端核验

- 新鲜浏览器状态：`https://canvas.koyosim.com/canvas` 页面显示“登录”，本地 Agent 显示“未连接”；Canvas 页面未呈现 KoyoSIM UID。直接打开模型 API 的 `CANVAS_ORIGIN_INVALID` 是预期来源保护；再用正确 `Origin: https://canvas.koyosim.com`、Referer 和 `x-koyosim-canvas: infinite-canvas-v1` 请求线上 `/api/canvas/session` 与 `/api/canvas/models`，两者均返回 401 `UNAUTHENTICATED`。故 UID 808405 当前没有可供这次验收使用的 Canvas 登录会话。
- 代码核验：客户端 `web/src/services/api/koyosim-image.ts` 与 `web/src/services/api/koyosim.ts` 的现有实现显示图片入口先读会话/确认当前模型，服务端 quote 并等待用户确认，再以 Idempotency-Key 创建 job、轮询规范任务终态、读取归档 Asset 内容；项目和节点 ID 缺失会在报价前失败关闭。文本生成与引用图片走同一图片请求入口；本地 Agent 不属于这条服务端生成链的前置条件。这里是代码路径证据，不是线上交易验收。
- 验证：`web` 客户端 `corepack pnpm run typecheck` 通过；未运行有费用的 quote/job，也未创建/写入项目、素材、历史或积分账本。总消费仍 0/300。
- 放行：代码级图片链路保持 Candidate；不放行线上图像闭环验收，直到在 Canvas 域完成登录并由 session API 返回 UID 808405 与余额。此后按单次不超过 30、累计不超过 300 继续真实验收。生产仍未部署。
- 回滚：本轮无生产写入；本地只追加本报告，可从文档历史恢复；五类生产恢复包仍为 `/home/ubuntu/backups/canvas-release-20261011T120738Z/`。
- 补充隔离验证：主站 `node --conditions=react-server --test tests/p3/canvas-*.test.mjs` 35/35 通过，覆盖项目/素材归属、引用素材解析和 Canvas API 相关路径；该测试集不覆盖线上 provider 终态、实际扣退账、浏览器刷新/跨设备或下载闭环。
- 为缩短后续切换等待，另为 Canvas 静态站点当前版本制作新鲜回滚快照 `/home/ubuntu/backups/canvas-static-rollback-20261011T122616Z/web.tar.gz`，大小 6,665,502 bytes、SHA-256 `4d6dba0104cb1b3323f3b1e189844be6b019db6f64be1aacdff77e4117764a3f`；独立解包后与线上目录 `diff -qr` 零差异，恢复核对通过（35 个文件）。这只是备份写入，静态站点仍保持旧 index 与旧 JS/CSS，没有切换。


## 2026-10-11 16:43 UTC 加速核查与发布门

### 阶段 1：线上快照复核通过

- 公网 `https://canvas.koyosim.com/canvas` 返回 200；当前引用 `assets/index-F4qfnf1E.js` / `assets/index-B9L8IT6E.css`。线上 JS SHA-256 `f16111e2cd0a5fce8975c06bc83c5bae352645958ed15869e653e060b44f4aad`、CSS SHA-256 `87a26ea856bfd07ff6c2840098fd8c1bf5e7c4943f6fe1113f2b4c07f86b2b4a`，与 Canvas 客户端 `web/dist` 文件逐字节一致。客户端 `corepack pnpm run typecheck` 通过。
- 公网 `/api/live=200`，`/api/ready=503`、`providers=unhealthy`（2026-10-11T16:42:40Z）。数据库、迁移、Worker、Storage、Email 为 healthy。匿名且带正确 Origin/Referer/Canvas 标头的 `/api/canvas/session`、`/api/canvas/models`、`/api/canvas/projects` 均为 401 `UNAUTHENTICATED`；这是无 Cookie 的匿名探针，不代表当前浏览器登录态。
- 权威源树 `/home/wwwroot/AI/domain/koyosim.com/web`：HEAD `39c02816ae2a71530177e64fce5d14ac580efa45`，dirty entries 531，当前 BUILD_ID `SjKkFGynAvWlLqm8Ofinn`，运行路由清单 11/11（Canvas assets/content、assets、upload、config、jobs、job、models、project、projects、quotes、session）。生产源码与运行构建事实均已重读。
- `/api/models/active` 返回 44 个目录项，其中 Seedream 5.0（15 credits）与 Seedream 4.5（12 credits）标记 `autoRouteEligible`。它们仍只有目录/映射/报价元数据证据，不构成真实 Provider 终态或实际成本证据。Canvas 当前文案仍为“暂无通过真实任务验收的云端模型，生成暂未开放”。
- 代码路径核验：Canvas Server Mode 图片统一经过 `requestCanvasImage` → `generateKoyoCanvasImage` → 服务端 quote/确认/幂等 job/poll/Asset；图片重试复用相同入口。浏览器直连 Provider 代码仅留在非 Server Mode 分支；Server Mode 能力门只开放图片，未验收扩展动作保持禁用。以上是源码和已部署 bundle 证据，不是交易验收。
- 账户 UID 808405 的单笔上限 30、总上限 300 已获用户确认；本轮没有报价或创建任务，消费仍为 0/300。没有刷新、跨设备、结果下载或账本交易的本轮实证。

### 阶段 2：五类恢复备份通过，独立构建未通过

- 当前完整恢复点：`/home/ubuntu/backups/canvas-release-20261011T161035Z/manifest.json`，备份目录 `/home/ubuntu/backups/canvas-release-20261011T161035Z/`，捕获时间 `2026-10-11T16:12:32Z`。当前服务器校验器复验 `ok=true`：HEAD/BUILD_ID/源码树 SHA-256 与现网一致；源码 `a99bd8cd4757c3d6f1359db9411600490ad587defb2e8f13545a24b1c78fd8ce`；配置隔离恢复 85 项；数据库隔离恢复 33,331 行；对象隔离恢复 133 个；当前构建 ID 一致。五组件归档哈希和 `rollbackVerifiedAt` 均通过。
- 备份脚本以普通用户运行时因 root 数据库 dump 权限失败；root 重跑后在 postgres 无法穿过 root-only 目录处失败；配套 finish 脚本把 dump 复制到受控临时路径后，数据库恢复、行数读取、回滚证据和最终清单验证均通过。失败的旧目录 `/home/ubuntu/backups/canvas-release-20261011T160920Z/` 不完整，禁止当作恢复点；本轮没有修改生产数据库。
- 从冻结源码快照建立独立候选 `/home/wwwroot/AI/.koyosim-canvas-candidate-20261011T161232Z/`，初始源码树与备份 SHA 一致。Studio 包构建通过。Next.js 构建第一次因默认约 1 GB Node 堆 OOM；提高堆后发现冻结源码缺少 `components/UserDropdownMenu.js` 所导入的 `lib/profileEvents.js`。候选目录用本地未跟踪同名 helper 补齐（SHA-256 `6d1577299075d99bb4793257998dcdfad0494702ebd8337b65251881ac9bd99b`），未写生产源码。
- 带默认 webpack cache 的候选构建曾产生约 878 MB `.next` 缓存；为避免服务器磁盘继续逼近满盘，停止该候选并清除其 `.next`。随后只在候选配置中禁用 webpack 文件缓存再试，运行约 7 分钟仍在低内存/swap 下优化编译，没有生成可验证的 BUILD_ID/route manifest；按资源边界停止并清除了该候选 `.next`，保留源快照、补丁和构建日志。磁盘恢复到约 1.5 GB 可用。生产 `/api/live` 在构建压力期间和清理后均为 200。
- 回滚方式：本轮没有写入生产应用目录、配置、数据库、对象、当前 `.next` 或服务；若后续生产变更失败，恢复点仍是上述五组件清单。候选目录及日志为隔离产物，不可发布；源树缺失的 helper 补丁和候选构建配置调整均有独立 patch 文件记录。

### 阶段结论与放行状态

- 阶段 1 快照通过；阶段 2 的五类备份/隔离恢复通过，但独立 Next 构建未完成，因此不放行生产发布。当前没有部署本轮候选。
- 图片客户端代码已部署，图片生成实际状态仍是 `Disabled / 未验收`；真实任务数 0，quoteId/jobId/Provider task ID/assetId/project-node/ledger ID 均无本轮记录。余额扣减、失败释放、历史/下载和跨设备恢复都未验证。
- 阶段 3 只部分核对目录/源码，尚无身份会话下的在线 quote、Provider 终态、真实成本与账本证据；阶段 5 云端项目/冲突/素材归属和阶段 6 图片交易均未验收；视频、音频、文本及扩展动作保持 `Unknown/Disabled`。不把页面 200、路由存在、active 模型或构建源码当作 Verified。
- 浏览器操作：用户已接管当前 Canvas 标签页，本轮没有进入或修改用户当前项目。此前 QA 云项目清理在用户中断后未能确认最终状态，线上快照可能残留一个空视频节点（project version 10）；没有真实生成或扣费。后续应先只读确认该项目状态，再决定是否清理。

## 2026-10-11 16:59 UTC 候选构建停止与线上状态漂移

- 最新公开核验：`/api/live` 为 200（checkedAt `2026-10-11T16:58:36Z`），`/api/ready` 为 503 `not_ready`（checkedAt `2026-10-11T16:57:25Z`，Providers unhealthy，其余核心依赖 healthy）。Canvas 静态 JS 仍为 `index-F4qfnf1E.js`；线上与本地 `web/dist` SHA-256 均为 `f16111e2cd0a5fce8975c06bc83c5bae352645958ed15869e653e060b44f4aad`。
- 再读生产源树后，HEAD 仍为 `39c02816ae2a71530177e64fce5d14ac580efa45`，dirty entries 532，当前 BUILD_ID `V-iDzQaowpReodJOdLerZ`，生产 Canvas API 路由 11/11。此构建 ID 与五组件备份 manifest 的 `SjKkFGynAvWlLqm8Ofinn` 不同；备份捕获时间为 `2026-10-11T16:12:32Z`。生产 `next-server` 已于服务器本地 `00:45:35 +08:00` 启动。这个线上状态变化来源未知；候选 `.next` manifest 与生产 manifest 的 inode 不同，本次候选构建未覆盖线上 `.next`。因此旧备份保留作历史恢复点，但不再视作下一次生产写入前的当前恢复点。
- 独立候选 `/home/wwwroot/AI/.koyosim-canvas-candidate-20261011T161232Z/source` 的 Node 22 Next build 在运行 9 分钟后仍处于 I/O 等待：读取约 9.88 GB、磁盘剩余约 1.5 GB、未生成 BUILD_ID；候选 app 路由 manifest 已列出 11/11 Canvas API 路由。因没有完成构建且没有可验证的最终构建 ID，停止候选 systemd unit。候选目录与日志保留，不发布、不删除。该候选构建失败门；路由 manifest 单独不算构建通过。
- 浏览器只读快照显示当前 Canvas 标签停在资产编辑界面；没有点击、输入、保存、导航或下载，不能据此确认 UID 808405 的 Canvas session。仍无线上 quote/job、Provider 终态、Asset、历史、下载、ledger 证据，真实任务 0，消费 0/300。
- 阶段结论：阶段 1 最新状态重核完成；阶段 2 早前五组件隔离恢复验证曾通过，但相对当前生产 build/source 脏态已不新鲜，且独立构建未完成，不放行发布。当前没有本轮生产写入或部署。任何后续生产写入前需针对当前生产 HEAD、dirty tree、BUILD_ID 重新制作并验证五组件恢复包；线上模型/Provider unhealthy 与真实图片交易门仍未通过。

## 2026-10-11 17:07 UTC 当前恢复点复验与图片验收登录门

- 重新为当前线上态制作五组件恢复点：`/home/ubuntu/backups/canvas-release-20261011T170210Z/manifest.json`，捕获时间 `2026-10-11T17:06:31Z`。源码 HEAD `39c02816ae2a71530177e64fce5d14ac580efa45`、BUILD_ID `V-iDzQaowpReodJOdLerZ`、dirty entries 532、源码树 SHA-256 `4118a447d44c700b2584300d86e04a5dc163a33c72c3439aa639a1a79f1ed1a3`。隔离恢复验证源码、配置 85 项、数据库 33,434 行、对象 133 个和当前构建均通过；归档哈希与 `rollbackVerifiedAt` 通过。创建脚本的 postgres 读取权限错误由配套 finish 脚本将 dump 暂存至受控 `/tmp` 后修复，最终恢复验证及生产态一致性门均返回 `ok=true`。
- 验证后移除了仅供这次比对的展开恢复副本；五类归档、五份 restore JSON 证据、manifest、rollback 证据均保留。生产根分区可用空间由约 431 MB 回到约 1.3 GB。该清理不删除备份归档，也不改生产应用、配置、数据库或对象。
- 为图片验收另开 Canvas 标签后，页面明确显示“登录”；因此当前浏览器未提供可验证的 Canvas 登录 session/UID。标签已保留给用户登录接手。原资产编辑标签未操作、未保存；没有 quote/job、生成、扣费或素材写入，消费仍 0/300。
- 最新门：阶段 2 当前五组件恢复点通过；独立 Next build 仍因低内存/磁盘 I/O 未完成，候选不发布。`/api/live` 最近一次 200；`/api/ready` 最近一次仍 503 `not_ready`、Providers unhealthy。生产图片代码与静态客户端存在，不等于真实图像闭环。阶段 3 Provider、阶段 5 项目/历史跨设备、阶段 6真实图片交易尚未通过；其余模态保持 Unknown/Disabled。
- 追加即时探针（`2026-10-11T17:10:38Z`）：Mac 端直连外网时 TLS 握手失败，改由生产服务器直连成功读取 `/api/ready`，仍为 HTTP 503 `not_ready`、Providers unhealthy，数据库/迁移/Worker/Storage/Email healthy。该项当前状态以服务器直接响应为准。

## 2026-10-11 17:14 UTC 客户端更新与 Canvas 登录态复核

- 新鲜生产核验再次通过恢复门：当前 HEAD `39c02816ae2a71530177e64fce5d14ac580efa45`、BUILD_ID `V-iDzQaowpReodJOdLerZ`、dirty entries 532、Canvas API 路由 11/11；备份 manifest 当前源摘要匹配。`/api/live` 于 `17:12:15Z` 为 200；`/api/ready` 于 `17:12:16Z` 为 503 `not_ready`、Providers unhealthy，其他核心依赖 healthy。候选 Node 22 服务为 inactive，候选构建未通过。
- 客户端仓库当前 HEAD `78147ca706c6925b8a6b915fae1375e12740b730`、工作树干净；提交标题为 auth modal z-index 修复。`corepack pnpm run typecheck` 通过。线上 Canvas HTML 引用的 JS/CSS 路径与本地 `web/dist/assets` 相同，两个文件的线上/本地 SHA-256 分别是 `af1a7c1532be0ef1ace6d90fff6187c1575c53a6743985233f268d44f98b9a2e` 与 `9938c3e1a51764efd0569a2f220584770a433c93ddfa7c63d5dab11dbc01aa3f`。本次没有发布客户端。尝试运行四个针对性 Bun 测试时，环境没有 `bun` 命令，故测试未运行。
- 浏览器页面由先前“登录”状态转为显示已登录账户、余额控件和云端项目列表；精确 UID 仍未从服务端 session 获得。CDP 跨域 session GET 返回 `Failed to fetch`，同源 GET 返回 `403 CANVAS_ORIGIN_INVALID`，这两个响应受来源保护影响，不能判作账户未登录。验收标签随后显示“配置与用户偏好”弹窗；未关闭、保存或读取凭据。未打开已有云项目，未创建测试项目，也没有 quote/job/Provider 任务、Asset 或积分账本写入。浏览器当前页保留给用户。
- 当前仍未有真实图片终态、归档 Asset、项目/历史可见性及积分预留/提交/释放/对账的完整证据。先前显示的 `Canvas Cloud Sync QA 2026-10-11`（1 节点、版本 10）仍未被本轮访问或修改；它不能当作生成成功证据。
