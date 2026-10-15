# 即梦创作流程 × KoyoSIM Canvas 完整开发方案

## 2026-10-15 执行方向修正（覆盖下方历史路径和顺序）

当前运行中的 KoyoSIM、Worker 与 Supdance 服务共用 `/home/wwwroot/AI/domain/supdance.com/web`；`/home/wwwroot/AI/domain/koyosim.com/web` 已不是主站 Git 源码树。执行前只在实际生产写入或发布边界确认这一路径、当前构建和漂移；下方旧路径、HEAD、脏文件数、BUILD_ID、备份匹配结论均为历史快照。Canvas 静态客户端仍须单独确认其实际站点目录。

先只推进图片 P0 的**下一个具体缺口**：指定模型的合法路由、真实成本/终态 → 图生图成功与失败释放 → 结果节点、云资产、历史和下载 → 幂等及账户隔离。已有的文生图记录可复用，不重复收费；其 Provider task ID、成本对账及独立下载证据未补齐前，不把该动作整体标为 `Verified`。视频、音频和扩展动作随后逐项开放。

每轮只做一次与当前缺口直接相关的代码改动和定向验证；状态未变时不重复全量盘点、重跑同一构建、重构无关模块或重报旧结论。生产状态变化及发布边界保留必要的短检查。构建必须使用冻结源的独立目录，不删除或占用共用服务正在使用的 `.next`。先在有恢复点的隔离入口发布候选以完成真实账户验收；图片 P0 的终态、资产、历史、下载和积分通过后，才逐模型向普通用户开放。收费任务沿用已授权的单笔 30 积分、累计 300 积分上限；状态不明时查原任务，绝不盲目重发。

状态：**截至 2026-10-11 21:40（Asia/Taipei）的只读线上复核，完整融合仍未完成。生产 HEAD `39c02816ae2a71530177e64fce5d14ac580efa45`，`git status --short` 578 行，BUILD_ID `RPf47wofgu89YhaGdRdwV`，运行 Canvas API 路由 11 条；`/api/ready=503`，Provider unhealthy；44 个 active model 中 2 个 `autoRouteEligible`。Canvas 线上 JS/CSS 与客户端当前 `web/dist` 字节一致，但认证后的生成、资产、历史、付款和积分闭环仍未验收。10 月 9 日备份及构建匹配结论仅适用于当时快照；当前备份清单对只读 SSH 账号不可读，不能认定与现行 BUILD_ID 匹配。**

## 2026-10-11 完整融合剩余执行计划

### 完成定义与当前边界

“完全融合”指同一个 KoyoSIM 用户在 Studio 与 Canvas 共用身份、订阅/充值权益、余额、服务端模型目录与报价、任务和积分账本、私有素材、项目及历史；从创建到失败释放或成功结算都能在刷新和另一设备上找回。每个开放动作须有内部模型 ID、准确参数和价格、实际 Provider 终态、归档 Asset、历史/下载和一次且仅一次的积分结算证据。没有经授权的 Provider API、有效成本或真实验收的动作保持 `Unknown/Disabled`；若它仍属于本计划目标，整体任务不得因此报完成。

已证实的局部结果只有静态客户端资源上线并与本地构建文件一致、11 条运行 Canvas API 路由存在、匿名请求被拒绝、正确 Origin 的预检可达。`/api/ready=503`、44 个模型和 2 个 `autoRouteEligible` 都不能证明任何模型可供普通用户完成交易；当前线上 E2E 白名单有效值尚未核实。此处的 10 月 11 日数值为时间点快照，执行前重新读取生产状态。

### 剩余工作包及放行证据

| 顺序 | 工作包 | 必须交付并验收 |
| --- | --- | --- |
| 0 | 冻结生产事实与恢复点 | 以当前运行服务指向的 `/home/wwwroot/AI/domain/supdance.com/web` 完整工作树为权威；仅在生产写入/发布边界核对 HEAD、漂移、BUILD_ID、路由和五类备份/恢复证据。冻结对应快照，在独立 Linux x64 目录生成可溯源候选和回滚包，不触碰运行中的 `.next`。备份目录存在本身不算通过。 |
| 1 | Provider、模型与真实价格 | 对所有拟对外开放的图片/视频/音频/文本模型逐项核对内部 ID、官方或获授权 Provider 产品、endpoint/参数、凭据状态、健康、成本单位、有效价格和路由；先修复或下架导致 Provider unhealthy 的可见模型，使 `/api/ready=200`。采用受控测试入口验证真实成功/失败，普通用户白名单只在通过后开放；成本未知记待对账，不能按 0 结算。 |
| 2 | 同一账户的商业 API | 登录后 Canvas 与 Studio 的 user ID、订阅、可用积分一致；Session、Cookie/CORS、写请求校验、报价、变价重报、幂等 job、owner 拒绝和登出清理均在线验证。隔离身份按明确消费上限逐项验证对外开放的订阅、充值和支付方式到账；未验收的支付入口保持关闭，结账不可用时商业 READY 保持失败。 |
| 3 | 云项目、引用素材与历史 | Server Mode 的项目/节点/连线先持久化再允许生成；409 冲突不覆盖内容。素材上传取得服务端 Asset ID，图生图引用仅使用当前用户资产；归档、历史和下载均按 owner 授权。验收刷新、跨设备、同用户多标签、账户 A/B 隔离、切号中的异步响应及故障恢复。 |
| 4 | 图片 P0 真实交易 | 文生图和图生图都从服务端 quote → 同一幂等 job → Router/Provider → 终态 → 私有 Asset → 结果节点/连线 → 历史/下载 → 积分账本完成。分别覆盖成功、失败、取消、超时、重复提交、断网恢复、报价过期和余额不足；追查原任务 ID，不以新任务或空节点伪装恢复。 |
| 5 | 视频、音频、文本与扩展动作 | 在图片 P0 通过后，逐动作重复模型身份、参数、报价、Provider 终态、资产、历史、积分和失败释放验收。全景、三视图、打光、智能改图、镜头设计、Agent 只在各自有真实服务端执行与权限证据后开放；无法取得合法路由的项目保留未完成状态及明确阻断原因。 |
| 6 | 受控测试发布与最终开放 | 图片 P0 线上验收前，先将独立候选部署到有恢复点的隔离测试入口，再用授权账户验证真实任务；图片 P0 验收后才逐模型向普通用户开放。切换前校验冻结源、五类备份/恢复、候选 BUILD_ID 与 Canvas 路由；切换后检查 readiness、服务端交易及账本。保留旧构建和回滚路径，发现越权、丢资产、双扣或 Provider 终态不明即关闭对应入口并按原任务对账。 |

每个工作包报告 `Verified / Candidate / Unknown / Disabled`、线上 BUILD_ID、变更文件和发布批次。真实交易证据至少包含去敏的账号 ID、quoteId、jobId、Provider task ID、projectId/nodeId、assetId、对象读取、账本记录、前后积分与历史/下载结果；只读页面、Mock、构建通过和旧记录不可替代。只有工作包 0–6 全部通过且目标动作均为 `Verified`，才标记“完全融合”。

### 可复制 AI 编程提示词

```text
请执行《JIMENG_CANVAS_DEVELOPMENT_PLAN.md》顶部“2026-10-15 执行方向修正”及“完整融合剩余执行计划”。先读主站与 canvas-web 的 AGENTS.md；改 UI 前读主站 docs/UI_DESIGN_SYSTEM.md、docs/UI_REPAIR_INSTRUCTION.md。当前主站生产权威源树为 /home/wwwroot/AI/domain/supdance.com/web，本地主站 /Users/seelucency/Documents/dev/sol im 与 Canvas 客户端 /Users/seelucency/Documents/dev/canvas-web 是候选；SSH/本地地址绕过代理直连。保护生产脏树，只在生产写入或发布边界核对当前 HEAD/BUILD_ID/漂移、五类可恢复备份与独立构建候选。

先集中解决图片 P0 的具体阻断：指定模型的合法 Provider 路由与成本 → 独立候选及受控测试发布 → 图生图成功/失败释放、资产/历史/下载、幂等与账户隔离。不要重发已完成或状态不明的任务；文生图缺 Provider ID、成本或下载证据时保留待验收。每轮交付一个直接推进缺口的改动，运行一次定向验证；状态未变时不重复全量盘点、同一构建或无关重构。线上 Server Mode 的付费入口只能调用 KoyoSIM；无合法路由或未验收动作保持 Disabled。图片 P0 达标后再逐项处理视频、音频、文本及扩展动作，并完成普通用户开放和公网复核。沿用单笔 30、累计 300 积分上限；密码、验证码和付款由用户操作。每批简报具体交付、原始证据、费用和下一阻断，不能用页面 200、Mock 或本地构建宣称完成。
```

## 2026-10-09 09:31 UTC 当前生产状态备份通过

- 用户确认近期 admin 源码修改、生产构建与服务重启为其发起或确认；按当前权威源树重新采集。源码 HEAD `39c02816ae2a71530177e64fce5d14ac580efa45`、源码树 SHA-256 `7d4d6b28c3c4d54ec9e0bed26f8819ebcba63a2b560185177f8c78fce42f639b`、BUILD_ID `cCjh7dGANqkPr5fslqKG9` 与备份前后复核一致。
- 五类备份位于 `/home/ubuntu/backups/canvas-release-20261009T092144Z/`：源码 76,354,749 字节、配置 36,624 字节、数据库 1,804,653 字节、对象 28,304,292 字节、构建 16,538,364 字节。隔离恢复证据：源码 7303 文件且树摘要匹配；配置 100 文件及 20 个符号链接逐项匹配；数据库恢复到隔离临时库并读回 979 行后删除；对象 130 文件逐项 SHA-256 匹配；构建 BUILD_ID 一致。
- `scripts/verify-production-backup.mjs` 对新清单完整复核通过：`/home/ubuntu/backups/koyosim-canvas-release.json`，`capturedAt=2026-10-09T09:22:29Z`。旧清单副本保留为 `koyosim-canvas-release-stale-20261009T092144Z.json`。一次隔离恢复因临时数据库口令匹配范围不正确而挂起；只终止该隔离恢复进程并删除临时库，随后使用适用于临时库的凭据文件重试通过，未修改生产业务库。
- 用户目前没有独立构建机。仓库 CI 使用 `ubuntu-24.04`，但本地主站仓库没有配置 Git remote，无法将脏的权威生产树安全送入 runner。没有候选 marker 或成品。部署仍不放行：公网 `/api/ready=503`，真实图片任务、报价和账本闭环尚未验收。

## 2026-10-09 09:16 UTC 只读 Provider 阻断诊断

- 通过只读 PostgreSQL 查询复核 readiness 所用的核心、可见、已定价模型范围：没有任何 Provider mapping 的模型为图片 6 个、视频 5 个、音频 1 个、文本 4 个。仅图片和视频 11 个无路由模型就足以让全局 Provider readiness 返回 unhealthy；不应靠调整门禁掩盖。
- 另发现 3 条 RunningHub 视频 mapping 没有有效价格版本，覆盖 3 个模型；OpenAI 图片 Provider 当前 `health_status=degraded`（3 条 mapping、2 个模型）；Luma 与 Runway 的最近健康记录分别约 6.0 天、10.6 天前。多类 Provider mapping 处于禁用或配置不完整状态。以上是诊断证据，不代表有真实可用的 Canvas 模型或可收费交易。
- 诊断只读、未读取或输出任何凭据，也未写数据库。当前服务公网仍为 Canvas 200、`/api/live=200`、`/api/ready=503`；生产树两次快照稳定于 HEAD `39c02816ae2a71530177e64fce5d14ac580efa45`、漂移计数 517、BUILD_ID `cCjh7dGANqkPr5fslqKG9`，但没有确认其变更操作者，也没有用当前状态完成全量恢复备份。
- 已向用户询问生产源码/构建变更是否已确认，以及独立 Linux x64 构建机或最高临时预算；等待回复期间不切换生产源码或构建。

## 2026-10-09 09:07 UTC 部署请求后的复核

- 用户已授权推送部署，但安全入口仍需匹配当前线上状态的五类备份、隔离恢复、候选快照、Linux x64 成品及 11 条路由；远端部署脚本还要求切换后 `/api/ready=200`。当前 `/api/ready=503`，不能启动切换，否则会在中断服务后触发回滚。
- 生产 HEAD 仍为 `39c02816ae2a71530177e64fce5d14ac580efa45`，工作树状态计数 517；运行 BUILD_ID 为 `cCjh7dGANqkPr5fslqKG9`，路由清单 11 条。匿名 Canvas Session 401 且正确 Origin CORS 存在；OPTIONS 204。公开页面 200 和认证拒绝只证明入口可达，不证明登录创作。
- 旧备份清单在 09:05 UTC 被本地安全校验器拒绝：生产源码或构建在 08:34 UTC 备份后变化。线上服务 journal 显示 09:01 UTC 曾停止并启动；源树在 08:53–08:59 UTC 出现 admin 登录配置文件变更。操作者与变更原因未知，不能用旧快照覆盖或回滚。没有对生产应用目录、配置、数据库、对象或服务执行写入/切换命令。
- 候选复试只改备份目录的临时源码副本，使用官方 Next.js 15 低内存 Webpack 优化配置；第一次受限堆 850 MB 后在约 831 MB heap OOM。第二次 1 GB heap 的候选构建达到 1.25 GB cgroup 内存和 256 MB swap 限制，出现 memcg OOM 等待；已停止候选服务并确认其 unit 为 inactive/dead、主机可用内存恢复。清除了候选 `.next` 与 `node_modules`，还原临时 Next 配置；候选 marker 与 BUILD_ID 均不存在。官方指南说明了该 Webpack 优化，但本机资源仍不足：[Next.js Memory Usage](https://nextjs.org/docs/app/guides/memory-usage)。
- 最终公网复核仍为 Canvas 200、`/api/live` 200、`/api/ready` 503（仅 Provider unhealthy）；不放行部署或真实收费任务。下一步需要先确认/冻结当前并发生产变更、为当前树完成新鲜可恢复备份，并使用独立且足够内存的 Linux x64 构建机重新生成快照。账户消费上限未取得，认证真实 E2E 也未运行。

## 2026-10-09 08:35 UTC 最新门禁状态

- 公开只读检查：Canvas 页面 200，`/api/live` 正常，`/api/ready` 503（Provider unhealthy）；数据库、迁移、Worker、Storage、Email 报告健康。匿名 Canvas API 401/方法不匹配结果只证明认证与 HTTP 方法门禁。
- 08:37 UTC 强制重跑生产 Provider readiness 只读探针：44 个活跃核心模型中 16 个有健康路由、28 个不可用；`PROVIDER_ROUTE_UNAVAILABLE`，健康记录没有过期模型，图片/视频类别均存在。RunningHub、Volcengine、MiniMax provider 汇总为 healthy；BytePlus、OpenAI、Google、Kling、Luma、Runway、Alibaba 汇总为 degraded。数据库、Worker 和存储正常，因此当前阻断集中在公开模型路由资格/供应商状态；不能仅凭这次聚合结果开放任一模型。
- 08:39 UTC 生产路由只读诊断：所有被检查供应商适配器均存在；OpenAI、Luma、Runway 没有可用凭据，其它列出的供应商凭据状态为已配置（只读取布尔值，不显示凭据）。部分 provider mapping 没有 active、可路由价格版本：Alibaba 8、BytePlus 10、Google 5、Kling 27、MiniMax 8、RunningHub 63、Volcengine 1。计数单位是 route mapping 行而非模型数；不据此补造价格，需核对供应商实价及对应路由。
- 生产 HEAD 与 BUILD_ID 未变。源码在 08:26 UTC 的首次备份后出现 `middleware.js` 修改；没有覆盖它，而是重新归档最新源树并将线上与隔离恢复摘要比对为 `c926dd25a9a8aceb1c3b2b7e986675989e8a88937858437b7b4df75ab545a8a7`。当前工作树计数 2487，须保留所有脏改动。
- 五类备份现均有独立隔离恢复证据：源码 7302 文件、配置 94 项、数据库隔离恢复查询 979 行、对象 130 个且 28,733,681 字节逐文件摘要一致、构建 BUILD_ID 一致。正式备份清单由 `scripts/verify-production-backup.mjs` 对当前 HEAD/源码树/BUILD_ID 与全部备份、恢复及回滚证据校验通过。临时恢复目录已清理。
- 本轮只写入服务器备份目录，未改生产应用源码、配置、数据库、对象、构建或服务。安全发布仍缺候选快照/候选构建来源证明；Provider unhealthy 也继续阻止图片真实交易验收。
- 7 个工作包中只读线上基线检查已完成；仍有 6 个工作包未闭环：① Provider/模型资格与可用白名单；② 独立候选源/构建快照、安全发布与回滚（五类备份恢复子门禁已通过）；③ 隔离身份、认证、余额/权益核对；④ 云项目/素材 owner、版本冲突、刷新/跨设备历史与下载；⑤ 图片成功、失败/取消、重复提交/超时恢复、Provider 终态、资产和积分真实 E2E；⑥ 视频/音频/文本/全景/三视图/打光/Agent/扩展动作逐项真实验收。

## 2026-10-09 08:47 UTC 候选构建复核

- 再次执行生产备份门禁，HEAD、当前源树摘要、BUILD_ID 和五类备份均匹配；公网 `/api/ready` 于 08:47 UTC 仍为 503，Provider unhealthy，其余核心依赖健康。
- 在 `/home/ubuntu/backups/canvas-candidate-20261009T084500Z` 从最新生产源备份建立独立候选，只叠加本地已审核的 model health freshness 过滤文件；未改生产源树。候选依赖使用独立副本，避免构建触碰生产 `node_modules`。
- `npm run build` / Next.js 15.5.26 在服务器约 1.9 GiB RAM 条件下因 Node 堆 OOM 以 134 退出；候选 `.next` 和 node_modules 副本已清理，保留候选源码以供更大内存 Linux x64 构建机续跑。没有候选 BUILD_ID、快照 marker 或可发布产物；不宣称构建通过。
- 本轮没有部署或改写生产应用、运行构建、配置、数据库、对象。发布工作包仍未完成，需有足够内存的独立 Linux x64 构建环境并通过候选快照校验；备份恢复子门禁保持通过。

## 1. 目标与边界

用户在同一 KoyoSIM 身份下完成：打开云端画布 → 上传/选中素材 → 选择**已验证可用**的动作与模型 → 看见服务端报价及当前可用积分 → 提交一次生成 → 看到 Provider 终态 → 得到归档素材和后继节点 → 刷新、跨设备在项目/历史中找回 → 下载 → 核对积分提交或释放。订阅/充值与该账户余额的一致性属于商业上线验收。

吸收即梦的**交互顺序**，沿用 KoyoSIM 的身份、模型、价格、任务、积分、对象存储和视觉规范。不复制即梦素材、会员文案或未经验证的模型能力。Canvas 保留独立 Vite/React 客户端；KoyoSIM Next.js 服务是商业数据的唯一权威。线上浏览器不得使用本地 API Key、任意 Provider URL 或本地 Agent 作为商业生成兜底。

## 2. 本轮核对所得现状

| 事项 | 当前证据 | 结论 |
| --- | --- | --- |
| 即梦参考 | 图片节点上下文动作、`+` 后继节点、右侧引用输入、资产/历史/积分面板已观察；示例生成历史为空、积分消耗为 0；智能改图弹会员限制 | 只证明交互存在，不证明生成质量或成功率 |
| KoyoSIM 画布 | 2026-10-09 01:19 UTC 页面请求 HTTP 200；本次只读复核没有用登录账号操作 UI。先前曾观察到 `Failed to fetch` 和 Agent `Disconnected`，不是本轮新验证 | 页面可打开；账号、Agent 与线上创作闭环仍未验证 |
| 主站 Canvas API | 公开 `/api/ready` 为 HTTP 503、`status=not_ready`、`providers=unhealthy`；Session/models/projects/jobs/assets/config 的匿名 GET 为 401，quotes 和 upload 的 GET 为 405（方法不匹配） | API 路由可达；未登录交易未测，Provider 健康仍阻断真实生成 |
| 生产源码与运行构建 | 2026-10-09 01:19 UTC 直连复核：HEAD `39c02816ae2a71530177e64fce5d14ac580efa45`，`git status --short` 为 548 行；BUILD_ID `TNgLPal6DP6uKN4qqO9eH` 的 manifest 含 11/11 个所需 Canvas API | 路由覆盖门通过；仍须核对冻结源、构建来源与回滚备份，不能因此直接发布 |
| 模型与 E2E 开放门禁 | `/api/models/active` 返回 44 个模型，仅 1 个 `autoRouteEligible`；只读检查 `/etc/koyosim.env` 未发现 `CANVAS_E2E_VERIFIED_MODEL_IDS` | 目录存在不能证明画布可生成；当前候选应保持无已验证模型 |
| Canvas API 源码 | 主站工作树有 11 个 route，生产运行 manifest 也有 11 个；指定 Canvas Origin 的 11 条 OPTIONS 均为 204 并返回精确允许 Origin，错误 Origin 的项目请求为 403 | 预检 CORS 通过；认证后的 Session、模型、报价、项目与资产操作尚未验证 |
| 客户端生成 | Canvas 客户端工作树的 `project.tsx` 已将多个图片生成入口接到 `requestCanvasImage` → `generateKoyoCanvasImage` → quote/job/poll/Asset；Server Mode 下还屏蔽未验证的插件型 AI 动作。生产仍是旧运行构建 | 标记 `Candidate`；本地接线、构建和单测不等于线上统一计费 |
| 客户端项目/素材 | 本地 Server Mode 候选含云项目保存/冲突恢复、云资产读写和本地资产分区；实际线上身份隔离、刷新与跨设备找回未验收 | 标记 `Candidate`，不得把静态代码当作云端闭环 |
| 云项目缓存隔离 | 新增候选按当前 KoyoSIM 用户过滤缓存云项目，并保护列表、直达项目页、选择、导出/删除、恢复与异步列表响应；同账户刷新等待会话确认，登出立即清除本地会话 | 本地单测/类型检查/构建通过；真实双账户浏览器验收未执行，仍为 `Candidate` |
| Agent | 先前浏览器观察到本地 Agent `Disconnected`；本轮未操作登录后的 Agent | 不把它包装成在线 AI 助手；线上状态仍 `Unknown` |
| 历史 | 本地和生产源码均有按用户跨项目查询的 `GET /api/canvas/jobs`；生产匿名 GET 返回 401 | 路由可达，登录后数据隔离、资产回流、历史与下载未验收 |
| 后端事务 | 本地和生产当前 `POST /api/canvas/jobs` 通过 `onTaskCreated` 将项目任务关联到 generation 事务；所选生产源文件与本地哈希一致 | 隔离库测试未运行（本地无 `TEST_DATABASE_URL`）；线上事务仍未证明 |
| 参考图解析 | 本地 Worker 代码在 `Provider.createTask` 前按任务 `user_id` 查找素材并拒绝不规范对象键；生产源 helper 还没有对象键规范校验，运行 `.next` chunk 检测到通用递归解析器，但没有发现 owner 组装层标记 | 生产 source/build 一致性未证明；Provider 收到 owner-scoped 签名素材及图生图结果未验收 |

上述线上状态会变化。每次编码、构建和发布前重新取证，不沿用此日期快照作当前证明。

## 2026-10-09 首轮继续核对与候选进展（历史快照）

### 当前只读线上证据

- `https://canvas.koyosim.com/canvas` 返回 200；`/api/canvas/session`、`/api/canvas/models`、`/api/canvas/quotes`、`/api/canvas/projects` 返回 404；匿名且带 Canvas Origin/标记的 `/api/canvas/jobs`、`/api/canvas/assets`、`/api/canvas/config` 返回 401。
- `/api/ready` 返回 `status=not_ready`、HTTP 503、`providers=unhealthy`，`database=null`；不能据此宣称数据库或其它依赖健康。
- 生产 HEAD 为 `39c02816ae2a71530177e64fce5d14ac580efa45`，脏文件数 530，运行 BUILD_ID 为 `jjfIX2rEEpzsa1n6kIOzG`，运行清单只含 4 个 Canvas 路由。
- 最新只读 Provider 探针返回 `PROVIDER_ROUTE_UNAVAILABLE`、44 个活跃模型中 16 个覆盖、28 个不可用。该详细结果由生产源树代码重新计算；源树中的 `providerSecrets.js` 与 HEAD 有未提交差异，因此仅作为诊断线索。线上 `/api/ready=503` 与 4 条运行路由是直接线上证据。
- `/home/ubuntu/backups/koyosim-canvas-release.json` 不存在；两个本地工作区均未找到 `.koyosim-production-snapshot.json`。生产模型策略文件 `lib/canvas/modelPolicy.js` 也缺失。没有生产写入或部署。

### 即梦参考页只读观察（2026-10-09）

- 浏览器中原有的即梦标签指向另一个画布项目；为避免改动原标签，在独立标签打开了用户指定的 `ac12921a-3055-4098-b3ac-c9d956122305` 页面。页面显示项目“图像创作”，24 个节点、10 条连接、房间已连接且已保存。
- 左侧工具栏提供文本、图片、视频、音频、时间线、主体、导演台、资产库和上传入口。选中图片后，快捷动作包括智能改图、720 全景、扩图、智能超清、抠图、多角度、智能打光、工具、AI 助手、全屏和下载；“创建后继节点”菜单包含文本、图片、视频、音频、时间线、主体和导演台，不兼容类型会禁用并说明原因。
- “工具”菜单包含消除笔、裁剪、宫格切分和标注；宫格切分可选 2×2 至 5×5 或自定义行列。“AI 助手”菜单可选电影级镜头设计、提示词反推和灵感。此处只观察菜单，没有执行生成或拆分。
- 选中已有图片生成节点会打开创作面板，展示参考素材、提示词、模型、比例/分辨率/数量、积分折扣及生成入口；当前页面还展示升级会员的门槛。该顺序可作为 KoyoSIM 交互参考，但模型、价格、会员权益必须从 KoyoSIM 服务端实时返回，不能照抄或硬编码即梦值。
- 生成历史面板有全部、图片、视频、音频和文本分类，并提供积分明细入口；本次打开时面板显示暂无生成历史。资产库面板可在资产/主体间切换，并按图片、视频、音频、文档筛选，支持搜索、时间和筛选条件、多选确认。没有导入素材；不记录页面中的用户提示词或素材内容。
- 点击选中图片上的“智能改图”后出现会员介绍层；未继续购买，也未发起生成。它可能是会员引导或功能门槛，本次观察不足以证明智能改图的可用性、真实报价或任务闭环，仍标为 `Unknown`。
- 只进行节点选择、菜单/面板打开与关闭；没有新增节点、导入素材、提交任务或交易。上述为页面可见事实，不等于 KoyoSIM 的模型、计费或服务端能力证明。

### 本地候选变更与验证

- `lib/services/canvasModelConfig.js` 默认模型不再自动回退到首个挂载项；未配置、撤下或失效的模型默认值变为空，要求用户明确选择。`tests/p3/canvas-model-config.test.mjs` 覆盖有效、缺省和失效默认值。
- Canvas 全局历史改为按当前 KoyoSIM 用户读取所有项目任务；记录包含所属项目名称，软删除项目的已归档历史仍可查询。历史记录的资产插入和下载继续读取服务端 owner 校验的 Asset URL。
- Canvas Server Mode 隐藏尚无专项 E2E 证据的蒙版生成、角度生成、反推提示词、超分和插件生成入口；蒙版/角度结果保留专项标记，普通生成、重试、插件入口也阻止绕行。保留已经可验证的本地裁剪、拆分、调整尺寸和查看操作。
- 参考素材链路已明确接入 Worker 的 Provider 参数：只按任务用户查找对象；对象键必须是规范存储路径，拒绝 URL、绝对路径和穿越路径；并拒绝缺失/已删除素材及非 HTTPS 结果。新增组装层回归测试，覆盖 owner ID、对象键/可见性签名参数及 fail-closed 行为。测试未访问真实对象存储或 Provider，因此只能证明本地参数转换契约，不能把图生图标成线上 `Verified`。
- 此前主站 Canvas 定向验证 22 项通过；Canvas 客户端类型检查和 Server Mode Vite 构建通过。构建有既存的 chunk-size 与动态/静态导入警告。客户端 `pnpm test` 因当前环境没有 Bun 无法执行；Node 断言验证了能力开关：Server Mode 开放范围及专项图片动作门禁。
- 本次跨模块 Canvas 定向单测 31 项通过，`npm run lint:routes` 通过。隔离数据库测试未启动：本地未配置 `TEST_DATABASE_URL`，隔离库守卫在创建数据库前拒绝运行；没有数据库写入。真实图片成功/失败、跨设备历史与下载尚未验收；生产未部署。该阶段只允许继续本地候选与隔离环境验证。

**发布门禁基线（2026-10-08，历史快照）**：`G0 完整可恢复备份 = NOT_PROVEN`；`G1 运行构建含客户端所需 Canvas API = FAIL（0/11，含 config）`；`G2 公开 Session/CORS = FAIL（404）`；`G3 客户端生成接到 KoyoSIM job = FAIL（适配器无调用者）`；`G4 参考素材 provider 解析 = NOT_PROVEN`；`G5 图片商业 E2E = NOT_RUN`；`G6 视频/音频/Agent E2E = NOT_RUN`。任一项未通过都不得把产品状态写成 `READY`。

**较早发布门禁（2026-10-09，后续复核已更新）**：当时记录 `G1=4/11`、Session/models/quotes/projects 为 404。不要将其当作当前线上状态。

## 2026-10-09 01:14 UTC 当前复核

- 浏览器公开页 `https://canvas.koyosim.com/canvas` 返回 HTTP 200；`/api/live` 为 200；`/api/ready` 为 HTTP 503，`status=not_ready`、数据库/迁移/Worker/存储/邮件健康、`providers=unhealthy`（`checkedAt=2026-10-09T01:19:34.878Z`）。
- 带 `Origin: https://canvas.koyosim.com` 和 `X-KoyoSIM-Canvas: infinite-canvas-v1` 的匿名 GET：Session、models、projects、jobs、assets、config 均为 401；Canvas Origin 对 11 条 Canvas API 路由发起 OPTIONS 均为 204。缺少 Canvas 标记/来源的请求会被拒绝；这些只证明匿名门禁与预检可达，不证明登录后数据或交易。
- 生产 HEAD 为 `39c02816ae2a71530177e64fce5d14ac580efa45`，本次 `git status --short` 计 548 行；BUILD_ID `TNgLPal6DP6uKN4qqO9eH`，运行 manifest 为 11/11。备份清单 `/home/ubuntu/backups/koyosim-canvas-release.json` 与生产目录冻结快照 `.koyosim-production-snapshot.json` 均不存在。
- 对 11 个路由和 5 个相关服务/仓库文件做了定向 SHA-256 比较：15/16 与本地候选相同；不同文件是 `lib/services/canvasAssetReferences.js`。生产 helper 已有 owner 查询包装，但缺少本地候选新增的 URL/绝对路径/反斜杠/目录穿越拒绝。
- 运行构建 `.next/server/chunks/8243.js` 可见通用递归 `koyo-asset:` 解析器，但没有 owner 包装层的错误标记；因此不能证明正在运行的构建包含生产源树中的 owner 解析路径。生产源与运行产物必须先做可验证的冻结构建一致性检查。
- 备份目录只见定时模型排程数据库导出与依赖缓存归档；完整发布备份清单仍不存在，也没有冻结生产源快照。当前发布脚本有强制备份/恢复证据与 11 路由校验，但仓库里没有自动生成完整五类备份清单的流程；未执行生产写入或部署。
- 对 11 个路由和 5 个相关服务/仓库文件做了定向 SHA-256 比较：15/16 与本地相同；唯一差异是生产 helper 缺少本地候选对象键规范校验。运行 chunk 未证明包含 owner 包装路径，生产源码与运行构建一致性仍未证明。
- 完整五类备份清单和冻结快照仍不存在；没有完整备份生成/隔离恢复流程证据。发现 `deploy.sh`、旧远端 Shell、PowerShell 和 artifact-only `deploy-safe.mjs` 可绕过新门禁。本次只在本地把 `deploy.sh` 转到 `deploy-canvas-safe.sh`，并禁用其余三个旧发布入口；尚未运行生产部署。
- 本次部署入口回归测试和脚本静态检查结果另见本文件最新阶段记录。验证仅证明旧入口拒绝/默认入口缺快照时拒绝，没有创建、恢复或演练真实备份。

**当前发布门禁（2026-10-09 01:19 UTC）**：`G0=NOT_PROVEN`（源码、配置、DB、对象、当前构建五类备份及隔离恢复/回滚证据缺失）；`G1=PASS（运行 manifest 11/11）`；`G2=PARTIAL/FAIL（Canvas 页面 200、匿名 401、11 条 OPTIONS 204；认证流程未测且 Provider unhealthy、ready 503）`；`G3=Candidate`（客户端 quote/job/poll/Asset 接线存在，线上登录和生成未验收）；`G4=NOT_PROVEN`（生产构建未证明包含 owner 解析路径，真实对象存储/Provider 未测）；`G5=NOT_RUN`；`G6=NOT_RUN`。不允许发布或宣称商业 READY。

## 3. 功能分级与显示规则

| 级别 | 功能 | 开放条件 | 未通过时的界面 |
| --- | --- | --- | --- |
| P0 | 登录、余额、云项目、图片文生图/图生图、引用素材、服务端报价、任务、结果归档、历史、下载、失败退回积分 | 每项通过第 6 节对应验收 | 显示明确的失败/未开放原因；禁用提交；不显示假余额、假成功节点 |
| P1 | 视频、音频、文本及其后继节点 | 各自模型/参数/价格/Provider 终态/存储/积分单独验收 | 保留原有本地编辑能力，但线上付费生成入口分别隐藏或标“暂未开放” |
| P1 | 右侧创作输入与节点引用 | 不依赖本地 Agent 即可调用已验证的 KoyoSIM 任务 | 本地 Agent 明确标“需本地连接”；不要出现会误导普通线上用户的可发送状态 |
| P2 | 全景、三视图、智能打光、智能改图、镜头设计等即梦启发动作 | 明确模型 ID、支持的输入/输出、参数、报价、真实结果、权限和失败处理 | 不做可点击的付费按钮、空结果或演示动画 |

能力状态只使用 `Unknown/Disabled`、`Candidate`、`Verified`。**只有线上隔离账号真实 E2E 证据才能标 `Verified`**；目录 `available=true`、健康探针、测试 Mock、旧素材和手工插入节点均不足以开放。服务端模型列表、报价和任务创建还必须通过私有环境变量 `CANVAS_E2E_VERIFIED_MODEL_IDS` 的 ID 白名单；变量缺失或为空时保持无可用模型，只有真实验收通过后才可加入。界面只从服务端可用模型与已验收能力的交集生成动作，不允许前端默认挑选“第一个可用模型”悄悄替换用户选择。

## 4. 实施阶段与文件责任

### 阶段 0：冻结事实、备份和发布门禁

1. 只读记录生产 Git HEAD、未提交与未跟踪漂移的**最新**清单、运行 BUILD_ID、Canvas 路由 manifest、DB schema/迁移、对象存储、服务状态、`/api/ready`、模型/Provider 状态。查明实际发布入口与本地、生产源树的差异。
2. 在任何生产写入前，完成新鲜、可校验且可演练恢复的源树/配置/数据库/对象/当前构建备份。记录备份位置、哈希、恢复命令和操作者；仅有 DB dump 不足以放行。
3. 从生产权威源树的冻结副本制作独立构建候选；核对源码哈希、依赖版本、迁移顺序、客户端需要的 11 个路由（含只读 `/api/canvas/config`）与 BUILD_ID。不能把本地 `sol im` 当前缺路由的构建上传覆盖生产。
4. 修正实际部署流水线：发布前检查 manifest、源树漂移和备份；切换时保留完整可恢复旧版本；失败时回滚服务、构建与需要配套回退的数据变更。2026-10-09 01:19 UTC 复核发现 `scripts/deploy.sh` 原先仍走旧打包上传流程，文档此前误称它已接安全入口。本次本地将默认 Shell 入口改为 `exec scripts/deploy-canvas-safe.sh`，并将 `remote-deploy.sh`、`deploy-to-server.ps1` 和只校验 artifact 的 `deploy-safe.mjs` 改为 fail closed。安全入口要求远端五类备份及隔离恢复/回滚证据、冻结生产源快照、Linux x64 BUILD_ID 和全部 11 个 Canvas 路由；远端脚本先在 staging 验证并保留源码/旧构建恢复点，禁止隐式数据库/渠道同步。此门禁只有离线验证；服务器没有合格备份清单或快照，**未执行发布，也未验证线上恢复路径**。

**阶段门禁**：无完整备份、构建缺路由、源码/产物不一致、迁移无法回滚、`/api/ready` 持续失败未解释时，不发布；继续离线修复与诊断。

### 阶段 1：主站 Canvas API 与账户

- 核对 `app/api/canvas/**`、`lib/canvas/http.js`、`lib/services/generationCore`、Canvas projects/assets repository：精确 Origin/CORS、`credentials: include`、Cookie、CSRF/写请求校验、owner、参数白名单、幂等、限流、报价快照和任务事务。
- 无登录 Session 是 401；API 缺失是 404；依赖故障是 503，前端分别呈现。Canvas 与 Studio 的 `user.id`、余额/订阅相同；退出后清除敏感 UI 状态。
- 模型投影只列同时满足画布挂载、当前可路由、支持目标参数并出现在 `CANVAS_E2E_VERIFIED_MODEL_IDS` 白名单中的能力；配置缺失或白名单为空时 fail closed。Provider 成本未知时记录 `pending_reconciliation`，不以 0 成本冒充已结清。

**阶段门禁**：匿名预检/401 与精确 CORS、登录 Session、模型、项目/资产 owner 拒绝测试和报价都通过后，才进入线上生成联调。

### 阶段 2：Canvas 客户端商业生成接线

主要文件：`/Users/seelucency/Documents/dev/canvas-web/web/src/services/api/koyosim.ts`、`web/src/services/api/{image,video,audio}.ts`、`web/src/pages/canvas/project.tsx`、`web/src/lib/canvas/canvas-generation-helpers.ts`、`web/src/stores/use-koyosim-store.ts`。

1. Server Mode 强制走 KoyoSIM API：先只接图片文生图、图生图。保留独立开发模式，但线上不可落入直连 Provider/脚本/本地 Key 路径。所有画布入口、重试入口和 Agent 操作入口使用同一个生成适配层。
   同时检查独立 `/image`、`/video`、`/config` 页面和低层图片/图文/视频/音频请求函数；只隐藏按钮或重定向页面不算安全，所有浏览器 Provider 调用必须在发送网络请求前拒绝，普通本地模式仍需保留原行为。
2. 发起前先将当前节点、来源连线和稳定幂等键保存到云项目，并等待服务端确认 `synced`；如有版本冲突、所有权不匹配或保存失败，阻止后续生成。服务端创建 job 时再次校验目标节点存在于已保存项目快照中。随后确认云项目及节点 ID、用户选择的模型、参考素材 owner、参数与服务端 quote；显示积分价格、余额和报价过期状态。用户确认后用稳定幂等键创建 job。价格变化必须重新确认。
3. 存储 `jobId`、`quoteId`、原节点 ID、输出节点 ID、状态及关联键；轮询/刷新/跨设备先查询原 job，再决定是否重试，禁止“超时即再创建一次”。取消浏览器等待不等于取消服务端任务或退款。
4. 后继节点只在服务端结果 Asset 可读后标成功；保留生成来源连线。结果已终态但本地保存失败时，项目显示可恢复状态，并可从服务端任务/Asset 重建；不悄悄丢失，也不重复扣费。
5. 移除 Server Mode 的静默首模型回退；模型不可用、报价失败、积分不足、内容审核、上传失败、历史读取失败均明确展示，不产生看似成功的空节点。

**阶段门禁**：静态搜索与浏览器网络记录证明所有线上付费入口只调用 KoyoSIM quote/job/asset，不发送浏览器 Provider 凭据；成功和失败的 job/积分均有一致证据。

**2026-10-09 本地候选修复**：图片生成前等待云项目自动保存，并把目标节点不存在时的服务端 job 请求拒绝为 `409 CANVAS_NODE_NOT_SAVED`。续核时发现报价在确认前过期会留下未创建任务的旧幂等键，候选已在 `QUOTE_EXPIRED` 时清除该键；拒绝报价时继续清除，轮询超时或网络错误仍保留原键以恢复原任务。本次主站 Canvas 定向测试 33/33 通过，`npm run lint:routes`、Canvas `tsc --noEmit` 和 Server Mode Vite 构建通过，Node 报价重试键断言 4/4 通过。Canvas Bun 测试因环境缺少 `bun` 未运行；真实交易验收未通过。所有修复均为本地 Candidate，尚未部署。

### 阶段 3：云项目、素材、历史与右侧工作流

- 项目、节点和连接保留当前 Canvas 数据模型；保存状态精确区分 `local / pending / synced / conflict / error`。仅服务端确认版本后显示“已同步”。409 冲突提供可恢复路径，不覆盖用户本地内容。已有本地项目迁移必须先有备份和服务端幂等证明。
- 资产库在 Server Mode 读取 owner scoped KoyoSIM Assets；上传先取得服务端 Asset ID，下载用 owner scoped content URL。按类型筛选；本地素材与云素材明确标注来源。
- 生成历史按服务端 owner scoped job 列表与 asset 关联，至少支持状态、模型、时间、积分、项目/节点和结果打开/下载。若复用既有 creations API，先核对授权和数据契约；否则补最小分页列表接口。历史记录不可只从画布快照或本地缓存生成。
- 右侧先做“选中素材 → 引用 → 已验证动作 → 参数/报价 → 提交”的普通用户创作输入。当前本地 Codex Agent 保留独立标签与真实连接状态；在线 Agent 需要自己的服务端执行、权限和真实 E2E，不能把断开的本地 Agent 命名成在线助手。
- UI 改动前遵循主站 `docs/UI_DESIGN_SYSTEM.md` 和 `docs/UI_REPAIR_INSTRUCTION.md`，并遵循 Canvas 的 `AGENTS.md` 与当前主题。检查点击、键盘、遮罩和浮层，不照搬即梦外观。

**阶段门禁**：刷新、登出/重新登录、跨设备、同用户多标签、另一用户越权、上传失败、项目版本冲突、历史恢复逐项过关。

### 阶段 4：逐能力开放

图片 P0 通过后，分别处理视频、音频、文本和 P2 工具。每个动作单独建立“内部模型 ID → 参数 → quote → router/provider → terminal → Asset → 账本 → 历史”的追踪表和上线开关。能力可回退/禁用；Provider 降级或价格未知时停止新任务，已有任务继续查原 ID 并对账。

### 阶段 5：发布和回滚

隔离构建、灰度发布、公开域名验收、观察真实任务和积分；保留旧构建、源配置与恢复路径。发布顺序先主站 API，后 Canvas 客户端，最后按能力开关开放。若主站 API 404/503、身份或计费不一致、资产丢失/越权、Provider 终态不明、重试双扣，立即关闭对应生成入口并回滚；保留原任务 ID 继续对账，不通过新任务掩盖故障。

## 5. 防伪功能规则

1. **按钮**：没有已验证 route/model/price/provider 的动作不出现为可付费按钮；已知不可用可显示“暂未开放”，点击不得创建假节点。
2. **状态**：Loading 来自真实 job；Success 需要服务端 terminal、可读归档结果与一致账本；Failed/Cancelled 需要真实终态与释放/退款记录。HTTP 200、目录项、静态缩略图、Agent 文案不算成功。
3. **金额**：报价和余额只取服务端；实际 Provider 成本未知时显示“待对账”，不能写 0。积分提交/释放须按一个 job 幂等，历史与账本可互相追踪。
4. **引用**：只提交所属用户 Asset ID；不把外部 URL、data/blob、大段 base64、API Key 或 Provider 配置写进云项目或任务参数。
5. **Agent**：本地断线就显示断线。Agent 不得宣称任务完成，除非同一 job 的服务端终态和资产已查实。
6. **测试**：Mock/单元测试可以验证逻辑，不能把功能从 `Candidate` 提升为 `Verified`。用户可见“可用”必须有线上隔离账号 E2E。

## 6. 严格验收矩阵

每次验收保存 UTC 时间、前后部署 BUILD_ID/提交、测试账号匿名 ID、浏览器录屏/网络请求 ID、quoteId、jobId、Provider task ID、projectId、nodeId、assetId、对象读取结果、前后积分、账本记录 ID、历史与下载证据。日志去敏；不保存密码、Cookie、Token、支付数据。

| 场景 | 必须看到 | 不通过时处理 |
| --- | --- | --- |
| 匿名/CORS | 允许 Origin 的 OPTIONS 正确；匿名 Session 401；错误 Origin 拒绝；不泄露用户数据 | 关闭入口，修 API/构建 |
| 登录/权益 | Canvas 与 Studio 同 user ID、订阅和余额；退出后无法读取原项目/素材 | 停止生成 |
| 模型/报价 | 模型身份、能力、参数、路由、价格一致；过期/变价重报 | 禁用该模型 |
| 图片成功 | 一次 quote → 一次 job → Provider 成功 → 私有 Asset 可读 → 节点及连线保存 → 历史/下载可用 → 仅一次积分提交 | 不标成功；查原任务和账本 |
| 图片失败/超时 | 原任务终态或仍运行可查；失败/取消时预留释放，超时不重建任务 | 关闭重试入口并对账 |
| 幂等/并发 | 双击、刷新、重放、断网后恢复只对应一个原 job 和一次预留/结算 | 停止上线 |
| 持久化 | 刷新、另一设备找回项目/资产/历史；409 不覆盖内容 | 标同步错误并提供恢复 |
| 隔离 | 用户 B 无法读写用户 A 的项目、job、Asset、下载 URL | P0 阻断，立即关闭 |
| 付款/积分 | 隔离身份、明确消费上限下完成真实支付或订阅并核对到账，再走生成；若结账暂不可用则商业 READY 不通过 | 不宣称商业闭环 |
| 视频/音频/文本及扩展动作 | 各自重复成功、失败、存储、历史和账本验收 | 各自保持 Disabled |

任何一行失败，记录 `FAIL/BLOCKED` 与证据、责任文件、恢复动作和下一次验证条件；不得用另一模型、旧资产、Mock、伪造成本或健康检查替代。最终只在全部 P0 行通过时标“图片商业闭环已验证”；视频、音频、Agent 和扩展动作分别报告，不合并成“画布全功能完成”。

## 7. 交付物和执行报告

- 冻结源树与备份/恢复记录、构建来源和路由 manifest、API 契约与迁移记录。
- 服务端和 Canvas 前端最小代码差异；功能开关与明确的禁用状态；对应自动测试和真实浏览器网络记录。
- 每个能力一行证据表：`状态 | 模型/路由 | quoteId | jobId | Provider ID | terminal | asset/history | 积分/实际成本 | BUILD_ID`。
- 发布/回滚记录和未通过清单。任何欠缺用 `Unknown` 或 `Blocked`，不能写 `READY`。

实施时使用同目录的 `JIMENG_CANVAS_AI_CODING_PROMPT.md` 作为 AI 编程指令。

## 2026-10-09 01:35 UTC 最新续核

- 公开 `https://canvas.koyosim.com/canvas` 返回 200（01:31:54）；`/api/live` 返回 200（01:33:47）；`/api/ready` 返回 503，正文为 `status=not_ready`、`providers=unhealthy`（01:31:56）。正确 Canvas Origin 与标记的匿名 GET `/api/canvas/session|models|config|projects|jobs|assets` 全部 401；11 个生产 manifest 路由的 OPTIONS 全部为 204 且精确允许 Canvas Origin。
- `/api/models/active` 返回 44 个模型、其中 1 个 `autoRouteEligible`。本次无法读取生产服务进程的有效 `CANVAS_E2E_VERIFIED_MODEL_IDS` 环境，因此其有效值仍为 `Unknown`，不能把环境白名单视为已配置。
- 生产只读快照：HEAD `39c02816ae2a71530177e64fce5d14ac580efa45`、`git status --short` 548 行、BUILD_ID `TNgLPal6DP6uKN4qqO9eH`、Canvas manifest 11/11；`/home/ubuntu/backups/koyosim-canvas-release.json` 与 `.koyosim-production-snapshot.json` 均不存在。未执行生产写入、备份制作或部署。
- 本地主站 HEAD `a824c74dccf98546a63f345307ec1a41b3e57a33`、未提交/未跟踪清单 731 行；Canvas HEAD `4fc779ed04da0b73294d666bcb1bd082cbc4cf94`、清单 39 行。Canvas 工作树本轮新增过期报价重试键修复与单测，其他修改保留。
- 静态入口审计发现 `project.tsx` 的旧直连图片接口只在非 Server Mode 分支执行；插件宿主在 Server Mode 调用旧接口前抛错，模型调用脚本执行器也拒绝 Server Mode。该源码检查不替代线上浏览器网络验收。
- 验证：主站定向测试 33/33、`npm run lint:routes`、Shell/Node 部署脚本语法检查通过；Canvas `pnpm exec tsc --noEmit --incremental false` 通过；Server Mode Vite 构建成功输出到 `/tmp/koyosim-canvas-candidate-20261009-r4`；报价重试键 Node 断言 4/4 通过。构建有既存的动态/静态导入及大包警告。Canvas `pnpm test` 因 `bun: command not found` 失败；`TEST_DATABASE_URL` 未配置，隔离数据库测试未运行。
- 当前状态仍为 `Candidate`。Provider 健康、完整可恢复备份、生产构建源一致性、认证后的资产与历史、成功/失败真实任务、跨账户隔离和正确积分均未验证，禁止发布或标记 `Verified/READY`。

## 2026-10-09 01:52 UTC 最新续核

- 公开端点复核：Canvas 页面 `/canvas` 为 HTTP 200，`/api/live` 为 HTTP 200；`/api/ready` 为 HTTP 503，正文 `status=not_ready` 且 `providers=unhealthy`。正确 Canvas Origin/标记下匿名 Session、models、config、projects、jobs、assets 均为 401；11 个生产 Canvas API 路由 OPTIONS 为 204 且精确允许 Canvas Origin，错误 Origin 的 projects GET 为 403。认证用户读写仍未验证。
- 模型目录为 44 项、仅 1 项 `autoRouteEligible`。生产有效 `CANVAS_E2E_VERIFIED_MODEL_IDS` 仍不可读取、状态 `Unknown`。生产 HEAD `39c02816ae2a71530177e64fce5d14ac580efa45`，工作树漂移 548 行，运行 BUILD_ID `TNgLPal6DP6uKN4qqO9eH`，运行 manifest 含 11 个 Canvas API 路由。`/home/ubuntu/backups/koyosim-canvas-release.json` 与 `.koyosim-production-snapshot.json` 均缺失；未制作备份、未写生产、未部署。
- 本地主站 HEAD `a824c74dccf98546a63f345307ec1a41b3e57a33`、脏清单 731 行；Canvas HEAD `4fc779ed04da0b73294d666bcb1bd082cbc4cf94`、脏清单 43 行。Canvas 候选新增云项目缓存 owner 隔离：Server Mode 中云项目副本只有当前已认证的同一 owner 可见；owner 缺失、匿名/错误用户/加载中均 fail closed；项目列表异步响应按用户和请求序号作废；直达项目页、刷新、选择、删除/导出、恢复和云端自动保存均受访问检查保护；退出立即将客户端会话清空。ownerless 本地项目仍按本地迁移路径保留。
- 验证：Canvas `pnpm exec tsc --noEmit --incremental false` 通过；Server Mode Vite build 输出 `/tmp/koyosim-canvas-candidate-20261009-r6` 成功；项目访问 helper Node 断言 9/9 通过；`git diff --check` 通过。构建保留既有静态/动态导入和大 chunk 警告。Bun 不可用，Canvas Bun 测试未运行；`TEST_DATABASE_URL` 缺失，隔离数据库测试未运行。
- 当前所有改动仍为本地 `Candidate`。尚未在登录浏览器做账户 A/B 交叉验证，也没有刷新/跨设备、成功/失败真实生成、Provider 终态、归档/历史/下载或积分对账证据。Provider unhealthy、ready 503、备份/快照缺失和有效模型白名单未知继续阻断认证后交易及发布；不得标记 `Verified/READY`。

## 2026-10-09 02:12 UTC 当前续核

- 本轮重新核验：`https://canvas.koyosim.com/canvas` 与 `/api/live` 均为 200；`/api/ready` 为 503，数据库、迁移、Worker、Storage、Email 检查通过，Provider 为 unhealthy。`/api/models/active` 当前 44 个模型，其中 1 个 `autoRouteEligible`（`seedream-5.0`），不等于 Canvas 白名单或交易可用。精确即梦项目在隔离只读页面显示“登录以打开您的画布”，因此本轮无法观察其登录后的控件与报价；继续使用此前已记录的可见流程，未验证处不扩大结论。
- 正确 Canvas Origin 与请求标记下，匿名 Session/models/config/projects/jobs/assets GET 均为 401；错误 Origin projects GET 为 403。对生产 11 个 Canvas 路由的 GET/POST/PUT/DELETE 预检共 16 项均返回 204。生产权威源树 HEAD `39c02816ae2a71530177e64fce5d14ac580efa45`、脏清单 558 行、运行 BUILD_ID `YeQLGbUVePzz3ghHnfyRv`、Canvas 路由 11/11。HEAD 未变但脏清单和 BUILD_ID 相比 02:05 复核再次变化，表明生产工作树/构建仍在漂移；不读取、更不修改生产脏改。两份发布备份/快照清单仍缺失，未制作备份、未写生产、未部署。
- 本地主站 HEAD `a824c74dccf98546a63f345307ec1a41b3e57a33`、脏清单 731；Canvas HEAD `4fc779ed04da0b73294d666bcb1bd082cbc4cf94`、脏清单 46。继续保留所有用户现存修改。本轮新增主站 `lib/canvas/sessionOwner.js`：项目创建/保存/删除、参考素材上传、报价、任务创建均必须提交请求开始时的 owner ID，并由服务端与当前认证用户比对；Canvas 客户端已把同一 owner ID 随这些写请求发送。跨账号切换时返回 409，不创建新项目、不写入素材、不报价/建任务；ID 缺失亦 fail closed。此为服务端权限防线的候选实现，仍需双账户浏览器及服务端真实验收。
- 图片参考链路源码检查确认：Job API 按当前用户校验 Asset；`generationCore.js` 在 Provider 调用阶段通过 `resolveCanvasOwnedAssetReferences` 再次按任务 owner 读取对象键，并生成 HTTPS 签名 URL 后才交给 Provider。此仅为代码路径证据，不证明真实 Provider 已收到参考图或返回正确结果。
- 验证：owner helper Node 测试 2/2、主站 `npm run lint:routes`、五个 API route 的 `node --check`、Canvas TypeScript 检查、Server Mode Vite 候选构建及指定改动文件 `git diff --check` 通过。Vite 有既有静态/动态导入与大 chunk 警告。Canvas Bun suite 因 `bun` 不可用未运行；`TEST_DATABASE_URL` 未配置，隔离数据库测试未运行。
- 状态继续为本地 `Candidate`、线上 `未部署/未验收`。Provider unhealthy、完整备份与回滚演练缺失、生产源树持续漂移、E2E 白名单有效值未知、认证账号不可用、没有消费上限和真实隔离账户交易，阻止发布及付费验收。下一步继续只读检查真实任务/账本与资产历史链路并补齐必要的本地防护；未满足隔离账户、预算和环境条件前不触发收费任务。

02:15 UTC 补充：Canvas 图片文生图、图生图、节点生成和重试源码均汇入 `requestCanvasImage`；Server Mode 插件 AI 宿主阻断旧 Provider 调用。反推提示词、蒙版、角度、超分等未验收工具栏动作被筛除，反推/蒙版/超分回调也增加运行时拦截。Canvas TypeScript 检查及 Server Mode Vite build `/tmp/koyosim-canvas-candidate-owner-guard-server-20261009-r2` 通过，构建保留既有导入与大 chunk 警告；均为代码证据，未替代线上 Network/任务验收。

## 2026-10-09 02:24 UTC 续核

- 精确即梦项目在隔离浏览器加载和重载均出现“画布意外停止（Error code: 3）”，未能观察登录后功能。线上 Canvas 页面 200；API 正式源 `www.koyosim.com` 的 `/api/live` 为 200、`/api/ready` 为 503（Provider unhealthy）。正确 Origin/标记下匿名 Canvas Session、models、config、projects、jobs、assets 均为 401。
- 生产 HEAD `39c02816ae2a71530177e64fce5d14ac580efa45`、工作树漂移 558、运行 BUILD_ID `YeQLGbUVePzz3ghHnfyRv`、Canvas 路由 11/11；两份生产发布备份/快照缺失，未创建备份、未写入或部署。主站本地 HEAD `a824c74dccf98546a63f345307ec1a41b3e57a33`、脏清单 731；Canvas 客户端 HEAD `4fc779ed04da0b73294d666bcb1bd082cbc4cf94`、脏清单 46，未清理已有修改。
- 修复服务端成功任务到 Asset 的异步竞态：`getGenerationTrace` 会隐藏原始 `result_object_key`，旧 Canvas 单任务查询因此可能漏掉已有 Asset。当前候选改为 owner 校验后读取原始 creation、重试幂等 Asset 同步、重新读取 owner scoped Asset；只有资产具备对象存储键才返回可下载结果，任务历史会对缺失对象键的成功任务限批重试。60 秒内仍等待同步，超过宽限期明确报 `result_unavailable`，不无限显示处理中或假报成功。
- 定向测试 26/26、积分桶规则测试 6/6、服务端 Node 语法检查、`npm run lint:routes` 通过。`TEST_DATABASE_URL` 缺失，隔离数据库、Provider 成功/失败任务、存储下载、账本和跨账户 E2E 均未运行。此为本地 `Candidate`，线上未部署；Ready 503、无完整备份及隔离账户消费上限仍阻断生产验收。

## 2026-10-09 02:32 UTC 续核

- 线上只读复核仍为：Canvas 页面及主站 API `/api/live` 返回 200；`/api/ready` 返回 503、`providers=unhealthy`。正确 Canvas Origin/标记下匿名 Session、models、config、projects、jobs、assets 均为 401；Canvas 域名 `/api/*` 是 SPA fallback，不能视为 API。生产 HEAD `39c02816ae2a71530177e64fce5d14ac580efa45`、漂移 558 项、BUILD_ID `YeQLGbUVePzz3ghHnfyRv`、Canvas 路由 11 个；发布备份清单和生产快照均缺失，未写入或部署。
- 精确即梦项目在隔离浏览器加载/重载仍显示 `Error code: 3`；登录态交互未观察。主站本地工作树 HEAD `a824c74dccf98546a63f345307ec1a41b3e57a33`、状态 731 项；Canvas HEAD `4fc779ed04da0b73294d666bcb1bd082cbc4cf94`、状态 46 项；已有改动保留。
- 候选新增结算守卫：`commitCredits` 和 `voidCredits` 在写入前核对钱包冻结总额不少于当前预扣凭单；钱包缺失、数值非法或冻结不足时以 `CREDIT_RESERVATION_BALANCE_MISMATCH` 失败，事务不写入，避免以 `Math.max(0, ...)` 隐藏差额并错误推进凭单状态。
- 复核过期策略：签到桶支持当日/24 小时/永久配置，订阅桶按周期过期；void 当前将返还放回原桶并保留原到期时间。代码/文档没有明确说明预扣期间跨过期点时应冻结有效期还是继续原期限，因此不延长、不转为永久、也不推断新的退款政策；该边界保持 `Unknown`，需由产品/财务规则明确后再改。当前 Candidate 只证明代码保护冻结余额和原桶路径，不证明过期点后的用户可用余额政策符合预期。
- 验证：七组定向 Node 测试 34/34 通过；相关服务/API route `node --check` 通过；`npm run lint:routes` 通过（扫描仍报告 11 个未声明 route-level rate-limit 处理器、2 个 stale path、89 个 raw href 等提示）。全仓 `git diff --check` 被大量既有 CRLF/空白改动挡住；未对工作树做格式化。`TEST_DATABASE_URL`、隔离账户和明确消费上限缺失，未运行隔离数据库、线上 Provider、真实资产下载或积分交易；所有改动仍为 `Candidate`，未部署。

## 2026-10-09 04:45 UTC 离线验证续记

- 更新支付流程数据库测试，使 `pro` 订阅成功断言订阅积分桶与到期时间，退款断言只撤销对应订阅积分；永久积分保持不变。该流程使用隔离 PostgreSQL 和测试网关，属于本地自动化证据，不代表真实支付或真实 Provider 验收。
- 全量隔离 PostgreSQL 测试 22/22 通过；其中包含积分凭单分桶不一致拒绝、支付签名/金额校验、订阅到账、重复回调幂等及退款回收。测试数据库仅绑定 `127.0.0.1:55432`，本轮结束后已停止并删除本任务创建的临时数据目录。
- Canvas/积分关键回归 25/25、P7 CI 合约 8/8 通过；`npm run lint:routes`、Canvas `tsc --noEmit --incremental false` 通过。Server Mode Vite 候选构建输出到 `/tmp/koyosim-canvas-candidate-20261009-final` 并成功；仍有动态/静态导入和 4.1 MB 主 chunk 警告。Route lint 的历史启发式提示仍需单独审阅，不视为本次失败。
- 本次只做离线复核，没有刷新生产端点、生产 HEAD/BUILD_ID 或即梦登录态观察。最近线上记录仍是 02:32 UTC 续核：`/api/ready=503`、Provider unhealthy、发布备份/快照缺失；请重新只读核验后再引用为当前状态。
- Bun Canvas 测试未运行（环境无 Bun）。隔离用户登录、费用上限、真实 Provider 成功/失败终态、对象存储读取、历史/下载、积分账本在线一致性、双账户隔离和跨设备恢复均未完成；功能状态保持 `Candidate/Unknown/Disabled`，未部署，商业闭环未验证。

## 2026-10-09 08:12 UTC 测试续核

- 主站 `tests/model-pricing-routing.test.mjs` 18/18 通过；Canvas 模型配置、项目快照、任务结果与 Asset 引用四组测试合计 17/17 通过。合计 35 项离线 Node 测试通过，证明路由资格、节点快照校验、任务归档状态和 owner-scoped Asset 引用的代码契约；不代表线上交易验证。
- Canvas `project.tsx` 静态检查确认 Server Mode 仅允许 image capability，重试入口先做同一能力校验；video/audio/text 和旧 Provider 执行路径不能从这些入口绕过。Canvas 前端测试脚本要求 Bun；当前未安装 Bun，且仓库未配置 Vitest，因此不能把前端专项测试记为通过。
- 本轮没有刷新线上端点；最近线上证据仍是 08:09 UTC 记录：`/api/ready=503`、Provider unhealthy，生产完整备份/快照缺失。没有生产写入、备份或部署。
- 按跟踪工作包统计，7 项中的 1 项（本轮只读现状复核）已完成，剩余 6 个仍未闭环：Provider/模型资格恢复、生产备份与恢复演练、冻结源树和安全发布、认证账户与云项目/素材/历史的跨账号及跨设备验证、受控图片成功/失败/幂等/积分完整 E2E、视频/音频/文本/Agent/扩展能力的逐项真实验收。此数量是工作包计数，包内仍有多个验收场景；完整融合和商业 READY 均未通过。

## 2026-10-09 09:37 UTC 部署与下一步

- 线上画布页面当前加载的 JS/CSS 与本地 Server Mode Vite 构建产物 SHA-256 完全相同，前端已部署。`pnpm --dir web typecheck` 与 Server Mode Vite 构建通过；Bun 专项测试未运行，不能据此宣称真实生成完整。
- 最新 `/api/ready` 是 503，Provider unhealthy；这是当前后端发布硬门禁。五类生产备份经 sudo 只读校验仍与 HEAD `39c02816ae2a71530177e64fce5d14ac580efa45`、BUILD_ID `cCjh7dGANqkPr5fslqKG9` 和源树摘要匹配。
- 生产模型只读诊断仍发现 6 个图片与 5 个视频模型没有 Provider 路由；RunningHub 视频映射价格缺失、OpenAI 图片及 Luma/Runway 健康异常也需按真实 Provider 与价格信息修复。不得猜补映射或开放未验证模型。
- 当前本地发布脚本预检已修正为 `sudo -n` 读取 root-only 源文件，`bash -n` 通过；没有运行部署。后续应先由运营/模型负责人补齐有凭据和可核实价格的 Provider 映射，再重新确认所有可见核心模型可路由、`/api/ready=200`，之后才能准备独立 Linux x64 后端构建快照并进行发布与受控真实账户 E2E。
- 09:40 UTC 公网复核确认 `/api/live=200`、匿名 Canvas Session `401` + 精确 CORS、OPTIONS `204`；`/api/ready` 仍为 503，数据库、迁移、Worker、Storage、Email healthy，Provider unhealthy。

## 2026-10-09 09:49 UTC 账户切换竞态修复候选

- 现行客户端此前已把图片文生图、图生图与重试接入 KoyoSIM quote → job → poll → Asset；生产 Vite 资产与修改前的本地候选 SHA-256 一致。此次不重复声称接线或部署。
- 新发现云素材库和生成历史在异步读取期间发生账号切换时，旧账号响应仍可能触发浏览器下载、写本机预览或插入当前画布。新增 owner guard，在读取前、读取后、本机预览准备后核对当前已认证用户；预览准备后身份变化时删除临时 IndexedDB 素材，并阻止最终下载/插入。
- 修改候选：`web/src/lib/canvas/koyo-asset-owner.ts`、`web/src/components/canvas/canvas-side-panel.tsx`；新增 `web/tests/koyo-canvas-asset-owner.test.ts`；更新客户端 `CHANGELOG.md` 和英/中文 `pending-test`。未改主站 API、账本或 Provider 配置。
- 验证：Canvas `pnpm --dir web typecheck` 通过；Node + Vite SSR 隔离执行“读取中切号”“预览准备中切号并清理”“账号不变正常交付”3/3 通过；Server Mode Vite 构建成功，仍显示既有动态/静态导入及主 chunk 大小警告。Bun 未安装，项目 Bun 全套未运行。
- 生产最新复核：Canvas 页面 200，`/api/live=200`，匿名 Canvas Session `401` 且 CORS 精确，OPTIONS `204`，`/api/ready=503`（Provider unhealthy）。HEAD `39c02816ae2a71530177e64fce5d14ac580efa45`、脏清单 517、BUILD_ID `cCjh7dGANqkPr5fslqKG9`、运行路由 11/11；五类备份清单与源码、构建及恢复证据仍匹配。生产页面仍引用旧 JS `index-D0tjSC91.js`，新候选 JS `index-6koEQLOK.js` 未部署。
- 失败/未验收：无双账户生产浏览器或跨设备验收；无真实 quote/job/Provider terminal/asset/积分账本证据。没有生产写入。下一阶段仍受 Provider 资格/readiness 门禁阻止；补齐准确 Provider 映射与价格后，再评估构建资源及安全发布。

## 2026-10-09 10:02 UTC 账户数据真实性与登录保护

- 按线上主站 API 源码修正 Canvas 账户页字段：订单金额已经格式化，使用 `amount/plan/status/createdAt`；额度流水使用 `delta/reason/action_type/created_at`；活跃统计使用 `activeDays`。请求失败显式给出重试，未知值不再显示成免费套餐或 0。
- 本地主站候选调整 `/api/billing/usage`：钱包/账本读取异常改为 503，缺少钱包分桶时分桶值为 null，不再通过 catch/`|| 0` 伪装成有效余额。该 API 文件仍是本地候选。
- OAuth 消息只接受精确当前站点或主站 origin；认证成功需再次读取并核对同一服务端用户；注册同意项默认未勾选。账户面板按 user ID 重建，避免旧账号数据留在新账号视图。
- 09:52 UTC 线上 `/api/ready=503`、providers unhealthy；Canvas host 的匿名 `/api/auth/me` 与 `/api/auth/social-options` 为 200 JSON，但没有登录成功证据。真实账户、账单/余额、双账号隔离、生成及积分交易仍待验收；不能据此放行生产。

## 2026-10-09 10:05 UTC 推送阻塞与版本状态

- Canvas 客户端候选本地提交 `a640b3b`，90 个文件；类型检查通过、Server Mode Vite 构建通过、Bun 测试 24/24 通过、主站额度 API 语法检查通过。构建保留动态/静态导入与大包警告。
- 远端 GitHub 返回 HTTP 403，当前凭据没有 `basketikun/infinite-canvas` 写权限，因此提交留在本地，远端没有新分支。
- 10:05 UTC `/api/ready=503`（Provider unhealthy），Canvas 公网仍使用旧静态资产 `index-D0tjSC91.js` / `index-B4mM0CrD.css`。未推送成功、未部署、未做生产写入。需远端授予写权限；发布仍需恢复 Provider、独立 Linux x64 构建和认证账户商业闭环验收。

## 2026-10-09 10:22 UTC 新鲜备份与发布阻断

- 用户确认可以冻结并备份。生产源码、配置、数据库、对象和当前 `.next` 已重新归档至 `/home/ubuntu/backups/canvas-release-20261009T102218Z/`。隔离恢复证据：源码 7,305 个文件且树 SHA-256 匹配；配置 149 个归档条目并与原件逐项比对；PostgreSQL dump 恢复到隔离临时库并读回 27,223 行后删除；上传对象 130 个逐项比较；构建归档与线上 BUILD_ID 匹配。`/home/ubuntu/backups/koyosim-canvas-release.json` 前后校验通过，旧清单保留为带时间戳的 stale 副本。
- 采集前后 HEAD、dirty 计数 526、源树摘要和 BUILD_ID 均未变化；归档及恢复期间没有运行 Next 构建，未改生产应用源码、配置、数据库、对象、构建或服务。此次仅增加受限访问的备份与恢复证据。
- 10:19 UTC 公网 `/api/live=200`、Canvas 页面 `200`、`/api/ready=503`（`providers=unhealthy`）。服务当时 active；当前旧版静态资源仍在线。
- Canvas 客户端候选 `a640b3b`（90 文件）本地验证通过：Bun 24/24、TypeScript、Server Mode Vite 构建；推送 `origin/koyo-canvas-ui-i18n` 收到 GitHub HTTP 403，远端未更新。本轮不通过替换凭据绕开仓库权限。
- 主站本地未跟踪候选 `/api/canvas/quotes` 在订阅权益读取失败时不再降级为 Free 报价，未知基础设施错误返回 503；`node --check` 和指定 Node 测试 10/10 通过。该测试包含静态契约断言，不是线上路由/数据库运行验收，也没有部署。
- 真实登录、账户切换、模型白名单、Provider 终态、成功/失败/取消/重复请求、对象历史下载与积分扣/退闭环均未验证；`/api/ready=503` 仍阻断真实交易验收和后端发布。完整融合保持未完成。

10:24 UTC 即时复核：主站 `/api/live=200`，Canvas 页面 `200` 且继续引用旧版 `index-D0tjSC91.js` / `index-B4mM0CrD.css`；`/api/ready=503`、`providers=unhealthy`。新清单再次通过本地版本一致的生产校验器。前端候选仍在本地，线上无变化。

## 2026-10-09 10:34 UTC 生产漂移复核与 Server Mode 回归

- 上一份 10:22 备份随后被线上变化淘汰：HEAD 仍为 `39c02816ae2a71530177e64fce5d14ac580efa45`、dirty 计数仍为 526，但源树摘要从 `7b7285fc...` 变为 `dd50bf7c...`，BUILD_ID 从 `Yd01yW5kLy6QwyGF9wv7q` 变为 `om1ROBUzYLkFrZtnIewSF`。变化涉及三个模型详情/图表组件、Canvas quote route 和对应测试；quote route 与其测试当前分别与本地主站候选 SHA-256 完全相同。修改者/触发来源不明，本轮没有向生产应用目录发起写入。
- 新鲜五类备份已重做并通过隔离恢复，路径 `/home/ubuntu/backups/canvas-release-20261009T103217Z/`，捕获 `2026-10-09T10:32:19Z`；HEAD、BUILD_ID、dirty 计数、源树摘要备份前后匹配。隔离恢复：源码 7,305 文件、配置 149 项、数据库 27,241 行、对象 130 个、`.next` BUILD_ID 一致。canonical manifest 再次通过生产校验器。
- 线上运行态：Next 服务启动时间 `2026-10-09 18:26:22 CST`，晚于当前 build 目录的 BUILD_ID 时间；服务/Worker active、构建进程 0、Canvas API route manifest 11/11。编译后的 quote route 中可找到 fail-closed 报价错误文案。这只证明当前 build 包含该代码，不证明认证报价、真实生成或账本结果正确。
- 10:34 UTC 公网复核：`/api/live=200`、Canvas 页面 `200`、`/api/ready=503` 且 Provider unhealthy；Canvas 静态资产仍是旧 `index-D0tjSC91.js` / `index-B4mM0CrD.css`。匿名 Session/models/config/projects/jobs/assets 皆为 401；正确 Origin 的 jobs OPTIONS 为 204。模型目录 44 个、`autoRouteEligible=1`，运行进程 `CANVAS_E2E_VERIFIED_MODEL_IDS` 不存在。
- Canvas 本地分支仍为 `a640b3b`，本轮仅在 `web/tests/koyo-canvas-generation.test.ts` 增加请求 owner/model/idempotency 契约、缺失模型不回退、拒绝报价不建 job、Provider 失败不取 asset 测试。TypeScript 检查通过；本机缺 Bun，未执行 Bun suite；Vite SSR 临时回归用例 4/4 通过。GitHub 403 推送状态未解决，线上静态客户端未更新。
- 当前恢复备份子门禁通过；融合仍未完成。Provider/readiness、公开客户端版本、登录账户与余额、模型 allowlist、真实图片交易、跨账号/设备历史和积分闭环未验收；不开放收费 E2E，不标记 Verified。

## 2026-10-09 10:42 UTC 备份复核与云项目恢复竞态

- 用户确认可以冻结并备份后，10:37 UTC 服务器端完整备份校验通过：当前 HEAD、BUILD_ID、源码树 SHA-256 与 10:32:19 UTC 五类备份一致，隔离恢复和回滚证据有效。重复生成同一快照没有必要，本轮未改生产应用。
- 10:40 UTC `/api/live=200`、Canvas 页面 `200`、`/api/ready=503`（Provider unhealthy）。安全发布脚本还要求独立 Linux x64 Next 构建快照和 readiness `200`，当前都不满足；未运行发布或将客户端 Vite 构建当作后端发布。
- 本地 Canvas 候选修复云项目恢复期间切换账号的竞态：下载与本机素材写入阶段均核对原用户，切号后禁止导入及导航。类型检查、Server Mode Vite 构建通过，SSR 隔离回归覆盖两种切号时机和账号不变恢复；Bun 缺失，双账户真实浏览器验收仍待完成。候选未推送/部署，整体状态仍为 Candidate。
- 10:43 UTC 用户指定的 Canvas 页面仍引用生产旧 JS/CSS，`/api/ready=503`；本地候选 JS/CSS 尚未上线。

## 2026-10-09 10:55 UTC 图片生成结果账号竞态与发布复核

- Canvas Server Mode 图片请求现在捕获发起用户并贯穿项目同步、参考图上传、报价弹窗前后、任务轮询及本机预览写入核对身份；各结果入口在写回节点前再次校验。切换账户后中止交付、清除未提交的本机预览，并保留服务端幂等键供原用户恢复任务。
- `canvas-web` 类型检查通过，Koyo Server Mode Vite 构建通过，构建仍提示现有动态/静态导入和大包警告。Bun 未安装，新增 Bun 用例没有运行；Node + Vite SSR 验证同账号交付、身份不匹配中止和清理回调通过。没有双账户线上验证或真实生成证据。
- 10:54 UTC 重新运行生产备份只读验证：HEAD `39c02816ae2a71530177e64fce5d14ac580efa45`、BUILD_ID `om1ROBUzYLkFrZtnIewSF`、源码树 SHA-256 `dd50bf7ca263b0a660aef3d815e851bbbf4c25dcf9b47484d0cc8b0b4c2b0923` 与 10:32:19 UTC 五类备份匹配。公网 Canvas `200` 仍加载旧 JS/CSS；`/api/ready=503`、Provider unhealthy。生产应用没有写入。
- 仍不能推送或发布：客户端远端曾返回 GitHub HTTP 403；生产就绪门禁为 503，独立 Linux x64 Next 构建和真实账户商业 E2E 也缺失。当前修复仅为本地 Candidate。


## 2026-10-09 11:06 UTC Canvas 静态前端发布

- 经确认静态站点实际目录为 `/home/wwwroot/AI/domain/canvas.koyosim.com/web`，与主站 Next 发布目录分离。先将线上旧站点 76 个文件归档并隔离解压比对，再仅新增候选 JS/CSS/异步 chunk，最后原子替换 `index.html`；线上 `config.js` 哈希未变，旧哈希资源保留。备份与发布证据：`/home/ubuntu/backups/canvas-static-release-20261009T110035Z/`。
- 本地候选提交 `3a8a1aa6c70318f120a5b78b5d96198c8d440375`。公网 HTML、JS、CSS、异步 chunk 均返回 200 且 SHA-256 与候选匹配；Chrome 新标签页已显示 KOYO Studio Canvas 项目库。GitHub 推送仍受 403 阻止，因此未更新远端仓库。
- 后端 `/api/live=200`；匿名、精确 Canvas Origin 的 Session 为 401；`/api/ready=503` 且 Provider unhealthy。没有触发生成或扣费。前端已发布不等于真实交易闭环；登录账户下的报价、Provider 终态、资产/历史与积分扣退仍待验证，后端发布及完整融合未完成。

## 2026-10-09 13:20 UTC 恢复对话后的续核

- 当前公开状态：`/api/live=200`；`/api/ready=503`（Provider unhealthy；数据库、迁移、Worker、存储和邮件状态正常）；Canvas `/canvas=200`。线上静态 HTML 仍加载 `index-DGXNEaem.js` 与 `index-obs6VlO9.css`，均与 Canvas 仓库干净提交 `3a8a1aa` 的本地构建文件哈希一致。
- 用户指定的即梦项目页现显示需要登录。本轮未登录且未尝试登录，因此没有新增当前页面交互证据；沿用既有观察时必须标注日期，不能当作本轮复核。
- 下一步仅继续主站当前工作树中可隔离审阅的 Canvas 服务端候选和本地静态验证；不要改动无关脏文件。真实登录、Provider、收费生成、云资产/历史和积分闭环缺少验证条件，继续保持 `Candidate/Unknown/Disabled`，不写生产或部署。

## 2026-10-09 13:22 UTC SSH 元数据补查

- 直连 SSH 只读确认生产 HEAD `39c02816ae2a71530177e64fce5d14ac580efa45`、运行 `BUILD_ID=zinizzeiBZFtGSeEWTS2i`。BUILD_ID 已变化，旧文档中的备份/构建匹配结论不代表当前匹配。
- 远端 `.git/index` 和 `/home/ubuntu/backups/koyosim-canvas-release.json` 对 SSH 用户返回 Permission denied；当前生产 dirty count 与备份匹配状态为 `Unknown`。未提升权限或绕过访问控制。

## 2026-10-09 13:28 UTC 服务端候选源码复核

- 本地源码逐项核对了 11 条 Canvas API、模型候选/白名单服务、客户端图片报价与提交路径。候选实现要求当前账户、已挂载且白名单模型、已同步的云项目/节点、服务端报价和 owner-scoped 引用素材；Server Mode 客户端拒绝浏览器直连 Provider，并限制未开放动作。
- 这是静态源码审阅；没有运行测试/构建，没有改应用代码。服务端候选仍为主站巨大未提交工作树内的未跟踪目录，不视为已隔离、可发布产物。生产 Provider unhealthy 和生产元数据权限不足仍阻断在线验证/发布。

## 2026-10-09 13:29 UTC 旧补丁边界

- 既有 `KOYOSIM_CANVAS_SERVER_PATCH.patch` 配套说明指向 2026-09-30 快照；对当前本地主站工作树只做 `git apply --check` 时上下文不匹配，未应用。保留原补丁，避免把旧补丁误当作当前候选或生产可应用文件。

## 2026-10-09 13:36 UTC 用户要求部署后的即时执行续核

- 已重新读取开发/发布门禁并复核线上：公网 `/api/live=200`，Canvas 页面 `200`，`/api/ready=503`，响应明确为 `providers=unhealthy`；数据库、迁移、Worker、Storage、Email healthy。生产 HEAD `39c02816ae2a71530177e64fce5d14ac580efa45`，BUILD_ID `zinizzeiBZFtGSeEWTS2i`，Canvas 运行路由 `11/11`。当前生产全量备份校验器通过，匹配的五类备份捕获时间为 `2026-10-09T11:23:34Z`。
- 生产只读数据库重新统计：44 个 active/visible/paid core 模型中，图片 11 个、视频 22 个；其中 6 个图片和 5 个视频模型完全没有 Provider mapping。另有已映射路由缺少审核、endpoint、有效价格版本或可用 Provider 状态；OpenAI 汇总为 degraded。没有读写密钥/凭据，没有改 Provider/定价/模型配置，也没有调用收费生成。
- 按线上 HTML 引用资源及 SHA-256 核对，静态 Canvas 客户端已是干净客户端提交 `3a8a1aa` 对应构建；没有新的静态文件需要发布。本地主站的 11 条 Canvas API 路由与线上对应源文件抽样一致，没有找到本轮可安全发布的后端代码差异。
- 发布未切换：安全脚本要求单独冻结且匹配备份的生产候选快照、Linux x64 `.next` 产物及切换后 readiness 200。当前无候选快照；本机为 macOS arm64，未发现 Docker/Podman 构建器；readiness 仍 503。按门禁启动切换会中断服务并在验收失败时自动回滚，故没有执行生产切换或重启。
- 立即可做与未完成：路由/价格/健康状态须由掌握准确 Provider 映射、真实成本和凭据的运营/模型负责人逐项补齐并验收；随后需取得 Linux x64 构建环境，生成隔离快照，再通过安全部署脚本。登录后 quote/job/provider terminal/asset/history/download/积分扣退、双账号隔离与退款闭环仍未验证；保持 `Candidate/Unknown/Disabled`，不声称商业闭环完成。

## 2026-10-09 13:42 UTC 缺路由模型官方 API 可用性筛查

- `sd-3.5-large`：Stability 官方 API 文档给出 `/v2beta/stable-image/generate/sd3`、`STABILITY_API_KEY`，成功生成价格为 6.5 credits；官方定价页说明 1 credit = USD 0.01。当前代码适配器注册表没有 `stability`，因此有明确候选实现方向，但还缺账号凭据、映射/参数核验和真实成功/失败成本验收，未开放。
- `midjourney-v6.1` / `midjourney-v7`：Midjourney 官方 FAQ 明确没有 public API，并说明服务条款禁止自动化访问或生成；不得通过模拟网页/Discord 绕过。应保持 Disabled/移出可售目录，除非以后有经授权的官方接口。
- `topaz-video-ai`：Topaz 官方 API 提供视频增强/升频/插帧；这不等价于文生视频/图生视频生成，不可直接映射到通用视频生成动作。需要独立“视频增强”能力、计费维度和成功产物验收。
- `hunyuan-video`：腾讯官方文档确有 Hunyuan 视频任务 API；官方开源 HunyuanVideo 则要求 Linux/CUDA，原版 720p 推荐 80GB GPU、最低约 45–60GB。需确认生产账号实际开通的 API 产品与该内部模型 ID/参数/计价单位一一对应后才可做 provider mapping。
- `flux-2`：BFL 官方定价区分 FLUX.2 [max/pro/klein/flex] 等具体模型及 MP/参考图价格；当前内部 ID 未指定变体，不能安全推导唯一 endpoint 或实际成本。先明确变体再接线。
- `flux-1-dev`、`flux-1-schnell`、`flux-3`、`cogvideo-2b`、`infinitetalk`：本轮未找到足以证明当前生产可用 hosted API、适配器和实际计价的一组官方材料，维持 Unknown/Disabled；不能由权重仓库、社区托管或相似名称补路由。
- 依据： [Stability API 与价格](https://platform.stability.ai/docs/api-reference)、[Midjourney 官方 FAQ](https://github.com/midjourney/docs/blob/main/data/faq.txt)、[Topaz API](https://www.topazlabs.com/api)、[腾讯混元生视频 API](https://cloud.tencent.com/document/product/1616/107795)、[腾讯混元视频计费](https://cloud.tencent.com/document/product/1616/118994)、[Tencent HunyuanVideo 官方推理仓库](https://github.com/Tencent-Hunyuan/HunyuanVideo)、[BFL 官方定价](https://bfl.ai/pricing?category=flux.2)。此项为公开资料核查，未变更 Provider/账单/模型生产配置。
