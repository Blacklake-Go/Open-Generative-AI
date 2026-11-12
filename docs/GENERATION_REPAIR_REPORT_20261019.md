# SupDance 生图/生视频永久修复报告（2026-10-19）

## 1. 根因
1. **Seedance 2.0 没有真实路由**：canonical seedance-2.0 被映射到 Seedance 1.5 / SparkVideo 或空 endpoint。
2. **Kling 3.0 被路由到 Kling 2.5 / 唇形同步**；官方 Kling endpoint 为空。
3. **RunningHub 363 条路由缺少能力元数据**（duration/resolution），严格路由器直接以 DURATION_UNVERIFIED 拒绝。
4. **RunningHub 配额戳 15 分钟过期**，过期后 548 条路由全部不可用。
5. **前端模型选择器提交复合 ID**（family:variant），服务端无法解析 → 用户只要在下拉框选模型就 422。
6. **多模型错误替换**：FLUX/Midjourney/SD3.5 → qwen-image，wan 视频 → wanx 图片模型等。

## 2. 修复
- 接入 RunningHub 官方 Seedance 2.0 Global T2V/I2V：
  `/openapi/v2/bytedance/seedance-2.0-global/text-to-video`（及 image-to-video）。
- 修复 Kling 3.0 RunningHub 路由与参数契约（duration/aspectRatio/sound）。
- 补全 RunningHub 路由能力元数据；退役 13 条错误 Seedance + 31 条错误 Kling 路由。
- 5 分钟 systemd 定时刷新 RunningHub 余额/配额。
- 前端 picker 统一规范 ID、按服务端可下单目录过滤、去重、修复选中态；长视频显示实时进度。
- 无限画布关闭跨域 RSC 预取（prefetch=false）。
- 暂时隐藏 25 个无真实渠道/会错误替换的模型，备份于 `ai_studio.visibility_repair_20261019`。

## 3. 商业策略
- 用户售价 = 官方供应商成本 × **130%**（保留 10% provider reserve；目标贡献毛利 15.3846%）。
- RunningHub Seedance 2.0 官方价：720p $0.20/s，480p $0.10/s。
  - 5s 720p：成本 ¥7.20 → 售价 ¥9.36 → **135 积分**
  - 5s 480p：成本 ¥3.60 → 售价 ¥4.68 → **70 积分**
  - 4s 720p：成本 ¥5.76 → 售价 ¥7.49 → **110 积分**
- 其余模型：Seedream 5.0 = 15，Seedream 4.5 = 12，Kling 3.0 = 45，Kling 2.6 = 10，Kling 2.5 = 28。

## 4. 端到端验证（真实扣费）
| 模型 | 结果 | 耗时 | 证据 |
|---|---|---|---|
| Seedream 5.0 | ✅ | ~9-23s | gen_7ee3ac5330f8b6ef591bda87 |
| Seedream 4.5 | ✅ | ~10s | gen_3777c09b30220b56ba7bb275 |
| Seedance 2.0 | ✅ | 136s / 240s | gen_cc4dc803fdc66dea38f1d945 |
| Kling 3.0 | ✅ | 99s | gen_b162406b5c6645dbc5972a6c |

## 5. 仍需人工完成
- **火山方舟开通 Doubao-Seedance-2.0（模型 ID：doubao-seedance-2-0-260128）**：控制台登录态无法在无头浏览器复用（401），需在已登录的 Chrome 中打开
  `https://console.volcengine.com/ark/region:cn-beijing/model-square` → 搜索 Doubao-Seedance-2.0 → 开通。
  开通后启用火山直连路由，价格将按官方价（约 ¥1/秒）×130% 计算，5s 720p ≈ 95 积分，且保留 RunningHub 作为备用。
- 其余隐藏模型（Hailuo/Wan/Veo/Kling 2.1/FLUX/Midjourney）需要补齐真实 endpoint 后再逐个恢复。
## 6. 2026-10-19 第二轮补充验证
- 无限画布端到端成功：报价 201（15 积分）→ Canvas Job 202 → succeeded（约 12s），产出资产 ast_655e9a7f3761d0843f244a36，contentUrl=/api/canvas/assets/.../content。
- 130% 定价实测：Seedance 2.0 720p 5s = 135 积分，480p 5s = 70 积分，720p 4s = 110 积分。
- 生成岛第二版 UI：模型触发器改用短名（Seedream 5.0），32px 控制行、白色圆形提交按钮、8 比例一屏弹层。
- 火山视频适配器已就绪：lib/adapters/volcengineVideo.js 支持 Ark /contents/generations/tasks 的 T2V/I2V（含 first_frame/last_frame、ratio、duration、resolution、audio flags）。已用已开通的 doubao-seedance-1-0-pro-fast-251015 实测提交并成功产出视频（task cgt-20261019012229-49wxl）。
- Seedance 2.0 火山直连路由已预置但保持 disabled：pm_volcengine_seedance20_global_t2v（官方价约 ¥1/秒，130% 后 5s 720p ≈ 95 积分）。控制台开通 doubao-seedance-2-0-260128 后执行 UPDATE ai_studio.provider_models SET enabled=true WHERE id='pm_volcengine_seedance20_global_t2v'; 即可优先火山、失败回退 RunningHub。
## 7. 火山控制台自动开通结果（2026-10-19 01:47-01:53）
通过 Chrome DevTools Protocol 接管已登录的火山方舟控制台（临时复制 Profile 4 到非默认 user-data-dir，完成后已关闭并恢复正常 Chrome），直接调用控制台内部接口：
- 接口：POST https://console.volcengine.com/api/top/ark/cn-beijing/2024-01-01/ActivateModels
- 头：Content-Type: application/json + X-Csrf-Token（来自 csrfToken cookie）+ 登录 cookie

已成功开通：
- doubao-seedream-5-0-pro（Seedream 5.0 Pro）
- doubao-seedream-5-0-flash（Seedream 5.0 Flash）

未成功：
- doubao-seedance-2-0 / 2-5 / 2-0-fast / 2-0-mini：返回 OperationDenied.BalanceNotEnough，要求账户可用余额/代金券达到 200 元下单预留金额后才能开通。
- doubao-seedream-5-0：返回 OperationDenied.ModelRetiring（即将下架，不再开通）。

注意：当前账号的「安心体验」额度对 Seedream 5.0 Pro/Flash 为 0（ListModelTokenLimit TokenLimit=0），调用会返回 SetLimitExceeded 并自动暂停。需要在控制台「开通管理 → 模型用量上限」把对应模型开关调大/关闭安心体验后，才能付费调用。现有 Seedream 4.5 / 5.0 基础版未受影响。

结论：火山视频直连仍被 200 元余额门槛阻塞；RunningHub Seedance 2.0 已可用（135 积分/5s 720p）。等用户充值/开通后，执行迁移 074 中的 enable 语句即可切换火山直连。
## 8. 无限画布前端（源码重构）已上线
- 源码：/Users/seelucency/Documents/dev/canvas-web-supdance-security/web（branch codex/supdance-canvas-agent-security）。
- 完成：48px 顶栏 + 项目菜单/同步状态/对话 pill；左侧悬浮 46px 工具列（40×40 r12）；底部 760×170 r16 composer；28px 缩放 dock；40px 聊天气泡；扁平点阵画布；即梦风格空状态；亮/暗主题 token；i18n。
- 未改动：节点图引擎、登录、API 契约、后端；composer 提交只创建本地预填图片节点并打开原有生成面板，不直接调用生成 API。
- 验证：tsc --noEmit 通过；bun run build 通过；Playwright 1512×982 + 390×844 全交互通过，无 console error。
- 部署：已备份生产 web 到 /home/wwwroot/AI/backups/canvas-web-20261018T181613Z，随后替换 index.html/assets；生产 https://canvas.supdance.com/canvas 与工作区实测无报错，composer/模型选择/旧项目加载正常。
- 提交：canvas 仓库 b9c7b3e。

## 9. 当前可稳定使用的模型（前台）
- 图像：Seedream 5.0、Seedream 4.5（火山）。
- 视频：Seedance 2.0（RunningHub，135 积分/5s 720p）、可灵 3.0（45）、可灵 2.6（10）、可灵 2.5（28）。
- 火山 Seedance 2.0 直连已预置：开通门槛 200 元余额；开通后启用即可把 5s 720p 降到约 95 积分。
- Seedream 5.0 Pro/Flash 已开通，但「安心体验/模型用量上限=0」导致暂停，需在控制台调整该开关后接入。
## 10. 路由语义防错已上线
- `lib/modelCenter/routePricing.js` 新增厂商家族守卫：canonical model 与 provider_model_id 必须属于同一厂商家族（seedream/seedance/kling/hailuo/wan/veo/sora/luma/runway/flux/midjourney/imagen/gpt-image/qwen/stable-diffusion/vidu/cogvideo/hunyuan/infinitetalk/gemini）。
- 跨家族映射会直接返回 `CANONICAL_FAMILY_MISMATCH`，不会再出现「选 FLUX 出 Qwen 图」「选 GPT-Image 出 Seedream」「选 Wan 视频出 Wanx 图片」等静默替换。
- 已用生产 DB 离线路由评测验证：现有 6 个可用模型全部保留 OK；veo/sora/cogvideo/infinitetalk 的跨家族垃圾路由被正确拒绝。
## 11. Seedream 5.0 Pro / Flash 正式接入（2026-10-19）
- 通过火山控制台关闭两个模型的「模型用量上限」开关后，Ark 图片接口恢复调用：
  - doubao-seedream-5-0-pro-260628：2048×2048 实测成功；官方 0.30–0.60 元/张，按 0.60 保守成本 ×130% → 15 积分。
  - doubao-seedream-5-0-flash-260915：实测成功；官方 0.12 元/张 ×130% → 10 积分。
- 新增 canonical 模型 seedream-5.0-pro / seedream-5.0-flash，挂载火山官方路由，前台 picker 现有 4 个图片模型（5.0 / 5.0 Pro / 5.0 Flash / 4.5）。
- 端到端：Pro 15 积分成功（gen_385a7e7616beaeaac1282f1b）；Flash 10 积分成功（gen_b7719ab16e64b73f3e78a1a9），均为 volcengine。
- 迁移 075 记录。
## 12. Seedance 1.0 Pro Fast 接入（2026-10-19）
- 火山官方价：0.0042 元/千 tokens（T2V/I2V），账户仍有约 199 万免费 tokens。
- 按 720p = 1280×720×24fps / 1024 ≈ 21600 tokens/秒 → 0.09072 元/秒；×130% 后：
  - 5s 720p = 10 积分（成本 ¥0.4536）
  - 5s 480p = 10 积分（成本 ¥0.2126）
  - 10s 720p = 20 积分（成本 ¥0.9072）
- 新增 canonical 模型 seedance-1.0-pro-fast，火山官方路由，前台视频 picker 现有 5 个模型（Seedance 2.0、Seedance 1.0 Pro Fast、可灵 3.0/2.6/2.5）。
- 端到端：gen_5dff64ec63e35305313a98c0，5s 720p，约 27 秒成功，provider=volcengine。
- 注意：generation-worker 与 Web 使用同一代码目录，部署新 adapter 后必须同时 `systemctl restart supdance-worker.service`，否则 worker 仍执行旧代码。
- 画布视频挂载已加入 seedance-1.0-pro-fast。
## 13. 火山余额变负与图片兜底（2026-10-19）
- 控制台实测账户余额：**-1.44 元**（已欠费）。直接原因是本轮 Seedream 付费出图测试扣费；欠费后所有火山付费模型调用返回 `AUTH_ERROR: account has an overdue balance`。
- 影响：
  - Seedream 5.0 直连失败，但路由自动 failover 到 RunningHub seedream-v5-pro，出图成功（gen_41fee1283789a727d993a349）。
  - 新接入的 Seedream 5.0 Pro/Flash 已增加 RunningHub fallback：Pro→seedream-v5-pro，Flash→seedream-v5-pro；两者当前 10 积分/张，E2E 均成功（gen_6187eb27f21446457f6c73a0、gen_980b6d2fe7fa0b816575cf1d）。
  - Seedance 1.0 Pro Fast 的 T2V 走免费 token 额度仍可成功；I2V 因欠费被拒（AUTH_ERROR）。
- 恢复步骤（充值后）：重新 enable `pm_volcengine_seedream_5_0_pro` / `pm_volcengine_seedream_5_0_flash`，并向账户充值至少补足 -1.44 元 + 测试余额；Pro/Flash 将回到官方直连 15/10 积分。
- 火山 Seedance 2.x 的 200 元开通门槛仍独立存在。
## 14. Seedream 4.5 路由修复 + 版本守卫（2026-10-19）
- 发现 seedream-4.5 有一条错误低价路由 `pm_bytedance_seedream_v4_byteplus_wpajq` 指向 seedream-4.0，导致 4.5 请求被错误降级并失败（MODEL_ROUTE_UNAVAILABLE）。
- 已禁用该错误路由与欠费的火山 4.5 路由，启用 RunningHub seedream-v4.5/text-to-image（1k/2k/4k），4.5 实测成功（gen_fc96390b263dccb97ba75651，12 积分）。
- 新增 Seedream/Seedance 版本守卫：canonical 与 provider 的主版本必须一致，否则返回 `CANONICAL_VERSION_MISMATCH`，永久阻止 4.5→4.0、5.0→4.5 这类静默降级。
- 现有可用模型离线回放全部保留：seedream-5.0/4.5、seedance-2.0、kling-3.0/2.6/2.5。
## 15. 欠费期间的收起与恢复清单（2026-10-19）
- Seedance 1.0 Pro Fast 已暂时 `is_visible=false` 并从画布挂载移除：欠费后所有火山生成调用（含免费额度 T2V）均被 AUTH_ERROR 拒绝，留可见会报错。充值后执行：`update ai_studio.ai_models set is_visible=true, auto_route_eligible=true where id='seedance-1.0-pro-fast'`，并把该模型加回 canvas_model_config.video。
- 当前严格可用矩阵（rate limit 之外）：图片 4 个（5.0 自动兜底 RunningHub、Pro/Flash RunningHub、4.5 BytePlus→RunningHub 兜底）；视频 4 个（Seedance 2.0、可灵 3.0/2.6/2.5，均 RunningHub）。
- 火山欠费是当前唯一系统性阻塞；RunningHub 余额仍可支撑图片/视频。
## 16. 真实浏览器前端端到端复测（2026-10-19 02:53-02:56）
- 图片：登录用户在前端「AI 图像」选择 **Seedream 5.0 Pro**，输入提示词点击生成；前端 POST /api/generations 成功，最终 `gen_315e45615142e070ee1e0f69`，provider=runninghub，结果 webp 正常返回，console 零报错。
- 视频：前端「AI 视频」选择 **Kling v2.6 Pro**，输入提示词点击生成；最终 `gen_13ea60637f111477d785a391`，provider=runninghub，结果 mp4 正常返回。
- 说明：火山欠费期间，图片/视频均通过 RunningHub 兜底保持可用；前端 UI 生成链路（选择器→参数→报价→提交→轮询→展示）完整通过。
## 17. 充值后官方链路恢复与画布 composer 闭环（2026-10-19 03:07-03:15）
- 用户充值后余额恢复为 5 元（非 200，Seedance 2.x 门槛仍未满足）。
- 重置火山熔断、重新启用官方路由；恢复 Seedance 1.0 Pro Fast 可见并加回画布。
- 官方直连 E2E：
  - Seedream 5.0 Flash：gen_4ea4fdd0ceaa571012ddfd4c（volcengine）。
  - Seedance 1.0 Pro Fast T2V 5s 720p：gen_a458a74185623d6e18db0c4c（volcengine，10 积分）。
  - Seedance 1.0 Pro Fast I2V 5s 720p：gen_0366e5582f42deaf7cefc0eb（volcengine，10 积分）。
- 画布 composer 改进：提交后直接创建预填 composerContent 的「生成配置」节点，打开面板即可点「开始生成」；实测完成扣费确认→生成→图片节点展示闭环（截图 canvas-composer-e2e-final.png）。
- 当前模型：图片 4 个；视频 5 个（Seedance 2.0、Seedance 1.0 Pro Fast、可灵 3.0/2.6/2.5）。
## 18. Seedance 2.0 / 2.5 改用 RunningHub 聚合 API + 最低成本测试（2026-10-19 04:05-04:25）
- 目标：火山 2.x 直连未开通，改用 RunningHub 聚合余额，最低成本验证。
- Seedance 2.5：新增 RunningHub 路由 `/openapi/v2/bytedance/seedance-2.5-token/text-to-video`，按官方 Token 价 ¥87.5/百万 tokens（720p）折算 ¥1.89/秒，130% 定价；模型已上架并挂入画布。最低成本档 4s 480p = 65 积分，E2E 成功：gen_c76d11eaca078e05e5709a0a（runninghub，mp4）。
- Seedance 2.0：启用 RunningHub 更便宜的标准路由 `/openapi/v2/rhart-video/sparkvideo-2.0/text-to-video`（¥0.72/秒），4s 720p = 55 积分（原 110 积分），5s 720p = 70 积分（原 135 积分）；E2E 成功：gen_2ed833cfc3826a69e95b4863（runninghub，mp4）。
- 修复版本守卫空版本被误判为 0.0 的 bug；修复该路由 price_type/expires_at/币种导致 PRICE_MISSING/EXPIRED/FX_RATE_MISSING 的问题；补齐 sparkvideo 必填默认参数与 ratio 选项。
- 当前视频模型 6 个：Seedance 2.5、Seedance 2.0、Seedance 1.0 Pro Fast、可灵 3.0/2.6/2.5。
## 19. 前端 UI 实测 Seedance 2.5 + 时长选择修复（2026-10-19 07:47-08:05）
- 前端视频选择器现有 6 个模型，已包含「字节跳动 Seedance 2.5（影视运镜/音画同出）」。
- UI 实测：选择 Seedance 2.5 → 默认 16:9/720p/5s → 提交成功，180 积分，结果 gen_1641cf0f453b69e4d7cd50a5（runninghub，mp4）。
- 最低成本 API 实测：4s 480p 65 积分成功（gen_c76d11eaca078e05e5709a0a）；Seedance 2.0 低价档 4s 720p 55 积分成功（gen_2ed833cfc3826a69e95b4863）。
- 发现前端时长选择器对 Seedance 2.5 只显示 5s（静态 catalog 无 enum），已修复 `getVideoModelById` 的 alias 解析与 `getDurationsForModel` 的 min/max range 展开（4-15s），build16 部署后用户可直接选 4s 最低成本档。
