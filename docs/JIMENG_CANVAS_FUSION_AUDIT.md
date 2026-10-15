# 即梦画布 × KoyoSIM Canvas 融合核对

首次核对：2026-10-08。当前状态以本文后续最新续核为准。依据：用户已打开的即梦画布、公开 Canvas/主站接口、两边当前工作树和生产主站只读检查。即梦示例画布的生成历史和积分消耗均为空，页面中的素材不能当作生成成功证据。

## 2026-10-09 13:36 UTC 部署请求后的线上续核

| 检查项 | 当前证据 | 状态 |
| --- | --- | --- |
| 主站与画布 | `/api/live=200`、Canvas 页面 `200`；Canvas 静态资源与本地干净提交 `3a8a1aa` 构建哈希一致 | 前端已部署，无新静态差异 |
| 发布门禁 | `/api/ready=503`、`providers=unhealthy`；数据库、迁移、Worker、存储、邮件 healthy；安全发布所需五类备份校验通过 | readiness 未过，禁止后端切换 |
| 生产核心模型路由 | 44 个 active/visible/priced core 模型；图片 11 个、视频 22 个；6 个图片及 5 个视频模型没有任何 Provider mapping | Provider/报价配置仍未完成；不得猜配或放宽门禁 |
| 生产版本 | HEAD `39c02816ae2a71530177e64fce5d14ac580efa45`，BUILD_ID `zinizzeiBZFtGSeEWTS2i`，Canvas API routes `11/11` | 路由已存在，但不是交易成功证明 |
| 部署执行 | 无冻结候选快照；本机 macOS arm64 且无 Docker/Podman；生产 readiness 仍 503 | 未切换服务，避免触发已知失败的上线后检查与回滚 |
| 用户交易 | 登录报价、Provider terminal、资产/历史/下载、积分提交/退回、双账户隔离均无本轮验收证据 | `Candidate/Unknown/Disabled`，商业闭环未验证 |

下一步执行顺序：先补齐有凭据和真实价格证据的模型路由及健康验收，使 `/api/ready=200`；再冻结候选快照并取得 Linux x64 Next 构建；通过安全脚本发布；最后在隔离账户和明确预算内完成真实图片成功/失败及积分、存储、历史闭环。当前代码或页面加载成功不能替代这些步骤。

## 2026-10-09 09:16 UTC 生产 readiness 根因续核

| 检查项 | 当前证据 | 状态 |
| --- | --- | --- |
| 公网状态 | Canvas 200；`/api/live` 200；`/api/ready` 503、Provider unhealthy；匿名 Canvas Session 401、正确 Origin OPTIONS 204 | 页面与匿名门禁可达，不是登录或交易证明 |
| 核心模型 Provider mapping | 只读数据库查询：6 个图片、5 个视频、1 个音频、4 个文本核心可见已定价模型没有 Provider mapping | 图片/视频 11 个未路由模型直接阻断全局 readiness；不能放宽门禁 |
| 路由价格与健康 | RunningHub 视频 3 条 mapping 无有效价格版本；OpenAI 图片状态 degraded（3 条 mapping、2 个模型）；Luma、Runway 健康记录约 6.0 天、10.6 天未更新 | 路由、报价和供应商健康需逐项真实修复/验收 |
| 生产基线 | HEAD `39c02816ae2a71530177e64fce5d14ac580efa45`、漂移计数 517、BUILD_ID `cCjh7dGANqkPr5fslqKG9`、Canvas API 路由 11/11；旧备份与当前 BUILD_ID/源树不匹配 | 当前状态全量可恢复备份、候选构建和发布门禁仍不通过 |
| 变更归属与交易 | admin 源码修改和服务重启来源尚未确认；隔离账户、消费上限及真实生成验收均缺失 | 保留现状；不部署、不收费、不标记 Verified |

以上 Provider 诊断通过只读数据库连接完成，未读取或输出凭据、未修改生产。生产源码与运行构建仍需先冻结并做匹配的五类可恢复备份。

## 2026-10-09 09:31 UTC 当前树备份与构建能力复核

- 用户确认近期生产 admin 源码修改、构建和重启为其发起或确认。当前源树 HEAD `39c02816ae2a71530177e64fce5d14ac580efa45`、摘要 `7d4d6b28c3c4d54ec9e0bed26f8819ebcba63a2b560185177f8c78fce42f639b`、BUILD_ID `cCjh7dGANqkPr5fslqKG9` 在归档前后匹配。
- 五类备份及隔离恢复已通过生产备份校验器，清单为 `/home/ubuntu/backups/koyosim-canvas-release.json`。证据包括源码树匹配（7303 文件）、配置逐文件与符号链接匹配（100 文件、20 链接）、数据库隔离恢复（979 行后删除临时库）、130 个对象逐文件哈希匹配、构建 ID 匹配。旧清单已另存。
- CI 配置有 Ubuntu 24.04 runner，但本地主站仓库没有 Git remote，无法将脏的权威生产树作为该 runner 的安全构建输入；用户没有另一台可用 Linux x64 构建机。发布仍被 `/api/ready=503` 和 Provider 路由缺口阻断，真实图片 E2E、积分结算及消费上限也未完成。

## 2026-10-09 01:52 UTC 最新续核

| 检查项 | 当前证据 | 状态 |
| --- | --- | --- |
| 公开页面与依赖 | Canvas 页面 200；`/api/live` 200；`/api/ready` 503，`status=not_ready`、`providers=unhealthy` | 页面可访问，Provider 阻断交易和发布 |
| Canvas 匿名 API/CORS | 正确 Origin/标记的 Session、models、config、projects、jobs、assets GET 为 401；11 个生产路由 OPTIONS 为 204 且精确允许 Origin；错误 Origin 的 projects GET 为 403 | 匿名隔离与预检通过，认证用户路径未测 |
| 模型与有效白名单 | `/api/models/active` 44 个模型、1 个 `autoRouteEligible`；生产进程有效 `CANVAS_E2E_VERIFIED_MODEL_IDS` 无法读取 | 白名单 `Unknown`，不能开放候选模型 |
| 生产基线/备份 | HEAD `39c02816ae2a71530177e64fce5d14ac580efa45`；漂移 548 行；BUILD_ID `TNgLPal6DP6uKN4qqO9eH`；Canvas API 路由 11/11；发布备份清单与冻结快照均缺失 | G0 不通过，不部署 |
| 本地工作树 | 主站 HEAD `a824c74dccf98546a63f345307ec1a41b3e57a33`、清单 731 行；Canvas HEAD `4fc779ed04da0b73294d666bcb1bd082cbc4cf94`、清单 43 行 | 用户原有改动保留 |
| 云项目缓存隔离 | 新增 Server Mode 当前用户 owner 过滤，覆盖列表、直达页面、选择、删除/导出、恢复、自动保存及异步列表过期响应；登出清空本地会话 | Candidate；真实双账户 E2E 未执行 |
| 离线候选验证 | Canvas typecheck、Server Mode Vite build、项目访问 helper 断言 9/9、`git diff --check` 通过；build 输出 `/tmp/koyosim-canvas-candidate-20261009-r6` | 代码验证，不是线上功能证明；Bun/隔离库未运行 |
| 真实商业验收 | 未执行认证登录、A/B 账户访问、Provider 生成、存储/历史/下载、积分提交或释放 | `Candidate/NOT_RUN`，禁止宣称完成 |

本次未执行生产写入、备份制作、登录操作、生成或部署。Provider unhealthy、ready 503、备份/快照缺失、有效验收白名单未知，仍阻断真实交易和发布。

## 2026-10-09 01:35 UTC 最新续核

| 检查项 | 当前证据 | 状态 |
| --- | --- | --- |
| 公开页面与依赖 | Canvas 页面 200；`/api/live` 200；`/api/ready` 503，`status=not_ready`、`providers=unhealthy` | 页面可访问，Provider 阻断发布 |
| Canvas 匿名 API/CORS | 正确 Origin/标记的 Session、models、config、projects、jobs、assets GET 为 401；生产运行 manifest 的 11 个路由 OPTIONS 均为 204 且允许的 Origin 精确匹配 | 匿名拒绝与预检通过；认证后行为未测 |
| 模型和有效白名单 | `/api/models/active` 为 44 个模型、1 个 `autoRouteEligible`；生产有效 `CANVAS_E2E_VERIFIED_MODEL_IDS` 环境无法读取 | 白名单 `Unknown`，不能开放候选模型 |
| 生产基线 | HEAD `39c02816ae2a71530177e64fce5d14ac580efa45`；脏清单 548 行；BUILD_ID `TNgLPal6DP6uKN4qqO9eH`；运行路由 11/11 | 生产漂移保留；源码/产物一致性未证 |
| 生产备份 | 发布备份清单与冻结快照均不存在 | G0 不通过，不部署 |
| 本地工作树 | 主站 HEAD `a824c74dccf98546a63f345307ec1a41b3e57a33`、清单 731 行；Canvas HEAD `4fc779ed04da0b73294d666bcb1bd082cbc4cf94`、清单 39 行 | 所有现存改动保留 |
| 图片入口审计 | 普通图片入口和重试均经 `requestCanvasImage`；旧浏览器 Provider 只在非 Server Mode 执行；插件宿主和脚本执行器在 Server Mode fail closed | 源码 Candidate；线上网络记录未取得 |
| 报价与项目持久化 | 生成前等待云项目同步，服务端校验目标节点已保存；报价过期前后逻辑新增幂等键清理 | Candidate；暂无真实 job 验证 |
| 离线验证 | 主站定向 33/33、route lint、Canvas typecheck、Server Mode 构建、报价重试键断言 4/4 通过 | 候选代码验证；不是线上完成证明 |
| 剩余验证 | Canvas Bun 测试未执行（环境无 Bun）；`TEST_DATABASE_URL` 缺失；真实交易、跨设备和跨账户验证未执行 | `Candidate/NOT_RUN` |

本次未执行生产写入或部署。由于 `/api/ready=503`、Provider unhealthy、备份/快照缺失且有效模型白名单未知，认证后真实交易和发布仍不放行。

## 2026-10-09 01:19 UTC 当前复核

| 检查项 | 当前证据 | 状态 |
| --- | --- | --- |
| 公开画布 | `https://canvas.koyosim.com/canvas` 返回 HTTP 200 | 页面可访问，不代表账户或生成可用 |
| Session 与 CORS | 正确 Canvas Origin/标记的匿名 Session 返回 401；11 个 Canvas API OPTIONS 返回 204 | 匿名拒绝与预检通过；登录后的会话和交易仍未测 |
| 主站就绪 | `/api/ready` 返回 503，`providers=unhealthy`；`/api/live` 为 200 | 不满足发布门禁 |
| 模型目录与验收白名单 | `/api/models/active` 返回 44 个模型，其中 1 个 `autoRouteEligible`；`/etc/koyosim.env` 未发现 `CANVAS_E2E_VERIFIED_MODEL_IDS` | 目录资格不等于 Canvas 验收；生产有效环境白名单仍未证明 |
| 生产源码 | HEAD `39c02816ae2a71530177e64fce5d14ac580efa45`，本次 `git status --short` 计 548 行，源码树有 11 个 Canvas route | 脏生产源树，不能直接发布 |
| 生产运行构建 | BUILD_ID `TNgLPal6DP6uKN4qqO9eH`；运行 manifest 有 11/11 个 Canvas route | 路由覆盖通过；源码与运行产物内容一致性仍未证明 |
| 主站本地候选 | HEAD `a824c74dccf98546a63f345307ec1a41b3e57a33`；当前候选已有 11 个 Canvas route。新增的 7 个缺失路由取自生产源码；本地另加 fail-closed 模型验收门禁 | `Candidate`，未构建、未部署 |
| Canvas 客户端候选 | HEAD `4fc779ed04da0b73294d666bcb1bd082cbc4cf94`；图片适配器现在由 `project.tsx` 的多个创建/重试入口调用，Server Mode 图片请求走 quote/job/poll/Asset；视频、音频、文本仍禁用 | 接线候选，不代表线上运行版已接通 |
| Provider 引用素材 | `generationCore.js` 的两个 Provider 执行路径调用 `resolveCanvasProviderParameters`，并以任务 owner 查找私有 Asset 后生成签名 URL | 有实际源码调用路径；尚无线上 Provider 收到参考图的 E2E 证据 |
| Canvas 上传幂等 | 复核发现上传路由生成稳定 `objectKey`，但 `ingestBuffer` 忽略该参数；候选已限制对象键到当前用户的 Canvas 上传目录并使用稳定对象键 | 离线候选；相同幂等键和相同内容重试会复用对象路径；并发与线上行为未验证 |
| E2E 模型门禁 | 服务端候选要求画布挂载、当前路由资格，并且模型 ID 出现在私有 `CANVAS_E2E_VERIFIED_MODEL_IDS` 环境白名单；无白名单时模型列表为空，quote/job 拒绝 | 防止未验收模型被当作可用；仍须真实交易验收 |
| 候选验证 | Canvas API 路由语法检查通过；定向 Node 测试 26/26 通过（使用仓库 `server-only` loader）；主站 `lint:routes` 通过；Canvas `tsc --noEmit` 通过；Server Mode Vite 候选构建通过 | 仅候选代码验证；构建仍有现存 chunk 体积与动态/静态混合导入警告 |
| 候选发布门禁 | `verify-production-backup.mjs` 校验五类备份、隔离恢复证据和回滚；`verify-production-snapshot.mjs` 校验 Linux x64 来源和 11 路由。发现默认及备用入口曾绕过门禁后，本地已将 `deploy.sh` 转到安全脚本，并禁用旧远端 Shell、PowerShell 与 artifact-only `deploy-safe.mjs` | 入口修复为本地 Candidate；回归测试结果待本阶段执行；未部署 |
| 备份与发布 | 生产 `/home/ubuntu/backups/koyosim-canvas-release.json` 与 `.koyosim-production-snapshot.json` 均不存在；无五类备份及完整隔离恢复记录 | 备份门禁不通过；未部署 |

当前可执行结论：继续本地候选审查和隔离测试；`/api/ready=503`、完整备份缺失、生产 owner 素材解析与运行构建一致性未证明、有效模型白名单未证明。线上生成验收、部署与商业 READY 均未通过。不得把来源代码、测试 Mock、模型目录或本地构建提升为 `Verified`。

## 2026-10-09 01:14 UTC 复核快照（已被上方更新）

## 已观察到的即梦工作流

1. 画布以图片、视频、音频、文本、时间线、主体和外部工具为节点；示例项目有 15 个节点、10 条引用连线，顶部显示保存状态。
2. 选择图片后，就地显示智能改图、全景、扩图、超清、抠图、多角度、打光、下载等动作；`+` 可从现有节点创建图片、视频、音频、时间线或主体后继节点。
3. 右侧 Agent 输入区会带入选中素材；支持 `/` 选择创作技能、`@` 引用主体或素材，以及从本地、画布、资产库添加参考。
4. 资产库按图片、视频、音频、文档筛选；生成历史按图片、视频、音频、文本筛选；项目信息展示节点分布、任务数和积分消耗。
5. 图片预设包括场景俯视、连续分镜、多机位九宫格、人物/面部/产品三视图；节点 AI 助手提供镜头设计、提示词反推和灵感入口。智能改图在当前即梦账号下弹出会员限制，不能据此验证其生成效果。

## 与现有 Canvas 的对应关系

| 即梦体验 | KoyoSIM 现有实现 | 融合动作 |
| --- | --- | --- |
| 节点与引用连线 | `web/src/pages/canvas/project.tsx`、`canvas-create-menus.tsx` 已有多类型节点、连线和后继节点菜单 | 保留当前数据模型，收紧创建入口和上下文操作顺序 |
| 图片上下文编辑 | `canvas-node-hover-toolbar.tsx`、`canvas-image-toolbar-tools.tsx` 已有局部编辑、裁剪、切图、放大、超分、多角度 | 优先把现有操作与后继结果/引用关系连成连续工作流；新增能力先核对模型和成本 |
| 选中素材进入 Agent | `use-agent-bridge.ts`、`agent-chat-prompt-input.tsx` 已有画布快照和 `@` 素材引用 | 保留已有引用协议；需验证用户不用手动启动本地 Agent 也能完成线上创作 |
| 资产库与项目 | `canvas-side-panel.tsx`、Canvas 项目/素材 API 客户端已有结构 | 将上传、结果、项目版本与主站用户同一身份绑定，并保留 owner 校验 |
| 生成历史与积分 | KoyoSIM 的 quote/job/ledger/asset 链路有服务端源码 | 用同一任务 ID 关联节点、结果、积分预留/提交/释放和历史，不能仅显示静态列表 |

## 首次核对快照（2026-10-08；不是当前状态）

- `https://canvas.koyosim.com/canvas` 返回 200，但页面账号状态显示 `Failed to fetch`，右侧 Agent 为 `Disconnected`。
- 2026-10-08 对 `https://www.koyosim.com/api/canvas/session` 的匿名请求返回 HTTP 404；带 Canvas Origin 的请求仍是 404，且没有允许该 Origin 的 CORS 头。
- 生产主站源树存在 `app/api/canvas/*` 和 `lib/canvas/http.js`，但 2026-10-08 运行中的 `.next/server/app-paths-manifest.json` 与 `.next/server/app/api` 没有 Canvas 路由。当前本地主站工作树也没有这些路由。修复必须从生产权威源树制作独立构建候选，不能直接把本地 `.next` 发布上去。
- 主站 `/api/ready` 当前返回 503。恢复 Canvas 路由只解决入口，仍需验证 Provider 与真实任务终态。
- Canvas 客户端虽然定义了 KoyoSIM quote/job/poll 适配器，`web/src` 中的 `runKoyoCanvasGeneration` 暂无调用者；当前图片、视频、音频生成入口仍调用旧 Provider 服务函数。Server Mode 商业生成尚未接线，不能因模型目录或项目同步代码存在就称为可用。
- 当前 Canvas 客户端还依赖 `/api/canvas/config`，但该 route/service 目前只在主站本地未跟踪改动中，生产源树无此路由；打包门禁需检查 11 个端点而不是原有 10 个。
- Job route 会校验 `koyo-asset:<id>` 引用归属；生产有签名 URL 解析函数，但只读搜索未发现其调用点。图生图不能仅凭素材归属检查就判定 Provider 能收到参考图。
- 现查生产 `POST /api/canvas/jobs` 源码已用 `onTaskCreated` 在生成事务内关联项目任务；较旧架构文档关于“事务后关联”的说明已过时，仍需隔离库和线上验收。

## 落地顺序和验收

1. **恢复商业闭环**：在生产源树漂移核对和新鲜可恢复备份后，制作包含全部 Canvas 路由的独立构建；发布后检查匿名 401 与正确 CORS、登录 Session、模型目录、报价、任务和项目读写。当前安全发布入口已连接本地门禁和远端候选验证；由于全量备份清单、Linux 候选快照和 `/api/ready=200` 均未满足，仍不可发布，也没有线上修复证据。
2. **打磨创作动线**：围绕“选中素材→选择已有动作→确认参考、模型与报价→生成后继节点→查看历史/下载”简化 UI；所有新控件遵循 `docs/UI_DESIGN_SYSTEM.md`、`docs/UI_REPAIR_INSTRUCTION.md` 和 Canvas 当前主题，不照搬即梦配色或会员页。
3. **按能力逐个开通**：全景、三视图、智能打光等先映射真实模型、参数、价格和服务端结果；未验证能力不显示成可付费使用的动作。
4. **真人验收**：隔离用户登录，显示真实可用余额；完成一笔受控图片任务和一笔失败/取消任务，记录 quote、job/provider ID、终态、资产/项目节点/历史可见性，以及积分提交或释放。视频、音频分别单独验收后再标记可用。

上线状态：**未融合完成，未部署**。截至 2026-10-09，Canvas 图片入口已有本地 quote/job/asset 接线候选，但线上运行构建仍缺少 7 个 API 路由，Session/CORS 失败，`/api/ready` 为 503，且没有真实隔离账户交易证据。样例画布、源码、Mock、测试和候选构建都不能替代用户交易验收。

完整实施阶段、功能状态及严格验收见 `docs/JIMENG_CANVAS_DEVELOPMENT_PLAN.md`；可复制的开发指令见 `docs/JIMENG_CANVAS_AI_CODING_PROMPT.md`。

## 2026-10-09 02:12 UTC 当前复核补充

- 精确参考项目在隔离只读浏览器要求登录，登录后的动作/报价/结果状态本轮不可见；旧快照只能作为已观察记录，不能冒充当前登录态验证。
- 线上 Canvas 与 `/api/live` 为 200、`/api/ready` 为 503（Provider unhealthy）；11 个 API 路由的 16 个方法预检为 204，匿名 Session/models/config/projects/jobs/assets 为 401、错误 Origin 项目请求 403。生产 HEAD `39c02816ae2a71530177e64fce5d14ac580efa45`，脏清单 558，BUILD_ID `YeQLGbUVePzz3ghHnfyRv`，Canvas routes 11/11；生产备份清单及快照缺失，未写生产、未部署。生产脏清单与构建号在短时间内变化，继续冻结生产写入。
- 本地新增跨账号写请求防护：创建/保存/删除项目、素材上传、quote、job 全部携带发起时账号 ID并在服务端匹配当前认证用户；素材上传先通过身份比对再进入对象存储。图片参考 Asset 的 owner 校验及签名 URL 转换在 `generationCore.js` 的 Provider 调用路径中可见，但还没有真实 Provider 任务证据。
- owner helper 测试 2/2、route lint、五个 API route 语法、Canvas TypeScript、Server Mode 候选 Vite build 通过。Bun 与隔离 DB URL 缺失，相关测试未运行。全部仍为 `Candidate`；双账户隔离、真实图片成功/失败、资产历史下载、积分及跨设备均未验收。

02:15 UTC 补充：图片文生图、图生图、节点生成及重试均从 `requestCanvasImage` 进入 Koyo 适配器；Server Mode 插件宿主拒绝旧 Provider 请求。未验收的反推提示词、蒙版和超分动作新增回调层拦截。Canvas TypeScript 与 Server Mode Vite build `/tmp/koyosim-canvas-candidate-owner-guard-server-20261009-r2` 通过，尚未部署或通过登录浏览器验证。

## 2026-10-09 02:24 UTC 续核与候选修复

- 指定即梦 Canvas URL 在隔离浏览器加载及重载后均显示“画布意外停止，Error code: 3”；登录后的节点动作、模型/报价和结果行为本轮不可观察，未用其他项目页代替证据。
- 线上 `https://canvas.koyosim.com/canvas` 为 200；应用 API 的正式源是 `https://www.koyosim.com`（Canvas 客户端源码确认），Canvas 域名上的 `/api/*` 返回 SPA HTML，不能把该回退页的 200 当作 API 可用。`/api/live` 为 200；`/api/ready` 为 503，数据库、迁移、Worker、Storage、Email 正常，Provider unhealthy。正确 Canvas Origin、`X-KoyoSIM-Canvas: infinite-canvas-v1` 与请求标记下，匿名 Session/models/config/projects/jobs/assets 均为 401。
- 生产只读快照：HEAD `39c02816ae2a71530177e64fce5d14ac580efa45`、漂移 558 行、BUILD_ID `YeQLGbUVePzz3ghHnfyRv`、Canvas API 路由 11 个；`/home/ubuntu/backups/koyosim-canvas-release.json` 与 `.koyosim-production-snapshot.json` 均缺失。未备份、未写入或部署生产。
- 当前本地主站 HEAD `a824c74dccf98546a63f345307ec1a41b3e57a33`、工作树清单 731；Canvas HEAD `4fc779ed04da0b73294d666bcb1bd082cbc4cf94`、清单 46。所有既有修改保留。
- 新发现的本地缺口：`getGenerationTrace` 为外部结果隐藏 `result_object_key`，但 Canvas 单任务路由依赖该字段决定是否查 Asset，导致成功图片任务可能被误报为 `result_unavailable`；后台异步 Asset 同步失败时，轮询/历史也缺少重试和有限终态。
- 候选修复：`syncCreationToAsset` 先按 owner/creation 查重并在并发插入冲突后重新查询；单任务 API 使用原始 creation 行且校验 owner 后重试同步，只有 owner scoped 下载信息含有效对象键的资产才可作为成功结果；任务列表对当前页缺失对象键的成功任务分批重试同步并复查；60 秒后返回明确 `result_unavailable`。新增纯逻辑测试覆盖终态期限、原始对象键、可下载对象键和跨账户拒绝。
- 验证：定向 Node 测试 26/26、积分桶规则测试 6/6（均使用仓库 `server-only` loader）；变更服务端文件 `node --check` 通过；`npm run lint:routes` 通过。`TEST_DATABASE_URL` 缺失，隔离数据库未运行；没有登录态真实任务、对象下载或积分账本验收，故修复仍为 `Candidate`、线上未部署。

下一步继续做本地接口与隔离环境验证。Provider unhealthy、生产备份/恢复演练缺失、生产源树持续漂移、隔离账户与消费上限缺失，继续阻断生产写入、收费 E2E 和发布。

## 2026-10-09 02:32 UTC 续核

- `/api/ready=503`（Provider unhealthy）、生产漂移 558 项、Canvas API 路由 11 个；生产备份清单和冻结快照仍缺失，未写入或部署。匿名 API 401 只证明认证门禁；不代表认证后可用。Canvas 域名 `/api/*` 是 SPA fallback。
- 新增 `commitCredits`/`voidCredits` 聚合冻结余额 fail-closed 检查及回归测试；冻结额少于凭单或钱包缺失时事务拒绝且不写入。
- 积分跨过期点退款政策仍 `Unknown`：当前 void 保持原桶到期时间。没有明确产品规则前，不延长有效期、不转永久、不虚构“已返还可用余额”。
- 定向 Node 测试 34/34、相关 Node 语法检查、`npm run lint:routes` 通过。全仓空白检查被已有 CRLF/空白改动阻挡；没有格式化既有文件。无隔离数据库、隔离用户或消费上限；真实 Provider/存储/账本闭环未验证，状态仍为 `Candidate`。

## 2026-10-09 04:45 UTC 离线回归补充

- 修正 `tests/db/payment-flow.test.mjs` 对产品积分类型的断言：订阅付款增加 `subscription_credits` 并设置未来到期时间，退款只撤销本订单订阅积分且清空耗尽后的到期时间，`perpetual_credits` 不变。
- 验证结果：隔离 PostgreSQL 数据库套件 22/22；Canvas 与积分关键 Node 回归 25/25；P7 CI 合约 8/8；`npm run lint:routes` 通过；Canvas TypeScript 检查通过；Server Mode Vite 构建通过，输出 `/tmp/koyosim-canvas-candidate-20261009-final`。构建有动态/静态导入提示和主包体积提示。Route lint 仍列出历史扫描提示，未将其隐藏或归类为新通过项。
- 测试数据库只在本机回环地址运行，已停止并移除本轮临时数据目录。Canvas Bun 测试未运行，原因是环境未安装 Bun。此次未重新访问生产与即梦页面；上述线上状态只能引用 02:32 UTC 的检查记录。
- 无生产写入或部署。`/api/ready`、Provider、完整可恢复发布备份、线上认证账户、消费上限、隔离真实图像任务及 provider/asset/history/ledger 证据仍需复核；所有未完成能力继续标为 `Candidate`、`Unknown` 或 `Disabled`，不得标为 `Verified/READY`。

## 2026-10-09 05:04 UTC 在线复核与入口门禁

- 当前公网只读复核：`https://canvas.koyosim.com/canvas` 为 200；`https://www.koyosim.com/api/live` 为 200；`/api/ready` 为 503，数据库、迁移、Worker、Storage、Email 正常，Provider unhealthy。正确 Origin/标记的匿名 Canvas API 只证明认证门禁（401），不证明登录后的功能。
- 05:04 UTC 直连 SSH 生产快照：权威源码 HEAD `39c02816ae2a71530177e64fce5d14ac580efa45`，`git status --short` 563 项；运行 BUILD_ID `o3In_YauyDD0gb7JS-x4K`，manifest 含 11 个 Canvas API 路由；`/home/ubuntu/backups/koyosim-canvas-release.json` 与 `.koyosim-production-snapshot.json` 缺失。未制作备份、未改生产、未部署。
- 精确即梦项目在已登录浏览器中只读显示“图像创作”、24 个节点、10 条连线、已保存、17 积分；画布包含图像/视频/音频/文本/时间线等节点。选中图片后可见智能改图、全景、扩图、超清、抠图、多角度、打光、工具、AI 助手、下载等动作。生成历史面板为空。本次没有改动该项目、创建任务或消耗积分；这些只是页面交互观察，不证明动作背后的报价、生成或结算。
- 新发现 Server Mode 绕过入口：桌面及移动导航仍暴露 `/image`、`/video`、`/config`，且路由可直达独立 Provider 工作台。候选已在路由层将这三个页面重定向到 `/canvas`，在图片生成/编辑/图像问答、视频任务创建/轮询、音频生成底层入口拒绝浏览器 Provider 请求，并从桌面和移动导航隐藏相应入口；普通本地模式保持原路由和能力。此为安全与防误导修复，不等同于 KoyoSIM 云生成可用。
- Node 原生 TypeScript 断言 15/15 通过，直接在本地候选浏览器观察 `/image`、`/video`、`/config` 均落到 `/canvas`，页面有实际画布库内容而非空白；截图显示旧候选版本仍有残留导航，因此已进一步修正导航过滤，最终构建及最终路由/导航核验待完成。类型检查中 `JSX.Element` 初次失败，已改为 `ReactNode`，首轮修复后类型检查通过；加入导航过滤后的最终类型检查/Server Mode build 正在重跑。Bun 和 Playwright 均未安装，Bun suite 未运行；UI 核对使用本地候选浏览器，不访问 Provider、不登录、不收费。
- 继续保持所有能力 `Candidate/Unknown/Disabled`。Provider unhealthy、完整备份缺失、有效模型验收白名单未知、隔离账户/消费上限缺失，继续阻止线上生成验收、生产写入和发布。

## 2026-10-09 06:45 UTC 最终续核

- 新鲜公网复核：Canvas 页面 HTTP 200，`/api/live` HTTP 200，`/api/ready` HTTP 503，`providers=unhealthy`。06:45 UTC 直连生产快照仍为 HEAD `39c02816ae2a71530177e64fce5d14ac580efa45`、脏工作树 563 项、BUILD_ID `o3In_YauyDD0gb7JS-x4K`、11 个 Canvas API 路由；发布备份清单和生产快照文件仍缺失。未写生产、未部署。
- 最终 Server Mode Vite 候选构建成功，输出 `/tmp/koyosim-canvas-servermode-final`。保留既有动态/静态导入警告和约 4.1 MB 主 chunk 警告。Node 原生 TypeScript 路由/导航/Provider guard 断言 15/15 通过；最终候选浏览器中直接访问 `/image`、`/video`、`/config` 均进入 `/canvas`，画布库正常渲染；移动导航只显示画布、提示和资产，没有本地 Provider 工作台入口。Playwright 与 Bun 未安装；Bun 套件未运行，浏览器检查使用 CUA 本地预览。
- 当前全项目 TypeScript 检查失败，报告集中在工作树中既存未跟踪的社交登录组件：`src/components/auth/social-icons.tsx` 的 props/隐式类型，以及 profile/auth modal 调用点。未修改这些用户文件。相关 Canvas 路由改动自身由成功的 Vite 候选构建和 15 条独立断言验证；不可把整仓类型检查写成通过。
- 本地主站 HEAD `a824c74dccf98546a63f345307ec1a41b3e57a33`、工作树 731 项；Canvas HEAD `ef7d36988097f81cc86c3c47e9f789d36ed37f30`、工作树 58 项。所有现有改动保留。本轮新增的独立工作台防绕过、导航隐藏、路由重定向与底层 Provider 拦截均是本地候选。
- 真实在线交易仍未验收：Provider unhealthy、没有完整可恢复发布备份、有效模型 E2E 白名单未知，也没有隔离账户与明确消费上限。图片/图生图商业闭环及视频/音频/文本/Agent 继续标记 `Candidate/Unknown/Disabled`，不能标为 `Verified/READY`；下一阶段须等 Provider 恢复并满足备份和隔离交易门禁。

## 2026-10-09 06:47 UTC 复核更正

- 06:45 记录时，社交登录组件的类型声明修复尚未完成。现在已为 `social-icons.tsx` 补显式 SVG props/component map 类型，没有更改登录、资料保存或 OAuth 行为；全量 `tsc --noEmit --incremental false` 通过。Server Mode Vite 最终构建 `/tmp/koyosim-canvas-servermode-final-r2` 通过，仍有既存导入分块和 4.1 MB 主 chunk 警告。
- Node 原生 TS 断言 15/15；最新候选的移动端菜单显示画布/提示/资产三个可用入口，直接进入 `/image`、`/video`、`/config` 均回到画布，页面有内容、无框架错误。测试没有调用 Provider。
- 新鲜匿名 API GET：正确 Canvas Origin 与 `X-KoyoSIM-Canvas: infinite-canvas-v1` 下 `/api/canvas/session|models|config|projects|jobs|assets` 均返回 401。此结果仅证明匿名访问门禁。
- 线上仍为 Canvas 200、`/api/live` 200、`/api/ready` 503（Provider unhealthy）；生产源树 HEAD/563 项漂移/BUILD_ID/11 个 Canvas 路由及两份缺失备份清单与 06:45 快照相同。无生产写入或部署。最终状态仍是本地候选，真实账号、Provider 终态、存储/历史/下载、积分及跨账户隔离验收未通过。

06:48 UTC 最终代码复核：把 Server Mode 隐藏的三个工具 slug 作为路由集合的单一数据源，避免导航和路由名单日后漂移。最新全量 TypeScript 检查通过，最新 Server Mode Vite 构建 `/tmp/koyosim-canvas-servermode-final-r3` 通过，Node 原生 TS 断言 15/15 通过，目标文件 `git diff --check` 通过。构建仍有既存动态/静态导入和约 4.1 MB 主 chunk 警告。所有更改仍未部署。

06:50 UTC 对 `/tmp/koyosim-canvas-servermode-final-r3` 做最终浏览器复验：`/image`、`/video`、`/config` 均重定向到 `/canvas`，画布库实际渲染；移动端菜单只显示“我的画布”“提示”“资产”。此验证不登录、不触发 Provider、不收费；本地会话仍匿名。

## 2026-10-09 08:09 UTC 续核与窄屏画布修复

- 最新公网只读证据：Canvas 页面 200，`/api/live` 200，`/api/ready` 503（`providers=unhealthy`）。带正确 Canvas Origin 和请求标记的匿名 GET：session/models/config/projects/jobs/assets 均 401；quotes 和 assets/upload 的 GET 均 405（方法不匹配），只证明认证/方法门禁。
- 直连生产只读证据：HEAD `39c02816ae2a71530177e64fce5d14ac580efa45`，工作树漂移 2535 项，BUILD_ID `o3In_YauyDD0gb7JS-x4K`，运行清单含 11/11 Canvas API 路由，Web/Worker 均 active。`/home/ubuntu/backups/koyosim-canvas-release.json` 与 `.koyosim-production-snapshot.json` 均缺失；没有生产写入、备份或部署。
- 修复 Canvas 移动端侧栏横向挤占、顶栏控件裁切、底部工具栏固定左偏和打开抽屉时内容重叠：小屏侧栏独立抽屉且默认关闭，侧栏内容避开两行顶栏，底部工具栏在移动端使用可横向滚动的操作轨道；桌面仍为停靠侧栏和单行顶栏。
- 隔离 Server Mode 浏览器候选在 375×812、375×844、390×844、430×844 和 1280×900 检查；页面宽度未溢出，登录/语言/主题/Agent 控件在视口内，侧栏打开时不缩窄画布并可由鼠标、键盘 Enter 和触屏模拟开合，工具轨道滚动后最右侧按钮可见。Console 无错误。该检查使用匿名本地候选和空白本机项目，不代表线上账户或生成验收。
- Canvas TypeScript 检查通过；Server Mode Vite 独立构建 `/tmp/koyosim-canvas-servermode-mobile-qa-20261009` 通过；本次目标文件 `git diff --check` 通过。构建保留既有动态/静态导入及约 4.18 MB 主包警告。全工作树 diff check 仍报告既有 `web/src/styles/globals.css:763` EOF 空行；Prettier 全文件检查提示既有大型脏文件格式差异，本轮未格式化或覆盖。Bun 和 Playwright 未运行/未安装。
- 图片文生图/图生图真实交易、任务失败退款、重复提交/超时恢复、账号隔离、跨设备历史/下载及账本仍未验收；没有隔离账户和明确支出上限，Provider unhealthy，完整备份/恢复/回滚门禁未通过。保持 `Candidate/Unknown/Disabled`，不开放收费 E2E、不写生产、不部署。

## 2026-10-09 08:12 UTC 测试续核

- 主站模型/价格/路由 Node 测试 18/18 通过；Canvas 模型配置、项目快照、任务结果、Asset 引用测试 17/17 通过，共 35 项离线测试通过。该证据仅覆盖代码契约，不替代线上生成、存储或账本结果。
- 静态检查确认 Server Mode 的生成和重试入口只放行 image capability；video/audio/text 仍被禁用。Canvas 前端自动化测试因环境缺少 Bun 无法运行，Vitest 也未配置。
- 按工作包计数，7 项中本轮只读生产状态复核 1 项已完成，剩余 6 项未闭环：Provider 与模型资格；可恢复备份/冻结源树/安全发布；认证账户及跨账号/跨设备云数据；图片成功/失败/幂等/积分真实 E2E；其他模态及 Agent/扩展动作逐项真实验收。各包仍包含多条验收场景，不能据此宣称融合完成。
- 本轮未刷新线上状态；最近公网与 SSH 只读快照为 08:09 UTC，`/api/ready=503`、Provider unhealthy，备份清单和生产快照缺失。未执行收费、生产写入、备份制作或部署。

## 2026-10-09 07:02 UTC 续核与图片任务恢复修复

- 本轮重新读取主站和 Canvas 的 `AGENTS.md`、开发方案及 UI 规范；主站 HEAD `a824c74dccf98546a63f345307ec1a41b3e57a33`、Canvas HEAD `ef7d36988097f81cc86c3c47e9f789d36ed37f30`，开始时工作树分别 731、58 项。既有修改未清理或覆盖；Canvas 依赖通过现有 pnpm lockfile 安装，无锁文件变更。
- 公网 07:02 UTC 证据：Canvas 页面 200，主站 `/api/live` 200，`/api/ready` 503 且 `providers=unhealthy`。`/api/models/active` 返回 44 个目录模型、其中 1 个 `autoRouteEligible`（`seedream-5.0`）；这不是 Canvas 可用或已验收证据。正确 Canvas Origin/标记下匿名 Session/models/config/projects/jobs/assets 均 401；quotes GET 为 405（方法不匹配）。
- 07:01:54 UTC 直连生产只读快照：HEAD `39c02816ae2a71530177e64fce5d14ac580efa45`，工作树漂移 563 项，运行 BUILD_ID `o3In_YauyDD0gb7JS-x4K`，manifest 含 11 个 Canvas API 路由。`/home/ubuntu/backups/koyosim-canvas-release.json` 与 `.koyosim-production-snapshot.json` 均不存在。当前 SSH 身份无权读取 `/etc/koyosim.env`，因此 `CANVAS_E2E_VERIFIED_MODEL_IDS` 的线上配置状态为 `Unknown`。未制作备份、未写生产或部署。
- 新发现客户端响应契约问题：服务端 `POST /api/canvas/jobs` 只返回任务摘要，即使幂等重放已成功任务也不含 `result`。客户端此前把摘要当成完整 `KoyoCanvasJob`，并在摘要状态为成功时跳过详情查询，可能将已有任务误报为缺少归档结果。候选修复新增 `KoyoCanvasJobSummary`，并在所有创建响应后按 job ID 获取权威任务详情，再读取 owner-scoped 归档 Asset。
- 新增回归契约测试：模拟 quote、已成功任务摘要、任务详情含 Asset、owner-scoped 图片读取；确保创建后查询详情并恢复 Asset。Vite SSR 隔离演练通过。Bun 未安装，新增 Bun 测试文件未直接运行。
- 当前代码验证：Canvas `tsc --noEmit --incremental false` 通过；Server Mode 与本地模式 Vite 构建均成功。既有动态/静态导入提示和约 4.1 MB 主包提示仍在；本地模式构建另有 `VITE_KOYOSIM_SERVER_MODE` 未定义提示。主站 Canvas/计费定向 Node 测试 44/44 通过；目标文件差异检查通过。隔离数据库 URL 不可用，未运行数据库交易测试。
- 功能仍为本地 `Candidate`、线上未部署/未验收。隔离账号与消费上限、Provider 健康、可验证 E2E 模型白名单、五类可恢复备份及恢复/回滚演练均未齐备；账号登录、真实图片成功/失败、跨账户拒绝、跨设备历史/下载、Provider 终态及积分账本仍未验收。下一步仅放行继续本地验证与只读诊断，不放行收费在线测试、生产写入或发布。

## 2026-10-09 08:35 UTC 最新复核与备份门禁

- 公网新鲜只读检查：Canvas 页面返回 200，`/api/live` 为 `live`，`/api/ready` 为 503 `not_ready`，原因汇总显示 `providers=unhealthy`；数据库、迁移、Worker、Storage、Email 报告健康。真实生成仍不可验收。
- 08:37 UTC 强制只读 Provider readiness 探针返回 `PROVIDER_ROUTE_UNAVAILABLE`：44 个活跃核心模型里 16 个路由健康、28 个不可用，过期健康记录为 0，图片/视频类别都存在。RunningHub、Volcengine、MiniMax 汇总健康；BytePlus、OpenAI、Google、Kling、Luma、Runway、Alibaba 汇总 degraded。此结果定位到模型路由/供应商资格层，不构成任意模型的生成证明。
- 08:39 UTC 生产路由只读诊断：所有被检查供应商适配器均存在；OpenAI、Luma、Runway 未配置可用凭据，其余列出供应商凭据状态为已配置（仅输出布尔值）。未找到 active、可路由价格版本的 mapping 行数为 Alibaba 8、BytePlus 10、Google 5、Kling 27、MiniMax 8、RunningHub 63、Volcengine 1。此为 mapping 行数，不等同于模型数；不得根据健康状态或旧目录数据猜补价格。
- 正确 Canvas Origin/请求标记下的匿名 API 检查仍只用于验证认证门禁；Session/models/config/projects/jobs/assets 的 401 和 quotes/assets-upload 的 405（GET 方法不匹配）不能推断已登录功能可用。
- 生产 HEAD `39c02816ae2a71530177e64fce5d14ac580efa45` 与 BUILD_ID `o3In_YauyDD0gb7JS-x4K`。工作树在 08:26 UTC 的状态项计数为 2487；发现 `middleware.js` 在首次打包后变更，保留其内容并重打源码包。最新线上源码树摘要 `c926dd25a9a8aceb1c3b2b7e986675989e8a88937858437b7b4df75ab545a8a7` 与最新隔离恢复副本一致。
- 五类备份均完成隔离恢复：源码 7302 文件；配置 94 项且关键服务、Nginx、Canvas 证书逐项比对一致；数据库 dump 恢复到临时数据库并查询到 979 个模型行，随后删除临时库；对象 130 个、28,733,681 字节逐文件 SHA-256 一致；构建恢复 BUILD_ID 一致。`/home/ubuntu/backups/koyosim-canvas-release.json` 已由 `scripts/verify-production-backup.mjs` 成功核验当前 HEAD、源树、构建以及五类备份/隔离恢复/回滚证据。恢复临时目录已清理。
- 本轮仅在 `/home/ubuntu/backups` 创建备份和清单，没有修改线上应用源、配置、数据库、对象、运行构建或服务。候选 `.koyosim-production-snapshot.json` 与候选构建来源证明仍缺失，因此没有部署；Provider unhealthy 仍阻断交易测试。
- 工作包仍为 7 项中 1 项已完成、6 项未闭环：① Provider/模型资格与白名单；② 候选源/构建快照、安全发布和回滚（五类备份恢复子门禁已通过）；③ 隔离身份、认证和余额/权益；④ 云项目/素材 owner、版本冲突、刷新/跨设备历史与下载；⑤ 图片成功、失败/取消、重复提交/超时恢复、Provider 终态、资产和积分真实 E2E；⑥ 视频/音频/文本/全景/三视图/打光/Agent/扩展动作逐项真实验收。所有未经真实线上隔离账户 E2E 的能力继续保持 `Candidate/Unknown/Disabled`。

## 2026-10-09 08:47 UTC 候选构建复核

- 08:46 UTC 再次运行 `scripts/verify-production-backup.mjs` 成功；生产 HEAD `39c02816ae2a71530177e64fce5d14ac580efa45`、源树 SHA-256 `c926dd25a9a8aceb1c3b2b7e986675989e8a88937858437b7b4df75ab545a8a7`、BUILD_ID `o3In_YauyDD0gb7JS-x4K` 与备份清单一致。五类备份与隔离恢复/回滚证据均有效。
- 08:47 UTC 公网 `/api/ready` 仍为 503 `not_ready`、Provider unhealthy，数据库、迁移、Worker、Storage、Email healthy。
- 在 `/home/ubuntu/backups/canvas-candidate-20261009T084500Z` 从源码备份建立候选，并仅叠加两个已审核的模型路由健康时效过滤文件。没有改生产目录；依赖安装使用候选副本。
- 候选 `npm run build` / Next.js 15.5.26 因构建主机仅约 1.9 GiB RAM、Node 堆 OOM 而退出 134。已删除候选 `.next` 与 node_modules 副本，保留源码快照；没有候选产物或 `.koyosim-production-snapshot.json`，因此发布快照门禁仍不通过。候选源码可在内存足够的独立 Linux x64 环境继续构建。
- 此轮没有部署，也没有修改线上应用源码、运行构建、配置、数据库、对象或服务。工作包仍是 7 项中 1 项已完成、6 项未闭环；备份子门禁已过，但候选构建、Provider/模型资格、隔离身份/云数据验收、图片交易与其它模态验收未完成。

## 2026-10-09 08:49 UTC 本地模型门禁回归

- 主站 `tests/model-pricing-routing.test.mjs`：18/18 通过。
- Canvas `tests/p3/canvas-model-config.test.mjs`：使用 Node `--conditions=react-server` 后 2/2 通过；该条件是测试服务端专用模块所需的运行环境。未更改应用代码或用户工作树。
- 这两组离线测试验证模型资格过滤与 Canvas 模型配置契约，不构成 Provider 可用、认证、真实生成、计费/退款或云历史的证据。总体工作包进度仍为 1/7 已完成、6/7 未闭环。

## 2026-10-09 09:07 UTC 部署请求与候选资源复核

- 用户明确授权推送部署。重新确认线上：Canvas 页面 200，`/api/live` 200，`/api/ready` 503 且只有 Provider 状态 unhealthy；Canvas Session 匿名 401 并返回精确 Origin CORS，OPTIONS 204。生产 HEAD `39c02816ae2a71530177e64fce5d14ac580efa45`、BUILD_ID `cCjh7dGANqkPr5fslqKG9`、Canvas 路由 11 个、工作树状态计数 517。
- `/home/ubuntu/backups/koyosim-canvas-release.json` 记录旧 BUILD_ID `o3In_YauyDD0gb7JS-x4K`；09:05 UTC 当前校验器以“production source or build changed after the backup snapshot”拒绝。当前树 SHA 为 `7d4d6b28c3c4d54ec9e0bed26f8819ebcba63a2b560185177f8c78fce42f639b`，不匹配旧清单的 `c926dd25a9a8aceb1c3b2b7e986675989e8a88937858437b7b4df75ab545a8a7`。
- 在候选构建时间窗内，生产源码 `app/admin/system/login/page.js`、`app/admin/providers/*`、`lib/admin/navigation.js`、`app/admin/system/login/SocialLoginPanel.js` 有新修改，生产 `koyosim.service` 于 09:01:04 UTC stop/start。变更来源未知；记录为并发源树/运行构建漂移，不覆盖、不回滚、不归因给用户或其它进程。
- 为解决旧的构建 OOM，在备份目录候选副本临时试用 Next 官方 `webpackMemoryOptimizations`。850 MB Node heap 受限构建以 V8 heap OOM 失败；1 GB heap、1.25 GB cgroup/256 MB swap 的构建达到内存限制并阻塞。已停止其 systemd unit，确认 inactive/dead，清理候选 `.next`/`node_modules`、还原临时配置；候选 BUILD_ID/快照 marker 仍不存在。公开页面 `/api/live` 在构建过程中持续可达，`/api/ready` 仍 503。未调用部署脚本、没有向生产应用树/配置/DB/对象执行写入。
- 当前部署不放行：备份不能验证当前线上状态，候选没有 Linux x64 构建，生产部署后置检查要求 `/api/ready=200`，现值 503。下一步需要确认并冻结目前生产并发变更，完成当前版本的五类可恢复备份，并指定独立高内存 Linux x64 builder；随后才能重新构建、生成 snapshot marker 并运行部署前验收。认证用户、明确消费上限、真实图片成功/失败/幂等及账本 E2E 均未验收。

## 2026-10-09 09:37 UTC 部署与线上版本复核

- 线上 `https://canvas.koyosim.com/canvas` 为 200，响应当前静态资产 `index-D0tjSC91.js`、`index-B4mM0CrD.css`；两者 SHA-256 与 Canvas 客户端仓库 Server Mode Vite 构建产物逐字节一致。前端产物已在线，不应重复部署。
- Canvas 客户端 `pnpm --dir web typecheck` 通过，Server Mode Vite 生产构建通过；存在既有 chunk 与动态/静态导入警告。Bun 未安装，`bun test` 专项测试未运行；真实账户与生成交易也未测试。
- 最新公网 `/api/ready` 返回 503，`providers=unhealthy`；这阻断后端安全发布流程。生产备份校验用 `sudo -n` 再次通过，HEAD、BUILD_ID、源码树摘要与五类可恢复备份匹配。
- 只读检查发现本地后端发布入口普通 SSH 用户无法读取生产 root-only 源文件。本地 `scripts/deploy-canvas-safe.sh` 的校验器调用已改为 `sudo -n`，语法检查通过；未启动部署脚本，也未改线上应用、配置、数据库、对象或服务。
- 09:40 UTC 公网即时复核：`/api/live=200`；正确 Origin/标记的匿名 Canvas Session `401` 且 ACAO 精确，OPTIONS `204`；`/api/ready=503`，Provider unhealthy。备份清单由 `sudo -n` 再验证通过。

## 2026-10-09 09:49 UTC 账户隔离与当前候选

- 现有线上前端已包含先前接好的 KoyoSIM 图片 quote/job/poll/Asset 流程；当前公开页面仍加载旧构建。新修复只针对云素材/历史异步读取跨账户切换竞态：未交付前检查会话 owner，避免触发旧账户文件下载、节点插入；切换发生于本机预览写入期间时清理未提交文件。
- Canvas 客户端类型检查、Server Mode Vite 构建通过；独立 owner guard 的 Vite SSR 隔离用例 3/3 通过。Bun 未安装，完整 Bun 测试套件未运行。新候选未部署，因此线上仍待双账户浏览器复验。
- 09:48 UTC 生产复核：页面 200、`/api/live=200`、Session 401 + 精确 CORS、OPTIONS 204、`/api/ready=503` 且 Provider unhealthy。生产 HEAD/BUILD_ID/517 项 dirty 状态/11 条 Canvas 路由与五类备份再次核对一致。没有生产写入。
- 下一步应先恢复 Provider 映射、真实有效价格和健康资格以满足 `/api/ready=200`；之后准备新的静态客户端备份及候选发布路径，部署本地账号切换保护，再运行双隔离账户和真实图片交易验收。未经真实交易闭环的图片能力不标记 Verified。

## 2026-10-09 10:02 UTC 账户页契约复核

- 主站生产源码显示 `/api/billing/orders/my` 返回格式化 `amount`、`plan`、中文 `status` 与 `createdAt`；额度流水字段为 `delta/reason/action_type/created_at`；活跃统计字段为 `activeDays/totalCredits`。Canvas 候选已按此接口契约对齐，原前端字段错配会产生 `NaN` 金额、无效时间和错误的今日生成次数。
- 修正账户页在接口异常时的错误状态、未知余额显示和账户切换 remount。修正 OAuth origin 精确校验、登录后以服务端同一 user ID 确认成功，取消注册条款默认勾选。
- 主站本地未跟踪 `/api/billing/usage/route.js` 候选去掉静默 catch 和 0 假值；wallet/ledger 读失败返回 503，没有钱包分桶时返回 null。该变更没有部署。
- 客户端及服务端均仍是 Candidate；没有已登录浏览器实测。生产 `/api/ready=503`（providers unhealthy），无法满足发布门槛；不得将静态 UI 构建或匿名接口探测标成真实账户/商业闭环验收。

## 2026-10-09 10:05 UTC 推送失败与部署状态

- Canvas 候选 `a640b3b` 保存在本地 `koyo-canvas-ui-i18n` 分支。Bun 24/24、TypeScript、Server Mode 构建与主站额度 API 语法检查通过；构建仍有既存 chunk/import 警告。
- GitHub 对推送返回 HTTP 403，当前凭据没有目标仓库写权限；没有远端分支更新。没有尝试绕开远端权限。
- 公网 `/api/ready=503` 且 Provider unhealthy，`canvas.koyosim.com` 仍加载旧的 JS/CSS；候选没有部署，生产没有写入。账号登录/双账号、真实图片任务、账本、跨设备历史等验收仍未完成，状态保持 Candidate。

## 2026-10-09 10:22 UTC 冻结备份与当前阻断

- 用户确认冻结已知源码变更并重做备份。新五类备份位于 `/home/ubuntu/backups/canvas-release-20261009T102218Z/`，捕获 `2026-10-09T10:22:20Z`。HEAD `39c02816ae2a71530177e64fce5d14ac580efa45`、BUILD_ID `Yd01yW5kLy6QwyGF9wv7q`、dirty 计数 526、源树摘要 `7b7285fcf9e0db937e051f903ff86c753ecaf40afce269434d06b4d3f51e213c` 前后匹配。
- 五类隔离恢复和清单校验通过：源码 7,305 文件；配置 149 个归档条目；数据库恢复到临时隔离库并读回 27,223 行后删除；对象 130 个；构建 BUILD_ID 匹配。旧 canonical 清单已另存，当前清单 `/home/ubuntu/backups/koyosim-canvas-release.json` 通过本地同版本校验器复核。未对应用、数据库、配置、用户对象、构建或服务写入。
- 公网 Canvas 200、主站 `/api/live=200`、`/api/ready=503`（Provider unhealthy）。Canvas 仓库候选 `a640b3b` 有本地构建与测试证据，但 GitHub 推送被 403 拒绝，前端仍未部署。后端候选构建/快照与真实隔离账户商业 E2E 缺失。
- 本地主站报价候选现对订阅读取错误 fail closed；指定 Node 测试 10/10 与语法检查通过，但测试只覆盖代码契约，没有验证运行时服务/数据库。该候选未部署。
- 融合完成仍需：①修复可见模型的真实 Provider mapping、价格及健康，令 `/api/ready=200`；②解决仓库推送权限并生成/验证 Linux x64 候选，按安全门禁发布；③真实认证、双账号与跨设备云数据验收；④隔离账户完成图片成功/失败/取消/幂等、Provider 终态、存储/历史/下载及扣退积分闭环；⑤视频、音频、文本、全景/三视图/打光/Agent 等逐项验收。未通过项继续标记 Candidate/Unknown/Disabled，不视为已完成。

10:24 UTC 即时复核：`/api/live=200`、Canvas 页面 200，`/api/ready=503`、Provider unhealthy；公网仍引用旧 JS/CSS。已重新校验新鲜 canonical 备份，前端候选没有发布。

## 2026-10-09 10:34 UTC 最新生产状态与图片链路审查

- 新线上源树与构建再次漂移：HEAD `39c02816ae2a71530177e64fce5d14ac580efa45` 不变、dirty 526；源树 SHA-256 `dd50bf7ca263b0a660aef3d815e851bbbf4c25dcf9b47484d0cc8b0b4c2b0923`、BUILD_ID `om1ROBUzYLkFrZtnIewSF`。线上 source 的 Canvas quote route 与本地主站候选逐字节哈希相同；编译 route 有 fail-closed 错误文案。源树/构建改变来源未知，不能据此推断完成或认可交易。
- 新鲜五类备份 `/home/ubuntu/backups/canvas-release-20261009T103217Z/` 及 canonical 清单校验通过：源码 7,305 文件、配置 149 项、数据库隔离恢复 27,241 行、对象 130 个、构建 ID 匹配。该清单覆盖当前 build。
- Canvas 客户端源码审查：图片生成入口（新建后继图、对选中图编辑、节点提示词生成、批量备选和重试）均调用 `requestCanvasImage`；线上 Server Mode 分支再调用 KoyoSIM quote → job → poll canonical result → owner-scoped asset。插件 AI host 在 Server Mode 拒绝本地 Provider 调用，requested model 找不到时返回空并阻止提交，不回退首个模型。该路径仍是源码/隔离契约证据，公开静态客户端尚未更新。
- 本轮新增真实模块执行的 Vite SSR 回归 4/4：不回退不可用模型；拒绝报价后不建 job；Provider failed 终态不读取或伪造资产；成功路径核对 owner/model/quote idempotency、job idempotency、规范任务详情与 image asset。TypeScript 通过；Bun binary 不在本环境，Bun suite 未执行。上述用例使用隔离模拟响应，不代表真实 Provider、存储或积分验收。
- 10:34 UTC 公网：`/api/live=200`、Canvas 页面 200，`/api/ready=503`（Provider unhealthy）；匿名六类 Canvas API 为 401，正确 Origin jobs OPTIONS 为 204；44 个模型中 1 个 auto-route eligible，生产 E2E 白名单没有配置；Canvas 仍加载旧 JS/CSS。
- 仍未通过：Push 权限、Canvas 前端部署、真实账户登录/余额、Provider route 和价格、图片任务完整扣退/历史/下载、双账户/跨设备；视频、音频、文本与扩展动作保持 Unknown/Disabled。

## 2026-10-09 10:42 UTC 备份复核与云项目恢复竞态

- 10:37 UTC 服务端备份校验再次通过，生产 HEAD/BUILD_ID/源码摘要仍匹配 `/home/ubuntu/backups/canvas-release-20261009T103217Z/`，五类归档和隔离恢复证据完整。生产应用目录没有被本轮写入。
- 10:40 UTC `/api/live=200`、`/api/ready=503`（Provider unhealthy）、Canvas 页面 `200`。安全发布流程要求冻结快照、Linux x64 Next 构建和 readiness `200`；条件未满足，未发布。
- Canvas 本地候选现在阻止云项目恢复过程中的账号切换：素材下载和 IndexedDB 写入前后检查原用户，切换后不导入或打开项目。类型检查与 Server Mode 构建通过；SSR 隔离回归验证两种切号取消及账号保持不变恢复。Bun 未安装，专项 Bun 用例未执行，双账号线上验收仍待完成；更改未推送/部署。
- 10:43 UTC 用户指定 Canvas 页面 `200`，仍加载生产 `index-D0tjSC91.js` / `index-B4mM0CrD.css`；本地包 `index-DLnKfRhn.js` / `index-obs6VlO9.css` 未部署，`/api/ready=503`。
- 完整融合仍未通过真实登录、模型路由/价格、Provider 终态、对象和历史回读、积分扣退、双账号/跨设备等门禁。生产 `ready=503` 和 GitHub 推送权限问题仍阻止发布；不标记为 Verified。

## 2026-10-09 10:55 UTC 图片生成账户绑定复核

- Server Mode 图片生成现把请求绑定到发起账户：同步前、服务层刷新会话后、上传参考素材后、报价确认前后、job 完成后及节点结果提交前均检查当前用户和项目所有者。身份变化时不创建后续任务或不交付旧结果；如本机临时预览已写入，则删除它，幂等键保留供原账户恢复。
- 类型检查、Server Mode Vite 构建和 Node + Vite SSR 账户守卫验证通过；Bun 测试未运行，双账号与真实生成线上验收未完成。该证据不能证明 Provider、资产历史或积分交易已成功。
- 10:54 UTC 生产五类备份仍与线上 HEAD/BUILD_ID/源码树一致；Canvas `200` 仍引用旧资产，`/api/ready=503`（Provider unhealthy）。不具备发布和真实交易放行条件。


## 2026-10-09 11:06 UTC Canvas 静态前端已上线

- 前端提交 `3a8a1aa6c70318f120a5b78b5d96198c8d440375` 已直连发布到独立静态目录；发版前的 76 文件备份通过隔离恢复比对，旧 `index.html` 和旧哈希资源可回滚。运行时配置未变。
- 线上首页引用 `index-DGXNEaem.js` / `index-obs6VlO9.css`，异步 chunk、JS、CSS 均公网 HTTP 200，内容 SHA-256 与构建一致；Chrome 新标签页确认 Canvas 项目库已渲染。旧 Jimeng 页面未被覆盖。
- GitHub push 仍被 403 拒绝；没有改动主站 Next 服务。`/api/live=200`、匿名 Canvas Session `401`，`/api/ready=503`（Provider unhealthy）。未登录到新账户、未创建付费任务、未触发扣费。
- 已完成的是客户端发布；真实用户生成、报价与 Provider 终态、Asset/历史/下载、积分结算、双账户和跨设备验收仍未完成，完整融合保持未完成。

## 2026-10-09 13:20 UTC 恢复对话后的只读续核

- 即梦精确项目 URL 在独立标签打开后显示“登录以打开您的画布”。本轮按任务边界未登录、未点登录、未更改参考项目；因此此前记录的节点/菜单观察仅作历史线索，本轮没有新的即梦交互证据。
- 公网只读探测：`https://www.koyosim.com/api/live` 为 200；`/api/ready` 为 503，返回 `database`、`migrations`、`worker`、`storage`、`email` 正常而 `providers=unhealthy`；`https://canvas.koyosim.com/canvas` 为 200。
- Canvas 页面仍引用 `/assets/index-DGXNEaem.js` 和 `/assets/index-obs6VlO9.css`。线上响应与 Canvas 仓库 `web/dist/assets/` 对应文件 SHA-256 一致（JS `76b25554ec4bbffec39191ac06c879cc6765fc50682c18c3362ad6b059d86d73`；CSS `7c7aebce4bafa6c0767a85c3aada0d2c83c3c4bf9ae85fc46839f1c6e19a2603`）；客户端仓库为干净提交 `3a8a1aa`，这只证明静态文件与该提交一致。
- 当前浏览器原有 KoyoSIM 标签在 `/prompts` 提示词中心；可见本地 Agent 未连接。没有切换路由或触发画布/Agent 操作。
- 融合状态不升级：客户端代码提交已在线，但认证后的报价、任务、Provider 终态、资产、历史、下载、积分结算以及双账户隔离均未实测；保持 `Candidate`。模型生成能力与即梦专属动作保持 `Unknown/Disabled`。主站既有未提交改动原样保留；本轮未部署、未向生产写入。

## 2026-10-09 13:22 UTC SSH 元数据补查

- 按本机规则清除代理后直连 SSH，只执行只读元数据查询。生产源码 HEAD 为 `39c02816ae2a71530177e64fce5d14ac580efa45`，运行 Next `BUILD_ID=zinizzeiBZFtGSeEWTS2i`；与较早文档所记 BUILD_ID 不同，说明历史构建快照不可直接当作当前状态。
- `git status` 因远端 `.git/index` 权限拒绝不能读取，备份清单文件存在但对当前 SSH 用户不可读，故本轮无法确认生产脏文件数或该备份是否匹配当前 BUILD_ID。没有绕过权限，也未读取凭据或生产业务数据。

## 2026-10-09 13:28 UTC 本地 Canvas 服务端候选源码复核

- 只读逐项检查主站候选的 11 条 `/api/canvas/**` 路由及模型策略：模型目录/报价/任务均依赖显式 Canvas 挂载与 `CANVAS_E2E_VERIFIED_MODEL_IDS`；报价和任务要求登录身份与请求 owner 一致；任务还要求认证账户拥有云项目和目标节点、有效服务端 quote，并按任务 owner 校验 `koyo-asset:<id>` 参考素材。任务创建时通过 `onTaskCreated` 事务关联云项目节点。客户端 Server Mode 门控仅允许图片能力、有限图片动作，并拒绝浏览器直连 Provider。
- 上述均为当前本地源码检查，主站相关目录仍是未跟踪候选且位于约 733 项脏状态的工作树中；本轮没有改动应用文件、运行单测或构建，也没有将主站候选提交/打包为独立补丁。Canvas 客户端仓库仍干净，线上静态文件仅能证明等同于已发布提交。
- 线上 `/api/ready=503` 且生产 E2E 白名单无法从当前 SSH 账号读取，故无法确认任何模型当前可收费开放。报价、Provider 终态、资产回读、历史/下载、扣退积分及双账户隔离继续未验证，保持 `Candidate/Unknown/Disabled`。

## 2026-10-09 13:29 UTC 旧服务端补丁适用性检查

- 主站已有未跟踪 `KOYOSIM_CANVAS_SERVER_PATCH.patch`，配套说明记录的是 2026-09-30 的另一生产快照。仅执行 `git apply --check`（未应用补丁）即失败，多处 Canvas API、服务、迁移与测试文件上下文不匹配，另有目标文件已存在。
- 该补丁不能作为当前工作树的可直接应用候选。原补丁及配套文档原样保留；本结论只覆盖当前本地主站工作树，不推断其能否应用到生产源树。
