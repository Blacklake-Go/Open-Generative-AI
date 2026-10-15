# 模型定价与最低成本路由总控台

更新时间：2026-09-24。本文说明本地代码实现、数据迁移、人工核价边界、验证结果与分阶段启用方式。生产数据库迁移、生产发布和真实付费生成均未执行。

## 状态与核心口径

- `/admin/models` 是“模型定价与路由”主入口，集中模型目录、映射审核、价格审核、手动调价、站点售价、模拟报价、渠道能力、同步、导入导出和调用明细。
- 用户调用仍传规范模型 ID；渠道映射必须单独审核。显示名称相同不创建映射，也不证明任务、规格或许可证等价。
- 预估成本由 [`lib/modelCenter/routePricing.js`](../lib/modelCenter/routePricing.js) 按本次请求规格计算，最低成本选路经 [`lib/services/smartRouter.js`](../lib/services/smartRouter.js) 使用；报价、模拟报价和后台毛利预览复用同一报价/路由服务。
- 价格证据分为官方公开价格、账户实际价格、聚合渠道价格、人工价格。只有账户实际价、聚合价和人工价可进入路由；官方公开价单独保存作参考。人工锁定价格不会被同步覆盖。
- 缺失、过期、无法按本次规格计算或没有汇率快照的成本为未知，不能按 0 处理。明确验证为免费的报价才使用 0。历史 019 迁移的默认零成本没有来源证明，040 将其转为未知；以后保存的有来源 0 值仍可代表真实免费。
- 现有积分政策未改：每积分 0.07 CNY、配置基准 1 USD=7.2 CNY、渠道成本准备金 10%、目标贡献毛利 75%、5 积分舍入、最低 10 积分。唯一规则源为 [`lib/pricing/creditPolicy.js`](../lib/pricing/creditPolicy.js)。管理员改价与运行时报价都使用服务端规则。

报价会固定站点售价/积分版本、输入规格摘要、汇率、渠道候选、价格版本、映射版本、端点、拒绝原因和故障切换成本上限。执行时重新检查渠道、映射和成本；只有原报价列出的同规范模型、等价规格候选可故障切换，不能突破报价成本上限或该次报价的毛利底线。报价不声称能在结果生成前保证事后实际费用绝对最低。上游未返回实际费用时标记“待对账”，失败尝试产生的已知费用也进入成本流水。

主表展开行可为每个规范模型选择默认策略：最低成本（默认）、平衡、成功率优先或稳定性优先。其它策略仍只会在等价、健康、报价毛利安全的候选中选择；策略和候选一起锁进报价。后台模拟报价与价格预览复用同一组候选快照。汇率快照可按货币对新增，记录来源、核验时间、有效期、操作人和证据摘要；控制台提供 USD/CNY 管理表单，服务端可保存其它币种对。过期货币对不参与换算，报价保存实际引用的汇率版本映射。管理员必须给出来源 URL 或审计原因，最多有效 90 天。

## 数据迁移

新增 [`040_model_pricing_routing_control_tower.sql`](../lib/db/migrations/040_model_pricing_routing_control_tower.sql)，不修改 019 或其他历史迁移。它扩展既有 `ai_models`、`ai_providers`、`provider_models`、`model_pricing`、路由、报价、任务、尝试和成本流水，并增加价格/售价版本、汇率快照、目录同步运行、目录审核、导入批次和账单对账记录。旧映射先标为待补规格，旧成本先作为待人工核价的历史证据保留。

本地在一次性 PostgreSQL 集群执行 040 成功；全链迁移演练则被更早的历史迁移挡住，见“验证结果”。因此 040 尚未在生产或真实应用数据库执行。发布前必须先修复或经项目负责人核准处置迁移 032 和 036 的兼容问题，再使用项目迁移流程对备份后的测试库、预发布库验证。040 采用增量、可前滚结构；应用回滚时保留新增表和列，先回退代码或禁用相关渠道，不手工删数据表。

## 渠道同步能力与价格来源

能力只表示已按官方文档验证并在本适配器实现的接口。余额或用量字段不会根据渠道名称猜测。

| 渠道 | 机器目录 | 机器价格 | 余额 | 用量 / 实际成本 | 核验边界 |
|---|---|---|---|---|---|
| MuAPI | 支持 `GET /api/v1/models` | 支持目录价格及按请求估价 | 支持 `GET /api/v1/account/balance` | 未接入可分页账户用量 API；生成响应的逐次费用存在时记录 | 动态估价只按具体请求获取；目录新增项待映射；价格变动先暂存审核。官方来源：[Models](https://muapi.ai/docs/models)、[Pricing](https://muapi.ai/docs/pricing)、[Credits](https://muapi.ai/docs/credits) |
| Alibaba / DashScope | 支持配置地域/workspace 后分页 `GET /api/v1/models` | 目录可返回官方价格结构，但货币/计费单位不直接作为本站成本 | 未验证 | 未接入；账户实际费用需账单对账 | 公开价格写独立待审版本，标记 UNKNOWN 货币/未核计费单位，绝不参加路由。官方来源：[Model Studio 列表模型](https://help.aliyun.com/en/model-studio/list-models) |
| OpenAI | 支持 `GET /v1/models`；当前适配器按官方文档读取单页 | 未验证机器价格 API | 未验证 | 未接入；需账单对账 | 官方 Models 参考未说明分页游标或总数；同步只暂存目录，不因未返回项下架已有目录。价格文档不由模型目录推断规格或售价。官方来源：[Models API](https://platform.openai.com/docs/api-reference/models) |
| Google | 支持分页 `models.list` | 未验证机器价格 API | 未验证 | 未接入；需账单对账 | 目录的 supported actions 不会自动当作本站完整规格。官方来源：[Models API](https://ai.google.dev/api/models) |
| Runway | 本适配器未实现目录 API | 本适配器未实现机器价格 API | 未验证 | 未接入；实际费用对账待实现 | 使用官方模型/价格文档人工核价；文档存在不代表机器同步已实现。来源：[Models](https://docs.dev.runwayml.com/guides/models/)、[Pricing](https://docs.dev.runwayml.com/guides/pricing/) |
| Kling、MiniMax、Luma | 未验证可用的机器目录接口 | 未验证机器价格 API | 未验证 | 未接入 | 使用官方来源链接、人工价格、核验时间和到期时间；到期后自动排除路由。 |
| 其他供应商 | 默认不支持 | 默认不支持 | 默认不支持 | 默认不支持 | 必须先按具体官方文档实现适配器和字段验证，未知能力显示人工维护。 |

目录按官方字段分页、认证、429/5xx 重试和解析错误均有边界检查。MuAPI 以 `name` 作为供应商模型 ID、以 `endpoint_url` 作为提交端点；固定 `cost` 按每请求解释，动态模型必须请求其 `estimate_endpoint`。OpenAI 官方 Models 参考未声明分页与总数，适配器不会假设可翻页或退役未返回目录。空目录不清除历史项；来源报告总数大于已抓取数或完整性未知时标记 partial，不退役任何目录项。动态价格、规格变化、单位/币种变化、大幅涨价进入审核；小幅自动生效默认关闭，需显式配置 `MODEL_PRICE_AUTO_PUBLISH_ENABLED=true` 和变动比例阈值，且人工锁价、动态估价不自动发布。

## 管理员操作

1. 在“渠道能力”核实接口状态、配置凭据和官方目录 endpoint；MuAPI 无需模型目录密钥，其他目录接口根据官方要求取服务端凭据。
2. 选择“同步模型”或“同步价格”。目录项只进“待映射 / 审核”；价格只进版本队列。同步任务在没有可验证 API 时显示真实不支持原因及人工维护入口。
3. 在“待审核模型”选规范模型，逐项确认供应商模型 ID、端点、版本、任务类型、输入/输出、分辨率、时长、质量、区域和许可。许可条件必须由管理员按合同核实记录；用户请求中的字段不能声明自己满足许可。先保存待审核，复核后批准。
4. 对没有机器价格 API 的映射，在“手动调价”填写价格类型、单位、币种、来源、来源核验时间和到期时间。无法核实时不要填估算数字；留空意味着未知，不参与最低价路由。仅超级管理员/系统管理员可加 7 日内到期的参数化保守成本上界，并填写币种、原因；模拟报价和调用日志会标注使用上界。
5. 在“模拟报价”输入图片或视频任务及规格。它只执行服务端计价和路由，不创建付费任务。比较候选、价格版本、汇率和拒绝原因，再发布站点售价/积分；低于毛利线由服务端阻止，限期覆盖需要高权限、原因与审计记录。
6. CSV/XLSX 导出不包含密钥。导入先 dry-run，检查稳定 ID、单位/币种/规格、重复行、冲突、人工锁价和毛利；管理员确认后，单批事务应用并生成可回滚版本。映射端点、能力和许可变更不能通过价盘导入越权生效。若导入价格已被后续版本取代，回滚会停止并提示人工处理，避免覆盖后续修改。
7. “调用明细”默认查近 30 天，可筛日期（最多 366 天）、用户/任务/模型、状态和渠道；仅展示规格摘要，不回传提示词或媒体地址。渠道实际费用缺失显示待对账。批次“回滚”仅撤销该导入批次引入的版本；通过人工审核发布的其他版本须另行管理。

仍需人工核价的完整清单随运行数据库实时变化，不能从代码里的显示名称静态推导。上线后在 `/admin/models` 选择“价格缺失或过期”，并导出 CSV/XLSX；此结果覆盖未映射、未审批、无有效可路由价格、价格过期和缺来源时间的条目。也可用下列只读查询枚举映射/价版队列：

```sql
SELECT m.id AS canonical_model_id, pm.provider_id, pm.provider_model_id,
       pm.provider_endpoint, pm.review_status AS mapping_status,
       pv.id AS price_version_id, pv.price_type, pv.billing_unit, pv.currency,
       pv.source_url, pv.source_api, pv.source_observed_at, pv.expires_at,
       CASE
         WHEN pm.id IS NULL THEN 'UNMAPPED'
         WHEN pm.review_status <> 'approved' OR NOT pm.enabled OR NOT p.enabled THEN 'MAPPING_REVIEW_OR_DISABLED'
         WHEN pv.id IS NULL THEN 'PRICE_MISSING'
         WHEN pv.source_observed_at IS NULL OR pv.source_observed_at < now() - interval '24 hours' THEN 'PRICE_STALE'
         WHEN pv.expires_at IS NOT NULL AND pv.expires_at <= now() THEN 'PRICE_EXPIRED'
         ELSE 'CHECK_SPEC_AND_SOURCE'
       END AS manual_review_reason
FROM ai_studio.ai_models m
LEFT JOIN ai_studio.provider_models pm ON pm.model_id = m.id
LEFT JOIN ai_studio.ai_providers p ON p.id = pm.provider_id
LEFT JOIN LATERAL (
  SELECT v.* FROM ai_studio.provider_model_price_versions v
  WHERE v.provider_model_id = pm.id AND v.status = 'active'
    AND v.price_type IN ('account_actual','aggregator','manual')
  ORDER BY CASE v.price_type WHEN 'account_actual' THEN 0 WHEN 'manual' THEN 1 ELSE 2 END,
           v.version_no DESC LIMIT 1
) pv ON TRUE
WHERE pm.id IS NULL OR pm.review_status <> 'approved' OR NOT pm.enabled OR NOT COALESCE(p.enabled,FALSE)
   OR pv.id IS NULL OR pv.source_observed_at IS NULL
   OR pv.source_observed_at < now() - interval '24 hours'
   OR (pv.expires_at IS NOT NULL AND pv.expires_at <= now())
ORDER BY m.id, pm.provider_id, pm.provider_model_id;
```

## 本地验证结果与未验证项

- `node --test tests/model-pricing-routing.test.mjs`：17 项通过，包括规格不等价拒绝、同规格最低价、管理员策略受毛利安全集限制、报价故障切换成本上限、未知/过期价不按免费、显式免费、过期人工上界、健康检查、端点/映射版本锁定、用户不能自报许可、视频按秒估价、带时间戳汇率换算、CSV/XLSX 注入防护、空/不完整目录保护，以及依据 MuAPI 官方字段解析模型 ID、提交路径和每请求价格。
- 使用一次性 PostgreSQL（43 个迁移文件成功应用，跳过已知阻塞的 032/036）运行 `tests/db/model-pricing-control.test.mjs`：1 项通过。除报价路由快照、报价/任务幂等与重复消费拒绝、导入预览/确认/审批后回滚和人工锁价冲突外，该测试还执行了代表性图像和视频流程：规范模型报价 → 冻结积分 → 任务创建 → 选路日志 → 注入测试适配器提交/视频轮询 → 注入归档接口 → 历史结果/积分结算 → 成本流水。图像未返回实际费用时保持 NULL/`pending_reconciliation`，视频记录适配器回报的费用。供应商适配器和对象存储归档均为测试替身；这只验证编排与数据库链路，不是实际渠道或真实存储端到端证明。
- 隔离 Next.js production build 通过，`/admin/models` 与 `/api/admin/models/control` 均进入构建产物；构建记录 next-intl 动态导入依赖分析提示，以及社区管理模块 `community.js` 引用了 repository 中未导出的两个函数的既有警告，均与定价控制台无关。
- 相关 `.js` 文件 `node --check` 通过。
- 一次性本地 PostgreSQL 集群完成 040 的 SQL 执行与新表存在性核对，但必须跳过两个既有迁移才能到达 040：032 BytePlus 商品映射引用不存在规范模型 `seedream-5.0`（23503）；036 admin_notes 按旧生产形状操作，但从 001 新建的表没有 `user_id`（42703）。完整 `scripts/migration-drill.mjs` 因 032 首先失败，不能声称整条迁移链通过。历史迁移没有被修改。
- 当前工作区没有 `.env.local`、`DATABASE_URL` 或 `TEST_DATABASE_URL`；无法验证已迁移的真实应用数据库、管理员登录/权限、真实报价写入、积分账本和生产快照模型清单。无法凭仓库种子或模型数量声称完整目录已经校价。
- 未执行付费 API、provider-backed 图像/视频生成、供应商真实轮询/结果归档、生产迁移或发布。仓库存在真实生成通道，但无可验证渠道凭据、非付费端到端链路环境和真实付费预算授权；生产可用状态仍为 NOT_READY。

## 灰度启用与回滚

1. 先修复或在迁移前预检中显式拦截 032、036 的历史链阻塞；在脱敏预发布数据库备份恢复后跑完整迁移与数据差异核对。不要只看健康接口。
2. 部署代码和 040 后先保持新映射待审、渠道停用、无价渠道排除；以官方文档和账号账单核验少量图像/视频映射与成本单位。先用模拟报价对比现有站点售价、积分和毛利。
3. 配置一条已验证直连渠道及一条等规格备用渠道；用管理员模拟和非付费 provider stub 验证报价、幂等、故障切换、失败退款、调用明细。真实付费测试单独授权并为每家渠道设明确预算后才能执行。
4. 仅在逐映射通过证据审核、价格有效、权限审计和成本回报后批准映射并小流量启用。观察报价拒绝原因、待对账、成本倒挂、失败率和账单差异，再扩量。
5. 出现异常先在总控台禁用具体渠道或恢复上一价格/站点售价版本；阻止新请求后对已报价/已提交任务保持原版本记录。应用需要回滚时回退应用版本，但保留向前兼容的 040 数据结构。导入批次使用批次回滚，账务数据通过正式冲正/对账流程处理，不直接删除流水。
