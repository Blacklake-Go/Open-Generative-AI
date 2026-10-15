# SupDance Canvas 生产 E2E 报告

状态：**NOT READY — 尚无真实 Image/Video/Text 交易证据。**

## 已完成的非生成验证

| 检查 | 结果 | 可证明范围 |
|---|---|---|
| Canvas TLS 与静态页面 | 生产 HTTPS/TLS、静态文件和 SupDance Shell 可由可见浏览器打开 | 当前浏览器上下文已有登录状态，因此没有把它当作隔离测试身份，也没有用它做认证或生成 E2E |
| 主站生产源复核 | `supdance-prod` 最新只读确认 HEAD `3a44763860e8fe86c8afcf64d0d97d6dcd431a52`，工作树 13,340 项（13,192 untracked、148 tracked modified、0 conflict/rename），主站与 worker service active | 生产树有大量既有改动；未清理、重置、覆盖或构建生产树 |
| Koyo Canvas API 未认证访问 | Session/Projects/Models 未认证返回 401；Session 响应含精确 Canvas CORS 与 credentials 头 | Auth guard/CORS 到达，不证明认证成功 |
| Canvas Session CORS/Origin 边界 | 无 Cookie 的 Session OPTIONS：允许的 Canvas Origin 返回 204，并含精确 ACAO、credentials、Vary、预期 methods/headers；允许来源匿名 GET 返回 401。非白名单 OPTIONS/GET 与缺失 Origin GET 返回 403、无 ACAO | 只验证 `/api/canvas/session` 的 CORS/preflight/Origin 响应，不证明已登录流程或带认证写端点的 CSRF 防护 |
| 服务与路由 | SupDance/Worker service active；Next manifest 有 10 个 Canvas API 路由 | 运行服务和路由存在，不证明任务成功 |
| DB migration | 045 已应用；51 applied，无 pending/drift | schema 已就绪，不证明真实数据链路 |
| Nginx 上传配置 | 指定上传路径、110 MB request body、`nginx -t` 成功 | 网关配置可接收，不证明对象上传/资产写入 |
| Provider 健康 | 最新 2026-09-29T11:58:56.629Z `/api/health` 返回 HTTP 503、`degraded`；database/migrations 为 `ok`，worker/storage/email 为 `healthy`，providers 为 `unknown`。09:20:47Z 曾为 email `unknown`、providers `degraded` | Health 聚合需要所有依赖健康；Provider 汇总在只读快照间变化，公开响应不含 Provider 详情。本轮未主动探测 Provider，不能推断具体故障，也不构成生成可用证据 |
| 活动模型目录 | 2026-09-29T11:58:56.906Z `/api/models/active` 返回 HTTP 200、15 个正价模型：image 6、video 6、audio 3；无 text 类型。公开 `creditsPrice` 最低 image 10、video 26（非最终报价）；Canvas 模型路由复用同一个 `listActiveModels()` | 据共享 Service 和当前公开目录推断，Canvas 当前没有 Text 模型可选；认证后的 Canvas 列表与 Image/Video/Text 报价未实测 |
| Canvas SupDance Shell | `npm run typecheck` 与 `VITE_KOYOSIM_SERVER_MODE=true npm run build` 成功；生产入口、JS、CSS、highlight bundle 的 SHA-256 与产物一致；可见浏览器显示 SupDance/Studio/Canvas/Assets/账户入口 | 仅证明界面和资源可用，不证明认证、钱包或生成 |
| 生产公开 Bundle 静态复核 | 匿名 GET 首页 HTTP 200；主 JS `/assets/index-BZN_M4Ze.js` 为 3,747,791 bytes、SHA-256 `8fc82cb3bfe1a86979b6ff5ae63471ae29ac12f710b83b3d0448ac6f6b30a5a4`。常见 OpenAI/Google/AWS/GitHub/JWT 凭证格式均 0 命中，未发现 source map；`config.js` 仅初始化空 `window.__RUNTIME_CONFIG__`。包中仍含 OpenAI/Gemini 直连模板和客户端 `apiKey` 注入代码；生产 hostname gate 将 Image/Video/Text 生成转入 SupDance Jobs，并让旧本地 Provider 分支 fail closed | 仅为匿名公共静态资源检查；未登录隔离账号、未查看用户 Storage 或认证 Network，也未执行 Provider 请求。模板存在不能证明它在生产域名可达或发生过密钥传输 |
| 本轮 Canvas 工作副本 | Koyo Server Mode `npm run typecheck` 和 `VITE_KOYOSIM_SERVER_MODE=true npm run build` 成功；Job 预留后和成功/失败终态后刷新共享 Session 钱包快照；模型目录失败不会覆盖有效 Session 状态；并保留稳定素材上传幂等键、迁移备份/检查点、旧凭证字段过滤、配置/插件存储隔离、生成幂等键、Project 自动保存串行化及失响应对账 | 仅在 `/tmp/supdance-infinite-canvas-audit-20260929/web` 构建，未部署；不证明生产服务端已支持幂等或钱包真人一致性 |
| Server Mode 入口路由 | 候选构建保留 `/` 介绍页，浏览器点击“开始使用”后到达 `/canvas`；从隔离 localhost 浏览器直达 `/image`、`/video` 均重定向到 `/canvas` | 仅候选版本与空白浏览器上下文；本地登录状态请求 Failed to fetch，因此不作为认证证据；未部署 |
| 生产旧工作台直达（只读） | 隔离 IAB 直达 `/image`、`/video` 均仍显示独立生成工作台；根路径展示 Canvas 介绍页。“开始生成”未操作，没有创建请求或积分变更 | 确认当前线上仍有旧入口；未验证真实账户状态、报价或生成能力 |
| Audio/Music 客户端分支 | 本轮把 Canvas Audio Generation 接到统一报价、Job、轮询和已归档 Asset 读取；Server Mode 下旧直连函数 fail closed；最新 TypeScript 与生产模式构建通过 | 仅候选代码；未部署且未做 Audio/Music 真实生成 |
| 服务端补丁副本 | 11 文件候选（10 个现存 JS/MJS 文件与 1 个新迁移）已按当前生产目标重基；保留现有 `creation_id` Asset 冲突行为，新增上传幂等，且 creation 诊断模式跟随已校验 quote。当前全量 `git apply --check` 通过；补丁临时应用到生产源码文件副本后，10 个 JS/MJS 均通过 `node --check`。补丁不改生产 package-lock | 单独的 `model-pricing-control.test.mjs` 在临时本地 PostgreSQL 上通过（1/1）：覆盖 stability quote 策略写入 creation 诊断字段和输入摘要，以及测试 Provider 注入下的报价、幂等、账本预留/释放、终态、Asset 与历史记录。测试没有请求真实 Provider 或生产 DB。临时迁移器为满足旧迁移 044 的前置外键，先插入仅测试用且 disabled 的 `minimax-music-3.0` 目录行；未改迁移 SQL。无此夹具时，空库标准迁移仍会在 044 失败。该结果不验证 Canvas Project/Job 事务。Node 为 22.22.2，线上已装 Next 15.5.15，package/lock 为 15.5.26 |
| Studio 导航候选 | 按生产 `StandaloneShell.js` 增加桌面 Studio / Infinite Canvas 工作台侧栏，并保留移动抽屉 Canvas 入口；新鲜快照 `git apply --check` 通过，应用结果与已做 Babel JSX parse 的候选文件逐字一致；桌面侧栏在源码第 1461 行 | 候选补丁见 [KOYOSIM_STUDIO_NAV_PATCH.patch](./KOYOSIM_STUDIO_NAV_PATCH.patch)；没有主站整站构建或桌面浏览器渲染，尚未部署或在生产浏览器点击验证 |
| 候选 Storage/Network/Bundle 检查 | 最新 2026-09-30 构建主 JS `index-CfkkE13o.js` 为 3,767,905 bytes、SHA-256 `dd8d6f5e8e520a03cf1e5b5338f3cfe44979115af663c8989cb92e9cd1b27d78`；包含 OpenAI/Gemini endpoint 与 `apiKey` 通用代码模板（非密钥值），常见 OpenAI/Google key 字面量形态 0 命中，无 source map | 先前空白 Chromium localhost 检查发现 0 Provider 凭证头/查询；最新构建后未重跑浏览器 Network。Server Mode 守卫和旧设置清理只在候选代码，生产域名与既有用户 Storage/Network 仍 UNVERIFIED |
| Studio 移动导航候选 | 390×844 的隔离 Chromium 曾确认移动抽屉链接可见；当前候选已把 Studio 桌面和移动入口改为直达 `https://canvas.supdance.com/canvas` | 旧浏览器截图验证的是根路径；新的 `/canvas` 目标只通过最新生产快照 `git apply --check`，尚未构建或渲染 |

`bun test` 未运行：此主机没有 Bun。Vite 有既存动态/静态导入提示与单一约 3.76 MB bundle 提示；构建成功。不能将这等同于生成测试。

## 尚未执行

- 主站账号登录 → Canvas 同一用户自动登录 → 刷新保持 → 任一端退出另一端立即失效。
- Studio User ID、Canvas Project/Job/Asset owner ID 相等性与跨账号隔离。
- Studio/Canvas 当前余额与 subscription entitlement 相等。
- Session 模型目录与新报价来自主站共享服务。报价时写入当前后台路由策略快照，Worker 使用该快照；后台切换对新报价立即生效，仍有效的旧报价保持创建时策略。生产 creation 诊断字段仍可能误记 `cost`；候选服务端补丁已修正为采用 quote snapshot 中的实际策略，但尚未部署。
- 当前公开活动目录没有 Text capability；在共同模型服务能返回可报价的 Text 模型前，Text 生产 E2E 无可选模型。
- Studio 桌面/移动导航进入生产 Canvas、Studio/Canvas 双向导航与账号状态显示。
- 一笔真实 Image、一笔 Video、一笔 Text 生产生成；每笔需含报价、预留/提交/释放账本、creation/job trace、provider terminal status、结果文本或对象存储、Asset、history。
- 重放幂等键不重复扣费；余额不足不会调用 Provider；Provider 失败正确 void/refund。
- 浏览器 A 创建、关闭后浏览器 B 恢复 Project、任务状态和资产。
- 旧本地项目备份/恢复/重试；线上域名/既有用户浏览器 Storage 与 Cookies 检查；认证态 Network 中是否存在 Provider key/header/query 检查。匿名公共 Bundle 已做静态检查，见上表，但不代替线上用户浏览器检查。
- 生产版 Canvas 目前仍使用旧的自动迁移代码；本轮添加的备份对话框和客户端请求幂等逻辑未发布。服务端 `POST /api/canvas/projects` 忽略 `migrationId`，上传接口也未提供请求幂等或内容去重。
- 本轮为候选 Canvas Server Mode 加入入口修复：根路径保留介绍页、“开始使用”进入 `/canvas`，直达 `/image`、`/video` 则重定向到 `/canvas`。此改动仅在 Canvas 工作副本，线上行为仍以已部署版本为准。
- 服务端幂等补丁和迁移 048 已在隔离副本准备，见 [KOYOSIM_CANVAS_SERVER_PATCH.patch](./KOYOSIM_CANVAS_SERVER_PATCH.patch)；线上代码与数据库未改动。补丁包含稳定项目 ID、素材请求键与内容摘要去重、Job 创建/扣款/项目关联同事务提交，以及 Canvas mutation guard 识别和登出限流。2026-09-30 重新核实线上迁移器以完整文件名作为版本号，数据库已应用 `046_priority_routing_mode` 与 `047_user_assets_unique_creation_id`；候选最初使用 046 会造成校验漂移，已将新迁移改为 048。
- 先前隔离副本的 `npm run lint:routes` 曾报告 5 项 `raw-unprefixed-href` 与 2 项 locale 分支增量，Canvas guard 与 rate-limit 检查通过；该扫描对应较早生产快照，不作为当前 HEAD/dirty tree 的 lint 结论。线上 Next 安装版本与 package/lock 仍是 15.5.15/15.5.26。早先服务器隔离构建曾因 OOM 与 swap 压力停止；本轮未重跑生产构建。最新 readiness 仍为 503、Provider 汇总为 `unknown`；09:20 快照曾为 `degraded`；尚未执行真实生成。
- 空库标准迁移在 044 因缺少 `minimax-music-3.0` 外键目标失败；之后仅在临时本地测试库用 disabled 目录夹具运行回归测试并通过。历史迁移未改写，夹具与 DB 均已清理。Canvas Project/Job 事务冲突回滚仍未验证。

## 预算与测试身份

用户授权的 Image + Video + Text 最终生产 E2E 总预算上限为 **100 积分**。用户尚未提供隔离测试账号标识（已表示会登录后回复）。收到标识后，仅在该测试身份中核对实际余额与三笔报价；累计预计消费超过 100、余额不足、Provider 状态未知或身份无法隔离时立即停止生成。不得充值、改 DB、伪造账户验证或通过管理接口绕过预算。

## 执行记录模板

| 媒体类型 | 用户/项目脱敏标识 | 模型与报价 | job/terminal | 账本 | 结果 Asset/历史 | 积分 | 结论 |
|---|---|---|---|---|---|---:|---|
| Image | 待执行 | 待确认 | — | — | — | — | NOT RUN |
| Video | 待执行 | 待确认 | — | — | — | — | NOT RUN |
| Text | 待执行 | 待确认 | — | — | — | — | NOT RUN |

本报告保留所有 `NOT RUN` 与 `UNVERIFIED` 状态，直到浏览器、服务端任务/Provider、资产和账本证据能够互相对应。

## 2026-09-30 增量核验

- 通过已配置 SSH alias 只读复查，Studio 线上 HEAD 为 e06b2a7b6443b8c2359e5ddc6ad4dd7809f5c361，工作树有 146 项 tracked dirty、712 项 untracked；未清理或覆盖。根分区可用空间在本轮观测到约 540 MB 至 1.5 GB 间波动；非 root 压缩估算因权限日志不可作为备份，新的 root Web 归档正在流式写入本机，尚未校验；本轮未写生产源码或数据库。
- 当前 Canvas 根路径与 `/canvas` 的 HTTPS 请求均为 200；这只证明反向代理/Spa fallback 响应可达，线上仍引用旧 bundle，Studio 导航候选 `/canvas` 入口尚未发布或浏览器渲染验证。
- 当前公开 health 请求仍为 HTTP 503，唯一异常是 providers=unknown，checkedAt 为 2026-09-29T20:28:05.015Z。线上健康代码将超过 15 分钟的 provider 健康记录视为 stale/unknown。只读 SQL 聚合得到 9 个公开范围模型、2 个具备 endpoint 的 enabled/approved provider、12 个相关映射，12 条均缺少 15 分钟内的健康记录，0 条新鲜 healthy；范围涉及 muapi 与 runninghub。没有读取或输出任何 Provider 凭证，也未向 Provider 发出请求。候选后台刷新探针已限制为具备 endpoint 的公开路由 provider，尚未部署。
- 当前 /api/models/active 返回 9 个模型：4 个 Image、5 个 Video、0 个 Text。RunningHub 的官方 LLM 目录公开 OpenAI-compatible /v1 接口，要求 enterprise shared API key，并以 USD/百万 tokens 标价；它没有为当前未批准的 rhart-text-g-25-flash 映射提供可核实的规格或积分换算。因此 Text 路由与 Text 生产 E2E 继续 NOT_READY。[RunningHub LLM model catalog](https://www.runninghub.ai/call-api/llm/models)
- 候选服务端补丁已把上传幂等迁移改成 048，以避开生产已存在的 046_priority_routing_mode 和 047_user_assets_unique_creation_id；改名并收窄 provider 探针目标后，20 文件补丁在生产工作树再次通过 git apply --check。
- 用从生产只读复制的迁移 SQL 在本机隔离 PostgreSQL 运行空库与升级迁移演练，结果为 ok=true、55 migrations；admin note 样例、用户 ID allocation 与 39 个用户外键均通过。Canvas 候选 TypeScript 检查与 Server Mode 构建通过；构建包含已有 chunk-size 与动态/静态导入提示，不代表生产发布或真实生成。
- 候选 Server Mode bundle 仍含通用的 OpenAI/Gemini endpoint 与 API key 代码模板；请求分支由 SupDance Server Mode 守卫阻断，先前隔离浏览器请求扫描未见 Provider 凭证头/查询参数。本轮没有复测该浏览器 Network，也不能声称模板已从 bundle 删除；生产域名与既有浏览器 Storage/Network 仍 UNVERIFIED。
