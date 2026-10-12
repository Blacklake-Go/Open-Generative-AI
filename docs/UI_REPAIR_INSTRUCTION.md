# KOYO Studio — 原始圆角层级、多层阴影与页面不可点击回归修复指令

> 依据：`UI_DESIGN_SYSTEM.md` 3.4.2、`UI_COMPONENTS.md` 3.3.2、`UI_AUDIT.md` 3.3.2、`UI_MIGRATION.md` 3.2.2。

立即停止继续扩散式 UI 重构。本轮只修复“胶囊圆角退化”和“页面可见但无法点击”两个回归，不得修改路由、API、支付、登录、生成逻辑、业务状态机或数据结构。

## 目标视觉

顶部分类导航统一参考：`个人/自媒体 / 短漫剧 / MV / 游戏 / 电商 / 广告`。

- Track：深色连续胶囊，默认高 40px，`rounded-full`。
- Item：默认高 32px，全部为完整药丸，`rounded-full`。
- Active：默认白底黑字的高对比药丸；品牌强调场景才允许品牌青色。
- 任何状态切换都不得改变高度、padding 或圆角。

## 同步恢复网站原始“多重圆角层级”

不要把本轮理解为“所有东西都 rounded-full”。必须恢复原网站类似登录框、Composer、侧栏和顶部状态控件的层级：

- 常规按钮 / Select / 侧栏交互项：`rounded-lg` = 12px
- Input / Textarea：`rounded-xl` = 16px
- Card / 小型 Surface：`rounded-xl` = 16px
- Prompt Composer / Modal / Drawer / 大型 Panel：`rounded-2xl` = 20px
- Segmented / Status Chip / Social Auth / 明确胶囊控件：`rounded-full`
- MicroBadge：4/6px 或明确 Pill

嵌套必须有层级：例如 `Modal 20 → Input 16 → 普通控件 12`。禁止把整个页面批量统一成 8px、12px、20px 或 full。

## 同步恢复暗色多层阴影

不要使用单条 `shadow-lg/2xl`，也不要用霓虹 glow 替代空间层级。

- `elevation-1`：Active Pill / 小型选中控件
- `elevation-2`：Card / Composer
- `elevation-3`：Dropdown / Popover / Menu
- `elevation-4`：Modal / Drawer / 登录 / 支付
- Header / Sidebar / 普通表单行：默认 flat，无 shadow

Modal/Popover 必须同时有细边框与中性阴影。阴影只能用 CSS `box-shadow` token；禁止创建绝对定位“阴影层”DOM，因为它可能再次拦截点击。

检查：
```js
getComputedStyle(el).borderRadius
getComputedStyle(el).boxShadow
getComputedStyle(el).pointerEvents
```

建议验收值：
- Modal / Composer：约 20px
- Input：约 16px
- Standard Control：约 12px
- Pill：`>= height / 2`
- Modal / Popover `boxShadow !== 'none'`

## P0 根因修复

1. 全仓搜索：`TabsList variant="segmented"`、`SegmentedControl`、`PillSegmentedControl`、`PromptSegmentedControl`、手写 `rounded-full` 分类导航。
2. 检查最终 class；同一节点不得同时存在两个圆角类。重点清理：
   - `rounded-md + rounded-full`
   - `rounded-lg + rounded-full`
   - `rounded-none + rounded-full`
3. 当前 `cn()` 不做 Tailwind merge。禁止依赖 className 顺序覆盖。
4. 禁止 `cn(controlClasses(...), "rounded-full")`。Pill 必须改为单一 `pillControlClasses()` / `PILL_SEGMENT_*` recipe，一次只输出一个 `rounded-full`。
5. 禁止使用 `!important`、全局 `button { border-radius: ... }` 或 `[role=tab]` 覆盖。

## 页面无法点击排查

逐页运行：

```js
document.elementFromPoint(innerWidth / 2, innerHeight / 2)
```

检查是否有透明的 `fixed inset-0` Overlay / Scrim / Dialog / Drawer / Portal 持续覆盖页面。

检查受影响按钮及祖先：

```js
getComputedStyle($0).pointerEvents
getComputedStyle($0).zIndex
```

规则：

- 关闭态 Overlay 必须卸载，或明确不捕获 pointer events。
- Pill 的装饰性 Active 滑块若为绝对定位层，必须 `pointer-events-none`。
- 真实 Trigger 必须 `pointer-events:auto`。
- 禁止用 `z-[9999]` / `z-[99999]` 抢层级。

## 浮层遮罩层一致性与防穿孔规则（Overlay Consistency & Punch-Through Prevention）

浮层内部条目悬停/选中出现“遮盖层不一致、深黑补丁色块、辅助栏穿孔”属于 P0 级严重视觉回归。必须遵循以下检查规则：

1. **条目内部标题行严禁设置不透明背景**：
   - 检查所有 `DropdownMenu`、`Popover`、`MegaMenuPanel`、`SelectContent` 内部的 `<a>`、`<button>`。
   - 内部的标题包裹容器（如 `<div className="flex items-center gap-1.5">`）必须保持背景全透明。**严禁写死 `bg-overlay`**。
   - 外层交互项在 hover 时获得 `hover:bg-wash-strong`，内部一旦嵌套 `bg-overlay`（`#202429`）就会像黑胶布一样粗暴覆盖悬停微光。
2. **多栏微光辅助栏防穿孔**：
   - 双栏面板中辅助栏常设为微光底色 `bg-wash`。辅助栏内所有列表子项绝不能打 `bg-overlay`，否则会在微光层上打孔穿透出底层死黑。
3. **Backdrop Scrim 动态定位契约**：
   - 全屏暗色遮罩（`data-mega-scrim`）严禁硬编码 `top-14`。
   - 必须在挂载/展开时动态测量当前顶栏底边缘 `header.getBoundingClientRect().bottom`，并绑定行内样式 `style={{ top: `${headerBottom}px` }}`。
   - 绝不允许遮罩层在有顶部公告（如 ChinaIpGate、维护提示）时向上切入半透明玻璃 Header 底板造成横向色差断层。

## 浏览器验收

为 Pill 根节点加 `data-pill-segmented`，Trigger 加 `data-pill-segment-item`，并增加 Playwright 断言：

```js
const radius = parseFloat(getComputedStyle(el).borderRadius)
const height = el.getBoundingClientRect().height
expect(radius).toBeGreaterThanOrEqual(height / 2)
expect(getComputedStyle(el).pointerEvents).toBe('auto')
```

对于浮层与遮罩层，增加自动化断言：
```js
// 验证浮层内无硬编码穿孔底色
expect(itemTitleEl.className).not.toContain('bg-overlay')
// 验证遮罩层顶部与顶栏底部像素级对齐
const headerBottom = Math.round(headerEl.getBoundingClientRect().bottom)
const scrimTop = Math.round(parseFloat(getComputedStyle(scrimEl).top))
expect(scrimTop).toBe(headerBottom)
```

逐页验证：顶部分类、Tabs、按钮、Select、Modal 开关、输入聚焦、滑杆、滚动、键盘 Tab/方向键均正常。

## 交付要求

最终输出表格：页面、组件、根因、文件:行、修复前 class、修复前 computed border-radius、修复后 class、修复后 border-radius、pointer-events、点击验证、键盘验证。

在以上项目全部通过前，不得继续下一轮 UI 批量更新。

