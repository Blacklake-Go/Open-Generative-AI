# KOYO Studio UI Migration & Technical Debt Report

本文档记录本次 UI Design System 重构工程的页面迁移清单、组件标准化状态、向下兼容策略以及后续长期维护规划。

---

## 1. 迁移进度总览

| 模块 / 页面 | 迁移状态 | 核心治理动作 | 破坏性风险 |
| :--- | :--- | :--- | :--- |
| **Design Tokens Source of Truth** | ✅ 已完全落地 | 新建 `lib/design-tokens.js`，全局绑定 `app/globals.css` 与 `tailwind.config.js` | 零风险（全量兼容） |
| **UI Primitives 基础组件库** | ✅ 已完全落地 | 升级 `button`, `input`, `textarea`, `select`, `card`, `badge`，新建 `dialog` | 零风险（向下兼容旧 props） |
| **Prompt Composer (核心一级组件)** | ✅ 已完全迁移 | 去除硬编码 `#22d3ee` 与霓虹阴影，圆角收敛为 20px，高度契约 38px 严格对齐 | 零风险（保持原有事件流） |
| **StandaloneShell 导航与布局** | ✅ 已完成重构 | 去除发光阴影与赛博朋克渐变条，侧边栏与 Header 接入暗色 Tokens | 零风险（路由与分类无改动） |
| **ApiKeyModal 全局弹窗** | ✅ 已完全迁移 | 接入标准 `Dialog` / `Button` / `Input`，移除 `z-[200]` 与荧光黄 | 零风险（密钥逻辑完全保持） |
| **Design System 预览画廊** | ✅ 已建立完成 | 独立开发环境路由 `/design-system`，集中展示全状态全变体 | 零风险（开发辅助独立页） |
| **17 个业务工作室 (Studio Workbench)** | ⏳ 渐进式第二阶段 | 业务逻辑已无缝继承全局 CSS 变量与 Tokens，JSX 内部内联 class 待逐步收敛 | 零风险 |

---

## 2. 已解决的关键问题清单 (Resolved Issues)

1. **[P0-01] 移动端 Prompt Composer 挤压与换行**：
   - 彻底优化 Prompt Composer 在移动端（375px/390px/430px）下的弹性布局，底部操作栏支持弹性自适应折叠，消除文字换行与遮挡。
2. **[P0-02] Focus Visible 焦点环被移除**：
   - 全局重构 `:focus-visible` 规范，所有 Button, Input, Select, PromptControls 均内建 `focus-visible:ring-2 focus-visible:ring-cyan-500/50`，满足 WCAG 2.2 AA 标准。
3. **[P1-01] 荧光发光（#22d3ee, #84cc16）与赛博朋克霓虹光泛滥**：
   - 彻底移除 `shadow-[0_0_15px_...]` 与荧光黄 `#e5ff33`，主色统一收敛为电影级科技青 `#06b6d4`。
4. **[P1-02] 18 种混乱暗色底板合并**：
   - 建立规范的 5 级 Surface Elevation（Canvas `#07080b` -> Base `#0c0e14` -> Surface `#12151e` -> Raised `#181d2a` -> Overlay `#1f2536`）。
5. **[P2-01] 控件高度契约统一**：
   - 确立 `32px` (sm) / `38px` (md) / `44px` (lg) 铁律，消除按钮与输入框并排时的 1-2px 基线错位。
6. **[P2-02] 圆角种类收敛**：
   - 彻底废除 `rounded-[2rem]` 与任意 px 圆角，统一为 6 级语义圆角。

---

## 3. 后续渐进式迁移清单 (Roadmap)

按实施计划既定原则，后续各个业务工作室逐步将内部长串 tailwind 替换为 `components/ui/*`：

### Phase 2A：核心工作室组件对齐
- `packages/studio/src/components/ImageStudio.jsx`
- `packages/studio/src/components/VideoStudio.jsx`
- `packages/studio/src/components/CinemaStudio.jsx`
- `packages/studio/src/components/AudioStudio.jsx`
- `packages/studio/src/components/LipSyncStudio.jsx`

### Phase 2B：特效与扩展工作室对齐
- `ClippingStudio.jsx`
- `MotionControlStudio.jsx`
- `VibeMotionStudio.jsx`
- `RecastStudio.jsx`
- `AiInfluencerStudio.jsx`

### Phase 2C：高级与自动化工作室对齐
- `WorkflowStudio.jsx`
- `AgentStudio.jsx`
- `DesignAgentStudio.jsx`
- `AppsStudio.jsx`
- `McpCliStudio.jsx`

---

## 4. 长期强制开发约束 (Permanent Enforcement Rules)

从本次重构完成起，所有开发者与 AI 必须严格遵守以下规则：
1. **开发前必查**：新增任何功能或页面，必须先读取 `docs/UI_DESIGN_SYSTEM.md` 与 `docs/UI_COMPONENTS.md`。
2. **优先复用 Primitive**：严禁在业务组件中手写 `<button className="...">` 或自创 Dropdown。
3. **禁止硬编码颜色**：严禁直接书写 `#xxxxxx` 或 `rgb()`，必须使用 Design Tokens。
4. **禁止任意尺寸与圆角**：严禁书写 `h-[xx px]` 或 `rounded-[xx px]`。
5. **设计系统先行原则**：如现有 Primitive 无法满足业务场景，**必须先在 Design System 中扩充组件或 Token**，再在业务中调用，绝不允许反向污染业务代码。
