# KOYO Studio 首批用户开放前评估与开发计划

评估更新：2026-09-26 04:12（Asia/Taipei）。覆盖当前工作区、隔离构建/测试验证、线上只读观察、全候选 UI 源码审计与物理网卡 SSH 复核；不是线上源码审计、真实付费/模型履约或全站安全审计的通过证明。

## 结论

**当前不建议向普通用户开放注册与付费。** 2026-09-26 02:59 台北时间只读 GET 显示线上 `/api/ready`、`/api/health` 均为 HTTP 200，公开响应仅证明数据库与迁移检查通过；套餐目录 5 项、算力包目录 7 项，支付宝仍为启用状态。匿名访问 `/zh/pricing` 会被引导至需登录的工作台会员页，浏览器中没有价格比较表；不过公开目录 API 会返回套餐价格数据。以上与本地候选代码存在可见差异：本地新购总开关默认关闭、readiness 已检查更多依赖，但这些修复未部署。生产 SSH 公钥访问尚未获准，故运行 commit、`BUILD_ID`、迁移账本、服务/worker、实际存储/邮件/provider 状态及远端备份恢复均未独立核实。

**本地候选新增 P0 安全失败：** `test:all:isolated` 在 `tests/p0/security-baseline.test.mjs` 20 passed / 1 failed 后停止。`legacyProxyPolicy` 允许 `POST /workflow/update-name/:id` 与 `DELETE /workflow/delete-workflow-def/:id`；路由要求登录后将请求转发到上游，并由 `resolveProviderApiKey` 使用服务端 MuAPI key。当前没有看到按 `user.id` 检查 workflow 所有权的本地代码；上游是否另有资源级隔离尚无证据。普通用户可能借共享服务凭据重命名/删除其不拥有的上游工作流，应先拒绝这些路径，直到 ownership 映射与鉴权被证明。该证据只针对本地候选，生产是否同样受影响仍须服务器源码核验。

当前最大即时风险是**线上仍呈现可购买渠道，但支付闭环和用户履约没有真实生产证据**。全候选 UI 源码审计覆盖 8 个表面，暂评分 6–11/20；已确认的主要 UI P1 是访客价格不可见、认证对话框与表单 accessible name/键盘状态不足。其余实验客户端是否进入首发范围仍需明确，若它们不在用户可达路径，不应扩大成主站放行阻塞。最小可考虑范围仍是邀请制、免费额度、少量验证模型，且须先用受控发布流程部署/验证注册暂停与新购关闭门禁，再完成至少一个生产配置下的真实生成、存储、历史/下载及积分账本闭环，并证明可恢复备份和用户支持值守。公开付费需额外完成支付、退款、订阅、补单与对账验收。总体放行状态：**NOT_READY**。

## 本轮执行进度（截至 2026-09-26 01:05，未部署）

线上最近一次只读复核：`/api/health` 与 `/api/ready` 均返回 200，DB 与 migration 为 true；套餐 5 项、算力包 7 项、支付宝启用。`/zh/pricing` 匿名访问转到登录后的会员工作台，没有访客可见价格表。本地支付总开关、全局暂停注册策略和依赖 readiness 均尚未部署。没有提交注册、验证码、生成、支付、退款或数据库写入请求；没有 SSH 登录或生产变更。

生产 `/api/ready` 与 `/api/health` 于 20:53（UTC 12:53:12 与 12:53:12）只读复查均为 HTTP 200，响应显示 `database.ok=true`、`migrations.ok=true`，但仍未返回 worker/storage/email/providers 字段。这只证明这两个端点当时的 DB/迁移检查通过，不代表生成、邮件、对象存储或供应商可用。21:00 的 BatchMode 公钥 SSH 检查被拒；生产版本、迁移明细和服务日志仍不可读取，没有部署任何本地变更。

当前本地仍在 `main` 分支，`git status --short` 有 528 个状态项（包含既有大量产品改动、未跟踪文件和改动子模块）；本轮未整理成干净发布检出、未提交，也未部署。当前目录可成功构建，但不具备与受控 commit/生产版本一一对应的发布来源证明。

已在当前工作区完成并验证：

- 运维脚本删除硬编码数据库连接，生产 UID 检查要求显式连接串和目标库确认；密钥扫描能发现 PostgreSQL URL 凭据。`release:check`、`security:secrets` 通过。
- 路由检查根据语言注册表动态识别 locale，缓存写入改为原子发布；路由文档已重生成并纳入 CI。工作树扫描为 93 个页面路由、172 个 API 处理器；`lint:routes` 和 `tests/p0/route-manifest.test.mjs` 14/14 通过。
- 社区后台缺失的列表与更新仓储方法已补齐，新增隔离 PostgreSQL 集成测试；本轮建立本机专用隔离库后，`npm run test:db` 真实 PostgreSQL 集成为 **10/10 通过**。修复社区服务层漏出的投币状态导出。
- 管理后台恢复供应商通道健康页，菜单权限与页面守卫一致，旧模型页面显式登记重定向；管理 API 的审计读取从路由移入应用服务/仓储，错误消息使用限界映射。
- 用户资产创建、批量操作、资产编辑/删除、文件夹创建/编辑/删除增加按用户持久化限流；本轮又为评论、点赞、复刻、举报、关注以及改密写操作增加用户级持久限流。路由门禁直接扫描 handler 的未限流 API 计数从 47 降到 37。该扫描无法识别 service 层限流，也不区分低风险幂等操作与昂贵写操作，剩余项需按真实控制链逐个审计。
- PostgreSQL 实测发现干净库的 `032_byteplus_modelark_gateway.sql` 假定 5 个 canonical 模型已存在，以及 `036_admin_notes_target_shape.sql` 假定旧版手工备注列存在。为避免改动可能已部署迁移的校验和，新增排序在其前面的幂等兼容迁移 `031_zz_byteplus_model_catalog_prerequisite.sql`、`035_zz_admin_notes_legacy_shape_compat.sql`，只补缺失模型（禁用状态）和旧版 nullable 列，不覆盖现有数据。修复隔离 DB 测试运行器的并行迁移竞态，并更新生成闭环夹具以走真实 canonical 模型、价格与渠道结构。
- `npm run migration:drill` 通过：干净库和从 008 升级路径共验证 **48 个迁移文件**；旧版 `admin_notes` 备注回填通过；037 转换保留 2 个根用户、2 个分配记录和 36 个用户外键。`npm run backup:restore:drill` 在本机隔离库完成真实 `pg_dump` → `pg_restore`，dump 为 248,050 字节，标记数据恢复成功。
- 格式检查、ESLint、发布安全扫描、密钥扫描、i18n、路由检查通过；本轮 `npm run lint`、`format:check`、`test:i18n`、`lint:routes`、`release:check`（898 个源文件）、`security:secrets` 通过。`test:all:isolated` **43 个测试文件**全部通过；本轮真实 PostgreSQL 集成为 **13/13 通过**。`next build` 成功。之前一次 build 出现 `next-intl` 动态导入依赖缓存分析 warning，最新完整构建未重现；该第三方依赖 warning 的触发条件未单独归因。构建仍不是与受控 Git commit 对应的干净发布产物。
- 定价/同步服务中仍有 3 个模块直接负责多步数据库事务：`lib/services/channelSync.js`、`lib/services/modelPriceImport.js`、`lib/services/modelPricingControl.js`。安全基线测试将这三项设为明确、精确的暂时白名单；后续应逐个抽到 repository 层，不要扩大白名单。
- 浏览器全量回归第一次为 114/115，唯一失败是一次移动端缩放时展示卡计数为 0；独立重复同一页面流程看到移动端与平板端均为 4 张卡，第二次全量复跑为 **115/115**。暂记为一次未复现的间歇失败；若回归再次出现，先采集 URL、展示状态与节点数，不要静默重试掩盖。
- 备份任务现已实现真实的 S3 上传路径：AWS CLI v2 上传、默认请求 KMS 服务端加密、`head-object` 校验远端字节数；上传/验证失败会保留本地 dump 并返回失败，AWS 子进程只获准访问 AWS 配置变量，不继承 `DATABASE_URL`。本地备份目录/文件权限分别限制为 `0700`/`0600`，并在 `pg_dump` 失败时清理残留文件。新增 4 个离线测试；当前 `test:all:isolated` 为 40 个测试文件通过。
- 远端备份仍未实测：当前环境没有 `aws` CLI、`S3_BACKUP_BUCKET`、AWS Profile/访问配置，因此没有实际 S3 上传、权限或加密检查；本轮只证明了本机隔离 PostgreSQL 的 dump/restore。配置项和运行边界写在 [BACKUP_OPERATIONS.md](BACKUP_OPERATIONS.md)，不能把本机演练当作离机备份证明。
- readiness 现纳入 Worker、存储、邮件及所有公开可售模型的供应商路由：迁移 `041_worker_heartbeat.sql` 记录 Worker 心跳，每 10 秒续报；队列查询统计活跃 Worker、排队数、最老任务、超时处理中与近 15 分钟失败数。对象存储探测验证私有对象上传、读取校验、删除；邮件探测现在同时要求 `AUTH_VERIFICATION_CODE_SECRET`（至少 32 个字符）、SMTP 开关/凭据及 SMTP 握手，不发送测试邮件。供应商 readiness 从 canonical 公共模型/价格/路由表检查每个模型至少有一条配置完整、凭据存在、adapter 可用、熔断未开且 15 分钟内健康的路由；不会在公开健康请求中调用 AI 生成接口。依赖结果默认缓存 30 秒，单依赖探测有 2.5 秒上限；未配置为 degraded，探测超时/过期为 unknown，故障为 unhealthy。`/api/live` 只表示进程存活，公开 readiness/health 只返回状态，详细错误码和计数仅在后台显示；依赖未健康时 readiness/health 返回 HTTP 503。单元与 PostgreSQL 集成覆盖模型 failover、过期健康、凭据缺失、真实 SQL 和 readiness 门禁。真实 COS、SMTP 收件箱及 AI 供应商调用尚未实测；SMTP 握手不代表邮件进入收件箱。该实现与迁移均未部署生产，且线上旧响应没有新依赖字段。
- 修复供应商数量超限时后台误显示 `0/0` 模型覆盖率的问题：现在保留公开模型总数，并将未执行覆盖评估标为 `unknown`；新增边界测试，供应商 readiness 聚焦测试 4/4 通过。
- 核对邮箱注册 API 后发现旧 Playwright 用例不带验证码却期待注册成功，与当前注册契约冲突；已改成覆盖缺少验证码和未签发验证码两种拒绝路径。用一次性 PostgreSQL 测试库（48 个迁移文件全部应用）启动独立 Next 服务，真实 HTTP E2E **2/2 通过**，两种请求都没有建立 `ko_session`；测试库已删除。此结果只证明注册验证码的拒绝门禁有效，成功注册、真实邮件送达与登录仍未验证。
- 注册验证码邮件接口现在会传递当前界面 locale；新增前后端契约测试 1/1 通过。对包含该改动的工作区重新执行 `npm run build`，此前一次因系统空间临时耗尽而失败，重试时空间恢复，最终构建成功；本轮 `npm run lint`、`npm run format:check` 也通过。
- 本轮确认注册验证码/密码重置使用 `AUTH_VERIFICATION_CODE_SECRET`，但旧 email readiness 只测 SMTP。已将该密钥存在性（不读取或输出内容）纳入 email readiness；缺密钥时返回 `degraded` 和稳定错误码，不探测 SMTP。聚焦测试 **3/3** 通过，完整隔离套件 43/43 通过，最新 `next build` 成功。
- 转账服务原先在错误支付密码尝试上没有账户级锁定，5 秒防刷检查又发生在密码验证之后。本轮新增持久化账户失败窗口：15 分钟内 5 次错误后后续验证提前以 HTTP 429 拒绝，未锁定时支付密码正确会清除失败窗口。隔离 PostgreSQL 集成分别验证第 6 次错误被锁定，以及 3 次错误后输对密码（后续收款人状态检查失败）会清除计数。锁定期间正确密码仍被挡在验证之前，锁定持续至窗口到期；随后为社区评论（30 次/小时）、点赞（120 次/小时）、复刻（60 次/小时）、关注（120 次/小时）与举报（10 次/天）加上按用户限流。
- 进一步审计发现支付密码 API 曾允许仅凭登录态覆盖已设置密码。本轮改为首次设置可直接设定，后续修改必须提供正确的当前支付密码；错误验证与转账共用每 15 分钟 5 次失败锁定，锁定后改密不能绕过。普通账户改登录密码另加每 15 分钟 10 次请求上限。PostgreSQL 集成验证首次设置、遗漏当前密码、错误当前密码、正确修改、输错锁定及锁定后不能绕过；`npm run test:db` **13/13 通过**。
- 邮箱认证 handler 集成覆盖验证码注册、登录、邮箱密码重置与登出：错误验证码拒绝且不创建 session；正确验证码可注册登录；重置密码会撤销旧 session，拒绝旧密码并接受新密码；登出使 session 失效。使用内存 sender 捕获验证码，未发送真实邮件。认证用例不是浏览器/真实 HTTP 服务 E2E，也不证明 SMTP 投递。
- 新增隔离用户与管理员边界集成：用户 B 不能读取/修改/删除 A 的资产或作品，不能批量删除 A 资产或操作 A 文件夹；积分流水按用户隔离，跨用户下载返回 404。管理员社区 API 对未登录返回 401、普通用户与只读审计员返回 403，获授权的运营管理员返回 200。新增 COS 私有下载 route 测试：使用非真实测试凭据让 COS SDK 本地生成签名 URL，所有者拿到 HTTPS `GET` 签名和 `attachment` disposition，其他用户返回 404；不访问 COS，也不证明真实对象存在、签名 URL 可下载或 bucket policy 正确。筛选运行 `TEST_DB_FILES=user-isolation.test.mjs` **2/2 通过**。
- 扩展定价/生成 PostgreSQL 集成：图片链路调用真实报价与生成 API route handler，验证 quote 响应 201、50 积分报价，生成请求返回 202 queued，重复相同幂等键返回原任务；随后用注入的 provider/archive 依赖完成终态。图片与视频两个受控 provider mapping 验证 provider 成功、fake archive 保存、actual-cost 已知/未知对账状态、reservation 结算，并确认作品进入 API 历史和用户资产库；另造 storage ingest 失败，验证任务终态为 failed、没有结果对象、reservation 为 `VOIDED`、账本存在 -50 预扣与 +50 释放、用户可用额度恢复。另验证真实 callback route 对错误密钥返回 401、缺少幂等键返回 422；合法失败回调释放冻结额度、未报告的 actual cost 保持 `NULL`（不误记为 `$0`），重复回调幂等返回。该证据证明 route/service/repository/事务闭环在隔离 PG 与注入依赖下工作，**不证明线上真实 provider、COS 上传或签名下载已通过**。
- 增加实际 Worker 子进程生命周期集成：创建专用临时 PostgreSQL 库并应用完整迁移，从该库观测进程 PID 对应的 heartbeat；发送 SIGTERM 后确认进程以 0 退出并清理 heartbeat。该项只验证本地 Worker 启动、心跳和优雅退出，不验证有任务时的真实调度、外部 provider 或线上服务管理器。完整套件有一次短暂出现认证、定价用例 PostgreSQL 连接超时（16/18）；聚焦复跑两项 2/2 通过，最新完整重跑 **18/18 通过**，超时未复现。
- 新增过期任务 watchdog 数据库集成：准备 processing 20 分钟的真实任务行与冻结 reservation，运行 60 秒阈值 watchdog 后任务失败并标记 `PROVIDER_TIMEOUT`，只写入一次 `TASK_TIMEOUT`，产生 `-10` 预扣和 `+10` 原桶返还、wallet 冻结清零；重复扫描无待处理任务且账本不新增。该用例包含在最新完整 `test:db` **18/18 通过**中。它验证 timeout service 的隔离 PG 行为，不验证生产 worker 调度是否启动或监控告警是否送达。
- 资产下载授权用 route handler 验证：所有者对测试媒体 URL 收到 redirect，其他用户对同一资产得到 404。所有者路径使用数据库夹具里的外链媒体 URL；COS 私有对象的签名 URL 与实际下载仍需接入受控存储环境验证。
- 本轮 `npm run test:all:isolated` **45 个测试文件全部通过**；`test:db` 最新完整结果 **18/18**；`format:check`、`lint`、`lint:routes`（93 页面、172 handler）、`release:check`（898 个源文件）、`security:secrets`、`test:i18n` 均通过。`npm run build` 此前成功（Next.js 完成 110 个静态页面和 route 构建），但 Webpack cache 写入报 `ENOSPC`；构建退出码为 0，缓存 warning 根因仍需复核。发布候选干净检出仍须完整复跑。
- 安全基线聚焦测试 **19/19 通过**，覆盖上述敏感路由与支付密码当前值校验；完整隔离套件 **43 个测试文件通过**，`test:db` **13/13**、`format:check`、`lint:routes`、`lint`、`release:check`（898 个源文件）、`security:secrets`、`test:i18n` 和最新 `next build` 全部通过。直接扫描的未限流 API 计数 37（起始 47）。限流额度是初始阈值，需结合正常流量监控误拦截；静态计数不是漏洞数量，余项需逐条审计。

**当前放行结论仍为 NOT_READY。** `/api/ready` 的 DB/迁移异常本次不再复现，但下一道硬门槛是取得生产运行源码版本与 migration ledger 的只读证据，确认新增迁移按受控流程兼容且没有 checksum drift，并查明线上为何仍只暴露基础 readiness 字段。随后仍须验证生产配置下 S3 离机备份与隔离恢复、真实存储/邮件、至少一个模型的真实用户生成到账本闭环、失败/重复提交与权限隔离；公开付费还需支付沙盒、退款和对账。不得把源码、mock 或本地探测结果描述为线上实测。

## 当前风险与证据（截至 2026-09-25 20:37）

| 范围 | 当前证据 | 当前判断 / 放行要求 |
| --- | --- | --- |
| 线上 readiness | 20:34 台北时间只读 GET `/api/ready`、`/api/health` 均为 200，DB 与迁移均为 true；响应仍只有 database/migrations，没有 worker/storage/email/providers。 | readiness 端点本次健康，但**不能作为邀请制放行证据**。需查生产运行版本、迁移 ledger 和日志，并确认依赖健康覆盖范围。 |
| 发布来源与变更控制 | `main` 上 528 个工作区状态项，含产品代码、静态数据、lockfile、子模块和未跟踪文件；本地构建成功但改动尚未绑定单一受控 commit。 | **P0**。按功能/来源/敏感性盘点并制作可审阅发布分支；保留工作区及子模块状态，不做清理式收敛。 |
| 本地门禁 | 最新完整 `test:db` **18/18**，前一次 16/18 的连接超时未复现；45 个 isolated 测试文件、`format:check`、`lint`、`lint:routes`、`release:check`、`security:secrets`、`test:i18n` 均通过。数据库运行器串行执行并支持 `TEST_DB_FILES` 筛选。`next build` 此前成功但有 `ENOSPC` 缓存 warning。 | 磁盘空间 warning 仍需复核；发布候选仍需从受控检出完整重跑门禁。以上均**不证明生产迁移兼容、环境变量正确或线上构建等价**。 |
| 浏览器回归 | 最近两次全量 UI 回归为 114/115 与 115/115；首次移动端展示卡失败未复现。此前报告还有 19 个失败，已由后续复跑归因中间态/初始状态差异，不能声称完整产品端到端通过。 | **P1，仍需版本固定的浏览器验收**，重点移动端、模型表单、错误反馈、资产历史/下载、用户隔离和真实登录状态。 |
| 凭据/安全卫生 | 硬编码数据库连接已移除，PostgreSQL URL 密钥检测已补；`security:secrets` 通过。 | 代码层门禁修复。仍需按密钥历史暴露审查、必要时轮换，并从部署环境确认 secret 管理；扫描通过不是凭据已轮换的证明。 |
| 写操作防刷 | 评论、点赞、复刻、关注、举报及改密增加用户级持久化频率限制；route-map handler 直扫数降至 37。 | 本轮覆盖五类用户互动接口和改密操作。余下 37 项不是确认漏洞：需逐个识别 service 内限流、签名回调、幂等或低风险操作，再确定哪些确需补限流。 |
| K-Coin 支付密码 | 修复了登录态可覆盖已设置支付密码的问题：之后修改需校验当前密码；密码验证与转账共用 15 分钟 5 次失败锁定。PostgreSQL 集成覆盖首次设置、改密成功/失败和锁定绕过拒绝。 | 已本地修复并验证。若用户忘记支付密码，当前没有自助重置流程，需在首发前定义经验证账号恢复流程。 |
| 数据迁移与备份 | 本地 48 个迁移文件的干净/升级演练通过；`pg_dump`/`pg_restore` 隔离演练成功；S3 上传实现存在。 | **P0/P1**。线上 ledger/checksum 未读；远端 S3 上传、对象加密/保留、异地恢复均未实测。 |
| Worker、对象存储、邮件、供应商 | 本地 readiness 已覆盖 Worker、临时 COS 写读删、SMTP 握手及公开模型路由健康覆盖；单测和 DB 集成通过。供应商健康依赖近期渠道探测记录，不主动发起生成。 | 需部署迁移和代码后，在真实配置做受控探测。COS/SMTP/AI 上游尚无线上实测；SMTP 握手不能证明邮箱投递。 |
| 注册与核心生成 | 邮箱认证 handler 与跨用户读/写/删除/下载授权测试通过；隔离 PG 中图片/视频报价、幂等任务、注入 provider 成功、fake archive、资产/历史落库、credits 结算和存储失败原路释放均通过。COS 签名 URL 本地生成与 route 授权检查通过，但未对真实对象执行 GET。真实邮件投递、浏览器新用户成功路径、线上真实 provider、真实 COS 下载和生产账本闭环未验证。 | **P0 邀请内测门槛**。完成隔离浏览器/HTTP 新用户流程与受控真实依赖的至少一个模型闭环：报价→幂等任务→终态→真实存储→历史/签名下载→账本；覆盖真实上游失败、超时、存储失败、重复提交，以及批量与下载授权边界。 |
| 支付与用户承诺 | 新增本地隔离 PostgreSQL 支付闭环集成，使用 RSA 测试密钥与仅允许 `alipay.test` 的 fetch stub，覆盖 checkout、签名拒绝、重复成功回调、退款与积分/订阅状态；没有真实支付交易。 | 公开付费仍须完成真实支付宝沙盒、查单补偿、渠道开关 UI/API 一致性、对账告警和客服/退款流程；Stripe/微信继续按各自证据单独放行。 |
| 功能范围与支持 | 权益页有“敬请期待”功能，存在多 studio/工作流/模型数量较多的产品入口；未完成逐项端到端兼容性验证。 | 首发应按证据缩小为少数验证模型和明确支持功能；明确故障反馈、响应负责人、隐私/内容政策和服务状态。 |

初始评估和本轮均未执行真实注册、验证码、生成、支付、退款、生产数据库写入或部署。此前本机隔离 PostgreSQL 与本机恢复演练已完成；生产 SSH BatchMode 直连仍不可用，生产迁移明细、日志、S3 远端恢复与真实供应商结果仍未读取/验证。

## 开发顺序与验收标准

### 第 0 阶段：止血与确认线上事实（优先立即处理）

1. 只读取得生产迁移状态：已应用、待应用、漂移版本和运行版本/`BUILD_ID`，对照发布源。若是待应用，先在生产同版本备份的隔离库演练，再执行经审查的迁移；若是漂移，先核对文件与账本校验和，禁止重写已执行迁移。验收：连续探测 `/api/ready` 与 `/api/health` 为 200，迁移 pending/drifted 都为 0，且核心查询正常。
2. 移除硬编码口令；核实并轮换仍有效的凭据；扩展密钥扫描，覆盖 PostgreSQL URL、云服务凭据及高熵值，同时避免在日志中打印值。验收：扫描能在安全测试样例上报，源码与提交记录没有有效明文凭据。
3. 暂停扩大流量与付费推广；若无法关闭现有购买入口，至少对外明确当前服务状态，并先完成支付路径核验。不要在故障状态下用真实用户试错。

### 第 1 阶段：可复现发布与 CI 门禁

1. 盘点当前全部工作区状态项和 3 个改动子模块；分类为产品改动、构建产物、备份和机密。保留原工作，不做 `reset --hard`。将可发布改动整理到受控分支，记录 commit、依赖锁文件、构建 `BUILD_ID`、迁移版本。
2. 修复 `release:check` 两处数据库默认 URL 和 `lint:routes` 语言注册表解析；修复后台导航测试与社区仓储缺失导出。构建警告应为 0，CI 必须把 route check 纳入门禁。
3. 核对 UI 用例的初始 tab、登录/历史状态、服务所用构建，修复真实回归或失效断言；目标是浏览器用例 115/115 通过，并保留失败截图与可复跑命令。
4. 在干净检出上运行 `npm ci`、迁移演练、静态检查、隔离单测、数据库集成、构建、浏览器验收；发布产物与检出提交一一对应。验收：所有门禁通过并可复跑，部署与回滚演练有记录。

### 第 2 阶段：邀请制免费内测闭环

1. 在隔离环境用新账号走邮箱验证码、注册、登录、退出、重置密码、异常验证码与限流；检查授权边界，用户 B 不能读取用户 A 的任务、资产或账单。
2. 只开放少量通过验证的图像/视频模型。逐个完成报价 → 生成 → worker 终态 → 对象存储 → 历史/下载 → 积分账本核对；覆盖超时、供应商失败、存储失败、重复提交、刷新/断线恢复。失败不得扣净额度；成功只能扣一次。
3. 实现或核实离机备份、每日失败告警与隔离环境恢复演练。扩大 readiness 到 worker 队列积压、存储、邮件及必要供应商；每个探测必须有超时和“未知/降级”状态，不能泄露密钥。
4. 做 390px 手机与桌面真实浏览器验收：首屏、登录、模型参数、错误提示、结果、下载、反馈入口、协议页面。所有视觉修改先读 `docs/UI_DESIGN_SYSTEM.md` 与 `docs/UI_REPAIR_INSTRUCTION.md`。

**邀请制内测放行条件**：线上 readiness 正常；第 1 阶段门禁全绿；至少 1 个模型从新用户到可下载结果与正确积分账本形成闭环；失败/重复提交验证通过；备份可恢复；有值班与反馈处理人。购买入口关闭或明确不可用。

### 第 3 阶段：公开注册与付费开放

1. 在支付宝沙盒与受控环境验证下单、支付成功、异步回调、签名错误、重复/乱序回调、用户关页后的主动查单、额度到账、订阅起止、退款及积分冲正。若将 Stripe/微信开放，同样逐渠道验收；没验收的渠道保持关闭。
2. 对账：订单、支付流水、订阅、积分账本、供应商成本按交易 ID 可追溯；异常在可接受时间内报警并进入人工处理队列。
3. 完成公开用户支持流程：登录/支付/生成失败的自助说明，工单或反馈响应、退款处理责任人、内容审核与滥用处置。核对服务条款、隐私、退款页与实际产品/渠道一致。
4. 灰度扩容，监控注册成功率、生成成功率、任务等待时间、支付回调延迟、扣退差异、错误率和资源占用。达到阈值才扩大流量，保留可执行的回滚与补偿方案。

**公开付费放行条件**：第 2 阶段全部满足，至少一个启用支付渠道通过成功、失败、重复、退款、补单和账本核对，且上线后监控与回滚演练已完成。

## 可直接交给 AI 编程工具的提示词

以下提示词按顺序使用。每次只分配一个工作包，要求先给出发现和改动范围，再改代码与运行验收；不要要求 AI 直接操作生产数据或真实付款。

### 提示词 A：修复发布门禁与凭据

> 你在 `/Users/seelucency/Documents/dev/sol im` 工作。先读 `AGENTS.md`，保留所有未提交改动和子模块状态，不得 reset、覆盖其他改动或打印密钥。本轮已移除两个运维脚本的硬编码数据库连接，并扩展了 PostgreSQL URL 凭据扫描；请复核这两个改动与隔离库守卫、route-map locale 解析及原子缓存行为，不要重复实现。检查 CI 是否实际执行 `lint:routes`，补充有意义的回归测试；运行 format、lint、release、secret、i18n、route checks，逐项给出结果。发现问题直接修复，不能通过放宽门禁或盲目重记基线来制造全绿。

### 提示词 B：排查线上迁移 503（先只读）

> 线上 `/api/ready` 过去曾返回 503（`database.ok=true`、`migrations.ok=false`），但 2026-09-24 23:15 台北时间的只读重查已返回 200，DB 和迁移均为 true；响应仍缺少 worker/storage/email/providers 字段。本地已新增幂等前置迁移 `031_zz_byteplus_model_catalog_prerequisite.sql` 和 `035_zz_admin_notes_legacy_shape_compat.sql`，并在全新/升级隔离库验证通过；不要假设它们就是线上根因。先只读调查：定位生产当前运行的 commit/`BUILD_ID`、迁移文件清单、`sys_core.schema_migrations` 的已应用、pending、drifted 状态以及近期日志；不要运行迁移、修改数据库或重启服务。给出精确版本差异、成因与备份/演练/回滚步骤。若需修复代码，在隔离数据库和相同构建上验证后给出变更；生产执行必须由明确发布流程承接。严禁覆盖已执行迁移或手工改校验和。

### 提示词 C：修复发布构建与 P0 测试失败

> 先完成服务器来源清点与完整脏工作树/子模块备份，再在已核准的服务器同步候选上工作；不得 reset/clean 或覆盖既有改动。当前本地已补 `listAdminCommunityPosts`、`updateCommunityPostForAdmin` 并修复后台导航契约。最新完整 `npm run test:all:isolated` 在 `tests/p0/security-baseline.test.mjs` 20/21 失败：`lib/security/legacyProxyPolicy.js` 目前允许 `POST /workflow/update-name/:id` 与 `DELETE /workflow/delete-workflow-def/:id`，而 `app/api/workflow/[[...path]]/route.js` 登录后使用服务端 MuAPI key 转发，未见按用户校验远端 workflow 所有权。先加入拒绝路径的回归测试，并以默认拒绝修复；只有存在明确的 user-to-upstream-resource ownership 映射和跨用户拒绝测试时才能重新开放。另检查 `scripts/run-all-tests-isolated.mjs`：单测需继续自动跳过 DB 测试；真实 `tests/db` 集成只能通过 `test:db` 的 `requireIsolatedTestDatabase`、随机库创建/销毁门禁运行。保留独立 `NEXT_DIST_DIR` 构建输出，严禁运行会删除/切换 `.next` 或清理静态归档的旧 `scripts/build-safe.mjs`。修复后依次运行聚焦安全用例、完整 unit suite、显式 TEST_DATABASE_URL 的 DB suite、隔离构建，并报告每项退出码、跳过数、警告和剩余风险；不得把跳过 DB 的结果称作完整 CI 通过。

### 提示词 D：首批用户核心闭环验收

> 当前工作区已有 `tests/db/auth-user-flow.test.mjs`：邮箱注册、登录、邮箱密码重置、session 撤销与登出通过真实 route handler + 隔离 PostgreSQL 集成验证（验证码由内存 sender 提供，没有真实邮件）；`tests/db/auth-registration-policy.test.mjs` 已在隔离 PostgreSQL 验证管理员暂停注册会阻止手机号和 OAuth 创建新账号，同时允许已有账号登录；`tests/db/user-isolation.test.mjs` 已验证用户 B 无法读取/修改/删除 A 的资产或作品、无法批量删除 A 资产、无法修改/删除 A 文件夹，也无法通过 query 参数读 A 数据，积分流水按用户隔离；generation callback route 的密钥拒绝、未报告成本保持未知和失败回调释放/幂等也有隔离 PG 证据；watchdog 超时释放已有隔离 PG 测试。`tests/db/model-pricing-control.test.mjs` 已从真实 quote/generation route handler 验证 201 报价、202 queued 和幂等任务，再注入 provider/archive 依赖走图片/视频终态、历史/资产落库、成功结算与存储失败释放。不要重复这些已覆盖路径。继续在隔离 `TEST_DATABASE_URL` 与受控真实模型/存储环境中补全：真实 Worker 调度与 heartbeat；真实 COS 上传及私有下载签名；管理员边界；浏览器端注册到可下载结果。不得调用生产付费模型或向真实用户发邮件。新增测试需断言终态、持久化资产和账本不变量；逐步运行并报告脱敏任务 ID、账本前后差额和失败证据。若发现缺陷，修复并复测。视觉改动必须先读两个 UI 规范文档。

### 提示词 E：支付与订阅发布门槛

> 只使用隔离数据库和支付沙盒，验证支付宝 checkout、签名回调、重复/乱序回调、查单补偿、订阅开通/续期、积分发放、退款冲正和异常对账；检查 Stripe/微信当前关闭状态是否在 UI 和 API 一致。不要发起真实购买、真实退款或重放生产回调。发现缺陷时先写失败用例再修复。交付交易状态机、账本不变量、可复跑命令和渠道放行表；每个启用渠道必须单独通过。

### 提示词 F：监控、备份和灰度发布

> 审查 `/api/live`、`/api/ready`、`/api/health`、生成 worker、支付对账、`scripts/auto-backup-s3.mjs`、`scripts/s3-backup-upload.mjs` 与 `scripts/deploy-safe.mjs`。S3 上传逻辑已实现，但必须在受控部署环境确认 AWS CLI v2、最小权限身份、桶加密/保留策略，并实际上传后执行隔离库恢复演练；缺少配置时标 `UNVERIFIED`，不得伪造成功。再核实队列积压、失败任务、依赖探测和告警；给出干净 commit → 构建产物 → `BUILD_ID` → 数据库版本 → 灰度 → 回滚的发布记录模板。不要直接部署，附可复跑的本地/隔离环境证据。

### 提示词 G：UI 浏览器验收归因

> 最近第二次全量 UI 回归为 115/115；第一次曾在 `F6-B1` 的 375px 断言里偶发得到 0 张展示卡，独立与全量复跑都未复现。若继续改动 Image Studio、Studio 布局或导航，请先确认本机 3100 端口运行的是当前构建，完整重跑 `node tests/e2e/runner.mjs --tap`；若 `F6-B1` 再失败，记录 URL、初始 tab、展示状态、图片节点数、控制台和截图后再归因。任何视觉代码修改前先读 `docs/UI_DESIGN_SYSTEM.md` 与 `docs/UI_REPAIR_INSTRUCTION.md`，保留现有工作区改动。

### 提示词 H：按全候选 UI 审计结果修复首发阻塞

> 你在 `/Users/seelucency/Documents/dev/sol im` 工作。本任务属于持续的首发开发目标。先验证生产服务器的源码/工作树并完成备份与 SERVER→LOCAL 对照；在这一来源门槛完成前，不得编辑产品源文件或尝试部署。保留所有现有脏工作区和子模块，不得 reset/clean/覆盖他人更改；先读 `AGENTS.md`、`docs/UI_DESIGN_SYSTEM.md`、`docs/UI_REPAIR_INSTRUCTION.md`。以 `docs/USER_LAUNCH_READINESS_2026-09-24.md` 的 UI 审计章节为问题清单，先确认每个受审页面是否真实进入 KOYO 首发范围，再修正首发可达路径上的 P1：公开价格访问体验、AuthModal 对话框名称和字段 accessible name、Design Agent 会话行键盘语义、NodeFlow 类别编辑 Dialog/label/focus 管理、缺焦点环控件。将 `/zh/login` 丢失 locale、`/zh/register` 404、匿名 Agents 加载失败、Workflow 英文界面、无效 Watch Demo 与无来源社会证明按确认后的首发边界归为 P1/P2 并修复。不要重新设计视觉世界，不要为清零 detector warning 批量替换颜色/渐变。处理 N+1 会话资产加载与减少动态效果作为 P2，分开提交并保持功能等价。每个问题先加能失败的测试，再修复；逐个运行 lint/UI token guard、目标包可运行构建、键盘交互与桌面/平板/375/390/430px Playwright。记录实际访问的路由、打开的菜单/模态、键盘顺序、焦点样式、横向溢出和控制台结果。没有可运行依赖或产品范围不明时保留 `UNVERIFIED` 并报告阻碍，禁止伪造浏览器通过。此提示词不授权部署或修改线上环境。

## 2026-09-25 支付履约续验

- 继续按备份放行条件审查 `scripts/s3-backup-upload.mjs`：上传后此前只核对 S3 对象的 ContentLength，不能证明对象的实际 SSE 算法符合请求。现改为读取 `head-object` 的对象大小、`ServerSideEncryption` 与 `SSEKMSKeyId`，不匹配时报明确脱敏错误码并停止报告“已验证远端副本”。更新 `tests/s3-backup-upload.test.mjs` 覆盖正确 SSE-KMS 回执、大小错配和算法错配；测试 4/4 通过。当前进程没有执行真实 S3 上传，也未检查 bucket policy/retention 或恢复 dump；线上离机备份仍为 `UNVERIFIED`。
- 本次聚焦回归：`tests/provider-readiness.test.mjs`、`tests/worker-readiness.test.mjs`、`tests/p7/email-smtp-contract.test.mjs` 合计 13/13；`npm run format:check` 通过。它们验证本地 readiness 分类与邮件契约，不证明线上依赖运行正常或邮件实际投递。

- 继续检查用户支付入口后发现，`/api/billing/credit-packs` 原先只读支付凭证可用性缓存，没有读取管理员维护的 `ops_bill.provider_configs.enabled`；套餐页/结账则使用另一套支付判定。管理员关闭支付宝/微信后，算力包页可能仍显示渠道可用，而且凭证缓存有短暂过期窗口。现在支付渠道统一判定读取数据库开关；支付管理员更新成功后立即失效进程内缓存；套餐列表、算力包列表与结账共享 `paymentChannelStatus`/`assertPaymentChannelUsable`。已扩展隔离支付集成验证：关闭支付宝后算力包和套餐接口均返回 disabled、结账返回 503；重新启用后两个目录恢复，受限测试网关 checkout 成功。`TEST_DB_FILES=payment-flow.test.mjs npm run test:db` 通过 1/1；四组支付契约/渠道/回执/退款静态测试通过 32/32；`npm run format:check` 通过。随后 `npm run build` 成功，Next.js 编译通过且静态页 110/110。该变更仍未部署。
- 尝试默认 `npm run test:billing` 时因仓库没有 `.env.local` 在测试启动前退出（不是用例失败）；改为不依赖 `.env.local` 的显式 Node 测试命令，聚焦相关支付用例通过。此次全量本地 PostgreSQL 回归仅重跑支付流文件，不能替代其他此前完整测试结果。

- 新增 `tests/db/payment-flow.test.mjs`，通过实际 checkout 与 Alipay webhook route handler 运行隔离 PostgreSQL 流程。网关请求被 stub 严格限制为 `https://alipay.test`；密钥为每次测试临时生成 RSA keypair。流程验证错误签名返回 400 且订单/积分不变；有效签名支付成功；重复成功通知不重复记账/发额度；`TRADE_CLOSED` 退款后支付流水与退款流水各一笔、积分回收一次、订单为 refunded、该订单关联订阅变为 canceled；重复退款通知保持幂等。聚焦运行 `TEST_DB_FILES=payment-flow.test.mjs npm run test:db` 通过 1/1。
- 第一次集成执行发现回调和拒绝回执都向 `webhook_events` 写入不存在的 `id` 列，真实 SQL 报 `42703`，成功通知原先会 500。已把写入字段调整为迁移定义的 `(provider,event_id)` 复合键，并同步更正原先断言了不存在 `id` 列的结构测试。第二次执行继续发现退款后订阅仍为 active；现在退款履约只取消当前 provider + 订单 ID 对应的订阅，且无其他有效订阅时将 `vip` 角色恢复为普通用户。集成还验证一分错配的签名成功通知返回失败、订单/积分/流水不变，并验证另有有效订阅时不会错误降级用户角色。
- 修复后支付单测 `payment-provider`、`native-qr-payment`、`webhook-receipt`、`provider-refund-notice` 共 32/32 通过；完整隔离 PostgreSQL `npm run test:db` 退出码 0；`format:check`、`lint`、`lint:routes`、`release:check`（898 源文件）、`security:secrets` 通过；`npm run test:all:isolated` 已对 46 个测试文件顺序执行且全部通过。Node ESM/loader 仍输出项目级弃用/模块类型 warning，不是本次失败项。
- 支付修复后的 `npm run build` 成功：编译完成，静态页面 110/110。构建在当前重度脏工作区完成，仍不构成受控 commit/生产版本可追溯证明。
- 2026-09-25 20:53（台北时间）线上只读 GET 复查：`/api/ready` HTTP 200 `status=ready`，`/api/health` HTTP 200 `status=healthy`，两者均报告 DB 与 migrations 为 true；仍没有 worker/storage/email/provider 依赖字段。本地改动未部署，线上读取不证明支付、生成或实际存储链路。
- 为推进用户生成闭环，`runGenerationWorkerOnce` 现在可在 `NODE_ENV=test` 下将注入依赖传给既有受测试保护的处理器；隔离 PG 的定价/生成场景改由真实队列发现与 Worker cycle 执行第一张图片任务，检查其终态、资产/历史与账本。最新 `model-pricing-control + payment-flow + postgres` 聚焦运行 15/15 通过；其后完整 `npm run test:db` 通过，`npm run test:all:isolated` 顺序通过 46 个文件，格式、lint 与 build 再次通过。该 Worker 测试执行单轮本地队列，不等同于线上后台进程、真实 provider 或真实 COS。
- 2026-09-25 21:00（台北时间）尝试使用 BatchMode 公钥认证直连生产服务器执行只读检查。当前本机物理接口地址为 `192.168.3.14`（用户早先记录的绑定地址已失效），绑定新地址后服务器返回 `Permission denied (publickey,password,keyboard-interactive)`；未读取或输入密码。生产 Git 状态、服务与 `BUILD_ID` 因此仍无法核验。本地修复继续留在脏工作区，没有部署。
- 后续在全新本机隔离库（041 迁移）与当前 Next build 上重跑 115 项 Playwright runner：前 68 项输出通过；随后第 68 项生命周期耗时约 275 秒，Chromium 输出多条 macOS `CVDisplayLinkCreateWithCGDisplay` 错误。为避免继续占用资源而中断后，runner 在创建下一 browser context 时因浏览器已关闭而退出，因此**此次全量 E2E 未通过也未完成**，不可引用历史 115/115 替代。相同空库下单页复测 `/zh/studio`、打开 Video 菜单并点击顶部 logo 可在数秒内完成，观察不到 `pageerror`；全量浏览器运行曾输出一次 minified `undefined.name` console error，但尚未复现和定位。该现象目前归类为 E2E 浏览器生命周期/空库配置待查，不作为已证实的产品缺陷。
- 检查上述停滞后将 E2E `cleanupPage` 简化为直接关闭每个隔离 browser context（context 会关闭其页面），不再先关 page 再关 context；Tier 2 菜单边界聚焦 5/5 通过，顶部 logo 用例耗时约 3 秒。随后在相同当前 build 与全新 041 本机隔离库全量复跑 **115/115 通过，233.27 秒**，包含 mobile/tablet/desktop、导航、点击、键盘和视觉几何断言，未再出现运行停滞。最终本轮未复现先前的 `undefined.name` console error；历史失败轮保留为诊断记录，不代表当前全量结果。
- 两个 E2E 检查使用的临时数据库均已删除；Next 测试服务已停止，端口 3100 不再有本轮服务。本次测试未写入生产或本机持久测试数据。
- 以上支付证据属于本地隔离数据库与假网关集成，不是支付宝真实沙盒验收；查单补偿、金额错配重试、乱序跨事件、部分退款、其他支付渠道及生产订单/账本均未验证。没有连接真实支付网络、没有部署或写入线上数据。

## 2026-09-25 依赖与发布门禁续验

- 修复 Vite 模型目录深层 import：`src/lib/models.js` 改为使用 Studio 已声明的公开导出 `studio/models`；缺少的根依赖 Firebase SDK 固定为 `12.19.0`。运行时依赖更新为 Next.js `15.5.26`、Sharp `0.35.4`、PostCSS `8.5.28`，并固定 PrismJS `1.30.0`、UUID `11.1.1`、`@tootallnate/once 2.0.1`。Design Agent 使用的 `react-syntax-highlighter` 同步到 Studio 已使用的 `16.1.1`。`npm audit --omit=dev --json` 当前为 0 项生产依赖漏洞；完整 dev 依赖审计仍有 25 项，其中 1 critical、20 high、2 moderate、2 low，未通过 force 升级处理。
- `packages/studio/src/messages/es/modelPrice.json` 补齐西语价格展示的 3 个缺失键。严格多语言校验现通过；西语尚有 17 个 fallback 键待后续翻译，不阻断结构校验。
- 本轮 `npm run test:ci` 完整通过：格式、lint、900 个源码的 release safety、secret scan、多语言校验、47 个 isolated 测试文件、PostgreSQL 19/19、Studio Babel、Vite 与 Next.js build（静态页 110/110）。额外 `npm run build:design` 通过。新增 Sharp variants 测试 1/1、S3 上传回执测试 4/4。构建仍显示 Vite 主 bundle 673 KB、Next Intl 缓存依赖解析 warning、过时 Browserslist 数据及 Next lint 弃用提示；均非本次构建失败，但需要纳入构建维护/性能计划。
- 校验过程中发现既有本地 `model_schedule_test` 数据库的 `005_seed_defaults` migration checksum 与当前源码不一致；未重写账本或对该库应用后续迁移。另建全新临时 PostgreSQL 库执行当前全部 041 个迁移成功后跑完 CI；此前克隆旧测试库导致的迁移 checksum 错误与缺失表失败属于测试库基线不一致，已由干净库验证取代。临时 CI 测试库运行结束后删除；没有对生产数据库操作。
- 以上均为本地仓库/隔离库证据。生产服务器仍无法通过当前 SSH 公钥只读认证，未核实生产 commit、`BUILD_ID`、迁移 ledger、服务日志、Worker、COS、SMTP 或 provider 配置；未做远端 S3 上传/恢复、真实邮件投递、真实供应商生成、支付宝沙盒或新用户浏览器全链路。依赖更新后本轮没有重跑 115 项浏览器 E2E。结论仍为 **NOT_READY for general public signup or paid release**；邀请内测需待生产版本/迁移只读核对、受控账号登录、至少一个真实模型到存储/历史/下载闭环、worker/依赖告警、备份恢复和渠道支付边界逐项补证。
- 依赖更新后重新构建的当前 Next.js build，在全新本机隔离 PostgreSQL（041 迁移）上运行 `node tests/e2e/runner.mjs --tap`，**115/115 通过，233.91 秒**，涵盖桌面/平板/375px 手机、展示卡几何、菜单遮罩与点击安全、键盘可访问性、语言切换及综合导航场景。测试结束后已停止 3100 服务并删除 `koyosim_e2e_test` 临时库；无真实注册、邮件、模型、支付或生产请求。此结果关闭了当前本地视觉回归项，但不能替代浏览器新用户认证及真实模型履约 E2E。
- 2026-09-25 22:12（台北时间）再次直连只读 GET 生产 `/api/ready` 与 `/api/health`，分别 HTTP 200、`ready`/`healthy` 且 database/migrations 均为 true；响应没有本地当前 route contract 中的 worker/storage/email/providers 字段。因此只证明被部署端点报告 DB 与迁移状态正常，不能确认生产运行代码是否包含当前依赖探针实现、Worker/provider 健康或 BUILD_ID。确认本机直出网卡 IP 为 `192.168.3.14` 后绑定该地址做 BatchMode SSH，服务器拒绝全部无交互可用认证方式；未读写服务器文件，也未输入密码。生产来源核对仍未完成。
- 按计划把 `npm run lint:routes` 加入根 `test:ci` 门禁；变更后分别验证该路由检查、release safety、secret scan、格式检查均退出 0，并确认 CI 脚本实际串入 route check。路由扫描当前报告 37 个未带 route-level rate-limit 标记的 mutation handler、94 个未加 locale 前缀的 href、3 个 onboarding 以外的 locale 分支；均为待逐项确认的存量扫描结果，不应一律当作漏洞或放行结论。
- 将 secret-scan 规则拆为可测试的纯函数，加入 PostgreSQL DSN、AWS/阿里云/腾讯云/Google API key、私钥及凭据名下高熵值检测；结果只含文件路径与规则名，不含命中值。新增 `tests/p0/secret-scan.test.mjs` 的 4 项合成样例测试全部通过；`npm run security:secrets` 通过。scanner 发现两份未跟踪的旧 Windows 截图脚本含硬编码 `ko_session` 凭据，同时脚本依赖失效的 Windows 文件路径和 Cookie 注入；两文件已删除且扫描转绿。未查看/输出凭据值，无法据此断言凭据有效或已撤销；凭据所有者仍应自行判断是否需要轮换。
- 含 route gate 与 secret-scan 测试的更新版完整 `npm run test:ci` 退出码 0：release safety 检查 899 个源码、route map 通过、secret scan 通过、多语言严格校验、48 个 isolated 测试文件、PostgreSQL 19/19、Studio 83 个文件、Vite build 及 Next 静态页 110/110。测试后删除新建的 `koyosim_final_test` 隔离数据库。
- 对前述 35 项存量扫描进行风险优先审查后，为两个 25 MiB 的二进制上传代理加上相同的 PostgreSQL 用户级限流桶 `binary_upload_user`，两条入口合计每用户每小时最多 20 次，限流在 multipart body 解析及外部 S3 fetch 前执行，限流表故障时 fail-closed。将 route scan 债务从 37 降至 35，更新 `docs/route-map.md`；新增路由契约测试，确保两入口继续共享该限流键。route manifest/secret scanner 15/15、route map、lint、format、release safety、secret scan 均通过；随后完整 `npm run test:ci` 再次通过，含 48 个 isolated 文件、PostgreSQL 19/19 与 Studio/Vite/Next build。测试用 `koyosim_release_test` 已删除，3100 端口无遗留本地服务。

## 2026-09-25 遗留 MuAPI 代理额度边界续验

- 对 `app/api/agents/*`、`app/api/app/*`、`app/api/workflow/*`、`app/api/v1/creative-agent/*`、`app/api/api/v1/*` 追踪 server-managed MuAPI credential 的出站调用时，发现策略模块原先存在但没有接入 handler：任意路径可被代理，推理入口没有统一用户积分预扣/结算或持久限流。尤其 Agent chat/suggest 路径同时出现在 allowlist 与 billed matcher 中，但保留段过滤令 billed matcher 失效，实际会被错误放行。
- 已修复策略次序，使计费路径优先拒绝；三个 scoped proxy handler 组现统一调用 `guardScopedProxyRequest`，只放行显式路径/方法，并对用户/IP 做持久 PostgreSQL 限流。Creative Agent 代理现拒绝识别出的 session chat/run-skill 与非取消 job 操作（HTTP 402，`DENY_BILLING_REQUIRED`），其他代理请求受每分钟用户/IP 限流。通用 `/api/api/v1/*` 代理按 `classifyProxyRequest` 默认拒绝任意未知路径，仅开放明确估价/工具请求，并做持久限流；原有 `gen_*` 任务仍先走本地用户归属检查。
- 新增纯策略与 handler 接线回归，覆盖 Agent chat/suggest、workflow run/node run/api-execute、通用代理未知推理/账号路径、Creative Agent chat/job approve 与 cancel；2 个 P0/route-manifest 文件共 31/31 通过。`lint:routes`、ESLint、Studio 83 文件、Vite build 与 Next.js build（静态页 110/110）通过；扫描债务从 35 降至 30。未向 MuAPI 发出请求，也未运行真实生成或扣费。
- `npm run test:ci` 执行到 PostgreSQL 集成阶段前的 format、lint、release safety（899 源文件）、route check、secret scan、i18n 及 48 个 isolated 测试文件均通过；在 `npm run test:db` 因本会话没有显式 `TEST_DATABASE_URL` 而按安全规则退出。不能记为完整 CI 通过。随后独立执行的 Studio/Vite/Next 构建均成功。Vite 仍提示主 chunk 约 673 KB 与动态导入分块警告。
- 修复尚在本地脏工作区，未部署。仍须核对旧客户端实际依赖哪些代理接口，避免将未计费但业务需要的工具误判为可开放能力；并用隔离 PostgreSQL 对持久限流的写入/超限行为做 handler 级验证。生产 `BUILD_ID`/源代码无法通过当前 SSH 认证核实，线上是否存在同一额度绕过目前为 **UNVERIFIED**。总放行状态保持 **NOT_READY**。

## 2026-09-25 遗留限流与 CI 数据准备续验

- 对 `/api/financial/credits/reserve`、`commit`、`void` 加用户级持久限流：预扣每用户每分钟 30 次，结算/释放每分钟 120 次；保留既有登录、同源/请求大小、幂等与预扣归属校验。回归检查要求三条路由使用各自限流桶，当前 route scan debt 从 30 降至 27。
- 检查全新 CI PostgreSQL 后发现 `.github/workflows/ci.yml` 迁移后没有准备 `tests/community_work_detail.test.mjs` 所依赖的精选社区案例；加入仅面向 CI 临时应用库的 `db:seed:community-cases` 阶段与契约断言。首次真实跑种子发现脚本仍使用迁移 037 前的 `usr_*` 用户 ID、并引用并不存在的虚构 creation ID。现改成稳定派生数字 creator ID并登记 `user_id_allocations`，发生 ID 占用/账号身份不符时失败退出；展示样例不再关联虚构生成任务。新增隔离 PG 测试两次运行种子，确认 8 个帖子、数字作者 ID、无虚构 creation 关联及重复运行稳定。
- `npm run test:db` 最新全量通过 20/20；新种子幂等测试另以独立新库聚焦通过。按 CI 实际前置流程，在一次性本地 PostgreSQL 集群建立独立应用库和测试库、运行两套迁移和社区案例播种后，完整 `npm run test:ci` 退出码 0，包含 format、lint、release safety 899 源文件、route map（rate-limit debt 27）、secret scan、严格 i18n、全部 isolated tests、20 个 PostgreSQL 集成测试、Studio 83 文件、Vite 与 Next build（静态页 110/110）。临时集群已停止并删除。
- Vite 主包仍约 673 KB，另有 SettingsModal 动态导入分块警告；Browserslist 数据、Next Intl 缓存依赖分析及 Next lint 弃用提示仍待维护。完整 CI 只证明当前本地工作树与一次性数据库；没有浏览器注册/真实模型/真实邮件/真实 COS/支付沙盒或生产部署证据，开放状态仍是 **NOT_READY**。
- 2026-09-25 23:01（台北时间）按直连目标 IP 对生产 `www.koyosim.com` 执行只读 GET：`/api/ready` HTTP 200 `ready`，database/migrations 均 true；`/api/health` HTTP 200 `healthy`，database/migrations 均 true。响应仍未提供 worker/storage/email/providers 状态，故不能证明生成后台和外部依赖健康；未发起写请求。SSH 无交互认证仍未解决，线上 commit/`BUILD_ID` 及源代码版本仍无法核实。
- 使用一次性本机 PostgreSQL 16 集群复跑 CI 单独编排的发布演练：`migration:drill` 成功，空库与从 payment migration 009 开始升级共 48 个迁移，保留旧管理员备注、用户根 ID 转换通过、36 个用户外键恢复；`backup:restore:drill` 成功，pg_dump 247531 bytes 且恢复库读回唯一标记。临时 PostgreSQL 集群停止并删除。该证据是本机逻辑 dump/restore，不代表生产离机 S3 上传、加密/保留策略或线上恢复。

## 2026-09-25 23:16（台北时间）首批功能边界与界面状态续验

- 继续追踪 legacy MuAPI 代理的真实消费者后，确认 Creative Agent 除公开 skill 列表外，其会话、消息、资产、job 等数据都依赖共享上游凭据，但没有本地用户归属表；Workflow Studio 的执行、详情及私有工作流接口也没有 KoyoSIM 积分、所有权和任务结果闭环。相关代理已收窄为默认拒绝，仅保留经确认的公开目录 GET 与工具查询；计费/推理/私有数据路径不得通过共享凭据代用户访问。
- 为避免“看似可用、点击后必然失败”，`WorkflowStudio` 和 `CreativeCanvas` 暂时呈现功能状态说明；两者的工作流列表、session/history、资产及生成 API 初始化请求也都被停止。状态说明指向 Studio 中当前可用的图像/视频工具。只有在用户归属、预扣/结算、持久任务终态、存储结果和历史恢复全部接好并通过验收后，才解除功能门闩。
- 验证：`npm run lint` 通过；`node scripts/run-all-tests-isolated.mjs` 通过 49 个测试文件。由于当前进程未提供 `TEST_DATABASE_URL`，其中 PostgreSQL 集成文件按现有隔离测试机制跳过，不能当成 DB 回归通过；本轮没有以无效直接 Node 命令替代项目 loader。
- `npm run build` 通过，Next.js 15.5.26 编译成功，静态生成 110/110 页面。未运行浏览器 E2E；本次 UI 改动为不可用提示门闩，仍应在首发构建里验证两个入口状态、可访问性和窄屏布局。
- 依赖审计（本机当前 npm advisory 数据）生产依赖为 0 项，完整开发依赖树仍有 25 项：1 critical、20 high、2 moderate、2 low，集中于 Electron/electron-builder 与 Vite/esbuild；升级涉及主要版本或构建链兼容，需单独做版本规划和构建产物验证，不能把 `npm audit fix` 直接用于这份已有脏锁文件的工作区。
- 放行结论不变：**NOT_READY（暂不开放普通注册与付费）**。线上只读 readiness 最近观测仍是 DB/迁移为绿，但生产 commit/BUILD_ID、worker、存储、邮件、provider、备份恢复及真实生成下载闭环未被当前生产源证明。下一优先项为：取得生产版本和迁移清单只读证据；为所选模型完成隔离队列 + 受控真实 provider/COS 的终态验证；运行浏览器账号到下载闭环；完成离机备份恢复和轮值告警；最后才讨论邀请制额度与付费渠道。

## 2026-09-25 23:29（台北时间）完整本地发布门禁与浏览器续验

- 为消除前一条记录中 `TEST_DATABASE_URL` 缺失导致 PostgreSQL 用例跳过的问题，在 `/tmp/koyosim-readiness-pg-20260925` 创建仅绑定 `127.0.0.1:55493` 的临时 PostgreSQL 16 集群，分别准备 `open_generative_ai` 和 `open_generative_ai_test`。空库迁移及 test 库迁移均收敛到 `041_worker_heartbeat`；应用库按 CI 准备步骤播种 8 条精选社区契约数据。完成验证后停止集群并删除临时目录；端口 55493 无响应，3100 端口无遗留监听。
- `npm run test:ci` 本轮退出码 0：format、lint、release safety（899 个源码）、route map、secret scan、i18n、49 个 isolated 测试文件、PostgreSQL 集成 20/20、Studio 83 文件、Vite build、Next.js build（110/110）全部通过。route-map 仍报告 27 个未标记 route-level rate-limit 的 mutation、94 个未使用 locale 前缀的 href、3 个 locale 分支；门禁通过不代表这些扫描项已逐一风险审查。构建仍有 Next lint 弃用提示、Browserslist 数据过期、SettingsModal 动态导入冲突及约 673KB Vite 主包告警。
- 对本次 build 产物启动绑定 `127.0.0.1:3100` 的本地 Next 服务器，运行 `node tests/e2e/runner.mjs --tap`：**115/115 通过，176.10 秒**，含 375px showcase 卡片、导航、快速切换、键盘与 click safety；之前记载的偶发 F6-B1 与导航边界失败在该次完整回归中没有复现。之后运行 `npm run test:e2e`：10 项通过、12 项跳过；被跳过的是需管理员/普通用户会话或管理员财务操作的场景，本轮未伪造或注入真实用户身份，因此这些路径仍未由浏览器证明。
- `npm run migration:drill` 通过：空库和升级库 48 个迁移演练成功，保留旧管理员备注并恢复 36 个用户外键。`npm run backup:restore:drill` 通过：隔离逻辑备份 258411 bytes，恢复库成功读回标记。它们只证明本地 PostgreSQL 演练，不证明生产 S3 对象、加密/保留策略或线上恢复。
- 上述均为当前本地工作树与临时本机数据库的验证；未改写生产数据库、未触发真实 provider 或支付。邀请制可放行条件仍未全部满足：生产 commit/BUILD_ID 不可核验、浏览器账号态与真实 Worker/provider/COS 结果链未闭环、离机备份未实测。放行状态维持 **NOT_READY**。

## 2026-09-25 23:30（台北时间）生产只读探测续验

- 经直连 HTTPS 对 `www.koyosim.com` 并行 GET `/api/live`、`/api/ready`、`/api/health`：三者均为 HTTP 200；live=`live`，ready=`ready`、health=`healthy`，DB 与迁移为 true。响应只暴露 DB/迁移状态，未报告 worker、对象存储、邮件或 providers；因此这只是生产探针证据，不是生成/下载/计费可用证明。未发起任何写请求。
- 生产 commit、`BUILD_ID`、代码工作树、队列和离机备份仍未核实；上线范围仍 **NOT_READY**。

## 2026-09-25 23:37（台北时间）功能状态提示多语言修复

- 将 Workflow Studio 状态提示接入 Studio locale-copy resolver，并将当前 locale 从 StandaloneShell 传入；Creative Agent 状态提示通过 DesignAgentStudio 复用 agentStudio 翻译包传入。为 en、zh-CN、ja-JP、ko-KR、zh-TW、es 补齐文案，避免中文等入口回退成硬编码英文。
- 严格 i18n 第一次校验确实发现 `es` 目录缺键；补齐后 `npm run test:i18n` 通过（各语言 missing=0）；`npm run format:check`、`npm run lint`、`npm run build:studio`、`npm run build` 均通过。Next 静态页 110/110。
- 本地浏览器 115/115 和 Playwright 权限 10 pass/12 skip 是此前同一代码主体上的运行结果；本次只改状态文案与 locale 传递，完成 build/i18n 编译验证，未重复跑浏览器套件。生产尚未部署这些改动。

## 2026-09-25 23:40（台北时间）不可用状态浏览器回归

- 新增 Playwright 回归：打开 `/zh/studio/workflows` 与 `/zh/studio/design-agent`，分别断言中文不可用状态文案，并断言页面未发起 legacy workflow/session API 请求。
- 桌面 Chromium 与 390px mobile 两个项目均通过，4/4。测试服务的 DB URL 使用本机不可连接的占位地址；页面同时记录到其它壳层读取 branding/content/model catalog 时的 DB 连接错误，因此该证据只覆盖状态提示和无旧代理请求，不覆盖 Studio 所有依赖健康。测试退出后停止本地服务器。

## 2026-09-25 23:45（台北时间）用户 API 限流与头像删除保护

- 继续处理 route-map 扫描中经逐条确认的高风险变更入口：为生成报价、头像上传、头像删除、用户资料更新、账号停用增加按认证用户 ID 计数的持久 PostgreSQL 限流；头像删除补上同源及请求大小保护。头像上传上限为 10 次/小时，删除 20 次/小时，生成报价 60 次/小时，资料更新 60 次/小时，账号停用 3 次/日。所有新限流均在读取 request body 或执行 DB/COS 操作前检查，并复用 fail-closed 限流器。
- 将五个新限流契约及头像 DELETE 的 guard 加入 `tests/p0/security-baseline.test.mjs`。使用项目的 server-only loader 执行该安全测试文件，21/21 通过；`npm run lint` 与 `npm run format:check` 通过。裸运行 `node --test` 会被 `server-only` 模块保护主动拒绝，已改用项目 loader 重跑并通过。
- `npm run lint:routes` 最初因 route manifest 尚未刷新而失败；执行 `npm run route:map` 后再检查通过。当前未配置 route-level limit 的 mutation 数由 27 降至 23；剩余项目尚需结合接口鉴权、服务层限流、回调签名/幂等逐条确认，不能以扫描数直接等同漏洞数。raw href 94 项、locale 分支 3 项仍待分类。
- 仅改本地工作区，未部署、未执行生产写入。该验证未连接 PostgreSQL/COS 执行运行时请求，因此 rate bucket 存储可用性及用户实际限流响应仍待隔离数据库/API 集成测试补证。放行状态继续为 **NOT_READY**。

## 2026-09-25 23:49（台北时间）高频用户变更限流续修

- 逐项复核后，为用户偏好、隐私设置、头像框、作品删除、社区帖子删除、每日签到、支付密码设置、K 币转账和头像框兑换增加按认证账户 ID 持久限流。具体范围为：偏好 120 次/小时、隐私 60 次/小时、头像框佩戴 60 次/小时、作品删除 60 次/小时、社区删除 30 次/小时、签到 10 次/日、支付密码更新 10 次/15 分钟、转账 10 次/小时、兑换 30 次/小时。限制在请求体解析和业务服务调用前生效；原有 OTP 限制、支付密码错误锁定、转账幂等/账户限额、日签到唯一性继续保留。
- `tests/p0/security-baseline.test.mjs` 的敏感写入契约已覆盖上述入口及此前新增的报价、资料、头像、注销入口；使用项目 `server-only` loader 执行，21/21 通过。`npm run lint`、`npm run format:check` 和刷新后的 `npm run lint:routes` 通过。当前扫描未标记 rate-limit 的 mutation handler 为 14（相对本地路由基线 47 项），其它 href/locale 扫描债务仍为 94/3。
- 在一次性本地 PostgreSQL 16 隔离集群应用当前全部 041 个迁移后，运行既有 `persistent rate-limit status locks after the configured failures and resets explicitly` 集成测试，1/1 通过；测试后停止集群并删除临时目录。该测试验证共享的持久限流器写入、拒绝和重置，不是每个新 API handler 的端到端 HTTP 测试。
- 没有访问或改写生产数据，没有部署。仍需分析余下 14 项：包括签名 webhook/生成回调、已有邮件/SMS/支付密码服务限制、低风险会话操作，以及已停用的直接作品写入；应逐项记录明确豁免或补充针对性保护，不以 route-map 零违规作为安全目标。整体用户开放结论仍为 **NOT_READY**。

## 2026-09-25 23:53（台北时间）限流修复后完整 CI 复验

- 按 CI 前置流程创建一次性本机 PostgreSQL 16 集群，独立建立应用库与测试库，分别应用当前 041 个迁移，并向隔离应用库写入测试所需的 8 个精选社区样例。执行 `npm run test:ci` 退出码 0：format、lint、release safety（899 源文件）、route map（未标记限流 mutation=14）、secret scan、严格 i18n、isolated tests、PostgreSQL 20/20、Studio 83 个文件、Vite build 与 Next build（110/110）均通过。此次包含本轮敏感 API 限流基线测试及数据库限流集成。
- CI 完成后 shell trap 停止并删除临时 PostgreSQL 集群；端口 55544 无监听。此次没有连接生产、没有调用真实 provider/COS/支付或真实账号。
- 构建仍提示 Vite `SettingsModal` 动态/静态 import 冲突、主包约 673 KB、Browserslist 数据过期、Next `next lint` 后续版本将移除等维护项。完整本地 CI 通过不改变线上生产源、真实业务闭环和离机恢复尚未验证的状态，开放判定维持 **NOT_READY**。

## 2026-09-25 23:56（台北时间）剩余 route rate-limit 项核查

- 对 route-map 剩余 11 项逐一追踪到服务实现：密码重置/用户名找回的邮箱请求会同时按哈希后的客户端 IP（10 次/小时）和目标邮箱（3 次/小时）限流；邮件码和手机号 OTP 分别有每个挑战最多 5 次校验限制及发送冷却/设备会话校验。支付宝、Stripe、微信 webhook 必须保留签名和支付事件幂等处理，生成回调有签名校验；不增加通用限流，以免损坏合法提供方重试。注销只执行 session 撤销且撤销幂等；刷新要求有效一次性 session 并轮换 token。此扫描数因此是“handler 文件未显式调用 route-level helper”，并非 11 个确认的无防护漏洞。
- 补上前述列表里确实缺少账户级保护的 3 组凭据管理接口：邮箱绑定每用户 10 次/小时、解绑 5 次/日；手机绑定每用户 10 次/小时、解绑 5 次/日；OAuth 解绑每用户 10 次/小时。邮箱轮换目标攻击现在受账户级上限约束，服务层原有邮箱目标冷却与验证码挑战限制仍生效。
- `npm run lint`、`npm run format:check`、`npm run lint:routes` 通过；P0 安全契约 21/21、route manifest 11/11 通过。随后 `npm run test:all:isolated` 通过 49 个测试文件；数据库类用例因本轮未设置 TEST_DATABASE_URL 按测试定义跳过。此轮没有重复完整 `npm run test:ci`；完整 CI 最近证据仍是 23:53 记录、发生在这 3 组新 handler 限流之前，故本次变更不能声称已完整 CI 验证。
- route-map 扫描余项降到 11：5 个身份恢复 handler、3 个支付 webhook、1 个生成回调、1 个 logout、1 个 refresh。服务层保护豁免依据已记录，但 handler 文件上仍无 route-level 限流标记。没有部署或生产写入；放行状态仍为 **NOT_READY**。

## 2026-09-25 23:59（台北时间）凭据变更限流后的全量门禁

- 最近新增的邮箱/手机绑定解绑与 OAuth 解绑限流纳入独立临时 PostgreSQL 16 CI 流程；应用库和测试库均从空库收敛到迁移 041，应用库播种社区测试样例。当前工作树上的 `npm run test:ci` 最终退出码 0：格式、lint、release safety（899 文件）、route map（rate-limit scan 11）、secret scan、严格 i18n、49 个 isolated 测试文件、PostgreSQL 集成 20/20、Studio 83 文件、Vite 与 Next.js 生产构建（静态页 110/110）全部通过。CI shell trap 已停止并删除隔离数据库集群，端口 55545 无监听。
- 该完整本地门禁覆盖当前路由改动，但不是线上版本来源证明、受控真实账号闭环或真实 provider/COS/支付证明。生产检查仍只读，未部署；开放状态继续 **NOT_READY**。

## 2026-09-26 00:01（台北时间）独立新账号认证闭环复验

- 在一次性本机 PostgreSQL 16 测试库应用全部 041 个迁移后，单独执行 `tests/db/auth-user-flow.test.mjs`：1/1 通过。该测试从新邮箱验证码挑战开始，经注册 handler、错误验证码拒绝、邮箱登录、错误密码拒绝、服务注入的邮件重置码、密码重置、旧 session 全部吊销、以新密码重新登录，最后退出并确认 session 失效。测试库由 shell trap 停止并删除，端口 55546 无监听。
- 这条链在真实隔离 PostgreSQL 和 API handler 上执行，但邮件通过测试注入函数，不会向真实邮件地址投递；没有使用可视浏览器，没有连接 provider/COS，也不是生产用户验收。服务提示 SMTP 未配置并跳过欢迎邮件，邮件 OTP 的发送和投递可达性仍未证明。无需获取或读取任何人的密码、OTP、cookie 或 token。

## 2026-09-26 支付新购默认关闭与全量门禁复验

- 再次只读直连线上 `www.koyosim.com`：`/api/live`、`/api/ready`、`/api/health` 均为 HTTP 200；ready/health 的公开内容只证明数据库与迁移检查通过。`/api/billing/plans` 显示 5 个方案且支付宝 `enabled=true/status=active`；`/api/billing/credit-packs` 显示 7 个算力包且支付宝 `enabled=true`。这意味着现网仍向用户呈现可购买状态；本地修复尚未部署。线上 commit、BUILD_ID、worker、存储、邮件、支付履约与备份恢复仍未核实。
- 本地加入 `PUBLIC_PAID_CHECKOUT_ENABLED` 总开关，只有显式设为字符串 `true` 才允许创建新付款订单；默认关闭时所有公开渠道报告不可用，服务端给出明确的“新购暂未开放”响应。检查同时放在 checkout route 和 `createPaymentCheckout()`，避免服务层调用绕过页面/API门禁。未改支付回调和既有订单处理路径。价格页不再声称支持微信/支付宝可购买，并明确展示新购关闭原因；算力包结账链路未实现且 RechargeModal 不支持原入口标签，因此算力包按钮改为明确禁用，避免仅开启订阅结账开关时露出不可用路径。
- 扩展 `tests/db/payment-flow.test.mjs`：在凭证完整、管理员开启支付宝但总开关缺省时，方案/算力包目录仍关闭、HTTP 及直接服务调用均返回 503、用户没有新订单；显式开启总开关后，沙盒支付宝回调、重复通知幂等、退款冲正仍通过。测试只使用 `https://alipay.test` 假响应，不访问支付厂商。
- 一次性 PostgreSQL 16 本地隔离集群、041 迁移和独立应用/测试数据库上完整执行 `npm run test:ci` 退出码 0：format、lint、release safety（899 源码）、route map（未标记限流 mutation=11）、secret scan、严格 i18n、全部 isolated tests、PostgreSQL 集成 20/20、Studio Babel 83 文件、Vite 与 Next.js build（静态页 110/110）均通过。Vite 仍提示主 bundle 约 673 KB、SettingsModal 静态/动态 import 冲突和 Browserslist 数据过期；Next.js 提示 `next lint` 将弃用。没有生产写入、部署、真实收款/退款、真实 provider 调用或真实邮件。
- 当前结论仍为 **NOT_READY for general signup or paid use**。新购关闭代码只存在于这份本地脏工作区；现网支付宝购买入口仍启用。达到有限免费邀请内测前，仍须先按受控发布流程落实门禁并复测线上 checkout 拒绝，同时完成生产版本/迁移来源核验、可视化新账号浏览器注册登录、至少一个真实受控模型的生成→存储→历史→下载闭环、备份恢复演练、邮件投递与 worker/依赖监控。开放付费前另需完成指定渠道的沙盒付款/回调/退款/订阅/对账验收，并修复算力包的独立结账链路。
- 最终页面调整后重跑 `npm run format:check`、相关 ESLint 与 `npm run build`，均通过；Next.js 静态页 110/110。新增算力包购买关闭契约后，该契约随最终独立验证运行通过；完整 `npm run test:ci` 在该 UI 契约测试加入前已完整通过。

## 2026-09-26 00:22（台北时间）生产备份缺桶失败关闭

- 复核现有 S3 上传代码后发现，`S3_BACKUP_BUCKET` 缺失时 uploader 返回 `uploaded:false`；生产调度器仍会记录本地 dump ready 并以 0 退出，形成“本地有备份、异地副本缺失但任务看起来成功”的误报。
- 修复 `scripts/s3-backup-upload.mjs`：`NODE_ENV=production` 且桶未配置时返回稳定错误码 `S3_BACKUP_BUCKET_NOT_CONFIGURED`，上层自动备份任务因此进入失败/告警分支；已生成的本地 dump 会保留。非生产环境仍可本地备份，但现在会明确打印远端副本跳过原因。更新 `docs/BACKUP_OPERATIONS.md` 说明生产与本地行为及上传后核验的大小、加密算法和 KMS key 标识。
- `tests/s3-backup-upload.test.mjs` 验证缺桶开发模式不会调用 AWS CLI、生产缺桶 fail-closed，以及既有上传/回执合同；4/4 通过。`format:check`、相关 ESLint、定向 `git diff --check` 通过。总工作区状态数仍为 534，本轮仅改上述备份实现、测试和说明文件。
- 当前环境已确认没有 AWS CLI，`S3_BACKUP_BUCKET` 与 AWS Profile/role 相关配置均未设置；没有执行 S3 写入或尝试真实云端认证。修复仅证明生产缺桶会被本地代码拒绝，**不证明生产桶、权限、加密策略、定时任务、告警送达或异地恢复**；远端备份继续标记 **UNVERIFIED**，总体用户开放状态仍为 **NOT_READY**。

## 2026-09-26 00:29（台北时间）pg_dump 数据库口令参数暴露修复

- 安全复核发现 `scripts/backup-db.mjs` 原先把完整 `DATABASE_URL` 作为 `pg_dump` 命令行参数，并将包含该 URL 的整个应用环境传给子进程。若 URL 内有数据库密码，可能出现在系统进程参数或子进程环境中。
- 现在拆解 PostgreSQL URL，在启动 `pg_dump` 前移除密码参数和应用 `DATABASE_URL`，将密码写入权限为 `0600` 的临时 `.pgpass` 文件，目录权限为 `0700`，命令完成后成功或失败路径都会清理。拒绝不支持的 URL `sslpassword` 以及彼此冲突的 user/password 双重参数；错误和日志不带连接串或密码。备份转储目录与文件原有权限控制保持不变。
- 新增 `tests/backup-db.test.mjs`：验证命令参数不含口令、子进程不继承 `DATABASE_URL`、`.pgpass` 的目录/文件权限、URL 特殊字符转义、成功与失败后的临时文件清理，以及错误消息脱敏。`backup-db` 与 S3 uploader 聚焦测试合计 **8/8 通过**；format、ESLint、release safety（899 源文件）、secret scan 和定向 diff 检查通过。
- 使用一次性 PostgreSQL 16 SCRAM 密码认证实例进行真实冒烟：`createPostgresBackup()` 成功执行 `pg_dump`，再把 1,670 字节 dump 恢复到另一个临时库并查询到 1 行标记。测试凭据为合成值，临时实例和文件已停止/删除；没有连接生产。该结果验证本地命令和 `.pgpass` 配合，不证明生产连接参数、远端 S3 上传或异地恢复。
- 工作区当前有 535 个状态项，所有现有改动均保留。远端 S3 与线上来源、生产迁移/服务、真实邮件、AI/COS 用户链路及新购门禁部署仍未验证；继续保持 **NOT_READY**。

## 2026-09-26 00:35（台北时间）备份凭据修复后的 CI 与演练复验

- 在一次性本机 PostgreSQL 16 集群中分别创建应用库、测试库，从空库应用全部 041 个迁移，并播种 8 个 CI 社区案例。`npm run migration:drill` 通过：48 个迁移文件、升级路径备注保留及用户根 ID 转换均通过；`npm run backup:restore:drill` 通过：247,493 字节 dump 恢复到临时库并读回标记。
- 在两库已迁移的隔离环境运行最终工作树 `npm run test:ci`，退出码 0。format、lint、release safety（899 个源码）、route map（未标记 rate-limit 的 mutation handler=11）、secret scan、多语言校验、递归隔离测试、PostgreSQL 集成 **20/20**、Studio Babel 83 文件、Vite build 和 Next.js build 全部通过；Next.js 静态页 110/110。该次 run 纳入了本轮新加的 `tests/backup-db.test.mjs`。
- 构建仍报告 Vite 主 chunk 673 KB、SettingsModal 静态/动态 import 冲突、Browserslist 数据过期和 `next lint` 后续版本弃用提示；这些不导致构建失败，但性能与工具链债务仍在。隔离数据库集群已停止并删除，没有改生产数据库。
- 本次完整 CI 和本地 dump/restore 仍不能证明 S3 远端上传、生产连接配置、生产 checkout 门禁部署、真实邮件投递、真实 AI/COS 履约或生产用户闭环。当前环境无 AWS CLI/桶身份配置，生产源码版本仍无法读取；整体状态继续 **NOT_READY**。

## 2026-09-26 00:37（台北时间）生产支付目录与 SSH 只读复核

- 最新直连只读 GET：`/api/ready` 与 `/api/health` 为 HTTP 200，返回 DB 与 migration `true`，仍未暴露 worker/storage/email/providers 健康字段；套餐接口返回 5 个方案、算力包接口 7 个，支付宝仍分别显示 `enabled=true/status=active` 与 `enabled=true`，Stripe/微信仍关闭。
- 同一时段用 `BatchMode=yes`、`PreferredAuthentications=publickey` 重新尝试 `ubuntu@43.155.166.90`，SSH 握手后连接关闭，未输入密码，未执行远端命令。生产 Git HEAD、`BUILD_ID`、dirty state、服务和 migration ledger 仍不可采证。该终端失败不改变线上 API 观察，也不授权部署。
- 结论：现网仍公开可购买的支付宝渠道，而本地 checkout gate 尚未进入运行生产版本。公共用户付费路径继续视为实际开放风险；需取得正式只读生产访问/发布窗口后先验证来源和备份，再经发布审批部署门禁并用认证测试账号确认 checkout 503、无订单创建，方可关闭该阻塞。总体仍 **NOT_READY**。

## 2026-09-26 00:43（台北时间）全局暂停注册开关补齐手机号与 OAuth 新账号路径

- 深入追踪后台“关闭新用户自主注册”设置后发现，邮箱发送验证码和邮箱注册接口会拒绝新注册，但手机号验证接口和 OAuth 回调会直接调用用户创建服务，没有在统一创建边界检查 `registration_enabled`。因此管理员暂停注册时仍有两条新账号路径可用。
- 在 `lib/services/auth.js` 将注册策略检查放入手机号/OAuth 新用户创建的同一数据库事务；暂停时返回稳定错误 `REGISTRATION_DISABLED`。已绑定手机号、已有 OAuth 绑定或可匹配既有邮箱的账户仍可登录，避免将“暂停新注册”误变成锁住老用户。邮箱接口原有显式检查未变。
- 新增 `tests/db/auth-registration-policy.test.mjs`，在隔离 PostgreSQL 中先建立既有手机号/OAuth 用户，再关闭开关，验证两类新用户创建均拒绝、既有两类用户仍能登录；测试结束恢复设置并删除测试数据。一次性 PostgreSQL 16 隔离实例应用全部 041 个迁移后，该测试 **1/1 通过**，实例与临时目录已清理。
- `npm run format:check`、`npm run lint` 通过；`npm run test:all:isolated` 通过全部 **51 个测试文件**。该总套件未配置隔离数据库，故其中数据库用例按约定跳过；本轮新增的数据库策略用例由独立临时数据库实跑。
- 这是本地代码修复，没有部署。不能因此认为线上注册开关已生效；生产来源与当前构建仍不可核验，支付宝新购仍处于线上启用状态，真实浏览器身份闭环、邮件投递、模型/存储履约和远端备份恢复仍未验证，用户开放状态保持 **NOT_READY**。

## 2026-09-26 00:48（台北时间）生产健康字段、支付目录与只读 SSH 复核

- 直连 GET `https://www.koyosim.com/api/ready` 与 `/api/health` 均为 HTTP 200，分别只返回数据库与迁移状态；health 因这两项正常而标记 `healthy`，没有 worker、storage、email 或 provider 状态。当前工作区版本的这两个接口已经纳入上述依赖状态，因此线上响应可证实运行代码与本地当前源码不同，不能以本地构建代表生产。
- 同时 GET 套餐目录有 5 个方案，支付宝 `configured=true/enabled=true/status=active`；算力包目录有 7 个可售条目，支付宝 `enabled=true`，微信关闭。未提交支付或创建订单请求。
- 检查本机出口地址为 `192.168.3.14`，SSH agent 当前无已加载身份。经直连、清除代理、显式绑定本机地址并只允许公钥认证，连接 `ubuntu@43.155.166.90` 返回 `Permission denied (publickey,password,keyboard-interactive)`；未输入口令、未执行远端命令。生产 HEAD、`BUILD_ID`、迁移明细、工作树与服务状态仍不可核实。
- 因生产版本与本地源码已出现可见差异，本地功能测试只能说明本地候选源码行为；后续应先通过可用且授权的只读凭据完成服务器源清点与脏工作树快照，再决定哪些本地改动可纳入发布。未部署，公开付费入口仍为真实风险，首批普通用户放行继续 **NOT_READY**。

## 2026-09-26 00:51（台北时间）最新工作区独立 Next.js 候选构建

- 为避免覆盖默认 `.next`，通过 `NEXT_DIST_DIR=.next-launch-20260926-0050 npm run build` 对当前工作区做隔离生产构建。Next 15.5.26 编译成功，静态页生成 **110/110**，Build ID 为 `UF5TGD7cERaRr_R65fvpc`；格式与 ESLint 已在 00:43 的注册策略修复验证中通过。构建出现 `next-intl` 动态导入导致 webpack cache dependency 无法解析的非阻断警告。
- 此 ID 只属于本地工作区构建，不代表生产版本，也不对应干净/可发布 Git 提交。线上 `/zh/studio` 引用的入口 chunk 路径为 `page-cc3db88c085d7373.js`；本次候选构建对应 `page-8b7789509f7984a2.js`。这是公开静态资源指纹，不是 Next `BUILD_ID` 或 commit 证明；生产服务端真实 `BUILD_ID` 和源码仍需 SSH 只读权限取得。
- 候选构建完成后临时构建目录已清理，默认 `.next` 未被覆盖。构建成功只验证当前本地候选源码可以编译，不能越过生产版本差异、公开支付宝入口、真实服务闭环与备份恢复等放行门槛；总体 **NOT_READY**。

## 2026-09-26 01:00（台北时间）匿名浏览器价格入口与注册表单检查

- 使用新开的 Codex In-app Browser 对公开线上页面做只读检查，无登录、验证码、表单提交或购买。访问 `/zh/pricing` 后最终落到 `/zh/studio?account=open&tab=membership`；匿名界面显示需要登录，选择“继续留在工作台”后停在 `/zh/studio?tab=membership`，未展示可供访客比较的套餐/价格。这个结果证明该访问路径当前未把未登录访客带到公开价格表；是否为预期产品设计需确认，首次用户在付费决策前缺少可见价格信息应列入 P1。
- `/zh/studio` 公开页可显示登录入口。登录弹窗可切换邮箱登录、手机号验证码；邮箱注册模式显示邮箱、邮箱验证码、密码字段、Google/X/TikTok 快捷授权入口，以及用户协议和隐私政策链接。没有申请验证码、输入凭据、创建账号或接受条款。
- 新开临时浏览器中的注册表单曾显示预填的邮箱字段和密码掩码；我没有读取、抄录或报告字段值，也无法判定来自页面默认值还是浏览器自动填充。随后对邮箱、验证码、密码三个输入框设置空值并关闭临时标签，未提交任何数据。需排查页面硬编码默认值及浏览器自动填充隔离行为，确认新访客不会看到他人或服务账号的字段。
- 390×844 视口只读查看 `/zh/studio/image`：导航栏、NANO BANANA 首屏、提示词输入、参考图按钮、模型/比例/Auto 控件与“生成”主按钮均出现在视口内，截图未见横向溢出或控件被裁切。检查仅覆盖默认空闲状态，不含键盘弹出、滚动、打开模型选择器、窄屏登录弹窗或结果页；测试视口已重置，临时标签已关闭。
- UI 检查覆盖当前匿名桌面注册入口与 390×844 手机工作台空闲状态；仍未覆盖手机登录弹窗/键盘、真实注册邮件投递、登录后的授权边界或生成流程。结合线上支付宝目录仍启用和生产 SSH 无公钥授权，用户开放状态维持 **NOT_READY**。


## 2026-09-26 01:05（台北时间）最新生产只读复核与状态汇总

- 直连 GET `https://www.koyosim.com/api/health` 与 `/api/ready` 均为 HTTP 200，公开响应显示数据库和迁移通过；响应不含 worker、存储、邮件或 provider 健康字段。套餐接口返回 5 项、算力包接口返回 7 项，支付宝仍启用。健康端点 200 不能证明核心用户路径可用。
- 线上匿名 `/zh/pricing` 访问会被导向需登录的工作台会员页，没有访客可比较的公开价格表。该路径是首次用户在作出付费决策前的透明度缺口，应在首发验收中确认并解决。
- 本地代码已有支付新购默认关闭、注册全路径暂停、扩展 readiness 与备份安全修复；本地 CI 和隔离 PostgreSQL 测试有记录，但这些变更并未部署。最新本地候选构建仅代表当前脏工作区，不等于生产构建或可追溯 release。
- 生产 SSH 仍未取得只读公钥授权；生产 commit/BUILD_ID、dirty state、迁移 ledger、日志、worker、真实存储/邮件/provider、S3 上传与异地恢复均 **UNVERIFIED**。未登录、未读取或传递任何密码/OTP/token/cookie，未创建账号、付款或写生产数据。普通注册及付费开放维持 **NOT_READY**。

## 2026-09-26 01:17（台北时间）UI 全候选应用技术审计（源码级；未修改产品 UI）

### 范围与方法

覆盖 8 个表面：KOYO 主站/Next.js 认证与价格入口、`packages/studio`、Open-AI-Design-Agent 客户端、Design Agent 组件包、Open-Poe-AI 客户端、Agents 组件包、Vibe-Workflow 客户端、workflow-builder 组件包。三个独立客户端与组件包分开审计；组件包属于被嵌入 UI 的源码面，并非各自独立可部署网站。所有目标均没有独立 `PRODUCT.md` / `DESIGN.md`；当前代码是视觉现状参考，不代表这七套视觉已经符合 KOYO 主规范。

按 Impeccable audit 五维规则检查源码（可访问性、性能、响应式、主题、实现完整性），并运行一次内置 detector 扫描全部候选与主站价格/认证目标，共 **26 条 warning**。这些 detector 命中主要是样式启发式提示，不自动算作 WCAG 缺陷；已抽查上下文，其中“过度使用字体”命中 `font-family: Arial` 属误报。对生产站仅有前文所述的匿名价格入口及 390×844 Image Studio 默认空闲态浏览器观察；其余 7 个表面没有独立浏览器/键盘/读屏运行证据，以下评分因此是**源码级暂评分，不是动态验收或 WCAG 合规声明**。实现没有产品 UI 改动。

### 五维暂评分

分值顺序为 **可访问性 / 性能 / 响应式 / 主题 / 实现完整性**，总分 20。缺少浏览器证据时采取保守评分；组件包响应式与主题分数只代表源码可维护性和表面结构。

| UI 表面 | 五维分数 | 总分 | 当前判断 |
| --- | --- | ---: | --- |
| KOYO 主站：价格 / 认证入口 | 2 / 2 / 2 / 3 / 2 | 11/20 | Acceptable；真实价格入口与认证可访问性须优先修复/复验 |
| `packages/studio` | 2 / 2 / 2 / 2 / 2 | 10/20 | Acceptable；只验证单一窄屏空闲态，Studio 子页需逐一验收 |
| Open-AI-Design-Agent 客户端 | 1 / 2 / 2 / 1 / 2 | 8/20 | Poor；可键盘访问及主题统一问题突出 |
| Design Agent 组件包 | 1 / 2 / 2 / 1 / 2 | 8/20 | Poor；画布交互和文本输入焦点提示不足 |
| Open-Poe-AI 客户端 | 2 / 2 / 2 / 1 / 1 | 8/20 | Poor；有未验证社会证明文案，视觉系统与主站不一致 |
| Agents 组件包 | 1 / 2 / 2 / 1 / 2 | 8/20 | Poor；聊天输入/菜单无焦点提示、低对比命中需修正 |
| Vibe-Workflow 客户端 | 2 / 2 / 2 / 1 / 1 | 8/20 | Poor；演示按钮不工作、占位展示与实际功能边界不清 |
| workflow-builder 组件包 | 1 / 2 / 1 / 1 / 1 | 6/20 | Poor；模态语义、键盘焦点与小屏可用性风险最高 |

### 已确认问题（按优先级）

1. **[P1] 首次访问价格页无法先看套餐价格。** 生产匿名访问 `/zh/pricing` 被引导到登录后的会员页，付费决策前没有可见价格比较。影响注册转化与交易知情度；浏览器证据见上文 2026-09-26 01:00 记录。建议先确定产品方案，再使价格可公开阅读或在登录前说明为什么需要登录。建议 `/impeccable clarify`。
2. **[P1] 登录/注册对话框的可访问名称错误，表单字段依赖 placeholder。** [AuthModal.js](../components/AuthModal.js#L862) 给 `role="dialog"` 的 `aria-label` 绑定 `copy.closeLabel`（多语言值是“Close/关闭”），读屏用户会听到“关闭”而不是对话框用途；邮箱、手机、验证码、密码控件主要靠 placeholder，没有关联可见 `<label>`/稳定 accessible name。弹窗有 `aria-modal` 和 Escape 关闭，这是正向实现，但不补救对话框名称和字段标签问题。建议设置 `aria-labelledby` 指向登录/注册标题，每个输入绑定标签；键盘与读屏实测后放行。
3. **[P1] Design Agent 会话列表使用鼠标专用交互。** [CreativeCanvas.jsx](../packages/Open-AI-Design-Agent/packages/design-agent/src/CreativeCanvas.jsx#L1094) 的会话行是带 `onClick` 的 `<div>`，没有 button/link 语义，也没有 `tabIndex` / 键盘处理；键盘用户无法打开会话。改成语义按钮/链接并验证 Enter/Space、焦点可见、删除/编辑子控件不冒泡。
4. **[P1] workflow-builder 类别编辑模态缺少对话框语义，字段标签未关联。** [NodeFlow.jsx](../packages/Vibe-Workflow/packages/workflow-builder/src/components/NodeFlow.jsx#L2849) 使用全屏遮罩与普通 `<div>`，片段未见 `role="dialog"`、`aria-modal`、标题关联或关闭/焦点管理；[输入标题](../packages/Vibe-Workflow/packages/workflow-builder/src/components/NodeFlow.jsx#L2855) 的 `<label>` 没有 `htmlFor`、输入也没有 `id`。这会让读屏用户难以识别/退出编辑流程；须补完整 Dialog 语义与焦点循环、Esc 关闭、标签关联。
5. **[P1：如果客户端进入首发路径；否则 P2] 公开宣传与实际可交互性不匹配。** [Vibe-Workflow 首页](../packages/Vibe-Workflow/client/app/page.js#L53) 的 “Watch Demo” 是没有 handler 的空按钮；同页 [“Trusted by over 10,000+ creative teams”](../packages/Vibe-Workflow/client/app/page.js#L90) 是无数据来源的硬编码证明文案。空按钮无法完成承诺动作，未证实的社会证明损害可信度。删除或接入真实演示动作；宣传数据须有可审计来源。
6. **[P1] 子应用中多处自定义交互没有键盘焦点指示。** 例：[Studio 模型筛选输入](../packages/studio/src/components/ImageStudio.jsx#L789)、[Agent 聊天输入](../packages/Open-Poe-AI/packages/agents/src/AiAgent.jsx#L1380)、[WorkflowBuilder 下拉触发器](../packages/Vibe-Workflow/packages/workflow-builder/src/components/RenderField.jsx#L134) 使用 `outline-none` 且该节点没有 `focus-visible` 替代，键盘用户无法定位当前控件。主站 AuthModal 的字段本身关闭了内层 ring，但外层容器有 `focus-within` 环样式；这个实现不直接判为缺陷，须浏览器核对焦点环可见度及输入焦点是否足够明确。为已确认缺失的子应用补 token 化焦点样式，跑 Tab / Shift+Tab 全链路。
7. **[P2] Design Agent 的聊天/画布输入也缺少焦点环。** [CreativeCanvas.jsx](../packages/Open-AI-Design-Agent/packages/design-agent/src/CreativeCanvas.jsx#L1600) 使用 `focus:outline-none`；搜索/文本输入需提供符合 `docs/UI_DESIGN_SYSTEM.md` 的 `focus-visible` 替代。
8. **[P2] Studio 搜索控件未采用系统 token。** [ImageStudio.jsx](../packages/studio/src/components/ImageStudio.jsx#L789) 使用 `text-xs text-white` 与无圆角、无具名高度的裸输入样式，偏离全站 token/字段组件契约；应单独迁移控件，不批量重设计页面。
9. **[P2] 页面级资源请求数随历史记录无界增长。** [Open-AI-Design-Agent 客户端](../packages/Open-AI-Design-Agent/client/app/page.js#L94) 先取会话列表，再对每个会话发一次资产请求并用 `Promise.all` 等全部完成。会话较多时产生 N+1 网络请求，延迟和失败概率上升；改为服务端批量接口、分页/懒加载资产，并限制并发。
10. **[P2] 动效没有显式减少动态效果替代。** 包内客户端包含持续打字光标/占位动画、`animate-bounce`、`animate-ping`；本轮扫描的 package 路径未见 `prefers-reduced-motion`。对前庭敏感和屏幕阅读用户增加运动噪声，需为自动动画提供静态状态并暂停非必要闪动。检测器的 26 条 warning 应作为清理候选，不宜一键删掉所有渐变或 bounce，先逐个判断是否表达状态。
11. **[P2] 七套 UI 并行使用不同的视觉 token 与品牌语言。** detector 在 Open-AI/Open-Poe/Vibe 与 Studio 发现渐变字、紫/蓝高饱和渐变、多个 `border-l-4`、弹跳动画；`packages/studio` 自己也有 Inter 等泛化提示。部分独立实验客户端明显采用蓝紫浅色/营销风，与主站冷黑/青色系统冲突；如果它们属于 KOYO 首发产品的一部分，应先确定哪些入口真实在售，再按 `UI_DESIGN_SYSTEM.md` 收敛，而不要把 detector warning 视为逐条硬性违规。
12. **[P2] 多数独立客户端的多视口与运行性能未得到证明。** 390×844 通过只说明主站 Image Studio 的默认空闲首屏没有明显溢出；不覆盖表单键盘、模型选择器、生成结果、抽屉和横向轨道。独立客户端也未运行；Open-AI、Open-Poe 的 heavy blur/noise 与图片墙及 workflow-builder 的大画布需在低端移动设备测量帧率/输入延迟。

### 误报、正向证据与未验证边界

- detector 命中 `font-family: Arial` 被归为“过度使用字体”，但它是通用 fallback，不能单独作为缺陷。渐变、紫色、bounce、粗侧边框等命中大多是审美风险或动效偏好，不是自动 WCAG 违规。
- `AuthModal` 有 `role="dialog"`、`aria-modal="true"`、Escape 关闭与可见关闭按钮；输入外层有 `focus-within` 环样式；KOYO 主设计系统有色彩对比实测、token 守卫、10 档响应式与视觉回归制度。以上应保留，但需要确认这些机制覆盖实际动态状态。
- 唯一动态窄屏抽查为生产 Image Studio 390×844 默认态；所有独立客户端、Studio 生成结果/键盘/模态、读屏、放大文本、减少动态效果、触控最小区域与性能指标均 **UNVERIFIED**。历史 `docs/UI_AUDIT.md` 日期为 2026-09-16，属于旧快照；不得将其 255 文件或 41 路由统计直接视作当前完整覆盖。

### 修复顺序建议

1. **P1 首发阻塞：**公开价格可见性/说明；认证 Dialog accessible name 与字段标签；确实进入首发的页面全键盘可达；移除或落实空按钮与无来源营销数字；对 NodeFlow 类别编辑流程补全 Dialog/焦点管理。
2. **P2 首发前：**统一焦点环与表单 token；解决会话列表 N+1 请求；给所有自动动画增加减少动态效果模式；选定并收敛首发范围内页面的主题体系。
3. **P2 验收：**对所有实际首发路由逐个跑桌面、平板、375/390/430px，并覆盖登录键盘、选择器、错误/加载/结果/下载和长文本；所有按钮/链接/输入均可见可达、无遮挡；记录浏览器、辅助技术和性能数据。
4. **P3 后续：**逐条评审 detector 风格 warning，优先处理形成视觉分裂的组合；通过实际首发范围和新的 detector 基线，不要为清零分数无差别删除视觉元素。

此 UI 审计没有改动产品页面/组件或设计 token。即使上述 UI P1 修完，总体用户开放结论仍受前文生产版本、可购买支付渠道、真实生成/账本闭环和备份恢复门槛约束，继续为 **NOT_READY**。


## 2026-09-26 01:20（台北时间）生产只读 SSH 身份复核

- 当前出口仍为 `192.168.3.14`；SSH agent 没有加载身份。磁盘上存在本机 ED25519 公钥，但通过直连、清除 HTTP 代理、绑定当前内网地址并禁用密码/交互认证后，`ubuntu@43.155.166.90` 仍返回 `Permission denied (publickey,password,keyboard-interactive)`。连接在认证阶段结束，没有执行远端命令。
- 未读取或显示私钥内容，也没有尝试密码登录。生产运行 commit、`BUILD_ID`、脏工作树、迁移 ledger、日志、worker、数据存储、邮件/provider 配置和备份恢复依然 **UNVERIFIED**。服务器来源核验与后续任何候选变更仍受此只读访问门槛阻塞；没有进行本地产品源码变更或部署。


## 2026-09-26 01:36（台北时间）生产公开目录、政策页与来源门禁复核

- 使用系统 `/usr/bin/curl` 并通过 `--noproxy '*'` 直连重查 `/api/live`、`/api/ready`、`/api/health`、`/api/billing/plans`、`/api/billing/credit-packs`，均为 HTTP 200。ready/health 只含数据库和迁移状态，没有 worker、存储、邮件或 provider 依赖字段。公开套餐目录为 5 项（免费加 4 项付费方案），算力包 7 项；Alipay `configured/enabled/status=active`，credit-packs 的 Alipay `enabled=true`，Stripe 与微信关闭。没有提交订单或写入数据。
- 匿名 `/zh/pricing` 页面此前浏览器检查仍转到登录后的会员工作台，因此应区分“API 可取得价格”与“普通访客可从价格页直接比较套餐”：前者已证实，后者未达成。
- 只读 GET `/terms`、`/privacy`、`/refund`、`/content-policy` 全部返回 200，服务端标题和首个 H1 均为简体中文。AuthModal 指向的 `/terms` 与 `/privacy` 能打开；直测 `/zh/terms`、`/zh/privacy` 为 404，但当前认证表单不使用这两个带 locale 的路径。法律政策入口存在且中文内容可用。
- 重新检查 SSH agent 和公钥直连：agent 没有身份，公钥认证仍被拒绝；没有输入密码或执行远端命令。当前服务器源码版本、`BUILD_ID`、迁移账本、服务/worker 配置仍 **UNVERIFIED**。没有发现可用的专用 SSH/SFTP 工具。本地工作树仍含既有大量脏状态，不进行生产源同步前不编辑或发布产品代码。


## 2026-09-26 01:37（台北时间）生产公开模型目录只读抽样

- 直连 GET `/api/models/active` 返回 HTTP 200 / `success=true`，公开 active 列表有 **69 个唯一模型**：MuAPI 47、Kling 11、MiniMax 6、Google 5。此接口字段只有模型 ID/名称/类型/供应商/积分定价等目录信息，不包含模型调用、路由凭据或 provider readiness 结果；因此只能证明目录响应存在，不能证明这 69 个模型实际可生成或报价准确。
- 此结果与本地候选 readiness/route 逻辑不能互相替代；生产 canonical 全量清单、每个模型可达渠道和近期成功调用仍未核验。总体开放状态继续 **NOT_READY**。


## 2026-09-26 01:41（台北时间）独立 In-app Browser 价格路径复验

- 在新开的隔离 Codex In-app Browser 访问 `https://www.koyosim.com/pricing`，最终 URL 为 `/studio?account=open&tab=membership`。未登录视图显示“请先登录”的管理账户浮层与“立即登录/注册”“继续留在工作台”按钮，页面没有套餐比较表；studio 图片生成页本身也仍可展示“生成”按钮。没有点击登录、生成、购买或消费按钮。
- 新页面可访问树显示首页公告包含会员折扣和图像/视频单次价格的营销信息，链接指向 `/pricing`；上一轮 API GET 证实价格目录可读取，但具体促销计算、适用条件与真实模型成本没有验证。用户会先看到促销价格承诺，却无法从该页面查看完整套餐条件，须在付费开放前对齐公告与公开价格页。
- 浏览器路径重新证实“价格目录 API 有数据”不等于“访客可在 UI 审阅完整价格”。账号浮层和工作台首屏可见，但没有登录状态、余额真实性、模型选择/报价或生成终态证据；这些路径仍 **UNVERIFIED**。


## 2026-09-26 01:45（台北时间）17 个工作室路由与匿名首屏抽查

- 直连 GET 当前列出的 17 个 `/zh/studio/*` 核心工作室地址（image、headshot、layers、design-agent、ai-influencer、apps、video、cinema、clipping、motion-control、vibe-motion、lipsync、body-swap、marketing、workflows、agents、audio）全部返回 HTTP 200。该结果只证实路由响应存在，不等于页面 hydration、依赖查询、模型路由或生成任务可用。
- 新 In-app Browser 的匿名无凭据 AX 页面检查：图像工作室显示 NANO BANANA 与可见“生成”；视频工作室显示 SEEDANCE 1.0 LITE、T2V、16:9、5s、480p 与“生成”；音频工作室显示 Suno Create Music 参数、多个英文模型说明以及“生成音轨”；这三种生成入口在未登录状态可见，但未点击或测试其 login/credit/auth gate。
- `/zh/studio/agents` 出现中文“智能体”页标题，但内容显示“加载失败。”并提供“重试”，没有在错误区直接提示登录；这是匿名新用户误以为服务故障的 **P1 候选**，需用受控已登录测试账号分辨是登录态缺失还是匿名 API 真故障。`/zh/studio/workflows` 在中文路由显示 Workflows / CREATE WORKFLOW / TEMPLATES / MY WORKFLOWS / COMMUNITY 英文控件，当前未观察到模板或工作流内容，为 **P2 本地化/空态问题**。
- `/zh/studio/design-agent` 实际呈现独立英文 CREATIVE AGENT 页面，显示 `No previous sessions`、`New Session $0.00` 和可输入聊天区，没有主工作台导航/登录区；没有发送消息，也不能据此断定会话免费、可持久保存或能调用工具。其首发边界与登录/额度策略 **UNVERIFIED**。
- 新开临时 IAB 页面用于以上只读查看，没有登录、发验证码、选模型、上传、生成、充值或付款。匿名页面里可见 Generate 按钮不算生成验证；授权、报价、任务终态、扣账/退款仍为 **UNVERIFIED**。总体放行结论保持 **NOT_READY**。


## 2026-09-26 02:59（台北时间）线上公开 API 复查

- 直连 `www.koyosim.com` 重新 GET `/api/live`、`/api/ready`、`/api/health`、`/api/billing/plans`、`/api/billing/credit-packs` 与 `/api/models/active`。前三者 HTTP 200；ready/health 仍只证明 DB 与 migration 为 true，没有 worker/storage/email/provider readiness。
- 套餐 API 5 项（免费 1、付费 4），支付宝仍 configured/enabled/active，Stripe 关闭且 test-only，微信不可用/关闭；算力包 API 7 项，支付宝 enabled。未创建 checkout/订单。
- 当前 active 模型 API 仍为 69 个唯一 ID（MuAPI 47、Kling 11、MiniMax 6、Google 5）。该列表只证明公共 catalog 返回成功，不是调用、报价、provider 成功率或实际终态证据。
- 自 01:34 核验起，公开目录状态没有观察到变化；普通注册、付费及生成路径均未执行。生产来源 SSH 仍仅公钥失败，服务运行版本/迁移账本/worker/存储/邮件/provider 与真实 backup restore 继续 **UNVERIFIED**。总体开放结论 **NOT_READY**。


## 2026-09-26 03:01（台北时间）登录与注册直达路由检查

- 独立 IAB 只读访问 `/zh/login` 最终到 `/studio?account=open`：页面是英文导航的 Studio Shell，覆盖中文“请先登录”账户浮层；浮层说明需登录后查看个人中心/积分流水，并给出“立即登录/注册”与“继续留在工作台”。尚未打开 AuthModal 表单、没有填写字段或提交。此路由未保持用户请求的中文页面上下文，记为 **P2 locale/入口一致性缺陷**。
- 直接访问 `/zh/register` 渲染 404“这个地址没有对应的页面”，只有“进入工作台/返回首页”链接。若外部广告、帮助文档或用户分享链接使用该直达路径，会中断注册；当前注册看来依赖先进入工作台再打开 AuthModal。**P2**：首发前确定注册主入口，并保证分享/深链到达可用流程。没有尝试 `/register` 的其他状态，也没有提交数据。
- 以上只覆盖未登录公开入口；验证码发送、密码/第三方登录、条款确认均由用户控制，本轮未执行。


## 2026-09-26 03:02（台北时间）目标恢复后的来源门禁复验

- 重读持续目标文件后重新核对当前工作树：仍在 `main`；既有 `packages/studio/src/components/ImageStudio.jsx` 修改、未跟踪 `components/AuthModal.js` 及评估报告均保留。没有重置、清理或改写产品源码。
- 新一轮 BatchMode/公钥专用 SSH 连接仍返回 `Permission denied`；agent 无身份，连接认证失败后未执行远端命令。该轮 `/api/live`、`/api/ready`、`/api/health` 仍为 HTTP 200，套餐/算力包/模型目录状态与 02:59 一致。
- 本轮继续补充 `/zh/login` 与 `/zh/register` 可见路由审计，并修订提示词 H，把生产来源核验设为任何后续 UI 源码改动的第一步。问题未解决前，不把本地源码当生产版本，也不部署。


## 2026-09-26 03:05（台北时间）支付与模型目录复查

- 直连 GET `/api/ready` 返回 HTTP 200，`database.ok=true`、`migrations.ok=true`，`checkedAt=2026-09-25T19:05:28.989Z`（台北 03:05）。套餐 5 项、算力包 7 项，支付宝在两个公开目录都保持 enabled/active；模型 active API 返回 `success=true`、69 项。
- 此次只读核对没有发生 checkout、订单、模型调用或数据写入。公开状态与 02:59 一致；readiness 仍未展示 worker、对象存储、邮件或 provider 结果。
- 生产公钥认证同轮仍失败；远端源码同步、实际配置和真实用户/模型/支付链路仍待授权访问后验证。总体仍 **NOT_READY**。


## 2026-09-26 03:07（台北时间）显式 Wi-Fi 网卡直连复核

- 通过 `networksetup` 与路由表核实 Wi-Fi 当前为 `en0` / `192.168.3.14`，局域网网关 `192.168.3.1` 也由 `en0` 直连。普通路由表里到服务器的默认路径此前显示 `utun4`，因此这次显式以 `ssh -B en0` 绑定 Wi-Fi 网卡、清除代理变量，并只允许本机现有 ED25519 公钥认证。
- SSH 服务端已可经 Wi-Fi 物理接口完成连接握手，但拒绝现有公钥：`Permission denied (publickey,password,keyboard-interactive)`。未尝试口令/交互认证、未执行远端命令；这区分了网络路径问题与服务器身份授权问题，直连路径已验证可达，授权仍未解决。
- 因未获生产只读身份，无法完成服务器源码/脏工作树盘点与备份，也就不能安全开始产品代码修改或部署。请由服务器管理员把该工作站公钥加入经批准的只读/受限账号（或提供等效的授权只读访问通道）；取得访问后先执行来源核验与备份，再继续开发。用户开放状态保持 **NOT_READY**。


## 2026-09-26 03:54（台北时间）目标恢复后的公开就绪状态复查

- 重读目标文件，并检查当前 `main` 工作区；既有产品文件改动与未跟踪文件均保留，没有清理或改写。SSH agent 仍无已加载身份，`.ssh/config` 不存在，本机只有此前被服务器拒绝的 ED25519 keypair；没有新的授权身份或只读连接器。
- 清除本机代理变量后只读 GET `/api/live`、`/api/ready`、`/api/health`、`/api/billing/plans`、`/api/billing/credit-packs`、`/api/models/active`：分别返回 live、ready、healthy、HTTP 200、HTTP 200、HTTP 200。ready/health 内容只报数据库与 migrations 为 true；没有 worker、对象存储、邮件/验证码投递与生成 provider 的端到端状态。
- 按真实返回结构 `plans`、`packs`、`providers` 复核：套餐 5 项，算力包 7 项；套餐 provider 状态为支付宝 configured/enabled/active，Stripe 未配置/关闭/test，微信未配置/关闭/unavailable；算力包目录支付宝 enabled、微信 disabled。此为公开目录状态，不是 checkout、收款或到账测试，没有创建订单或写入。
- Active models API 返回 `success=true`、69 项；仍只代表目录可读，不证明报价、供应商调用、worker 终态、存储或积分账本。
- 生产 SSH 公钥身份仍未获授权；上述公开检查不能替代服务器源码核验与完整工作树备份。因此不编辑候选产品源码、不部署，真实新用户闭环继续 **UNVERIFIED**，开放结论仍 **NOT_READY**。


## 2026-09-26 03:56（台北时间）服务器 SSH 公钥核对信息

- 重读持续目标并检查当前 SSH 身份后，确认本机公钥为 ED25519、256 bit，SHA-256 指纹为 `SHA256:fWyeeWLLBw3+6yI9o+B15LfMaZVwxPgrwj743AbO4Mc`。此前使用 `ssh -B en0` 直连时服务端拒绝该身份。
- 管理员若需授权，请核对并加入本机 `/Users/seelucency/.ssh/id_ed25519.pub` 对应的公钥到批准的只读/受限 SSH 账号。这里只公开指纹用于校验，没有读取/输出私钥，也未使用口令。授权完成后再做服务器来源清点与备份。


## 2026-09-26 03:57（台北时间）本地候选发布门禁复验

- 重读目标文件后，仅在当前本地候选工作树运行静态门禁：`npm run release:check` 退出码 0（检查 899 个源文件）；`npm run lint:routes` 退出码 0，路由映射报告 pass，但仍显示 `api-mutation-without-rate-limit=11`、`raw-unprefixed-href=94`、`locale-zh-branch-outside-onboarding=3` 等计数，需按规则分类，不能把 route-map pass 解读为这些项目都已修复。
- `npm run security:secrets` 退出码 0。实现明确跳过 `tests/` 与 `.env*`，并排除 `.env.example`、`package-lock.json`；因此通过仅表示它实际扫描范围没有触发规则。secret scanner 没有验证运行时 secret store、生产变量或被排除文件，也不推翻此前对特定遗留脚本风险的观察。
- 同轮继续运行 `npm run format:check`、`npm run lint`、`npm run test:i18n`，均退出码 0。ESLint 无告警/错误，但 Next 提示 `next lint` 已弃用；六种 locale 的结构检查通过，仍有英文回退：zh-CN 4、ja-JP 12、ko-KR 10、zh-TW 4、es 17 条（en 0）。
- 五项命令均为本地候选证据；当前工作树有大量既有改动，生产 HEAD/BUILD_ID 未知，尚未按服务器工作树备份和同步。因此它们不能替代生产来源核验，也不足以宣告 CI、凭据卫生或用户开放放行条件完成。未运行构建、数据库或业务写入测试，未改产品代码。


## 2026-09-26 04:00（台北时间）当前本地工作区保全清点

- 只读取 Git 状态元数据（没有打开候选文件内容）：本地 `main` 有 535 个状态项，分布为 141 个 unstaged modified、354 个 untracked、38 个 staged added、2 个 staged-added 且工作区继续修改。前 18 个顶层目录中 `packages` 133 项、`scripts` 112 项、`app` 79 项、`lib` 54 项、`components` 52 项，说明不能将当前目录当作干净检出直接构建或覆盖。
- 三个 gitlink 的记录 SHA 分别为 `ebc0ce7`、`3e21ebc`、`c65ce89`；`git submodule status --recursive` 的前缀为 `-`。各子模块路径的内部 Git 仓库当前可读，分别有 37、47、64 个内部状态项；需在授权后的源同步/保全流程里分别保存，不能只记录父仓库 gitlink。
- 按路径名、不读文件内容统计：0 个 `.env*` 命名路径、0 个 `.pem/.key/.p12/.pfx/.jks` 扩展名路径、8 个 basename 含 `secret/token/credential`、33 个 basename 含 `backup/dump/.bak`。这些是命名线索而非泄露判定；路径和内容在服务器基线快照前均不得清理或覆盖。
- 这是本地候选的保全 inventory，不能证明与生产版本一致。下一步仍是先由管理员授权公钥/只读通道，然后对线上完整脏工作树及三个子模块做快照和双向差异核验。


## 2026-09-26 04:05（台北时间）隔离构建风险核查

- 检查本地 `scripts/build-safe.mjs` 的实现：它会递归删除 `.next-build`、可能删除旧 `.next-old`，移动现有 `.next` 并在构建后删除旧构建，还会把静态文件归档到 `data/static_archive` 并删除归档中超过 14 天的文件。因此脚本实际执行的是构建目录切换与归档清理流程，不是纯验证。
- 当前 `.next-build/`、`data/static_archive/` 与脚本本身均为未跟踪状态；现有 `.next` 是 2026-09-26 00:35 的本地目录。未运行该脚本，也没有清理、覆盖这些产物。
- `next.config.mjs` 支持 `NEXT_DIST_DIR` 独立输出目录；当前进程中 `TEST_DATABASE_URL`、`DATABASE_URL` 均未设置，`.env*` 文件不存在。后续执行了单独隔离构建，详见下一节；数据库集成测试仍未运行，需先有明确隔离测试数据库并完成服务器来源备份。


## 2026-09-26 04:06（台北时间）隔离 Next.js 构建结果

- 在全新 `NEXT_DIST_DIR=.next-audit-20260926-0420` 下运行 `npm run build`，进程退出码 0。Next.js 15.5.26 编译成功，TypeScript 校验完成，生成静态页面 110/110，完成优化与构建追踪；构建 ID 为 `jdfI3dodtZY83Z2SXQRjm`。这是本地候选构建 ID，绝非生产 ID。
- 构建日志有 next-intl 的动态 import 依赖缓存解析警告；Next 构建阶段注明跳过 lint，本地 lint 已在上一节单独通过。成功构建不替代真实 DB/provider/storage/email/支付或用户闭环测试。
- 核对目录时间：既有 `.next` 仍为 `2026-09-26 00:35:20`，`.next-build` 与 `data/static_archive` 时间也未改变；本次新输出仅出现在 `.next-audit-20260926-0420/`。该构建目录保留以供复核，未清理或覆盖现有构建/归档。


## 2026-09-26 04:12（台北时间）后台导航测试与全量测试隔离复核

- 按原计划单独运行 `node --test --experimental-loader ./scripts/server-only-loader.mjs tests/admin/navigation-and-tabs.test.mjs`，退出码 0，4/4 通过。该结果说明之前记录的导航测试失败当前可单测复现为通过；不代表整套测试通过。
- 静态核对 `test:all:isolated`：收集器只排除 `tests/e2e` 和 `node_modules`，会直接启动 `tests/db/*.mjs`；其中 8 个文件含 PostgreSQL/SQL/数据库 URL 调用，runner 本身不创建隔离数据库，也不调用 `requireIsolatedTestDatabase`。这 8 个文件含 `TEST_DATABASE_URL` skip 门槛：当前变量和 `.env.local` 缺失时本轮观察到它们被跳过；若未来 `.env.local` 或环境中提供 DB URL，完整 suite 会把这些测试直接交给 Node 运行，绕过独立 runner 的 URL 核验与随机数据库生命周期。
- 独立 `test:db` 调用 `run-isolated-pg-tests.mjs`，要求显式 `TEST_DATABASE_URL`、检查与 `DATABASE_URL` 的隔离属性、创建随机数据库、应用迁移、串行运行后删除随机库。当前两个 DB 环境变量均缺失，故未运行 `test:db`。
- 本轮完整 suite 使用 `env -u DATABASE_URL -u TEST_DATABASE_URL npm run test:all:isolated`，在 `tests/p0/security-baseline.test.mjs` 以退出码 1 停止，文件结果 20 passed / 1 failed。失败位于 `authorizeScopedProxyPath(...).allow` 断言；定点调用复现 `POST /update-name/w1` 与 `DELETE /delete-workflow-def/w1` 返回 allow=true，而 `tests/p0/security-baseline.test.mjs` 期望拒绝。停止于此代表后续测试文件没有执行。
- 单独复跑计划中提到的 `tests/admin/navigation-and-tabs.test.mjs` 仍为 4/4 通过。建议修复测试编排后，DB 测试只经 `test:db` 包装器运行；不能把当前 suite 的前段通过或自动跳过视为完整 CI 通过。


## 2026-09-26 04:41（台北时间）用户要求优先部署未上线改动：安全门禁阻断

- 用户明确要求优先部署未上线改动。按既有生产唯一来源与先备份规则，重新检查了本地工作区状态与部署入口；本地 Git 状态目前为 536 项，包含大量产品文件修改/新增及此前保留的构建产物、归档和子模块脏状态。本地 HEAD/构建产物不能证明对应生产源码，因此不能把当前工作树打成部署包直接覆盖线上。
- 本轮生产连接仍只有先前的物理网卡直连 ED25519 公钥认证尝试，服务端拒绝该身份；没有口令或交互登录，也没有执行远端命令。故无法先取得生产工作树/子模块/服务和版本状态，亦无法做用户要求的完整服务器备份与差异核验。
- 只读审阅 `scripts/deploy.sh` 与 `scripts/remote-deploy.sh`：本地脚本会直接将当前 `.next` 和 `app/components/lib/messages/packages/studio/scripts/public` 等目录整体打包上传，没有干净发布源、版本匹配或发布门禁；脚本还含硬编码 SSH 凭据回退（此处不记录值）。远端脚本会先把源码 tar 解压到生产目录，再切换 `.next`、重启服务和 worker；会删除旧暂存目录及既有 `.next-previous`，没有发现完整生产工作树备份/漂移检查，也没有受控回滚完整源码树的步骤。此流程可能覆盖服务器已有脏改动，不能执行。
- `scripts/deploy-safe.mjs` 虽使用预构建 artifact 并做若干 HTTP 探测，但它会先删除 `.next-previous` 再切换构建，且只备份 `.next` 目录；没有先对生产源码/完整脏工作区做备份或 SERVER→LOCAL 对账。它不能满足当前部署前置条件，且其 HTTP 探测不等同于迁移、worker、存储、邮件、支付或真实生成验收。
- 因此，本次“强制部署”请求已经触发部署入口审查，但未执行任何上传、源码覆盖、服务重启或数据库操作。阻断原因是生产认证未授权，且现有自动部署脚本不具备要求的生产源码备份/漂移保护。继续强推会覆盖无法盘点的生产改动，违反项目发布规则。
- 恢复条件：管理员先给本机公钥授权到受限生产只读账号或提供等效只读通道；完成生产完整工作区及子模块快照和双向差异确认；再从明确批准的提交/构建产物制作非删除式发布包，加入全量备份、发布门禁、回滚方案与部署后业务验收。部署账号另需最小化的发布权限。无需提供口令给 agent。


## 2026-09-26 16:55（台北时间）重新审理：最快让真实用户使用

### 结论

**现在不应直接开放新用户注册、生成或付费。** 最新只读线上证据显示服务进程在跑，但 readiness 不通过；数据库迁移检查有 4 项待应用、1 项校验和漂移。模型、套餐接口返回成功，只证明目录可读，不证明生成/支付闭环。更快的安全路线是先把“生产迁移一致性与运行依赖”收敛，再开一个免费、小范围、单模型内测；当前若要立即对外，只能开放产品介绍/申请体验入口，不能承诺可创作服务。

### 本轮生产事实

- 已按用户要求从物理 Wi-Fi 网卡 `en0` 使用密码认证连接生产，登录用户为 `ubuntu`；服务端 `sudo -n` 可用。生产根目录 `/home/wwwroot/AI/domain/koyosim.com/web`，HEAD `871c1d4`，Node `v22.22.2`、npm `10.9.7`，`koyosim.service` 和 `koyosim-worker.service` 均 active，生产 `.next/BUILD_ID` 为 `kVWXkViZNPCI3jaU-baY4`。
- 生产 Git 状态有 19,764 项：140 个 tracked 文件改动、19,624 个未跟踪路径。三条 submodule gitlink 均匹配父仓库记录 SHA；这些生产改动不能被当前本地工作区整体覆盖。
- 部署前的 Web 工作树归档已在服务器创建并验证：`/home/ubuntu/koyosim-web-predeploy-20260926.tar.gz`，884 MB、权限 `600`、可完整列举，SHA-256 为 `e0905d8d8929c294af0c51841d12a641bcbc97fb382b34c68cf96bcdea609f22`；排除可重装的 `node_modules`。这是 Web 文件备份，不等于 PostgreSQL 数据库备份，也未做恢复演练。
- 对齐 HEAD 后，只比较部署相关源码/配置/文档哈希（排除 Git 元数据、node_modules、Next 构建目录、备份/数据/上传、测试与非 Studio 子模块）：本地候选 1,102 个路径、生产 1,282 个路径；本地独有 21 个，生产独有 201 个，同路径内容不同 109 个。生产 140 个 tracked 改动都与本地 tracked 改动重叠；其中 109 个源码文件内容不同。生产另有一份 `packages/studio/studio` 树。直接打包当前本地工作区会覆盖线上版本不同的认证、积分、支付、生成、资产、健康检查等代码。
- 线上直连只读 GET：`/api/live` 200；`/api/ready` 503、`/api/health` 503。readiness 字段为 DB healthy、migrations unhealthy、worker unknown、storage healthy、email healthy、providers unknown。服务端只读执行 `scripts/db-status.mjs`：数据库连接正常，已应用 45 项，pending 为 `031_zz_byteplus_model_catalog_prerequisite`、`035_zz_admin_notes_legacy_shape_compat`、`041_worker_heartbeat`、`043_backfill_mapping_provider_endpoint`，drift 为 `040_model_pricing_routing_control_tower`。
- `040` 的已应用校验和与当前生产文件、共同 HEAD、当前本地未跟踪文件都不匹配；在当前生产工作树的 52 个 SQL 文件及该迁移 Git 历史中没有找到匹配版本。不能重写数据库账本校验和，也不能盲跑剩余迁移；需先从可信历史/备份找回确切已应用 SQL，或通过正式迁移修复方案在生产同版本隔离副本演练。
- 线上模型 active API 返回 959 项、套餐 5 项、算力包 7 项；支付宝在公开目录为 active，Stripe/微信不可用。没有创建订单、付款、调用生成或更改用户/积分数据。959 是目录数量，不是通过终态验收的可用模型数。
- `/zh/register` 与 `/zh/studio/image` 的物理网卡直连 curl（含浏览器 User-Agent）均返回 403/138 bytes；这可能是边缘防护或请求策略，未用真实浏览器登录，不能据此认定所有访客都被拒绝。生产注册源码依赖 `maintenance_mode` 与全局 `registration_enabled` 设置及邮箱验证码；本轮没有发现 invite code/邮箱白名单实现，当前数据库设置值也未读取。

### 最快可执行路线

1. **现在：保持公开注册/付款/推广不扩张。** 如需今天就让用户“看到产品”，只开放介绍与申请体验入口，并明确生成暂未开放；不要把模型目录或 readiness 503 宣传成可用闭环。
2. **先恢复迁移一致性：** 数据库单独做一致性备份并验证可读；找回 040 的确切已应用源文件；确认 031/035/041/043 的前置关系和幂等性；在生产同版本隔离数据库还原演练，再按 reviewed 的迁移批次处理。验收 pending=0、drift=0，ready/health 连续为 200，worker/provider 不再 unknown。未找回 040 原文件前不改应用中的 checksum 记录。
3. **发布候选必须从生产来源重建：** 从已备份的生产树建立只读基线，逐文件合并本地候选，不覆盖 109 个冲突；审查 201 个生产独有文件和子模块状态。修复当前本地全量测试中的 P0 scoped-proxy 失败，数据库测试只用隔离 runner；通过干净检出 CI、构建及真实浏览器验收，再部署并核对构建 ID、日志和回滚点。
4. **最小真实内测：** 先添加/验证邀请白名单（当前只有全局注册开关），暂只开放 1 个通过实测的图像模型、免费且有限额度；新测试账号经真实邮箱验证码注册后走完报价、生成终态、worker、存储、历史下载与积分账本；验证失败/重试不重复扣点和用户隔离。完成后再邀请少量真实用户。不要开放 959 个目录项或任何未经实测的付费渠道。
5. **公开付费稍后：** 至少一个模型完成稳定生成闭环；Alipay 完成沙盒/受控下单、回调、重复回调、查单、到账、退款与对账；备份恢复演练和值班告警通过后再灰度开放。

### 本轮操作边界

只执行生产只读探测、迁移状态查询、源码/文件哈希盘点和 Web 归档；没有运行迁移、部署脚本、源码上传、服务重启、注册、真实生成、支付或用户数据写入。此前 04:41 记录的“SSH 未授权、无法备份”已被本轮密码认证和备份结果取代；该历史记录保留作为审计时间线，不再代表当前连接状态。


## 2026-09-26 17:05（台北时间）040 漂移来源追查补充

- 只读扫描服务器工作树中的 52 个 SQL 文件未找到与数据库已应用校验和相符的 `040_model_pricing_routing_control_tower.sql` 版本；只读扫描服务器 `/home/ubuntu` 与 `/home/wwwroot/AI/domain` 下 103 个可识别压缩归档后，仅找到一份该迁移副本，仍不匹配数据库校验和。生产 Git 对该迁移路径没有可遍历历史版本。
- 这意味着当前不能通过“恢复 HEAD 文件”或从现有项目包复原已应用定义来解除 drift。下一步须查找独立的旧服务器/发布介质或数据库备份元数据；如果都不存在，应由 DB/迁移负责人编写新的、向前兼容修复迁移，在生产同版本隔离副本上验证后再实施。禁止手工改 ledger checksum 或用 `migrate.mjs` 盲跑。
- 再审结论维持：目前最快的真实可用路线仍是先解决 migration drift/pending 和 worker/provider unknown，再发布受控候选，随后做一个模型、免费额度的邀请内测。生产源码冲突、ready 503 和终态业务链路缺证，使当前工作区整包强推无法缩短安全上线时间。


## 2026-09-26 17:35（台北时间）逐步修复：代理隔离与真实首用入口复核

- 再次物理网卡直连探测生产：`/api/live` 为 200；`/api/ready` 和 `/api/health` 仍为 503，数据库连接为 true、migration 检查为 false，worker、email、provider 均 unknown。`/api/models/active` 可返回目录，但仍不是模型终态验证。HTTP 响应的 `checkedAt` 约为 09:26 UTC。
- 命令行直连 `/zh/register` 与 `/zh/studio/image` 收到 Nginx 403；随后在新建的浏览器审计页内，`/zh/studio` 与 `/zh/studio/image` 均成功渲染。因此 403 是当前 curl/边缘请求路径的结果，不能作为所有真实浏览器用户均被挡住的证据。浏览器 `/zh/register` 是站内 404 页面；从工作台打开登录框后可以切换到邮箱注册表单。没有发验证码、创建账号、接受条款或继续进入生成，因此注册和生成终态仍 UNVERIFIED。
- 首用体验现存具体问题：直接分享 `/zh/register` 会落入本地化兜底 404；工作台未登录状态仍显示默认 Nano Banana 生成器，但“生成”链路没有验证，也没有证据说明访客能得到结果。首页/工作台入口可打开，不能据此宣称新用户能创作。
- 已在本地候选树修改 `lib/security/legacyProxyPolicy.js` 默认拒绝无本地归属校验的 MuAPI 资源代理：关闭 Agent 详情深层读取、全局 Agent 更新/删除、工作流定义详情读取、工作流运行状态/结果轮询，以及工作流改名/改分类/发布/模板和删除；在 `tests/p0/security-baseline.test.mjs` 补充覆盖工作流分类、发布和模板写路径。原因是这些共享凭据代理没有本地资源所有权绑定，任意 ID 可能跨用户访问/修改。
- 验证结果：P0 安全基线选择运行 17/17 通过；同文件完整运行 19/21，剩余 2 个既有 P1 架构边界断言失败，分别涉及 9 个后台页面/API 仍绕过应用服务层、`concurrencyControl.js` 出现基线外 SQL。`git diff --check` 检查目标文件通过；这两个目标文件在当前本地 Git 中为既有未跟踪文件，因此没有 HEAD 版本可作为完整基线差异。
- 这次收紧意味着 MuAPI 共享账户下未经本地归属校验的 Agent/Workflow 读取与管理路径会返回拒绝；在设计安全的用户级资源所有权和计费路径之前，不应为“快速可用”重新放开。改动仅在本地候选工作区，未部署。
- Impeccable 命令行 `audit` 子命令在本机捆绑版本中返回 `Unknown command: audit`；未生成自动审计分数。现有项目规范与在线浏览器检查可用于指出可验证问题，但不冒称该自动审计已通过。根工作区及 Studio/子应用产品上下文文件仍缺失，UI 技术审计需要等工具版本/目标上下文恢复后补做。
- 本次无数据库写入、迁移、部署、服务重启、验证码发送、注册、模型调用、付款或资产创建；生产 040 drift 及 4 个 pending 的安全解法仍未完成。


## 2026-09-26 17:40（台北时间）地区访问策略证据补充

- 从当前已登录的生产工作台只读观察到站内提示“中国大陆 IP 拦截已开启，境内普通访客已被阻断”；页面对管理员显示特权通行。未记录或复用账号标识。
- 本地代码对应的 `ChinaIpGate` 在开启时对中国大陆普通访客返回 403；管理员与白名单可通过，非大陆访客可继续访问。命令行探测的 Nginx 风格 403 与该策略相符。结合外部浏览器能进入工作台，当前可以确定的是目标用户区域会决定其是否可访问；具体用户 IP 判定仍取决于线上代理头与配置。
- 不自动关闭门禁或扩展白名单：那会改变站点面向中国大陆访客的访问与合规策略。已询问首批用户区域；回复前继续处理不依赖该选择的本地安全与首用问题。


## 2026-09-26 17:43（台北时间）注册表单辅助名称与门禁复验

- 只修改本地候选 `components/AuthModal.js`：为手机号、短信验证码、邮箱、注册邮箱验证码及密码输入项增加与现有提示文案一致的 `aria-label`；没有改占位文案、外观、注册请求或条款流程。找回密码表单原有可访问名称，保持不变。
- 本地复验：`npm run lint` 通过且无 ESLint 告警；`npm run release:check` 通过（929 个源文件）；P0 安全基线筛选运行 17/17 通过。完整安全基线仍为 19/21，两个 P1 失败见 17:35 条目。
- 项目文档引用 `npm run lint:ui`，但当前主项目 `package.json` 没有此脚本；尝试运行收到 “Missing script”。这是工具链/规范漂移，当前不能将其报告为视觉守卫通过。Impeccable 自带 `audit` 子命令同样不被现有捆绑 CLI 识别。
- 本轮修复均在本地候选树，生产浏览器/源码/数据库没有改动；没有做本地构建或自动读屏复测，因此 `aria-label` 的源代码已核对、运行时 AX 复核仍待候选部署/预览环境。
