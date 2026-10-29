# SupDance V3 本地实施记录

本记录承接第一阶段只读审计。本批实现处于本地验证和代码审阅阶段，未部署生产、未修改生产数据库、未调用付费 Provider、未使用真实用户钱包。

## 阶段与完成边界

| 阶段 | 当前状态 | 本批交付 |
| --- | --- | --- |
| 一：只读审计 | 已有报告 | 本地/生产版本、配置、迁移、接口及隔离账本探针 |
| 二：模型能力与 Provider 配置 | 部分实现 | 统一公开模型准入；版本化目录；实际凭据来源与读取错误展示 |
| 三：积分、价格与路由 | 部分实现 | 原子并发准入；保护处理中任务冻结款；历史成本口径与积分换算修复 |
| 四：Canvas 全模态 | 部分实现 | 既有视频平台报价/任务路径解禁；模型价格和参数刷新；文本/音频/音乐仍待独立适配 |
| 五：统一管理后台 | 未完成 | 保留现有服务；本批仅修复凭据与财务展示，未完成自动发布向导 |
| 六：全链路与灰度 | 未完成 | 本地隔离测试；生产构建、完整浏览器验收、真实生成、灰度和上线验收仍须分别确认 |

## 实际文件、原因及影响

### 账户与 iframe

- `app/embed-auth/page.js`、`app/embed-auth/EmbeddedAuth.jsx`、`lib/auth/embedAuth.js`、`middleware.js`：恢复 Canvas 已使用的嵌入式主站登录入口。限定父页面 origin；仅该入口允许可信站点嵌入。消息只携带成功/关闭动作，父页面重新读取主站 Session。
- `components/auth/AuthCard.jsx`：注册协议改为默认不勾选，遵循现有验收清单。
- `tests/auth/embed-auth.test.mjs`：验证父 origin 校验及 frame 策略隔离。

### 模型目录与凭据

- `lib/services/canvasModelConfig.js`：沿用主站 `listActiveModels` 和公开可选判定，移除较宽松的第二套 SQL 准入。
- `lib/canvas/modelDescriptor.js`、`app/api/canvas/models/route.js`：目录新增 `schemaVersion=1`、目录 hash 和能力 hash；保留既有字段，公开白名单不含供应商密钥或私有 metadata。
- `lib/services/providerSecrets.js`、`app/api/admin/models/providers/route.js`、`app/admin/models/providers/ProvidersManagerClient.jsx`：执行与后台状态使用同一解析器；明确环境变量优先、数据库后备、sandbox/production，以及读取失败。上游验证状态仍是 `not_checked`，不把“已配置”当成“已验证”。
- `lib/adapters/VolcengineAdapter.js`：移除请求 404 后暗中改用 Seedream 4.5 的递归调用，保留用户选定模型并报告真实错误。
- `tests/provider-credential-status.test.mjs`、`tests/canvas-model-descriptor.test.mjs`、`tests/p3/canvas-model-config.test.mjs`、`tests/canvas-models-api.test.mjs`、`tests/db/model-pricing-control.test.mjs`：覆盖凭据来源、目录版本、未定价/隐藏/无可用线路过滤和登录后目录接口。

### 任务与资金

- `lib/repositories/creations.js`、`lib/services/generationCore.js`：按用户取得事务级 advisory lock，在同一事务中检查活跃任务数、重查幂等请求并冻结积分。不同幂等键也共享套餐并发额度；重复提交仍返回原任务。
- `lib/financial/creditService.js`：TTL 清理仅释放未绑定任务的独立预扣；锁定预扣后再次校验绑定关系，避免清理与建单竞争。已绑定任务不能只因 TTL 到期而退款。
- `lib/services/generationCore.js`：超过既有处理阈值的任务，保留 processing 与冻结款，幂等记录 `TASK_RECONCILIATION_REQUIRED`。即使缺少上游请求 ID，也不能由此推断供应商未接单。原有阈值、重试次数、并发额度均未新增或上调。
- `tests/db/generation-admission-lifecycle.test.mjs`、`tests/db/postgres.test.mjs`：覆盖并发只接纳一单、报价未误消耗、重复请求、已接单长视频、无回执超时、独立过期预扣。
- 已有轮询/可信回调可继续确认终态；专门的待核对运营队列、无回执任务人工核对流程和前端明确提示尚未完成。不能据此承诺所有悬挂任务自动恢复。

### 价格与财务

- `lib/admin/financialReporting.js`、`app/admin/cost-center/page.js`、`app/admin/profit-center/page.js`：逐条优先实际费用、否则估算费用，修复聚合 fallback 漏计其他估算记录；按任务自身 FX 快照折算历史成本。费用或汇率缺失时显示待核对，不按零成本算利润。积分折算收入与现金实收区分，毛利明确标为估算。
- `app/admin/models/page.js`、`app/admin/models/routing/page.js`、`lib/modelCenter/pricingMatrix.js`：当前报价展示读取最新汇率快照并复用运行时过期判定，不再在这些路径固定乘 7.2。
- `app/admin/models/frontend/FrontendConfigClient.jsx`、`app/admin/models/frontend/ModelConfigDrawer.jsx`、`app/admin/models/routing/RoutingClient.jsx`、`app/api/admin/models/control/route.js`：积分基准换算统一读 `CREDIT_PRICING_POLICY.cnyPerCredit`。只影响新保存的隐式人民币价格；未批量改写历史人工定价。
- `tests/db/financial-reporting.test.mjs`：实际与估算混合、不同历史 FX、缺失 FX/费用、已报告零成本、无成本记录、后台积分换算。
- 旧 `lib/modelCenter/routing.js` 的历史固定汇率辅助路径尚未彻底退出，全部后台页面及价格版本/按量定价口径尚需继续统一，不能把本批当成整个 R09 关闭。

### 迁移与冷启动

- `lib/db/migrations.js`、`tests/migration-transaction-boundaries.test.mjs`：runner 剥离历史 SQL 顶层事务包装，保持 runner 自己的事务完整；不改既有 SQL 字节或校验和。
- 从已验证的生产源恢复原文件：`071_provider_balance_api_capabilities.sql`、`073_generation_130pricing_and_canvas_capabilities.sql`、`074_volcengine_seedance2_route_ready.sql`。
- 新增 `074_seedance_route_prerequisite.sql`：冷启动时为既有 Seedance 线路迁移补充隐藏、禁用、experimental 的逻辑模型占位；既有模型 `ON CONFLICT DO NOTHING`，不声称能力、价格或可用性已验证。
- `048_canvas_asset_upload_idempotency.sql`、`049_model_lifecycle_status.sql`、`050_webhook_event_headers_json.sql` 的原始历史源仍未找回，禁止伪造原 SQL 或修改生产迁移账本。
- `tests/db/auth-registration-policy.test.mjs` 与 `tests/db/postgres.test.mjs` 修正隔离测试 fixture，使号码、模型公开状态、能力和 FX 证据满足实际校验；没有降低运行时门禁。

### Canvas 仓库

- `web/src/services/api/koyosim.ts`：支持旧目录和 v1，拒绝未知协议版本。
- `web/src/stores/use-koyosim-store.ts`：刷新时接收完整新目录，价格/能力变化不会因 ID 未变而被忽略。
- `web/src/lib/canvas/koyo-capabilities.ts`：使用已存在的视频平台 API，保留文本/音频及未实现专业图片工具的显式 BYOK 边界。
- 两个测试文件及 CHANGELOG、todo、pending-test 同步更新。
- 提交 `495acb0` 已推送唯一分支 `koyo-canvas-ui-i18n`；未创建标签、未部署。

## 数据及接口兼容

本批不迁移用户身份、钱包或素材数据。新增目录字段是可选增量字段；Canvas 对无版本旧目录继续兼容。凭据读取顺序不变，仅纠正状态展示。处理中超时不再自动退款属于资金行为变化，必须同时准备运营核对说明再灰度。

迁移新增占位仅服务冷启动，恢复的三份生产迁移仍须和线上 ledger 校验和逐项核验后部署；剩余历史源缺口不能自动忽略。

## 自动化和浏览器证据

| 验证 | 结果 |
| --- | --- |
| 主站定向测试（最终源码，独立 Node 22） | 119/119 通过 |
| 空数据库完整迁移及集成回归 | 26/26 通过 |
| Canvas 视频、生成、能力及恢复测试 | 37/37 通过 |
| Canvas TypeScript / Vite 平台构建 | 通过 |
| Studio 子包构建 | 通过 |
| 主站 Next.js production build | 通过，exit 0；隔离副本仅额外限制编译 CPU 为 2 |
| 修改的 JSX/JS 语法解析 | 12 个模块通过 |
| 完整浏览器登录/会话链路 | 尚未通过验收：曾渲染登录表单，但完整脚本遭遇验证副本缺文件、冷编译及本地转发连接重置；未得出线上故障结论 |
| 真实 Provider / 生产灰度 | 未执行 |

最终验证副本逐项比对了 2007 个仓库文件，没有缺文件；唯一源码配置差异是隔离构建的 CPU 限制。早期验证脚本错误地排除了 lib/storage，已修正后重跑至 119 项与 production build 通过。早期失败和修复后的成功不可混淆。

证据目录：`/Users/seelucency/.codex/visualizations/2026/10/27/01a17e75-5fbe-7ea2-b376-8a19760c5964/supdance-v3-implementation/`，包括 `focused-final.log`、`cold-final.log`、`canvas-tests-final.log`、`main-build-node22.log`、`main-build-result.json`、`snapshot-completeness.json`、`main-task-file-manifest.json` 和 `main-task-review.patch`。

任务专属审阅补丁排除了缺少任务前备份、且已有用户修改的 `tests/db/model-pricing-control.test.mjs`，该文件中的新增 Canvas 契约块须在现有文件中单独审阅。补丁不能用作覆盖生产源码的整仓发布包。本轮专用服务停止后，不影响用户既有开发服务。

任何 fixture 验收或接口探针都不等于生产端到端验收。

## 生产部署前检查

1. 本地修改与生产当前文件逐项三方比较；主站原本存在大量未提交用户改动，不能整仓覆盖或直接把全部 dirty 文件提交。
2. 记录生产代码、配置、迁移 ledger、数据库备份和构建路径；保留明确可切回的旧构建。
3. 核对三份恢复迁移 checksum 和新增占位迁移；调查三份遗失的历史源，不修改已应用历史记录。
4. 完成主站最终构建及路由/Provider/账本回归后，先部署向后兼容的主站，再灰度 Canvas；本地浏览器包设置了 localhost 登录 origin，禁止部署该测试产物。
5. 单独审阅 Nginx Origin 方案。不能直接把线上覆盖 Origin 改为空值透传而不处理合法同源 GET 缺少 Origin 的情况。
6. 安全 worktree 尚未合并。header token、一次性票据与 Canvas 客户端协议须协同验收，禁止把未部署安全补丁描述为在线生效。
7. 真实 Provider 验收先取得本次预算、模型清单和次数，再以独立测试账户验证唯一报价/幂等任务/供应商终态/私有素材/结算或释放。

## 回滚

Canvas 可将部署指向之前已验收构建；源码回滚使用正常 revert，不强推。主站逐文件保留本批前备份，回退时仅移除本批增量，保留用户原有修改。迁移不删除已应用 ledger，不自动删模型或账本记录；占位模型保持禁用。若资金保护已灰度，不应为回退 UI 而重新启用按年龄退款，须先核对在途任务和冻结款。

## 未解决问题

- 跨周期退款：原到期日是否保留，还是返还到当前周期；业务选择已提出，未收到答复，不实施依赖该规则的账本变化。
- 独立 music 分类、文本/音频/音乐平台适配、完整版本化参数驱动表单。
- 模型接入到发布的自动化管理流程、能力/价格/线路证据统一和不可用原因运营界面。
- 无回执任务运营核对、客户端待核对展示和全部恢复路径。
- 三份历史迁移源、旧后台汇率路径、生产 Nginx Origin、Agent 安全 worktree 协议合并。
- 全量生产构建、登录/OAuth、真实生成、素材归属下载与最终积分终态、灰度与回滚演练。


## 2026-10-28 继续执行：当前候选状态

- Canvas 源码已推送唯一远端分支，当前 `c16ae68a4951714346a5434fd2b107c65b79d5c6`；图像/视频参数和参考素材绑定能力版本，文本/语音/音乐使用统一任务。此前 45 项定向用例、类型检查和 Server Mode 构建通过，Agent 干净安装构建及 129 项测试通过。未因此宣称生产安装或真实付费生成通过。
- 主站新增 V2 目录协商，工作室动态模型/字段/模型家族由服务端发布规范构建，保留 V1 接口兼容。主站报价和提交绑定能力版本；修正提示词规范、共享会话 Cookie 清理和头像字段映射。工作室构建通过；新模型动态参数回归与其它契约测试 23/23 通过。
- 生成幂等新增参数摘要，阻止相同请求标识更换输出参数；利润报告计入失败但已经发生的上游成本；旧管理入口不能跳过测试发布新模型。上述新增财务/任务变更正在隔离数据库重跑，不视为生产验收。
- 浏览器验收仍在独立配置和隔离数据库进行；首次登录表单及来源限制已通过，但最新运行在注册表单加载时中断，仍需完整重跑共享账户与登出流程。
- 生产代码、数据库和 Nginx 尚未写入；已有当前 Nginx 来源规则候选和配置哈希，仍需语法预检、完整来源行为验证、备份与灰度发布。当前不具备完成目标的证据。
