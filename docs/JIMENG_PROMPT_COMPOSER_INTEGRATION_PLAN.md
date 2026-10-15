# 即梦输入框研究与 KOYO 融合执行方案

记录时间：2026-10-12（Asia/Taipei）。参考站点为 `https://jimeng.jianying.com/ai-tool/home/`；本站线上对照为 `https://www.supdance.com/`。用户后续授权本次最多消耗 3 积分，已完成一单限额内的真实生图。浏览器可见请求只能证明即梦对外暴露的前后端链路，不能揭示其内部 Provider 路由或成本。

## 已观察到的交互契约

| 场景 | 浏览器实测 | 融合要求 |
| --- | --- | --- |
| 首页生成模式 | 生成/画布分段切换；输入区底部集中放创作类型、模型、规格、价格和提交 | 保持 KOYO 的品牌 token 与 20px Composer、16px 输入框、38px 参数控件；入口切换只改变可用功能，不丢失草稿 |
| 图片模型切换 | Seedream 5.0 Pro 显示 1:1、2K、数量 2 和 8 积分/张；切到 5.0 Flash 后数量 4、3 积分/张 | 由所选模型能力重算合法规格、附件上限和报价；切换时修正失效选项；价格必须由本站服务端报价确认 |
| 图片规格 | Flash 的 16:9、2K 显示 2560×1440；比例、分辨率、数量集中在一个浮层 | 规格状态用规范化模型 ID 和参数保存；尺寸仅展示模型契约允许的值 |
| 视频模型/工作流 | Seedance 2.0 mini 提示最多 12 个素材；切到 2.5 提示最多 50 个；“全能参考”改为“首尾帧”后输入区变为双上传位、画幅显示“自动” | 视频的素材位与上限按模型及工作流定义，前后端同时校验，不能从参考站点文案推断本站 Provider 支持同样能力 |
| 输入动效 | 参考页 textarea 的高度/位移过渡约 350ms，曲线 `cubic-bezier(0.15, .75, .3, 1)`；模型与规格选择为局部浮层，切换后原位更新摘要 | 只吸收“稳定布局、即时反馈、局部浮层”模式，具体动效遵守本站设计 token 和减少动态效果设置 |
| 网络/模型响应 | 真实提交触发 workspace/create → aigc_draft/generate → get_history_by_ids；任务状态从 20 到 50，历史结果 1/1。页面余额 20→17，刷新后仍为 17 | 本站应采用自己的报价/Job/Provider/Asset/积分契约；即梦内部实际 Provider、成本、失败回退仍不可由这次成功交易推断 |

### 授权额度内的即梦真实交易

- 使用无个人资料提示词，Seedream 5.0 Flash，16:9、2K、数量 1；提交前页面显示 3 积分/张、账户 20 积分。
- 单次点击提交后，`POST /mweb/v1/workspace/create` 和 `POST /mweb/v1/aigc_draft/generate` 均返回 HTTP 200；生成响应 `ret=0`，返回模型键 `high_aes_general_v50_flash`、任务/历史 ID `47359774478092`，初始状态 20。
- 提交请求的 `draft_content.component_list[0].abilities.generate.core_param` 将界面选择绑定为 `model=high_aes_general_v50_flash`、`image_ratio=3`、`large_image_info={width:2560,height:1440,resolution_type:'2k'}`；`abilities.gen_option.gen_count=1`。`image_ratio=3` 是该请求中的内部枚举，本次对应页面 16:9，不能直接移植到本站模型参数。
- 随后的 `POST /mweb/v1/get_history_by_ids` 返回 HTTP 200，状态 50、`finished_image_count=1`、`total_image_count=1`、`item_list` 长度 1。页面出现白色陶瓷杯结果图；账户显示 17 积分，刷新结果页后历史和 17 积分仍在。结果页：`https://jimeng.jianying.com/ai-tool/generate?workspace=23299324633868`（需该账号登录）。
- 已验证的是该参考站点的一笔成功交易及用户侧扣费。未验证实际内部 Provider 名称/成本、可下载文件持久性、跨设备、失败退款、重复提交与长期稳定性；不把 HTTP 200 单独算作成功。

## 本站事实与差距

- 本站线上首页可见 Nano Banana、1:1、数量 1、“消耗 15 积分”及生成/画布切换。这是展示价格，不能证明实际报价和最终扣费相同。
- 2026-10-12 19:22 台湾时间公开 `/api/ready` 返回 HTTP 503、`status=not_ready`、`providers=unhealthy`。生产根目录是 `/home/wwwroot/AI/domain/supdance.com/web`，当时 HEAD `39c0281`、工作树约 542 项变更、BUILD_ID `zv0mUj0PZCsBVg7leYs5T`。这是时间点快照，执行前须重新核实。
- 本地首页 `HomeStudioPromptComposer` 负责图像草稿、模型/规格、上传、积分标签与跳转；图像/视频工作室分别负责模型能力与提交。当前生成客户端在提交时调用 `/api/generation/quote` 和 `/api/generations`，但报价失败存在静默回退路径，首页标签本身并非服务端报价。应把“可售状态与确认报价”作为提交门槛审计。
- 本次本地改动将文本框、`@` 引用候选、键盘行为组合成 `PromptInputField`，首页、图像工作室和视频工作室已改用同一组件。附件、规格、报价、任务和支付仍由各自业务层控制；未发布到生产。

### 本地验证范围

- `npm run build:studio` 已通过；首页 Composer 的 JSX 也已由 Babel 单独编译通过；`PromptInputField` 经独立打包和 React 服务端渲染验证了 textarea、value 与无障碍名称；所改文件的 `git diff --check` 通过。
- 全站 `npm run build` 在优化构建阶段长时间没有进一步诊断，已手动停止，因此不能声称全站构建或浏览器回归通过。发布前须补齐这两项，并对首页、图片、视频输入框执行键盘、`@` 候选、上传、切换模型和移动端回归。

## 公共组件调用约定

`PromptInputField` 位于 `packages/studio/src/components/prompt/PromptInputField.jsx`，也通过 `studio/PromptInputField` 导出。它接收 `value`、`onChange`、`placeholder`、可选 `mention`/`mentionTitle`、可选 `onEnter` 和标准 textarea 属性，并转发 ref。首页与图像工作室传入 `usePromptMention()`，视频工作室只传基础文本属性。提交时由调用方校验身份、模型、媒体、服务端报价、积分与任务状态。

```jsx
<PromptInputField
  ref={textareaRef}
  value={prompt}
  onChange={(event) => setPrompt(event.target.value)}
  placeholder={copy.promptPlaceholder}
  mention={mention}
  mentionTitle={copy.mentionTitle}
  onEnter={handleSubmit}
/>
```

## 分批实施和验收

1. **P0：生产事实与恢复点。** 固定生产 HEAD、脏文件清单、构建版本、模型与 Provider 状态；完整备份源码、配置、数据库、对象存储及可回滚构建，并验证恢复证据。现有脏树不得重置或覆盖。
2. **P0：模型能力和报价。** 建立单一规范化模型 ID、Provider route、创作类型、可用素材、比例、分辨率、数量、时长与计价单位。无可用路由/准确报价的选项禁用并说明原因。前端摘要显示服务器报价、有效期与当前订阅折扣，提交和确认使用同一参数快照。
3. **P0：真实生成事务。** 身份校验 → 报价 → 带幂等键提交 GenerationJob → 路由到 Provider → 轮询/回调终态 → 私有 Asset → 历史/下载 → 正确扣费或失败退款。保存原始 Provider task ID；超时先查原任务再重试；提交与回调幂等。
4. **P1：输入体验融合。** 在统一组件上按模型/模式呈现附件位、`@` 主体引用、规格浮层和草稿恢复。复用本站设计 token；仅在真实能力可用时展示相应选项，兼容移动端、键盘、中文输入法和减少动态效果设置。
5. **发布闸门。** 先完成本地 build 和可用性检查，再于受控窗口部署。使用获授权的独立测试账号及明确积分上限，逐模型留存脱敏证据：模型/规格/服务端报价、job、Provider task/终态、Asset 与历史、余额前后、失败退款。未实测的模型标记 `Unknown/Disabled`，不得标记 `Verified`。

## 可复制给开发 AI 的提示词

> 以 `https://www.supdance.com/` 和生产 `/home/wwwroot/AI/domain/supdance.com/web` 为准，先核实 HEAD、脏树、`/api/ready`、Provider、模型路由和可恢复备份，保护现有修改。阅读 `AGENTS.md`、`docs/UI_DESIGN_SYSTEM.md`、`docs/UI_REPAIR_INSTRUCTION.md` 与本方案。复用 `PromptInputField`，将首页、图像、视频和后续创作入口统一到“模型能力 → 附件/规格 → 服务端报价 → 幂等 GenerationJob → Provider 终态 → 私有 Asset/历史/下载 → 扣费或退款”的契约；不要复制即梦品牌、价格或假设其模型 API 等于本站能力。按 P0 先修 Provider/报价/路由和真实用户交易，再做动效与其它模式。每批交付文件清单、构建/浏览器结果、脱敏 E2E 证据、费用、未验证项和回滚办法；没有授权账号与积分上限时停止真实付费生成。
