# KOYO Studio 全站 UI/UX 深度审计报告 (UI Audit Report)

**审计时间**：2026-09-16  
**审计目标**：`https://go.supdance.com/studio`（线上正式环境）+ `weysl33-boop/Open-Generative-AI`（代码仓库）  
**审计方法**：Runtime UI Audit（Puppeteer/Chrome 跨 10 种分辨率全路由真实渲染与状态触发）+ Source Code Static Audit（全站 255 个源码文件 AST/Regex 深度扫描）

---

## 1. 执行摘要与全站度量总览

| 审计维度 | 扫描统计 | 核心健康度评价 |
| :--- | :--- | :--- |
| **源码扫描覆盖** | 255 个文件 (`app/`, `components/`, `packages/studio/src/`) | 覆盖率 100% |
| **可访问路由与 Studio** | 41 个路由页面，17 个核心工作室 Workbench | 全站打通，但各工作室呈现孤岛化实现 |
| **硬编码 HEX 颜色** | 散落超 40 种，总出现频次 **780+ 次** | 极度严重：`#22d3ee` (294次), `#84cc16` (80次), `#b5f500` (30次) |
| **手写内联 SVG** | **276 个** 原生 SVG 散落于各组件 | 图标系统严重撕裂，缺少统一图标库抽象 |
| **Magic Numbers (像素硬编码)** | 发现 80+ 处任意像素类（如 `h-[38px]`, `w-[240px]`） | 破坏 4px/8px 网格规律 |
| **圆角种类数量** | 出现 12+ 种圆角定义（从 `rounded-[2px]` 到 `rounded-[2rem]`） | 视觉层次失控，部分组件弧度过于夸张 |
| **测试视口覆盖** | 10 个全尺寸（1920×1080 至 375×812，含 Desktop/Tablet/Mobile） | 移动端多处按钮文字挤压、抽屉与遮罩层级冲突 |

---

## 2. 详细子系统审计

### 2.1 当前 UI 架构与组件组织
- **现状**：
  - 项目根目录 `components/ui/` 中存在一套 shadcn 风格的基础组件（`button.jsx`, `input.jsx`, `select.jsx`, `card.jsx` 等）。
  - 然而，主产品 `packages/studio/src/components/*` 中的 17 个 Studio（包括 `ImageStudio.jsx`, `VideoStudio.jsx`, `CinemaStudio.jsx`, `ClippingStudio.jsx` 等）以及 `PromptComposer.jsx` **几乎完全没有调用** `components/ui/` 中的任何 Primitive。
  - 每个 Studio 都在自身 JSX 内部通过极其冗长且复杂的 Tailwind class 重新实现按钮、卡片、输入框、下拉框、状态徽章，形成了严重的“组件孤岛与重复发明”。

### 2.2 颜色体系与视觉漂移
- **硬编码主色**：
  - 荧光青色 `#22d3ee` 滥用达 294 次，作为背景、文字、边框、发光阴影等多种完全不同语义的载体。
  - 酸橙黄绿色 `#84cc16` 滥用 80 次、荧光柠檬绿 `#b5f500` 30 次、`#a3e635` 21 次。同一个产品中青色与高亮黄绿荧光色激烈争夺视觉焦点。
- **暗色基底破碎**：
  - 扫描发现多达 18 种微小色差的暗色 HEX 背景：`#030303`, `#050505`, `#070708`, `#0a0a0a`, `#0a0a0b`, `#0c0c0e`, `#0d0d0f`, `#0f0f12`, `#111111`, `#131316`, `#161618`, `#16161a`, `#18181b`, `#181a22`, `#1a1c23`, `#1c1c22`, `#1c1f26`, `#1f222d`。
  - 没有统一的 `--bg-canvas` / `--bg-surface` / `--bg-surface-raised` 阶梯，导致不同弹窗、卡片和面板叠加时边界模糊或突兀。
- **发光与霓虹光效**：
  - 出现 `shadow-[#22d3ee]`, `shadow-[0_0_12px_rgba(132,204,22,0.4)]`, `shadow-[0_4px_25px_rgba(226,249,36,0.35)]` 等 10 余种过度弥散的 glow 阴影，呈现廉价电竞/赛博朋克风，严重偏离了 “Premium AI Creative Workspace” 的克制、电影感与静谧专业方向。

### 2.3 字体与字号体系
- **字体族**：全局使用 `Inter, system-ui, -apple-system, sans-serif`。但缺乏对中文环境的高品质 Fallback（如 `PingFang SC`, `Microsoft YaHei`）。
- **字号与字重随意**：
  - 页面中同时存在 `text-[10px]`, `text-[11px]`, `text-xs (12px)`, `text-[13px]`, `text-sm (14px)`, `text-base (16px)`，缺乏规范化的 Type Scale。
  - 同一级别的 Action 按钮，有的使用 `font-bold`，有的使用 `font-medium`，有的使用 `font-semibold`。
- **字间距与行高**：
  - 大量局部手动设置 `leading-none`, `leading-tight`, `leading-relaxed` 或硬编码 `tracking-[-0.025em]`，导致中英混排时视觉重心跳跃。

### 2.4 圆角与阴影体系
- **圆角不一致**：
  - 同一个页面内同时存在：`rounded-[2px]`, `rounded-[4px]`, `rounded-md (6px)`, `rounded-lg (8px)`, `rounded-xl (12px)`, `rounded-2xl (16px)`, `rounded-[28px]`, `rounded-[2rem] (32px)` 以及 `rounded-full (9999px)`。
  - `PromptComposer.jsx` 的外部容器使用了夸张的 `rounded-[2rem]`，而其内部的参数控件使用了 `rounded-md`，操作按钮又使用了 `rounded-full`，视觉形态冲突明显。
- **阴影缺少层级规范**：
  - 各组件随机使用 Tailwind `shadow-lg`, `shadow-2xl`, 或内联 `shadow-[0_15px_50px_rgba(0,0,0,0.8)]`，缺乏明确的 Elevation（海拔）规则。

### 2.5 控件高度与契约 (Height Contract)
- **高度漂移**：
  - 核心控件高度严重不一：Prompt 控制按钮为 `h-[38px]`，全局 Header 为 `h-[56px]`，通用 Input 为 `h-8 (32px)` 或 `h-10 (40px)`，主操作按钮为 `h-[46px]`，图标按钮为 `h-6`, `h-7`, `h-8`, `h-9`。
  - 并排出现的 Control 经常因 1-2px 的高度差造成基线错位。

### 2.6 按钮体系 (Button Primitive)
- **碎片化严重**：
  - 没有统一的 Button 组件统一管理状态，各页面各自书写：
    - `bg-[#22d3ee] text-black px-7 py-3 rounded-full font-bold ...`
    - `bg-gradient-to-r from-cyan-500 to-blue-500 ...`
    - `border border-white/10 hover:border-white/20 bg-white/5 ...`
  - 缺乏标准的 Loading 状态指示器与 Disabled 禁用态处理，部分按钮 Disabled 仅简单加上 `opacity-50`，而鼠标依然显示 pointer 或缺乏清晰不可点击反馈。

### 2.7 表单与输入控件 (Input / Textarea)
- **Prompt Composer 架构**：
  - 作为核心一级组件，其封装存在硬编码问题（如固定定位 `bottom-4`，内联大量十六进制颜色与自定义滚动条类）。
  - Textarea 的 Focus 态直接使用 `focus:outline-none`，移除了原生辅助焦点环，违反了 WCAG 2.2 无障碍键盘聚焦可见性准则。
- **其它 Input**：
  - 缺乏统一的暗色输入框规范，部分输入框背景为透明，部分为 `bg-input/30`，部分为 `#16161a`。

### 2.8 下拉框、选择器与模型选择 (Select / Dropdown / Model Picker)
- **触发器 (Trigger)**：
  - 样式、高度、内边距、Chevron 图标各不相同，有的使用原生 `<select>`，有的使用自定义 Popover，有的使用 Radix UI。
- **下拉菜单容器 (Menu Container)**：
  - 边框颜色从 `border-white/[0.06]` 到 `border-white/10`，背景模糊从 `backdrop-blur-md` 到 `backdrop-blur-2xl`，阴影与内边距不一致。

### 2.9 导航与页面布局 (Navigation & Shell)
- **Header 布局**：
  - `StandaloneShell.js` 中 Header 高度为 56px，在桌面端较紧凑，但在移动端与移动抽屉切换时，按钮与通知容易拥挤。
- **Studio Tabs 导航**：
  - 17 个工作室全部堆叠在二级导航中，采用横向滚动。在 1024px 与 768px 平板尺寸下，右侧渐变遮罩容易误遮挡最后一个选项，且滚动条偶现原生双轨。

### 2.10 图标系统 (Icons)
- **276 处内联 SVG 混乱**：
  - 代码库中充斥着复制粘贴的内联 `<svg>`，stroke-width 有的为 1.5，有的为 2，有的为 3，尺寸从 10px 到 24px 随意变化。
  - 点击区域（Touch Target）未做外延规范，16px 图标仅有 16-20px 命中区域，极易误触或难以点中。

### 2.11 模态框与抽屉 (Modal / Dialog / Drawer)
- **弹窗视觉割裂**：
  - `ApiKeyModal.js`, `AuthModal.js`, `DrawModal.jsx` 分别使用了各自编写的 Overlay 与 Dialog 容器。
  - 遮罩层不一致（有的 `bg-black/50`，有的 `bg-black/80 backdrop-blur-sm`），圆角和关闭按钮（X）位置、尺寸不一。
  - 在移动端直接沿用桌面端弹出逻辑，导致超屏或键盘弹出时遮挡提交按钮。

### 2.12 动效系统 (Motion)
- **过度 transition-all**：
  - 很多元素粗暴声明 `transition-all duration-300`，引起重排重绘开销。
  - 缺少统一的标准时间（120ms/180ms/240ms）和缓动曲线（Ease Curves）。

### 2.13 响应式全尺寸扫描问题 (Responsive Scanning)
- **Mobile (375x812, 390x844, 430x932)**：
  - Prompt Composer 底部在开启软键盘或小屏状态下易遮挡画布内容；
  - 底部操作栏（Generate, Media Upload, Ratio）并排空间严重受限，按钮文字发生换行或被压缩；
  - 顶部工作室横向导航在移动端滑动时缺少清晰的左右可滚动提示。
- **Tablet (768x1024, 1024x768)**：
  - 左右分栏布局与底部悬浮 Composer 存在重叠死角。

---

## 3. 核心问题分级清单 (P0 - P3)

### 🔴 P0 级别（阻碍操作 / 排版崩溃 / 移动端不可用）
1. **[P0-01] 移动端 Prompt Composer 空间挤压**：在 375px/390px 视口下，Prompt 操作栏与生成按钮并排溢出，导致换行或遮挡画布底层交互。
2. **[P0-02] Focus Visible 焦点环被移除**：Prompt Composer 及多个 Studio 控件使用 `focus:outline-none` 且未提供替代 `:focus-visible` 环，严重违反 WCAG 2.2 AA 无障碍准则。
3. **[P0-03] 17 个 Studio 孤岛式代码实现**：各 Studio 手写独立 button/input/card/popover 逻辑，阻碍统一维护，任何全局修改均需复制修改 17 处。

### 🟠 P1 级别（视觉严重冲突 / 多套并存 / 品牌降级）
1. **[P1-01] 荧光色与霓虹发光光效泛滥**：`#22d3ee`, `#84cc16`, `#b5f500` 与多重 glow 阴影并存，破坏电影级 AI 工作空间的高级质感。
2. **[P1-02] 暗色背景层级混乱（18 种不同 HEX）**：缺乏统一的 Semantic Background Tokens，导致卡片、弹窗与画布明度关系破碎。
3. **[P1-03] 276 个散落手写内联 SVG**：图标大小、stroke-width 与视觉重量完全脱节。
4. **[P1-04] 主操作 Button 缺乏统一规范**：同一个生成动作在不同页面出现 3 种以上外观实现（从全圆角纯青色，到渐变色，再到半透明边框）。

### 🟡 P2 级别（样式微漂移 / 间距不准 / 控件高度不齐）
1. **[P2-01] 控件高度契约断裂**：32px, 38px, 40px, 46px 混乱混用，横向排列时上下参差不齐。
2. **[P2-02] 圆角系统混乱（12 种圆角值）**：从 2px 到 32px 随意搭配，缺乏系统级对应关系（Input/Button/Card/Modal）。
3. **[P2-03] 模态弹窗与下拉框规范不一**：ApiKeyModal 与 AuthModal、Studio Popover 背景遮罩与内边距不同。
4. **[P2-04] 间距缺少 4px 网格约束**：存在 `p-[3px]`, `gap-[7px]` 等无理 Magic Number。

### 🟢 P3 级别（动效微瑕 / 体验打磨 / 代码洁癖）
1. **[P3-01] `transition-all` 滥用**：应收敛为针对 `transform`, `opacity`, `background-color`, `border-color` 的精准过渡。
2. **[P3-02] 滚动条样式不一**：部分区域隐形，部分区域原生，缺乏精致暗色自定义滚动条。
3. **[P3-03] 图标按钮 Touch Target 不足**：部分 16px 图标周围无 36-40px 的外延触摸热区。

---

## 4. 解决策略与重构路线图

为彻底根治上述问题，后续执行必须坚决落地：
1. **建立唯一代码级 Design Token Source of Truth (`lib/design-tokens.js` + `app/globals.css`)**；
2. **打造全套标准 UI Primitive 组件库 (`components/ui/*`)**；
3. **彻底规范 Prompt Composer 一级组件**；
4. **建立 `/design-system` 开发环境全态可视化预览页**；
5. **分阶段将核心 Studio 与 StandaloneShell 迁移接入共享 Primitive**；
6. **建立 Visual Regression 截图基线并固化长期强制开发规范**。
