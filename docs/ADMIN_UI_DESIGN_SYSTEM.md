# KOYO Studio Admin UI Design System — 运营与管理后台设计规范

**版本**：1.0.0 (2026-10-16)  
**地位**：本文是 KOYO Studio 全站管理后台（`/admin/*`）开发的**专项视觉与交互主契约**，深度吸收微信公众平台（WeChat MP Admin）与腾讯 We分析（WeData Analysis）的企业级后台设计哲学，与全站最高视觉主规范 `docs/UI_DESIGN_SYSTEM.md` 构成互补支撑。

---

## 1. 核心设计哲学：Clean, Technical & Uncluttered

管理后台是一个**高频业务决策与系统运维工具**，不是 C 端视觉营销页，也绝非花哨的仪表盘展板。参考微信公众平台与腾讯 We分析的工业级落地标准，确立四大不可妥协的后台设计铁律：

| 核心法则 | 微信案例实践映射 | KOYO Studio 后台落地约束 |
| :--- | :--- | :--- |
| **极致克制 (Restraint)** | 去除所有霓虹、发光、多重毛玻璃与大面积亮色，纯粹信息主导。 | 严禁在管理后台使用装饰性彩色渐变、呼吸光斑；背景统一为沉静中性黑灰，色彩仅用于状态传达与主行动点。 |
| **信息降噪 (Quiet Hierarchy)** | 界面不存在大段免责或指导说明，规则就地随字段紧凑展示。 | 彻底摒弃全宽大横幅、教学卡片与空洞统计卡，将业务规则下沉到行内辅助说明中（如“本月还可修改 3 次”）。 |
| **视线流动 (Linear Flow)** | 属性在左、数值居中、规则在旁、操作靠右，视线单向流动。 | 严格推行“四列列表布局 (The 4-Column Setting Model)”，告别混乱的弹窗嵌套与无序表单。 |
| **操作直达 (Instant Action)** | 关键动作（修改、下载、详情、开关）一键可见，无需层层翻找。 | 表格与设置项右侧统一保留高对比度操作链接；调价与开关均在行内完成即时生效反馈。 |

---

## 2. 侧边栏导航系统规范 (Sidebar Navigation System)

> **参考案例**：腾讯 We分析导航侧栏（图 1）与微信小程序后台左侧菜单（图 2）。

### 2.1 侧边栏几何与排版契约

- **固定宽度**：桌面端统一固定为 **220px**，提供充足文本空间且不挤占右侧主操作区。
- **背景与分界**：
  - 侧边栏背景采用 `bg-base` (`#0e1013`)，与右侧主画布 `bg-canvas` (`#0a0b0d`) 形成微弱自然的层级进阶。
  - 右侧分界线采用标准发丝分割线 `border-r border-line-subtle` (`rgba(255, 255, 255, 0.06)`)。

### 2.2 导航分组 (Group Title)
- **结构**：`[16px 线性线框图标] + [分组标题文本]`（如“AI 模型与路由”、“用户与权限”、“生成运营”）。
- **字体与颜色**：14px，中等字重（`font-medium`），字色采用次级中性灰 `text-ink-muted` (`#a0a4ab`)。
- **间距节奏**：组与组之间保持 `mt-6` (24px) 垂直间距，保持通透呼吸感。

### 2.3 导航项五态交互与“呼吸胶囊” (Active Capsule)
微信 We分析中最受赞誉的是其选中项的高级质感：**无突兀实线边框、无高饱和刺眼色块，仅凭极柔和的浅色底衬托高对比品牌字色**。

```
[Default]       [Hover]                    [Active / 呼吸胶囊]
数据看板  ───>  数据看板 (微白轻量底) ───>  数据看板 (淡洋红胶囊底 + 纯洋红文本)
```

| 状态 | 背景样式 | 文本与图标色彩 | 圆角与外边框 |
| :--- | :--- | :--- | :--- |
| **默认态 (Default)** | 透明 `bg-transparent` | `text-ink-muted` (`#a0a4ab`) | `rounded-lg` (8px), 无边框 |
| **悬浮态 (Hover)** | 极淡白底 `hover:bg-white/[0.05]` | 高亮纯白 `hover:text-ink` | `rounded-lg` (8px), 无发丝 |
| **选中态 (Active)** | 柔和薄底 `bg-brand/10` (`rgba(225, 29, 116, 0.10)`) | 品牌洋红 `text-brand` (`#e11d74`), `font-semibold` | `rounded-lg` (8px), 保持纯透明发丝 |
| **按压态 (Pressed)** | 稍加深底 `active:bg-brand/15` | `text-brand` | 瞬态微下沉 `active:scale-[0.98]` (80ms) |

### 2.4 侧栏底部系统区 (Footer Dock)
- 侧边栏底部固定常驻：
  - `[🔔 通知公告]`
  - `[👤 账户中心 + 角色徽标]`（如 `[超管]` 或 `[基础版]` 采用微型中性胶囊 `text-[10px] px-1.5 py-0.2`）。
- 与上方业务导航之间使用细分割线 `border-t border-line-subtle pt-3` 隔离。

---

## 3. 经典四列设置列表规范 (The 4-Column Setting Model)

> **参考案例**：微信小程序后台设置页面（图 3）。

### 3.1 为什么采用四列列表模型？
传统的后台管理经常陷入两个极端：要么将所有属性堆砌在一个巨大的 Modal 弹窗里，要么拆散成几张空洞的卡片。微信设置页创立的“四列列表模型”是目前处理复杂配置的最佳解决方案：
1. **无需跳转或弹窗遮罩**，当前状态、规则限制一览无余；
2. **读写分离清晰**：左侧阅读当前值，右侧直达修改动作；
3. **行内嵌入合规与风控约束**：用户在点击修改前就能清楚知道额度限制。

### 3.2 四列空间网格与数据契约

```
┌─────────────────┬──────────────────┬─────────────────────────────────┬──────────────┐
│ 字段属性名 (180px)│ 当前生效值 (220px)│ 规则、额度与风控说明 (自适应 flex-1)│ 快捷操作 (100px)│
├─────────────────┼──────────────────┼─────────────────────────────────┼──────────────┤
│ 模型展示名称    │ 豆包 Seedream 4.5│ 当前处于核心推荐位；修改后即时同步 Studio│ [修改]       │
│ 单次调用定价    │ 50 积分 (≈¥5.00) │ 官方底价 ¥0.022/次，预估毛利率 78.0%   │ [极速改价]   │
│ 前台可见开关    │ ● 展示中 (已准入)│ 通过健康度检测；关闭后立即从前台目录隐藏 │ [关闭展示]   │
└─────────────────┴──────────────────┴─────────────────────────────────┴──────────────┘
```

- **Col 1: 字段属性名 (Field Label)**
  - 宽度：固定 `w-44` ~ `w-52` (176px ~ 208px)，字号 14px，字色 `text-ink-muted`。
- **Col 2: 当前生效值 (Current Value / Asset)**
  - 宽度：`w-52` ~ `w-64` (208px ~ 256px)，字号 14px，字重 Semi-Bold，字色 `text-ink`。
  - 若为图片/头像/模型 Logo：统一采用精致的 36px ~ 40px 圆角方块展示，带 1px 发丝边框。
- **Col 3: 业务规则与额度约束 (Context & Limits)**
  - 宽度：`flex-1` 弹性自适应伸展。
  - 字号：12px ~ 13px 微文本，字色 `text-ink-subtle` (`#8a8f99`)。
  - 场景：展示“剩余修改次数”、“审核状态说明”、“成本与毛利率测算”、“接口健康状况”。
- **Col 4: 快捷操作入口 (Action Entry)**
  - 宽度：右对齐 `w-28` (112px)，文本靠最右侧。
  - 交互形式：纯文字高亮操作链接（`text-brand hover:underline` 或中性 `text-ink hover:text-white`），严禁使用大按钮喧宾夺主。
- **行样式规范**：
  - 行高：统一为 **60px ~ 68px**，垂直居中对齐；
  - 底边线：1px 细发丝分割线 `border-b border-line-subtle`；
  - 悬停反馈：悬停时整行微弱发光 `hover:bg-white/[0.015]`。

---

## 4. 任务流式卡片与栅格规范 (Step Flow & Card Grid)

> **参考案例**：微信小程序接入与发布流程页（图 2）。

### 4.1 任务分阶段组织结构 (Milestone Sections)
在复杂配置或接入流程中，严禁在一屏内平铺数十个输入框。必须按“阶段”划分独立 Section：
1. **Section 标题**：16px ~ 18px 加粗，带有阶段标识（如 `第一阶段: 模型身份与接入审核`）。
2. **阶段卡片栅格 (3-Column Grid)**：
   - 3 列卡片平铺：`grid grid-cols-1 md:grid-cols-3 gap-4`。
   - **卡片内部排版**：
     - **头部**：`[卡片标题 (15px)]` + 紧贴的 `[状态微徽章]`（如 `已就绪` 绿色胶囊、`待审核` 橙色胶囊）。
     - **主体内容**：当前关联的核心指标或最后操作时间（如“已接入 3 条可用渠道”）。
     - **右侧/底部操作**：右对齐微文字链接 `[详情]` 或 `[修改]`。

### 4.2 通栏推进卡片 (Full-Width Action Card)
用于需要关键推进操作或系统验收的节点（如上线验收、模型备案、批量调价）：
- 左侧：标题 + 两行精炼的核心指引文案；
- 右侧：实心高对比胶囊按钮（如 `[一键审核]`、`[上线验收]`），统一高度 32px，圆角 8px。

---

## 5. 次级选项卡规范 (Sub-Navigation Underline Tabs)

> **参考案例**：微信小程序“基本设置 / 第三方设置 / 关联设置”选项卡（图 3）。

后台页面内的二级导航**绝不使用厚重的嵌套卡片或大块药丸底**，统一采用极简的下划线标尺选项卡（Underline Tabs）：

```jsx
<div className="flex items-center gap-6 border-b border-line-subtle">
  <button className="relative pb-3 text-sm font-semibold text-brand">
    基本设置
    <span className="absolute bottom-0 inset-x-0 h-0.5 bg-brand rounded-full" />
  </button>
  <button className="pb-3 text-sm font-medium text-ink-muted hover:text-ink transition-colors">
    第三方与渠道
  </button>
  <button className="pb-3 text-sm font-medium text-ink-muted hover:text-ink transition-colors">
    定价策略
  </button>
</div>
```

- **默认态**：字色 `text-ink-muted`，高度与底边无下划线，悬浮微亮；
- **选中态**：字色切换为品牌洋红 `text-brand`，下方绝对定位 2px 高度的实心圆角下划标尺，无任何跳动抖动。

---

## 6. 后台色彩、字体与组件 Token 映射表

严格遵守全站主规范 `docs/UI_DESIGN_SYSTEM.md`，禁止在业务组件内发明字面量色值：

| UI 场景 | Tailwind Token 类 | 实际底层色值 | 说明 |
| :--- | :--- | :--- | :--- |
| **后台主底色** | `bg-canvas` | `#0a0b0d` | 全局背景，极深中性黑 |
| **侧边栏底色** | `bg-base` | `#0e1013` | 侧边栏与固定顶栏专用层级 |
| **卡片/行背景** | `bg-surface-raised` | `#191c21` | 卡片与表格行容器 |
| **导航选中底衬** | `bg-brand/10` | `rgba(225, 29, 116, 0.10)` | 微信风格淡色呼吸胶囊 |
| **导航选中文字** | `text-brand` | `#e11d74` | 品牌唯一主洋红 |
| **正文文字** | `text-ink` | `#ededf0` | 一级标题、字段生效值 |
| **次级文字** | `text-ink-muted` | `#a0a4ab` | 分组名、字段属性标签 |
| **规则辅助文字** | `text-ink-subtle` | `#70757e` | 额度限制、风控说明、时间戳 |
| **发丝分割线** | `border-line-subtle` | `rgba(255, 255, 255, 0.06)` | 列表行分割线、侧栏右边框 |
| **常规卡片边框** | `border-line` | `rgba(255, 255, 255, 0.10)` | 卡片外壳 1px 细线 |

---

## 7. 后台标准组件清单与实现代码 (Component Recipes)

为确保全站后台页面开发的一致性，在 `components/admin/AdminUi.js` 中正式固化以下标准组件：

### 7.1 `AdminSettingRow`（微信四列设置行组件）
```jsx
export function AdminSettingRow({ label, value, context, action, onClickAction }) {
  return (
    <div className="flex items-center justify-between py-4 border-b border-line-subtle hover:bg-white/[0.015] transition-colors text-sm">
      {/* Col 1: Label */}
      <div className="w-48 shrink-0 text-ink-muted font-medium">
        {label}
      </div>

      {/* Col 2: Current Value */}
      <div className="w-56 shrink-0 text-ink font-semibold">
        {value}
      </div>

      {/* Col 3: Rules & Limits */}
      <div className="flex-1 px-4 text-xs text-ink-subtle leading-relaxed">
        {context}
      </div>

      {/* Col 4: Action */}
      <div className="w-28 shrink-0 text-right">
        {action && (
          <button
            type="button"
            onClick={onClickAction}
            className="text-xs font-semibold text-brand hover:underline transition-all"
          >
            {action}
          </button>
        )}
      </div>
    </div>
  );
}
```

### 7.2 `AdminCardGridItem`（微信三栅格分步卡片组件）
```jsx
export function AdminCardGridItem({ title, badge, subtext, actionLabel, onAction }) {
  return (
    <div className="p-4 rounded-xl border border-line-subtle bg-surface-raised flex flex-col justify-between space-y-3 hover:border-line transition-all">
      <div className="flex items-center justify-between">
        <h4 className="text-body-sm font-semibold text-ink flex items-center gap-2">
          <span>{title}</span>
          {badge && (
            <span className="rounded px-1.5 py-0.2 text-[10px] bg-white/[0.06] text-ink-subtle border border-line-subtle font-normal">
              {badge}
            </span>
          )}
        </h4>
        {actionLabel && (
          <button
            type="button"
            onClick={onAction}
            className="text-caption font-semibold text-brand hover:underline"
          >
            {actionLabel}
          </button>
        )}
      </div>
      {subtext && (
        <p className="text-caption text-ink-subtle line-clamp-1">{subtext}</p>
      )}
    </div>
  );
}
```

---

## 9. 数据分析看板与图表系统规范 (Analytics Dashboard & Chart System)

> **参考案例**：腾讯 We分析·画像洞察与时序分析大盘（图 4: `wedata.weixin.qq.com/mp2/portrait/base`）。

We分析的分析看板是国内数据可视化与后台业务大盘的最高水准之一。其最大的特色是**“严谨、克制、高密度成对排布，拒绝花哨的大屏特效，专注于业务分析效率”**。

### 9.1 左右成对图表栅格 (The Paired Chart Grid)
分析图表绝不孤立平铺，推荐采用标准二分法（Paired 2-Column Grid）：
- **左侧：瞬态快照分布图 (Snapshot Distribution Chart)**
  - 聚焦**某一具体时间点（如单日）**的截面构成（如“用户性别分布”、“模型调用份额”）；
  - 配备**时间单步微调器 (Date Stepper)**，让管理员逐日/逐周切换切片。
- **右侧：时序历史趋势图 (Time Series Trend Chart)**
  - 聚焦**一段周期内（如近 14 天/30 天）**的变化演进趋势（如“用户性别趋势”、“模型消耗走势”）；
  - 配备**指标筛选分段器 (Metric Segmented Switch)**，在“绝对量（调用次数）”与“相对量（占比率）”之间一键切换。

```
┌──────────────────────────────────────────────┬──────────────────────────────────────────────┐
│ [左: 截面分布] 用户性别分布       [自然日 ∨] [📥]│ [右: 时序趋势] 用户性别趋势  [隐藏节点 ∨] [自然日 ∨] [📥]│
│ < 周四 2026/10/15 >                          │ 2026/10/02 - 2026/10/15                      │
│ 用户类型: [全部用户 ∨]                       │ 用户类型: [全部用户 ∨]   指标: [用户数] [占比]│
│                                              │                                              │
│               (环形/饼图/条形图)              │                  (时序折线/面积图)            │
└──────────────────────────────────────────────┴──────────────────────────────────────────────┘
```

### 9.2 全局与局部时间控制体系 (Time Control Hierarchy)
时间过滤分为两层，权责极其明确：
1. **全局时间范围 (Global Range Picker)**：
   - 放置于页面右上角（与页面主标题同高），格式：`[ 📅 2026/10/02 - 2026/10/15 ]`；
   - 决定整页数据与趋势图的全局时间视窗。
2. **卡片内时间微调 (In-Card Stepper & Granularity)**：
   - **时间步进器 (Date Stepper)**：`< 周四 2026/10/15 >`，用于截面图查看特定一天；
   - **周期粒度下拉 (Granularity Select)**：`[自然日 ∨]`、`[自然周 ∨]`、`[自然月 ∨]`，用于改变时序图聚合步长。

### 9.3 卡片右上角工具矩阵 (Card Utility Toolbar)
每个图表卡片右上角统一收归 3 个轻量工具，高度 28px：
1. **辅助显示开关**：如 `[隐藏节点 / 显示节点 ∨]`（控制折线拐点是否打点）；
2. **时间周期下拉**：如 `[自然日 ∨]`；
3. **数据一键导出按钮**：精致小图标 `[ 📥 ]`（点击直接导出当前图表对应维度的 CSV/Excel，字色 `text-ink-subtle hover:text-ink`）。

### 9.4 图表内指标分段器 (Metric Segmented Switch)
当同一套趋势数据需要查看不同口径（如“数量 vs 占比”、“总额 vs 人均”）时，严禁拆成两张图，统一使用轻量药丸分段器：
```jsx
<div className="inline-flex rounded-lg bg-well p-0.5 border border-line-subtle text-caption">
  <button className="rounded-md px-2.5 py-1 bg-surface-raised text-ink font-semibold shadow-elevation-1">
    用户数量
  </button>
  <button className="rounded-md px-2.5 py-1 text-ink-muted hover:text-ink">
    用户占比
  </button>
</div>
```

### 9.5 专业静默空状态与合规脱敏 (Silent Empty State & Privacy Mask)
微信的数据空状态设计体现了极高的工业级水准：**绝不用巨大的空状态大图抢戏，保持看板结构的工整性**。
- **真实无数据**：
  - 容器内部保持图表原高（如 240px），垂直居中单行提示：`ⓘ 相关数据项均为0`；
  - 字色 `text-ink-subtle`，字号 12px。
- **隐私/合规样本不足脱敏**：
  - 单行提示：`ⓘ 该条件下，用户数量少于50人，信息隐藏`；
  - 严谨体现平台隐私政策，增强产品专业可信赖度。

---

## 10. 分析看板代码级实现组件 (Chart Component Recipes)

在 `components/admin/AdminUi.js` 中新增以下分析标准组件：

### 10.1 `AdminChartCard`（标准分析图表卡片）
```jsx
export function AdminChartCard({
  title,
  subtitle,
  actions,
  filters,
  children,
  emptyText,
  className = '',
}) {
  return (
    <div className={`p-5 rounded-2xl border border-line-subtle bg-surface-raised flex flex-col justify-between ${className}`}>
      {/* Header */}
      <div className="flex items-start justify-between gap-4 pb-3 border-b border-line-subtle/50">
        <div>
          <h3 className="text-body font-semibold text-ink">{title}</h3>
          {subtitle && (
            <p className="mt-0.5 text-caption font-mono text-ink-subtle">{subtitle}</p>
          )}
        </div>
        {actions && (
          <div className="flex items-center gap-2 shrink-0 text-caption">
            {actions}
          </div>
        )}
      </div>

      {/* In-Card Filters */}
      {filters && (
        <div className="py-2.5 flex items-center justify-between gap-3 text-caption flex-wrap">
          {filters}
        </div>
      )}

      {/* Main Chart Body or Silent Empty */}
      <div className="pt-3 min-h-[220px] flex items-center justify-center">
        {emptyText ? (
          <div className="flex items-center gap-1.5 text-caption text-ink-subtle font-mono">
            <span className="text-xs">ⓘ</span>
            <span>{emptyText}</span>
          </div>
        ) : (
          children
        )}
      </div>
    </div>
  );
}
```

### 10.2 `AdminDateStepper`（时间单步微调器）
```jsx
export function AdminDateStepper({ label, onPrev, onNext, canPrev = true, canNext = true }) {
  return (
    <div className="inline-flex items-center gap-1.5 text-caption text-ink-muted">
      <button
        type="button"
        onClick={onPrev}
        disabled={!canPrev}
        className="p-1 rounded hover:bg-white/[0.06] text-ink-subtle hover:text-ink disabled:opacity-20"
      >
        ‹
      </button>
      <span className="font-mono text-ink font-medium px-1">{label}</span>
      <button
        type="button"
        onClick={onNext}
        disabled={!canNext}
        className="p-1 rounded hover:bg-white/[0.06] text-ink-subtle hover:text-ink disabled:opacity-20"
      >
        ›
      </button>
    </div>
  );
}
```

---

## 11. 审计与回归自检清单 (Verification Checklist)

任何针对后台页面的开发与改动，必须逐项核对本清单：

- [ ] **侧栏导航**：是否统一为 220px 宽度？选中项是否为 `bg-brand/10` 呼吸胶囊且严禁任何外发光？
- [ ] **信息层级**：是否彻底剔除了首屏的大段说明文字、操作指南或无意义巨幅统计卡？
- [ ] **设置项排版**：表单和设置界面是否优先采用标准的“四列列表布局 (Label - Value - Context - Action)”？
- [ ] **数据大盘**：数据分析页面是否采用“瞬态快照 vs 时序趋势”成对二分栅格（2-Column Paired Grid）？
- [ ] **图表工具**：图表卡片右上角是否统一配备周期切换与 `[ 📥 ]` 导出功能？
- [ ] **静默空态**：数据为空或样本不足时，是否使用单行 `ⓘ` 静默提示，绝不用巨型破坏性插画？
- [ ] **视觉边界**：是否严禁使用任何 `cyan-*` 等历史遗留色彩，纯粹收敛至 `#e11d74` 品牌洋红？
- [ ] **分割线质感**：所有分割线是否统一采用 1px `border-line-subtle` 发丝线，绝无粗黑厚重边框？
- [ ] **操作响应**：所有行内快速修改（改价、开关展示、置顶）是否具有即时保存与 Toast 反馈？

