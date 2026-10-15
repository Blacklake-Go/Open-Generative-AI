# 模型管理后台与用户端联通方案

状态：生产已发布 `/api/models/active` 与下单准入修复；`/api/app/models/available` 的 100 积分字段错配仍在线上待修；真实生成交易与前端交互验收未完成。本文同时记录方案、已实施改动和现网证据。

## 现状与问题

用户路径为：后台规范模型 → 已审核供应商映射与有效成本 → 平台积分价格 → `status / is_visible / auto_route_eligible` → `/api/models/active` 或 `/api/app/models/available` → Studio 选择 → 服务端报价与任务。当前后台主要按 `is_visible` 统计和预览，容易把“展示设置已保存”写成“用户已可用”；第二个用户端目录只检查审核通道数，并以 100 积分填充缺价，口径与 Studio 目录不同。Studio 下拉选择器在取得新目录后没有保证重新渲染。管理页还有按模糊匹配结果和固定 `0.02 USD` 激活渠道的捷径。

## 目标交互

1. 后台模型行直接展示 **隐藏 / 待配置 / 待核验 / 目录可选**，并列出阻断项。点击模型后编辑展示名、说明、分类、排序等展示字段；渠道、成本与售价仍由各自审核流程负责。
2. “可见”只代表管理员希望展示。目录可选至少要求模型 active、可见、自动路由准入、正数有效积分价格及符合现有 Provider readiness 判定的渠道。真实可生成另需受控账号完成报价、任务、Provider 终态、资产、历史与积分账本验证。
3. 预览读取真实公开目录，标注它是“目录预览”，不声称真实生成通过。无通道时引导管理员到审核页，禁止绕过审核强制上架、模糊匹配自动激活或使用猜测成本。
4. 用户端图像、视频、音频目录复用同一服务端可选集合；目录失败或为空时明确空状态，不显示静态旧模型或伪价格。

## 落地顺序

1. 后端统一可选模型判定与价格来源；管理页提供相同判定的只读状态投影。旧接口响应结构保持兼容。
2. 精简后台操作文案和状态呈现，封闭危险的自动激活写入口。既有待审核映射与人工审核流程保留。
3. Studio 选择器目录刷新时立即重算列表并支持键盘选择；用户端另一个模型列表与同一准入集合一致。
4. 做有意义的单元/接口验证和本地构建；生产发布前重新发现线上源码、构建、服务、数据库状态并完成新鲜备份及恢复核验。未获受控身份和费用上限时不执行收费生成。

## 验收

- 同一模型在后台、`/api/models/active`、`/api/app/models/available`、Studio 选择器中的身份和“可选”结论一致；缺价、待审、无凭证、过期健康检查均不能被显示为可选。
- 后台更改展示字段后目录返回对应展示名/排序；关闭可见后两个用户端入口均移除该模型；不改动 Provider 身份、端点或成本。
- 手工审核入口可继续使用；模糊候选不能直接激活。报价与提交仍以服务端准入为最终权威。
- 线上“联调完成”只在受控账号走完报价 → 任务 → Provider 终态 → 资产与历史 → 一次积分结算后记录。页面 200、模拟检测或本地构建仅说明对应层级通过。

## 2026-10-13 生产发布记录：公开模型目录与下单准入

- 发布前五类备份及隔离恢复校验通过，备份位置：`/home/ubuntu/backups/supdance-model-route-20261013T154737Z`。备份基线 HEAD `39c02816ae2a71530177e64fce5d14ac580efa45`、源码树 SHA-256 `e3e42fd5851c13ecd235b56d4badb018ec265ad31ef88c774cb405eb392d4463`、旧 BUILD_ID `sIQZgsfjGcrY_qIPWrV4Z`。`source-tree.tar.gz` 保存发布前完整源码树，包含当时已存在的 4 个修改文件（`models.js`、active route、`generationCore.js`、`pricingEngine.js`）；新加的 `publicDirectory.js` 在备份时尚不存在，回滚时必须显式移除。`build.tar.gz` 含发布前共享 `.next/BUILD_ID`；配置、数据库和对象分别在独立归档中。`source-restore-evidence.json`、`build-restore-evidence.json` 及其余三个 restore evidence 均通过；`rollback-evidence.json` 状态为 passed，校验时间 `2026-10-13T15:51:35Z`。生产工作树原有未提交改动均保留；发布后不要用旧基线校验器要求当前树与备份相同。
- 发布文件：`lib/services/models.js`、新增 `lib/modelCenter/publicDirectory.js`、`app/api/models/active/route.js`、`lib/services/generationCore.js`、`lib/services/pricingEngine.js`。目录资格与报价/任务创建都增加服务端公开准入检查；不满足当前审核映射、Provider、端点、适配器、凭证、有效正价、健康状态和熔断条件的模型不能进入公开目录或创建任务。未触及 UI 文件。
- Linux x64 生产根构建成功，Next.js 15.5.26，BUILD_ID `C2J57Iz9J-aLU6dMamVBl`；116/116 静态页生成，路由清单 342 项，包含 active/available、quote、generation 与 Canvas API。存在项目既有的 star-export、next-intl import cache 和 Browserslist 警告，构建退出码为 0。
- 切换完成后 `supdance.service`、`canvas-supdance.service`、`supdance-worker.service` 均为 active；Supdance 与 Canvas Web 服务确认共享 Web 根目录和 `.next`。旧构建保留于 `/home/wwwroot/AI/domain/supdance.com/web/.next-prev-supdance-route-20261013T164137Z`，旧模型热修复构建也保留。
- 公网 HTTPS 验证：`/api/models/active` 返回 200、9 个可选模型（图像 3、视频 4、音频 2），每个返回项 `hasWorkingRoute=true` 且 `autoRouteEligible=true`；`/api/app/models/available` 按图像/视频/音频/文本返回 3/4/2/0；`/zh/studio` 返回 200。Canvas `/api/live` 返回 200，未认证 session 为 401，六个 Canvas CORS 预检为 204 且回显精确 origin。
- 全局 `/api/ready` 仍为 503（providers unhealthy），所以服务就绪和真实 Provider 交易仍未通过。匿名 quote/generation 返回 401。用随机身份和已阻断模型验证了目录断言、报价、任务创建均返回 `MODEL_NOT_PUBLICLY_AVAILABLE`，并只读核对无 quote/job 记录；这是准入保护验证，不是真实用户交易。
- 本批 Supdance 收费生成次数 0、费用 0；未验证 Provider 终态、私有资产、历史/下载和积分结算，未做交互式浏览器截图验收。端到端交易状态：`NOT_READY`。
- 回滚介质：发布前五类备份及隔离恢复/回滚证据见 `/home/ubuntu/backups/supdance-model-route-20261013T154737Z/{manifest.json,rollback-evidence.json}`；切换前共享构建仍保留在 `/home/wwwroot/AI/domain/supdance.com/web/.next-prev-supdance-route-20261013T164137Z`。当前记录未找到可确认用于本次发布的独立回滚脚本；仓库中的 `scripts/deploy-supdance-fusion.sh` 是另一套融合部署入口，没有证据表明它用于本批切换，不能当作本批回滚脚本。若需回滚，先协调 Canvas 共享发布窗口，停止 Supdance 与 Canvas 两个 Web 服务，保留当前 `.next`，恢复上述旧 `.next` 和 source tar 中的 4 个旧文件、移除新增 `publicDirectory.js`，然后启动两个服务并核对 BUILD_ID、`/api/ready` 和 Canvas CORS。该序列只作操作说明，本次未执行回滚。此批未变更数据库结构或账本数据。

## 2026-10-13 16:46 UTC 生产接口复核

- 发布后错误日志与服务 journal 未命中 500、uncaught、unhandled、exception、fatal 或 failed 关键词；当前 vhost 的 Nginx `access_log` 为 off，故不能据此声称全站没有其他 500。公网唯读复查 `/api/models/active` 为 200，`/api/ready` 为 503。
- `/api/ready` 返回 `not_ready`，其中 `providers.status=unhealthy`。生产与本地的 `app/api/ready/route.js`、`lib/services/systemHealth.js`、`lib/services/dependencyHealth.js` SHA-256 一致；这是就绪探针按设计把依赖故障返回 503，并只公开 Provider 汇总状态，不是该接口 500 或源码运行时漂移。定位具体依赖需经有权限的 `/api/admin/health`（`healthRead`）或其他受控服务端诊断；不应从公开汇总推断是哪家 Provider 故障。
- 本轮未改生产代码、未重新构建或部署，未提交收费生成；端到端交易状态仍为 `NOT_READY`。

## 2026-10-13 16:56 UTC 后台健康页根因复核

- 已登录后台 `/admin/health` 实时显示 Worker 正常、队列 0、存储和 SMTP 正常；“公开模型可用渠道”为 `PROVIDER_ROUTE_UNAVAILABLE`。模型管理页仍把 `is_visible` 统计为“当前前台暴露”589 个，其中图像 135、视频 414；该数字不是 `/api/models/active` 的真实可选数，后者最近一次公网请求为 9 个。
- 模型页显示图像至少 2 个可见核心模型无渠道（FLUX.1 Dev、FLUX.1 Schnell）；视频至少 2 个可见核心模型无渠道（FLUX 3.0、Topaz Video AI），另有 Luma Dream Machine 与 Runway Gen-3 显示降级/熔断。这里只能证明后台当前状态，不证明其 Provider 可用或应当启用。
- 与线上逐文件 SHA-256 一致的 `lib/repositories/dependencyHealth.js` 将所有 active、core、visible、有平台价格的模型作为探针输入，并对渠道做 `LEFT JOIN`，所以无映射模型仍在检查范围内；`assessPublicModelProviderReadiness` 要求范围内没有不可用模型，缺渠道或熔断模型会导致 `unhealthy` / `PROVIDER_ROUTE_UNAVAILABLE`。因此本次 503 有代码与后台状态相符的解释，不是 500 或已发现的运行时分歧。不要通过猜测渠道/价格或自动隐藏模型来强行改成 ready；后续需分别处理后台“可见”与“可选”文案，并由审核流程补齐或关闭确实不对用户承诺的模型。
- 注意：访问 `/admin/health` 本身会调用 `getSystemHealth()`；底层 Provider 探针成功时可能刷新 Provider 健康状态/时间戳。本次可能产生该类运行元数据刷新，逐渠道数据库写入未核实；没有创建 GenerationJob、没有扣积分。今后将该页面视为可能触发健康探测的入口，而非纯只读 API。

## 2026-10-13 17:30 UTC 公开目录错价与报价兜底修正（本地候选，未发布）

- 生产后台 `/admin/models/pricing` 当前将 `seedream-5.0` 显示为基础积分 15、最低毛利 75%、状态“生效中”；生产 `/api/app/models/available?type=image` 此前返回同一模型 100 credits、`priceCny:null`。生产 route 读取 `m.base_credits ?? 100`，而匹配到的 `listAvailableAppModels()` 返回 `credits_price`，故字段名错配触发了 100 默认值。生产 `listActiveModels` 另有缺少 `base_credits` 时回填 10 的旧查询，可能使未配置价格的模型通过目录正价筛选。管理员定价行证明后台展示价格，不代表 API 数字是服务端 quote。
- 本地候选将公开模型响应映射到 `credits_price`，对缺失价返回 `null`；formula 价仅标 `startingCredits`，不填入精确 `credits`；增加 `quoteRequired: true`、`creditsAreQuote: false`。报价引擎现对缺少或停用的模型价盘返回 `MODEL_PRICING_UNCONFIGURED`，删除按图像/视频/音频类型虚构默认 formula 价的行为。
- 修改文件：`app/api/app/models/available/route.js`、`lib/modelCenter/publicDirectory.js`、`lib/services/pricingEngine.js`、`tests/adversarial-challenger2.test.mjs`；本方案文档同步记录。定向 adversarial suite 16/16 通过，`node --check` 检查 route 与 publicDirectory 通过。`npm run build` 启动后约 8 分 43 秒仍处于无输出编译，主动终止（退出码 130）；全量构建未通过也未完成，需后续在 Linux x64 候选构建中验证。
- 浏览器核验仅覆盖生产后台定价行；没有提交 quote、GenerationJob 或 Provider 请求，积分扣款与外部费用均为 0。没有执行实际浏览器生成流程。生产代码、数据库与共享 `.next` 均未改动；沿用 16:46 UTC 公网复核，`/api/ready` 为 503 `providers.unhealthy`。本批未重查生产服务日志，因此不对本批全站 500 数量作结论。
- 后续发布须先针对生产工作树重新比较源文件与 BUILD_ID，制作并隔离恢复核验新的五类备份，并与 Canvas 共享 `.next` 任务确认发布窗口；再用生产源树最小移植本补丁、Linux x64 构建、检查回滚材料后发布。本批本地候选可用反向 patch 撤销；生产尚无需要执行的回滚。

## 2026-10-13 发布前现网只读基线与发布门禁（历史快照）

- `koyosim.service` 当前 WorkingDirectory 为 `/home/wwwroot/AI/domain/supdance.com/web`；旧资料中的 `/home/wwwroot/AI/domain/koyosim.com/web` 目前仅有 `public`，不是 Git 根。现网 HEAD `39c02816ae2a71530177e64fce5d14ac580efa45`，工作树约 670 条改动，BUILD_ID `107CZueFsbo01U5pOVD603429917`。发布前必须重读这些值并重新比较漂移。
- 公网 `/api/ready` 返回 503，`providers.status=unhealthy`。现网 `/api/models/active` 返回 589 条，其中 21 条标记 `autoRouteEligible=true`，响应尚无 `hasWorkingRoute` 字段；`/api/app/models/available?type=image` 返回 0 条。数量仅是当前目录读数，不代表可生成。
- 用当前生产根执行 `verify-production-backup.mjs`，返回 `REFUSED: production backup is stale`；当前根也没有 `.koyosim-production-snapshot.json`。部署前必须新建并隔离恢复验证源码、配置、数据库、对象和运行构建五类备份，冻结生产源码与 BUILD_ID，再在 Linux x64 独立构建候选。旧部署脚本仍引用历史路径，不能直接运行。
- 本地候选 `npm run build -w studio` 与初轮 `npm run build` 已通过；隔离 PostgreSQL 定价/任务联调测试通过。新增接口断言证明：同一模型启用、关闭、恢复准入时，两个目录同时变化；关闭时报价与任务均返回 `MODEL_NOT_PUBLICLY_AVAILABLE`。本地编译与隔离测试都不等于现网发布或 Provider 成功。

## 2026-10-14 候选复核

- 定价明细与前台矩阵不再将缺价模型显示为默认 10 算力；展示配置接口不再通过附带价格顺手创建带默认毛利参数的定价，价格只能走定价页单独核实。规格抽屉中没有合同依据的倍数示例已移除。
- Studio 目录刷新可移除、再恢复同一模型；读取失败时清空旧目录并显示错误。公开目录响应使用 `no-store`，避免 CDN 持有旧展示状态。纯逻辑/Provider readiness/Studio 刷新测试 8/8 通过，隔离 PostgreSQL 接口/报价/任务测试 1/1 通过。
- 重新以生产实际根校验共享备份，返回 `ok:true`，五类组件及回滚核验齐全；观察到 BUILD_ID `C2J57Iz9J-aLU6dMamVBl`，`koyosim.service` active。这个备份对应当时源树；发布前仍须重新冻结并核对漂移。
- 公网 `/api/ready` 仍是 503。服务器独立 Next 构建曾在 1.9 GB 内存下两次 OOM；本次模型候选尚未形成 Linux x64 可发布构建，也未完成受控账号真实 Provider 生成、资产、历史、一次积分结算。生产未发布。

## 2026-10-14 ImageStudio 能力约束候选（未发布）

- 本轮公网快照：`/api/ready` 为 503，`providers.status=unhealthy`；`/api/models/active` 为 200，9 个目录模型均未带 `generationCapabilities`；`/api/app/models/available?type=image` 为 200，但 3 个图像模型仍返回 `credits:100`、`priceCny:null`。当前没有可据此确认的生产生图能力或精确目录价格；未提交 quote/job、未触发 Provider 请求、费用为 0。
- 候选扩展 `publicGenerationCapabilities.js`，为 T2I/I2I 提供按服务端能力查找、规格选项、参数构建及附件/补充参数过滤。ImageStudio 在目录加载后收紧画幅、分辨率/质量、特效与参数控件；生成和历史重生成无已确认的服务端能力时会停止，并以托管平台参数进入现有 server quote → 幂等 GenerationJob 客户端链路。`muapi.js` 只在托管 `/api` 路径下采用经 Studio 过滤后的最终参数；本地/第三方 Provider 参数构造仍沿用原路径。
- 本批增量文件：`packages/studio/src/publicGenerationCapabilities.js`、`packages/studio/src/components/ImageStudio.jsx`、`packages/studio/src/components/ImageSpecPopover.jsx`、7 份 `imageStudio.json`、`packages/studio/src/muapi.js`、`tests/public-generation-capabilities.test.mjs`、`tests/muapi-motion-graphics-platform.test.mjs`。交互样式未改；Impeccable 针对两个组件的机械检测结果为空。
- 验证：能力过滤与托管 T2I/I2I quote/create 请求测试 5/5 通过；adversarial 定价/目录测试 16/16 通过；`npm run build:studio` 通过；Next.js `npm run build` 通过（115/115 静态页）；`npm run test:i18n` 通过；本批目标文件 `git diff --check` 通过。模拟传输证明 quote 与 create 收到同一已筛选参数，不证明真实用户交易、Provider 终态、私有资产、历史下载或结算。
- 代码与文档未部署，未 stage/commit；完整交互式浏览器截图和真实用户交易仍未验证。生产 readiness 503 是当前发布阻断条件。回退只需撤销本批在上述现有 dirty 文件中的增量，不能对共享工作树执行 `reset`、整文件 checkout 或删除其他候选改动；生产尚无本批部署可回滚。
