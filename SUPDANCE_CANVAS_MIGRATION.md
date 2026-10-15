# SupDance Canvas 本地数据迁移

状态：服务端云端项目已实现；生产版迁移仍为 **NOT READY**。迁移 UI、浏览器检查点和生成请求幂等逻辑只存在于 Canvas 工作副本；服务端幂等补丁已在隔离副本准备，但尚未部署或应用数据库迁移。

## 当前路径

- Infinite Canvas 本地 Project、节点和素材由 IndexedDB/localForage 与浏览器存储管理。
- 生产 Server Mode 的 `/canvas` 列表从 SupDance 读取 Cloud Projects，并保留本地未迁移项目；当前生产客户端打开本地项目会直接触发迁移。
- 生产 `migrateLocalCanvasProjectToKoyo` 遍历项目快照，读取本机 media Blob、上传素材、创建云端 Project 并替换本地列表项；失败和响应丢失时没有足够的防重复/恢复保证。
- `sanitizedServerConfig` 会清空/限制普通 Provider 配置；生产浏览器的 IndexedDB 是否已覆盖旧配置、插件缓存是否仍含凭证，尚未通过真实浏览器 Storage 检查。
- Canvas 工作副本已加入迁移前 ZIP 备份确认、上传进度、本机项目路由拦截、按 SupDance 用户隔离的素材上传检查点、项目迁移 ID，以及快照凭证字段过滤；此构建尚未发布。

## 上线前必须补齐

1. 在 Canvas 库检测本地 Project；后续需显示项目数、可读取资产数和总大小估计。
2. 工作副本要求先下载 ZIP 并确认已保存，再开始上传；ZIP 是成功后恢复本机原件的依据。
3. 工作副本显示素材上传进度，并把已确认的 Asset ID 写入按 `user.id + local project.id` 隔离的本地检查点；刷新后可复用已确认上传。
4. **生产服务端仍缺项目迁移幂等支持**：线上 `POST /api/canvas/projects` 忽略 `migrationId`，仍为每次调用生成随机 UUID。隔离补丁已实现按 `(owner_user_id, migrationId)` 生成稳定 ID，并在内容相同时返回原 Project；内容不同时返回 409。
5. **生产素材上传仍可能因响应丢失产生重复 Asset**：工作副本现在发送稳定的素材幂等键。隔离补丁新增迁移 048 的用户级唯一索引、内容摘要校验和确定性对象 Key；生产 046、047 已分别用于路由策略与 creation Asset 唯一约束，候选迁移曾误占 046，已改为 048。迁移尚未应用，补丁尚未部署，故生产上传仍没有幂等保证。
6. 工作副本 `canvasProjectSnapshot` 过滤 Provider 凭证、自定义脚本、WebDAV 凭证字段；启动代码会覆盖旧 Provider/WebDAV 配置，并阻止 Server Mode 读取或改写旧插件存储（保留本机数据）。空白 localhost 浏览器已扫描候选版；线上域名和既有用户浏览器数据仍未核验。
7. 通过隔离测试身份与另一浏览器确认 Project、节点、资产读取、失败重试及跨账号隔离；失败或冲突不得静默覆盖。

## 目前风险

- 生产上传成功后仅在内存 `Map` 记住 Asset 映射；刷新/响应丢失可能导致重复孤立对象/Asset。
- 生产 Project 创建使用随机 UUID；响应丢失后重试可创建重复 Project。
- 生产客户端直接迁移，没有备份确认或恢复界面。工作副本已改变流程，但未发布。
- 服务端补丁文件为 [KOYOSIM_CANVAS_SERVER_PATCH.patch](./KOYOSIM_CANVAS_SERVER_PATCH.patch)，基于最新生产源复核，移除了候选里对既有 Asset helper 的重复导出；本轮确认迁移版本由文件名完整计算，线上 046 与 047 已应用，因此素材上传索引必须使用 048，不能复用 046。改名后的补丁仍需重新执行线上 `git apply --check`、隔离迁移演练与事务验证。当前生产安装 Next.js 15.5.15、package/lock 为 15.5.26。生产代码和数据库未改动。
- 生产 Server Mode 禁止执行/加载旧 Plugin，但没有清除 `infinite-canvas:plugin_store` 或 `infinite-canvas-plugins` 数据库；不能宣称旧内容已从 Storage 移除。
- 工作副本生成请求以规范化请求指纹保留幂等键、quote id 与 job id，避免同一浏览器在刷新/网络重试时重复建单；仅构建验证，尚未连生产 API E2E。当前生产服务仍在 creation/预留事务之后写入 Project↔Job 关联；候选服务端补丁已将该关联移入同一事务，但未部署。

## 数据与账户原则

本地 Canvas project ID 仅作为迁移来源标识，不能作为账户 ID。服务端 Project 与 Asset 必须通过当前 SupDance Session 的 `user.id` 建立 owner。不得查询、写入或伪造用户验证状态、Session、余额或任务。迁移只处理用户创作项目和其引用媒体；不迁移用户 Provider 凭证或 Provider 脚本。

## 迁移验收

当前结果：**NOT READY**。需先部署并验证项目与 Asset 服务端幂等，再在隔离账户浏览器演练：ZIP 可打开、含图片/视频引用的项目迁移、断网/响应丢失不重复 Project/Asset、另一账号无法读取。当前用户尚未提供隔离测试账号标识。
