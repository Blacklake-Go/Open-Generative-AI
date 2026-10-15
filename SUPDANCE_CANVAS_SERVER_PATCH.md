# SupDance Canvas 服务端补丁状态

> **历史快照提示（2026-10-09 更新）：**下文生产数据记录的是 2026-09-30 快照，不能视为当前事实。`KOYOSIM_CANVAS_SERVER_PATCH.patch` 对当前本地主站工作树执行 `git apply --check` 未通过；本轮未应用。重新核对精确基线前，不要把它当作可直接应用的候选，也不要据此推断生产兼容性。

状态：**历史隔离候选，未部署。** 下方“生产源码、数据库与服务没有被修改”等记录仅描述文档对应的历史核验时点；当前生产环境与补丁基线需重新验证后才能得出结论。

补丁文件：[KOYOSIM_CANVAS_SERVER_PATCH.patch](./KOYOSIM_CANVAS_SERVER_PATCH.patch)

## 当前线上快照

- SupDance Web 根目录：`/home/wwwroot/AI/domain/supdance.com/web`；SSH key alias `supdance-prod` 直连成功。
- HEAD：`e06b2a7b6443b8c2359e5ddc6ad4dd7809f5c361`；146 项 tracked dirty、712 项 untracked。生产工作树脏且为唯一业务源码，所有已有文件必须保留。
- Canvas 静态根目录：`/home/wwwroot/AI/domain/canvas.supdance.com/web`，不是 Git 工作树；当前 index 引用旧 bundle `index-BZN_M4Ze.js`（SHA-256 `8fc82cb3bfe1a86979b6ff5ae63471ae29ac12f710b83b3d0448ac6f6b30a5a4`），HTTPS 静态入口返回 200。
- Node：`v22.22.2`；`package.json` / lock 为 Next `15.5.26`，安装树为 `15.5.15`。`npm ls next` 确认 `invalid` 版本漂移。
- SupDance 与 Worker systemd 服务均 active；公开 `/api/ready` 为 HTTP 503 / `not_ready`，数据库与迁移健康、Worker/Storage/Email healthy、Providers `unknown`。
- 数据库只读状态脚本在服务的既有 EnvironmentFile 上下文中执行：迁移最新为 `047_user_assets_unique_creation_id`，`pending=[]`、`drifted=[]`。迁移 046 Priority 与 047 Asset unique 已应用；该次只读核验未改 DB。
- 生产根分区总 50 GB，可用空间本轮先后读到约 540 MB 与 1.5 GB；没有独立备份挂载。开发机数据卷约 2.5 GB 可用。一个只读完整树压缩容量估算仍在运行；本轮没有新建或验证完整 Web/DB 备份，也没有生产代码或数据库写入。
- `/api/models/active` 返回 9 个可用项（4 Image、5 Video、0 Text）。另有 48 个 `category=text` 活跃目录行，但均非当前 core/auto-route 集合；RunningHub Text 映射仍是 `needs_specification`，不能据此宣称可生成。
- 2026-09-30 `/api/health` 返回 HTTP 503，唯一异常 `providers=unknown`。线上实现把缺失或超过 15 分钟的 provider health timestamp 归类为 `unknown`；只读聚合显示 9 个公开范围模型、2 个带 endpoint 的 enabled/approved provider（muapi、runninghub）、12 条相关映射，全部缺失新鲜健康记录，0 条新鲜 healthy。未探测 Provider，未读取凭证值。

## 隔离补丁范围

- `POST /api/canvas/projects` 使用稳定 `migrationId`，同内容重试复用，冲突返回 409。
- Canvas Asset 上传用用户、请求键和内容摘要幂等；同键不同内容返回 409。
- 新增 `048_canvas_asset_upload_idempotency.sql`。原候选错误使用 046；生产已有 `046_priority_routing_mode` 和 `047_user_assets_unique_creation_id`，迁移器以完整文件名作版本号，复用 046 会造成校验漂移。
- Job、报价消费、积分预留与 Project/Node 关联进入同一事务；冲突必须回滚，保留现有 reserve/commit/void 流程。
- Worker 在实际 Provider 请求前重新按 owner 校验 `koyo-asset:<id>` 并解析 HTTPS 短期 URL；DB 保留原资产 ID，轮询时重新解析；无效 Canvas Asset 不触发 Provider failover。
- Canvas 登出增加按会话摘要限流；共享 Job 诊断使用已校验 quote 的真实 routing mode。
- 043 空库前置迁移已改为条件补种：仅在迁移账本尚未应用 044 时插入 disabled `minimax-music-3.0` 目录目标。因为当前生产库已应用 044，该候选迁移在生产应为 no-op；不修改 044 SQL 或校验值。

## 本轮验证

- 候选补丁共 20 文件，577 insertions / 54 deletions；包含迁移前置、Asset/Project 幂等、同事务 Job-quote-credit-project 关联及受限 provider health probe。
- 改名迁移 048 并限制探针目标到含 endpoint 的公开路由后，完整补丁对当前线上工作树重新执行 `git apply --check` 通过；这只是上下文校验，没有应用补丁。
- 候选 Canvas `npm run typecheck` 与 `VITE_KOYOSIM_SERVER_MODE=true npm run build` 通过；build 有 bundle 体积与动态/静态导入提示。
- `tests/services/canvas-asset-references.test.mjs` 通过 3/3：嵌套引用解析且不改写持久参数、无效 token 拒绝、缺失 Asset 与非 HTTPS 地址拒绝。
- 隔离 PostgreSQL 的 Project/Asset 幂等、Project-Node link 重试/冲突与 rollback 集成检查此前通过 1/1；模型报价/计费/状态的独立控制测试此前通过 1/1。
- 本轮从生产只读复制实际迁移 SQL 到隔离环境后运行 migration drill，通过空库与升级库、共 55 项迁移；admin note 与 UID 外键样例通过。不得更改已应用 044/046/047 的 checksum。
- `Next` 安装漂移还没有修复；不通过降级 lockfile 伪造一致。需要在容量允许的隔离构建/发布方案中把实际运行时与 lock 对齐到经过构建验证的版本。

## Provider / Text 诊断边界

- `dependencyHealth` 的 Provider 健康判定要求 provider route 有 15 分钟内的健康记录。当前健康接口只读取并汇总状态，不会自行探测上游；本轮发现 12 条符合范围的映射都缺少新鲜记录。候选 worker 将定期执行有界的 Provider 账号健康检查，只选 enabled/approved 且带 endpoint 的公开路由（muapi、runninghub）；该改动未部署，主动探测会写 provider 状态与历史表，必须等新鲜 Web/DB 备份后再执行。
- 公共模型接口按 core/visible 及报价、路由条件返回；Canvas `/api/canvas/models` 当前把返回项统一标为 `available: true`，没有逐模型健康投影。候选需要修正此误报并让 Job/quote 保持服务端 fail-closed。
- Text 生产路径仍未就绪。已有的 text-category 目录和 RunningHub mapping 不能代替模型输入/输出契约、报价一致性、Provider 终态、Text 结果持久化与 Job History 的隔离测试。

## 未执行与门槛

- 未做新的 Web 完整备份；2026-09-29 的 Web/Canvas 备份仅为历史证据，不可作为下一次写入前备份。当前正在估算全量归档大小，磁盘容量紧张；必须先找到足够容量并校验归档，任何数据库迁移前还需独立 DB 备份。
- 未改生产 Web、DB、Provider 配置或服务；未重新启动服务；未运行真实生成。
- 测试账号标识仍待用户登录后提供。真实 Image、Video、Text 三笔合计最多 100 积分；须先确认身份、余额和报价，不能以创建用户、写 DB、充值或模拟响应替代。
- 生产顺序仍为：隔离 DB 并发/回滚验证 → 备份与容量门槛 → 兼容后端/迁移 → Canvas → Studio 导航 → 可见浏览器验收。Provider 未知或无可用 Text 模型时，相关项保持 `NOT_READY`。
