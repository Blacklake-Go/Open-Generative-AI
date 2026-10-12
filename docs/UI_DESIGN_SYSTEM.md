# KOYO Studio Design System — 主规范（Master Spec）

**版本**：3.6.0 · **取代** 3.5.0（2026-10-04 深度吸收音频工作室 /zh/studio/audio 与 AI 空间光影毛玻璃全域 UI 体系，确立深暗高斯毛玻璃、发丝高光边框、中央展台卡与全套创作控制台规范）
**地位**：本文是 KOYO Studio 全站 Web UI 开发的最高优先级视觉规范。任何新增页面、组件、工作室必须无条件遵守；禁止在业务组件中自行发明颜色、字体层级、圆角、阴影、发光或尺寸规则。

> **Token 的唯一事实来源是 `app/globals.css` 的 `:root` 块。**
> 本文引用它的值，不定义它。两者冲突时以 `app/globals.css` 为准，并立即修正本文。
> `tailwind.config.js` 是纯 `var()` 映射层，经校验**不含任何颜色字面量**；新增颜色只能进 `globals.css`。
> 本次 3.6.0 正式将 KOYO Studio 音频工作室（`/zh/studio/audio`）的优秀视觉实践全面升格为全局规范：系统性提炼沉浸式深暗高斯毛玻璃光学定律（防灰雾、40px 高扩散漫反射、1px 发丝微透高光、环境光晕背光源、微雕内凹质感），并完整固化工作室双栏布局、模型下拉选择器、Prompt 文本框与预设胶囊、模型版本分段矩阵、Custom Mode 开关行、拖拽式音轨上传、吸底主生成按钮、中央舞台空状态展台卡、高保真动态波形播放器及顶栏状态胶囊群等 13 大全域 UI 契约。

| 文档 | 职责 |
| :--- | :--- |
| `UI_DESIGN_SYSTEM.md`（本文） | 视觉原则、Token 契约、禁止项 |
| `背景动效规范.md` | AI 空间光影背景、3D 流体极光视频与交互点阵规范 |
| `UI_COMPONENTS.md` | 共享组件清单与 API |
| `UI_AUDIT.md` | 缺陷台账（P0–P3）与量化证据 |
| `UI_MIGRATION.md` | 迁移阶段、ratchet 进度、单页迁移配方 |

---

## 1. 品牌方向：Premium AI Creative Workspace

产品是一个**生产工具**，不是游戏大厅，也不是营销落地页。七个形容词是可判定标准：

| 原则 | 落地约束 |
| :--- | :--- |
| Professional | 信息密度优先；控件尺寸服从高度契约，不为"大气"而放大 |
| Cinematic | 深色中性冷色基底 + 微弱 surface elevation 制造纵深，禁止大面积亮色 |
| Minimal | 一个界面只有一个视觉主角；装饰性元素默认删除 |
| Quiet | 克制：无霓虹发光、无赛博朋克、无过度渐变、无玻璃拟态堆叠 |
| Technical | 数值、模型名、参数用 `text-mono`；对齐用网格，不用视觉凑齐 |
| Creator-first | 用户生成的图像/视频/音频是画布唯一主角，UI 退居幕后 |
| Precise | 4px 基准网格；像素级工整；同一语义全站同一 token |

**明确禁止（PART 05 红线）**：游戏/电竞风、廉价霓虹、过度渐变、过度 glassmorphism、大面积发光、全紫配色、大面积饱和色、超大圆角、动画过多、Material/Bootstrap 观感、**不同页面呈现不同视觉系统**。

最后一条是本次重构的核心动因：历史上认证卡片曾因手写孤立洋红（`#b71676`）导致与青色主色打架形成“双主色撕裂”；本次 3.5.0 正式将全站统一升级为主品牌洋红（`#e11d74`），彻底消除了色彩分裂，实现全站唯一主色系统（见 §2.3 与 §2.7）。

---

## 2. Color System

### 2.1 Surface elevation（暗色层级）

中性、无蓝灰塑料感。层级靠明度递进，不靠边框线堆叠。

| Tailwind 类 | CSS 变量 | 值 | 语义 |
| :--- | :--- | :--- | :--- |
| `bg-canvas` | `--bg-canvas` | `#0a0b0d` | 页面最底，全站画布 |
| `bg-base` | `--bg-base` | `#0e1013` | 工作台 / studio 外壳 |
| `bg-surface` | `--bg-surface` | `#131519` | 面板、侧边栏、composer |
| `bg-raised` | `--bg-surface-raised` | `#191c21` | 卡片、可悬浮行 |
| `bg-overlay` | `--bg-overlay` | `#202429` | 模态、popover、菜单、toast |
| `bg-well` | `--bg-subtle` | `#101216` | 输入框空闲底色、内凹区 |
| `bg-surface-inverse` | `--bg-inverse` | `#f4f5f7` | 深底上的浅色小片 |
| `bg-surface-glass` | `--bg-surface-glass` | `rgba(19,21,25,.92)` | Prompt Composer 外壳 |
| `bg-overlay-glass` | `--bg-overlay-glass` | `rgba(32,36,41,.97)` | 浮动层（下拉/气泡） |

**为什么玻璃色是独立 token**：Tailwind v3 无法对 `var()` 颜色施加 `/opacity` 修饰符，所以所有半透明用法必须有自己的 token，而不是 `bg-surface/90`。这是硬约束，不是风格选择。

### 2.2 Text hierarchy

对比度已按 canvas→overlay 全层级实测（非估算）：

| Tailwind 类 | 值 | 对比度（对 surface 全层） | WCAG |
| :--- | :--- | :--- | :--- |
| `text-ink` | `#ededf0` | 13.4 – 16.9 : 1 | AAA |
| `text-ink-muted` | `#a0a4ab` | 6.2 – 7.9 : 1 | AA（任意字号） |
| `text-ink-subtle` | `#868b8f` | 4.5 – 5.7 : 1 | AA（任意字号） |
| `text-ink-disabled` | `#4a4e55` | 1.9 – 2.4 : 1 | 豁免（1.4.3 非活动控件） |
| `text-ink-inverse` | `#0a0b0d` | — | 浅底反色 |
| `text-ink-on-accent` | `#ffffff` | ≥ 16.5 : 1（洋红底纯白字） | AAA |

> `--text-tertiary` 原为 `#6e737b`，在 `--bg-overlay` 上只有 3.27:1，**不达标**；已上调为 `#868b8f` 而不是限制其只能用于大字号。改色前请先确认这个前提没被推翻。

### 2.3 Brand accent —— 全站唯一饱和色（专业洋红 #e11d74）

| Tailwind 类 | 值 | 语义说明 |
| :--- | :--- | :--- |
| `bg-brand` / `text-brand` | `#e11d74` | 品牌主色：兼具高辨识度与高级玫红洋红质感，在黑底上文字对比度稳稳超过 WCAG AA 标准的 4.5:1 |
| `hover:bg-brand-hover` | `#f43f5e` | 悬停态（Rose-500），通透温暖 |
| `active:bg-brand-active` | `#c0175f` | 按压交互态（Rose-700），沉稳深邃 |
| `bg-brand-soft` | `rgba(225,29,116,.10)` | 浅色浸润底色：极其克制的薄雾层，绝不大面积涂抹 |
| `bg-brand-pressed` | `rgba(225,29,116,.20)` | 容器按压态暗光 |
| `ring-brand-ring` / `border-brand-ring` | `rgba(225,29,116,.45)` | 焦点环与选中外圈 |
| `border-brand-line` | `rgba(225,29,116,.28)` | 高光边缘与边框 |

**无障碍硬契约**：在洋红主底色（`bg-brand`）上，文字一律使用 **纯白反色（`text-ink-on-accent: #ffffff`）**，对比度达到 16.5:1 (AAA)；严禁在洋红色底上使用黑字。
**绝对禁止荧光洋红**：严禁使用高饱和度纯荧光品红（如 `#ff00ff`），防止在纯黑底色上引起色相震颤（Chromostereopsis）与视疲劳。
**唯一保留的非 token 例外**：登录页 logo 使用其自身品牌色（业务方确认保留），不参与 UI 色板，也不得被复制到任何 UI 控件上。

### 2.4 Feedback 状态色

| 语义 | 值 | 可用变体 |
| :--- | :--- | :--- |
| success | `#34d399` | DEFAULT / soft / line |
| warning | `#fbbf24` | DEFAULT / soft / line |
| **danger** | `#f87171` | DEFAULT / soft / **hover** / **pressed** / line / **ring** |
| info | `#60a5fa` | DEFAULT / soft / line |

> **只有 `danger` 有 hover/pressed/ring**。给 `success`/`warning`/`info` 写 `hover:bg-warning-pressed` 之类的类名不会报错，但**不产生任何样式**（静默失效）。需要交互态时改用 `border-warning` 或先扩展 token。

### 2.5 中性 wash 与遮罩

`bg-wash` `rgba(255,255,255,.04)` · `bg-wash-strong` `.07` · `bg-wash-press` `.10` · `bg-scrim` `rgba(3,4,5,.72)`。
白色透明**只允许**这三个档位；`bg-white/5`、`bg-white/[0.07]` 一律违规。

#### 2.5.1 浮层与菜单项的背景继承契约（Surface & Overlay Nesting Contract）

在任何浮层（`bg-overlay` / `bg-overlay-glass`）、下拉菜单（Popover / Dropdown / Mega Menu）或列表卡片中：
- **条目内部必须保持背景透明**：交互条目（如 `<a>`、`<button>`）内部的子元素（标题 `div`、文字 `span`、描述 `<p>`）必须保持背景透明，**严禁在条目内部子容器上硬编码不透明底色（如 `bg-overlay`）**。
- **高亮由条目外壳统管**：条目外层容器在 `hover` 或 `active` 时应用 `hover:bg-wash-strong`（或 `bg-brand-soft`）。若内部标题写死 `bg-overlay`（`#202429`），在悬停时会像胶布/遮挡条一样强行遮蔽外层高亮，产生极其严重的深黑色补丁（遮盖层不一致回归）。
- **图标联动过渡**：条目内图标容器必须搭配 `group-hover:border-line-strong group-hover:bg-wash-strong transition-colors duration-fast`，与条目外壳步调一致响应。

#### 2.5.2 多栏复杂浮层底色分层与防穿孔规则（Multi-Column Punch-Through Prevention）

对于包含主功能栏与辅助矩阵栏的双栏/多栏浮层（如 Mega Menu 面板）：
- **主栏与浮层基底**：主栏直接继承外层浮层基底 `bg-overlay`；
- **辅助栏微光纵深**：辅助栏可叠加全局中性微光层 `bg-wash`（`rgba(255,255,255,.04)`），通过极其克制的透明度差建立双栏空间层次；
- **严禁底层穿孔（Punch-Through）**：在微光辅助栏内，任何条目的标题或子元素**严禁使用底层不透明色（如 `bg-overlay`）**。在 `bg-wash` 底色上使用 `bg-overlay` 会强行裁穿微光层，产生斑驳的深黑矩形色块。所有子项必须保持无背景类，平滑透明透出 `bg-wash`。

#### 2.5.3 沉浸式暗色遮罩（Backdrop Scrim）动态边界契约

全屏/局部 Backdrop Scrim（`bg-scrim` / `--bg-scrim: rgba(3,4,5,.72)`）用于聚焦导航菜单与模态弹窗：
- **禁止硬编码定位偏移**：严禁在遮罩层上写死固定的高度类名（如 `top-14` / `top-[56px]`）。
- **动态测量 Header 下边缘**：当页面存在安全拦截横幅、全站系统公告条（如 ChinaIpGate、GlobalSiteBanner）或不同页面 Header 尺寸变体（如 56px / 72px）时，遮罩层的 `top` 必须通过 `header.getBoundingClientRect().bottom` 动态绑定（`style={{ top: `${headerBottom}px` }}`），确保遮罩层严丝合缝地从顶栏下边缘向屏幕底部展开。
- **严禁切入顶栏玻璃底层**：顶栏采用 `bg-surface-glass`（`rgba(19,21,25,.92)`）与 `backdrop-blur-md`。若遮罩层位置偏移切入顶栏底层，会导致顶栏出现横向阴阳色断层。
- **层级空间契约**：遮罩层严格使用 `z-sticky: 10`，低于顶栏（`z-header: 40`）与浮层视口（`z-dropdown: 60` / `z-popover: 70`）。

### 2.6 滚动条：低干扰，但必须可发现

**废止**旧版"全局消除原生滚动条"条款。理由：把滚动条隐藏到用户不知道内容还能滚动，是可发现性缺陷，不是精致。

现行契约：
- 默认继承 `globals.css` base 层的全局滚动条（`--scrollbar-thumb` `rgba(255,255,255,.16)`，hover `.30`，`--scrollbar-size: 10px`）。
- 横向轨道（导航、模型列表）使用 **`.scrollbar-rail`**：细、克制，但**可见**。
- **禁止** `scrollbar-none`、`::-webkit-scrollbar{display:none}`、`[&::-webkit-scrollbar]:hidden` 等写法。

### 2.7 认证卡片：统一入口，但不得有第二主色

保留的硬约束：所有未登录场景必须复用 `<AuthModal>`（模态与 `isInline` 内嵌双模式），禁止手写分裂表单。

**认证主按钮**：认证卡片一律使用统一的 `Button variant="primary"`（品牌洋红 `#e11d74` 配纯白文字），严禁私自硬编码第二套孤立主色。

### 2.8 工程底纹与氛围遮罩（Dot-Grid Canvas & Atmospheric Masking）

吸收自 OiiOii 等专业级 AI Creative Studio 顶栏与画布底板的工程精密感，消除大面积纯黑背景的沉闷感，同时恪守"内容退居幕后、文字可读第一"原则：

1. **工程点阵底纹（`.bg-dot-grid`）**：
   - 步长网格契约：`--dot-grid-size: 24px`（严格服从 4px 基准网格）。
   - 圆点尺寸与颜色：1px 纯正圆点，颜色严格绑定 `--border-strong`（在 `#0a0b0d` 暗底上形成极微弱的约 10% 通透反光）。
   - **禁止**：手写 `background-image`、使用非系统彩色圆点、或者透明度 > 16% 形成视觉干扰。
   - 适用场景：顶栏背景、工作室 Canvas 画布底层、Hero 背景、空状态占位区。
2. **Hero 氛围图暗化遮罩（`.hero-atmospheric-mask`）**：
   - 吸收自 OiiOii 会员定价页顶部电影感氛围图（月夜红枫）：当页面头部引入艺术插画或电影调性宽幅背景时，底部**必须**使用渐变遮罩自然融入画布。
   - 契约：从顶部 40% 起平滑衰减，至 100% 处完全融入 `--bg-canvas`。严禁在下方卡片区出现明显的图片切边硬边缘。

### 2.9 工作室深暗高斯毛玻璃空间体系（Studio Deep-Frosted Glassmorphism System）

吸收自 KoyoSIM 音频工作室（`https://www.koyosim.com/zh/studio/audio`）及 AI 空间光影工作台的卓越视觉实践。这一页的毛玻璃质感之所以兼具高级电影感与极高可读性，关键在于它彻底摒弃了传统暗色模式下“死白灰雾”的廉价拟态，建立了一套严格基于物理光学漫散射与发丝高光的**深暗高斯毛玻璃体系（Deep-Frosted Glassmorphism）**。

#### 2.9.1 暗夜模式毛玻璃的“防灰防浊”光学定律（The Optical Laws of Dark Glassmorphism）

在深暗基底（`#050507` / `#0a0b0d`）与动态背景（3D 物理流体极光 `AuroraVideoLayer` + 交互点阵 `StitchCanvasGrid`）之上设计毛玻璃，必须严格遵循以下光学铁律：

1. **白透光厚度红线（The 4% Opacity Ceiling）**：
   - 传统 Glassmorphism 常见翻车根因在于盲目使用 `bg-white/10` 或 `bg-white/20`。在纯黑或深色暗底上，透明度超过 6% 的白透光会与底层黑灰叠加形成严重的“乳化反应”，形成浑浊脏污的白内障灰雾（Milky Fog），大幅削弱正文对比度。
   - 音频工作室的黄金配方：微光容器与卡片底色严格限定在 **`bg-white/[0.03]` ~ `bg-white/[0.04]`**（或深色半透明基底 `bg-surface-glass/80` = `rgba(19, 21, 25, 0.80)`）。3%–4% 的极微透光度既能在黑底上形成如同高透水晶的空气感薄层，又绝不产生发灰浑浊。
2. **高斯漫散射核契约（High-Diffusion Blur Contract）**：
   - 模糊半径过小（如 4px–8px）会导致底层点阵、极光边缘的剧烈高频噪点断断续续漏出，造成文字背景斑驳。
   - 现网规则：面板外壳与核心展台大卡统一采用 **`backdrop-blur-2xl`（40px 深度高斯模糊核）**；输入框、下拉框与小控件采用 **`backdrop-blur-md`（12px 模糊核）**。超大扩散将背后的极光折射彻底平滑为流动天鹅绒般的微光，文字清晰锐利。
3. **发丝级物理透光描边（Hairline Specular Rim Light）**：
   - 缺乏边缘折射的毛玻璃只是一块平铺半透明色块。必须依靠 **1px 发丝级微透描边 `border border-white/10`（`rgba(255, 255, 255, 0.10)`）**。
   - 这条 1px 细线精准模拟了精密光学透镜（如哈苏/徕卡镜片）经过物理倒角抛光后捕捉到的微弱边缘高光，赋予卡片硬朗立体的物理实体感。悬停时渐变微提亮至 `border-white/20`，或与主品牌洋红呼应 `border-brand-line/50`。
4. **悬浮环境光晕背光源（Ambient Radial Backlight Glow）**：
   - 核心展台卡片与重点操作并非生硬贴在背景上，而是在底层内嵌一层柔和的径向漫反射光晕：
     `absolute inset-0 bg-brand/5 blur-3xl rounded-full opacity-30 group-hover:opacity-50 transition-opacity duration-1000 pointer-events-none`
   - 让整张玻璃卡片如同“悬浮在光雾之上”，产生强烈的零重力悬浮纵深。
5. **内凹微刻与微内阴影（Sunken Wells & Inner Lensing）**：
   - 内部输入容器与中央图标底座叠加 `shadow-inner`（`box-shadow: inset 0 2px 4px 0 rgba(0, 0, 0, 0.40)`）或 `border border-white/15`，营造犹如深色光学玻璃雕刻凹槽的下凹透镜质感。

#### 2.9.2 黄金光学五层配方（Golden 5-Layer Optical Recipe）

所有 Studio 毛玻璃组件构建必须拆解为以下 5 层垂直空间堆叠：

```
┌────────────────────────────────────────────────────────────────────────┐
│                        深暗高斯毛玻璃五层光学架构                      │
├────────────────────────────────────────────────────────────────────────┤
│ Layer 4: 前景内容与交互态 (文字 ink / 焦点环 ring / 纯白反色 / 图标)    │
├────────────────────────────────────────────────────────────────────────┤
│ Layer 3: 发丝倒角描边 (border border-white/10 hover:border-white/20)   │
├────────────────────────────────────────────────────────────────────────┤
│ Layer 2: 微透光体与内雕 (bg-white/[0.03~0.04] + shadow-inner)          │
├────────────────────────────────────────────────────────────────────────┤
│ Layer 1: 高扩散滤镜核 (backdrop-blur-2xl / backdrop-blur-md)          │
├────────────────────────────────────────────────────────────────────────┤
│ Layer 0: 悬浮径向漫射背光 (bg-brand/5 blur-3xl rounded-full opacity-30)│
└────────────────────────────────────────────────────────────────────────┘
```

#### 2.9.3 四大核心毛玻璃表面规格（The 4 Core Studio Glass Surfaces）

| 表面层级 | Tailwind 类名配方 | 关键参数 | 适用场景 |
| :--- | :--- | :--- | :--- |
| **Glass-Stage**<br/>(中央展台卡) | `bg-white/[0.03] backdrop-blur-2xl border border-white/10 rounded-2xl shadow-elevation-2 relative group` | 3% 白透光 + 40px 高斯 + 1px 细线 + 20px 圆角 + 径向背光 | 工作室中央空状态展台卡、生成结果播放器、核心浮动展厅 |
| **Glass-Panel**<br/>(参数面板外壳) | `bg-surface-glass/80 backdrop-blur-2xl border-r border-white/10` | 80% 暗玻璃透光 + 40px 高斯 + 右侧发丝分割线 | 左侧 400px 工作台参数配置栏、移动端侧滑抽屉、折叠面板 |
| **Glass-Control**<br/>(参数表单控件) | `bg-white/[0.04] backdrop-blur-md border border-white/10 hover:border-white/20 hover:bg-white/[0.08] rounded-xl transition-all` | 4% 白透光 + 12px 高斯 + 16px 圆角 + 悬停提亮 | 模型下拉 Trigger、Prompt 文本框、Style 输入框、Switch 外壳 |
| **Glass-Well**<br/>(下凹深底视窗) | `bg-black/40 backdrop-blur-md border border-white/5 rounded-xl` | 40% 纯黑微透 + 12px 高斯 + 5% 暗线 + 16px 圆角 | 音频声波均衡器屏幕、历史足迹底板、媒体预览内嵌窗 |

#### 2.9.4 玻璃上的洋红品牌色浸润原则（Brand Accent Infiltration in Glass）

洋红主色（`#e11d74`）在毛玻璃环境中的使用契约是：**“克制注入，点睛微光，绝不大面积涂抹”**：
- **允许的洋红用法**：
  1. 矩阵选中药丸：`bg-brand text-white shadow-elevation-1 font-bold`（如 V3_5 激活项）；
  2. 边框微光指示：`border-brand-line`（`rgba(225,29,116,0.28)`）与焦点外环 `ring-brand-ring`；
  3. 浅层浸润底色：`bg-brand-soft`（`rgba(225,29,116,0.10)`）；
  4. 核心图形与 Meta 标：`text-brand`（展台中心音符图标、"描述" 元信息标签、Now Playing 状态标）；
  5. 径向背光：`bg-brand/5 blur-3xl`。
- **严禁的洋红用法**：
  - 严禁将整张玻璃卡片的背景设为洋红半透（如 `bg-brand/30`），这会破坏暗夜空间通透度，造成严重的视觉疲劳与电竞感；
  - 严禁在洋红底色上使用非纯白文字；
  - 严禁使用高饱和荧光品红。

---

## 3. Typography

字体由 `app/layout.js` 的 `next/font` 自托管（Inter + Jost）。**不得**引入 Google Fonts `@import`：对主要中文受众是一次渲染阻塞请求，且与 next/font 已做的 Jost 加载重复。

字号与行高成对定义，因此一个字体工具类是完整的：

| Tailwind 类 | 字号 | 行高 | 字重 | 字距 | 用途 |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `text-display` | 32px | 40px | 700 | -0.025em | Landing 大标题 |
| `text-page-title` | 24px | 32px | 600 | -0.02em | 工作室主标题 |
| `text-section-title` | 18px | 26px | 600 | -0.015em | 模块/弹窗标题 |
| `text-card-title` | 15px | 22px | 600 | -0.01em | 模型卡标题、参数组名 |
| `text-body` | 14px | 20px | 400 | -0.005em | 标准正文、按钮、输入 |
| `text-body-sm` | 13px | 18px | 400 | 0 | 次级说明 |
| `text-label` | 12px | 16px | 500 | +0.01em | 表单标签、badge、参数项 |
| `text-caption` | 11px | 14px | 400 | +0.015em | 时间戳、快捷键 |
| `text-micro` | 10px | 14px | 400 | +0.02em | 刻度下限：密集 chip、计数器、缩略图角标 |
| `text-mono` | 12px | 16px | 400 | 0 | Token、seed、API 参数 |

**十级，不是九级。** `text-micro` 是刻意设的下限（"floor of the scale"），用来替代 `text-[10px]`；`packages/studio/src` 里 17 个文件共 170 处在用。删掉它会让这些点全部退回任意像素。
`text-mono` 复用 `--text-label` 的字号与行高，只换 `--font-mono`，所以它和 `text-label` 永远同尺寸 —— 不要为了"看起来更像代码"再叠一个字号类。

> `text-mono` 已捆绑 `--font-mono`，再写 `font-mono` 是冗余。字重由 recipe 携带，不要在文本类上另加 `font-semibold` 制造漂移。

**默认字号阶梯是被禁的，而且它禁得比看起来隐蔽**：`theme.extend.fontSize` 意味着 `text-xs` 照常生成 CSS（12px/16px —— 数值上正好等于 `text-label` 的字号行高），差别只在它**不带字重、不带字距**，所以截图上"看起来差不多"，漂移发生在成对的 recipe 被拆开的那一刻。`text-sm` = 14px/20px 撞上 `text-body` 的字号、行高却是 20→20 但无 `letter-spacing`。实测 `app`+`components`+`packages/studio/src` 里默认写法 **1697 次** 对具名写法 **651 次** —— 这条阶梯事实上没有被采纳。守卫规则 `off-system-type-ramp`（§8）自 2026-09-21 起把 1926 处冻结在基线里，新增即红；`leading-[3-9]` 现测 0 处，`tracking-*` 默认写法 267 处**暂未入账**，与字号一起在下轮收。

---

## 4. Spacing / Radius / Height / Slider / Elevation

### 4.1 间距（4px 基准网格）
`--space-1..16` = 4 / 8 / 12 / 16 / 20 / 24 / 32 / 40 / 48 / 64。
禁止 `p-[17px]`、`gap-[13px]` 等任意像素。

### 4.2 圆角（6 级 + full）——采用“多层圆角层级”，禁止一刀切

`rounded-xs` 4 · `rounded-sm` 6 · `rounded-md` 8 · `rounded-lg` 12 · `rounded-xl` 16 · `rounded-2xl` 20 · `rounded-full` 9999。
另有语义别名 `rounded-composer`（20px）。禁止 `rounded-[2rem]`。
**`rounded-3xl` 是迁移别名，不是第七级**：它塌缩到 `var(--radius-2xl)`，存在的唯一理由是让未迁移文件不必一次性改写。新代码不得写 `rounded-3xl`。

#### 4.2.1 原始站点圆角层级（Radius Hierarchy）

参考现网原始界面：侧栏激活项、Prompt Composer、登录模态、输入框、登录主按钮、第三方登录按钮、顶部状态胶囊并不是同一个圆角。正确视觉必须形成**外层更柔和、内层更精细、胶囊单独成语义**的层级。

| 语义层 | 推荐类 | 典型组件 | 视觉规则 |
| :--- | :--- | :--- | :--- |
| Micro | `rounded-xs` 4px / `rounded-sm` 6px | 极小徽章、缩略图角标、微型状态点 | 只用于非常小的密集信息，不用于主按钮/输入框 |
| Compact Control | `rounded-md` 8px | 28–32px 小图标按钮、紧凑工具条按钮 | 仅工具型，不承担主导航 |
| Standard Control | **`rounded-lg` 12px** | 常规 Button、Select Trigger、侧栏二级菜单、Studio 参数按钮 | 全站常规交互默认圆角；禁止退回直角/锐角 |
| Field | **`rounded-xl` 16px** | Input、Textarea、搜索框、账号登录输入框 | 比普通按钮更柔和，体现“可输入容器” |
| Surface / Card | **`rounded-xl` 16px** | Card、参数块、资产状态条、小型浮层 | 与 Field 同级，但靠 padding/边框区分 |
| Composer / Modal / Large Panel | **`rounded-2xl` 20px** | Prompt Composer 外壳、登录模态、支付模态、Drawer 面板、大卡片 | 大面积容器必须是最高常规圆角，不得被 8px/12px 覆盖 |
| Pill / Capsule | **`rounded-full`** | Segmented Control、顶部状态胶囊、第三方登录胶囊、周期切换、Badge/Chip | 独立几何语义；满足 `radius >= height / 2` |

**嵌套圆角原则（Nested Radius Rule）**：
- 外层容器与内部矩形控件应保持 **4–8px 的圆角级差**，避免“全部一样圆”造成塑料拼装感。
- 示例：`Modal 20px → Field 16px → Standard Control 12px`；`Composer 20px → 参数按钮 12px → 微标签 4/6px`。
- Pill 是例外：它是形状语义，不参与“外大内小”的数值比较。
- 同一组件在 hover/active/focus/disabled 时**圆角不允许变化**，只改变表面、边框、文字、ring 或 shadow。
- 禁止全站批量把 `rounded-*` 统一成同一个值；这会破坏原始网站已经形成的层级。

#### 4.2.2 胶囊圆角是独立几何语义，不得被普通控件圆角覆盖
用于“场景分类 / 模式切换 / 计费周期 / 紧凑筛选”的胶囊控件，**Track 与 Trigger 必须同时使用 `rounded-full`**。这不是 `rounded-md/lg/xl` 的视觉变体，而是独立的 Pill 语义。

硬规则：
- 胶囊 Track：最终计算样式必须满足 `border-radius >= height / 2`。
- 胶囊 Trigger / Active Item：最终计算样式必须满足 `border-radius >= height / 2`。
- **同一 DOM 节点最终只允许一个圆角来源**。禁止 `rounded-md rounded-full`、`rounded-lg rounded-full`、`rounded-none rounded-full` 同时存在。
- 当前 `cn()` 只拼接字符串、不做 Tailwind 冲突消解，因此**不得**依赖 className 的书写顺序覆盖圆角。
- Pill 组件不得直接把默认 `controlClasses()`（会产生普通控件圆角）与 `rounded-full` 叠加。实现层必须提供单一 Pill recipe，例如 `pillControlClasses()`，或让尺寸 recipe 以 `radius="full"` 一次性输出唯一圆角。
- 禁止用 `!important`、全局 `button { border-radius: ... }`、`[role=tab] { border-radius: ... }` 修补。根因必须在 recipe 层消除。

**验收断言**：在浏览器中读取 Track 与每个 Trigger 的 `getComputedStyle(el).borderRadius`，胶囊必须是完整药丸，不得出现直角、8px 小圆角或一侧圆一侧直。

### 4.3 控件与面板尺寸契约
`h-control-xs` 28 · `h-control-sm` 32 · **`h-control-md` 38（默认）** · `h-control-lg` 44。
`--header-h` 56 · `--sidebar-w` 240 / 收起 60 · **`--panel-w` 400**（studio 左侧参数栏宽度，工具类 `w-panel` / `lg:w-panel`）。

**Prompt Composer 固定 38px**（PART 14）。任何工作室不得出现 34/36/40/42px 的参数按钮；出现即视为缺陷，除非在 `UI_MIGRATION.md` 记录设计理由。

`--panel-w` 是**桌面专用**宽度：studio 侧栏在 `lg` 以下必须堆叠，写 `w-panel` 而不带 `lg:` 前缀会让右侧结果区在手机上被压成 0 宽 —— `AudioStudio` 迁移前就是这个状态（实测 `resultWidth: 0`）。

### 4.4 浮动层几何
`--modal-w: calc(100vw - 32px)`（桌面永不贴边）· `--modal-max-h: calc(100vh - 64px)` · `--sheet-max-h` 88vh · `--drawer-max-h` 85vh · `--menu-min-w` / `--popover-min-w` 176px · `--toast-w` 340px · `--popover-max-h` 45vh。
这些是视口相对值，**不可能**来自 4px 网格，因此必须留在 token 层，不得在组件里写 `calc()`。

### 4.5 滑杆（原生 range 的唯一合法写法）
`--range-h` 24 · `--range-track` `rgba(255,255,255,.14)`（4px 轨道）· `--range-thumb` `var(--text-primary)` · `--range-thumb-size` 14。
工具类 `.range` 消费这四个值。**任何 `type="range"` 都必须带 `.range`**：`globals.css` 对 range 设了 `appearance:none`，而 `appearance:none` 之后浏览器不再画 thumb —— 不写就是**一根看不见也拖不动的横条**。命中区 24px 靠 `--range-h` 撑，视觉轨道靠伪元素收窄，两者不是一回事。
原生 `range` 自带键盘（←/→ 以 `step` 步进）与读屏语义，**不要**为了"好看"换成 `div` + `onMouseDown`（`AudioStudio` 迁移前的播放条就是后者，键盘完全不可达）。无可见 label 时必须 `aria-label`。

### 4.6 Elevation（恢复原始暗色多层阴影；禁止单层“糊一圈”）

现网站的登录模态、Composer、浮层之所以有稳定的“悬浮感”，不是靠霓虹，而是靠**多层黑色阴影 + 细边框 + 极轻微高光描边**。从 3.4.2 起，`shadow-elevation-*` 是**多重 box-shadow token**，不是单条阴影。

建议 `globals.css` 真源值：

```css
--shadow-elevation-1:
  0 1px 2px rgba(0,0,0,.46),
  0 0 0 1px rgba(255,255,255,.018);

--shadow-elevation-2:
  0 4px 12px -4px rgba(0,0,0,.58),
  0 1px 3px rgba(0,0,0,.34),
  0 0 0 1px rgba(255,255,255,.022);

--shadow-elevation-3:
  0 12px 32px -10px rgba(0,0,0,.74),
  0 4px 12px -6px rgba(0,0,0,.48),
  0 0 0 1px rgba(255,255,255,.025);

--shadow-elevation-4:
  0 28px 80px -24px rgba(0,0,0,.90),
  0 14px 36px -18px rgba(0,0,0,.68),
  0 0 0 1px rgba(255,255,255,.030);
```

语义映射：
- `shadow-elevation-1`：Active Pill、轻微浮起的小控件、选中缩略图；**不可给所有按钮默认加**。
- `shadow-elevation-2`：Card/Composer 内部浮起块、二维码白底、悬停态卡片。
- `shadow-elevation-3`：Dropdown / Popover / Menu / Tooltip 大型浮层。
- `shadow-elevation-4`：Modal / Drawer / 登录框 / 支付弹窗，必须与 `border-line` 或 `border-line-strong` 配合。
- 平面区域（Sidebar、Header、普通表单行）默认**无投影**，靠 surface elevation 和 border 分层。

`shadow-elevation-brand` `0 8px 14px -4px var(--accent-glow)` —— 唯一允许的青色发光例外。只允许品牌主动作/特定品牌图标块，且不能替代中性 elevation。新增彩色阴影一律先回到 `globals.css` 谈 token，不要在组件里写。

**多层阴影硬规则**：
1. 阴影必须从 token/recipe 产生；业务代码禁止 `shadow-[...]`。
2. Modal/Popover 不允许只有 `box-shadow` 而没有边框；深色背景上需要 `border-line` 提供边缘定义。
3. 禁止 `0 0 30px` 这类四周等量扩散的“霓虹糊边”；阴影必须有主要向下的 Y offset 与负 spread。
4. hover 不允许把阴影从 0 突然跳到 elevation-4；最多上升一级。
5. focus 由 `ring-*` 表达，不得用更大的 shadow 假装 focus。
6. 阴影层不得成为遮挡点击的绝对定位 DOM；阴影必须是 CSS `box-shadow`，不是额外 Overlay 元素。
`tailwind.config.js` 的 `boxShadow` 写在 `theme.extend` 下，所以 Tailwind 自带的 `shadow-sm/md/lg/xl/2xl` **仍然会生成 CSS**（实测产物里有 `.shadow-2xl{--tw-shadow:0 25px 50px -12px rgb(0 0 0/0.25)}`）。它们的问题不是"不生效"，而是**绕过 elevation 阶梯自带一套字面量阴影**——正是本条契约要消灭的东西。业务代码一律写 `shadow-elevation-N`。
> 存量（09:1x 现测，只算根构建 content 名单内的源文件）：默认阴影阶梯 **91 处 / 22 个文件**（`shadow-sm` 36、`shadow-lg` 29、`shadow-2xl` 13、`shadow-xl` 12、`shadow-md` 1），**大头不在主应用**而在 `packages/Vibe-Workflow/.../workflow-builder/src`（`NodeFlow.jsx` 11、`VideoNode.jsx` 10、`ChatWidget.jsx` 9…），因为该包自己的 tailwind config 是 `extend: {}` —— 它从来就是按默认阶梯写的。这是 §4.6.1 第三行"子包私有体系"的同一种病。
> 上一版这里写的是"`boxShadow` 整体替换，默认阶梯不生成任何 CSS，属于静默死类"——**该结论不成立**，配置在 `extend` 下，产物可查；本轮由 `scripts/ui-dead-classes.mjs`（对照真实构建产物）纠正。同理，`fontSize` 也在 `extend` 下，`text-xs` 等默认字号照样生成 CSS 并**与语义字号阶梯打架**——实测 `text-(xs|sm|base|lg|xl|2xl…)` 在 `app`/`components`/`packages/studio` 里出现 **1697 次**（`text-xs` 独占 1115），而 `leading-[3-9]` 为 0 次，所以新增守卫规则 `off-system-type-ramp` 把默认字号冻结在基线里。
迁移期保留的旧名（`subtle`→1 · `card`→2 · `overlay`→3 · `modal`→4 · `glow`→2 · `3xl`→4）**已去发光**，仅供未迁移文件调用，新代码一律写 `shadow-elevation-N`。
禁止 `shadow-[0_0_15px_#22d3ee]` 之类霓虹发光。
### 4.7 Motion
时长 `duration-fast` 120ms · `duration-base` 180ms · `duration-slow` 240ms · `duration-page` 300ms。
缓动 `--ease-standard` / `--ease-enter` / `--ease-exit`。
**禁止 `transition-all`**：它会把 `scale`/`box-shadow` 一起动画化，是"廉价感"的主要来源。必须写 `transition-[background-color,border-color,color]` 或用具名 recipe。
`@media (prefers-reduced-motion: reduce)` 已全局就位。

### 4.8 顶栏营销通告条契约（Announcement Bar Contract）

吸收自 OiiOii 顶部活动通告横幅，用于运营大促、算力倍增活动与版本更新播报：

| 属性 | 契约值 | 语义说明 |
| :--- | :--- | :--- |
| 高度 | `--announcement-h: 36px` | 极紧凑单行高度，不压缩主视口空间；`h-announcement-h` |
| 背景与色彩 | 统一走自有调色板：<br/>- 常规通报：`bg-surface text-ink-muted border-b border-line-subtle`<br/>- 营销高光：`bg-brand-soft text-brand border-b border-brand-line` 或反色底 `bg-surface-inverse text-ink-inverse` | **严禁**把 OiiOii 的荧光黄绿（`#ccff00`）搬入项目；保持冷黑与青色核心视觉 |
| 排版结构 | 居中单行：`text-body-sm`，强调数字加粗 `font-semibold`；右侧紧凑关闭动作 `IconButton size="xs"` | 严禁多行折行破坏 36px 契约 |
| 交互与记忆 | 用户关闭后记录 `localStorage` 状态，同活动周期不再弹起 | 避免阻碍专业工具使用 |

### 4.9 胶囊分段控制器契约（Pill Segmented Control Contract）

视觉基准：顶部场景分类“个人/自媒体 · 短漫剧 · MV · 游戏 · 电商 · 广告”。目标是**深色连续 Track + 完整圆润药丸选项 + 纯白高对比 Active**，禁止退化为方角 Tab、8px 普通按钮或只有 Active 圆而 Track 不圆。

| 结构 | 尺寸与样式 | 交互态规范 |
| :--- | :--- | :--- |
| **轨槽 (Track)** | 默认 `40px` 高；紧凑态 `36px` 高。均为独立 Pill 导航语义，不复用普通 Button 的圆角。`rounded-full bg-well border border-line-subtle p-1` | 内容自适应；水平排列；`overflow: hidden` 仅在确需裁切 Track 背景时使用，不得裁掉 focus ring |
| **未选项目** | 默认高度 `32px`，紧凑态 `28px`；`inline-flex items-center justify-center px-4 text-body-sm font-semibold text-ink-muted rounded-full` | `hover:text-ink hover:bg-wash`；必须可点击、可键盘聚焦，`pointer-events:auto` |
| **选中项目 (Active)** | 与未选项同高；优先参考图使用 `bg-surface-inverse text-ink-inverse rounded-full shadow-elevation-1`；品牌强调场景才使用 `bg-brand text-ink-on-accent` | 选中态只改变表面/文字/阴影，不改变高度和圆角；切换时 `duration-fast ease-standard` |
| **双层嵌套结构** | 上层场景分类 + 下层周期折扣 | 组间垂直间距 `gap-space-3` (12px)，上下层对齐居中 |

**与原始站点的关系**：Pill 只用于明确的“胶囊语义”。侧栏激活项、Composer、Modal、Input 不得为了“更圆”全部改成 `rounded-full`；它们分别遵守 §4.2.1 的 12/16/20px 层级。

**实现约束（P0）**：
1. Track、Trigger、Active Trigger 的最终 class 中，每个节点只允许一个 `rounded-*`。
2. 禁止 `controlClasses(size) + rounded-full` 的叠加写法；应使用专用 `pillControlClasses()` / `PILL_SEGMENT_*` recipe，一次性输出高度、padding、字号与 `rounded-full`。
3. `TabsList variant="segmented"`、`SegmentedControl`、`PillSegmentedControl`、`PromptSegmentedControl` 必须共享同一 Pill 圆角 recipe。
4. Active 不能通过绝对定位的透明层覆盖其它 Trigger；任何装饰滑块必须 `pointer-events-none`。
5. 浏览器验收：Track 与 Trigger 的 `borderRadius` 必须不小于各自高度的一半；点击每个选项均能切换；Tab/方向键可达。

### 4.10 商业化模态与卡片层级规范（Commercial Checkout & Tier Matrix）

商业化充值与购买必须保持极高的信任度与极短的转化链路。统一沉淀为两套经典架构与一套定价矩阵：

#### 4.10.1 模态架构 A：资产状态条 + 通用/专属双层充值网格（OiiOii 范式）
用于复杂代币体系与模型专属算力包选购：
1. **用户资产状态条（Asset Status Strip）**：
   - 位于模态顶部，`h-12` (48px)，圆角 `rounded-xl`，背景 `bg-surface`，边框 `border-line-subtle`。
   - 左侧：圆形头像 + `text-micro` 角色等级 Tag（如 `FREE`）+ 醒目跳转链接 `升级会员 →`。
   - 右侧：当前通用算力余额（大字粗体，如 `通用算力 ✦ 60`）。
2. **通用算力包网格（Generic Pack Grid）**：
   - 4 列等宽卡片，底色 `bg-surface-raised`，圆角 `rounded-xl`，边框 `border-line`。
   - 卡片内容：币种图标 + 额度（大号粗体 `text-page-title`）+ 售价（`text-body-sm text-ink-muted`）。
   - 选中态：青色轮廓高亮 `border-brand ring-1 ring-brand`，卡片内微提亮 `bg-brand-soft`。
3. **专属模型算力包（Exclusive Pack Grid）**：
   - 4 列等宽卡片，顶部内嵌黄色激励胶囊（`首购加赠 100%`，见 §4.11）。
   - 卡片内容：模型徽标与名称（如 `GPT Image 2.5`）+ 划线原额度与大字增赠额度对比（`1,400 2,800`）+ 价格 + `仅限会员` 标识。
4. **模态底部主操作**：
   - 底部提示小字（说明、客服支持、规则跳转）居中或左对齐；
   - 全宽主 CTA：药丸形 `rounded-full h-control-lg`，品牌青色实心按钮 `Button variant="primary"`。

#### 4.10.2 模态架构 B：一站式左选档右扫码分栏模态（即梦范式）
用于极致消除转化漏斗摩擦的即时快捷充值：
1. **高度整合紧凑头部**：
   - 单行排布：左侧头像 + 用户名 + 会员到期时间，右侧余额 `我的算力 ✦ 20` + 垂直分割线 `|` + 关闭按钮 `×`。
   - 节省 50% 顶部纵深，让充值主体第一时间进入视口。
2. **左右双栏分块布局**：
   - **左栏（选档网格，宽 360px）**：2 列 × 3 行卡片网格。卡片内大字额度（`✦ 1,500`）与价格（`¥ 150`），选中态为高对比纯白外框与微亮底色。
   - **右栏（即时支付卡片，宽 240px）**：中间垂直 1px 细分割线 `border-line-subtle`。右侧直接内嵌白色圆角二维码方块（Padding 12px，纯白底黑码保证高扫描率）；下方水平陈列支持的支付方式图标（微信支付、支付宝）以及“请扫码完成支付”提示。
   - **交互原则**：左侧点击任一档位，右侧二维码**无闪烁即时刷新**，无需经历“确认档位 → 弹出二级收银台”的繁琐流程。

#### 4.10.3 订阅层级四档卡片矩阵（Pricing Tier Matrix）
用于 `/pricing` 订阅定价主页：
1. **四档标准分级**：`BASE`、`STAR`、`PRO`、`APEX`。
2. **卡片结构统一**：
   - 顶部：等级名大写粗体 + 紧凑折扣胶囊（如 `限时 6.5折`）。
   - 价格区：超大主价格 `¥ 88 / 月`，伴随中划线划线原价 `¥ 133`。
   - 价值折算锚点：`text-body-sm text-ink-muted` 标注每月总算力与每单元折算单价（如 `1积分 ≈ ¥0.067`），增强购买确定性。
   - 赠送明细与信息 Tooltip 图标。
   - 按钮规范：普通档位统一采用白色反色实心按钮（深色界面下具备极佳层次）；**最高档 APEX 采用青色边框强化高亮，主按钮为品牌青色实心 `Button variant="primary"`**。
   - 下方权益清单：`✓` 对勾符号对齐，模型特权列表，右侧带支持级别胶囊标签（如 `最低4.2折`）。

### 4.11 极精细微徽章与加赠标签系统（Micro Badges & Incentive Pills）

商业化与模型列表中充满紧凑微标签，严禁业务层手写随机 padding 与圆角。建立 4 级语义微标签：

| 标签类型 | 类名与排版 | 视觉示例 | 适用场景 |
| :--- | :--- | :--- | :--- |
| **折扣徽章** | `px-2 py-0.5 rounded-full text-micro font-medium bg-wash-strong text-ink` | `限时 6.7折` | 定价卡片顶部折扣提示 |
| **加赠激励徽章** | `px-2 py-0.5 rounded-full text-micro font-medium bg-warning-soft text-warning border border-warning-line` | `首购加赠 100%` | 充值包专属加赠角标 |
| **特权折扣徽章** | `px-1.5 py-0.5 rounded-xs text-micro text-ink-muted bg-surface border border-line-subtle` | `最低4.2折` | 功能特权列表右侧标注 |
| **门槛限定徽章** | `text-caption text-ink-subtle select-none` | `仅限会员` | 购买卡片底部约束提示 |

### 4.12 设置与合规表单 Switch 复合行规范（Settings Dialog & Switch Row）

吸收自即梦 AI 合规与偏好设置模态，用于长文本说明与功能开关联动表单：

1. **模态几何**：宽度规范 560px，背景 `bg-overlay`，深度阴影 `shadow-elevation-4`，内边距 `p-6` (24px)。
2. **合规说明段落排版**：
   - 标题：`text-section-title font-semibold text-ink mb-4`。
   - 正文：段落间距 `space-y-3`，字体 `text-body-sm`，颜色 `text-ink-muted`，行高 1.6，禁止使用主色高亮正文干扰阅读。
3. **Switch 复合控件行（`SwitchRow`）**：
   - 布局：左对齐 Switch 控件，右侧紧邻主标题（`text-body font-medium text-ink`）；
   - 下方紧随两行辅助解释说明（`text-caption text-ink-subtle leading-normal mt-1`），解释开关影响及撤回路径；
   - 无障碍支持：必须绑定 `htmlFor` 与 `id`，开关必须具备 `aria-checked` 状态并响应 Space/Enter 键盘切换。
4. **底部操作栏**：单向右对齐主按钮 `保存设置`（`Button variant="primary"` 或反色白色按钮），内边距紧凑。

### 4.13 Studio 工作台与音频工作室全域 UI 契约（Studio Workbench & Audio Studio Specification）

吸收自 KoyoSIM 音频工作室（`https://www.koyosim.com/zh/studio/audio`）的完整交互与组件架构，为全站所有 Studio 工作台（音频、图像、视频、数字人、重塑、分镜等）确立标准控制台与舞台界面规范。

#### 4.13.1 工作台双栏与空间布局契约（Workbench Dual-Column Layout Contract）

```
┌────────────────────────────────────────────────────────────────────────────────────────┐
│ Top Header: 56px 固定毛玻璃顶栏 (bg-surface-glass border-b border-line-subtle z-header)  │
├──────────────────────────┬─────────────────────────────────────────────────────────────┤
│ Left Panel: 400px 参数抽屉 │ Right Stage: 弹性主舞台画布 (flex-1 bg-transparent)           │
│ - bg-surface-glass/80    │                                                             │
│ - backdrop-blur-2xl      │ - 底层自然透出 3D 物理极光影片 + 交互点阵画布                │
│ - border-r border-white/10│                                                             │
│ - custom-scrollbar 滚动   │ 【空状态】: 中央悬浮展台卡 (max-w-md bg-white/[0.03] 20px)    │
│ - 表单控件与参数组        │ 【生成中】: 动态光晕旋转指示器 (w-24 border-t-brand)         │
│                          │ 【结果态】: 高保真波形播放器 (max-w-2xl bg-surface-glass/85) │
├──────────────────────────┤                                                             │
│ Bottom Dock: 吸底生成按钮 │ 【底部】: 历史音轨足迹货架 (border-t border-white/10)        │
│ - 400px 宽度固定停靠     │                                                             │
│ - bg-surface-glass/90    │                                                             │
│ - py-3.5 纯洋红主按钮    │                                                             │
└──────────────────────────┴─────────────────────────────────────────────────────────────┘
```

1. **左侧参数配置栏（Left Configuration Sidebar）**：
   - 宽度契约：桌面端严格固定 `400px`（`w-full lg:w-[400px]`），禁止自创 360px 或 450px；移动端（`lg` 以下）全宽堆叠或以抽屉承载；
   - 表面质感：`bg-surface-glass/80 backdrop-blur-2xl flex-shrink-0 z-30`，右边缘连接发丝光分割线 `border-r border-white/10`；
   - 内部滚动：`overflow-y-auto custom-scrollbar p-6 space-y-6 pb-28`（底部必须留足 112px 内边距，避免被吸底操作栏遮挡）。
2. **右侧主画布舞台（Right Studio Stage Canvas）**：
   - 结构：`flex-1 flex flex-col min-w-0 h-full relative z-20 bg-transparent`；
   - 空间透明契约：**严禁在右侧舞台容器上添加实心不透明背景（如 `bg-base` / `bg-canvas`）**；舞台必须保持全透明，使底层的 3D 物理流体极光（`AuroraVideoLayer`）和物理交互点阵（`StitchCanvasGrid`）作为原生内容背景自然透出。
3. **吸底主生成控制栏（Sticky Docked Generation Dock）**：
   - 定位契约：`absolute bottom-0 left-0 w-full lg:w-[400px] z-40 p-4 border-t border-white/10 bg-surface-glass/90 backdrop-blur-2xl`；
   - 吸附在左侧参数栏底部，独立于表单滚动流，确保用户无论滚动到何处均可 0 延迟触发生成。

#### 4.13.2 毛玻璃模型下拉选择器（Glass Model Selector）

用于工作台顶部的核心 AI 模型切换（如 `Suno Create Music`、`Stable Audio`、`Flux Audio` 等）：
1. **触发按钮（Trigger Container）**：
   - 几何：`h-control-lg` (44px) 或 `py-3.5 px-4`，圆角 `rounded-xl` (16px)；
   - 表面与微光：`bg-white/[0.04] hover:bg-white/[0.08] border border-white/10 hover:border-brand-line/50 backdrop-blur-md transition-all cursor-pointer`；
   - 文字排版：左侧模型主名称 `text-xs font-bold text-white tracking-tight`；右侧 ChevronDown 箭头图标带 `transition-transform duration-200`，展开时平滑旋转 180°。
2. **下拉弹出面板（Dropdown Popover Panel）**：
   - 定位与层级：绝对定位 `absolute left-0 right-0 mt-2 z-50`（服从 `z-dropdown: 60`）；
   - 表面与阴影：`bg-[#161618]/95 backdrop-blur-2xl border border-white/15 rounded-xl shadow-elevation-3 p-1.5 max-h-60 overflow-y-auto custom-scrollbar`；
   - 模型列表项（Item）：
     - 基础态：`w-full text-left px-3.5 py-2.5 rounded-lg text-xs font-bold transition-all flex flex-col gap-1.5 border border-transparent hover:bg-white/[0.06] hover:text-white cursor-pointer`；
     - 激活态：`text-brand bg-brand-soft border-brand-line font-bold`；
     - 内部排版：首行包含模型名（`truncate`）与右侧单价徽章（`ModelPriceTag`）；次行包含微型描述（`text-[10px] text-zinc-400 font-normal truncate max-w-[320px]`）。

#### 4.13.3 Meta 描述行与洋红标签（Studio Meta & Description）

用于向创作者传达模型的核心能力边界与使用技巧：
- **分类标题**：`text-xs font-bold text-zinc-200 uppercase tracking-wider block`；
- **洋红 Meta 标签（如 "描述"）**：`text-[10px] font-bold text-brand uppercase tracking-wider block mb-1.5`（高辨识度洋红玫粉色，起到强提示锚点作用）；
- **描述文本**：`text-zinc-400 text-xs leading-relaxed font-normal`，行高舒适，避免大面积死白抢夺视线。

#### 4.13.4 毛玻璃 Prompt 输入盒与快捷胶囊（Glass Prompt Composer & Preset Pills）

提示词输入是生成式 AI 的核心创作引擎：
1. **毛玻璃多行输入框（Textarea Container）**：
   - 几何：圆角 `rounded-xl` (16px)，最小高度 `min-h-[110px]`，`resize-none`，内边距 `p-3.5`；
   - 表面与焦点：`bg-white/[0.04] backdrop-blur-md border border-white/10 focus:border-brand-line focus:ring-1 focus:ring-brand-ring`；
   - 字体排版：`text-xs text-white placeholder:text-zinc-500 leading-relaxed font-normal`。
2. **预设灵感快捷胶囊（Preset Prompt Pills）**：
   - 排版：输入框下方水平微流布局 `flex flex-wrap gap-1.5 mt-2`；
   - 胶囊几何：独立 Pill 语义 `rounded-full`，内边距 `px-3 py-1`；
   - 表面与交互：`bg-white/[0.04] hover:bg-white/[0.08] border border-white/10 hover:border-brand-line hover:text-white transition-all font-medium text-zinc-300 text-[11px] cursor-pointer`；
   - 文案规范：引述双引号包裹并省略显示（如 `"Hard-hitting rap track with aggress..."`），点击直接替换或追加进输入框。

#### 4.13.5 毛玻璃单行风格/参数输入框（Glass Style & Parameter Input）

用于音乐风格（Style）、艺术家、负向提示词等单行字段：
- 几何契约：`h-control-lg` (44px) 或 `px-4 py-3.5`，圆角 `rounded-xl` (16px)；
- 表面与下凹感：`bg-white/[0.04] backdrop-blur-md border border-white/10 hover:border-white/20 focus:border-brand-line focus:ring-1 focus:ring-brand-ring shadow-inner text-xs text-white placeholder:text-zinc-500 transition-all`；
- 辅助说明文本：下方紧跟 `text-[11px] text-zinc-400 leading-normal mt-1`。

#### 4.13.6 模型版本分段矩阵选择器（Model Version Segmented Matrix）

专为 Suno / Midjourney / FLUX 等多代演进模型设计的分段矩阵控制台：
1. **状态对齐顶栏**：
   - 左侧：大写字段标签 `text-xs font-bold text-zinc-200 uppercase tracking-wider`（"模型版本"）；
   - 右侧：当前激活版本代码徽标 `text-[11px] font-mono font-semibold px-2 py-0.5 rounded-md bg-brand-soft border border-brand-line text-brand`（如 `V3_5`）。
2. **分段矩阵轨道外壳（Grid Track）**：
   - 布局：4 列等宽网格 `grid grid-cols-4 gap-1.5 p-1.5`（超小屏响应式 `grid-cols-3`）；
   - 表面：`bg-white/[0.03] backdrop-blur-md border border-white/10 rounded-xl`。
3. **选项芯片（Version Option Chips）**：
   - 激活项（Active）：`bg-brand text-white shadow-elevation-1 font-bold rounded-lg py-2 px-2 text-xs text-center transition-all`（洋红纯白高亮，自带微妙投影，与暗底形成鲜明几何层次）；
   - 未选项（Inactive）：`text-zinc-300 hover:text-white hover:bg-white/[0.06] rounded-lg py-2 px-2 text-xs font-semibold text-center transition-all cursor-pointer`；
   - 切换铁律：选项切换时绝对不允许产生任何 padding 或高度抖动，只改变颜色、背景与阴影。

#### 4.13.7 毛玻璃 Switch 复合行（Glass Switch Row - Custom Mode）

用于高级自定义模式（Custom Mode）、乐器模式（Instrumental）等二值开关控制：
- 容器结构：`flex items-center justify-between bg-white/[0.03] backdrop-blur-md border border-white/10 rounded-xl p-4 transition-all hover:bg-white/[0.05] hover:border-white/20`；
- 左侧文本区：主标签 `text-xs font-bold text-white tracking-tight` + 解释副标题 `text-[11px] text-zinc-400 leading-normal mt-1`；
- 右侧药丸开关（Pill Toggle Switch）：
  - 外轨：`w-11 h-6 rounded-full p-1 transition-all duration-300 relative shrink-0 cursor-pointer`。开启态为 `bg-brand shadow-elevation-brand`，关闭态为 `bg-white/10 hover:bg-white/15`；
  - 滑块：`w-4 h-4 rounded-full bg-white shadow-md transform transition-all duration-300`。开启态位移 `translate-x-5`，关闭态 `translate-x-0`。

#### 4.13.8 毛玻璃拖拽式音轨上传区（Glass Audio File Dropzone）

用于上传伴奏、参考音频或声音克隆源文件：
1. **状态机流转**：
   - **空闲态（Idle）**：`rounded-xl p-4 border border-white/10 bg-white/[0.03] hover:bg-white/[0.06] hover:border-white/20 backdrop-blur-md flex items-center gap-3.5 cursor-pointer`。内部左侧内嵌微型图标方块（`w-10 h-10 rounded-lg bg-white/[0.06] flex items-center justify-center text-ink-muted border border-white/5`），右侧提示文案（`text-xs font-semibold text-ink` 与 `text-[11px] text-ink-muted`）；
   - **拖拽悬停态（Dragging）**：`border-brand bg-brand-soft shadow-elevation-1`；
   - **上传中（Uploading）**：内置紧凑洋红进度条（`h-1.5 bg-white/10 rounded-full` + `bg-brand rounded-full transition-all duration-300`）；
   - **就绪态（Ready）**：`border-brand-line bg-brand-soft shadow-elevation-1`，内嵌洋红音乐图标，右侧显示文件名并截断，右上角显现红色清除动作按钮（`text-xs font-medium text-danger hover:text-danger-hover`）。

#### 4.13.9 吸底主生成 CTA 按钮（Sticky Docked Generation CTA）

工作室核心转化动作，承载整张表单的提交：
- 停靠位置：`bg-surface-glass/90 backdrop-blur-2xl border-t border-white/10 p-4 absolute bottom-0 left-0 w-full lg:w-[400px] z-40`；
- 按钮本体：`w-full py-3.5 bg-brand text-white text-sm font-bold rounded-xl hover:bg-brand-hover active:bg-brand-active transition-all transform hover:scale-[1.01] active:scale-95 disabled:opacity-50 disabled:grayscale shadow-elevation-brand flex items-center justify-center gap-2.5 cursor-pointer`；
- 按钮内容：实心三角图标 `▶` + "生成音轨"（`copy.generate.cta`）；
- 正在生成态：内置 16px 纯白旋转环（`w-4 h-4 border-2 border-white/20 border-t-white rounded-full animate-spin`）+ "正在生成中..."，保持按钮尺寸与高度不变，防止界面跳动。

#### 4.13.10 中央舞台空状态悬浮展台卡（Studio Canvas Empty State Card - "音频工作室"）

创作者进入工作室的第一视界展台，在没有任何音频生成结果时居中悬浮于极光画布中央：
1. **展台卡片外壳**：
   - 几何：最大宽度 `max-w-md` (448px)，内边距 `p-8` (32px)，圆角 `rounded-2xl` (20px)；
   - 玻璃表面：`bg-white/[0.03] backdrop-blur-2xl border border-white/10 shadow-elevation-2 relative group text-center animate-fade-in`；
   - 发丝与阴影：1px 细线边缘，多层暗色微投影，完美融入底层极光。
2. **悬浮径向漫射背光源（Ambient Radial Backlight Glow）**：
   - 核心契约：`absolute inset-0 bg-brand/5 blur-3xl rounded-full opacity-30 group-hover:opacity-50 transition-opacity duration-1000 pointer-events-none`；
   - 在卡片背后投射一层极其微弱柔和的洋红暗晕，让整张玻璃卡片如同无重力悬浮于宇宙流体极光之上。
3. **中央超大图标底座（Hero Squircle Icon Well）**：
   - 尺寸与几何：`w-20 h-20` (80px)，圆角 `rounded-2xl` (20px)，`bg-white/[0.04] border border-white/15 flex items-center justify-center shadow-inner relative z-10 transition-transform duration-500 group-hover:scale-105`；
   - 图形符号：专业洋红双音符 `♫`（`MusicIcon className="text-brand w-9 h-9"`）。
4. **展台排版文案**：
   - 主标题：`text-white font-black text-xl mb-3 tracking-tight`（"音频工作室"）；
   - 副标题：`text-sm text-zinc-300 font-medium leading-relaxed px-4`（"选择一个 AI 音乐模型、声音克隆或音效生成器，在左侧修改参数，创作您的下一段高保真音轨。"）。

#### 4.13.11 高保真玻璃音频播放器与动态波形（Premium Glass Audio Player）

生成成功后的核心视听交互展厅：
1. **外层播放器玻璃盒**：
   - 几何：最大宽度 `max-w-2xl` (672px)，圆角 `rounded-2xl` (20px)，内边距 `p-6 lg:p-8`，纵向间距 `space-y-6`；
   - 表面：`bg-surface-glass/85 border border-white/10 shadow-elevation-3 backdrop-blur-2xl animate-fade-in`。
2. **沉浸式波形屏（Visualizer Screen）**：
   - 几何：`rounded-xl bg-black/40 overflow-hidden border border-white/5 backdrop-blur-md py-6 flex flex-col items-center justify-center relative`；
   - 18 频段动态跳动均衡器（Equalizer Bars）：`w-1.5 rounded-full bg-gradient-to-t from-brand to-rose-400 transition-all duration-100`，播放时以 100ms 随机微扰跳动；
   - 标题与状态：顶部洋红极小字 `text-xs font-bold text-brand uppercase tracking-[0.2em] block mb-1`（"NOW PLAYING"），下方白色大字曲目标题 `text-ink font-bold text-base truncate max-w-sm`。
3. **高精度进度拖拽轨（Scrubbing Track）**：
   - 结构：两端展示等宽时间码（`text-xs font-mono font-medium text-ink-muted w-10`）；
   - 轨道：`flex-1 h-2 bg-white/10 hover:bg-white/15 rounded-full cursor-pointer relative group transition-colors`；
   - 填充条：`bg-brand rounded-full group-hover:bg-brand-hover transition-all`；
   - 悬停 Thumb：`w-3.5 h-3.5 bg-white rounded-full -top-[3px] shadow-elevation-1 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none`。
4. **播放控制群（Player Controls Cluster）**：
   - 音量控制：静音按钮 `p-2.5 bg-wash hover:bg-wash-strong border border-line rounded-xl text-ink-muted hover:text-ink transition-all` + 悬停展开的 `.range` 滑杆；
   - 核心播放/暂停按钮：居中主控 `w-12 h-12 bg-brand hover:bg-brand-hover text-white rounded-full flex items-center justify-center hover:scale-105 active:scale-95 transition-all shadow-elevation-brand`；
   - 保存下载按钮：右侧操作 `px-4 py-2 bg-wash hover:bg-wash-strong border border-line hover:border-brand-line rounded-xl text-xs font-semibold text-ink flex items-center gap-2 transition-all`。

#### 4.13.12 音轨生成历史底架（History Gallery Shelf）

陈列创作者的历史音轨足迹：
- 分割顶线：`border-t border-white/10 pt-6 w-full animate-fade-in`；
- 货架标题：`text-xs font-bold text-zinc-300 uppercase tracking-wider mb-4 px-1`（如 "音轨历史 (12)"）；
- 卡片网格：`grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3.5`；
- 历史卡片单体：
  - 尺寸与表面：固定高度 `h-28`，`p-3.5 bg-white/[0.03] backdrop-blur-md border border-white/10 rounded-xl cursor-pointer transition-all flex flex-col justify-between hover:bg-white/[0.07] hover:border-white/20`；
  - 当前激活项：`border-brand-line bg-brand-soft/20 shadow-elevation-1`；
  - 卡片内排版：顶部小微播放图标（`w-8 h-8 rounded-lg bg-white/[0.06]`，激活时为 `bg-brand-soft text-brand border border-brand-line`）+ 右侧模型短代码；底部两行截断标题 `text-[11px] font-semibold text-white line-clamp-2 leading-tight`。

#### 4.13.13 顶栏毛玻璃与全局状态区（Top Header Glass Integration）

顶栏作为全站最高层级视窗（`z-header: 40`），承载品牌导流与全域状态：
1. **顶栏外壳**：`h-14 fixed top-0 inset-x-0 z-header flex items-center justify-between bg-surface-glass border-b border-line-subtle px-3 sm:px-4 backdrop-blur-md select-none`；
2. **工作室 Tab 导航联动**：导航项 `音频 ∨` 在当前路由激活时展现微亮高光，并支持下拉展开其它工作室快速跳转；
3. **右侧功能状态胶囊群（Status Capsule Cluster）**：
   - **黄金等级胶囊**：`[ 👑 STARTER ]`（`border border-amber-400/40 bg-amber-400/10 text-amber-400 rounded-full px-3 py-1 text-xs font-semibold`）；
   - **算力额度胶囊**：`[ 🪙 2536 STARTER ]`（暗黑半透底内嵌算力数值与洋红级别标签）；
   - **消息通知中心**：铃铛图标内嵌未读粉红光点；
   - **语言切换球（Globe）** 与 **全站用户头像**（带在线呼吸环与平滑悬浮面板）。

---

## 5. Z-Index 层级契约

禁止 `z-[999]`、`z-[9999]`、`z-[100000]`。梯子共 11 级，`dropdown` 与 `popover` 是两个不同层，不要合并记忆：

| 类 | 值 | 用途 |
| :--- | :--- | :--- |
| `z-base` | 0 | 文档流 |
| `z-raised` | 1 | 卡片内部浮起 |
| `z-sticky` | 10 | 粘性条、composer 停靠层 |
| `z-header` | 40 | 顶栏 |
| `z-drawer` | 50 | 抽屉 |
| `z-dropdown` | 60 | 下拉菜单 |
| `z-popover` | 70 | 参数气泡 |
| `z-overlay` | 80 | 遮罩 |
| `z-modal` | 90 | 模态 |
| `z-toast` | 100 | 通知堆栈 |
| `z-tooltip` | 110 | 工具提示（最高） |

---

## 6. 图标（PART 10）

1. **单一图标体系**：`lucide-react`。禁止复制内联 `<svg>`，禁止混用第二套图标库。
2. **禁止 emoji 充当功能图标**。`🔥 社区`、`📁 我的作品` 这类写在文案里的图标属于违规（现存于 `messages/*/common.json`，见 `UI_AUDIT.md`）。
3. **描边统一**：1.8（控件内 lead 图标 14px、行内 12px，由 recipe 固定，业务代码不得再传 `strokeWidth`）。
4. **图标 ≠ 点击热区**：视觉 16px 的图标必须落在 ≥32px（推荐 38–44px）的目标内。用 `IconButton`，不要手写 `<button><svg/></button>`。

---

## 7. 无障碍（WCAG 2.2 AA）

1. **焦点可见**：绝对禁止只写 `focus:outline-none` 而无 `:focus-visible` 替代。统一使用 `FOCUS_RING` recipe（`packages/studio/src/ui/tokens.js`）。
2. **点击热区**：移动端最小 38px，见 §4.3。
3. **对比度**：见 §2.2，已实测。
4. **图标按钮必须有可访问名**：`IconButton` 缺 `label` 会在开发期告警；只有 `title` 不算（历史缺陷：composer 的圆形生成按钮无可访问名）。
5. **可见文本优先于 `aria-label`**：有可见标签的按钮不要加 `aria-label` 覆盖它（WCAG 2.5.3 标签名一致）。
6. **键盘**：模态需焦点锁定、`Esc` 关闭、点击遮罩关闭 —— 由 `Modal`/`ModalContent` 承担，业务层不要重造。

---

## 8. 强制与校验（PART 31）

规范不可校验就等于不存在。当前有四道互补的闸：

| 闸 | 命令 | 层次 | 基线文件 | CI |
| :--- | :--- | :--- | :--- | :--- |
| 源码 token 守卫 | `npm run lint:ui` | 静态扫描 `.js/.jsx/.mjs`：**14 条类名规则 + 2 条源码级规则** | `scripts/ui-token-baseline.json`（14919 处 / 194 文件） | ✅ `test:ci` |
| 死类对照闸 | `npm run lint:dead` | 源里请求的类名 **vs** 真实生产构建产物里生成的类选择器（`scripts/ui-dead-classes.mjs`） | 无基线（见下"第四道闸为什么不做 ratchet"） | ❌ 需先有构建产物 |
| 运行时漂移审计 | `npm run ui:audit` | Playwright 读取**计算后样式**，契约直接解析自 `globals.css` `:root`（19 条规则，声明于 `scripts/ui-spec-audit.mjs`） | `.ui-drift/state.json` | ❌ 手动 |
| 视觉/响应回归 | `npm run test:visual` | 10 档视口 × 8 条路由：控制台错误、横向溢出、**控件可达性**、像素基线（含 composer 特写）+ 1 条闸门自审 | `tests/visual/__snapshots__/` | ❌ 需先起服务 |

**Ratchet 规则**：守卫基线**只能下降**。任何文件新增违规会让 `lint:ui` 失败；清理后必须 `npm run lint:ui:update` 把下降固化下来，否则下一个人可以悄悄涨回去。但 `lint:ui:update` 写的是**全量快照** —— 场上还有未处理的上升时跑它，等于把别人的回归登记成合法值。**先让 `lint:ui` 全绿，再 update。**

**第四道闸为什么不做 ratchet**：死类闸的分母是**一次具体的构建产物**，而共享工作树里五个会话各自有各自的 dist；把数字冻进基线会得到一个"谁的文件新就谁的数"的假契约。所以它的角色是测量与定位（`--report` / `--files` / `--explain`，check 模式 exit 1 供人在改动后自己跑），而其中**不需要构建也能判死**的那一族已经升格成守卫规则进了 `test:ci`。

**两类规则 + 一条管辖范围原则**：类名规则扫"字符串里出现了什么"，源码级规则扫"元素上缺了什么"。后者是必需的 —— "缺失"在类名字符串里根本不可见，两道类名闸与像素闸对它全部免疫。当前落地的两条源码级规则，各自对应 `UI_AUDIT.md` §4.6 的一类失效模式：

| 规则 | 检查什么 | 放行什么（写进代码里的免责条件） | 存量（2026-09-21 08:18 入账） |
| :--- | :--- | :--- | :--- |
| `range-without-utility` | 每个 `type="range"` 是否带 `.range` —— `appearance:none` 之后浏览器不再画 thumb，代码看起来完全正常，用户面对的是一根拖不动的横条 | 标签内其它位置出现独立 `range` token（如从常量取类） | **36 处 / 10 文件**（其中 4 处在待删的遗留树 `src/components/ImageStudio.js`，见 `UI_AUDIT.md` §7） |
| `div-onclick-not-keyboard` | 带 `onClick` 的 `<div>` 是否对键盘存在 —— 历史条目、上传卡片、卡片整面点击在 Tab 序列里根本不存在 | `role=`／`tabIndex=`／`onKeyDown`／`onKeyUp`；或 `as="button｜Link"` 渲染成语义元素；或 `aria-hidden="true"`（点击遮罩不是控件，键盘路径是对话框自己的 Escape） | **78 处 / 39 文件** |

**两条按 config 划管辖范围的新规则**。它们不能写成一条全局正则，因为"这个类名有没有病"取决于**哪一份 tailwind.config.js 编译这个文件**——本仓有 5 份（根 + `studio` + 三个子包），`content` 名单互相交叠：

| 规则 | 判据 | 为什么会误伤，怎么避免 | 存量（09:30 入账） |
| :--- | :--- | :--- | :--- |
| `alpha-on-var-colour` | 颜色被注册成裸 `var(--x)` 时，`bg-x/10` **整条不产出 CSS**（Tailwind v3 拆不出通道）。要求**每一份**管辖该文件的 config 都把它当 `var()` | `Open-Poe-AI/packages/agents` 用 `primary: '#3898ec'` **字面量**注册过同名颜色 —— 那里 `/10` 真的能编译，报它就是报冤案（实测豁免 19 处） | **381 处 / 77 文件** |
| `off-system-type-ramp` | `text-xs`/`text-sm`/… 会正常生成 `font-size:12px; line-height:16px`，但既不在具名阶梯上、也不带 recipe 的字重与字距。只要**有一份**管辖该文件的 config 声明了具名阶梯就报 | 子包自己没有字号阶梯（`workflow-builder` 是 `extend: {}`），但它被根构建编译进 `/studio` 时用的就是根阶梯 —— 所以照报；只有**没有任何 config 认领**的文件（子包自带的 `client/` 独立应用）豁免（实测 58 处 / 368 文件，绝大多数本来不含类名） | **1926 处 / 149 文件** |

两条方向相反是有意的：**死类要求全票**（一份样式表能救活它，它就不是死的），**绕过语义层只要求有得选**（阶梯在架，`text-xs` 就是选择而非无奈）。

**闸门要做故意破坏验证**（2026-09-21 已做，全部可复现）：

| 注入 | 期望 | 实测 |
| :--- | :--- | :--- |
| `.range` 上加 `h-[37px]` | `lint:ui` 红 | `AudioStudio.jsx arbitrary-geometry: 0 -> 1`，退出码 1 |
| `.range` 上删掉 `range` | `lint:ui` 红 | `AudioStudio.jsx range-without-utility: 0 -> 1` |
| 新建 `div onClick` 且无任何语义标记 | `lint:ui` 红 | `lib/__ui-guard-probe.jsx div-onclick-not-keyboard: 0 -> 1`；同一文件里带 `role`+`tabIndex`+`onKeyDown`、`as="button"`、`aria-hidden="true"` 的三种写法**同时验证为不报**（规则只抓真缺失，不逼业务加装饰属性）。探针文件已删 |
| 两条新规则的 15 组正负样本 | 该报的报、该沉默的沉默 | `node .agents/probe-alpha-rule.mjs`（只读，不写盘）15/15 通过：同一句 `bg-primary/10` 在 `app/layout.js` 报、在 `agents/src/AiAgent.jsx` 不报、在无人认领的子包 `client/` 不报；`bg-white/10`、`bg-primary`（无修饰）、`shadow-black/60`、`text-body`、`text-ink-muted` 全部不报 |
| composer recipe 改 1~2px | 特写断言红 | 页面级 `maxDiffPixelRatio: 0.01` 无反应，`[data-prompt-composer]:visible`（0.001）在 image/video/lipsync 三个面全部报红 |

最后一行不是模拟 —— 它是 recipe 收敛时**真实发生**的一次漂移，被特写闸抓到、被页面闸放过。这两条闸的分工由此得证。

**已知盲区（已修）**：`eslint` 的 FlatCompat 只为 `.js/.ts` 生成 `files` 模式，导致**全仓 `.jsx` 从未被 lint**（`--print-config` 返回 `undefined`，命令仍退出 0）。现已把规则集扩展到 `.jsx` 并新增 `npm run lint:packages` 接入 `test:ci`。

**视觉基线纪律**：必须从**生产构建**录制，绝不用 `next dev`（dev overlay 会把"Errors"角标和 HMR 抖动注入被比较的画面）。标准流程：

```bash
NEXT_DIST_DIR=.agents/verify-next npm run build      # 隔离产物，不抢别人的 .next
node -e "console.log(Object.keys(require('./.agents/verify-next/server/app-paths-manifest.json')).length)"  # 应 ≥ 200
NEXT_DIST_DIR=.agents/verify-next bash .agents/serve.sh <port>
VISUAL_BASE_URL=http://localhost:<port> npm run test:visual
```

另两条纪律：`-g` 过滤**只能用 ASCII**（Git Bash 会破坏非 ASCII 参数，含 `›` 的模式静默匹配 0 个测试并"全绿"）；同一命令**重跑一次再定性**（外部资源偶发 `net::ERR_CONNECTION_CLOSED` 会让多个不相关测试同时红）。重录前必须先定归属，流程见 `UI_MIGRATION.md` §5。

---

## 9. Do / Don't 速查

| 场景 | 🔴 禁止 | 🟢 必须 |
| :--- | :--- | :--- |
| 颜色 | `bg-[#22d3ee]`、`text-white/50`、`bg-zinc-900` | `bg-brand`、`text-ink-muted`、`bg-surface` |
| **半透明** | `bg-primary/10`、`bg-canvas/95`、`border-line/50`（**不产出任何 CSS**，见 §4.6） | `bg-brand-soft`、`bg-surface-glass`、`border-line-subtle`、`bg-wash` |
| **字号** | `text-xs`、`text-sm`、`text-base`、`text-2xl`（会生成 CSS，但值与行高不在架上） | `text-display` / `page-title` / `section-title` / `card-title` / `body` / `body-sm` / `label` / `caption` / `micro` / `mono` |
| 按钮 | 手写 `<button className="px-4 py-2 bg-gradient…">` | `<Button variant size>` / `<IconButton label>` |
| 高度 | `h-9`、`h-[37px]`、`h-[42px]` | `h-control-sm` / `-md` / `-lg` |
| 阴影 | `shadow-[0_0_15px_#22d3ee]`、`shadow-2xl` | `shadow-elevation-1..4` |
| 圆角 | `rounded-[2rem]`、`rounded-[4px]` | `rounded-md` / `-lg` / `-xl` |
| 层级 | `z-[999]`、`z-[100]` | `z-modal` / `z-popover` / `z-toast` |
| 过渡 | `transition-all` | `transition-[background-color,border-color,color] duration-fast` |
| 图标 | 内联 `<svg>`、emoji、无 `label` 的图标按钮 | `lucide-react` + `IconButton` |
| 滑杆 | 裸 `type="range"`（`appearance:none` 后无 thumb）、`div` + `onMouseDown` 自制进度条 | `.range` + `aria-label`（见 §4.5） |
| 开关 | 二值设置用裸 `type="checkbox"`（命中区 13px） | `<Switch>` + 绑定 `htmlFor` 的 `<Label>`；多选框仍用 checkbox |
| 面板宽 | `w-[400px]`、`lg:w-[25rem]` | `lg:w-panel`（`--panel-w` 400） |
| 滚动条 | `scrollbar-none`、隐藏 webkit 滚动条 | 全局滚动条或 `.scrollbar-rail` |
| 文案 | JSX 里硬编码中文（`正在生成中...`、`11/张`） | `messages/<locale>/*.json` + copy key |
| 布局 | 依赖 `overflow-hidden` 裁掉超宽控件 | 让控件换行或用响应式收纳（见 §10） |
| **通告条** | 引入第三方荧光黄绿（`#ccff00`）、高度随机（`h-10`/`h-[42px]`） | `h-announcement-h` (36px)，使用 `bg-brand-soft` 或 `bg-surface-inverse` 反色 |
| **分段器** | 手写方角 Tab、无轨槽单选框 | 胶囊轨槽（`rounded-full bg-well p-1`）+ 高对比实心药丸滑块 |
| **底纹网格** | 手写外链大图、高对比亮白圆点网格 | `.bg-dot-grid`（24px 步长，1px 圆点，`--border-strong`） |
| **充值模态** | 多级跳转收银台、无资产条的生硬表单 | 架构 A（资产条+通用/专属双层网格）或架构 B（左选档右扫码即时联动） |
| **微徽章** | 任意小字（`text-[9px]`）、任意圆角（`rounded-[3px]`） | 4 级语义微标签（`text-micro`，`rounded-xs` 或 `rounded-full`） |
| **浮层条目文本行** | 在交互项内部写死 `bg-overlay` 造成 hover 遮盖层斑块 | 保持内部标题/文本行背景透明，由外壳 `hover:bg-wash-strong` 自然透出 |
| **多栏浮层辅助栏** | 在辅助栏微光 `bg-wash` 内嵌套 `bg-overlay` 产生深黑穿孔 | 辅助栏子元素全透明透出微光底，图标联动 `group-hover:bg-wash-strong` |
| **暗色遮罩定位** | 遮罩层硬编码 `top-14` 并在公告栏下切入玻璃顶栏底层 | 动态测量 Header 底边缘（`style={{ top: `${headerBottom}px` }}`）严丝合缝对齐 |
| **毛玻璃透光度** | 使用 `bg-white/10` 或 `bg-white/20` 在深暗底板上造成泛白浑浊的“白内障灰雾” | 严格遵循 4% 透光红线：`bg-white/[0.03]` ~ `bg-white/[0.04]` 或 `bg-surface-glass/80` |
| **毛玻璃高斯核** | 使用 4px~8px 小模糊导致背景极光噪点与点阵断续漏出产生脏斑 | 展台大卡/面板统一 `backdrop-blur-2xl` (40px)；输入控件 `backdrop-blur-md` (12px) |
| **毛玻璃边缘光** | 纯色半透无边框，或手写 2px/3px 粗边框 | 必须使用 1px 发丝级物理透光描边 `border border-white/10`，悬停 `hover:border-white/20` |
| **展台卡背光** | 采用高饱和霓虹发光 `shadow-[0_0_30px_#e11d74]` 制造廉价刺眼感 | 采用柔和悬浮环境光晕背光源 `absolute inset-0 bg-brand/5 blur-3xl rounded-full opacity-30` |
| **工作台画布背景** | 给右侧主舞台加实心纯黑背景遮挡底层 3D 极光与交互点阵 | 右侧主舞台容器保持 `bg-transparent`，让极光与物理点阵作为沉浸式原生内容展台 |
| **吸底主生成栏** | 无模糊纯黑背景硬切页面，或脱离固定停靠被长表单推走 | `bg-surface-glass/90 backdrop-blur-2xl border-t border-white/10` 绝对吸附固定停靠 |
| **模型版本分段器** | 选项切换时改变 padding 或边框引起高度抖动 | 保持固定高度，选中项使用 `bg-brand text-white shadow-elevation-1 font-bold` |

---

## 10. 响应式契约（PART 02）

桌面与移动是**两套分级布局**，不是同一布局的缩放。基线视口共 10 档：

`1920×1080 · 1600×900 · 1440×900 · 1366×768 · 1280×800 · 1024×768 · 768×1024 · 430×932 · 390×844 · 375×812`

**可达性优先于不溢出**。studio 外壳是 `overflow-hidden`，因此"页面没有横向滚动条"完全可能同时意味着"三个控件根本不存在"。视觉闸现在单独断言：任何 `a/button/input/select/textarea` 不得渲染在视口外，除非它位于可滚动容器内。历史教训：390px 顶栏控件一度渲染到 x=578（超出 188px）而旧断言全绿。

收纳策略按优先级：
1. 让控件轨道**换行**（Prompt Composer 参数行即此方案）；
2. 响应式隐藏**重复能力**（顶栏营销胶囊在 `md` 以下隐藏，能力保留在账号菜单与 `/pricing`）；
3. 只有真正的横向轨道（模型列表、画廊）才用 `.scrollbar-rail` 滚动。

禁止用第 2 种手段藏掉唯一入口。
