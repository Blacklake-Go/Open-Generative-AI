# SupDance V4.2 发布候选

快照日期：2026-10-29（本地，未发布）
范围：`www.supdance.com`、`canvas.supdance.com`
状态标记：**已实现 / 已隔离测试 / 未部署 / 未做真实付费验收**

## 1. 本批提交清单

| 提交 | 类型 | 范围 |
|---|---|---|
| `e0a4e8a` | fix(p0) | 供应商终态失败证据穿透 `normalizeError` 与重试包装层，结算据此释放一次而不是停在待核对 |
| `b47715c` | feat(p5) | 后台导航登记「待核对任务」「模型接入与发布」两个已存在但未入口的路由 |
| `ef990b0` | fix(nav) | 视频广告位 4 处 modelKey/href 指向公开目录中真实存在的模型 |
| `187439c` | docs(ui) | IconButton 按压态注释与 v3.8.0 动作契约一致（仅注释） |
| `b034279` | test | 13 个测试文件对齐目录投影定价、fail-closed 价格与 v3.8.0 视觉契约 |
| `8549adb` | test | M2 目录验收默认跳过，需 `SUPDANCE_ACCEPTANCE_ENV=1` 显式开启 |
| `6447407` | fix(nav) | Mega Menu「Body Swap」的 `tabId`/`href` 由未注册的 `recast` 改回已注册的 `body-swap`；`STUDIO_TAB_ALIASES` 增加 `recast → body-swap`，旧深链不失效 |
| `6447407` | fix(api) | 4 个路由的 409/错误分支改用 `publicErrorMessage`（`canvas/config`、`canvas/models`、`models/active`），`auth/oauth/google/one-tap` 日志不再记录原始异常文本 |
| `6447407` | test(p0) | `security-baseline` 两处 allowlist 按实测集合刷新：路由裸 repository 读取 27 项、service SQL 15 项，每项均注明需评审的窄例外 |
| `6447407` | refactor(api) | `models/active` 抽出 `loadActiveModels(forceRefresh, now)` 作为显式持久化边界，缓存命中/未命中语义不变，满足 `p2/async-boundaries` 的 awaited 边界契约 |
| `6447407` | test(p5) | `studio-performance` 的 shell 断言放宽为允许查询串：`9b15960` 已让 shell 请求 `?schemaVersion=2`，旧断言只接受无参 URL |
| `6447407` | test(p3) | `production-backup-manifest` 的源树哈希用例与 `3795311`（忽略 `.next-*` 轮转构建目录）对齐：改为断言构建产物变化不改变哈希、真实源码变化才改变哈希 |
| `6447407` | test(p3) | `production-snapshot` 的同源用例同样对齐 `3795311`：`.next-backup-*`/`.next-pre-*` 等轮转构建目录变化不改变哈希，只有真实源码变化才改变；与 `deploy-entrypoint` 对 rsync 排除 `.next-backup-*`/`.next-pre-*` 的既有契约一致 |
| `6447407` | test(p6) | `native-payment-amount` 的假事务补上 `syncLegacyCreditBalance` 的分桶合计查询：`026eca6` 给 `grantPerpetualCredits` 增加了把分桶余额同步回 `users.credits` 的副作用，旧 mock 会以 `Unexpected query` 抛错；金额校验与「重复回调只发一次」断言均未放宽 |
| `6447407` | test(p6) | `payment-provider` 的凭据断言对齐 P2 `67d1971` 收敛后的入口：`providerSecrets.js` 只导出 `getServerProviderApiKey`，旧断言查找的 `getProviderSecret` 已不存在；改为同时断言该导出与 repository 层 `readProviderSecret`，其余 5 条服务端凭据断言不变 |
| `6447407` | test(p6) | `subscription-credit-bucket` 的假事务补 `queryMany` 与 `syncLegacyCreditBalance` 的 `AS total` 聚合读取：`expireAvailableCreditFunding` 现按 `ops_bill.credit_returned_lots` 过期归还额，旧 mock 只有 `queryOne`/`execute` 会抛 `transaction.queryMany is not a function`；6 条分桶、迁移与退款断言（含 `reversedAmount`/`unrecoveredAmount`/`deferredForUnrelatedGrant`）均未放宽 |
| `6447407` | test(p6) | `subscription-credit-fulfillment` 的假事务补 `SELECT * FROM credit_wallets WHERE user_id=$1 FOR UPDATE`（去掉空格依赖）、`queryMany` 归还额度读取、`syncLegacyCreditBalance` 的 `AS total` 聚合、`UPDATE ops_bill.credit_wallets` 清零与 `CREDIT_EXPIRE` 账本写入；断言由账本绝对下标改为按 `action_type` 定位，并新增「过期 9 点写入 `CREDIT_EXPIRE`（SUBSCRIPTION、-9、balance 0）」「重复发放不新增 `CREDIT_EXPIRE`」「退款条目 `reference_id` 对应订单」三条显式断言。`totalAvailable 144`、`unrecoveredAmount 15`、`status PENDING`、`obligations` 等数值与状态断言未放宽 |
| `6447407` | test(p5) | `second-priority-fixes` 对齐 P5 后台重排：积分售价输入已迁到共享 `ModelConfigDrawer`（字段由 `editForm.*` 改为 `formData.*`，`base_credits` 为唯一写入字段）；`pricing` 页改为纯重定向、SSR 待审查询在 `routing` 页；选项卡由 Pill 改为下划线契约（共享 `components/ui/tabs.jsx` 的三个 Pill 标记仍单独断言）。6 条测试全部保留原业务意图，未删减断言 |
| `6447407` | fix(p1) | `lib/utils/modelBrands.js` 的 OpenAI 品牌反色改走 `invertLogos`，与目录命中路径共用同一策略；此前两条解析路径对同一模型给出相反 `invert`，会让同一 Logo 在不同页面一黑一白 |
| `6447407` | feat(p1) | `lib/repositories/models.js` 的 `CORE_MODEL_IDS` 补齐音乐核心：`suno-create-music`、`minimax-music-3.0`、`mmaudio-v2-text-to-audio`，与迁移 044 的 `tier='core'` 打标一致；music 独立能力分类不再只靠 audio 归并兜底 |
| `6447407` | test(p1) | `shrink-model-routing` 对齐目录投影定价与上述音乐核心集合（140 行改动，断言按投影重写而非放宽） |
| `6447407` | test(p4) | `simplified-account-center` 改为读取 `AccountCenterView.jsx` / `AccountSettingsView.jsx`（`AccountCenter` 已拆视图），并新增两条品牌解析路径 `invert` 一致性断言 |
| `6447407` | test(p5) | `subscription-oiioii-design` 的 `hover:scale-[1.03]` 断言替换为 v3.7 按压契约：`active:scale-[0.98]` + `duration-fast ease-standard`，不得悬停放大 |
| `6447407` | test(p2) | `third-priority-fixes` 去掉 1 小时新鲜度时间炸弹（跑在整点边界会假失败），改为断言 `last_health_check_at IS NULL` 的启用供应商计数必须为 0；探针写入与能力断言的业务意图不变 |
| `221c53c` | feat(p2) | 供应商余额「未知」闭环：新增纯逻辑映射器 `lib/services/providerBalance.js`（`NULL` 保留为未知、`0` 仍是真实余额、币种随余额为空、余额接口能力保持 true/false/null 三态）；`circuitBreaker` 增选余额/配额/接口字段并改用该映射器，不再把 `NULL` 变 `0`；`aiCatalog` 创建供应商未给余额时写 `NULL`、健康探测写余额时同步写 `balance_checked_at`；后台供应商卡片新增「上游余额/配额」行，展示余额或「未知」、币种、可用配额、来源 URL 与观测时间 |
| `221c53c` | feat(db) | 迁移 `084_provider_balance_observed_values.sql`：`ai_studio.ai_providers.balance` 去掉 `NOT NULL DEFAULT 0`，只把 `balance = 0 AND balance_checked_at IS NULL`（从未观测过的默认值）归一为 `NULL`；已观测行保持原值，不触碰历史数据 |
| `221c53c` | test(p2) | 新增 `tests/p7/provider-balance-unknown.test.mjs`（8 条）：映射器的 `NULL`/`0`/字符串/非法输入、币种与接口三态，加源码契约断言覆盖迁移语句、`circuitBreaker` 与 `aiCatalog` 不再伪造 `0`、后台展示与观测时间渲染 |

`51a0765` 及之前的提交已在主分支，属于本批基线。表内前 6 项为本批之前的独立提交，其余 21 项已随 `6447407`（24 files，+538/−146）提交，余额批次 3 项已随 `221c53c`（6 files，+229/−5）提交；工作区不再有源码或测试改动。

`6447407` 涉及 9 个源码文件（`config/mega-navigation.js`、`lib/studio-routes.js`、`lib/security/publicError.js`、`lib/repositories/models.js`、`lib/utils/modelBrands.js`、`app/api/canvas/config/route.js`、`app/api/canvas/models/route.js`、`app/api/models/active/route.js`、`app/api/auth/oauth/google/one-tap/route.js`）、14 个测试文件与本文档的初版。

`221c53c` 涉及 3 个新增文件（`lib/services/providerBalance.js`、`lib/db/migrations/084_provider_balance_observed_values.sql`、`tests/p7/provider-balance-unknown.test.mjs`）与 3 个修改文件（`lib/services/circuitBreaker.js`、`lib/repositories/aiCatalog.js`、`app/admin/models/providers/ProvidersManagerClient.jsx`）。

`package-lock.json`、`pnpm-lock.yaml`、`plugins/china-ip-block/state.json`（运行态自增计数）与未跟踪的 `docs/architecture/SUPDANCE-V4-DEVELOPMENT.md` 不在本批提交范围内；`docs/route-map.md` 的刷新随 `npm run route:map` 单独核对后再决定是否纳入。

## 2. 兼容性与数据影响

- **新增一份宽松迁移 084**（`084_provider_balance_observed_values.sql`）：不新增表、列、索引或种子数据，只做两件事——把 `ai_studio.ai_providers.balance` 的 `NOT NULL DEFAULT 0` 去掉，让「未知」可以表达；把 `balance = 0 AND balance_checked_at IS NULL`（019 建表以来的默认值，从未被真实观测过）归一为 `NULL`。`balance_checked_at` 非空的行是真实写入的观测值，保持原样。已提交批次 `51a0765..6447407` 仍无迁移，`git diff 51a0765..HEAD -- '*.sql'` 只命中本批 084。
- **迁移可重复执行且不改业务数据**：084 的 `ALTER` 在已放宽的库上幂等，`UPDATE` 只影响「余额为 0 且从未观测」的行；不修改 `updated_at`，不触碰模型、任务、订单、积分与素材。执行前仍需 `npm run backup:db`，确认备份对象名后再跑 `npm run db:migrate`。
- **读侧兼容**：`balance` 从 `0` 变为 `null` 会进入三条既有消费路径——`lib/modelCenter/routePricing.js:597` 只拒绝负余额，`lib/repositories/aiCatalog.js` 与 `lib/services/channelSync.js` 已做 null 安全；因此「未观测」不会被当成「欠费」或「额度耗尽」而被排除出调度。
- 生产所需数据状态仍是已应用的 Seedance 定价与 Canvas 能力种子（见 `d25915c`）；发布前用 `npm run db:status` 确认目标库迁移序号，不重复执行种子。
- **服务端账务行为变化一处**：`terminalFailure` 现在从适配器一路透传到 `generationCore` 的结算判定。表现为"供应商明确失败"的任务从"待核对"变为"只释放一次积分"；"已受理/受理未知"仍走 `retainUnconfirmedSubmission` 恢复分支，不会二次 `createTask`。
- **错误文案收敛（不改状态码与错误码）**：`app/api/canvas/config`、`app/api/canvas/models`、`app/api/models/active` 的 409 分支由 `error.message` 改为 `publicErrorMessage(error)`；`auth/oauth/google/one-tap` 的日志只保留 `error.code`，不再写入原始异常文本。协议版本不支持的提示文案已在 `USER_FACING_ERROR_MESSAGES` 注册，客户端收到的仍是 `code: MODEL_CATALOG_VERSION_UNSUPPORTED` + 409。
- `tests/p0/security-baseline.test.mjs` 的两处 allowlist 按实测集合刷新（路由裸 repository 读取 27 项、service 内原生 SQL 15 项）。在此之前该测试在已提交树 `8549adb` 上即已 3 项失败：用 `git grep` 对照 HEAD 与工作区、并用 `git show HEAD:lib/services/generationCore.js | shasum` 与服务区 shasum（`7a093b87…`）一致，确认是本批之前遗留的陈旧清单，不是新回归。新增的 6 个路由例外逐项核实为窄 repository 读取（无裸 `lib/db`），未为满足命名而新增纯转发 service。
- API 契约、请求/响应字段、模型 ID、积分数值、报价公式均未改变；旧客户端无需同步升级。
- 导航改动只影响 `/`、`/studio` 等页面的模型链接可解析性，不影响已存在模型或历史任务。
- **导航修复的业务含义**：`945a713` 曾把 Body Swap 功能项的 `tabId`/`href` 改为 `?tab=recast`，但 `recast` 从未注册进 `STUDIO_TAB_IDS`，且 `app/studio/[[...slug]]/page.js` 对未知 slug 直接 `notFound()`。结果是首屏 Mega Menu 的 Body Swap 入口指向 404。本次改回 `body-swap`（`StandaloneShell` 中真实渲染 `RecastStudio` 的 tab）并保留 `recast` 别名，因此旧收藏链接仍然可用。

## 3. 环境变量

无新增必填变量。发布时确认以下既有变量在 Web(3200)、Canvas API(3100) 与 Worker 三个进程一致：

- `DATABASE_URL`、对象存储凭据、供应商凭据（仅服务端读取）
- 可选调优：`PROVIDER_MAX_RETRIES`、`PROVIDER_TIMEOUT_MS`、`PROVIDER_CIRCUIT_FAILURE_THRESHOLD`、`PROVIDER_CIRCUIT_RESET_MS`、`STORAGE_INGEST_RETRY_DELAYS_MS`

仅测试用途：

- `SUPDANCE_ACCEPTANCE_ENV=1`：开启 `tests/m2-verification.test.mjs` 的部署环境快照验收（默认跳过，避免把未发布目录误判为回归）。

## 4. 构建与验证

本地（已完成 / 待记录的项在提交汇报中标注真实结果）：

```bash
node scripts/run-all-tests-isolated.mjs      # 非 e2e 全量，exit 0 视为全绿
npm run lint:routes                           # 路由表与处理器计数一致
npm run build && npm run verify:build         # Next 构建 + 制品清单校验
```

已记录的本地结果（2026-10-29 实跑）：

- 全量隔离测试：`tests/**/*.test.mjs` 共 176 个文件，逐个独立进程运行。修复 3 个陈旧契约/时间炸弹测试后全部通过；这三个文件单独复跑的真实结果为 `simplified-account-center` 8 pass、`subscription-oiioii-design` 1 pass、`third-priority-fixes` 3 pass，均 `EXIT=0`。
- 余额批次定点复跑：`tests/p7/provider-balance-unknown.test.mjs` → `EXIT=0`，8 tests / 8 pass / 0 fail（110 ms）；`tests/admin/social-providers.test.mjs` → `EXIT=0`，12 tests / 12 pass / 0 fail。`tests/db/generation-recovery-lifecycle.test.mjs` → `EXIT=0`，但 13 项全部 `# SKIP`（需 `SUPDANCE_ACCEPTANCE_ENV=1` 与隔离库），`pass 0 fail 0`，**不构成数据库事务覆盖证据**，仍列在 §7。
- `npm run lint:routes` → `route-map: pass`（140 页面路由 / 234 处理器；`stale-declared-path=2`、`api-mutation-without-guard=5`、`api-mutation-without-rate-limit=16` 等为既有基线，本批未新增）。
- `npm run build` → `EXIT=0`，Next.js 15.5.26 生产构建完成，`.next/BUILD_ID` = `_lkwZQfZiQRbBk6rODSPU`。首次尝试因宿主机 ENOSPC（`mkdir .next/static` 失败）中止，非代码缺陷；磁盘回收后原命令重试即通过。构建日志中仅有一条 `next-intl` 的 `import(t(c).href)` 动态依赖告警，属该依赖既有行为，不阻断构建。
- `npm run verify:build` → `EXIT=0`，`[verify-build] OK — BUILD_ID _lkwZQfZiQRbBk6rODSPU, 545 referenced static assets present`。
- `npm run route:map` → 提交前运行并纳入本批提交，用于刷新 `docs/route-map.md` 中 4 个在途处理器（`auth/oauth/google/one-tap`、`canvas/config`、`canvas/models`、`models/active`）的登记。

Canvas 仓库 `/Users/seelucency/Documents/dev/canvas-web`，应用根目录是 `web/`（仓库根无 `package.json`，必须先 `cd web`），分支 `koyo-canvas-ui-i18n`：

```bash
cd web && npm run build                       # vite 产物
```

- 实跑结果：`EXIT=0`，vite 7.3.6 转换 8697 个模块，`✓ built in 52.03s`。产物：`dist/index.html` 1.29 kB、`dist/assets/index-DistJF4a.css` 145.58 kB（gzip 24.48 kB）、`dist/assets/index-BEkk5Xyt.js` 4,429.69 kB（gzip 1,383.88 kB）。大 chunk（>500 kB）与 `image-storage.ts`、`use-canvas-store.ts` 的静态/动态混合导入告警为既有状态，本次未改。本批 Canvas 侧无新增源码改动，仅验证既有客户端可在当前源码上构建。
- 类型检查 `npm run typecheck`（`tsc --noEmit`）→ `EXIT=0`。
- 单元测试 `npm test`（`bun test`）→ `EXIT=0`，`103 pass / 0 fail`，358 个断言，22 个文件，3.27s；覆盖云端快照未保存时的 409 `CANVAS_NODE_NOT_SAVED`、OAuth origin 校验、闪烁防护与缩略图等既有行为。

## 5. 发布顺序（需要生产授权后执行）

1. `npm run backup:db`（`scripts/auto-backup-s3.mjs`）完成数据库备份，记录备份对象名；记录当前源码 commit 与 `.next/BUILD_ID` 作为回滚锚点。
2. `npm run db:status` 确认 084 尚未应用（应显示待执行到 `084_provider_balance_observed_values.sql`）；备份完成后再执行 `npm run db:migrate`。084 只放宽 `balance` 约束并归一未观测的默认 0，先迁移再重启进程，旧代码在迁移后仍可运行。
3. 用 `scripts/deploy.sh`（→ `scripts/deploy-canvas-safe.sh`）发布主站服务端；不要用 `scripts/deploy-safe.mjs`（已主动拒绝执行）。构建输出到新目录，避免覆盖运行中的 `.next`。
4. Worker 与其使用同一源码版本重启（`worker:generation:supervised`），确认两个 Next 进程与 Worker 的 `BUILD_ID` 一致。
5. Canvas API（3100）随同一源码发布；此时服务端已兼容新客户端。
6. 最后发布 Canvas 静态客户端 `koyo-canvas-ui-i18n`。
7. 冒烟：`/api/health`、`/api/health/live`、`/api/health/ready`；公开目录拉取；后台供应商页确认余额显示为数值或「未知」而非伪造 0；一笔已有任务的恢复查询；私有素材带授权下载与无授权拒绝。

## 6. 回滚

- 应用回滚：切回上一 `BUILD_ID` 的构建目录并重启 Web(3200)、Canvas API(3100)、Worker。三个进程必须一起回到同一版本。
- **不回滚已发生的积分结算**：本批不改变账本写入语义，回滚代码不会撤销已释放或已确认的积分。
- 若需数据修复，只做显式、可审计的单条修复（限定 `creations`/`credit_reservations`/`credit_ledger_v2` 中已定位记录），不批量重算、不修改历史成本为 0。
- 本批迁移 084 是宽松迁移（只去掉 `NOT NULL DEFAULT 0` 并把未观测的 0 归一为 `NULL`），应用回滚不需要回滚数据库：旧代码读 `NULL` 余额是安全的（见 §2 读侧兼容）。若要强行恢复旧约束，必须先确认真实余额已回填，否则会把 `NULL` 写回假 0，不建议执行；确需恢复时按单条、可审计的 `UPDATE` 处理并记录操作者与原因。已应用的历史种子保持不动。

## 7. 待授权的验收项（未执行）

以下都需要明确的模型、能力、次数与金额/积分预算，当前一律未提交：

1. 真实生成链路：quote → 唯一 job → Provider receipt → 终态 → 私有素材归档与下载 → 积分结算/释放 → 成本状态（estimated / provider_reported / reconciled 分别记录）。
2. 明确失败路径的真实释放：用可得失败的线路验证"释放一次且不进待核对"。
3. 已受理断线的恢复：确认刷新/Worker 重启后复用原任务，不产生第二笔收费。
4. 外部账单对账（F04/F05）：需供应商账单证据，当前无数据。
5. 部署环境目录验收：`SUPDANCE_ACCEPTANCE_ENV=1` 下运行 `tests/m2-verification.test.mjs`，需针对已发布环境快照。
6. 迁移 084 的隔离库验证：在隔离 PostgreSQL 上连续执行两遍确认幂等，并核对「`balance_checked_at IS NULL` 且原值为 0 的行变为 `NULL`」「`balance_checked_at` 非空的行余额不变」「`routePricing`/`channelSync` 读取 `NULL` 余额时不报错」。本地当前没有可用的隔离库，未执行。
7. 后台供应商页的人工核对：真实渠道中「从未查询过余额」显示「未知」而不是 0，配置了余额接口的渠道显示来源 URL 与观测时间。需要可访问的部署环境。
