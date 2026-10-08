# KoyoSIM UI 规范

本规范适用于面向用户的 Studio、社区、作品中心和账户页面。所有新 UI 以 shadcn/ui 的源代码组件为基础，通过语义 token 统一视觉，不直接复制页面级的颜色和交互实现。

## 基础语言

- 组件：优先使用 `components/ui` 中的 shadcn 组件；操作按钮使用 `Button`，信息容器使用 `Card`，状态使用 `Badge`，筛选使用 `Tabs` / `TabsList` / `TabsTrigger`，空状态使用 `Empty`，加载使用 `Skeleton`。
- 图标：统一使用 `lucide-react` 的线性图标，默认 16–20px、1.8–2px 描边。按钮内图标必须标记 `data-icon="inline-start"` 或 `data-icon="inline-end"`。不再使用 emoji、内联 SVG 图标或来源不一致的图标库。
- 字体：中文、英文和数字使用系统优先的 Apple 风格无衬线栈：`Inter`, `ui-sans-serif`, `system-ui`, `-apple-system`, `BlinkMacSystemFont`, `Segoe UI`。正文保持轻微负字距，标题使用更紧的 tracking。
- 文案：产品名称使用 `KoyoSIM`；页面名称使用“社区”，不使用“即梦社区”。

## 颜色与层级

颜色只能通过 shadcn 语义 token 使用：`background`、`foreground`、`card`、`muted`、`primary`、`accent`、`destructive`、`border`、`input`、`ring`。

- 背景：近黑色冷调底色，页面通过顶部青色径向光晕建立空间层次。
- 主色：电光青，用于主要操作、焦点环、选中状态和关键数值。
- 辅色：紫色只用于创作氛围和次级强调，不与主按钮竞争。
- 卡片：半透明深色卡片 + 细边框 + backdrop blur；卡片默认不叠加彩色重阴影。
- 高亮：仅在主要 CTA、选中状态和卡片悬停时使用有限的主色 glow。

## 动效

- 统一使用 150–300ms，曲线为 `cubic-bezier(0.16, 1, 0.3, 1)`。
- 卡片悬停只做 `-translate-y-0.5` 和边框/阴影变化；媒体预览最多放大 1.04 倍。
- 搜索框的焦点表现是边框变亮 + 4px 主色 focus ring，不改变布局；提交后保留 Skeleton 过渡到结果或 Empty 状态。
- 图表若新增，使用 `--chart-1` 至 `--chart-5`，按序渐入（opacity + translateY），不使用持续闪烁或干扰阅读的无限动画。
- 所有动效必须服从 `prefers-reduced-motion: reduce`，此时关闭位移、缩放和循环动画。

## 响应式与可访问性

- 页面容器使用 `.page-shell`，最大宽度 1280px；桌面端采用留白优先，移动端通过横向滚动承载分类 Tab。
- 所有图标按钮提供 `aria-label`；所有弹窗必须有可见标题或屏幕阅读器标题，并支持点击遮罩关闭。
- 异步区域使用 `aria-live="polite"` 或 `role="status"`；禁用态不依赖颜色单独表达。
- 空状态必须给出下一步动作，避免只有装饰性插图。
