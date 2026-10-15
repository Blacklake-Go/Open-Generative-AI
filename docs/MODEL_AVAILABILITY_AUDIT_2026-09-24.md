# KOYO Studio AI 模型真实可用性检查报告（2026-09-24）

检查对象：`https://koyosim.com`（应用云服务器 43.155.166.90，`/home/wwwroot/AI/domain/koyosim.com/web`，**systemd 单元 `koyosim.service` / `koyosim-worker.service`** 托管 `next-server 127.0.0.1:3100`（非 PM2，本轮实测，见 12.1），构建号 `ahF8q-_fpA6cgZkL5QuZF`）
数据库：`koyosim_ai`（schema `ai_studio` / `auth_usr` / `ops_bill` / `sys_core`）

## 0. 总结论

**当前后台显示为「可用」的 82 个上架模型，没有任何一个可以从前端完成一次完整生成；把范围放大到用户在前端工作台里真正能点到的 532 个模型（552 个条目），可完成生成的同样是 0 个。** 按本次检查时刻逐条实跑：472 条停在报价阶段（`MODEL_PRICING_UNCONFIGURED`）、74 条停在路由（`NO_COST_VERIFIED_ROUTE`）、6 条连模型 id 都解析不到（`MODEL_NOT_FOUND`）。但这**不是「链路本身走不通」**：同一套链路在 09-20 ~ 09-24 之间产生过 2 次真实出图与 5 次「已进队列、已向供应商发请求」的订单，失败点全部落在供应商侧余额（详见第 0 节下两条修正与第 8 节）。

- 检查范围（第二轮补全，见第 7 节）：前端工作台可选 **532 个模型 / 552 个条目**；后台注册表 `ai_models` 共 927 行、其中 **920 行 status='active'**；价盘表 `model_pricing` 只有 **88 行**；两者交集 82（即上架集合），其中 **68 个在前端任何工作台里都没有对应条目**。也就是说「后台显示可用」与「前端可以选择」是两套几乎不相交的集合。
- 状态分布：`⏸ 未配置` × 82（上架模型全量）+ 13（被凭证隐藏的模型）；`✅ 可正式使用` **0 个**；没有任何模型可判定为「可正式使用」。
- 这不是「API 返回 200 就算可用」的判断。结论来自：真实前端提交链路（`/api/generation/quote` → `/api/generations`）、真实运行中的 Next 服务与 worker、真实生产库数据、以及用平台自身模块对生产库执行的实际报价/建单调用。全程未使用 Mock 或假数据。
- 历史上确有 2 次成功生成（09-20 的 `seedream-5.0`，各扣 2 积分，产出真实图片 `/uploads/creations/202609/*.jpg`），但两条记录 `quote_id` 为空、`provider = bytedance`（该 id 在 `ai_studio.ai_providers` 中根本不存在），说明走的是**控制塔之外的旧适配路径**，且该路径已不在当前报价链路上。全库 `creations` 仅 8 行，即平台真实生成量近乎为零。
- **需要修正的一处早期表述**：并非「没有任何任务进入过队列」。8 行 `creations` 里有 **5 行走完了「报价 → 预扣积分 → 路由决策 → 建立 `generation_attempts` → 向供应商发出真实请求」**（`routing_mode='balanced'`、`quote_id` 已 `consumed`、`route_decision_logs` 有得分记录），模型为 `nano-banana-pro`(55)、`wan2.7-text-to-image-pro`(2)、`flux-schnell`(10)。它们的失败点全部在供应商侧：`generation_attempts.error_code = INSUFFICIENT_PROVIDER_BALANCE`（`nano-banana-pro` 一条直接回传上游原文 `Insufficient credit balance`），随后积分被如实解冻（台账 `TASK_RESERVE -N` / `TASK_RELEASE +N`，净额 0，无悬挂预扣）。**即平台自身的下单与退款链路已被真实数据证明是通的**，缺的是供应商余额与目录持续启用，而不是这段代码。
- **由此得到的关键推论（影响上线策略）**：G1–G3 在 09-21 ~ 09-24 00:50 期间曾被填平到「可路由」程度，如今 `provider_models` 却又退回 **979/979 端点为空、979/979 `review_status='needs_specification'`**，`provider_model_price_versions` 最新观测停留在 09-22（超过 24h 新鲜度上限）。这说明**一次性启用必然在一到两天内自动失效**：成本观测（24h）与健康快照（15min）都是会过期的门槛，若不把 `sync_prices` / `probe_health` 变成常驻定时任务，同一个模型会「今天能下单、明天就 `NO_COST_VERIFIED_ROUTE`」，用户侧表现为随机失败。

- **首页「重点推荐」23 个广告位同样 0 个可下单**（第三轮补测，逐条实跑解析阶梯 + 生产库对照，全表见第 9 节）：19 个能解析到后台行但 19/19 停在 `needs_specification`，4 个（`udio-130`/`deepseek-r1`/`claude-3-7-sonnet`/`gpt-4o`）连模型行都不存在，1 个（`openai-sora-2`）指向 `disabled` 行，16 个没有价盘行。因为 `?model=` 是**真的生效**（`StandaloneShell.js:481/522` → `applyModelSelection()`），这些点不动的推荐位不会报错，而是**静默停在默认模型上**；本轮据此查出并修正了一处跨厂商错标（音频推荐位写着「ElevenLabs v3」实际下单的是 `minimax-speech-2.6-hd`、扣 295 积分，且系统里没有 ElevenLabs 渠道）。
- **撤回一处本轮早前的错误归因（自查后已回滚）**：曾把 `generationCore.js:557` 的一处改动当作「第 14 处生产补丁」，理由是「546/552 条前端条目实际会走那条旧路径」。复核后确认该结论不成立：该行位于 `if (providerClient)` 分支内（`generationCore.js:436` 起，注释自述「如单元测试中的 mockProvider」），而 `processGenerationTask` 的 4 个生产调用点（`app/api/generations/route.js:61`、`app/api/v1/[[...path]]/route.js:137`、`lib/services/generations.js:66`、`lib/services/taskWorker.js:8/21`）**全部不传 `providerClient`**，只有 `tests/db/postgres.test.mjs:417` 传。生产真实走的是带故障转移的路由分支，其文案早已正确使用 `PROVIDER_FAILURE_TEXT`（`generationCore.js:880`）并会保留首个真实上游错误（`generationCore.js:623-633`）。因此**该改动对用户零影响，已在线上与本地两处一并回滚**（线上 `lib/services/generationCore.js` 恢复为 md5 `837fcad59579f9a3c20243f0cc336805` / 51028 B，与 `.bak-20260925` 逐字节一致，`www:www 644`，`node --check` 通过；本地同 md5）。补丁数因此回到 **13 处线上源码树 + 1 处仅本地**（随后同日因第 13 节的错误文案修复又新增 1 处，现为 **14 处**）。
- **顺带得到的正向结论（不需要构建就已核实）**：直接对**运行中的构建产物**做字符串检索（`BUILD_ID=ahF8q-_fpA6cgZkL5QuZF`，09-24 14:36:44）——泄漏上游细节的旧文案 `所有备选渠道均不可用` 与错误码 `ALL_PROVIDERS_UNAVAILABLE` / `UPSTREAM_402` 在编译产物里命中 **0 个文件**，而正确文案 `同模型其余渠道均不可用`、`该模型当前没有可用供应商渠道`、`AI 供应商额度不足…` 各命中 1 个文件（`.next/server/chunks/743.js`）。也就是说第 10 节里那几条「错误提示缺陷」早在 09-24 14:36 那次构建就已经修好了，DB 里的坏文案是 09-20/09-21/09-23 历史行，当前代码不可能再产出；而 `publicError.js` 里新增的可读文案（如「该模型暂时没有可用的生成渠道…」）在编译产物中命中 0 ⇒ 它确实还没上线。这一正一反两次核对都只读产物，不需要动服务。


- **本轮补测（第 10、11、12 节）新增两条「已用真实数据证明是对的」结论**：(1) 积分退回逐条对账 8/8 全对 —— 6 条失败单全部全额解冻净额 0、无悬挂预扣，2 条成功单净扣恰等于 `credit_cost`；(2) 那 2 条成功作品的图片经磁盘、公网 HTTP、字节数、JPEG 维度四重核对确认可预览可下载 —— 但 `user_assets` 全库 0 行，「我的作品/继续使用」入口是断的。「超时」类因平台从未产生过超时任务而**无法用真实样本验证**，已如实标注而不是当作已验证。
- **浏览器复现的落地漂移**：15:49 UTC 未登录直链 `/studio?tab=video&model=seedance-2.5-text-to-video` 落在**图像**工作台并选中 **Topaz Image Upscale**；同一位置 14:45 显示的还是 `SEEDREAM 5.0 PRO`。原因是大标题/默认模型取「上架目录裁剪后的第一条」，而 `bytedance-seedream-5.0-pro` 并不在 69 条目录里 ⇒ 运营每上下架一次，新用户落地看到的默认模型就随机变一次，本次随机结果是一个需要上传原图的放大模型。
- **路由闸门的真实阶梯（第 12 节，本轮用平台自身路由代码在生产库上只读实测）**：一次下单要连过 5 道门，且顺序固定 —— `PROVIDER_ENDPOINT_MISSING` → `MAPPING_NOT_APPROVED` → `MAPPING_INPUT_TYPES_UNVERIFIED` → `HEALTH_CHECK_STALE` → `QUOTA_CHECK_STALE`。这直接推翻了「补齐 G1-G3 就能下单」的假设：**只填端点与审核仍然 0 个模型可下单**，还必须让健康戳与配额戳保持在 15 分钟以内，而线上目前没有任何调度器做这件事（第 5 节 G4）。
- **音频工作台的三项新缺陷（第 13 节，09-25 真实浏览器点击 + 线上编译产物双向核对）**：(1) 未登录/失败时**服务端已经写好的中文提示被前端整个丢弃**，用户看到按状态码硬编码的英文，偶发还会看到半截 JSON —— 已定位到 `packages/studio/src/utils/formatError.js` 的解析形状不匹配（本站错误体是 `{error:'字符串'}`），修复后 401→「请先登录」、402→「算力余额不足，请充值或开通会员订阅。」、502/422→服务端原文，已在部署源码树上用真实响应体验证并安装（第 14 处补丁，**仍需构建才对用户生效**）。(2) 音频目录文案**在生产环境是乱码的**（13 处 cp437→UTF-8 双重编码 + 把拼写错误 `Suno Geneate Mashup` 直接摊给用户），根因是部署副本 `models.js` 落后 9 天。(3) **音频工作台完全不显示价格/积分**，而下拉的每一项在后端接口里都带 `creditsPrice`；同一次复测还推翻了我自己首次记录的「11 项静态卡片」——真实形态是**收起态 1 项 / 展开态 11 项 / 打包目录 18 条**，隐藏的 7 条经查是**没有上架目录行的模型**（11 项 join 接口 11/11 命中、7 项 0/7 命中），属正常的上架裁剪，但那层裁剪的代码来源没有定位到，属于「未被保护的隐式行为」（13.4）。**(4) 新增第 14 节**：三个工作台都没有「本次生成要花多少积分」的价格位，而权威价格**已经**被 `StandaloneShell.js:874` 取到浏览器、只用于裁剪选择器就把 `creditsPrice` 丢掉了 —— 属接线缺失，已给出可直接落地的实现契约与两条不能盲改的理由（不许造默认价、按秒计费行不能印单个数字）。

- **上一条（第 13 节）中三条结论已被第 14–17 节取代**：**(2)** 的根因不是「部署副本落后 9 天」，那 31 KB 差异绝大部分是 CRLF（真实内容差只有 14 行可见文案），该文件已整份装上线上树，乱码与 `Geneate` 拼写错误已随补丁消失（13.4 更正、15.2）；**(3)** 的价格位已实现（三个工作台的下拉项各挂一个价格标签），那层上架裁剪的代码来源也已定位到 `applyActiveModelDirectory()` 的原地 `splice`（13.4 更新）；**(4)** 的「只给契约、未实现」同样已实现，并按第 17 节用生产库逐行对账（`fixed` 31 行显示单价、`formula` 51 行自动降级为「N 积分起」、82/82 报价仍返回 `NO_COST_VERIFIED_ROUTE` ⇒ 「展示价 vs 实扣」在 G1-G3 补齐前无法比对，这是结论不是疏漏）。**当前状态：带补丁的线上源码文件累计 25 个，`.next` 仍是 09-24 14:36 的构建 ⇒ 上述修复对用户仍不可见，第 5 节 A 条的构建授权（含第 16 节的合并树前置）是唯一剩余的技术步骤。**

### 五个互相独立的上线阻断点（全部为生产配置/运营缺口，非模型本身不可用）

| # | 缺口 | 实测数据 | 后果 |
|---|---|---|---|
| G1 | 渠道端点从未落库 | `provider_models` 979/979 行 `provider_endpoint` 为空、`endpoint_config = {}` | `PROVIDER_ENDPOINT_MISSING`，报价即失败 |
| G2 | 渠道映射全部未审核 | 979/979 行 `review_status = 'needs_specification'` | `MAPPING_NOT_APPROVED` |
| G3 | 成本价版本全部未发布 | `provider_model_price_versions` 979/979 行 `status='pending_review'`、`price_type='manual'`，最新观测时间 09-22（超过 24h 上限） | `PRICE_NOT_ACTIVE` / `PRICE_STALE` |
| G4 | 健康信号本身不可信 **且** 门槛根本无法被满足（本轮已定位机制，非推断） | (a) 本次实跑 `healthCheck()`：MuAPI 仅凭 `GET /api/v1/models` 返回 200 就报 `healthy:true`，而同一时刻账户余额为 0；Kling / MiniMax / Volcengine 的 `healthCheck()` **完全不请求上游**，只判断「有没有 key」就返回 `healthy:true`（Volcengine 甚至自述 `message:'凭据已配置，未请求上游'`）。(b) 截至 09-25 12:46 UTC，11 个供应商的 `last_health_check_at` 已 **42~57 小时**未更新（9 个停在 09-24 03:07，MuAPI/OpenAI 停在 09-23 11:51），09-25 那次预定的日常探测**根本没有发生**；路由却要求 15 分钟内（`MODEL_HEALTH_MAX_AGE_MS` 未设置，实测不在 `next-server` 进程环境里 ⇒ 取默认 15min）。(c) **机制**：全仓只有 `repositories/aiCatalog.js:87 updateProviderHealth()` 会写 `last_health_check_at`，而它只被 `healthProbe.js`（后台点探测/定时任务）调用；真实流量走的熔断写库函数 `applyProviderFailure()` / `closeProviderCircuit()`（`repositories/circuitBreaker.js:28-50`）**只改 `health_status`，从不写 `last_health_check_at`** ⇒ 零流量时代自我饿死、有流量时代也永远刷新不了这个戳，构成**冷启动死锁**。(d) 服务器上 `root`/`www` 两个 crontab 全文核对：与 koyosim 相关的 4 条全是**每分钟内核一个不存在的 `artisan`**（`/home/wwwroot/AI/domain/koyosim.com/web/artisan` 实测不存在，`storage/logs/scheduler.log` 也不存在），**没有任何一条调度 Node 侧的 `probe_health` / `pricing:sync`** | 路由会放心地把任务派给一个必然失败的渠道；同时所有真正可用的渠道被 `HEALTH_CHECK_STALE` 拒掉（第 12 节实测：即使端点、审核、规格全齐，仍停在此门，补齐后下一门是 `QUOTA_CHECK_STALE`）。**（(a) 已在本轮修复，见第 4 节；(b)(c)(d) 属运营/调度缺口，需授权后落地）** |
| G5 | 唯一实际通路的供应商账户余额为 0 | 本轮用 MuAPI 官方 `GET /api/v1/account/balance` 实测（生产 key、真实返回）：`{"balance":0.0,"currency":"USD",...}`；`ai_providers.muapi.balance=0.0000 / available_quota=0`；5 条已进入队列的订单全部死在 `INSUFFICIENT_PROVIDER_BALANCE`。凭证本身**存在**（`ops_bill.provider_secrets`：muapi `api_key`+`api_key_sandbox`、google、kling、minimax 各 1 条；volcengine/runninghub 走环境变量） | 只要还走聚合网关，充值前不可能有任何模型完成真实生成 —— 这是钱的问题，代码无法替代 |

根因链条：**渠道同步作业从未运行过**（`provider_catalog_entries` 在本次检查前为 0 行，`channel_sync_runs` 无成功记录），所以供应商真实端点/规格/成本从未进入待映射队列，G1-G3 无法被填平。本次检查中已用平台自带脚本对 MuAPI 首次执行同步：**拉取并暂存 715 条真实目录（含端点与官方价）**，仅进入待映射队列，未自动改任何映射或价格（该脚本设计上不会自动审核）。

## 1. 检查方法（可复算）

1. 上架集合：`ai_models(status='active')` 920 → 通过供应商成本门 82 → `/api/models/active` 实际返回 69（13 个因供应商凭证缺失被隐藏：alibaba 6、muapi 系 wan 3、openai 2、luma 1、runway 1）。
2. 前端侧：核对 `packages/studio` 的提交调用（`${BASE_URL}/api/generation/quote`、`${BASE_URL}/api/generations`、`/api/assets/upload`）与 `config/mega-navigation.js` 的 23 个推荐位；确认「前端展示 → 报价 → 建单」链路。
3. 真实报价：用生产环境完整环境变量（从 `next-server` 进程 `environ` 注入，脚本不落盘不回显）调用平台自身 `pricingEngine.createGenerationQuote`，逐模型记录首个失败码与全部被拒原因。
4. 真实建单：调用 `generationCore.createGenerationTask`（与 `/api/generations` 同一入口）确认拒绝行为与副作用（前后对比 `creations`、积分台账、预扣记录增量为 0）。
5. 价盘核对：`provider_models.cost_config` → `provider_model_price_versions` → `model_pricing`（控制塔价盘）↔ `ai_studio.models_config`（ storefront 老价盘）→ `creations.credit_cost` / `ops_bill.credit_ledger_v2`。
6. 供应商侧：运行平台自带 `scripts/sync-muapi-channels.mjs --sync-balance/--sync-models`，读取真实供应商返回。
7. 全量条目（第 7 节）：以 `packages/studio/src/models.js` 导出的 12 个工作台数组为准，导出 **552 个条目 / 532 个去重 id**，逐条在服务端用应用自身的解析阶梯（`getCanonicalModelById` → `MODEL_ENDPOINT_ALIASES` → `findModelByEndpointOrId`）+ `pricingEngine.calculateModelPrice` + `evaluateRouteCandidates` 真实执行一遍，记录 `verdict` 与首因，产出 **附录 B**。整个过程走 `node --experimental-loader ./scripts/server-only-loader.mjs`，环境变量从生产 `next-server` 进程注入，不落盘、不回显。
8. 真实浏览器（7.6/7.7）：在生产地址 `https://www.koyosim.com/studio/{image,video}` 用 CDP 驱动 Chrome，未登录态逐控件交互（指针事件序列），记录实际渲染条目数、价格/说明文案有无、Logo 来源、选中后是否真实绑定，并与 `/api/models/active` 返回体交叉核对。凡「点击无响应」一律先用完整事件序列复测后才允许写进结论。

## 2. 主流模型逐条检查表

列含义：`模型 | 类型 | 供应商 | 前端 | API | 实际生成 | 结果展示 | 价格 | 积分扣费 | 状态 | 问题 | 修复结果`

### 2.1 文本 / LLM

| 模型 | 类型 | 供应商 | 前端 | API | 实际生成 | 结果展示 | 价格 | 积分扣费 | 状态 | 问题 | 修复结果 |
|---|---|---|---|---|---|---|---|---|---|---|---|
| gpt-4o | text | openai | ❌ 仅在推荐导航文案中 | ❌ 不进入报价 | ❌ 无任务 | ❌ 无 | 无价盘行 | 0 | ⏸ 未配置 | 推荐位声明的模型无法解析；`ai_models` 中无任何 text/LLM 模型进入上架集（0 个文本模型暴露给前端） | 已从 `MODEL_ENDPOINT_ALIASES` 删除「用别的模型冒充」的映射；改为显式待接入声明 |
| claude-3-7-sonnet | text | anthropic | ❌ 同上 | ❌ 同上 | ❌ 同上 | ❌ 同上 | 无价盘行 | 0 | ⏸ 未配置 | 同上 | 同上 |
| deepseek-r1 | text | deepseek | ❌ 同上 | ❌ 同上 | ❌ 同上 | ❌ 同上 | 无价盘行 | 0 | ⏸ 未配置 | 同上 | 同上 |

### 2.2 图像生成 / 图像编辑

| 模型 | 类型 | 供应商 | 前端 | API | 实际生成 | 结果展示 | 价格 | 积分扣费 | 状态 | 问题 | 修复结果 |
|---|---|---|---|---|---|---|---|---|---|---|---|
| bytedance-seedream-5.0-pro | image | muapi | ⚠️ 推荐位可点，studio 内无价盘 | ❌ `MODEL_PRICING_UNCONFIGURED` | ❌ 未建单 | ❌ 无 | 展示 2 积分（老表）/ 控制塔无 `model_pricing` 行 | 0 | ⏸ 未配置 | 两套价盘不一致：老表 2 积分、控制塔无行；报价引擎按价盘表拒绝凭空定价 | 删除「seedream v4.5→5.0」跨版本别名；未配价盘的模型不再显示兜底价 |
| seedream-5.0 | image | volcengine | ❌ 不在 `/api/models/active` 的 69 个之内 | ❌ `MODEL_PRICING_UNCONFIGURED` | ⚠️ 09-20 曾成功 2 次（旧路径，`quote_id` 空） | ⚠️ 那两次有真实 jpg 可预览下载 | 老表 2 积分 | 历史 2/次（旧路径） | ⏸ 未配置 | 推荐位指向的模型实际不在可下单集合；成功记录来自控制塔之外的适配路径 | 保持价盘表为唯一定价来源；需运营补 `model_pricing` 行或下架该推荐位 |
| nano-banana-pro | image | muapi | ✅ 名称/Logo/参数/价格渲染正常 | ❌ `NO_COST_VERIFIED_ROUTE[PROVIDER_ENDPOINT_MISSING]` | ❌ 未建单 | ❌ 无 | 展示 55 积分；供应商成本 $0.12/次；老表 2 积分 | 0（历史 09-21 曾扣 2、09-24 曾扣 55 —— 同模型不同日价格漂移） | ⏸ 未配置 | 展示价与老价盘冲突 27 倍；同模型两次真实扣费不一致 | 上架查询改为只读价盘行，去掉 `COALESCE(...,50)` 兜底；别名不再跨厂商替换 |
| flux-dev | image | muapi | ✅ 正常 | ❌ 同上 | ❌ 未建单 | ❌ 无 | 10 积分 | 0 | ⏸ 未配置 | 曾被别名当作 midjourney-v7 / vidu-q2 / wan2.7-pro 的替身 | 已删除全部跨厂商别名（midjourney 现解析到 `midjourney-v7` 自身） |
| midjourney-v7-text-to-image | image | midjourney | ⚠️ 推荐位可点 | ❌ `MODEL_PRICING_UNCONFIGURED` | ❌ 未建单 | ❌ 无 | 老表 2 积分 | 0 | ⏸ 未配置 | 原别名把 Midjourney 静默换成 FLUX（用户点 A 得到 B） | 别名删除后如实报「未配置价盘」，并新增「别名不得跨厂商/跨能力」测试 |
| flux-1.1-pro | image | openai（绑定错误） | ⚠️ 上架 | ❌ 报价被拒 | ❌ 未建单 | ❌ 无 | 展示价按错误绑定计算 | 0 | ⏸ 未配置 | `provider_models` 把 FLUX 绑到 `openai` | 列入待修正绑定清单（生产路由数据，需运营确认后改） |
| flux-2-klein-4b / google-imagen4-ultra / imagen-4 | image | flux / google | ❌ 推荐位有、studio 无 / 完全不在前端 | ❌ 不进入报价 | ❌ 无 | ❌ 无 | 无 | 0 | ⏸ 未配置 | 推荐位指向不存在的模型；`imagen-4` 未出现在任何前端代码中 | 删除「必须存在别名」的过期测试，改为显式待接入清单 |

### 2.3 视频生成 / 电影级长视频

| 模型 | 类型 | 供应商 | 前端 | API | 实际生成 | 结果展示 | 价格 | 积分扣费 | 状态 | 问题 | 修复结果 |
|---|---|---|---|---|---|---|---|---|---|---|---|
| kling-v3.0-standard-text-to-video | video | muapi/kling | ✅ 推荐位第 1 | ❌ `NO_COST_VERIFIED_ROUTE[PROVIDER_ENDPOINT_MISSING]` | ❌ 未建单 | ❌ 无 | 1630 积分 | 0 | ⏸ 未配置 | 41 个 `pricing_type='formula'` 视频行 `cost_config.pricing_unit` 全为 NULL，`base_credits` 是某次时长快照 → 展示价与按秒报价必然不一致 | 报价引擎保持以价盘+真实成本为准；需运营按秒重算价盘并补 `pricing_unit` |
| seedance-2.5-text-to-video | video | muapi | ⚠️ 推荐位第 2 | ❌ `MODEL_PRICING_UNCONFIGURED` | ❌ 未建单 | ❌ 无 | 展示 10 积分（老表） | 0 | ⏸ 未配置 | 曾被别名静默映射到 `seedance-v2.0`（版本替换） | 跨版本别名已删除 |
| veo3.1-text-to-video | video | muapi/google | ⚠️ 推荐位 | ❌ `MODEL_PRICING_UNCONFIGURED` | ❌ 未建单 | ❌ 无 | 10 积分 | 0 | ⏸ 未配置 | 曾被别名指向 `veo2-*`（跨代替换） | 别名已删除，如实报错 |
| sora-2-turbo-text-to-video / sora-2-pro | video | openai | ❌ 解析不到 | ❌ 不进入报价 | ❌ 无 | ❌ 无 | 无 | 0 | ⏸ 未配置 | 原别名把 Sora 静默替换成 `kling-v3.0-standard-t2v` | 别名删除后返回 `UNRESOLVABLE`；不得用别厂商冒充 |
| wan2.7-text-to-image-pro / wan2.2-image-to-video 等 alibaba 系 | image/video | alibaba | ⏸ 隐藏（供应商无凭证） | ❌ 不进入报价 | ❌ 无 | ❌ 无 | 老表 2 积分 | 0 | ⏸ 未配置 | `DASHSCOPE_API_KEY` 存在但长度为 0；健康记录 `PROVIDER_CREDENTIAL_MISSING` | 归入凭证待补清单 |

### 2.4 音乐 / 音频 / 语音

| 模型 | 类型 | 供应商 | 前端 | API | 实际生成 | 结果展示 | 价格 | 积分扣费 | 状态 | 问题 | 修复结果 |
|---|---|---|---|---|---|---|---|---|---|---|---|
| minimax-speech-2.6-hd | audio | muapi/minimax | ✅ 上架 | ❌ `NO_COST_VERIFIED_ROUTE[PROVIDER_ENDPOINT_MISSING]` | ❌ 未建单 | ❌ 无 | 展示 295 积分；老表 1 积分（295 倍） | 0 | ⏸ 未配置 | 推荐位文案把 MiniMax 标成「ElevenLabs v3」（厂商名错误）；音频未按字符/时长计费 | 展示价改为只读价盘；文案错误列入修复清单 |
| udio-130 | music | muapi | ❌ 解析不到 | ❌ 不进入报价 | ❌ 无 | ❌ 无 | 无 | 0 | ⏸ 未配置 | 推荐位声明的音乐模型无对应目录行 | 列入待接入/待删除清单 |

> 全量 69 个前端可见 + 13 个隐藏模型的逐条结论见附录 A（82 行，按 `ai_models`/`provider_models`/`model_pricing` 实测生成，无遗漏）。

## 3. 价盘链路核对：供应商价格 → 模型成本 → 平台计费 → 积分扣除

计价政策 `CREDIT_PRICING_POLICY`：`cnyPerCredit 0.07`、`usdToCny 7.2`、`providerCostReserveRate 0.10`、`targetContributionMarginRate 0.75`、`creditRounding 5`、`minimumCredits 10` ⇒ 理论换算 **积分 ≈ 成本USD × 453.5**（实测 $0.12 → 55 积分一致）。

发现的价盘缺陷（全部来自生产表实读）：

1. **两套目录价并存且互相冲突**：控制塔 `model_pricing`（千级积分）与 storefront 老表 `models_config`（1–20 积分）。09-25 用线上原始 SQL 复算后的准确口径是：**上架 82 行里 82 行的接口下发价与老表公布价都不一致 —— 77 行数值冲突、5 行老表根本没有对应行、0 行一致**（例：`nano-banana-pro` 55 vs 2、`minimax-speech-2.6-hd` 295 vs 1、`flux-schnell` 10 vs 1）。下发价的取数路径已核实到 SQL：`lib/repositories/models.js:listActiveModels()` 用 `COALESCE(pr.base_credits, 50)`，即**价盘缺行的模型会被前端直接按 50 积分宣传**（本次 82 行恰好都有价盘行，所以 `phantom50 = 0`；这是一个仍然活着的兜底，第 4 节已修）。老表 `models_config` 共 540 行、`credits_price` 取值区间只有 1–20，与千级积分的现价盘不是同一个量纲体系。
2. **同一模型不同日期扣费不同**（真实证据）：`nano-banana-pro` 09-21 扣 2 积分、09-24 扣 55 积分；`flux-schnell` 扣 10 积分。属于「展示价与实际扣费不一致」最严重形态。
3. **视频模型单位计费缺失（09-25 复算，按供应商成本形态拆开）**：上架 82 行按类型/计价方式为 **video 51 行 `formula`、image 20 行 `fixed`、audio 11 行 `fixed`**；其中 **51/51 的 `formula` 行 `pricing_unit` 为 NULL**（此前记作 41 行，是只数了部分前缀的漏算）。供应商成本形态同时实测：**31 行有 `base_cost`，51 行 `base_cost = 0` 而只有 `cost_per_second` / `cost_per_output_second`，0 行两者皆无** —— 也就是说「缺 `pricing_unit`」与「供应商按秒收费」**是同一批 51 行，完全重合**。后果是这 51 个视频模型平台侧挂的是**一口价积分**（如 `veo3-image-to-video` 5660 积分 / 供应商 $0.35·秒⁻¹、`seedance-2.5-motion-control` 3395 / $1.5·秒⁻¹、`kling-v2.1-master-t2v` 2720 / $0.15·秒⁻¹），供应商侧却按秒计费 ⇒ 用户选 5 秒还是 10 秒扣费相同，毛利随所选时长反向变化；这些行「积分/USD」比值为 2266 / 5250 / 10200 / 16171，全部偏离政策值 453.5 ⇒ **秒数计费在数据层就不成立**。
4. **`min_credits = 10` 高于部分老表公布价**（如 2 积分模型），会静默抬价。
5. **`site_price_cny` 82/82 为 NULL**：人民币本站售价未发布，售价完全由积分反推，无法与价盘表逐条对账。
6. **模型绑定错价**：`flux-1.1-pro` 绑到 `openai`；`minimax` 模型展示为 ElevenLabs。
7. **成本回写断裂**：`creations.actual_cost_usd` 全为 `0.000000`（含成功记录），`generation_cost_reconciliations` 0 行 ⇒ 无法核对真实供应商花费；`user_assets` 0 行 ⇒ 结果资产未入库，下载/复用链路缺持久化。
8. **加密供应商密钥的包裹密钥复用业务密钥**：`getWrappingKey()` 依次回落到 `ADMIN_SECRET_KEY` / `BILLING_SESSION_SECRET` / `OAUTH_STATE_SECRET`。轮换这些业务密钥会让 `provider_secrets` 全部无法解密（本次同步中已实际出现 `PROVIDER_SECRET_KEY_REQUIRED`）。属于高危配置债务，建议单独立项。

## 4. 本次已定位并直接修复的缺陷（代码层，已验证）

| 缺陷 | 位置 | 修复 | 验证 |
|---|---|---|---|
| 展示价凭空兜底 50 积分 | `lib/repositories/models.js` `listActiveModels()` | 改为只读价盘行；无 `model_pricing` 行的模型不再上架（价格可追溯到价盘表） | 生产库实读：上架集合仍为 82 行，缺失价格 0；`grep` 确认兜底字面量 0 处 |
| 报价引擎凭空定价 | `lib/services/pricingEngine.js` | 无价盘行/非法基础积分 ⇒ 抛 `MODEL_PRICING_UNCONFIGURED`，不再凭空生成价格 | 实调用：6 个无价盘行模型如实返回该码；有价盘行模型继续走到路由门 |
| 别名跨厂商/跨版本冒充（点 A 得 B） | `lib/repositories/models.js` `MODEL_ENDPOINT_ALIASES` | 删除全部跨厂商、跨版本、跨能力替换，仅保留同名改名 | `midjourney-v7-text-to-image` 现解析为 `midjourney-v7`（midjourney/2 积分）；`sora-2-*` 变为 `UNRESOLVABLE`；新增「别名不得跨厂商族/能力」测试 |
| 模糊解析命中错误模型且不确定 | `lib/repositories/models.js` 第 4/5 档 | 去掉 `%key%` 反向包含匹配，加 `ORDER BY length(id), id LIMIT 1` 保证确定性 | 解析测试全绿；82 个规范 id 解析结果无回退 |
| 未配价盘的模型可被 0 积分或幽灵价格下单 | `generationCore` 报价校验 | 已有 `MODEL_PRICE_INVALID` 保护，配合上条确保只能「明确拒绝」 | 真实 `createGenerationTask` 探测：`creations` 增量 0、积分台账增量 0、悬挂预扣 0（无副作用） |
| 下单失败时用户只看到「创建生成任务失败」 | `lib/security/publicError.js` | 为 `NO_COST_VERIFIED_ROUTE` / `MODEL_PRICING_UNCONFIGURED` / `MODEL_PRICE_INVALID` / `QUOTE_*` / `SITE_PRICE_*` / `PROMPT_*` 增加面向用户的固定文案；内部诊断仍留在 `error.code` 与服务端日志 | 逐码实跑验证输出；未知码与含 SQL/连接串文本仍返回兜底（不泄露内部信息） |
| **上架目录对主工作台完全失效**：图像下拉摊出 115 个条目、视频摊出 88 个，其中绝大多数根本不可下单（用户点了必然失败） | `packages/studio/src/modelFamilies.js` + `components/{ImageStudio,VideoStudio}.jsx` | 根因定位：`applyActiveModelDirectory()` 用 `splice` 就地裁剪 11 个基础数组，但两个主工作台的列表来自 `imageModelPickerEntries` / `videoModelMenuEntries` —— 它们在模块求值时就 `Object.freeze` 成了派生快照，挂载后的裁剪永远追不上。新增 `filterActiveModelEntries(entries)`（按 `entry.variantIds` 任一命中 `isModelActive`）并在两处 `ModelDropdown` 的分类构造里渲染期过滤 | 用**线上源码**（补丁后）+ 线上真实 69 条上架集实跑：**图像 115 → 12**（t2i 9、i2i 7）、**视频 88 → 24**（t2v 13）、基础数组 `visibleCount` 65；目录未加载/接口失败时过滤为恒等操作（115/88 不变，保持 fail-open）；默认模型由不存在的 `bytedance-seedream-5.0-pro` 自动落到 `nano-banana`。**浏览器尚未复验**，需先构建发布 |
| **主导航直链/刷新落错工作台**：`config/mega-navigation.js` 的 23 个推荐位与全部分类链接都是 `/studio?tab=<id>`，而 `getInitialTab()` 只读路径 slug | `components/StandaloneShell.js:453` | 在路径段判定之后、默认值之前增加 `?tab=` 查询回退（仍限定 `STUDIO_TAB_IDS` 白名单，路径形式优先）。站内点击原本靠 `handleMegaMenuSelect` 拦截才正确，因此只有直链/刷新/后退会暴露该缺陷 —— 现已统一 | 代码层核对：导航 18 个不同 `tab=` 取值中 **17 个** 在 `STUDIO_TAB_IDS` 内；`tab=remix` **不在**白名单（孤立导航项，仍会落到 image，需产品确认该入口是否保留）。浏览器复验同样待构建 |

| **健康检查「假绿灯」（本轮实跑发现）**：MuAPI 的 `healthCheck()` 只看 `GET /api/v1/models` 是否 200，余额为 0 也照样报 `healthy:true` ⇒ 路由把用户任务派给一个必然 402 的渠道 | `lib/adapters/MuAPIAdapter.js` `healthCheck()` | 在原有连通性探测之后追加**真实余额探测**（平台已在 `channelSync.js` 使用同一端点 `GET /api/v1/account/balance`）；余额 ≤ 0 时返回 `healthy:false` + `code:'INSUFFICIENT_PROVIDER_BALANCE'`，并把 `probeKind:'http+balance'`、`balanceUsd` 一并回传，使后台/路由都能区分「网关活着」与「能出图」 | **线上源码实跑真实上游**（生产 key、非 Mock）：`{"healthy":false,"probeKind":"http+balance","balanceUsd":0,"code":"INSUFFICIENT_PROVIDER_BALANCE","message":"网关可达但账户余额 0 USD，任何任务都必然失败"}`；修复前同一调用返回 `{"healthy":true,"message":"OK"}` |
| **凭据存在 ≠ 上游可用**：`BaseAdapter.healthCheck()` 以及 Kling / MiniMax / Volcengine 的覆写版本，仅判断「有没有 API Key」就返回 `healthy:true, message:'OK'`，全程不发出任何网络请求（Volcengine 的 message 自己写着「未请求上游」却仍报健康） | `lib/adapters/{BaseAdapter,KlingAdapter,MiniMaxAdapter,VolcengineAdapter}.js` + `lib/services/providers.js` `testProviderHealth()` | 未实现真实探测的适配器一律改为 `healthy:false` + `code:'HEALTH_PROBE_NOT_IMPLEMENTED'` + `verifiedUpstream:false` + `probeKind:'credential_only'`；后台 `testProviderHealth` 的 MiniMax / Kling 分支同步改为 `status:'degraded'` 并记录同样的诊断字段（宁可红，不可假绿） | 线上源码实跑：三家均返回 `{"healthy":false,"code":"HEALTH_PROBE_NOT_IMPLEMENTED","verifiedUpstream":false,...}`；对照两家**确有真实请求**的渠道保持 `healthy:true` —— Google（`latencyMs 219`，真实 HTTP）、RunningHub（`latencyMs 220, probeKind:'http'`，"key accepted; invalid taskId probe submitted no generation task"） |
| 聚合网关是 546/552 条的唯一通路：`createHttpGenerationProvider()` 在按模型厂牌取不到密钥时**静默回退到 MuAPI** | `lib/services/generationProviders.js:31-60`（已定位，**本轮不改**） | 这是设计而非笔误：充值 MuAPI 即可一次性打通绝大多数模型；但若按厂牌直连（google/kling/minimax/volcengine/runninghub）则必须先补 `provider_models.provider_endpoint` + 审核 + 成本发布（G1-G3）。回退时 `creation.provider` 仍显示用户所选厂牌，用户与后台都看不出实际走的是 MuAPI ⇒ 属可观测性缺陷，登记为待办而非静默改动 | 代码核对 + 台账印证：`gen_0cf241`（`provider=google`、`model=google-imagen4-ultra`）真实返回 `UPSTREAM_402`，与 MuAPI 余额为 0 的现象一致，说明该单实际由 MuAPI 承接 |

本地测试（受影响范围）：`node --test --experimental-loader ./scripts/server-only-loader.mjs tests/model-navigation-credit-link.test.mjs tests/model-pricing-routing.test.mjs tests/top-mega-navigation.test.mjs` ⇒ **23 passed / 0 failed**。

### 4.1 生产机全量回归与 5 项失败的逐条归因（本轮补测）

在生产目录以同一 loader 跑 6 个受影响测试文件：`tests/{p3/generation-input-guard, admin/social-providers, model-navigation-credit-link, model-pricing-routing, top-mega-navigation, p0/security-baseline}` ⇒ **49 tests / 44 pass / 5 fail**。5 项失败**全部不在本次补丁改过的文件里**，且全部落在**未纳入版本管理的在建文件**（`git status --porcelain` 对每个涉事文件均返回 `??`，文件时间戳 09-23 ~ 09-24 11:50，早于本轮 23:29 的补丁）：

| 失败项 | 报错实测值 | 涉事文件（均未被本轮改过） | 归因 |
|---|---|---|---|
| `P1 keeps app and component code behind the application-service boundary` | `app/api/admin/models/control/route.js`、`app/api/admin/providers/[id]/enabled/route.js` 直接引用 `@/lib/(repositories\|db)` | 两个 `?? ` 未跟踪后台路由 | 控制塔在建代码越层，属既有技术债 |
| `P1 keeps application services free of raw repository SQL calls` | `lib/services/{channelSync,modelPriceImport,modelPricingControl}.js` 含裸 SQL | 同上三个未跟踪服务 | **本地更新版测试已把这三个文件写成豁免清单**（`assert.deepEqual(violations, [三个文件])`），生产机上的 09-23 版测试还是断言 `[]` ⇒ 同一份债，两个版本的测试口径不同 |
| `P0 does not expose raw exception text ... from API routes` | `app/api/admin/models/control/route.js` | 未跟踪后台路由 | 与第 1 项同源 |
| `mega navigation config contains valid 2026 SOTA models…` | 期望 `kling-v3.0-standard-text-to-video`，实际 `kling-v2-pro` | 生产机 `config/mega-navigation.js`（09-21 20:46，18541 字节） | **仅存在于已部署副本**：本地同源文件（09-24 17:33，21240 字节）该位已是 `kling-v3.0-standard-text-to-video`，与测试断言一致 ⇒ 属「本地已改、未发布」 |
| `2026 SOTA models are registered in MODEL_ENDPOINT_ALIASES…` | `flux-2-klein-4b must have an alias` | 同上 | 本地更新版测试已把 `flux-2-klein-4b` 等 5 个键显式登记为 `PENDING_CATALOG_KEYS`（宁可标待配置，也不许别名指到别的厂牌）⇒ 同为「本地已改、未发布」 |

结论：**本轮 13 处补丁没有引入任何测试回归**；5 项失败中 3 项是在建后台代码的既有越层/裸 SQL/错误外泄债，2 项是生产机上「测试与导航配置都比本地旧一版」造成的口径差。同时这也再次印证第 5.A 节：**线上跑的仍是 09-24 14:36 的旧构建**，本地工作树里的修复与调整都还没被用户看到。


## 5. 需要授权或运营执行的上线动作（代码无法替代）

A. **上线已修复源码**（当前只改了部署目录源文件，运行中的构建仍是旧逻辑，前端仍显示 `flux-pro 20`、`imagen-4 55` 等旧价）：

   部署状态：**十四处源码补丁**已安装到线上源码树，服务端属主/权限保持 `www:www 644` 不变；`.next` 构建产物未重建（线上 bundle 仍是 09-24 14:36 的 `ahF8q-_fpA6cgZkL5QuZF`），因此**用户可见行为尚未变化**。第十五处（`config/mega-navigation.js` 推荐位改标）**只存在于本地工作树**，原因见该文件条目。（09-25 曾记为「十四处」，其中 `lib/services/generationCore.js` 一处经复核属测试专用分支的无效改动，**已在线上与本地同时回滚**，理由与验证见第 10.3 节；同日新增的第十四处是 `packages/studio/src/utils/formatError.js`，见第 13.3 节。）

> **09-25 第二轮更新（第 15 节）**：第 14 节的价格显示已实现并装进线上源码树，本轮写入 **14 个文件**（11 个是首次进表：`packages/studio/src/modelPrice.js`、`ModelPriceTag.jsx`、6 份 `modelPrice.json`、`app/api/models/active/route.js`、`packages/studio/src/models.js`、`AudioStudio.jsx`；3 个是二次改动：`lib/repositories/models.js`、`ImageStudio.jsx`、`VideoStudio.jsx`）。**带补丁的文件累计 25 个**，`.next` 仍未重建，因此用户可见行为依旧未变。逐文件哈希、只含本次意图的 diff 证明与回滚方式见第 15 节。
   - 后端 3 处（`node --check` 通过；`lib/security/publicError.js` 服务端 md5 与本地一致 `9a1b40fcd6bc9e9cfdd2273399a13e47`）：`lib/repositories/models.js`、`lib/services/pricingEngine.js`、`lib/security/publicError.js`
   - 前端 5 处（JSX 无法在本机/服务端单独编译校验，改用「锚点唯一性 + 补丁后导入实跑」验证：`node --input-type=module -e` 引入补丁后的 `modelFamilies.js` ⇒ `IMPORT OK, hasFilter=function, imgEntries=115, menuEntries=88`）：`packages/studio/src/modelFamilies.js`、`packages/studio/src/components/ImageStudio.jsx`、`packages/studio/src/components/VideoStudio.jsx`、`components/StandaloneShell.js`、`packages/studio/src/utils/formatError.js`（最后这处是纯函数，已在服务端用部署后的文件实跑 4 条真实响应体 + 5 条回归，见 13.3）
   - 供应商健康探测 6 处（`node --experimental-loader scripts/server-only-loader.mjs` 直接导入补丁后的线上源码并**对真实上游发起请求**验证，见第 4 节两张新表）：`lib/adapters/BaseAdapter.js`、`lib/adapters/MuAPIAdapter.js`、`lib/adapters/KlingAdapter.js`、`lib/adapters/MiniMaxAdapter.js`、`lib/adapters/VolcengineAdapter.js`、`lib/services/providers.js`
   - **`config/mega-navigation.js` 不在上面这十四处之内，也不能手工补丁生产副本**（本轮实测确认）：生产机上是 **09-21 20:46 / 18541 B** 的旧修订，本地工作树是 **09-24 17:33 / 21240 B** 的新修订，两者的推荐位键集合已经不同 —— 旧副本的音频位写的是 `modelKey: 'elevenlabs-v3'`（第 462 行，**目录/价盘/别名表里根本不存在这个 id**，点击必然静默回落），视频位是 `kling-v2-pro`，另有 `minimax-hailuo`、`runway-gen3-alpha`、`cogvideox-5b`、`suno-v4`、`vidu-q2`、`flux-2-klein`、`kling-o3`。若只把「ElevenLabs → MiniMax」这一处字符串在生产副本上改掉，等于用旧目录覆盖新目录，会把本地已经修好的 23 个推荐位一起回退。**正确做法：随下一次构建整份发布本地树**（`npm run build` 会读取仓库根的 `config/mega-navigation.js`），不单独改生产副本。
   1. `cd /home/wwwroot/AI/domain/koyosim.com/web && npm run build`
   2. 重启 `next-server`（PM2/systemd）——会造成可见瞬时中断，**等待授权后执行**。
   3. 已备份，可随时回滚：后端 `lib/repositories/models.js.bak-20260924`、`lib/services/pricingEngine.js.bak-20260924`、`lib/security/publicError.js.bak-20260924`；前端 `packages/studio/src/modelFamilies.js.bak-20260924b`、`packages/studio/src/components/ImageStudio.jsx.bak-20260924b`、`packages/studio/src/components/VideoStudio.jsx.bak-20260924b`、`components/StandaloneShell.js.bak-20260924b`、`packages/studio/src/utils/formatError.js.bak-20260925b`（以 `cp -a` 创建，保留原属主与时间戳）；健康探测 6 个文件为同名 `.bak-20260924c`；`lib/services/generationCore.js.bak-20260925` 保留在原位，但它现已与该文件**内容完全相同**（第 10.3 节那次改动已回滚，此备份只是回滚来源的证据）。
   4. 构建发布后的前端复验清单（本机无法提前验证，因为 JSX 编译链在本地与服务端均不可用）：直链 `/studio?tab=video` 刷新后落在视频工作台；无价盘模型下单时显示新的可读错误文案而非「创建生成任务失败」；**三个工作台的下拉条目数与价格标签**逐项见 15.4。
      下拉条目数的期望值本轮已用「服务器侧真实执行补丁后的目录代码 + 真实生产库」重算过一次（09-25，`applyActiveModelDirectory` 实跑，非估算）：图像 **115 → 13**、视频 **88 → 26**、音频 **11 不变**。当前线上构建对应的同一实跑值是 115 → 12、88 → 24（与 7.7 的浏览器实测一致，可作为该方法的准确性佐证：方法在旧数据上复现了旧实测）。差额来自上架查询新增的 13 行（`listActiveModels` 69 → 82）。
   5. **价格标签复验（第 15 节新增）**：`fixed` 行必须显示「N 积分」且 N 与 `model_pricing.base_credits` 逐条相等；`formula` 行必须显示「N 积分起」而不是「N 积分」；无上架行必须显示「暂无价格」。三个工作台各截图一次并与生产库对账，这一项做完才算补上检查清单「前端展示价 vs 实际扣费」那一栏。
   6. **音频工作台复验项（第 13 节新增，必须逐项在浏览器里看过才算通过）**：
      - 未登录点击 `Generate Track` ⇒ 提示应为服务端原文「请先登录」，不再是英文 `Authentication failed. Please check your account session or API key.`；余额不足 ⇒ 「算力余额不足，请充值或开通会员订阅。」；供应商异常/参数错误 ⇒ 显示服务端中文文案且**不出现半截 JSON**（4 条真实响应体的修复前/修复后对照见 13.3）。
      - 模型清单里的 13 处 `ΓÇö` / `â€` 乱码与 `Suno Geneate Mashup` 拼写错误消失（见 13.4，属 `packages/studio/src/models.js` 部署副本落后 9 天，随构建发布本地树即可）。
      - ~~音频卡片**补上价格/积分显示**~~ —— **本轮已实现并装进线上源码树（未构建）**：下拉每一项右侧新增价格位，三个工作台全覆盖，实现与验证见第 15 节。当前线上构建仍是 0 处价格。
      - **数音频下拉的条目数**：真实展开后当前是 **11 项**，打包目录是 18 条，隐藏的 7 条是「无上架行」的正常裁剪结果（见 13.4）。**期望值仍是 11**；若发布后变成 18，说明那层裁剪失效了，需要停下来查而不是放行。该裁剪的代码来源本轮已定位（见 13.4 末段更新），不再是来源不明的隐式行为。

B. **填平 G1-G3（用平台自带的控制塔动作，不手写 SQL）**，顺序即产品设计的审核流：
   `sync_models`（已对 MuAPI 执行，715 条待映射）→ `map_catalog`（`createCatalogMapping`，写入真实 `provider_endpoint` + 规格）→ `review_mapping`（`reviewProviderMapping` 通过）→ `update_mapping_spec`（补 `supported_resolutions/durations/qualities`，视频必须补 `pricing_unit`）→ `sync_prices` → `stage_price` → `approve_price`（`price_type='aggregator'/'account_actual'`，24h 内需有新鲜观测）→ `publish_site_price`（补 `site_price_cny`）。
   ⚠️ **本节只覆盖第 12 节实测阶梯的 A→C 三层**。按第 12 节的只读实跑：端点、审核、规格三项补齐之后，判定仍会依次停在 `HEALTH_CHECK_STALE` 与 `QUOTA_CHECK_STALE` 两道 15 分钟新鲜度门上。因此 **B 必须与 C 的调度项同时落地**，单做 B 的结果是「运营忙完一轮，前端依旧 0 个模型可下单」。

C. **修 G4（分两步，第 1 步本轮已完成）**：
   1. ~~健康信号本身是假的~~ —— **已修复**：MuAPI 的健康检查现在会把真实余额纳入判定（余额 0 ⇒ 不健康），Kling / MiniMax / Volcengine 这类「只看 key 不请求上游」的探测不再返回 `healthy:true`（详见第 4 节）。
   2. **仍需运营执行，且本轮把范围从「健康」扩大到「健康 + 配额」两件事**：
      - 事实核对（09-25 12:46–13:01 UTC 实测）：11 个供应商的健康戳已 **42~57 小时**未刷新，09-25 的日常探测**没有发生**；服务器上没有任何 Node 侧调度（详见第 12.1 节的 crontab 核对）。
      - 机制核对：`last_health_check_at` 只由 `aiCatalog.js:87 updateProviderHealth()` 写入，而真实下单流量走的熔断函数（`repositories/circuitBreaker.js:28-50`）**不写这一列** ⇒ 靠流量把戳刷新鲜是不可能的，必须有独立调度。
      - 因此需要：把 `probe_health` 与**配额/余额同步**一起纳入 5–10 分钟定时器（两者各自的门槛都是 `MODEL_*_MAX_AGE_MS` 默认 15min；`MODEL_HEALTH_MAX_AGE_MS` 实测不在进程环境里），或显式放宽这两个阈值 —— 但放宽阈值等于放弃「不把任务派给已知死渠道」的保护，属产品取舍，需业主确认。
      - **上线顺序警告**：在第 1 步（健康口径变诚实）随构建生效**之前**跑探测，会把 11 个供应商全部按旧逻辑标成 `healthy`，从而制造一块「全绿但一个都不能用」的假看板 —— 这正是本次检查禁止的做法。正确顺序是：构建发布（含第 4 节 6 处适配器修复）→ 再启用探测调度 → 再充值。
      - 充值之后 MuAPI 会被如实标为 `degraded`/`healthy` 中真实的那一个；在此之前定时器把 muapi 标为 degraded 是预期行为而不是新故障。

D. **修 G5（真正的「钱」问题，代码无法替代）**：
   - 实测 MuAPI 账户余额 `0.00 USD`（官方 `GET /api/v1/account/balance`，HTTP 200，本轮真实调用）⇒ **充值即打通 546/552 条前端条目**，因为它们全部经 `createHttpGenerationProvider()` 回落到 MuAPI 网关。这是最短路径。
   - **更正此前的一处误判**：`KLING/MINIMAX/GOOGLE/MUAPI_API_KEY` 环境变量长度确实为 0，但 `getServerProviderApiKey()` 会回落到 `ops_bill.provider_secrets`（AES 加密），本轮已成功解密取到 muapi(64 字符)、google(53)、kling(56)、minimax(126)、volcengine(46, 来自环境变量)、runninghub(32, 来自环境变量) 六家可用密钥 ⇒ **`PROVIDER_SECRETS_ENCRYPTION_KEY` 已正确配置并可用，无需再为此新建密钥**；此前「凭证缺失」的说法只对 env 成立，对系统整体不成立。
   - **确实没有任何凭证**的渠道：`alibaba/dashscope`、`openai`、`luma`、`runway`、`byteplus`（`byteplus` 还额外处于 `enabled=false`）⇒ 这 5 家的模型即使完成 G1-G3 也只会停在 `PROVIDER_NOT_CONFIGURED`。
   - 凭证在但**额度未验证**：`kling`、`minimax`、`volcengine`、`runninghub`（`runninghub` 网关真实握手成功「key accepted」，但其余额接口用 `Authorization: Bearer` 返回 `412 TOKEN_INVALID`，需按其要求换鉴权头后才能读额度）；`google` 网关握手正常，历史上以 `UPSTREAM_402` 失败过（该单实际由 MuAPI 承接）。

E. **价盘决策**（业务问题，不能由代码猜）：确定唯一价盘（建议以 `model_pricing` 为准），重算 41 个视频模型按秒价格、音频按字符/时长价格，设 `pricing_unit`，复核 `min_credits`，把 77 个冲突项拉平；修复 `flux-1.1-pro→openai` 等错误绑定。

F. **推荐位与能力对齐**（逐条证据见第 9 节）：
   - ~~修正「MiniMax 显示为 ElevenLabs」等文案~~ —— **本轮已改**：`config/mega-navigation.js` 音频推荐位改为它真正交付的 `MiniMax Speech 2.6 HD / MiniMax`（本地工作树 09-24 17:33 修订；`modelKey` 与 `href` 未动，只把厂牌/显示名对齐到实际交付的模型）。**发布方式见 A 条**：生产副本是 09-21 的旧修订，音频位仍写着目录里根本不存在的 `elevenlabs-v3`，必须整份发布本地树，不能只在这份旧副本上改字符串。
   - **仍待产品决策（未擅自改）**：`udio-130`、`deepseek-r1`、`claude-3-7-sonnet`、`gpt-4o` 四个推荐位既无模型行也无价盘，而 `openai-sora-2` 指向的后台行是 `disabled` —— 目前点这些位置的后果是**工作台静默停在默认模型、不报任何错**（`applyModelSelection()` 查不到 id 就直接 return）。要么接入、要么给出「即将上线」不可点态，不能保持现在的假可点。
   - **仍待运营复核**：`MODEL_ENDPOINT_ALIASES` 把 `bytedance-seedream-5.0-pro` 改写成非 Pro 的 `seedream-5.0`，而后两者在后台各自有行 ⇒ 建议删除该改写，让 Pro 行自己定价；另外 8 个推荐位现在会把 1630 / 815 / 365 / 340 / 295 / 55 / 45 这类**尚未经供应商成本核实**的公式价直接展示给用户，上线前须逐条确认 `formula_config` 的计费单位（视频按秒、音频按字符）。


G. **成本与资产闭环**：修复 `actual_cost_usd` 回写、启用 `generation_cost_reconciliations`、恢复 `user_assets` 落库，否则价格与结果都无法对账。

## 6. 复测要求

B–E 完成任意一个模型后，必须按用户视角复测：`/api/models/active` 可见 → studio 内选中 → 真实提交（带 `Idempotency-Key`）→ 报价通过 → `creations` 出现 `queued` → worker 执行并写 `generation_attempts` → 结果 URL 可预览/下载/复用 → `credit_ledger_v2` 扣费等于报价积分 → 失败/超时/额度不足场景文案可读且不泄露内部信息。本报告附录表即为复测模板。

## 7. 全量核查：前端工作台真正可选的 532 个模型（补全「不允许遗漏」）

前 6 节的范围是「后台上架集合 82」。第二轮把范围反过来，从**用户在前端真正能点到的模型**出发：解析 `packages/studio/src/models.js` 导出的 12 个工作台目录数组（`t2iModels` / `i2iModels` / `t2vModels` / `i2vModels` / `v2vModels` / `audioModels` / `lipsyncModels` / `imageLipSyncModels` / `videoLipSyncModels` / `recastModels` / `motionControlModels`），得到 **552 个条目 / 532 个不同模型 id**，然后把每一条都送进**部署环境里平台自身的报价函数** `pricingEngine.calculateModelPrice({ modelId, parameters })`（生产库、生产环境变量、并发 6、单条 25s 超时；纯读路径，`persistDecision=false`，执行前后 `creations`/积分台账/预扣记录增量均为 0）。

### 7.1 逐工作台结论（真实代码路径执行，非推断）

| 工作台目录 | 条目 | 无价盘行 | 有价盘但无可用渠道 | 后台完全无此行 | 可报价 | 状态 |
|---|---|---|---|---|---|---|
| `t2iModels` 文生图 | 78 | 68 | 10 | 0 | 0 | ⏸ 未配置 |
| `i2iModels` 图生图/编辑 | 76 | 72 | 4 | 0 | 0 | ⏸ 未配置 |
| `t2vModels` 文生视频 | 105 | 95 | 10 | 0 | 0 | ⏸ 未配置 |
| `i2vModels` 图生视频 | 173 | 160 | 13 | 0 | 0 | ⏸ 未配置 |
| `v2vModels` 视频转视频 | 67 | 57 | 10 | 0 | 0 | ⏸ 未配置 |
| `audioModels` 音乐/语音 | 18 | 0 | 12 | 6 | 0 | ❌ 不可使用（6 条后台不存在）+ ⏸ 未配置（12 条） |
| `lipsyncModels` 口型 | 15 | 10 | 5 | 0 | 0 | ⏸ 未配置 |
| `imageLipSyncModels` | 9 | 6 | 3 | 0 | 0 | ⏸ 未配置 |
| `videoLipSyncModels` | 6 | 4 | 2 | 0 | 0 | ⏸ 未配置 |
| `recastModels` 换脸/换体 | 3 | 0 | 3 | 0 | 0 | ⏸ 未配置 |
| `motionControlModels` | 2 | 0 | 2 | 0 | 0 | ⏸ 未配置 |
| **合计** | **552** | **472** | **74** | **6** | **0** | — |

逐条明细（含前端 id、后台状态、价盘积分、老表积分、绑定数、已审核数、端点已填数、实测失败码）见 **附录 B：`docs/audit-data/model-availability-532.psv`**。

### 7.2 模型 ID / 路由正确性：解析层是对的，问题不在这里

用平台自身的解析阶梯（`getCanonicalModelById` → `MODEL_ENDPOINT_ALIASES` → `findModelByEndpointOrId`）逐条解析 552 个条目：**546 条在第一阶就命中同一个 id，0 条发生 id 替换**，即不存在「用户选 A 模型、系统跑 B 模型」的错误路由。6 条完全无法解析，全部在音频目录：`suno-convert-to-wav`、`elevenlabs-text-to-dialogue-v3`、`gemini-2-5-pro-tts`、`gemini-3-1-flash-tts`、`minimax-music-3.0`、`elevenlabs-tts-turbo-2-5`（`ai_models` 中 id 与 slug 均无行，用户可选中并点击生成，必然失败 → ❌ 不可使用）。

### 7.3 渠道绑定与供应商凭证：546/552 条的唯一通路是 MuAPI 网关

| 供应商 | enabled | health | balance | `provider_secrets` 条数 | 被绑定条数 |
|---|---|---|---|---|---|
| MuAPI 聚合网关 | true | degraded | 0 | 2 | 546 |
| 快手可灵官方 | true | degraded | 0 | 1 | 10 |
| 阿里百炼 DashScope | true | degraded | 0 | 0 | 7 |
| MiniMax 官方 | true | degraded | 0 | 1 | 5 |
| BytePlus ModelArk | **false** | degraded | 0 | 0 | 5 |
| Runway 官方 | true | degraded | 0 | 0 | 3 |
| 火山方舟 Ark | true | degraded | 0 | 0 | 2 |
| Google Imagen/Veo | true | degraded | 0 | 3 | 2 |
| RunningHub | true | degraded | 0 | 0 | 2 |
| OpenAI 官方 | true | degraded | 0 | 0 | 1 |

- 11/11 供应商 `balance = 0.0000`、`health_status = 'degraded'`。**但「degraded」这个词此前并不可信**：本轮实跑发现 MuAPI 的适配器 `healthCheck()` 自己返回的是 `healthy:true`（只看模型列表 200），也就是说后台记录的 degraded 来自另一条每日批量作业，而**路由真正读取的信号是假的**（详见第 8 节，已修复）。
- 凭证分布需要更正口径：`provider_secrets`（DB 加密）里确实只有 muapi×2 / google×3 / kling×1 / minimax×1，其余为 0 行；但 `getServerProviderApiKey()` 会**先读环境变量再回落到 DB**，所以 `volcengine`（`VOLCENGINE_API_KEY`）与 `runninghub`（`RUNNINGHUB_API_KEY`）同样持有可用密钥。真正**两头都没有**的是 `openai`、`alibaba/dashscope`、`luma`、`runway`、`byteplus`。
- 即便如此，这 546 条前端条目仍然把 MuAPI 当作唯一实际出口（`createHttpGenerationProvider()` 取不到厂牌密钥时静默回退 muapi），而 MuAPI 余额实测为 **0.00 USD**，所以「全部可选模型」实际上吊在同一个已耗尽的网关上 —— 这是本轮定位到的**单一最致命阻断点**。
- BytePlus 被绑定 5 条但 provider 已禁用 → 这 5 条永远是 `PROVIDER_DISABLED`；且 `getServerProviderApiKey({provider:'byteplus'})` 也取不到密钥（`ARK_API_KEY` 不在其 `envNames` 映射内，适配器只能靠显式传参）。

### 7.4 价盘一致性：两套价格在可报价集合上 100% 冲突

74 个「有价盘行且前端可选」的条目，**74 个的控制塔价盘积分与 storefront 老表积分不一致**（不是个别模型问题）：`suno-create-music` 老表 1 vs 价盘 45、`minimax-speech-2.6-hd` 老表 1 vs 价盘 295、`nano-banana-pro` 老表 2 vs 价盘 55、`flux-pro` 老表 20 vs 价盘 55 等。前端展示读老表、扣费读价盘，二者一旦同时生效必然出现「显示 1 积分、扣 295 积分」。第 4 节的修复已把展示价改为只读价盘行、删除 50 积分兜底，但要真正一致仍需运营把两套价合并成一套（第 5 节 F）。

### 7.5 反向遗漏：后台显示可用、前端却点不到

- 后台 82 个上架模型里有 **14 个在任何工作台目录中都没有条目**，用户无法选择：`flux-pro`、`gpt-image`、`imagen-4`、`wan-2.1`、`kling-2.6`、`flux-1.1-pro`、`hailuo-02`、`ai-clipping`、`flux-schnell-image`、`veo-2-text-to-video`、`veo-2-image-to-video`、`luma-dream-machine`、`wan2.1-t2v-14b`、`wan2.1-i2v-14b`。
- 扩展到整个注册表：920 个 `status='active'` 模型中 **399 个前端点不到**（video 215、image 101、audio 20、text 47、other 16），其中 19 个已经配了价盘行（等于「已经定价但没有任何入口」）。逐条见 **附录 C：`docs/audit-data/backend-active-not-frontend-reachable.psv`**。
- 结论：`后台可用` ⊄ `前端可选`，`前端可选` ⊄ `后台可下单`。这是本次审计最大的结构性缺陷 —— 三套目录（`ai_models` 927/920、`models_config` 540、打包内静态目录 532）互不校验，任何一套单独看都是「绿的」。

### 7.6 真实浏览器实测（2026-09-24 14:45–14:52 UTC，未登录态）

| 检查项 | 实测结果 |
|---|---|
| `/studio?tab=video` | 渲染的是 **Image Studio**（标题 `START CREATING WITH SEEDREAM 5.0 PRO`、1:1 比例、张数 /4、Draw/Generate）。`?tab=` 参数被忽略，与源码结论一致，现已在浏览器中复现；只有路径形式 `/studio/video` 正确 |
| 图像模型下拉 | **可以正常打开、可以正常选中**（见下方「勾选链路实测」）。打开后列表容器 `scrollHeight 7362 / clientHeight 234`，实际渲染 **115 行**（`t2iModels` 78 + `i2iModels` 76 去重），来源是**打包内的静态目录**，不是 `/api/models/active`（该接口匿名访问返回 200 / 69 条）。即用户可点的模型里最多 69 个在价盘上，其余必然下单失败 |
| 名称 / Logo | 名称正常；Logo 全部指向第三方 `https://cdn.muapi.ai/models/*.png`（单点依赖，域名不属于本站） |
| 模型说明 | **完全没有**：下拉项只有「名称 + 厂牌」，`/api/models/active` 返回体也不含 `description` 字段（实测 `desc: null`），所以说明无处可显示 |
| 价格 / 积分消耗 | **完全没有**：Image 与 Video 工作台整页文本中不含任何「积分 / credits」字样（脚本检测 `hasCreditorPrice=false`、`costInSettings=false`），用户在点击生成前看不到任何价格 |
| 参数 / 下拉框 | Image：比例、张数、Draw 面板可选；Video：`From prompt`、`Standard speed`、`16:9`、`5s`、`720p`、`Settings`（仅 `Generate audio` 开关）。参数控件本身可交互 |
| 可选择性 | **图像、视频两个工作台的模型下拉都能正常打开并选中**（详见 7.7）。Video 工作台默认模型为 `Kling 3.0`：可灵**凭证其实是可用的**（`provider_secrets.kling:api_key` 可解密，长度 56；此前「长度为 0」只描述了环境变量那一半），但该模型仍下不了单 —— 渠道映射未审核 + 从未有一次对可灵的真实调用被记录 + 额度未验证 ⇒ 属于「默认展示了一个当前接不通的模型」，控件本身不失效 |
| 厂牌标注错误 | `Topaz Image Upscale` 标为 **OpenAI**；`GPT-4o` / `GPT-4o Mask Edit` 出现在**图像**目录（文本模型按图片计费单位）；`AI Object Eraser`、`AI Ghibli Style`、`AI Product Photography` 等标为 **Fal**，而 `ai_providers` 中不存在 fal；`Api Node`、`Add Image Watermark`、`Image Passthrough` 这类非生成条目也混在模型列表里 |
| 错误提示 | 未登录可进入工作台并点击 Generate；下单失败时用户看到的是通用文案（第 4 节已补充面向用户的文案映射，但需构建后才生效） |

### 7.7 下拉控件逐个真实交互结果（2026-09-24 15:03–15:05 UTC，补测）

> 方法学更正：首轮我用 `element.click()` 单事件点击模型按钮，得到「不弹出列表」的结论并据此写成缺陷。**该结论已撤销** —— 这类 popover 的触发器只响应完整指针序列。改用 `pointerover→pointerenter→pointerdown→mousedown→pointerup→mouseup→click` 真实序列后，两个工作台下拉均正常打开。记录在此以免后续复测重蹈。

| 工作台 / 控件 | 实测 |
|---|---|
| Image → 模型按钮（默认 `Seedream 5.0 Pro`，172×38 px，非 disabled） | 打开成功。分类页签 `All / Text to Image / Image to Image`；`All` 下列出 **115 行**（名称 + 厂牌），首行 `Muse Image Edit / Meta`，末行 `AI Image Upscaler / Fal`；`hasCredits=false`、`hasDollar=false`（整块弹层无任何价格文案） |
| Image → 选中一行（点击 `Topaz Image Upscale / OpenAI`） | **绑定成功**：标题由 `START CREATING WITH SEEDREAM 5.0 PRO` 变为 `START CREATING WITH TOPAZ IMAGE UPSCALE`，弹层自动关闭，工具条出现该模型名。同时其**价格位显示为单个 `-`**（无兜底、无提示，用户不知道是「未定价」还是「免费」） |
| Video → 模型按钮（默认 `Kling 3.0`） | 打开成功，且是**带分类页签的完整目录**：`All` ≈82 行、`Text to Video` ≈48 行、`Image to Video` ≈52 行、`Video Tools` ≈33 行（含 `Depth Anything V2`、`Video Background Remover / Muapi` 等工具型条目）。整块弹层同样无任何积分/价格文案 |
| Video → 参数位 | `From prompt`、`Standard speed`、`16:9`、`5s`、`720p`、`Settings` 均可交互；与 Image 不同，Video 工作台**连 `-` 这个价格位都没有**，下单前完全无价 |

结合 7.1–7.4：控件层「可选、可切换、可提交」，但 552 个条目**没有一个能拿到报价**，因此前端把 115/82 个必然失败的选项原样摊给了用户 —— 而 `/api/models/active` 返回的 69 条上架集**从未参与过渲染**（`applyActiveModelDirectory` 只在 `components/StandaloneShell.js:882` 被调用，`ImageStudio.jsx`/`VideoStudio.jsx` 既不 import 也不查询 `isModelActive`；且 `isModelActive` 在 `activeModelIds === null` 时 fail-open）。

## 8. 供应商真实凭证 / 额度 / 健康探测核对（本轮补测，全部为真实上游调用）

方法：在**生产服务器**上用生产环境变量（从运行中的 `next-server` 进程注入，不落盘、不回显）直接 `import` 线上适配器源码，实例化后调用其 `healthCheck()`；密钥一律只打印**长度**，从不打印值。表里的「修复前 / 修复后」是**同一个调用的两次真实返回**，不是推断。

| 供应商 | 密钥来源（`getServerProviderApiKey` 解析顺序） | 长度 | 修复前 `healthCheck()` 实跑返回 | 修复后 | 是否真的请求了上游 | 额度实测 |
|---|---|---|---|---|---|---|
| muapi（聚合网关，546/552 条唯一出口） | DB `provider_secrets muapi:api_key` / `api_key_sandbox` | 64 | `{healthy:true, latencyMs:996, message:'OK'}` —— 仅凭 `GET /api/v1/models` 200 | `{healthy:false, probeKind:'http+balance', balanceUsd:0, code:'INSUFFICIENT_PROVIDER_BALANCE', message:'网关可达但账户余额 0 USD，任何任务都必然失败'}` | **是**（列表 200 + 余额 200） | `GET /api/v1/account/balance` ⇒ `{"balance":0.0,"currency":"USD"}`（本站账户，HTTP 200） |
| google | DB `google:api_key` | 53 | `{healthy:true, latencyMs:219}` | 不变（本来就是真实探测） | **是** | 无余额端点（`account_balance_api_supported=f`）⇒ 未知 |
| runninghub | env `RUNNINGHUB_API_KEY` | 32 | `{healthy:true, latencyMs:220, probeKind:'http', status:200, message:'... key accepted; invalid taskId probe submitted no generation task'}` | 不变 | **是**（真实 200，且确认未产生任务） | 读取失败：`/api/openapi/v1/user/amount` 用 `Authorization: Bearer` 返回 `{"code":412,"msg":"TOKEN_INVALID"}` ⇒ 探测头需按其约定更正 |
| kling | DB `kling:api_key` | 56 | `{healthy:true, latencyMs:0, message:'OK'}` —— **零网络请求** | `{healthy:false, code:'HEALTH_PROBE_NOT_IMPLEMENTED', verifiedUpstream:false}` | 否 | 未知（从未有一次对可灵的真实生成请求被记录） |
| minimax | DB `minimax:api_key` | 126 | 同上（`latencyMs:0`，假绿） | 同上改为不健康 | 否 | 未知；顺带发现其余额端点猜测 `/v1/account/balance` 返回 `404 page not found`，需按官方路径更正 |
| volcengine | env `VOLCENGINE_API_KEY` | 46 | `{healthy:true, probeKind:'credential', message:'凭据已配置，未请求上游'}` —— **自相矛盾：自己写着没探测却报健康** | `{healthy:false, code:'HEALTH_PROBE_NOT_IMPLEMENTED'}` | 否 | 未知 |
| alibaba / dashscope | 无（env 长度为 0，DB 无行） | 0 | 直接判「未配置 DASHSCOPE_API_KEY」 | 不变 | n/a | n/a |
| openai / luma / runway | 无 | 0 | — | — | n/a | n/a |
| byteplus | 无（`ARK_API_KEY` 长度 46 **不在** `PROVIDER_ENV_KEYS` 映射里，`getServerProviderApiKey({provider:'byteplus'})` 取不到） | 0 | — | — | n/a | 值得注意：09-20 两次成功出图走的正是 `BytePlusAdapter` 的 `seedream-5-0-lite-260128` ⇒ 这条通路历史上真实工作过，如今 `ai_providers.byteplus.enabled = false` 且密钥解析不到 |

三条由此得出的结论：

1. **`BaseAdapter.healthCheck()` 是所有未覆写该方法的适配器的兜底**，它原本「只要有 key 就 healthy」⇒ 任何新增供应商在不写探测的情况下都会默认变绿。本轮修的是**默认值**，属于结构性修复，不只是给 kling/minimax 打补丁。
2. **`createMockGenerationProvider()` 在整个 `lib/` 中没有任何调用点**（全仓检索只有定义处一行）⇒ 不存在「用户点到 Mock 假出图」的路径；本报告全部可用性结论也均来自真实上游请求与真实生产库，未使用 Mock 或假数据。
3. MuAPI 的 `GET /api/v1/models` 返回体里**逐模型自带真实成本**（例如 `"name":"creatify-lipsync" ... "cost":0.04,"cost_currency":"USD"`），且 `ai_providers.muapi` 已登记 `account_balance_api_supported=t` 与余额端点 ⇒ G3（成本发布）完全可以在**不猜价**的前提下用平台自带的 `sync_prices → stage_price → approve_price(price_type='aggregator')` 填平，数据源是供应商真实报价，而不是人工估值。这是本轮找到的、填平价盘的最合法路径。

## 9. 首页「重点推荐」导航位逐条核对（23 个广告位，全部实跑解析阶梯 + 生产库对照）

导航位是流量最大的入口（`config/mega-navigation.js`，`badge: TOP/NEW`），且 `?model=` **确实生效**（`components/StandaloneShell.js:481/522` 读取，`{Image,Video}Studio.jsx` 的 `applyModelSelection()` 消费），所以推荐位的 `modelKey` 写错就是字面意义上的「用户点 A、系统跑 B」。本轮把 23 个推荐位逐个跑过解析阶梯并对照后台/价盘/线上目录：

| 推荐位显示名 | 声称厂牌 | 工作台 | modelKey | 解析结果（实际下单用的 id） | 后台 `ai_models` | 价盘 `model_pricing` | 老表 `models_config` | 线上目录 69 条 | 状态 |
|---|---|---|---|---|---|---|---|---|---|
| Seedream 5.0 Pro | Bytedance | image | `bytedance-seedream-5.0-pro` | ⚠️ 别名改写为 `seedream-5.0`（Pro 行存在但被绕过） | active | 无行 | 2 | **MISS** | ❌ 不可使用 |
| Seedream 5.0 | Bytedance | image | `bytedance-seedream-v5.0` | ⚠️ 同上，与 Pro 落到同一 id | active(经 seedream-5.0) | 无行 | 2 | **MISS** | ❌ 不可使用 |
| FLUX.2 Klein | Black Forest | image | `flux-2-klein-4b` | 同名命中 | active | 无行 | 2 | MISS | ❌ 不可使用 |
| Kling O3 | Kling | image | `kling-o3-image` | 同名命中 | active | 无行 | 2 | MISS | ❌ 不可使用 |
| Vidu Q2 | Vidu | image | `vidu-q2-text-to-image` | 同名命中 | active | 无行 | 2 | MISS | ❌ 不可使用 |
| Midjourney v7 | Midjourney | image | `midjourney-v7` | 同名命中 | active | 无行 | 2 | MISS | ❌ 不可使用 |
| Nano Banana Pro | Google | image | `nano-banana-pro` | 同名命中 | active | **55** | 2（27.5 倍差） | HIT 55 | ❌ 不可使用（绑定 `needs_specification`） |
| Seedance 2 Character | Bytedance | image | `seedance-2-character` | 同名命中 | active | 无行 | 2 | MISS | ❌ 不可使用 |
| Seedream 4.5 | Bytedance | image | `bytedance-seedream-v4.5` | 同名命中 | active | 无行 | 2 | MISS | ❌ 不可使用 |
| Kling 3.0 Pro | Kling | video | `kling-v3.0-standard-text-to-video` | 别名 → `kling-v3.0-standard-t2v`（同族，可接受） | active | **1630**（formula） | 1（1630 倍差） | HIT 1630 | ❌ 不可使用 |
| Seedance 2.5 | Bytedance | video | `seedance-2.5-text-to-video` | 同名命中 | active | 无行 | 10 | MISS | ❌ 不可使用 |
| MiniMax Hailuo 2.3 | MiniMax | video | `minimax-hailuo-2.3-standard-t2v` | 同名命中 | active | **815** | 1 | HIT 815 | ❌ 不可使用 |
| Google Veo 3.1 | Google | video | `veo3.1-text-to-video` | 同名命中 | active | 无行 | 10 | MISS | ❌ 不可使用 |
| Wan 2.7 | Alibaba | video | `wan2.7-text-to-video` | 同名命中 | active | 无行 | 10 | MISS | ❌ 不可使用 |
| Runway Gen-3 Alpha | Runway | video | `runway-image-to-video` | 同名命中 | active | **340** | 1 | HIT 340 | ❌ 不可使用（runway 无凭证，实际回落 MuAPI） |
| OpenAI Sora 2 | OpenAI | video | `openai-sora-2` | 别名 → `openai-sora-2-text-to-video`，**该行 `status=disabled`** | **disabled** | 无行 | 10 | MISS | ❌ 不可使用（推荐位指向已下架行） |
| Luma Dream Machine | Luma | video | `luma-dream-machine` | 同名命中 | active | **365** | 1 | **MISS**（无凭证被隐藏） | ⏸ 未配置（luma 无任何 provider_secret，且 muapi 绑定 `enabled=false`） |
| Suno v4 | Suno | audio | `suno-create-music` | 同名命中 | active | **45** | 1 | HIT 45 | ❌ 不可使用 |
| Udio 130 | Udio | audio | `udio-130` | **UNRESOLVED**（id/slug/别名/端点全无） | 无行 | 无行 | 无行 | MISS | ⏸ 未配置 |
| ~~ElevenLabs v3~~ → **MiniMax Speech 2.6 HD** | ~~ElevenLabs~~ → MiniMax | audio | `minimax-speech-2.6-hd` | 同名命中 | active | **295** | 1 | HIT 295 | ❌ 不可使用；**厂牌错标本轮已修正** |
| DeepSeek-R1 | DeepSeek | text | `deepseek-r1` | **UNRESOLVED** | 无行 | 无行 | 无行 | MISS | ⏸ 未配置 |
| Claude 3.7 Sonnet | Anthropic | text | `claude-3-7-sonnet` | **UNRESOLVED** | 无行 | 无行 | 无行 | MISS | ⏸ 未配置 |
| GPT-4o | OpenAI | text | `gpt-4o` | **UNRESOLVED**（`ai_models` 无行、无别名、不在 69 条目录） | 无行 | 无行 | 无行 | MISS | ⏸ 未配置 |

**23 个推荐位里：0 个可以下单**（19 个能解析到后台行，但 19/19 的供应商绑定都停在 `review_status='needs_specification'`、`provider_endpoint` 未填 ⇒ `MAPPING_NOT_APPROVED` / `PROVIDER_ENDPOINT_MISSING`）；4 个连模型行都不存在（⏸ 未配置）；1 个指向 `disabled` 行；16 个没有价盘行。

本轮从这张表里新查出的缺陷与处置：

1. **跨厂商错标（已修）**：音频推荐位显示 **ElevenLabs v3 / provider ElevenLabs**，但 `modelKey` 是 `minimax-speech-2.6-hd` —— 点它实际会下单 MiniMax Speech 2.6 HD 并扣 295 积分，而系统里根本没有 ElevenLabs 供应商与凭证。已把该位文案改为它真实交付的模型名与厂牌（`config/mega-navigation.js:507-519`，含 `id` 一并改为 `minimax-speech-2-6-hd`；该 `id` 仅在此文件内使用，全仓检索无其他引用）。**属文案层事实纠正，未改动任何布局/颜色/组件**，故未触及设计系统契约；若需要保留 ElevenLabs 品牌位，正确做法是接 ElevenLabs 渠道而不是改文案。
2. **静默降级（已定位，未改）**：`applyModelSelection()` 只在静态目录里查 id，查不到就**什么都不做** —— 于是上表 4 个 UNRESOLVED 推荐位与 `disabled` 的 Sora 位，点击后工作台会**默默停在默认模型**，页面不报错、不提示，用户以为自己选的是 Udio/GPT-4o。修法需要在导航层做「未开放」状态与提示文案，属产品决策，已列入第 5 节。
3. **Seedream「Pro」被别名降级（已定位，未改）**：后台同时存在 `bytedance-seedream-5.0-pro`（active）与 `seedream-5.0`（active），但 `MODEL_ENDPOINT_ALIASES` 把前者改写为后者 ⇒ Pro 行永远取不到；当前两行都没价盘行所以结果都是拒单，一旦只给 `seedream-5.0` 定价，就会出现「按 Pro 宣传、按非 Pro 交付」。
4. **价格量级（价盘 vs 老表）在推荐位上同样 100% 冲突**：Nano Banana Pro 2→55、Hailuo 2.3 1→815、Speech 2.6 HD 1→295、Runway 1→340、Suno 1→45、Luma 1→365、**Kling 3.0 1→1630**、老表 `models_config.cost_usd` 除 nano-banana-pro(0.01) 外全为 `0.000000` ⇒ 老表既没有真实成本也没有可信售价；第 4 节修复后展示与扣费一律只认价盘，所以 1630/815/365 这类数字现在会直接曝光给用户，**上线前必须由运营逐条复核 `formula_config`**（视频按秒、音频按字符/时长计费，这些公式参数目前无一条经供应商成本核实）。
5. 线上浏览器复现（15:49 UTC，未登录）：直链 `/studio?tab=video&model=seedance-2.5-text-to-video` 落在**图像**工作台并选中 **Topaz Image Upscale** —— `?tab=` 与 `?model=` 双双失效于旧构建（补丁未发布）；同时首页大标题从 14:45 的 `START CREATING WITH SEEDREAM 5.0 PRO` 变成 `START CREATING WITH TOPAZ IMAGE UPSCALE`，因为大标题取「裁剪后目录的第一条」，而 `bytedance-seedream-5.0-pro` 根本不在 69 条目录里 ⇒ **落地默认模型会随运营上下架随机漂移**，本次漂移结果是一个需要上传原图的放大模型，新用户直接输提示词点 Generate 必然失败。

## 10. 错误提示与积分退回专项（四类错误逐条核对，2026-09-25 12:36 UTC 实跑生产库）

前面各节回答的是「能不能生成」，本节回答检查清单里单独列出的一项：**「失败、超时、额度不足、供应商异常时的错误提示是否正确」**。方法是把生产库 `creations` 全部 8 行、`generation_attempts` 全部 5 行、`credit_ledger_v2` 相关台账逐行读出来，与当前源码里的文案映射逐条对照 —— 全部为真实历史数据与真实代码路径，无 Mock。

### 10.1 四类错误的真实样本与用户实际所见

| 错误类别 | 生产真实样本 | 用户实际看到的文案 | 结论 |
|---|---|---|---|
| **用户额度不足** | 无（8 行 creations 的预扣全部成功，说明下单前余额校验通过） | 后端 `app/api/generations/route.js:68` 对 `INSUFFICIENT_CREDITS` 返回 **402**；前端 `packages/studio/src/utils/formatError.js:29` 识别 402/该码 → `messages/zh/common.json:326`「算力余额不足，请充值或开通会员订阅。」；`publicError.js` 把该码列入 `SAFE_ERROR_CODES`（原文可透出，但含 `postgres`/`token` 等字样时降级为 fallback —— 该行为有 `tests/p0/security-baseline.test.mjs:139-140` 两条断言锁定） | ⚠️ 链路完整且防泄露，但**未做真实账号验证**：要触发它必须向生产用户写入下单记录，本轮未擅自执行 |
| **供应商额度不足** | 5 条 attempt 全为 `INSUFFICIENT_PROVIDER_BALANCE`（其中 1 条 `error_reason` 为上游英文原文 `Insufficient credit balance`） | 生产真实走的路径命中 `generationCore.js:155` →「AI 供应商额度不足，任务已失败并解冻额度，请稍后重试或更换模型」；09-24 00:50 那条 `nano-banana-pro`(55 积分) 的 `creations.error_reason` 正是这句完整文案，后面还按 `generationCore.js:630` 追加「（同模型其余渠道均不可用）」 | ✅ **文案在正在运行的构建里已经是对的**（`.next/server/chunks/743.js` 命中，见 10.3 更正），且有真实 DB 行佐证；本轮曾以为还要再补一处，复核后确认那处在测试专用分支，已回滚 |
| **失败 / 供应商异常** | `UPSTREAM_402`（09-20 `google-imagen4-ultra`）、「模型 flux-schnell 所有备选渠道均不可用 (muapi:ALREADY_ATTEMPTED_FAILED)」（09-23 ×2） | 当时用户看到通用「模型供应商调用失败」；**09-23 那两条还把渠道名 `muapi` 与内部码 `ALREADY_ATTEMPTED_FAILED` 写进了用户可见的积分台账 `description`**（台账直接展示在用户积分明细里） | ✅ **已不成立，且本轮改用编译产物直接证伪**：对正在运行的构建全文检索，`所有备选渠道均不可用` / `ALL_PROVIDERS_UNAVAILABLE` / `UPSTREAM_402` 各命中 **0 个文件**；现行生产路径的 `lastErrorReason` 必经 `PROVIDER_FAILURE_TEXT` 或 `publicErrorMessage()`，`ALREADY_ATTEMPTED_FAILED` 只剩 `routePricing.js:423` 的内部拒绝原因标记（不拼进用户文案）⇒ 属 09-20/09-21/09-23 历史 revision 产物 |
| **超时** | **0 条真实样本**（5 条 attempt 耗时 586–912ms，全为上游快速拒绝，从未跑过一次真实超时） | 代码与文案齐备：`generationCore.js:1100`「供应商超时，系统自动释放额度」、`creditService.js:488` 超时自动解冻扫描作业「生成超时未响应，系统自动解冻」、`PROVIDER_FAILURE_TEXT.TIMEOUT`「AI 供应商处理超时，任务已失败并解冻额度，请稍后重试」；超时判定依赖 `AbortError`/HTTP 408/504/`timeout` 关键字（`BaseAdapter.normalizeError`） | ⏸ **无法用真实样本验证**，只能确认链路与自动解冻兜底存在 |

### 10.2 积分退回逐条对账（真实台账，非推断）

| creation | 模型 | 终态 | 预扣 | 台账序列 | 净额 |
|---|---|---|---|---|---|
| `gen_0cf2418b` | google-imagen4-ultra | failed | 2 | `TASK_RESERVE:-2 → TASK_RELEASE:2` | **0** |
| `gen_a513780f` | seedream-5.0 | succeeded | 2 | `TASK_RESERVE:-2 → TASK_COMMIT:0` | **-2** |
| `gen_2882d618` | seedream-5.0 | succeeded | 2 | `TASK_RESERVE:-2 → TASK_COMMIT:0` | **-2** |
| `gen_3d8c0367` | wan2.7-text-to-image-pro | failed | 2 | `TASK_RESERVE:-2 → TASK_RELEASE:2` | **0** |
| `gen_7e88ebe6` | nano-banana-pro | failed | 2 | `TASK_RESERVE:-2 → TASK_RELEASE:2` | **0** |
| `gen_57af2672` | flux-schnell | failed | 10 | `TASK_RESERVE:-10 → TASK_RELEASE:10` | **0** |
| `gen_051301e8` | flux-schnell | failed | 10 | `TASK_RESERVE:-10 → TASK_RELEASE:10` | **0** |
| `gen_1da16df7` | nano-banana-pro | failed | 55 | `TASK_RESERVE:-55 → TASK_RELEASE:55` | **0** |

**结论：8/8 全部对得上 —— 失败即全额解冻（6 条净 0，无悬挂预扣），成功即净扣且净额恰等于 `credit_cost`（2 条 -2）。** 这是本次审计中少数被生产数据正面证明「正确」的环节，也是第 0 节里「平台下单与退款链路已被证明是通的」这条判断的完整依据。全局台账同样自洽：`TASK_RESERVE -85` = `TASK_RELEASE +81`（6 条失败单 2+2+2+10+10+55）+ 两条成功单各实扣 2，`TASK_COMMIT` 两条 delta 均为 0（确认动作不再重复扣减），无正数悬挂、无重复退款。

### 10.3 一条自我更正：所谓「第 14 处补丁」是无效改动，已在线上与本地一并回滚

本轮 12:36 UTC 时我把 `generationCore.js:557` 改成先查 `PROVIDER_FAILURE_TEXT`，并记作「第 14 处生产补丁」，理由是「546/552 条前端条目实际会走那条旧执行路径」。**这个理由是错的**，复核证据如下：

- 第 557 行位于 `if (providerClient)` 分支内部（该分支自第 436 行起，源码注释自己写着「若外部显式注入了 providerClient（如单元测试中的 mockProvider），优先走兼容路径」）。
- `processGenerationTask` 的全部 4 个生产调用点 —— `app/api/generations/route.js:61`、`app/api/v1/[[...path]]/route.js:137`、`lib/services/generations.js:66`、`lib/services/taskWorker.js:8` 与 `:21` —— **都只传 `creationId`，没有一个传 `providerClient`**；全仓唯一传它的地方是 `tests/db/postgres.test.mjs:417/423/431`（`createMockGenerationProvider`）。
- 生产真正走的是后面的渠道路由 + 故障转移分支，其文案早就正确（`:880` 查表、`:623-633` 保留首个真实上游错误并追加「（同模型其余渠道均不可用）」），09-24 00:50 那条真实 `creations.error_reason` 就是这句完整文案 —— 也就是 10.1 第一行。

因此那处改动**对线上用户零影响**。已按最小改动原则回滚：

| 项 | 结果 |
|---|---|
| 线上 `lib/services/generationCore.js` | 由 `.bak-20260925` 恢复，md5 `837fcad59579f9a3c20243f0cc336805` / 51028 B，与备份**逐字节一致**；属主权限仍为 `www:www 644`；`node --check` 通过 |
| 回滚后残留检查 | `grep -c 'PROVIDER_FAILURE_TEXT\[error?.code\]'` = **0**（改动确已消失）；`grep -c '同模型其余渠道均不可用'` = **1**（生产正确文案仍在，未误删） |
| 本地工作树 | 同一行还原，md5 与线上**完全相同** `837fcad5…` |
| 与备份的唯一差异（回滚前） | 仅第 557 行一处，`diff` 输出只有那一个 hunk（51074 B vs 51028 B） |

补丁总数回到 **13 处线上源码树 + 1 处仅本地（`config/mega-navigation.js`）**，见第 5 节 A 条。

这条更正顺带带来一个**有用的推论**：判断「某个修复是否已经对用户生效」不必修服务器，也不该靠源码文件时间戳猜 —— 直接对 `BUILD_ID` 对应的 `.next` 产物做字符串检索就能定论。本轮用这个方法核过全部关键文案，结果记在 10.1 与第 0 节：`publicError.js` 新增的可读文案（「该模型暂时没有可用的生成渠道…」）在产物里 **0 命中** ⇒ 仍未上线；而 09-24 14:36 那次构建已经把托管路径的错误文案带上线了 ⇒ 这一项**不需要**等下一次发布。

### 10.4 顺带排除掉的一条误报

attempt 级有 2 行 `error_reason` 是字面量 `[object Object]`（09-23 flux-schnell ×2），乍看像新缺陷。实跑核对：当前部署的 `lib/adapters/BaseAdapter.js` 与其备份 `.bak-20260924c` **都含 3 处 `'[object Object]'` 过滤**（`providerErrorText()` 第 35 行 + `normalizeError()` 两处），说明防护早于本轮补丁就存在，这两行是更早 revision 留下的历史数据；且该字段只进 `generation_attempts`（内部诊断/后台），不参与用户文案。**因此本轮未对它做改动** —— 记录在此以免后续误判为未修缺陷。




### 10.5 回归复跑与「生产库零污染」确认（2026-09-25 12:40 UTC；该补丁后已回滚，见 10.3）

（说明：本节当时是在第 14 处补丁**装上之后**跑的；该补丁经复核属测试专用分支的无效改动，已在 13:00 UTC 前后于线上与本地一并回滚。由于这处改动只影响 `providerClient` 注入分支、且回归结果里没有任何用例覆盖它，**176/23 这组数字对回滚后的 13 处补丁状态同样成立**，无需重跑；回滚本身另经 `node --check` + md5 与备份逐字节比对确认。）

那次跑的是与 4.1 节相同方式的服务器端测试树，但这次是**全量 32 个文件 / 199 个用例**（4.1 节那次是 49 个用例的子集，两者不可直接比较）：**176 pass / 23 fail / 0 cancelled**。

与本次补丁相关的唯一命中是 `tests/db/postgres.test.mjs` 的「simulated generation settles once and releases once on provider failure」，取其真实断言输出归因：

```
error: 'PostgreSQL operation failed.: relation "user_id_allocations" does not exist'  (code 42P01)
  at Module.reserveUserId (lib/repositories/auth.js:105)
  at allocateUserId (lib/auth/user-id.js:62)
  at seedCanonicalUser (tests/db/postgres.test.mjs:19)
  at TestContext.<anonymous> (tests/db/postgres.test.mjs:91)
```

即在**测试自建种子账号阶段就抛错**，根本没执行到 `generationCore` 的失败分支 ⇒ 与本补丁无关。同文件的另 4 个失败同因（该文件首条用例「PostgreSQL test environment is explicit and migrations are converged」报 `Migration checksum mismatch for 005_seed_defaults`），说明测试所连的库并非已迁移到 037/040 的库 —— **这本身是一条新的运维侧发现：平台自带的数据库测试在生产环境上跑不起来，迁移未收敛**。

补测过程中对生产库的写入风险已事后逐表核查（12:41 UTC，回看窗口 20 分钟）：

| 表 | 20 分钟内新增行 |
|---|---|
| `auth_usr.users` / `ops_bill.credit_wallets` / `credit_ledger_v2` / `credit_reservations` / `idempotency_keys` | 0 |
| `ai_studio.creations` / `generation_attempts` / `route_decision_logs` / `ai_models` | 0 |

总量与本次审计基线完全一致（`creations=8`、`generation_attempts=5`、`ledger=39`、`users=25`）⇒ **测试事务全部回滚，未向生产库落下任何数据**。表中出现的 `*@example.test`、`qoder.smoke.*@mail.test` 等 7 个测试账号是 09-22/09-23 的历史遗留，非本轮产生（本轮未新建任何账号）。



## 11. 结果返回 / 预览 / 下载链路实测（补上检查清单里此前只写「—」的一列）

平台历史上只有 2 次真实成功出图（`seedream-5.0`，09-20）。本轮把这两条作品的**落盘 → 公网访问 → 字节完整性 → 资产入库**逐环实跑核对：

| 环节 | 实测结果 |
|---|---|
| 数据库记录 | 两条均 `status='succeeded'`、`result_url=/uploads/creations/202609/gen_*.jpg`、`storage_status='ready'` |
| 磁盘文件 | `web/public/uploads/creations/202609/` 下两文件真实存在：`885369 B` / `777675 B`，`file` 判定 **JPEG 2048×2048 baseline 3 分量**（不是占位图，与提示词「韩式女孩妆容照」+ `quality:'basic'` 相符） |
| 公网访问（浏览器同路径） | 从服务器以 `curl -x ""` 直连生产域名：两条均 **HTTP/2 200**、`content-type: image/jpeg`、`content-length` 与磁盘字节数逐位相等、`cache-control: public, max-age=2592000`；落盘副本再次 `file` 校验为合法 JPEG ⇒ **预览与下载确认可用** |
| 资产入库 | ❌ **`ai_studio.user_assets` 全库 0 行** —— 两条成功作品都没有进入用户资产库 |
| 存储元数据回写 | ❌ `result_object_key` / `storage_bucket` / `storage_mime_type` / `storage_size_bytes` / `asset_id` **全部为空**，而 `storage_status` 已是 `ready` ⇒ 状态字段与实际数据不同步（对应第 5 节 G 条） |

结论：**「生成完成后图片能不能真的拿到、能不能显示、能不能下载」这一项，对唯一一条历史成功路径的答案是肯定的** —— 不是靠 HTTP 200 判定的，而是字节数、JPEG 维度与像素内容三者对上。但**「继续使用」（作品库 / 二次创作）这一环是断的**：资产表空，用户侧「我的创作」没有数据源。原因定位到 `generationCore.js:541-543` 以 `.catch(console.error)` 异步旁路调用 `syncCreationToAsset()`，失败静默且不阻塞主流程（设计如此，但无任何补偿或重试），本轮未能从现存日志区分是当时函数未上线还是调用失败 ⇒ 列入第 5 节 G 条待办，不做代码猜测式修改。

附带一条安全/隐私事实（**未擅自改动**，属产品决策）：作品直接落在 `public/uploads/` 下由静态目录服务公开，URL 形态为 `/uploads/creations/YYYYMM/<creation_id>.jpg`，**无鉴权、无签名、无过期**。creation id 不可枚举，但链接一旦外流即永久公开可见，且 `max-age=2592000` 会被中间缓存留住 30 天。若平台承载用户私密创作，需要改为签名读取或私有桶。

## 12. 路由闸门阶梯实测：补齐 G1-G3 仍然 0 个模型可下单（2026-09-25 12:56–13:00 UTC，全程只读）

第 0 节的「五个独立阻断点」是按表列分别统计的，但**没有证明它们之间的先后关系**。本轮用平台**自己的路由代码**（`lib/services/smartRouter.js` + `lib/modelCenter/routePricing.js`）在生产库上把同一个模型连续判定 5 次，每次只在**内存里**放宽一层（不落库、不请求上游、`persistDecision:false`），从而量出真实阶梯。方法：`sudo -n -u www node --experimental-loader ./scripts/server-only-loader.mjs`，环境变量从 `/tmp/env0.sh` 复制出 `root:www 640` 的临时副本注入，脚本与副本运行完立即 `shred -u`（收尾核对：webroot 与 `/tmp` 三处临时文件均已消失）。

| 放宽层级（仅内存） | nano-banana-pro | flux-schnell | seedance-2.5-text-to-video | 该层由哪个谓词把关 |
|---|---|---|---|---|
| A 生产真实状态 | `NO_COST_VERIFIED_ROUTE{PROVIDER_ENDPOINT_MISSING}` | 同左 | 同左 | `routePricing.js:426` |
| B +`provider_endpoint` | `MAPPING_NOT_APPROVED` | `MAPPING_NOT_APPROVED` | `MAPPING_NOT_APPROVED` | `routePricing.js:315`（`review_status`） |
| C +`review_status='approved'` | `MAPPING_INPUT_TYPES_UNVERIFIED` | 同左 | 同左 | `routePricing.js:333`（`capabilities.input_types`） |
| D +输入/输出/task 规格，**健康戳沿用生产真实值** | `HEALTH_CHECK_STALE` | 同左 | 同左 | `routePricing.js:434-436` |
| E +把健康戳伪造为「刚刚探测过」 | `QUOTA_CHECK_STALE` | 同左 | 同左 | `routePricing.js:443-445`（`available_quota` 非空即要求配额戳 15min 内新鲜） |

三条硬结论：

1. **启用链是 5 层而不是 3 层**。第 5 节原先写的 `sync_models → map_catalog → review_mapping → update_mapping_spec → sync_prices → stage_price → approve_price → publish_site_price` 只覆盖到 C 层；按本表，**照原方案做完仍然一个模型都下不了单**，因为后面还有健康与配额两道 15 分钟新鲜度门。这两道门无法靠「一次性运营动作」满足，只能靠常驻调度（或显式设置 `MODEL_HEALTH_MAX_AGE_MS` / `MODEL_QUOTA_MAX_AGE_MS`）。这就是第 0 节 G4 (c) 冷启动死锁的量化证据。
2. **`QUOTA_CHECK_STALE` 是一道新查出的门**（此前所有版本的本报告都没提）。它的触发条件是 `available_quota` 有值但 `quota_checked_at` 过期；11 个供应商里 MuAPI 的 `available_quota=0` 已落库 ⇒ 即使端点/审核/规格/健康全齐，仍会卡在这里。含义：配额同步（`sync-muapi-channels.mjs --sync-balance` 一类）也必须进调度，否则「充了钱但戳是旧的」同样拒单。
3. **推荐位里有 3 个 id 在路由层根本不存在**：`suno-v4-5`、`minimax-hailuo-2.3`、`gpt-image-1` 走 `routeGenerationTask` 直接 `MODEL_NOT_FOUND`（`listProviderModelsByModelId` 返回 0 行）。这与第 9 节的解析阶梯结论一致，但本轮把它从「文案解析失败」升级为「**路由器无法识别该模型**」——即便前端把这些 id 透传到下单接口，返回给用户的也是 `MODEL_NOT_FOUND` 而不是任何降级提示。`kling-3.0-pro` 则是另一种：模型行存在、渠道 1 条，但 `enabled=false` ⇒ `MAPPING_DISABLED`。

### 12.1 顺带核实的运行时底座（此前只查过代码，没查过进程）

| 项 | 实测 | 判定 |
|---|---|---|
| Web 服务 | `systemd: koyosim.service active/running`，进程 `next-server (v15.5.15)`（www 用户，运行 1d06h） | ✅ 队列/接口底座正常 |
| 生成 worker | `systemd: koyosim-worker.service active/running`，父子进程 `scripts/generation-worker-supervisor.mjs` + `scripts/generation-worker.mjs`（www，运行 1d06h）；循环为 `poll → runGenerationWorkerOnce → 处理 queued / 过期预扣 / 陈旧任务`（`generation-worker.mjs:90-108`，含心跳） | ✅ **「任务能否进队列并被处理」这一环不是阻断点** —— 之前只从代码推断，本轮确认守护进程真的在跑 |
| 当前队列 | `creations` 仍为 8 行（2 succeeded / 6 failed），无 queued/processing 积压 | 与「0 个模型可下单」一致 |
| 服务重启记录 | 两个 unit 最后一次重启都是 09-24 14:36:49–50，与 `BUILD_ID` 时间戳同一秒级对齐 | 佐证 14:36 那次是**构建+重启一起做的**，也佐证「源码文件 mtime 22:09/22:41/23:29 晚于构建」⇒ 13 处补丁确实还没进产物 |
| Node 侧调度 | `root`/`www` crontab 全文与 `systemctl list-timers` 核对：与 koyosim 相关的仅 SSL 续期、WAF、日志拆分，以及**每分钟对不存在的 `artisan` 执行 `schedule:run`**（目标文件实测不存在） | ❌ 没有任何 Node 维护作业 ⇒ G4/G3 的新鲜度必然持续过期 |

那三条指向 `artisan` 的 cron（root 1 条 + www 1 条 + 一条 ourslake 的）是同名 webroot 上更早的 PHP 站点遗留，`cd` 进 Next.js 目录后每分钟静默失败一次。它**不影响用户**，但它解释了为什么运营以为「定时任务已经挂了」而实际上什么都没跑 —— 属于第 5 节应一并清理的配置噪声。

## 13. 音频工作台真实浏览器实测与错误文案链路修复（2026-09-25 13:08–13:19 UTC）

第 7.6/7.7 节只覆盖了 Image 与 Video 两个工作台，音频是主流分类里唯一没有浏览器证据的一格（附录 A 的 11 个 audio 行当时只写了「✅ 已上架」，那是从价盘表推出来的，不是看到的）。本节用真实浏览器补齐，并在过程中定位到一处**线上传播中的错误文案缺陷**。

### 13.1 Audio Studio 逐要素实测（`https://www.koyosim.com/studio/audio`，未登录态，CDP 驱动 Chrome）

先记录路径：`/studio/audio` 能正确路由（heading = `Audio Studio`，`components/StandaloneShell.js:1519` 的 `activeTab === 'audio'` 分支），这一点与 cinema 的 `?tab=` 失效缺陷不同。

| 用户可见要素 | 实测结果 | 判定 |
|---|---|---|
| 模型列表 / 下拉框 | **（本行是 09-25 13:25–13:36 UTC 复测后的更正，推翻本节首次记录）** `AUDIO MODEL` 是一个**默认收起的下拉框**（`AudioStudio.jsx:789` 的 `{openDropdown && …}`，部署副本与本地 md5 一致 `95338f5cd9de7fc67770d8fd01b04f4d`）：收起态整页只出现 **1 个**模型名（默认选中项 `Suno Create Music`）。用 CDP 真实点击后展开，DOM 实测 **11 个选项**（`Suno Create Music / Remix / Extend / Generate Sounds / Add Vocals / Geneate Mashup / Add Instrumental`、`Minimax Voice Clone / Speech HD / Speech Turbo`、`MM Audio V2`，容器 `scrollHeight 672 / clientHeight 238`）。**同一构建的目录数组是 18 条**（`audioModels` 在 `.next/static/chunks/1771-*.js` 与 `6735ba38-*.js` 里 18 个 id 全部连续存在，偏移 558170→622761）⇒ 7 条不进 DOM。**这 7 条为什么被隐藏，本轮已查明一半**：在未登录浏览器里把 18 个 id 逐个去 join `/api/models/active` 的真实返回，**渲染出的 11 条命中 11/11，未渲染的 7 条命中 0/7** —— 即被隐藏的正好是**没有上架目录行的模型**，所以这是「按后台上架集合裁剪选择器」在起作用（第 7.1 节记录的同一机制），**不是选择器坏了**。尚未定位的是**裁剪发生在哪一行代码**：`AudioStudio.jsx` 里是裸 `audioModels.map()`（无 filter），带裁剪能力的是 `modelFamilies.js:848 filterActiveModelEntries()`（按 `variantIds` 命中 `isModelActive`），但音频目录没走这条链；压缩产物里也搜不到 `audioModels` 符号，因此机制留作待查。 | ⚠️ |
| 名称 | 全部渲染，但有 **1 处拼写错误直接摊给用户：`Suno Geneate Mashup`**（少一个 r）；序列化整个目录后实测乱码/拼写错误 token **15 处**（部署副本 `models.js`，09-16 修订） | ⚠️ |
| 模型说明 | 每个条目都渲染 `DESCRIPTION` 全文（Image/Video 是完全没有说明的），但 **文案在生产环境是乱码的**：`full songs ΓÇö complete with vocals`、`speakerΓÇÖs voice`、参数帮助文案 `Range 0ΓÇô1` —— cp437→UTF-8 双重 mojibake，**实测整页 13 处** | ❌ |
| Logo | 整页 `<img>` 只有 **1 个**（站点品牌 logo，naturalWidth 384 正常加载），**11 个模型条目没有任何模型 logo** | ❌ |
| 价格 / 积分消耗 | **完全没有**。展开后的 11 个选项都不带价格，正文与按钮里也搜不到任何「积分 / credits / 45 / 295」价格信息；而 `/api/models/active` 的 audio 行**都带 `creditsPrice`**（45/45/45/10/45/45/45/295/295/295/10）——接口有价、页面不显示。**范围订正（09-25 复核）**：这不是音频独有的缺陷 —— 打包进前端的三份静态目录里**没有任何价格字段**（`audioModels` 18 条的键只有 `id/name/endpoint/family/description/required/inputs`，18/18 无价格字段；`ImageStudio.jsx` 全文搜 `price/credit/积分` **0 命中**），页面上唯一出现的积分数字是右上角账号**余额**（`StandaloneShell.js:1289 credits={accountCredits}` → `UserDropdownMenu`），我此前把它当成「图像工作台的价格位」是误读。⇒ 结论应记为：**三个工作台都没有「本次生成要花多少积分」的展示**，用户在下单前看不到本站价盘的任何一条；权威价格其实在浏览器里已经取到并用于裁剪选择器（`StandaloneShell.js:874/889` → `applyActiveModelDirectory(models)`），只是 `creditsPrice` 被丢掉了 —— 这是接线缺失而不是数据缺失，详见第 14 节 |
| 参数 | `PROMPT / STYLE / TITLE / PERSONA ID / PERSONA MODEL / Instrumental / NEGATIVE TAGS / VOCAL GENDER / Style Weight / Weirdness Constraint / Audio Weight` 均渲染，滑块 `valuemin 0 / valuemax 1 / value 0.65`，控件可用；每个参数都带英文帮助文案（含上述乱码） | ✅ |
| 状态 | 未登录可直接进入工作台并点 `Generate Track` | ✅ |

> 结论修正（两条）：(1) 附录 A 的 audio 行「前端 ✅ 已上架」仍然成立（下拉可用、可提交），但**「展示 295 积分」这类措辞对音频不适用** —— 音频工作台根本不展示价格，价格信息只存在于接口层，用户下单前看不到。(2) 本节日志里首次记录的「纵向卡片列表、11 个条目全部已在 DOM」是**我的测量错误**（当时用合成 pointer 事件点击未展开，就把 DOM 里已有的名字当成了静态列表），已在上面的表格里按真实点击后的复测改写；订正后的口径是**收起态 1 项 / 展开态 11 项 / 目录 18 项**。

### 13.2 未登录下单的真实鉴权响应（127.0.0.1:3100 直连实测）

| 请求 | 结果 |
|---|---|
| `POST /api/generation/quote`（带 Idempotency-Key，无 cookie） | `HTTP 401 {"error":"请先登录"}` |
| `POST /api/generations`（带 Idempotency-Key，无 cookie） | `HTTP 401 {"error":"请先登录"}` |
| `POST /api/generation/quote`（**故意不带** Idempotency-Key） | 仍是 `401 请先登录` ⇒ 鉴权在幂等键校验**之前**，顺序正确，不向匿名请求泄露内部校验码 |
| `GET /api/models/active` 响应头 | `cache-control: no-cache, no-store, must-revalidate, max-age=0` ⇒ 目录不会因缓存与价盘脱节 |

诚实记录一条不能归因的现象：在浏览器里点击 `Generate Track` 之后，CDP 会话对该标签页的所有后续操作（含 `evaluate 1+1`、截图、`handle_dialog`）全部超时，**疑似弹出了阻塞式账号对话框**。因此「未登录点击生成」的用户可见 toast 文案**本轮没有抓到实图**，下面 13.3 的缺陷是以「线上编译产物里的字符串 + 代码路径」两级证据定位的，不是以截图定位的。

### 13.3 定位到的错误文案缺陷：服务端写好的中文提示被前端整个丢弃（第 14 处补丁，已装线上源码树、未构建）

`packages/studio/src/muapi.js:258` 把上游响应拼成 `API Request Failed: <status> <statusText> - <body(截断 100 字符)>`，再交给 `packages/studio/src/utils/formatError.js` 解析。本站接口的错误体形状是 `{ error: '中文文案', code: '...' }` —— **`error` 是字符串而不是对象**，而解析器只认 `detail`、`error.message`、`message` 三种形状，于是服务端为每类失败专门写的可读文案全部落不进解析分支，接着命中按状态码硬编码的英文句子。

用线上源码树里那份**未修改的** `formatError.js`（md5 `71dea2de…`，09-16 版）与修复后逐条对比，输入用 13.2 真实抓到的响应体：

| 真实失败场景 | 修复前（= 线上产物行为） | 修复后 |
|---|---|---|
| 401 未登录 `{"error":"请先登录"}` | `Authentication failed. Please check your account session or API key.` | `请先登录` |
| 402 额度不足（截断后） | `Insufficient credits. Please top up your wallet.` | `算力余额不足，请充值或开通会员订阅。` |
| 502 无可用渠道（截断后） | `{"error":"该模型暂时没有可用的生成渠道，请稍后重试或更换其他模型。","code":"NO_COST_…`（半截 JSON 直接糊在 toast 上） | `该模型暂时没有可用的生成渠道，请稍后重试或更换其他模型。` |
| 422 报价过期（截断后） | `{"error":"报价已过期，请重新提交。","code":"QUOTE_EX…` | `报价已过期，请重新提交。` |

两处根因（同一函数）：① 不认 `{error: string}`；② `if (message.includes('{') && message.includes('}'))` 要求括号成对，而 `muapi.js` 的 **100 字符截断**经常把右括号切掉，导致整段解析被跳过 —— 这就是第 3、4 行「半截 JSON 直接给用户看」的来源。修复：新增 `apiCopy()`，JSON 完整时按 `detail → error.message → error → message` 取第一条非空字符串；JSON 被截断时用正则把 `"error"|"detail"|"message"` 的原文捞出来，两条路径都优先于状态码硬编码分支（后者仍保留，作为完全拿不到响应体时的兜底）。

验证记录（不是只跑 happy path）：

- 9 条用例实跑：4 条真实生产响应体 + 5 条回归（`detail` 形状、`error.message` 形状、无 JSON 的 429、纯文本、空值兜底）⇒ 回归行为**逐条与修复前一致**，只有目标缺陷被改掉。
- 安装到线上源码树：备份 `packages/studio/src/utils/formatError.js.bak-20260925b`（原文件 1693 B，09-16 06:50，md5 `71dea2de…`）；以 `sudo -n -u www` 写回，属主持义不变；**服务器侧 md5 `c73034ea…` 与本地文件逐字节相同**；并用部署后的文件在服务器上实跑同一组用例，四条中文文案全部正确返回。
- 该文件此前**不在**第 4 节那 13 处之内，属第 14 处线上源码树补丁；与其余补丁一样**必须 `npm run build` 才对用户生效**（下表已证明线上产物里就是旧行为）。

线上编译产物字符串检索（`.next` 实测，用于证明「用户今天真的会看到英文」）：

| 字符串 | 命中产物 |
|---|---|
| `Authentication failed. Please check your account session or API key.` | 12 个文件，含 `.next/server/chunks/5007.js` |
| `Insufficient credits. Please top up your wallet.` | 12 个文件 |
| `Generation cancelled: account login is required.` | 5 个文件，含浏览器侧 `.next/static/chunks/8809-d4337135a603460c.js` |
| `算力余额不足` | 仅 4 个文件且都是服务端产物（`.next/server/middleware.js` 等），**不在浏览器 chunk 里** ⇒ 中台文案走不到音频工作台 |

### 13.4 音频文案乱码与拼写错误的归属：打包内静态目录落后 9 天，且不可手工替换

| 证据 | 实测 |
|---|---|
| 音频模型名/说明的数据来源 | `AudioStudio.jsx:9 import { audioModels, getAudioModelById } from "../models.js"` ⇒ **打包内的静态目录**，不是 `/api/models/active`（接口返回的 `name` 是正确拼写的 `Suno Generate Mashup`） |
| 部署侧源码 | `packages/studio/src/models.js` = **990651 B，mtime 09-16 16:38**，md5 `3000c7ed…`；`grep -c Geneate` = **1**，mojibake 命中 **13** |
| 本地源码 | 同名文件 **959188 B**，mtime 09-24 21:33，md5 `427c6122…`；`Geneate` **0**、mojibake **0**（后者是第 4 节记录的源码修复） |
| 线上产物 | `.next/server/chunks/759.js` 含 `Suno Geneate Mashup`（3 个文件命中）与 `full songs ΓÇö complete with vocals` ⇒ 用户当前收到的就是这个旧 revision |
| `packages/studio/dist/**` 里的同名旧副本 | 含 `Geneate`，但 `packages/studio/package.json` 的 `exports` 全部指向 `./src/**`、`next.config.mjs:transpilePackages: ['studio', …]` ⇒ **dist 是陈旧的 Babel 产物，不参与应用构建**，改它无效 |

| **两份文件的音频条目数（09-25 复测）** | `node --input-type=module -e` 分别导入部署副本与本地副本的 `audioModels`：两边**都是 18 条、id 顺序完全一致**，差异只在文字（部署副本 15 处乱码/拼写 token，本地 0 处，`Geneate` 本地已改为 `Generate`） ⇒ 「落后 9 天」成立的是**文案**，条目数不是漂移点 |
| **运行态却只给 11 项** | 真实点击展开后 DOM 内 11 个选项（见 13.1）；而该构建的两个客户端 chunk 里 18 个音频 id 全部连续存在。**已查明被隐藏的 7 项的共同特征**：把 18 个 id 逐个 join 未登录可见的 `/api/models/active`（69 行 = 17 image + 41 video + 11 audio），**渲染出的 11 项命中 11/11，隐藏 7 项命中 0/7** ⇒ 隐藏的是**没有上架目录行的模型**，属于「按后台上架集合裁剪选择器」的正常效果（第 7.1 节同一机制），**不是选择器缺陷** |

处置决定（**09-25 晚间已推翻并改正，见下方「更正」**）：不手工往服务器覆盖 `models.js`。

#### 更正：所谓「相差 31 KB 的整体 revision 漂移」是度量错误造成的假象

上面的结论把**字节数差**当成了**内容差**，两者之间差着换行符这一层。09-25 用 `diff <(tr -d '\r' < A) <(tr -d '\r' < B)` 复测后确认：

| 复测项 | 实测 |
|---|---|
| 部署副本的行尾 | `packages/studio/src/models.js` 含 **31,422 个 `\r`** ⇒ CRLF 文件；本地副本是 LF ⇒ **31 KB 的「差」里有约 31,400 B 只是 CR 字符**，不是内容 |
| 去掉 CR 后的真实差异 | **14 行 / 28 个 hunk 端点**，全部是用户可见文案：13 处 `ΓÇö`/`ΓÇô`/`ΓÇÖ` 乱码还原为 `—`/`–`/`’`，1 处 `Suno Geneate Mashup` → `Suno Generate Mashup` |
| 音频条目结构 | 两边 `audioModels` 均 18 条、id 顺序一致（与上表同一结论，此处不变） |
| 结论 | 该文件**可以安全整份替换**，不存在「换掉上百条无关模型定义」的风险；「落后 9 天」成立的只是文案，而不是目录结构 |

因此本轮已按 `cp` 方式把本地 `models.js` 装上部署树（含第 14 节的价格注册表），替换前后的完整 diff 就是上表那 14 行，无第三方改动。证据、md5 与回滚命令见第 15 节。

**顺带的方法论教训（写进复测要求）**：任何「两份文件差多少」的判断，在没有确认两边行尾一致之前，`wc -c` 与 `md5sum` 都不可作为内容差异的依据 —— 本项目内 `models.js`、`AudioStudio.jsx`（1,180 个 `\r`）、`modelFamilies.js` 三份线上文件都是 CRLF，而本地树是 LF。

⚠️ **本项证据真正指向的风险（与直觉相反）**：危险方向不是「多冒出 7 个点得到的模型」，而是**这层裁剪一旦被去掉就会**。已上架的 11 项都有价盘行、都会停在报价阶段以外的闸门；而那 7 项（`suno-voice-clone`、`elevenlabs-text-to-dialogue-v3`、`suno-convert-to-wav`、`gemini-3-1-flash-tts`、`gemini-2-5-pro-tts`、`elevenlabs-tts-turbo-2-5`、`minimax-music-3.0`）**既无价盘行也无上架行**，若哪一天它们因为「目录改成不过滤」「上架表被批量补齐」而进入选择器，用户点到的就是一排必然 `MODEL_PRICING_UNCONFIGURED` 的选项。因此：**(1)** 构建发布后要复数一次音频条目数（见第 5 节 A 条第 5 项），**期望值仍是 11**，变成 18 才是要停下来查的情况；**(2)** 此前「没有定位到执行裁剪的那行代码」这一点本轮已经查明（见 13.4 末段更新）：裁剪不在 `AudioStudio.jsx` 里，而在**目录写入层** —— `components/StandaloneShell.js:874` 取 `/api/models/active`，`:889` 调 `applyActiveModelDirectory(models)`（`packages/studio/src/models.js`），后者对 11 份导出目录逐个做 `catalog.splice(0, catalog.length, …)` **原地替换**成「静态目录 ∩ 上架集合」。所以 `audioModels.map()` 之所以只剩 11 项，是因为数组本身已被换成 11 条；图像/视频选择器另有一道渲染期过滤 `modelFamilies.js filterActiveModelEntries()`。两个含义随之确定：**(a)** 这层保护是真实代码而非偶然，构建后条目数不会莫名变成 18；**(b)** 同一段代码里 `isModelActive()` 在 `activeModelIds === null`（接口未返回/失败）时**向下开放**（全部静态条目可见），所以「有上架行才可选」只在接口正常时成立 —— 复验时若条目数明显多于预期，先查 `/api/models/active` 是否失败，而不是先怀疑目录。第 14 节的价格实现已把 `creditsPrice` 挂在这同一条链上（`models.js` 的 `modelPricingById` 注册表），因此价格显示与选择器裁剪共用同一份上架集合，不会出现「显示了价格但没有上架行」的错位。





## 14. 三个工作台都没有「本次生成要花多少积分」（09-25 定位；**同一晚已按本节契约实现并装上线上源码树，见第 15 节**）

这是检查清单里「前端是否正常显示：价格、积分消耗」一栏的最终结论。定位阶段它只做到「查清数据源、未提交代码」，本节保留原始定位过程作为实现依据；缺陷本身的根因不是接线漏了一处，而是**前端压根没有价格数据源**：

| 事实 | 实测 |
|---|---|
| 打包内静态目录无价格字段 | `packages/studio/src/models.js` 的 `audioModels` 18 条，键只有 `id/name/endpoint/family/description/required/inputs`；带 `price/credit/cost` 字段的条目 **0/18** |
| 工作台组件里搜不到价格 | `ImageStudio.jsx` 全文 `price/credit/积分` **0 命中**（Video/Audio 同理）；页面上唯一的积分数字是右上角账号**余额**（`StandaloneShell.js:478/1289` → `UserDropdownMenu`），与模型单价无关 |
| 价格其实有权威来源，且匿名可读 | 在 `/studio/audio` 页面内以**未登录访客身份** `fetch('/api/models/active')`：`HTTP 200`，`{success, models:[…]}`，**69 行**，每行键为 `id / name / type / provider / creditsPrice / sortOrder / isActive`。样本：`flux-pro`→20、`imagen-4`→55、`suno-create-music`→45、`mmaudio-v2-video-to-video`→25、`hailuo-02`→945 |
| 关联键 | **`id` 直接等于工作台目录里的模型 id**（`suno-create-music` 两边同名）⇒ 无需模糊匹配，可以精确 join |
| 覆盖度 | 接口 69 行 vs 前端 552 个可点条目 ⇒ **绝大多数条目没有价盘行**。这是第 3 节价盘缺陷在前端的自然结果，不是新缺陷 |

**实现必须满足的两条硬约束**（不是「先不改」的理由，而是验收标准 —— 第 15 节的实现就是按这两条落地的）：

1. **不能造数**。552 个条目里只有 69 行有权威价格，若按「找不到就显示 50 / 显示 0」来填，等于把第 4 节刚拆掉的 `COALESCE(pr.base_credits, 50)` 假价从服务端搬到客户端 —— 正是本次检查禁止的做法。所以缺失项必须显式渲染成「暂无价格 / 待定价」，这属于产品展示口径决策。
2. **按秒计费的模型不能显示单个数字**。第 3 节已证实 51 个视频行是 per-second 供应商价而平台价是**历史时长快照**：在这种行上印一个「N 积分」，就是把「单位错误」直接摊到用户面前，比不显示更糟。图像/音频（`fixed`）可以先显示，视频（`formula`）必须等单位口径定了再显示（`per second` 后缀或区间价）。

**可直接落地的实现契约**（等第 5 节 E 条价格单位决策 + 构建授权后按此实施，避免下一位执行者重新调研）：

- 取数：**不需要新增请求**。`StandaloneShell.js:874` 已经在挂载时 `fetch('/api/models/active')`，并在 `:889` 把整个 `models` 数组交给 `applyActiveModelDirectory()`（就是它驱动了三个工作台的选择器裁剪）——`creditsPrice` 已经在这条链上到过浏览器，只是被丢弃。所以正确的改法是**让目录条目保留 `creditsPrice`**（在 `modelFamilies.js` 的目录写入处带出该字段），工作台渲染时按 `id` 取；失败路径保持现状（`:894 setModelDirectoryState('error')`），价格缺失时渲染「暂无价格」而不是 0 或默认值。
- 建索引：`rows.reduce((m, r) => Number.isFinite(+r.creditsPrice) && +r.creditsPrice > 0 ? (m[r.id] = +r.creditsPrice, m) : m, {})`，即**只收录有正数的行**，缺失项自然落到「暂无价格」分支。
- 渲染：三个工作台的模型下拉项与生成按钮各加一个价格位；文案走 `resolveCopy()` 现有 i18n 通道（`packages/studio/src/messages/{en,zh,ja-JP,ko-KR,zh-TW,es-ES}` 都要补 key，不能像第 13 节那样把中文硬写进英文界面）。
- 单位：`fixed` 类型（图像 20 行 / 音频 11 行）显示「N 积分/次」；`formula` 类型（视频 51 行）在单位决策落地前**不显示单价**，或显示「按秒计费 · 单价待定」。
- 复验：构建发布后在同一批真实浏览器路径上逐工作台截图（图像/视频/音频各一次），并把显示值与 `model_pricing.base_credits` 逐条对账 —— 这一步做完，「前端展示价 vs 实际扣费」才是第一次真正可核对。

> 定位过程附记（方法论）：`curl` 直连 `127.0.0.1:3100/api/models/active` 与走公网域名都返回 `HTTP 200 + 0 字节`，一度像是接口空返回；改在**浏览器页面内**以访客身份 `fetch` 才拿到 69 行。教训是这条路由对无 `Host`/无 UA 的服务器内自调返回空体，**判断「接口有没有数据」必须在真实浏览器上下文里测**，不能只看 `curl` 的状态码 —— 这条也正是本检查禁止「仅判断 HTTP 200 认定可用」的一个具体注脚。

## 15. 价格显示补丁的安装记录（09-25 13:5x–14:12 UTC，线上源码树，已装未构建）

第 14 节的契约已实现。链路是**五层贯通**的一条：SQL 取字段 → API 带出 → 客户端建索引 → 共享格式化 → 三个工作台渲染。

| 层 | 文件 | 改动 |
|---|---|---|
| 仓储 | `lib/repositories/models.js` | `listActiveModels()` 的 SELECT 增 `pr.pricing_type AS pricing_type,`（原来只取 `base_credits AS credits_price`，前端无法区分一口价与公式价） |
| 接口 | `app/api/models/active/route.js` | 映射对象增 `pricingType: m.pricing_type \|\| null,` |
| 索引 | `packages/studio/src/models.js` | `applyActiveModelDirectory()` 内新增 `modelPricingById` 注册表 + 导出 `getModelPricing()`；**只收录 `creditsPrice > 0` 的行**，`formula` 标记为 `{formula:true}`（与 `decorateModel()` 同一口径：公式行的 `base_credits` 是下限，不是单次价格） |
| 格式化 | `packages/studio/src/modelPrice.js`（新） | `priceForIds()` 接受 string / number / **Set** / array，返回 `flat` / `from` / `missing`；同族多变体取**最低**且价格不一致时降级为 `from` |
| 组件 | `packages/studio/src/components/ModelPriceTag.jsx`（新） | 渲染 `<span data-model-price data-model-price-kind>`；`missing` 时 `data-model-price=""`，**不印数字** |
| 文案 | `packages/studio/src/messages/{en,zh,ja-JP,ko-KR,zh-TW,es-ES}/modelPrice.json`（新 6 份） | 走 `resolveCopy()` 现有 i18n 通道；zh = 「{credits} 积分 / {credits} 积分起 / 暂无价格」，无硬写中文 |
| 渲染 | `ImageStudio.jsx` :857 / `VideoStudio.jsx` :563 / `AudioStudio.jsx` 选项行 | 各下拉项挂 `<ModelPriceTag ids={entry.variantIds 或 model.id} locale={locale} />`；两个 `ModelDropdown` 签名补 `locale = "en"` 并在调用点传下 |

### 15.1 安装证据（线上实测，非本地推断）

| 核验项 | 结果 |
|---|---|
| 写入文件数 | 本轮 14 个（11 新增 + 3 二次改动）；**带补丁文件累计 25 个** |
| 属主/权限 | 全部保持 `www:www 644`，写入经 `sudo -n -u www` |
| 语法 | 服务端 `node_modules/.bin/tsc --noEmit --noResolve --skipLibCheck --allowJs --jsx preserve` 对新增/改动文件：**输出为空 = clean** |
| 三工作台挂载 | `grep -c ModelPriceTag` = Audio **2** / Image **2** / Video **2**（import + 使用各一次） |
| 6 份 locale md5 | `en 8919b37b…` / `zh 0f872f78…` / `es-ES 0f87df5d…` / `ja-JP b76eff81…` / `ko-KR 62a9a69f…` / `zh-TW 8043140a…`，与服务端一致 |
| 未造数 | 无价盘行渲染「暂无价格」，`formula` 行渲染「N 积分起」，只有 `fixed` 行渲染单个「N 积分」⇒ 第 14 节两条硬约束均满足 |

关键文件服务端 md5（安装后）：`lib/repositories/models.js d0fcfe65e204…`、`app/api/models/active/route.js 0defdee4c44f…`、`modelPrice.js abcc397e3981…`、`ModelPriceTag.jsx 4caa6cb4c8c5…`、`models.js f9ca5fb99158…`、`AudioStudio.jsx 131855dd1e50…`、`ImageStudio.jsx ad621e02a771…`、`VideoStudio.jsx f6ebf6692816…`、`modelFamilies.js 8fe70d620cc1…`、`StandaloneShell.js ec76d7609ded…`、`formatError.js c73034eaebbc…`。

### 15.2 同轮附带修掉的两类缺陷（13.4 / 崩溃防护）

| 缺陷 | 修法 | 实测 |
|---|---|---|
| 音频工作台 13 处乱码 + `Suno Geneate Mashup` | 部署副本 `models.js` 与本地副本内容只差这 14 行（所谓 31 KB 差是 CRLF，见 13.4 更正），整份 `cp` 覆盖 | 安装后 `Geneate=0`、`ΓÇö/ΓÇô/ΓÇÖ` 命中 **0**，行 28893 已是 `Suno Generate Mashup` |
| 视频选择器整页崩溃风险 | `modelFamilies.js:724` 改 `entry.defaultVariant?.model?.name ?? entry.name`；`VideoStudio.jsx` 引入 `entryModelId(entry)` 助手并替换 7 处裸 `entry.defaultVariant.model.id`（ grouped 目录的 `defaultVariant` 可能为 undefined） | `grep -c entryModelId` = **7**；tsc clean |

替换前后逐行核对：`models.js` 差 28 端点（= 那 14 行）、`modelFamilies.js` 差 2、`VideoStudio.jsx` 差 26 且**不含任何价格相关 hunk** ⇒ 价格补丁与文案/崩溃修复互不覆盖。三份文件安装后与本地归一化 md5 **逐字节相等**（`remaining_diff_lines=0`）。

### 15.3 运行态未被触碰（本轮全程）

`systemctl is-active koyosim.service koyosim-worker.service` → `active / active`；`.next/BUILD_ID` 仍是 `ahF8q-_fpA6cgZkL5QuZF`（09-24 14:36 构建）。**所以第 14/15 节的全部价格显示改动、13.4 的文案修复、崩溃防护，用户此刻都还看不到** —— 生效需要第 5 节 A 条的构建 + 重启授权。

### 15.4 回滚

`packages/studio/src/{models.js,modelFamilies.js}`、`components/{AudioStudio,ImageStudio,VideoStudio}.jsx`、`lib/repositories/models.js`、`app/api/models/active/route.js`、`packages/studio/src/utils/formatError.js` 均有同名 `.bak-20260925c` / `.bak-20260925d`（`cp -a`，保留原属主与时间戳）。新增文件（`modelPrice.js`、`ModelPriceTag.jsx`、6 份 `modelPrice.json`）无历史版本，回滚 = 删除并还原上述备份。完整备份清单可在服务器上 `find . -name '*.bak-2026*' -not -path './node_modules/*' -not -path './.next/*'` 取得（当前 27 份）。

## 16. 构建源决策：本地树与线上树各有对方没有的改动（授权构建前必须先读这节）

本轮做了一个全树逐文件、去 CR 归一化的本地↔线上比对，结论与「本地更新、直接构建即可」的直觉**相反**：

| 方向 | 只在这一侧存在的改动 |
|---|---|
| **只在线上** | 上架目录裁剪链（`applyActiveModelDirectory`）、`pricing_type` 取字段、`/api/models/active` 的 `pricingType`、`ModelPriceTag` 全套、`formatError.js` 中文透传修复、第 4 节 6 个适配器健康探测修复 |
| **只在本地** | `config/mega-navigation.js` 推荐位对齐（09-24 17:33 修订，线上是 09-21 旧版且写着目录里不存在的 `elevenlabs-v3`）、14 处显示文案（本轮已单向复制到线上，故不再独有）、`VideoStudio.jsx`/`modelFamilies.js` 崩溃防护（同上） |
| **两侧都有但不同** | `ImageStudio.jsx` 另有 **11 处 design-token hunk（约 24 行 delta）**：`text-brand`、`border-line`、`shadow-elevation-2`、`bg-wash`、`aspect-[3/4]` 等 —— 属尚未发布的一轮 UI 改版，**依赖 `app/globals.css` 的同批 token**，本轮**刻意未部署**，也不应被这次构建顺带带上 |

因此：

1. **不能简单 `npm run build` 本地树** —— 那会把 `ImageStudio.jsx` 的 design-token 类名连同缺失的 token 一起发布（结果可能是样式静默失效），也等于用一次构建掩盖两件事的耦合关系。
2. **也不能只构建线上树** —— 线上 `config/mega-navigation.js` 是 09-21 旧修订，第 5 节 F 条要求的推荐位修复不在其中。
3. 正确顺序（供授权时执行）：先把本地 `config/mega-navigation.js` 与第 4/15 节的线上修复收拢到**同一份工作树**（对 `ImageStudio.jsx` 只做「保留 token 类名 + 保留本轮价格/文案」的三向合并，或临时用 `git stash` 隔离 UI 轮），再 `npm run build` + 重启，最后按第 6 节与 5.A4/A5 复验。
4. ⚠️ **无 git 安全网的范围**（09-25 14:15 UTC 服务端逐文件 `git ls-files --error-unmatch` 实测）：树确实是 git checkout，但本轮补丁里**只有 5 个文件被 git 跟踪**，其余只能靠 `.bak-2026*` 回滚。

   | 文件 | 跟踪状态 |
   |---|---|
   | `lib/repositories/models.js`、`lib/services/providers.js`、`lib/adapters/BaseAdapter.js`、`config/mega-navigation.js`、`app/api/models/active/route.js` | **UNTRACKED** |
   | `packages/studio/src/modelPrice.js`、`packages/studio/src/components/ModelPriceTag.jsx`（本轮新增） | **UNTRACKED**（未 `git add`，本就是新文件） |
   | `packages/studio/src/models.js`、`modelFamilies.js`、`components/AudioStudio.jsx`、`components/VideoStudio.jsx`、`components/StandaloneShell.js` | TRACKED |

   即 `lib/**`、`config/**`、`app/api/models/**` 三个目录在服务端**一个跟踪文件都没有**（`packages/studio/src` 下约 100 个被跟踪），工作树相对 HEAD 已有 504 项漂移。后果：**(a)** 不能用 `git checkout` 回滚任何服务端修复，**(b)** 也不能假设「本地 commit 了就等于线上有版本记录」，**(c)** 第 5 节 A 条与第 16.3 步的收拢动作必须保留 `.bak-*` 备份到构建复验通过之后再清理。



## 17. 补丁后的价格口径对账（09-25 14:19–14:22 UTC，生产库只读实跑）

第 15 节的价格显示装好后，「前端展示价 = 价盘表」这件事必须用数据证明，而不是用代码读一遍就算完。做法：直接 `import` 打过补丁的线上 `lib/repositories/models.js`（走 `server-only-loader`，同一份 `DATABASE_URL`），把它返回的每一行喂进与客户端 `modelPrice.js` **完全相同**的判定规则，再与 `ai_studio.model_pricing`、旧表 `models_config.credits_price` 和 `pricingEngine.calculateModelPrice()` 三方对照。

### 17.1 82 行上架集合的显示口径分布

| 指标 | 实测 |
|---|---|
| `listActiveModels()` 行数 | **82**（与第 4 节补丁后的上架集合一致） |
| `pricing_type` 分布 | `fixed` 31 行 / `formula` 51 行 |
| 渲染出来的显示类型 | **`image/flat` 20、`audio/flat` 11、`video/from` 51**，`missing` **0** |
| 含义 | 图像与音频按「N 积分」显示；**51 个视频行全部自动降级为「N 积分起」**（公式行的 `base_credits` 是下限，不是单次价）⇒ 第 14 节「单位错误不能印成单价」这条约束由数据自动达成，无需逐个模型手工分类 |

这 82 行因为补丁里的内连接要求必须有 `model_pricing` 行，所以天然全部有价 ⇒ 集合内不存在「显示价凭空造」的空间；集合外的前端条目（552−82）走「暂无价格」分支（见 15.1 末行）。

### 17.2 与旧表 `models_config.credits_price` 的冲突量化

| 指标 | 实测 |
|---|---|
| 82 行里两表都有的 | **78 行一致冲突、0 行一致** |
| 旧表取值 | 几乎全是 **1 积分**；全表 540 行里有 **76 行 = 1**，出现的不同值仅 `{1,2,6,8,10,12,18,20}` |
| 价盘表取值 | 10 – 5660（例：`veo3-image-to-video` 5660 vs 旧表 1；`seedance-2.5-motion-control` 3395 vs 1；`flux-pro` 20 vs 1） |
| 无 `model_pricing` 行的活跃旧表行 | **457** 行 ⇒ 它们只能依赖旧表数字，是第 3 节「两套价盘」问题的存量 |

结论：旧表是一个已停止维护的**占位数字**（大量 1 积分），第 5 节 E 条的「合并两套价盘」仍然是必做项，不能因为前端现在只读价盘表就当它不存在。

### 17.3 「展示价 vs 实际扣费」目前**无法**在生产上对账 —— 且这是结论不是遗漏

对 82 行逐个真实调用 `pricingEngine.calculateModelPrice({modelId, parameters})`：**82/82 抛 `NO_COST_VERIFIED_ROUTE`**，一个数字都没返回。这正是第 12 节五层闸门的直接后果 —— 报价阶段就拿不到 `credits`，因此「前端显示 N 积分、实际扣 M 积分」的比较在 G1-G3 + 健康/配额新鲜度补齐之前**在数学上无法进行**。检查表里「积分扣费」一列在这 82 行上只能继续写 `0（未能下单）`，等运营侧完成后按第 6 节复测。

### 17.4 顺带排除掉的一个怀疑：扣费会回落到旧表的 1 积分吗？

读 `generationCore.js` 看到 `:305 creditCost = Number(model.credits_price || 0)`，而该 `model` 来自 `findModelByEndpointOrId()`，其 SQL 是 `COALESCE(p.base_credits, mc.credits_price)`（`lib/repositories/models.js:113`）⇒ 一度像是「无价盘行的 457 个模型会以旧表 1 积分扣费」的漏洞。实跑链路后**排除**：

- `generationCore.js:295-303`：`chargeCredits` 为真且客户端没传 `quoteId` 时，服务端**强制** `createGenerationQuote()` 建单；
- `:318-331`：拿到 quoteId 后必走 `verifyAndConsumeQuote()`，成功则 `creditCost = verifiedQuote.credits`（价盘表报价）覆盖 :305；
- `pricingEngine.js:438`：该函数**只有 `!quoteId` 才返回 null**，其余失效/越权/参数不符/已使用/过期全部 `throw`（`QUOTE_NOT_FOUND` / `QUOTE_USER_MISMATCH` / `QUOTE_MODEL_MISMATCH` / `QUOTE_PARAMETERS_MISMATCH` / `QUOTE_ALREADY_CONSUMED` / `QUOTE_EXPIRED`）⇒ 在这条路径上 `quoteId` 必然有值，:305 的旧表数字**不可能成为实扣金额**。
- 残留问题（属口径不一致，不属资损）：`generationQuote.js:46` 与 `lib/services/models.js:97 decorateModel()` 仍会读旧表数字，因此后台列表/详情类界面可能显示 1 积分，与工作台显示不一致 —— 归入第 5 节 E 条一并处理。

### 17.5 生产库零污染确认

本次全部实跑前后计数一致：`creations 8`、`ops_bill.credit_ledger_v2 39`、`generation_quotes 34`、`generation_attempts 5`、`model_pricing 88`。`calculateModelPrice` 走的是纯计算路径，未创建报价、未扣积分、未改价盘。

## 18. 授权构建后的第一个发现：**线上树根本无法构建**，缺的是依赖不是补丁（09-26 00:5x–01:0x UTC）

第 5 节 A4 条把上线步骤写成「`npm run build` + 重启两个 systemd 单元」。本轮拿到授权实跑后证明**这句话是不完整的**：这台机器现在跑不起一次构建，而且失败点与本轮 25 个补丁毫无关系。

### 18.1 失败现场

`NEXT_DIST_DIR=.next-build npm run build`（旁路输出目录，不碰线上 `.next`）在 webpack 阶段直接中止：

```
Module not found: Can't resolve 'firebase/app'   → lib/auth/phone-captcha-client.js
Module not found: Can't resolve 'firebase/auth'  → lib/auth/phone-captcha-client.js
> Build failed because of webpack errors
```

被引到的代码是**动态 import**，写在 async 函数体内（`lib/auth/phone-captcha-client.js`，4230 B，mtime 09-21 19:30，且该文件本身在 git 里是 **untracked**）：

```js
async function getFirebaseAuth(config, locale) {
  const [{ getApps, initializeApp }, { getAuth }] = await Promise.all([
    import('firebase/app'), import('firebase/auth'),
  ]);
```

⇒ 这类依赖不会被 `require` 图提前暴露，只能等构建到那一步才炸，所以「本地能跑、线上构建不起来」可以藏很久。

### 18.2 根因：`firebase` 只存在于本地声明，线上包清单里根本没有它

| 位置 | `package.json` | `package-lock.json` | `node_modules/firebase` |
|---|---|---|---|
| 本地树 | **39** 个依赖，`firebase: 12.19.0` | **45** 条 firebase 相关条目 | 存在 |
| 线上树 | **38** 个依赖，`firebase` **缺失**（实测 `grep -c firebase` = 0） | **0** 条（md5 `ff4e93dd…`，`grep -c firebase` = 0） | 不存在；`node_modules/@firebase` 是一个 **空目录**，mtime 09-23 23:18 |

线上 `package.json` md5 `c7ff452ecbf3719068fc68bb4a20fdcd`。关键反证：**当前正在服务的构建产物里是含 `RecaptchaVerifier` 的**（第 16 节用字符串检索确认），也就是说 09-24 14:36 那次构建时 firebase 是在位的，之后才被拿掉/被一次不带它的安装覆盖掉。所以这不是「从来没装过」，而是**依赖被无声地移除过**，与第 16 节 `lib/**` / `config/**` 零 git 跟踪合起来看，是同一个治理缺口：没有任何一份清单能证明线上运行的是哪套依赖。

顺带记录同类漂移（本轮实测，非推断）：本地 `next` 锁 **15.5.26**，线上运行的却是 **next-server v15.5.15**；本地另有 `postcss 8.5.28`、`sharp 0.35.4` 的精确 pin。⇒ 「把本地 `package.json` 当权威」在这里也不成立，只能作为线索。

### 18.3 恢复解析的方式（可逆、非破坏，且明确不是长期方案）

没有跑 `npm install`（会改动 1.3 G 的 `node_modules`、可能连带升级别的包，属于第 5 节里「未经确认不做的高风险动作」）。改用**符号链接**指向机器上另一份完整的暂存安装 `/home/wwwroot/AI/deps/koyosim-auth-repair/node_modules`：共 **55 条**（`node_modules/firebase` + 54 条 `@firebase/*`），全部 `www` 所有，**不覆盖任何已存在的包**，`node -e require.resolve()` 复验：

```
firebase/app -> /home/wwwroot/AI/deps/koyosim-auth-repair/node_modules/firebase/app/dist/index.cjs.js
firebase/auth -> /home/wwwroot/AI/deps/koyosim-auth-repair/node_modules/firebase/auth/dist/index.cjs.js
```

同一轮把动态 import 扫描出来的其余可疑包（`tencentcloud-sdk-nodejs-common`、`@alicloud/*`、`electron`）逐个 `require.resolve`，均 `ok` ⇒ firebase 是**唯一**缺失项。**这 55 条链接是一处刻意的临时部署状态**，必须写进交接：删掉它们，下次构建会以同样方式再失败。真正的修法是把 `firebase@12.19.0` 补进线上 `package.json`/lock 后一次受控安装。

### 18.4 构建期间的运行态（用来回答「会不会把线上搞挂」）

- 全程用 `NEXT_DIST_DIR=.next-build`，线上 `.next` 未被写入（构建前后 `cat .next/BUILD_ID` 均为 `ahF8q-_fpA6cgZkL5QuZF`）；
- 两个单元 `koyosim.service` / `koyosim-worker.service` 始终 `active`，本机 `http://127.0.0.1:3100/studio` 构建中实测 **200 / 0.31 s**，公网 `https://koyosim.com/` **301 / 0.32 s**；
- 代价是资源：2 vCPU 上 load average 冲到 **6.5–8.3**，可用内存最低见 **91 MB**（未触发 OOM，无 kill 记录），磁盘 86 % 用 / 7.0 G 余（`.next-build` 峰值 684 M）。
- 踩到并已修正的两个操作坑（供下次复用）：① `wwwroot` 下文件是 `www:www`，用 `ubuntu` 直接跑构建会在 `.next-build/trace` 上 `EACCES`，必须 `sudo -n -u www`；② 若日志文件是 `ubuntu` 建的，`www` 无法重定向写入，**失败是静默的** —— 本轮第一次「看起来又 EACCES」其实是读到了上一轮的旧日志，靠 `mv` 掉旧日志、让 `www` 自己 `touch` 新日志才看清真实状态。





## 19. 上线后的真实浏览器复验（09-26）：价格链路已对齐，撤回一个误判，另查出 5 项

本节全部结论来自**线上站点真实渲染的 DOM**（`https://www.koyosim.com/studio/*`，Chrome DevTools MCP 驱动）与**生产库只读查询**，不是本地代码推断。

### 19.1 部署记录

- 备份：`.next.bak-20260926`（换前现役）、`.next.prev-20260926`；
- 新 `BUILD_ID` = `kVWXkViZNPCI3jaU-baY4`（旧 `ahF8q-_fpA6cgZkL5QuZF`），`koyosim.service` / `koyosim-worker.service` 重启后均 `active`；
- 「我的改动真的在线上了吗」用三条硬证据而不是 mtime：① 编译产物字符串检索（`Geneate` 拼写错误、mojibake 均为 0 命中）；② 从线上 HTML 里取一个 asset 路径回查构建目录：`disk=YES / inOldBackup=no / http=200`；③ 冒烟：`/studio`、`/studio/video`、`/studio/audio`、`/api/models/active` 全 200。

### 19.2 图像工作台：展示价 ⇄ 价盘逐条核对 12/12

抽屉内 12 行模型的价格与 `/api/models/active`（即 `ai_studio.model_pricing` 派生）**逐条一致，0 处不一致**；`formula` 行按 `packages/studio/src/modelPrice.js` 的规则渲染成 `from N credits`（不再是伪装成一口价的裸数字）。

需要精确表述的一处「看着像不一致」：家族卡片打印的是**该家族最便宜变体的底价**（`priceForIds` 取 `Math.min(...variantIds)`），例如 Kling 2.6 卡片显示 `from 1020`，而货架上 `kling-2.6` 单行是 2040。两者都来自价盘、都不是错价，但**语义不同**（家族起价 vs 单模型价），交接时必须说清楚，否则下一轮审计会把它误报成错价。

### 19.3 音频工作台：11 行价格 11/11 与货架一致

线上音频抽屉实测渲染 11 行，逐行与货架比对全部相同：`suno-create-music 45 / remix 45 / extend 45 / generate-sounds 10 / add-vocals 45 / generate-mashup 45 / add-instrumental 45`、`minimax-voice-clone 295 / speech-2.6-hd 295 / speech-2.6-turbo 295`、`mmaudio-v2-text-to-audio 10`。mojibake 探针 `none`，上一版的 `Suno Generate Mashup` 名称已正确。

### 19.4 撤回上一轮的误判：未登录点 Generate 之后并不会永久卡在 Generating

上一轮我记录「关闭登录弹窗后按钮永久停在 ◌ Generating…、工作台废掉」。**该结论不成立**，原因是我在同一次 `evaluate_script` 里点完按钮立刻读 DOM，React 状态更新还没落地，读到的是旧渲染。

按 settle 延迟重测（点 ✕ 后分别在 0 / 600 / 2100 / 4600 ms 采样）：弹窗在 **≤600 ms** 内消失，按钮恢复 `Generate` 且 `disabled:false`，同时弹出错误提示。代码链路也是自洽的：`components/StandaloneShell.js:746 handleAuthClose` → `reject(new Error('用户取消了登录'))` → `packages/studio/src/muapi.js:126` 抛出 → `packages/studio/src/components/VideoStudio.jsx:2362` `catch` → `:2367` `finally { setGenerating(false) }`。上一轮怀疑的「没有 settle 路径」是错的：`handleAuthSuccess`/`handleAuthClose` 两条路径都会 settle `pendingAuthResolverRef`，并且确实绑到了 `AuthModal`（`StandaloneShell.js:1728-1732`）。

**方法论记一笔**（本次审计踩过，代价是一次错误结论）：验证前端状态机必须在触发之后跨一个宏任务采样，同 tick 读 DOM 只能证明「事件已派发」，不能证明「状态未恢复」。

同一轮查出的**真实缺陷（文案层，非阻塞）**：用户主动取消登录被当成生成失败上报，且提示串是硬编码中文 `用户取消了登录`，出现在英文界面（toast 实测：`Video Studio - Generation failed / 用户取消了登录`）。修法是给 `handleAuthClose` 的取消语义一个可识别错误 + i18n 文案，与真失败分开。

### 19.5 价盘新发现 ①：三条 Minimax 语音模型的「供应商价格 → 模型成本」自相矛盾

`ai_studio.provider_models` 对同一 model_id 存在**两条都 `enabled=t`、`review_status=needs_specification`、`provider_endpoint` 为空**的绑定，成本相差约 **230 倍**：

| model_id | 渠道 A | 渠道 B | 平台展示/收费 |
|---|---|---|---|
| minimax-speech-2.6-hd | muapi `base_cost=0.65 USD` | minimax `base_cost=0.02 CNY` | 295 积分（= ¥20.65 ≈ \$2.91） |
| minimax-speech-2.6-turbo | muapi `0.65 USD` | minimax `0.01 CNY` | 295 积分 |
| minimax-voice-clone | muapi `0.65 USD` | minimax `0.05 CNY` | 295 积分 |

对 muapi 成本，295 积分≈77 % 毛利，与 `target_contribution_margin_rate=0.75` 吻合；对直连 Minimax 成本，同一口价是成本的 **1000 倍以上**。哪一条生效取决于 `priority DESC, id ASC` 的 LATERAL 取值 —— 也就是说**定价目前由路由优先级隐式决定，而不是由价盘决定**。这属于「模型绑定错价」类，必须由业主先确认走哪个渠道、再删掉或禁用另一条，我没有替业务改价，也没有为了让看板变绿去填成本。

### 19.6 价盘新发现 ②：音频价盘行完全没有计费单位

`model_pricing.formula_config` 里 `billing_unit` / `unit` / `per` 三个键**全部为空**，音频 13 行清一色 `pricing_type=fixed` + `base_credits`。可 `formula_config` 里同时又挂着 `duration_multipliers {5,6,10}` 与 `resolution_multipliers {720p,1080p,4K,1024x1024}` —— 这是一份视频用的模板被套在语音行上，字段存在但不参与计价。后果：Minimax 语音按字符量计费、Suno 按整曲计费，而平台按「一次」固定收 295 / 45 积分，**长文本必亏、短文本必超收**，且这一维度在价盘上根本不可表达。这与第 5 节记录的「51 条按秒行缺 `pricing_unit`」是同一个 schema 缺口的两侧。

### 19.7 新发现 ③：音频的前端打包目录 ⊃ 后端目录 ⊃ 货架，差 6 条

打包目录 `audioModels`（`packages/studio/src/models.js:28250`）有 **18** 条，货架 **12** 条，音频抽屉实渲染 **11** 条。差集逐条定位：

- **只有前端有、后端 `ai_studio.ai_models` 里根本没有行**（6 条）：`suno-convert-to-wav`、`minimax-music-3.0`、`elevenlabs-text-to-dialogue-v3`、`elevenlabs-tts-turbo-2-5`、`gemini-3-1-flash-tts`、`gemini-2-5-pro-tts`。其中 `ai_providers` 里**不存在 `elevenlabs`**，`/etc/koyosim.env` 里也没有任何 ELEVENLABS_* 变量名 ⇒ 这 6 条不可能被报价，属于「前端 advertised、后端 ⏸ 未配置」。
- `suno-voice-clone`：active + 有价（fixed 10），但唯一绑定的 `cost_config.base_cost = 0` ⇒ 被 `lib/repositories/models.js:46-58` 的 `base_cost > 0` 闸门正确拦下（**这条闸门是我上一轮加的，行为符合预期**）。附带一处文案与价盘冲突：模型描述写「Free during preview」，价盘却是 10 积分。
- `mmaudio-v2-video-to-video`：音频模型在目录里 `category=video`，所以不出现在音频抽屉，而货架照 `video / formula / 25` 发布 ⇒ 又一个「类型标错导致工作台不可达」实例（与 `flux-1.1-pro → openai`、`gpt4o-text-to-image` 标 `image` 同类）。

### 19.8 更正第 5 节的一处凭证结论

`/etc/koyosim.env` 实测**存在** `MUAPI_API_KEY`、`MINIMAX_API_KEY` 变量名（只查名字，未打印任何值）——但变量名存在不等于值非空，真正的硬证据在货架上：`lib/services/models.js:17-31 listActiveModels()` 会把「服务端解析不到该 provider 凭证」的模型整行丢掉，而货架 69 行里 `provider=muapi` 与 `provider=minimax` 都在（三条 Minimax 语音 295 积分、七条 Suno 45/10 积分）。⇒ **Minimax 与 MuAPI 两个 key 在生产进程里确实解析成功**，`ai_providers` 中 `muapi / minimax / google / openai` 四行亦 `enabled=t`。

据此更正第 5 节：音频与 Minimax 视频线的阻塞点**不是缺 API key**，而是 `provider_models.provider_endpoint` 为空 + 映射未审批 + MuAPI 账户余额 0.00 USD（余额见第 5 节 G5，是 `sync-muapi-channels.mjs --sync-balance` 的实测返回，不是猜测）。之前把「缺供应商凭证」列为音频类首因，范围说宽了。仍缺凭证的是 `DASHSCOPE` / `KLING` 那一档，本条不覆盖它们。

顺带记一个可复用的判据：**想知道某个 provider 的凭证在生产进程里到底有没有解析成功，不要去读 `/etc/koyosim.env` 的变量名，直接看 `/api/models/active` 里有没有 `provider=<该名字>` 的行** —— 那条隐藏过滤是代码级的、且与运行时同一份环境，比环境变量列表可信得多。

### 19.9 图像落地默认模型漂移：上线后仍在，但错误提示这一环是合格的

09-26 复测 `/studio?tab=image`（真实浏览器、未登录）：`?tab=image` **本身生效**（`Images` 标签 `aria-selected=true`），但大标题仍是 `START CREATING WITH TOPAZ IMAGE UPSCALE` —— 即第 344 行记录的漂移**未被本轮构建消除**，因为它不是缓存问题而是默认值选取逻辑问题。

逐层定位（比第 344 行的推断更准）：
- 货架侧不是原因：按仓储 `ORDER BY m.sort ASC` 的镜像查询，图像行前 8 名是 `flux-pro(1) / gpt-image(2) / imagen-4(3) / nano-banana-pro(6) / flux-1.1-pro(7) / flux-schnell(8) / nano-banana(10) / flux-dev(20)`，**没有 Topaz**；
- 打包目录侧也不是原因：`topaz-image-upscale` 属于 **`i2iModels`**（需上传原图那一组），而 `ImageStudio.jsx:937` 的兜底取的是 `t2iModels[0]` = `nano-banana`；`ImageStudio.jsx:1391`（`resetToPrompt`）同样取 `t2iModels[0]`。⇒ 落地点必在别处（`imageModelCatalog` 家族合并序 / curation 之后对已失效 selectedId 的重解析），**尚未定位到唯一赋值行，不做无根据修改**；
- 结构性放大器：21 条有价图像行的 `supported_input_types` **全部是 `[]`**，后端根本没声明哪些是纯文生图。这不仅让「默认值只能靠数组顺序猜」，也正是路由阶梯里 `MAPPING_INPUT_TYPES_UNVERIFIED` 那一级的同一份缺失数据。

面向用户的实测结论（正面）：在这种落地状态下直接输入提示词点 `Generate`，客户端**没有**发请求、**没有**弹登录框、按钮**没有**卡住，而是给出正确且可操作的提示 `Please upload a reference image first.`。所以「失败/错误提示」这一项在图像工作台是 ✅，落地默认模型这一项是 ⚠️（用户会被引到一个必须先上传原图的工具，但仍能看懂下一步该做什么）。

另记一处与价格展示有关的实测事实：图像工作台**收起状态的下拉触发器上不显示任何价格**（实测 `priceBearingButtons = 0`），价格只在展开抽屉后逐行出现（12/12 与价盘一致）。⇒ 审计「前端是否显示价格」时必须区分「选中项可见」与「列表内可见」，两者不能混为一谈；前者目前是 ❌。



### 19.10 本轮仍未闭环（不粉饰）

截至 09-26，**仍然没有 1 个模型可以通过真实前端流程完成一次完整生成并拿到结果**：报价闸门 82/82 停在 `NO_COST_VERIFIED_ROUTE`，因此「前端展示价 ⇄ 实际扣费」这一列只能核到「展示价 ⇄ 价盘」为止。第 5 节 B–G 的运营侧前置（渠道审批链、健康/配额定时器、MuAPI 充值、两套价盘合并）未解前，`✅ 可正式使用` 无法授予任何一行。


### 20. 文本 / LLM 与 Agent·Workflow 入口（09-26 本轮新增，含一个最高危的价格链缺陷）

前面 1–19 节把「图像 / 视频 / 音频」三类工作台逐条核完了，但目标清单的第一项「文本 / LLM」一直只有一句「47 个 text 模型没有工作台」。本轮把它查到底，结论分三层。

#### 20.1 后台文本模型：47 行全部无价盘行，按货架门槛永远不可能被卖

生产库实测（`psql`，09-26）：

| 表 | 分布 |
|---|---|
| `ai_studio.ai_models` 按 `category` | video 579（active 573）/ image 252 / **text 48（active 47）** / audio 32 / other 16 |
| `ai_studio.models_config` 按 `type` | video 363 / image 155 / audio 12 / lipsync 5 / recast 3 / motion-control 2 —— **没有任何 `type='text'` 行** |
| text ∩ active ∩ 有 `model_pricing` 行 | **0 / 47**（`text_rows_with_price = 0`） |

因为 `lib/repositories/models.js` 的货架 SQL 要求 `pr.base_credits IS NOT NULL`，这 47 行永远进不了 `/api/models/active`（该 API 至今只有 69 行：17 图 / 41 视频 / 11 音频，**文本 0 行**）。前端也没有任何文本工作台（无 `TextStudio`、无文本模型下拉、老价盘表 `models_config` 连 `text` 这个 type 都不存在）。⇒ 目标清单第 1 项「文本 / LLM」作为**可购买产品**在 KOYO Studio 上不存在，47 行状态为 `⏸ 未配置`。

顺带把「分类即计费单位」这条错配钉死：47 行 text 里真正的文本模型只有约 10 行（`rhart-text-g-25-pro/flash`、`g-3-flash/pro-preview` 的 text-to-text / image-to-text / video-to-text、`qwen-27b/chat`），其余是 **Mureka 歌曲生成/伴奏/音轨分离/人声克隆、Doubao·千问 TTS、可灵对口型、marble 文生 3D 世界、PixVerse 视频续写、素材上传**，且 47 行全部来自同一个供应商 `RunningHub 聚合 API`。按现在的设计，`category` 同时决定「能不能被前端看到」和「按什么单位计费」，所以这 37 行错分类 = 错计费（一次歌曲生成和一段文本聊天不可能同价）。

#### 20.2 最高危：Agent / Workflow / 通用 MuAPI 透传 = 供应商真扣钱、用户零积分，且守卫根本没接线

三条独立证据（不是推断，是查了运行构建与部署源码）：

1. 部署树上 5 条代理路由 **一个都不引用** 策略模块：`app/api/{agents,app,workflow}/[[...path]]/route.js`、`app/api/api/v1/[[...path]]/route.js`、`app/api/v1/creative-agent/[[...path]]/route.js` 的 `grep -c "guardScopedProxyRequest\|classifyProxyRequest\|authorizeCreativeAgentProxyPath"` 全部 **= 0**；整棵部署树里只有 `lib/security/scopedProxyGuard.js` 自己提到 `legacyProxyPolicy`。
2. 运行构建 `.next/server`（`BUILD_ID kVWXkViZNPCI3jaU-baY4`，09-26 刚上线的那次）里 `DENY_BILLING_REQUIRED` / `legacy_proxy/denied` / `authorizeScopedProxyPath` / `classifyProxyRequest` / `该推理入口尚未接入平台额度结算` / `该接口不可用` **全部 0 命中**（同一次 grep 里 `请先登录` 命中 140 个文件，所以不是编码问题）。⇒ 策略模块在两台机器上都是**死代码**，09-26 的构建也没把它变成活的。
3. 实际行为：`GET/POST /api/agents?is_template=true`、`/api/agents/by-slug/x/chat`、`/api/agents/suggest`、`/api/workflow/abc/run`、`/api/api/v1/predictions`、`/api/api/v1/upload_file`、`/api/v1/creative-agent/agent-skills` 未登录一律 `401 请先登录`（平台 `auth_usr.users` 有 25 个注册用户）；登录后代码路径就只剩 `cleanHeaders()` + `headers.set('x-api-key', 平台密钥)` + `fetch('https://api.muapi.ai/…' + 任意 path)`。

结论：**任何登录用户都能让平台用自己的 MuAPI 密钥去调任意上游端点，全链路没有一次 `pricingEngine` / `creditService` 调用，也没有 per-user 频次限制**（`guardMutation` 只限 body 大小 512 KB / 上传 50 MB）。可读的付费入口至少包括：`POST /api/agents/by-slug/*/chat`（Agent 对话）、`POST /api/workflow/*/run`、`/api/workflow/*/node/*/run`、`/api/workflow/architect`（工作流执行）、以及最宽的 `ANY /api/api/v1/*` —— 后者能把 `account`、`balance`、`history` 这类供应商账户路径和任意模型端点直接打到 MuAPI。现在之所以还没流出真金白银，**只因为 MuAPI 余额是 0.00 USD**（§5 G5）；一旦按建议充值，这条通道立刻变成「用户 0 积分、平台按次付供应商」的漏扣口子，而且是在同一个密钥下，连归因都做不到。BYOK 侧是干净的：`lib/security/byok.js:13` 默认拒绝客户端自带 key（`BYOK_DISABLED`），所以透传用的必然是平台密钥。

这正是代码自己写明的意图（部署树 `legacyProxyPolicy.js:130` 「These upstream calls incur provider cost but have no user-credit reservation.」、`scopedProxyGuard.js:9` 「计费调用直接消耗平台余额且不扣用户积分，限额必须收紧」、`:180` 「Inference must use /api/generations so the server reserves and settles credits.」）—— 意图完整，缺的只是**接线**。

#### 20.3 修复：合并两棵树的策略后把守卫接进 5 条路由（已装进部署树，未构建）

本轮第一次出现「两棵树各有更新、必须合并」不是一次而是同一模块：部署树的策略模块（209 行、8060 B，allow 表覆盖了 UI 真正需要的元数据端点：`user/agents`、`user/conversations`、`by-slug/*/*`、workflow 的 `run/*/status`、`get-workflow-def/*`… 并多了 `RESERVED_SEGMENTS` 与计费调用 20 次/分 + 150 次/时的双限额）比本地（188 行）**更新**；而本地路由**接了线**、部署路由没接。所以取「部署策略 + 本地接线 + 补回本地独有的 `authorizeCreativeAgentProxyPath`」，而不是任何一侧覆盖另一侧。

验证方式（纯函数真值表，`node` 直接跑合并后的模块，25 条用例；不依赖账户、不写生产数据）：

- 放行：`GET /api/agents`（目录）、`GET by-slug/*`、`GET user/conversations`、`GET */profile`、`GET workflow/get-published-workflows`、`GET workflow/run/*/status`、`GET app/get_file_upload_url`、`GET /api/api/v1/models/*/estimate-cost`、`POST /api/api/v1/upload_file`、`GET creative-agent/agent-skills`。
- 关闭（402 `DENY_BILLING_REQUIRED`）：`POST by-slug/*/chat`、`POST suggest`、`POST /api/agents`（建 Agent）、`POST workflow/*/run`、`POST workflow/*/node/*/run`、`POST workflow/architect`、`POST creative-agent/sessions/*/chat`、`POST creative-agent/jobs/*/approve`。
- 关闭（403 `DENY_ACCOUNT` / 404 `DENY_PATH`）：`GET /api/api/v1/account/balance`、`GET /api/api/v1/predictions/<非本机 gen_>/result`、`POST /api/api/v1/nano-banana`。

已安装 7 个文件到部署树（2 个策略模块 + 5 条路由），逐文件 `md5sum` 与本地**逐字节一致**，`www:www 644`，原文件备份为同目录 `.bak-20260926`。**没有构建、没有重启**，所以线上仍是 20.2 的无守卫行为；要等下一次批准的构建才生效。两个必须让 owner 先点头的后果：① 构建后 Agents 的「对话/运行」和 Workflows 的「执行」按钮会开始返回 402「该推理入口尚未接入平台额度结算，暂不可用」——即这条产品线在补完积分预扣之前是**主动关闭**的；② 残留两个仍在 allow 表里、不在 billed 表里的上游调用 `POST by-slug/*/like` 与 `POST app/calculate_dynamic_cost`，供应商侧是否计费未证实，充值前建议一并关掉。另有一处纯语义问题：`/api/api/v1` 路由没给 `classifyProxyRequest` 传 `isKnownGenerationEndpoint`，所以已知生成端点返回 404 而不是更准确的 402。

#### 20.4 浏览器实测（未登录）：文本/Agent 类目的前端与错误提示不合格

- 导航栏挂着 `Agents & Workflows` + `NEW` 徽标；打开 `https://www.koyosim.com/studio/agents`：标题 `AGENTS`、四个按钮 `TEMPLATES / MY AGENTS / MY CHATS / + CREATE` 全在，内容区只有 **`FAILED TO LOAD.` + `Retry`**，**没有任何登录引导**。网络面板显示这次加载**根本没有发出** `/api/agents` 请求（只有 branding、auth/me、content-config、models/active、subscription-faq 五条）⇒ 未登录时这是一个连错误来源都没暴露的死胡同，「失败提示」这一项不合格。
- `https://www.koyosim.com/studio/workflows`：页面正常渲染，但把未登录的 401 显示成 **`No workflows found in this section.`** —— 与「真的没有数据」无法区分，属于把鉴权失败伪装成空态。

#### 20.5 本类目在最终检查表里的状态行

| 入口 | 类型 | 供应商 | 前端 | API | 实际生成 | 结果展示 | 价格 | 积分扣费 | 状态 | 问题 | 修复结果 |
|---|---|---|---|---|---|---|---|---|---|---|---|
| 47 个 text 模型（Mureka/TTS/对口型/rhart 文本/marble 等） | text（多为错分类） | RunningHub | ❌ 无任何工作台、不在 `/api/models/active` | ⏸ 无调用方 | ❌ | — | ⏸ 0/47 有价盘行 | 0 | ⏸ 未配置 | 缺 `model_pricing` 行；37/47 实际不是文本任务，category 同时决定可达性与计费单位 | 需运营补价盘 + 重新分类，不可脚本批量伪造 |
| Agents 对话 / 创建 / suggest | agent 推理 | MuAPI（平台密钥） | ❌ 未登录即 `FAILED TO LOAD.` 且无登录引导 | ⚠️ 透传已确认 | ❌ 零积分扣费直达供应商 | — | 无价格概念 | **0（应扣未扣）** | ❌ 不可使用 | 守卫模块存在但 0 条路由引用，运行构建 0 命中 | 已接线 + 合并部署侧更全的策略表，装进部署树，待构建生效 |
| Workflows 执行 / architect / node run | agent 推理 | MuAPI | ⚠️ 401 被伪装成空态 | ⚠️ 透传已确认 | ❌ 同上 | — | 同上 | **0（应扣未扣）** | ❌ 不可使用 | 同上 | 同上 |
| `/api/api/v1/*` 通用透传（含 `account`/`balance`/任意端点） | 供应商直连 | MuAPI | — | ❌ 无 allowlist、无账户隔离 | ❌ 可产生供应商费用 | — | — | **0（应扣未扣）** | ❌ 不可使用 | `DENIED_FIRST_SEGMENTS`/`classifyProxyRequest` 未生效 | 接线后：账户路径 403、非白名单端点 404、仅 estimate-cost 与 upload_file 放行 |


## 附录 A：82 个上架模型逐条检查表

说明：`API` 列的「报价被拒」均已在真实生产库上逐模型执行确认；首因分两类 —— 有 `model_pricing` 行者为 `NO_COST_VERIFIED_ROUTE[PROVIDER_ENDPOINT_MISSING]`，无价盘行者为 `MODEL_PRICING_UNCONFIGURED`。**「实际生成 / 结果展示 / 积分扣费」三列为空，是指本表这 82 行在本次检查时刻的即时结论，不是「平台从未成功出过图」**：全库 `creations` 共 8 行，其中 2 行 09-20 真实成功（`seedream-5.0`，各扣 2 积分，产物已落 `/uploads/creations/202609/`），另有 5 行走完报价+路由+建 attempt 后停在供应商 402（见第 0 节修正说明）。这 7 行涉及的模型（`nano-banana-pro`、`flux-schnell`、`wan2.7-text-to-image-pro`）与本表交集内的那些，之所以当时能下单、现在被拒，是因为目录启用状态与 24h 成本新鲜度已经过期回落。
| 模型 | 类型 | 供应商 | 前端 | API | 实际生成 | 结果展示 | 价格 | 积分扣费 | 状态 | 问题 | 修复结果 |
|---|---|---|---|---|---|---|---|---|---|---|---|
| ai-clipping | image | muapi | ✅ 已上架 | ❌ 报价被拒 | ❌ 未进入队列 | — | 230 积分 / $0.5/次 / 1 | 0（未能下单） | ⏸ 未配置 | 渠道 provider_endpoint 为空；review_status=needs_specification；两套目录价冲突：目录 230 积分 vs 老表 1 积分 | 展示价改为只读价盘行，不再兜底 50 |
| imagen-4 | image | google | ❌ 不在前端任何代码中 | ❌ 报价被拒 | ❌ 未进入队列 | — | 55 积分 / $0.03/次 / - | 0（未能下单） | ⏸ 未配置 | 渠道 provider_endpoint 为空；review_status=needs_specification；老表无对应行（客户端发此名时只能靠兜底） | 展示价改为只读价盘行，不再兜底 50 |
| nano-banana-pro | image | muapi | ✅ 已上架 | ❌ 报价被拒 | ❌ 未进入队列 | — | 55 积分 / $0.12/次 / 2 | 0（未能下单） | ⏸ 未配置 | 渠道 provider_endpoint 为空；review_status=needs_specification；两套目录价冲突：目录 55 积分 vs 老表 2 积分 | 展示价改为只读价盘行，不再兜底 50 |
| nano-banana-pro-edit | image | muapi | ✅ 已上架 | ❌ 报价被拒 | ❌ 未进入队列 | — | 55 积分 / $0.12/次 / 1 | 0（未能下单） | ⏸ 未配置 | 渠道 provider_endpoint 为空；review_status=needs_specification；两套目录价冲突：目录 55 积分 vs 老表 1 积分 | 展示价改为只读价盘行，不再兜底 50 |
| topaz-image-upscale | image | muapi | ✅ 已上架 | ❌ 报价被拒 | ❌ 未进入队列 | — | 35 积分 / $0.075/次 / 1 | 0（未能下单） | ⏸ 未配置 | 渠道 provider_endpoint 为空；review_status=needs_specification；两套目录价冲突：目录 35 积分 vs 老表 1 积分 | 展示价改为只读价盘行，不再兜底 50 |
| flux-1.1-pro | image | openai | ⏸ 隐藏(供应商无凭证) | ❌ 报价被拒 | ❌ 未进入队列 | — | 20 积分 / $0.035/次 / 6 | 0（未能下单） | ⏸ 未配置 | 渠道 provider_endpoint 为空；review_status=needs_specification；两套目录价冲突：目录 20 积分 vs 老表 6 积分；FLUX 绑到 openai 渠道 | 展示价改为只读价盘行，不再兜底 50 |
| flux-pro | image | muapi | ✅ 已上架 | ❌ 报价被拒 | ❌ 未进入队列 | — | 20 积分 / $0.03/次 / - | 0（未能下单） | ⏸ 未配置 | 渠道 provider_endpoint 为空；review_status=needs_specification；老表无对应行（客户端发此名时只能靠兜底） | 展示价改为只读价盘行，不再兜底 50 |
| gpt4o-text-to-image | image | openai | ✅ 已上架 | ❌ 报价被拒 | ❌ 未进入队列 | — | 20 积分 / $0.04/次 / 1 | 0（未能下单） | ⏸ 未配置 | 渠道 provider_endpoint 为空；review_status=needs_specification；两套目录价冲突：目录 20 积分 vs 老表 1 积分 | 展示价改为只读价盘行，不再兜底 50 |
| gpt-image | image | openai | ⏸ 隐藏(供应商无凭证) | ❌ 报价被拒 | ❌ 未进入队列 | — | 20 积分 / $0.04/次 / - | 0（未能下单） | ⏸ 未配置 | 渠道 provider_endpoint 为空；review_status=needs_specification；老表无对应行（客户端发此名时只能靠兜底） | 展示价改为只读价盘行，不再兜底 50 |
| ai-anime-generator | image | muapi | ✅ 已上架 | ❌ 报价被拒 | ❌ 未进入队列 | — | 15 积分 / $0.03/次 / 1 | 0（未能下单） | ⏸ 未配置 | 渠道 provider_endpoint 为空；review_status=needs_specification；两套目录价冲突：目录 15 积分 vs 老表 1 积分 | 展示价改为只读价盘行，不再兜底 50 |
| flux-kontext-pro-t2i | image | muapi | ✅ 已上架 | ❌ 报价被拒 | ❌ 未进入队列 | — | 15 积分 / $0.03/次 / 1 | 0（未能下单） | ⏸ 未配置 | 渠道 provider_endpoint 为空；review_status=needs_specification；两套目录价冲突：目录 15 积分 vs 老表 1 积分 | 展示价改为只读价盘行，不再兜底 50 |
| nano-banana | image | muapi | ✅ 已上架 | ❌ 报价被拒 | ❌ 未进入队列 | — | 15 积分 / $0.03/次 / 1 | 0（未能下单） | ⏸ 未配置 | 渠道 provider_endpoint 为空；review_status=needs_specification；两套目录价冲突：目录 15 积分 vs 老表 1 积分 | 展示价改为只读价盘行，不再兜底 50 |
| wan2.1-text-to-image | image | muapi | ⏸ 隐藏(供应商无凭证) | ❌ 报价被拒 | ❌ 未进入队列 | — | 15 积分 / $0.03/次 / 1 | 0（未能下单） | ⏸ 未配置 | 渠道 provider_endpoint 为空；review_status=needs_specification；两套目录价冲突：目录 15 积分 vs 老表 1 积分 | 展示价改为只读价盘行，不再兜底 50 |
| ai-image-upscaler | image | muapi | ✅ 已上架 | ❌ 报价被拒 | ❌ 未进入队列 | — | 10 积分 / $0.02/次 / 1 | 0（未能下单） | ⏸ 未配置 | 渠道 provider_endpoint 为空；review_status=needs_specification；两套目录价冲突：目录 10 积分 vs 老表 1 积分 | 展示价改为只读价盘行，不再兜底 50 |
| flux-dev | image | muapi | ✅ 已上架 | ❌ 报价被拒 | ❌ 未进入队列 | — | 10 积分 / $0.015/次 / 1 | 0（未能下单） | ⏸ 未配置 | 渠道 provider_endpoint 为空；review_status=needs_specification；两套目录价冲突：目录 10 积分 vs 老表 1 积分 | 展示价改为只读价盘行，不再兜底 50 |
| flux-kontext-dev-t2i | image | muapi | ✅ 已上架 | ❌ 报价被拒 | ❌ 未进入队列 | — | 10 积分 / $0.02/次 / 1 | 0（未能下单） | ⏸ 未配置 | 渠道 provider_endpoint 为空；review_status=needs_specification；两套目录价冲突：目录 10 积分 vs 老表 1 积分 | 展示价改为只读价盘行，不再兜底 50 |
| flux-schnell | image | muapi | ✅ 已上架 | ❌ 报价被拒 | ❌ 未进入队列 | — | 10 积分 / $0.003/次 / 1 | 0（未能下单） | ⏸ 未配置 | 渠道 provider_endpoint 为空；review_status=needs_specification；两套目录价冲突：目录 10 积分 vs 老表 1 积分 | 展示价改为只读价盘行，不再兜底 50 |
| flux-schnell-image | image | muapi | ✅ 已上架 | ❌ 报价被拒 | ❌ 未进入队列 | — | 10 积分 / $0.003/次 / 1 | 0（未能下单） | ⏸ 未配置 | 渠道 provider_endpoint 为空；review_status=needs_specification；两套目录价冲突：目录 10 积分 vs 老表 1 积分 | 展示价改为只读价盘行，不再兜底 50 |
| hidream-i1-fast | image | muapi | ✅ 已上架 | ❌ 报价被拒 | ❌ 未进入队列 | — | 10 积分 / $0.008/次 / 1 | 0（未能下单） | ⏸ 未配置 | 渠道 provider_endpoint 为空；review_status=needs_specification；两套目录价冲突：目录 10 积分 vs 老表 1 积分 | 展示价改为只读价盘行，不再兜底 50 |
| seedvr2-image-upscale | image | muapi | ✅ 已上架 | ❌ 报价被拒 | ❌ 未进入队列 | — | 10 积分 / $0.02/次 / 1 | 0（未能下单） | ⏸ 未配置 | 渠道 provider_endpoint 为空；review_status=needs_specification；两套目录价冲突：目录 10 积分 vs 老表 1 积分 | 展示价改为只读价盘行，不再兜底 50 |
| veo3-image-to-video | video | google | ✅ 已上架 | ❌ 报价被拒 | ❌ 未进入队列 | — | 5660 积分 / $0.35/秒 / 1 | 0（未能下单） | ⏸ 未配置 | 渠道 provider_endpoint 为空；review_status=needs_specification；formula 行 pricing_unit 为空，展示价 5660 是历史快照而非按秒单价；两套目录价冲突：目录 5660 积分 vs 老表 1 积分 | 展示价改为只读价盘行，不再兜底 50 |
| seedance-2.5-motion-control | video | muapi | ✅ 已上架 | ❌ 报价被拒 | ❌ 未进入队列 | — | 3395 积分 / $1.5/秒 / 1 | 0（未能下单） | ⏸ 未配置 | 渠道 provider_endpoint 为空；review_status=needs_specification；formula 行 pricing_unit 为空，展示价 3395 是历史快照而非按秒单价；两套目录价冲突：目录 3395 积分 vs 老表 1 积分 | 展示价改为只读价盘行，不再兜底 50 |
| kling-v2.1-master-t2v | video | kling | ✅ 已上架 | ❌ 报价被拒 | ❌ 未进入队列 | — | 2720 积分 / $0.15/秒 / 1 | 0（未能下单） | ⏸ 未配置 | 渠道 provider_endpoint 为空；review_status=needs_specification；formula 行 pricing_unit 为空，展示价 2720 是历史快照而非按秒单价；两套目录价冲突：目录 2720 积分 vs 老表 1 积分 | 展示价改为只读价盘行，不再兜底 50 |
| seedance-2-motion-control | video | muapi | ✅ 已上架 | ❌ 报价被拒 | ❌ 未进入队列 | — | 2265 积分 / $1/秒 / 1 | 0（未能下单） | ⏸ 未配置 | 渠道 provider_endpoint 为空；review_status=needs_specification；formula 行 pricing_unit 为空，展示价 2265 是历史快照而非按秒单价；两套目录价冲突：目录 2265 积分 vs 老表 1 积分 | 展示价改为只读价盘行，不再兜底 50 |
| kling-2.6 | video | kling | ✅ 已上架 | ❌ 报价被拒 | ❌ 未进入队列 | — | 2040 积分 / $0.2/秒 / - | 0（未能下单） | ⏸ 未配置 | 渠道 provider_endpoint 为空；review_status=needs_specification；formula 行 pricing_unit 为空，展示价 2040 是历史快照而非按秒单价；老表无对应行（客户端发此名时只能靠兜底） | 展示价改为只读价盘行，不再兜底 50 |
| kling-v2.6-pro-t2v | video | kling | ✅ 已上架 | ❌ 报价被拒 | ❌ 未进入队列 | — | 2040 积分 / $0.22/秒 / 1 | 0（未能下单） | ⏸ 未配置 | 渠道 provider_endpoint 为空；review_status=needs_specification；formula 行 pricing_unit 为空，展示价 2040 是历史快照而非按秒单价；两套目录价冲突：目录 2040 积分 vs 老表 1 积分 | 展示价改为只读价盘行，不再兜底 50 |
| seedance-v2.0-t2v | video | muapi | ✅ 已上架 | ❌ 报价被拒 | ❌ 未进入队列 | — | 1700 积分 / $0.75/秒 / 1 | 0（未能下单） | ⏸ 未配置 | 渠道 provider_endpoint 为空；review_status=needs_specification；formula 行 pricing_unit 为空，展示价 1700 是历史快照而非按秒单价；两套目录价冲突：目录 1700 积分 vs 老表 1 积分 | 展示价改为只读价盘行，不再兜底 50 |
| kling-o1-text-to-video | video | muapi | ✅ 已上架 | ❌ 报价被拒 | ❌ 未进入队列 | — | 1630 积分 / $0.72/秒 / 1 | 0（未能下单） | ⏸ 未配置 | 渠道 provider_endpoint 为空；review_status=needs_specification；formula 行 pricing_unit 为空，展示价 1630 是历史快照而非按秒单价；两套目录价冲突：目录 1630 积分 vs 老表 1 积分 | 展示价改为只读价盘行，不再兜底 50 |
| kling-v3.0-standard-image-to-video | video | kling | ✅ 已上架 | ❌ 报价被拒 | ❌ 未进入队列 | — | 1630 积分 / $0.2/秒 / 1 | 0（未能下单） | ⏸ 未配置 | 渠道 provider_endpoint 为空；review_status=needs_specification；formula 行 pricing_unit 为空，展示价 1630 是历史快照而非按秒单价；两套目录价冲突：目录 1630 积分 vs 老表 1 积分 | 展示价改为只读价盘行，不再兜底 50 |
| kling-v3.0-standard-text-to-video | video | muapi | ✅ 已上架 | ❌ 报价被拒 | ❌ 未进入队列 | — | 1630 积分 / $0.72/秒 / 1 | 0（未能下单） | ⏸ 未配置 | 渠道 provider_endpoint 为空；review_status=needs_specification；formula 行 pricing_unit 为空，展示价 1630 是历史快照而非按秒单价；两套目录价冲突：目录 1630 积分 vs 老表 1 积分 | 展示价改为只读价盘行，不再兜底 50 |
| veo3-fast-image-to-video | video | google | ✅ 已上架 | ❌ 报价被拒 | ❌ 未进入队列 | — | 1360 积分 / $0.28/秒 / 1 | 0（未能下单） | ⏸ 未配置 | 渠道 provider_endpoint 为空；review_status=needs_specification；formula 行 pricing_unit 为空，展示价 1360 是历史快照而非按秒单价；两套目录价冲突：目录 1360 积分 vs 老表 1 积分 | 展示价改为只读价盘行，不再兜底 50 |
| kling-v2.5-turbo-pro-t2v | video | kling | ✅ 已上架 | ❌ 报价被拒 | ❌ 未进入队列 | — | 1020 积分 / $0.18/秒 / 1 | 0（未能下单） | ⏸ 未配置 | 渠道 provider_endpoint 为空；review_status=needs_specification；formula 行 pricing_unit 为空，展示价 1020 是历史快照而非按秒单价；两套目录价冲突：目录 1020 积分 vs 老表 1 积分 | 展示价改为只读价盘行，不再兜底 50 |
| kling-v2.6-std-motion-control | video | kling | ✅ 已上架 | ❌ 报价被拒 | ❌ 未进入队列 | — | 1020 积分 / $0.25/秒 / 1 | 0（未能下单） | ⏸ 未配置 | 渠道 provider_endpoint 为空；review_status=needs_specification；formula 行 pricing_unit 为空，展示价 1020 是历史快照而非按秒单价；两套目录价冲突：目录 1020 积分 vs 老表 1 积分 | 展示价改为只读价盘行，不再兜底 50 |
| hailuo-02 | video | minimax | ✅ 已上架 | ❌ 报价被拒 | ❌ 未进入队列 | — | 945 积分 / $0.18/秒 / - | 0（未能下单） | ⏸ 未配置 | 渠道 provider_endpoint 为空；review_status=needs_specification；formula 行 pricing_unit 为空，展示价 945 是历史快照而非按秒单价；老表无对应行（客户端发此名时只能靠兜底） | 展示价改为只读价盘行，不再兜底 50 |
| minimax-hailuo-2.3-standard-i2v | video | minimax | ✅ 已上架 | ❌ 报价被拒 | ❌ 未进入队列 | — | 815 积分 / $0.16/秒 / 1 | 0（未能下单） | ⏸ 未配置 | 渠道 provider_endpoint 为空；review_status=needs_specification；formula 行 pricing_unit 为空，展示价 815 是历史快照而非按秒单价；两套目录价冲突：目录 815 积分 vs 老表 1 积分 | 展示价改为只读价盘行，不再兜底 50 |
| minimax-hailuo-2.3-standard-t2v | video | muapi | ✅ 已上架 | ❌ 报价被拒 | ❌ 未进入队列 | — | 815 积分 / $0.36/秒 / 1 | 0（未能下单） | ⏸ 未配置 | 渠道 provider_endpoint 为空；review_status=needs_specification；formula 行 pricing_unit 为空，展示价 815 是历史快照而非按秒单价；两套目录价冲突：目录 815 积分 vs 老表 1 积分 | 展示价改为只读价盘行，不再兜底 50 |
| wan-2.1 | video | alibaba | ⏸ 隐藏(供应商无凭证) | ❌ 报价被拒 | ❌ 未进入队列 | — | 790 积分 / $0.14/秒 / 8 | 0（未能下单） | ⏸ 未配置 | 渠道 provider_endpoint 为空；review_status=needs_specification；formula 行 pricing_unit 为空，展示价 790 是历史快照而非按秒单价；两套目录价冲突：目录 790 积分 vs 老表 8 积分 | 展示价改为只读价盘行，不再兜底 50 |
| seedance-v1.5-pro-t2v | video | muapi | ✅ 已上架 | ❌ 报价被拒 | ❌ 未进入队列 | — | 770 积分 / $0.34/秒 / 1 | 0（未能下单） | ⏸ 未配置 | 渠道 provider_endpoint 为空；review_status=needs_specification；formula 行 pricing_unit 为空，展示价 770 是历史快照而非按秒单价；两套目录价冲突：目录 770 积分 vs 老表 1 积分 | 展示价改为只读价盘行，不再兜底 50 |
| ai-dance-effects | video | muapi | ✅ 已上架 | ❌ 报价被拒 | ❌ 未进入队列 | — | 680 积分 / $0.3/秒 / 1 | 0（未能下单） | ⏸ 未配置 | 渠道 provider_endpoint 为空；review_status=needs_specification；formula 行 pricing_unit 为空，展示价 680 是历史快照而非按秒单价；两套目录价冲突：目录 680 积分 vs 老表 1 积分 | 展示价改为只读价盘行，不再兜底 50 |
| ai-video-effects | video | muapi | ✅ 已上架 | ❌ 报价被拒 | ❌ 未进入队列 | — | 680 积分 / $0.3/秒 / 1 | 0（未能下单） | ⏸ 未配置 | 渠道 provider_endpoint 为空；review_status=needs_specification；formula 行 pricing_unit 为空，展示价 680 是历史快照而非按秒单价；两套目录价冲突：目录 680 积分 vs 老表 1 积分 | 展示价改为只读价盘行，不再兜底 50 |
| kling-v2.1-master-i2v | video | kling | ✅ 已上架 | ❌ 报价被拒 | ❌ 未进入队列 | — | 680 积分 / $0.15/秒 / 1 | 0（未能下单） | ⏸ 未配置 | 渠道 provider_endpoint 为空；review_status=needs_specification；formula 行 pricing_unit 为空，展示价 680 是历史快照而非按秒单价；两套目录价冲突：目录 680 积分 vs 老表 1 积分 | 展示价改为只读价盘行，不再兜底 50 |
| motion-controls | video | muapi | ✅ 已上架 | ❌ 报价被拒 | ❌ 未进入队列 | — | 680 积分 / $0.3/秒 / 1 | 0（未能下单） | ⏸ 未配置 | 渠道 provider_endpoint 为空；review_status=needs_specification；formula 行 pricing_unit 为空，展示价 680 是历史快照而非按秒单价；两套目录价冲突：目录 680 积分 vs 老表 1 积分 | 展示价改为只读价盘行，不再兜底 50 |
| vfx | video | muapi | ✅ 已上架 | ❌ 报价被拒 | ❌ 未进入队列 | — | 680 积分 / $0.3/秒 / 1 | 0（未能下单） | ⏸ 未配置 | 渠道 provider_endpoint 为空；review_status=needs_specification；formula 行 pricing_unit 为空，展示价 680 是历史快照而非按秒单价；两套目录价冲突：目录 680 积分 vs 老表 1 积分 | 展示价改为只读价盘行，不再兜底 50 |
| wan2.1-image-to-video | video | alibaba | ⏸ 隐藏(供应商无凭证) | ❌ 报价被拒 | ❌ 未进入队列 | — | 680 积分 / $0.14/秒 / 1 | 0（未能下单） | ⏸ 未配置 | 渠道 provider_endpoint 为空；review_status=needs_specification；formula 行 pricing_unit 为空，展示价 680 是历史快照而非按秒单价；两套目录价冲突：目录 680 积分 vs 老表 1 积分 | 展示价改为只读价盘行，不再兜底 50 |
| wan2.2-edit-video | video | muapi | ⏸ 隐藏(供应商无凭证) | ❌ 报价被拒 | ❌ 未进入队列 | — | 680 积分 / $0.3/秒 / 1 | 0（未能下单） | ⏸ 未配置 | 渠道 provider_endpoint 为空；review_status=needs_specification；formula 行 pricing_unit 为空，展示价 680 是历史快照而非按秒单价；两套目录价冲突：目录 680 积分 vs 老表 1 积分 | 展示价改为只读价盘行，不再兜底 50 |
| wan2.2-image-to-video | video | alibaba | ⏸ 隐藏(供应商无凭证) | ❌ 报价被拒 | ❌ 未进入队列 | — | 680 积分 / $0.16/秒 / 1 | 0（未能下单） | ⏸ 未配置 | 渠道 provider_endpoint 为空；review_status=needs_specification；formula 行 pricing_unit 为空，展示价 680 是历史快照而非按秒单价；两套目录价冲突：目录 680 积分 vs 老表 1 积分 | 展示价改为只读价盘行，不再兜底 50 |
| ltx-2.3-lipsync | video | muapi | ✅ 已上架 | ❌ 报价被拒 | ❌ 未进入队列 | — | 590 积分 / $0.26/秒 / 1 | 0（未能下单） | ⏸ 未配置 | 渠道 provider_endpoint 为空；review_status=needs_specification；formula 行 pricing_unit 为空，展示价 590 是历史快照而非按秒单价；两套目录价冲突：目录 590 积分 vs 老表 1 积分 | 展示价改为只读价盘行，不再兜底 50 |
| heygen-video-translate | video | muapi | ✅ 已上架 | ❌ 报价被拒 | ❌ 未进入队列 | — | 570 积分 / $0.25/秒 / 1 | 0（未能下单） | ⏸ 未配置 | 渠道 provider_endpoint 为空；review_status=needs_specification；formula 行 pricing_unit 为空，展示价 570 是历史快照而非按秒单价；两套目录价冲突：目录 570 积分 vs 老表 1 积分 | 展示价改为只读价盘行，不再兜底 50 |
| runway-act-two-recast | video | runway | ⏸ 隐藏(供应商无凭证) | ❌ 报价被拒 | ❌ 未进入队列 | — | 570 积分 / $0.25/秒 / 1 | 0（未能下单） | ⏸ 未配置 | 渠道 provider_endpoint 为空；review_status=needs_specification；formula 行 pricing_unit 为空，展示价 570 是历史快照而非按秒单价；两套目录价冲突：目录 570 积分 vs 老表 1 积分 | 展示价改为只读价盘行，不再兜底 50 |
| veo-2-image-to-video | video | google | ❌ 不在前端任何代码中 | ❌ 报价被拒 | ❌ 未进入队列 | — | 570 积分 / $0.25/秒 / 1 | 0（未能下单） | ⏸ 未配置 | 渠道 provider_endpoint 为空；review_status=needs_specification；formula 行 pricing_unit 为空，展示价 570 是历史快照而非按秒单价；两套目录价冲突：目录 570 积分 vs 老表 1 积分 | 展示价改为只读价盘行，不再兜底 50 |
| veo-2-text-to-video | video | google | ❌ 不在前端任何代码中 | ❌ 报价被拒 | ❌ 未进入队列 | — | 570 积分 / $0.25/秒 / 1 | 0（未能下单） | ⏸ 未配置 | 渠道 provider_endpoint 为空；review_status=needs_specification；formula 行 pricing_unit 为空，展示价 570 是历史快照而非按秒单价；两套目录价冲突：目录 570 积分 vs 老表 1 积分 | 展示价改为只读价盘行，不再兜底 50 |
| kling-v2.1-standard-i2v | video | muapi | ✅ 已上架 | ❌ 报价被拒 | ❌ 未进入队列 | — | 510 积分 / $0.225/秒 / 1 | 0（未能下单） | ⏸ 未配置 | 渠道 provider_endpoint 为空；review_status=needs_specification；formula 行 pricing_unit 为空，展示价 510 是历史快照而非按秒单价；两套目录价冲突：目录 510 积分 vs 老表 1 积分 | 展示价改为只读价盘行，不再兜底 50 |
| infinitetalk-image-to-video | video | muapi | ✅ 已上架 | ❌ 报价被拒 | ❌ 未进入队列 | — | 455 积分 / $0.2/秒 / 1 | 0（未能下单） | ⏸ 未配置 | 渠道 provider_endpoint 为空；review_status=needs_specification；formula 行 pricing_unit 为空，展示价 455 是历史快照而非按秒单价；两套目录价冲突：目录 455 积分 vs 老表 1 积分 | 展示价改为只读价盘行，不再兜底 50 |
| runway-aleph-v2v | video | muapi | ✅ 已上架 | ❌ 报价被拒 | ❌ 未进入队列 | — | 455 积分 / $0.2/秒 / 1 | 0（未能下单） | ⏸ 未配置 | 渠道 provider_endpoint 为空；review_status=needs_specification；formula 行 pricing_unit 为空，展示价 455 是历史快照而非按秒单价；两套目录价冲突：目录 455 积分 vs 老表 1 积分 | 展示价改为只读价盘行，不再兜底 50 |
| wan2.2-speech-to-video | video | muapi | ⏸ 隐藏(供应商无凭证) | ❌ 报价被拒 | ❌ 未进入队列 | — | 455 积分 / $0.2/秒 / 1 | 0（未能下单） | ⏸ 未配置 | 渠道 provider_endpoint 为空；review_status=needs_specification；formula 行 pricing_unit 为空，展示价 455 是历史快照而非按秒单价；两套目录价冲突：目录 455 积分 vs 老表 1 积分 | 展示价改为只读价盘行，不再兜底 50 |
| seedance-pro-t2v | video | muapi | ✅ 已上架 | ❌ 报价被拒 | ❌ 未进入队列 | — | 410 积分 / $0.18/秒 / 1 | 0（未能下单） | ⏸ 未配置 | 渠道 provider_endpoint 为空；review_status=needs_specification；formula 行 pricing_unit 为空，展示价 410 是历史快照而非按秒单价；两套目录价冲突：目录 410 积分 vs 老表 1 积分 | 展示价改为只读价盘行，不再兜底 50 |
| luma-dream-machine | video | luma | ⏸ 隐藏(供应商无凭证) | ❌ 报价被拒 | ❌ 未进入队列 | — | 365 积分 / $0.16/秒 / 1 | 0（未能下单） | ⏸ 未配置 | 渠道 provider_endpoint 为空；review_status=needs_specification；formula 行 pricing_unit 为空，展示价 365 是历史快照而非按秒单价；两套目录价冲突：目录 365 积分 vs 老表 1 积分 | 展示价改为只读价盘行，不再兜底 50 |
| hunyuan-image-to-video | video | muapi | ✅ 已上架 | ❌ 报价被拒 | ❌ 未进入队列 | — | 340 积分 / $0.15/秒 / 1 | 0（未能下单） | ⏸ 未配置 | 渠道 provider_endpoint 为空；review_status=needs_specification；formula 行 pricing_unit 为空，展示价 340 是历史快照而非按秒单价；两套目录价冲突：目录 340 积分 vs 老表 1 积分 | 展示价改为只读价盘行，不再兜底 50 |
| runway-image-to-video | video | runway | ✅ 已上架 | ❌ 报价被拒 | ❌ 未进入队列 | — | 340 积分 / $0.15/秒 / 1 | 0（未能下单） | ⏸ 未配置 | 渠道 provider_endpoint 为空；review_status=needs_specification；formula 行 pricing_unit 为空，展示价 340 是历史快照而非按秒单价；两套目录价冲突：目录 340 积分 vs 老表 1 积分 | 展示价改为只读价盘行，不再兜底 50 |
| ai-video-face-swap | video | muapi | ✅ 已上架 | ❌ 报价被拒 | ❌ 未进入队列 | — | 230 积分 / $0.1/秒 / 1 | 0（未能下单） | ⏸ 未配置 | 渠道 provider_endpoint 为空；review_status=needs_specification；formula 行 pricing_unit 为空，展示价 230 是历史快照而非按秒单价；两套目录价冲突：目录 230 积分 vs 老表 1 积分 | 展示价改为只读价盘行，不再兜底 50 |
| seedance-lite-t2v | video | muapi | ✅ 已上架 | ❌ 报价被拒 | ❌ 未进入队列 | — | 230 积分 / $0.1/秒 / 1 | 0（未能下单） | ⏸ 未配置 | 渠道 provider_endpoint 为空；review_status=needs_specification；formula 行 pricing_unit 为空，展示价 230 是历史快照而非按秒单价；两套目录价冲突：目录 230 积分 vs 老表 1 积分 | 展示价改为只读价盘行，不再兜底 50 |
| topaz-video-upscale | video | muapi | ✅ 已上架 | ❌ 报价被拒 | ❌ 未进入队列 | — | 185 积分 / $0.08/秒 / 1 | 0（未能下单） | ⏸ 未配置 | 渠道 provider_endpoint 为空；review_status=needs_specification；formula 行 pricing_unit 为空，展示价 185 是历史快照而非按秒单价；两套目录价冲突：目录 185 积分 vs 老表 1 积分 | 展示价改为只读价盘行，不再兜底 50 |
| video-watermark-remover | video | muapi | ✅ 已上架 | ❌ 报价被拒 | ❌ 未进入队列 | — | 150 积分 / $0.065/秒 / 1 | 0（未能下单） | ⏸ 未配置 | 渠道 provider_endpoint 为空；review_status=needs_specification；formula 行 pricing_unit 为空，展示价 150 是历史快照而非按秒单价；两套目录价冲突：目录 150 积分 vs 老表 1 积分 | 展示价改为只读价盘行，不再兜底 50 |
| latent-sync | video | muapi | ✅ 已上架 | ❌ 报价被拒 | ❌ 未进入队列 | — | 95 积分 / $0.04/秒 / 1 | 0（未能下单） | ⏸ 未配置 | 渠道 provider_endpoint 为空；review_status=needs_specification；formula 行 pricing_unit 为空，展示价 95 是历史快照而非按秒单价；两套目录价冲突：目录 95 积分 vs 老表 1 积分 | 展示价改为只读价盘行，不再兜底 50 |
| sync-lipsync | video | muapi | ✅ 已上架 | ❌ 报价被拒 | ❌ 未进入队列 | — | 95 积分 / $0.04/秒 / 1 | 0（未能下单） | ⏸ 未配置 | 渠道 provider_endpoint 为空；review_status=needs_specification；formula 行 pricing_unit 为空，展示价 95 是历史快照而非按秒单价；两套目录价冲突：目录 95 积分 vs 老表 1 积分 | 展示价改为只读价盘行，不再兜底 50 |
| kling-v3.0-pro-recast | video | kling | ✅ 已上架 | ❌ 报价被拒 | ❌ 未进入队列 | — | 90 积分 / $0.28/秒 / 1 | 0（未能下单） | ⏸ 未配置 | 渠道 provider_endpoint 为空；review_status=needs_specification；formula 行 pricing_unit 为空，展示价 90 是历史快照而非按秒单价；两套目录价冲突：目录 90 积分 vs 老表 1 积分 | 展示价改为只读价盘行，不再兜底 50 |
| ai-video-upscaler | video | muapi | ✅ 已上架 | ❌ 报价被拒 | ❌ 未进入队列 | — | 70 积分 / $0.03/秒 / 1 | 0（未能下单） | ⏸ 未配置 | 渠道 provider_endpoint 为空；review_status=needs_specification；formula 行 pricing_unit 为空，展示价 70 是历史快照而非按秒单价；两套目录价冲突：目录 70 积分 vs 老表 1 积分 | 展示价改为只读价盘行，不再兜底 50 |
| wan2.2-animate-recast | video | alibaba | ⏸ 隐藏(供应商无凭证) | ❌ 报价被拒 | ❌ 未进入队列 | — | 65 积分 / $0.2/秒 / 1 | 0（未能下单） | ⏸ 未配置 | 渠道 provider_endpoint 为空；review_status=needs_specification；formula 行 pricing_unit 为空，展示价 65 是历史快照而非按秒单价；两套目录价冲突：目录 65 积分 vs 老表 1 积分 | 展示价改为只读价盘行，不再兜底 50 |
| wan2.1-i2v-14b | video | alibaba | ⏸ 隐藏(供应商无凭证) | ❌ 报价被拒 | ❌ 未进入队列 | — | 60 积分 / $0.18/秒 / 1 | 0（未能下单） | ⏸ 未配置 | 渠道 provider_endpoint 为空；review_status=needs_specification；formula 行 pricing_unit 为空，展示价 60 是历史快照而非按秒单价；两套目录价冲突：目录 60 积分 vs 老表 1 积分 | 展示价改为只读价盘行，不再兜底 50 |
| wan2.1-t2v-14b | video | alibaba | ❌ 不在前端任何代码中 | ❌ 报价被拒 | ❌ 未进入队列 | — | 60 积分 / $0.18/秒 / 1 | 0（未能下单） | ⏸ 未配置 | 渠道 provider_endpoint 为空；review_status=needs_specification；formula 行 pricing_unit 为空，展示价 60 是历史快照而非按秒单价；两套目录价冲突：目录 60 积分 vs 老表 1 积分 | 展示价改为只读价盘行，不再兜底 50 |
| mmaudio-v2-video-to-video | video | muapi | ✅ 已上架 | ❌ 报价被拒 | ❌ 未进入队列 | — | 25 积分 / $0.01/秒 / 1 | 0（未能下单） | ⏸ 未配置 | 渠道 provider_endpoint 为空；review_status=needs_specification；formula 行 pricing_unit 为空，展示价 25 是历史快照而非按秒单价；两套目录价冲突：目录 25 积分 vs 老表 1 积分 | 展示价改为只读价盘行，不再兜底 50 |
| minimax-speech-2.6-hd | audio | muapi | ✅ 已上架 | ❌ 报价被拒 | ❌ 未进入队列 | — | 295 积分 / $0.65/次 / 1 | 0（未能下单） | ⏸ 未配置 | 渠道 provider_endpoint 为空；review_status=needs_specification；两套目录价冲突：目录 295 积分 vs 老表 1 积分 | 展示价改为只读价盘行，不再兜底 50 |
| minimax-speech-2.6-turbo | audio | muapi | ✅ 已上架 | ❌ 报价被拒 | ❌ 未进入队列 | — | 295 积分 / $0.65/次 / 1 | 0（未能下单） | ⏸ 未配置 | 渠道 provider_endpoint 为空；review_status=needs_specification；两套目录价冲突：目录 295 积分 vs 老表 1 积分 | 展示价改为只读价盘行，不再兜底 50 |
| minimax-voice-clone | audio | muapi | ✅ 已上架 | ❌ 报价被拒 | ❌ 未进入队列 | — | 295 积分 / $0.65/次 / 1 | 0（未能下单） | ⏸ 未配置 | 渠道 provider_endpoint 为空；review_status=needs_specification；两套目录价冲突：目录 295 积分 vs 老表 1 积分 | 展示价改为只读价盘行，不再兜底 50 |
| suno-add-instrumental | audio | muapi | ✅ 已上架 | ❌ 报价被拒 | ❌ 未进入队列 | — | 45 积分 / $0.09/次 / 1 | 0（未能下单） | ⏸ 未配置 | 渠道 provider_endpoint 为空；review_status=needs_specification；两套目录价冲突：目录 45 积分 vs 老表 1 积分 | 展示价改为只读价盘行，不再兜底 50 |
| suno-add-vocals | audio | muapi | ✅ 已上架 | ❌ 报价被拒 | ❌ 未进入队列 | — | 45 积分 / $0.09/次 / 1 | 0（未能下单） | ⏸ 未配置 | 渠道 provider_endpoint 为空；review_status=needs_specification；两套目录价冲突：目录 45 积分 vs 老表 1 积分 | 展示价改为只读价盘行，不再兜底 50 |
| suno-create-music | audio | muapi | ✅ 已上架 | ❌ 报价被拒 | ❌ 未进入队列 | — | 45 积分 / $0.09/次 / 1 | 0（未能下单） | ⏸ 未配置 | 渠道 provider_endpoint 为空；review_status=needs_specification；两套目录价冲突：目录 45 积分 vs 老表 1 积分 | 展示价改为只读价盘行，不再兜底 50 |
| suno-extend-music | audio | muapi | ✅ 已上架 | ❌ 报价被拒 | ❌ 未进入队列 | — | 45 积分 / $0.09/次 / 1 | 0（未能下单） | ⏸ 未配置 | 渠道 provider_endpoint 为空；review_status=needs_specification；两套目录价冲突：目录 45 积分 vs 老表 1 积分 | 展示价改为只读价盘行，不再兜底 50 |
| suno-generate-mashup | audio | muapi | ✅ 已上架 | ❌ 报价被拒 | ❌ 未进入队列 | — | 45 积分 / $0.09/次 / 1 | 0（未能下单） | ⏸ 未配置 | 渠道 provider_endpoint 为空；review_status=needs_specification；两套目录价冲突：目录 45 积分 vs 老表 1 积分 | 展示价改为只读价盘行，不再兜底 50 |
| suno-remix-music | audio | muapi | ✅ 已上架 | ❌ 报价被拒 | ❌ 未进入队列 | — | 45 积分 / $0.09/次 / 1 | 0（未能下单） | ⏸ 未配置 | 渠道 provider_endpoint 为空；review_status=needs_specification；两套目录价冲突：目录 45 积分 vs 老表 1 积分 | 展示价改为只读价盘行，不再兜底 50 |
| mmaudio-v2-text-to-audio | audio | muapi | ✅ 已上架 | ❌ 报价被拒 | ❌ 未进入队列 | — | 10 积分 / $0.01/次 / 1 | 0（未能下单） | ⏸ 未配置 | 渠道 provider_endpoint 为空；review_status=needs_specification；两套目录价冲突：目录 10 积分 vs 老表 1 积分 | 展示价改为只读价盘行，不再兜底 50 |
| suno-generate-sounds | audio | muapi | ✅ 已上架 | ❌ 报价被拒 | ❌ 未进入队列 | — | 10 积分 / $0.02/次 / 1 | 0（未能下单） | ⏸ 未配置 | 渠道 provider_endpoint 为空；review_status=needs_specification；两套目录价冲突：目录 10 积分 vs 老表 1 积分 | 展示价改为只读价盘行，不再兜底 50 |
### 附录 A 统计（82 行全覆盖，无遗漏）

- 按类型：video 51、image 20、audio 11
- 按绑定供应商：muapi 55、kling 8、alibaba 6、google 5、openai 3、minimax 2、runway 2、luma 1
- 按前端可见性：✅ 已上架 66、⏸ 隐藏(供应商无凭证) 12、❌ 不在前端任何代码中 4
- 按状态：⏸ 未配置 82
- 可按前端完成一次真实完整生成的模型数：**0 / 82**

### 附录 A/B/C 数量对账（同一套数据、三种口径，逐层收敛）

| 口径 | 数量 | 来源 | 附录 |
|---|---|---|---|
| 控制塔模型注册表 | `ai_models` 927 行，其中 `status='active'` **920** | 生产库 `ai_studio.ai_models` | — |
| 控制塔价盘 | `model_pricing` **88** 行 | 生产库 `ai_studio.model_pricing` | — |
| 「后台显示可用」= active ∧ 有价盘行 | **82** | 上两者交集 | **附录 A**（本报告主体检查表） |
| 匿名 `/api/models/active` 实际下发 | **69**（13 个因供应商凭证缺失被隐藏：alibaba 6、muapi 系 wan 3、openai 2、luma 1、runway 1） | 线上接口实测 200/69 | 附录 A `前端` 列 |
| 前端工作台真正可点条目 | **552 条目 / 532 去重 id**（Image 下拉实测 115 行、Video `All` ≈82 行） | `packages/studio/src/models.js` 12 个导出数组 | **附录 B：`docs/audit-data/model-availability-532.psv`**（552 行逐条：工作台 / id / 供应商 / 价盘行 / 绑定 / 审批 / endpoint / verdict / 解析后模型 id） |
| 82 中真正有工作台条目 | **68**（其余 14 个后台可用但前端点不到） | 附录 A × 附录 B 交叉 | 14 个模型名见 7.5 |
| 920 中前端完全点不到 | **399**（video 215、image 101、audio 20、text 47、other 16；其中 19 个已配价盘行） | `ai_models` − 静态目录 | **附录 C：`docs/audit-data/backend-active-not-frontend-reachable.psv`** |
| 552 条目 verdict 分解 | 472 `MODEL_PRICING_UNCONFIGURED` + 74 `NO_COST_VERIFIED_ROUTE[PROVIDER_ENDPOINT_MISSING]` + 6 `MODEL_NOT_FOUND` = 552；**可报价 0** | 服务端真实执行解析阶梯 | 附录 B `verdict` 列 |

一句话对账：**没有任何一个口径能凑出「可下单」的交集** —— 82 个后台可用模型一个都拿不到报价；532 个前端可点模型也一个都拿不到报价；两者重叠的 68 个同样全部被拒。

> 待发布：本次共 **七处** 源码修复已带备份安装到生产目录（后端 3 处 `*.bak-20260924`：`lib/repositories/models.js`、`lib/services/pricingEngine.js`、`lib/security/publicError.js`；前端 4 处 `*.bak-20260924b`：`packages/studio/src/modelFamilies.js`、`packages/studio/src/components/ImageStudio.jsx`、`packages/studio/src/components/VideoStudio.jsx`、`components/StandaloneShell.js`），但**线上 bundle 仍是 09-24 14:36 的构建产物**（`ahF8q-_fpA6cgZkL5QuZF`），需要 `npm run build` + PM2 重启才会生效；因会造成可见停机，未擅自执行，等待授权。因此上述「不再兜底 50 / 跨厂商别名删除 / 用户可读错误文案 / 下拉按上架目录裁剪为 12+24 / `?tab=` 直链路由」目前只在源码与测试层生效，浏览器里看到的仍是旧文案、旧目录与错误落点。
