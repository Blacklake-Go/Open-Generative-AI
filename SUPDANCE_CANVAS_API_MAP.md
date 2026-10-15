# Canvas → SupDance API 映射

生产 API base：`https://www.supdance.com`。Canvas 使用 `credentials: include`、`cache: no-store`、`X-SupDance-Canvas: infinite-canvas-v1`。生产 CORS 只允许 `https://canvas.supdance.com`，并启用 credentials；没有登录的跨源 GET 已观察到 401。2026-09-30 对 session、models、quotes、jobs、projects、assets 六个路径执行只读 OPTIONS 预检，均返回 204、精确回显 Canvas Origin，并允许 `Content-Type, Idempotency-Key, X-SupDance-Canvas`。

| 方法 / 路径 | 登录 | 用途 | 主站实现与约束 |
|---|---:|---|---|
| `GET /api/canvas/session` | 是 | 读取当前 SupDance 用户、余额、订阅权益 | `getUserFromRequest` + entitlement service；同一 SupDance `user.id` |
| `POST /api/canvas/session` | 是 | 退出当前主站 Session | 复用 SupDance `deleteSession` 与清 Cookie |
| `GET /api/canvas/models` | 是 | Canvas 模型目录 | `listActiveModels()`，只投影 id/slug/name/capability/availability/pricing/schema/support flags，不返回 Provider 凭证 |
| `POST /api/canvas/quotes` | 是 | 服务端报价 | `createGenerationQuote`、用户/模型/参数/Idempotency-Key 校验、Canvas 写入 guard 与 rate limit |
| `POST /api/canvas/jobs` | 是 | 创建统一 AI generation job | 校验 project ownership、模型、提示词、资产 ownership、报价和参数；调用共享 `createGenerationTask`，使用 `studioId=canvas` |
| `GET /api/canvas/jobs/:id` | 是 | 查询用户自己的任务/结果 | Canvas project-job owner check + `getGenerationTrace`；成功后通过生产已存在的 `getUserAssetByCreationId` service/repository helper 返回 text 或 owner-scoped asset content URL。源码链路已确认，认证后的任务结果请求仍未 E2E |
| `GET, POST /api/canvas/projects` | 是 | 列表/创建云端项目 | `canvas_projects` 与 versions；owner 为 `auth_usr.users.id`；快照大小/内联媒体校验 |
| `GET, PUT, DELETE /api/canvas/projects/:id` | 是 | 获取、版本冲突检测保存、软删除 | `canvasProjects` repository；保存使用 expectedVersion，保留最近 20 版 |
| `GET /api/canvas/assets` | 是 | 列出共享素材 | 主站 assets service，owner scoped |
| `POST /api/canvas/assets/upload` | 是 | 上传 Canvas 图片/视频/音频 | 生产现状使用共享 storage ingest 与 `recordUserAsset`，图片 ≤20 MiB，视频/音频 ≤100 MiB，私有可见性；候选补丁要求 `Idempotency-Key`、校验内容 SHA-256、确定性私有对象 key 与迁移 048 唯一索引，未部署 |
| `GET /api/canvas/assets/:id/content` | 是 | 读取素材 | owner-scoped asset lookup、签名资源读取、range/nosniff/no-store；不允许跨用户下载 |

## 客户端 modality 覆盖

- 主站生产 `/api/canvas/models` 与 `/api/canvas/jobs` 接受 `image`、`video`、`text`、`audio`、`music` capability，并由主站 Router/Worker 处理。
- 生产 Canvas Image/Video/Text 已使用 SupDance adapter；生产 Canvas Audio 仍调用旧浏览器 Provider API，Server Mode 清空 Base URL/API Key 后会失败，不能视为已统一。
- Canvas 工作副本本轮新增 Audio→共享 quote/job/poll/Asset API 的分支，并以已归档结果 Asset 作为节点内容，避免重复上传。Typecheck/build 通过后仍只是未部署候选；Audio/Music 无生产 E2E 证据。
- 路由策略在 `POST /api/canvas/quotes` 时随 route snapshot 锁定；Worker 从同一 quote snapshot 决策，后台切换影响新报价。生产 job 的固定 `routingMode: cost` 仍会造成 creation 诊断字段失真；候选服务端补丁已改为按已校验 quote snapshot 记录真实模式，尚未部署。

## 安全处理

写请求需要 Canvas header、JSON/multipart content type、Origin、请求体上限与速率限制。Job 参数拒绝 Provider/endpoint/key/token/script 字段、inline data/blob 和外部参考媒体 URL；参考媒体必须先成为 SupDance Asset。项目快照拒绝大型 inline base64 并限制结构复杂度。

## 生产现状与候选补丁

- `POST /api/canvas/jobs` 当前先完成共享 creation/quote/credit reserve 事务，后写 `canvas_project_jobs`；关联失败可能导致已创建/预留的 job 留存。候选补丁将关联写入 generation transaction 并在冲突时回滚，但未部署/未用隔离数据库验证。
- 生产项目 POST 忽略 `migrationId` 并为每次请求分配随机 UUID；生产上传没有请求幂等。候选补丁新增稳定项目 ID、内容冲突 409、上传幂等校验与迁移 048 部分唯一索引。线上 migration 046、047 已分别占用，不得复用其版本号。
- 当前 `KOYOSIM_CANVAS_SERVER_PATCH.patch` 的 `git apply --stat` 为 11 个文件（10 个现存 JS/MJS 文件与 1 个新迁移），不含 package-lock。已按生产现有 `createUserAsset` 的 creation-id 冲突逻辑重做 Asset repository hunk，并在 SSH 只读生产工作树上重新运行完整 `git apply --check`，通过；10 个 JS/MJS 文件以 ESM 模式语法检查通过且仅有单一 helper 导出。尚未做该补丁的整站构建、隔离 DB 事务验证或运行迁移。线上 node_modules 为 Next 15.5.15，package/lock 为 15.5.26。
- 尚无隔离账户的成功 HTTP trace/DB/ledger 证据；不声称认证交易、图片/视频/文本生成或计费 E2E 已通过。
