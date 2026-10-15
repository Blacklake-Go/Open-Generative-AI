# SupDance Canvas 安全审计

审计日期：2026-09-29。范围为已部署 SupDance/Canvas 代码路径、CORS/Nginx/数据库 schema、静态 Canvas UI 与当前本地构建副本。本轮也只读下载了匿名生产首页及其 JS/config 资产并做静态检查。未登录用户浏览器的私有 Storage、真实 Provider 请求头/密钥、用户行与账本行未读取。

## 已核验控制

- Canvas 使用 SupDance Session，不创建 Canvas 账户；服务端用户来源是 `getUserFromRequest`。
- Production Canvas 白名单源为 `https://canvas.supdance.com`。本轮无 Cookie 只读探测：该源对 `/api/canvas/session` 的 OPTIONS 返回 204，含精确 ACAO、`Access-Control-Allow-Credentials: true`、预期 methods/headers 与 `Vary: Origin`；同一来源的匿名 GET 返回 401 且保留精确 CORS 响应头。非白名单来源的 OPTIONS 和 GET、缺失 Origin 的 GET 均返回 403 且不带 ACAO。此证据只覆盖该 Session 路由，不证明登录或写端点 CSRF 行为。
- Provider 调用由 SupDance 服务端模型目录、报价和 Router 执行。模型投影不包含 Provider key/private endpoint。
- 写端点校验 `X-SupDance-Canvas`、Origin、content type、body limit、rate limit 和提示词安全。Project 快照限制 2 MiB，拒绝 inline base64；Job 参考资产按当前用户 owner 校验。
- 上传转入共享私有 Asset/Object Storage；资产读取按 owner 过滤，响应设置 no-store/nosniff 并拒绝重定向。
- Koyo Server Mode 会清空本地 API key/Base URL/proxy/WebDAV config；自定义模型脚本执行、Plugin 加载、安装、更新路径关闭，插件 UI 隐藏。
- 项目 owner 字段引用 SupDance 用户表；Canvas job 查询通过项目任务关联和 creation user_id 双重校验。

## 未闭合风险

1. 同一主站 Cookie 在 Canvas 子域登录、刷新、主站退出使 Canvas 立刻失效、Canvas 退出撤销 Session 的真人 E2E 未通过。当前方案请求主站 API 携带 Cookie，而不是在浏览器保存 JWT；仍需浏览器验证 Cookie/CORS。
2. 当前生产 Canvas Project Job link 在共享 task 创建/预留事务后独立写入，存在失败竞态；候选补丁已原子化但尚未部署或隔离 DB 验证。
3. 本地迁移缺持久 checkpoint 与服务端幂等。重试可能留下重复 Cloud Project/Asset。
4. Koyo Server Mode 禁止执行旧 Plugin；生产浏览器仍可能保留 `infinite-canvas:plugin_store` 与 `infinite-canvas-plugins` 中的旧数据。工作副本现已让插件存储在 Server Mode 不读取、不改写，并保留本机数据；干净 localhost 浏览器检查未发现旧插件 DB，但这不能代表既有用户浏览器，仍不能宣称线上 IndexedDB 不含旧 secret。
5. Canvas SupDance Shell 已部署；Studio 桌面工作台侧栏与移动抽屉导航补丁已在最新生产源码快照上 apply-check/JSX parse 通过，但未做整站构建或部署。
6. 最新 2026-09-29T11:58:56.629Z 生产 `/api/health` 返回 503、`providers=unknown`；Provider readiness 和 failover 仍未验证。
7. 安全审计还缺：匿名/越权项目与资产负向用例、签名 URL 失效、并发/重放报价、限流、带认证的写端点 CSRF/Origin 拒绝，以及生产域名/既有用户浏览器的 Storage/Network 检查。Session 的无 Cookie CORS/Origin 边界已按上项做只读探测；候选构建扫描与生产公共 Bundle 静态扫描已完成，但都不是认证浏览器验收。
8. 生产公共 Canvas JS (`/assets/index-BZN_M4Ze.js`, SHA-256 `8fc82cb3bfe1a86979b6ff5ae63471ae29ac12f710b83b3d0448ac6f6b30a5a4`) 包含 OpenAI/Gemini Provider endpoint、带客户端 `apiKey` 的直连请求模板（Bearer header 和 Gemini `?key=` query），并含 `channelMode=local`、空 key 的默认配置。它也包含 `window.location.hostname === "canvas.supdance.com"` 的服务模式判断；生产域名下该判断为真，静态调用分支在图片/视频/文本生成时转到 SupDance Job，旧本地 Provider 分支 fail closed。静态包中 OpenAI/Google/AWS/GitHub/JWT 常见凭证形态均 0 命中，`config.js` 只有空的 `window.__RUNTIME_CONFIG__` 初始化，未发现 source map。由此只能确认源码有直连模板和域名隔离分支；不能代替隔离身份下对有效配置、浏览器 Storage 和实际 Network 的运行时核验，也不能概括为没有任何密钥风险。

## 本轮工作副本新增控制（未部署）

- 在配置 rehydrate 时把已清理的 SupDance-safe config 写回 localForage 与 localStorage，避免只清理 Zustand 内存态而旧 IndexedDB 值仍保留。
- SupDance Server Mode 禁止插件加载，并让旧 `infinite-canvas:plugin_store`/`infinite-canvas-plugins` 存储不被读取或改写；避免启动时无提示删除用户本机插件数据。物理清除仍未完成，旧浏览器数据是否含凭证须在隔离浏览器 Storage 审计中确认。
- `canvasProjectSnapshot` 递归排除 Provider/API key、Base URL、token、密码、authorization、WebDAV credential、自定义脚本等字段，迁移对话框也说明凭证不会上传。
- Canvas 生成请求对规范化内容指纹持久保存幂等键、quote id 与 job id；活动任务重入时读取既有 job，避免同浏览器刷新/重试重复建单。终态后允许新的同参数生成。
- 这些改动只在 `/tmp/supdance-infinite-canvas-audit-20260929/web`，`typecheck` 与 Server Mode build 通过；最终候选已做干净 localhost 浏览器 Storage/Network 检查，未部署且未检查生产域名/既有用户浏览器。生产行为仍以已部署版本为准。
- 服务端候选补丁增加项目迁移与上传幂等、原子 Project/Job 关联及 Session 登出限流。最新生产源码已包含 Job 结果所需的 owner-scoped Asset helper；候选重复添加已移除。修正版 11 文件补丁 apply-check、10 个 JS/MJS 的 ESM 语法和生产 lockfile 解析通过；补丁不修改 package-lock，仍未做整站构建、DB 验证或部署。
- 本地主站 Studio 导航候选改动在桌面左侧加入 Studio / Canvas 工作台切换项，并在移动左侧抽屉增加 Canvas 语义链接；生产尚未发布，桌面候选未做浏览器渲染验证。
- 最终 Canvas 候选 build 的 4 个 JS/HTML 文件（约 3.76 MB）经常见 OpenAI/Anthropic、Google、AWS key 形态与长凭证字面量扫描，均为 0 命中。一次性无 Cookie Chromium 在 localhost 候选预览中检查到 localStorage 1 项、IndexedDB `infinite-canvas`，0 非空凭证字段、0 常见 key 形态；请求中 0 Provider 凭证头/查询参数。此证据只覆盖候选包和干净本机浏览器上下文，不覆盖线上用户浏览器。
- 本轮 UI 检查还验证了移动视口打开 Studio 抽屉后 Canvas 链接可见且 URL 正确；生产未部署。

## 暂不读取或输出

没有检查或展示用户密码、OTP、Cookie、Session token、Provider API key、第三方凭证或个人余额。未来浏览器安全核验使用隔离测试身份，只输出脱敏结果和通过/失败计数。

## 结论

基础后端边界已接入，安全验收仍为 **PARTIAL / NOT READY**。在登录、Storage、Provider readiness、任务关联原子性及迁移幂等缺口闭合前，不应宣称 Canvas 完全成为 SupDance-only client。
