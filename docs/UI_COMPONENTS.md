# KOYO Studio UI Primitive Components Reference

本文档详细记录所有代码级共享 UI 组件的 API 接口、参数契约、变体（Variants）与使用范例。后续任何业务工作室与页面开发必须优先复用本套组件。

---

## 1. Button / IconButton

**路径**：`components/ui/button.jsx`

### API & Props
| Prop | 类型 | 可选值 | 默认值 | 描述 |
| :--- | :--- | :--- | :--- | :--- |
| `variant` | `string` | `'primary' \| 'secondary' \| 'ghost' \| 'outline' \| 'danger'` | `'secondary'` | 按钮视觉变体 |
| `size` | `string` | `'sm' \| 'md' \| 'lg' \| 'icon-sm' \| 'icon-md' \| 'icon-lg'` | `'md'` | 控件高度（sm: 32px, md: 38px, lg: 44px） |
| `loading` | `boolean` | `true \| false` | `false` | 加载状态，内置高质感 Spinner |
| `disabled`| `boolean` | `true \| false` | `false` | 禁用状态，禁用点击热区与半透反馈 |

### 代码示例
```jsx
import { Button } from '@/components/ui/button';

// 核心生成主按钮
<Button variant="primary" size="md" loading={isGenerating} onClick={handleGenerate}>
  Generate
</Button>

// 次级操作按钮
<Button variant="secondary" size="md">
  Cancel
</Button>

// 图标按钮
<Button variant="ghost" size="icon-md" aria-label="Settings">
  <SettingsIcon className="size-4" />
</Button>
```

---

## 2. Input / SearchInput

**路径**：`components/ui/input.jsx`

### API & Props
| Prop | 类型 | 可选值 | 默认值 | 描述 |
| :--- | :--- | :--- | :--- | :--- |
| `size` | `string` | `'sm' \| 'md' \| 'lg'` | `'md'` | 输入框高度契约（sm: 32px, md: 38px, lg: 44px） |
| `error` | `boolean` | `true \| false` | `false` | 错误态红框与阴影反馈 |
| `disabled`| `boolean` | `true \| false` | `false` | 禁用输入态 |

### 代码示例
```jsx
import { Input } from '@/components/ui/input';

<Input
  placeholder="Enter prompt or seed..."
  value={seed}
  onChange={(e) => setSeed(e.target.value)}
  size="md"
/>
```

---

## 3. Textarea

**路径**：`components/ui/textarea.jsx`

### API & Props
内置暗色质感、精细滚动条与焦点环，支持自由纵向调节或固定高度。

### 代码示例
```jsx
import { Textarea } from '@/components/ui/textarea';

<Textarea
  rows={3}
  placeholder="Detailed negative prompt..."
  value={negativePrompt}
  onChange={(e) => setNegativePrompt(e.target.value)}
/>
```

---

## 4. Select / Dropdown

**路径**：`components/ui/select.jsx`

基于 Radix UI 构建，包含键盘导航、无障碍标签与弹出菜单定位。

### 代码示例
```jsx
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from '@/components/ui/select';

<Select value={model} onValueChange={setModel}>
  <SelectTrigger>
    <SelectValue placeholder="Select Model" />
  </SelectTrigger>
  <SelectContent>
    <SelectItem value="flux-pro">FLUX.1 Pro Ultra</SelectItem>
    <SelectItem value="flux-dev">FLUX.1 Dev</SelectItem>
    <SelectItem value="sd-35">Stable Diffusion 3.5</SelectItem>
  </SelectContent>
</Select>
```

---

## 5. Card Family

**路径**：`components/ui/card.jsx`

包含 `Card`, `CardHeader`, `CardTitle`, `CardDescription`, `CardContent`, `CardFooter`。
支持 `interactive` 属性，提供低干扰的高质感微弱悬停上浮。

### 代码示例
```jsx
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';

<Card interactive onClick={selectPreset}>
  <CardHeader>
    <CardTitle>Cinematic Lighting</CardTitle>
    <CardDescription>Soft keylight with volumetric shadows</CardDescription>
  </CardHeader>
  <CardContent>
    <img src="/presets/cinema.jpg" alt="Preview" className="rounded-lg aspect-video object-cover" />
  </CardContent>
</Card>
```

---

## 6. Badge (状态徽章)

**路径**：`components/ui/badge.jsx`

### API & Props
| Prop | 类型 | 可选值 | 默认值 | 描述 |
| :--- | :--- | :--- | :--- | :--- |
| `variant` | `string` | `'default' \| 'accent' \| 'success' \| 'warning' \| 'danger' \| 'info' \| 'outline'` | `'default'` | 语义状态颜色 |

### 代码示例
```jsx
import { Badge } from '@/components/ui/badge';

<Badge variant="accent">Generating</Badge>
<Badge variant="success">Completed</Badge>
<Badge variant="warning">Queued</Badge>
<Badge variant="danger">Failed</Badge>
```

---

## 7. Modal & Dialog

**路径**：`components/ui/dialog.jsx`

规范的全站弹窗基座，包含半透深黑遮罩、平滑缩放进入动画、右上角关闭热区、Esc 退出与 Focus Trap。

### 代码示例
```jsx
import {
  Dialog,
  DialogTrigger,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';

<Dialog open={isOpen} onOpenChange={setIsOpen}>
  <DialogTrigger asChild>
    <Button variant="secondary">Open Settings</Button>
  </DialogTrigger>
  <DialogContent>
    <DialogHeader>
      <DialogTitle>Workspace Configuration</DialogTitle>
      <DialogDescription>Modify runtime parameters.</DialogDescription>
    </DialogHeader>
    <div className="space-y-4 py-2">
      {/* 业务控件 */}
    </div>
    <DialogFooter>
      <Button variant="ghost" onClick={() => setIsOpen(false)}>Cancel</Button>
      <Button variant="primary" onClick={save}>Save Changes</Button>
    </DialogFooter>
  </DialogContent>
</Dialog>
```

---

## 8. Prompt Composer (一级复合组件)

**路径**：`packages/studio/src/components/prompt/PromptComposer.jsx`

全站 AI 创作的核心输入组件，统一封装了文本区自适应增高、媒体参考附件插槽、参数下拉选择器集成与主操作按钮。

### 代码示例
```jsx
import {
  PromptComposer,
  PromptTextarea,
  PromptFooter,
  PromptControls,
  PromptAction,
  promptControlClassName,
  promptMediaButtonClassName,
} from '@/packages/studio/src/components/prompt/PromptComposer';

<PromptComposer>
  <PromptTextarea
    value={prompt}
    onChange={(e) => setPrompt(e.target.value)}
    placeholder="Describe what you want to create..."
  />
  <PromptFooter>
    <PromptControls>
      <button className={promptControlClassName({ active: false })}>
        <span>16:9</span>
      </button>
      <button className={promptControlClassName({ active: true })}>
        <span>FLUX.1</span>
      </button>
      <button className={promptMediaButtonClassName()} aria-label="Upload Image">
        <UploadIcon />
      </button>
    </PromptControls>
    <PromptAction onClick={handleGenerate}>
      Generate
    </PromptAction>
  </PromptFooter>
</PromptComposer>
```

---

## 9. AuthModal / AuthCard (全站唯一认证卡片组件)

**路径**：`components/AuthModal.js`

全站统一的身份认证与登录/注册卡片，集成了：
- 灵动吉祥物 Mascot（绿色高光芽苗水滴，带弹性动画）
- 胶囊气泡（`注册 / 登录领积分哦`）
- 点阵微纹理背景（Dot Grid Pattern）
- 药丸双 Tab 切换器（手机号 / 邮箱）
- 品牌青色主操作按钮（`Button variant="primary"` / `bg-brand hover:bg-brand-hover`）
- 药丸胶囊第三方快捷登录（谷歌、X、TikTok）

### API & Props
| Prop | 类型 | 默认值 | 描述 |
| :--- | :--- | :--- | :--- |
| `isInline` | `boolean` | `false` | 为 `true` 时作为页面内嵌卡片渲染（去除全屏黑色遮罩）；为 `false` 时作为全屏居中弹窗渲染 |
| `onSuccess` | `(user, entitlements) => void` | `undefined` | 认证成功回调 |
| `onClose` | `() => void` | `undefined` | 关闭按钮点击回调。若 `isInline=true` 且未传，则默认跳转至 `/studio` |
| `className`| `string` | `''` | 外层卡片补充样式 |

### 强制准则
严禁在任何页面或模块自行手写未经吉祥物与点阵规范包装的“素人登录表单”。无论是独立页面（如 `/account` 未登录态）还是弹窗（如 Studio 顶栏登录），必须一律复用 `AuthModal`。

---

## 10. TopMegaNavigation & MegaMenuPanel (顶栏 Mega Menu 双栏导航矩阵)

**路径**：
- `components/navigation/TopMegaNavigation.js`
- `components/navigation/MegaMenuPanel.js`

基于 Radix UI Navigation Menu 构建的高性能全站一级导航系统，集成了：
- 桌面端视口自适应居中算法（保护视口边距 ≥ 16px）
- 双栏架构：左栏 Features（工具与工作室特性），右栏 Models（底层核心模型矩阵）
- 中性微光悬停与联动图标动效
- 动态对齐顶栏底边缘的沉浸式 Backdrop Scrim 遮罩层

### TopMegaNavigation Props
| Prop | 类型 | 默认值 | 描述 |
| :--- | :--- | :--- | :--- |
| `activeTab` | `string` | `'image'` | 当前激活的工作室 Tab ID（如 'image'、'video'） |
| `locale` | `string` | `'zh'` | 国际化语言代码（`'zh'` \| `'en'`） |
| `onSelectTab` | `(e, tabId, modelKey) => void` | `undefined` | 选中并切换工作室/模型时的回调函数 |
| `className` | `string` | `''` | 额外容器类名（自动剥离非法圆角工具类） |

### MegaMenuPanel Props
| Prop | 类型 | 默认值 | 描述 |
| :--- | :--- | :--- | :--- |
| `category` | `object` | `undefined` | 当前展开分类配置对象（含 `features` 与 `models` 列表） |
| `locale` | `string` | `'zh'` | 当前语言代码 |
| `onItemClick` | `(e, item, category) => void` | `undefined` | 条目点击回调 |

### 强制准则
1. **内部标题透明契约**：条目内部的标题包裹容器（`<div className="flex items-center gap-1.5">`）必须保持背景透明，严禁设置 `bg-overlay`，确保悬停态 `hover:bg-wash-strong` 完整自然透出。
2. **辅助栏底色防穿孔**：右侧 Models 辅助栏使用 `bg-wash` 微光底，子条目严禁使用任何底层不透明背景类。
3. **遮罩层边界动态计算**：Portal 挂载的 `[data-mega-scrim]` 必须通过 `style={{ top: `${headerBottom}px` }}` 像素级动态贴合顶栏下边缘，禁止硬编码 `top-14`。

---

## 11. StudioGlassStageCard (中央舞台悬浮毛玻璃展台卡)

**路径**：`packages/studio/src/ui/StudioGlassStageCard.jsx` 或组合 Recipe：
`bg-white/[0.03] backdrop-blur-2xl border border-white/10 rounded-2xl shadow-elevation-2 relative group`

用于工作台主舞台中央的空状态、结果展示与核心引导展台。

### 结构与层级
```jsx
<div className="relative group max-w-md p-8 rounded-2xl bg-white/[0.03] backdrop-blur-2xl border border-white/10 shadow-elevation-2 text-center animate-fade-in">
  {/* 0. 悬浮径向漫射背光 */}
  <div className="absolute inset-0 bg-brand/5 blur-3xl rounded-full opacity-30 group-hover:opacity-50 transition-opacity duration-1000 pointer-events-none" />
  
  {/* 1. 中央超大图标底座 (Squircle Well) */}
  <div className="w-20 h-20 mx-auto mb-6 rounded-2xl bg-white/[0.04] border border-white/15 flex items-center justify-center shadow-inner relative z-10 transition-transform duration-500 group-hover:scale-105">
    <MusicIcon className="text-brand w-9 h-9" />
  </div>

  {/* 2. 标题与正文 */}
  <div className="relative z-10">
    <h3 className="text-white font-black text-xl mb-3 tracking-tight">音频工作室</h3>
    <p className="text-sm text-zinc-300 font-medium leading-relaxed px-4">
      选择一个 AI 音乐模型、声音克隆或音效生成器，在左侧修改参数，创作您的下一段高保真音轨。
    </p>
  </div>
</div>
```

---

## 12. StudioGlassControl (毛玻璃表单控件通用外壳)

**适用**：模型下拉 Trigger、Prompt 文本框、Style 输入框、Switch 复合行。

### 核心 Recipe 配方
| 控件类型 | 典型 ClassName | 交互态 |
| :--- | :--- | :--- |
| **下拉 Trigger** | `w-full bg-white/[0.04] hover:bg-white/[0.08] border border-white/10 hover:border-brand-line/50 rounded-xl px-4 py-3.5 text-xs text-white backdrop-blur-md transition-all flex items-center justify-between` | 悬停边框带洋红微光，箭头 180° 平滑翻转 |
| **Prompt 文本框** | `w-full bg-white/[0.04] backdrop-blur-md border border-white/10 focus:border-brand-line focus:ring-1 focus:ring-brand-ring rounded-xl p-3.5 text-xs text-white placeholder:text-zinc-500 min-h-[110px] resize-none` | 聚焦唤醒 1px 洋红高光环 |
| **快捷胶囊 (Chip)** | `px-3 py-1 rounded-full bg-white/[0.04] hover:bg-white/[0.08] border border-white/10 hover:border-brand-line text-[11px] font-medium text-zinc-300 hover:text-white transition-all` | 独立 Pill 语义，点击填入 |
| **Switch 复合行** | `flex items-center justify-between bg-white/[0.03] backdrop-blur-md border border-white/10 rounded-xl p-4 transition-all hover:bg-white/[0.05] hover:border-white/20` | 左文右开关，洋红阴影微光 |

---

## 13. StudioVersionGrid (模型版本分段矩阵选择器)

专用于 Suno / Midjourney 等多版本 AI 模型的快速切换矩阵。

### 代码结构示例
```jsx
<div className="space-y-2.5">
  <div className="flex items-center justify-between">
    <label className="text-xs font-bold text-zinc-200 uppercase tracking-wider block">
      模型版本
    </label>
    <span className="text-[11px] font-mono font-semibold px-2 py-0.5 rounded-md bg-brand-soft border border-brand-line text-brand">
      {currentVal}
    </span>
  </div>
  <div className="grid grid-cols-4 gap-1.5 p-1.5 bg-white/[0.03] backdrop-blur-md border border-white/10 rounded-xl">
    {options.map((opt) => (
      <button
        key={opt.value}
        type="button"
        onClick={() => onChange(opt.value)}
        className={`py-2 px-2 rounded-lg text-xs text-center transition-all cursor-pointer ${
          currentVal === opt.value
            ? "bg-brand text-white shadow-elevation-1 font-bold"
            : "text-zinc-300 font-semibold hover:text-white hover:bg-white/[0.06]"
        }`}
      >
        {opt.label}
      </button>
    ))}
  </div>
</div>
```

---

## 14. PremiumAudioPlayer (高保真玻璃音频播放器)

**路径**：`packages/studio/src/components/AudioStudio.jsx` (内置)

### 功能规范
1. **外壳**：`w-full max-w-2xl bg-surface-glass/85 border border-white/10 rounded-2xl p-6 lg:p-8 shadow-elevation-3 backdrop-blur-2xl space-y-6`
2. **波形屏**：`rounded-xl bg-black/40 overflow-hidden border border-white/5 backdrop-blur-md py-6`
3. **18 频段跳动柱状条**：`w-1.5 rounded-full bg-gradient-to-t from-brand to-rose-400 transition-all duration-100`
4. **进度拖拽轨**：`h-2 bg-white/10 hover:bg-white/15 rounded-full cursor-pointer`，内置洋红填充与悬停显现白点 Thumb
5. **控制栏**：左侧音量静音 + `.range` 滑杆；居中大圆 Play/Pause（`w-12 h-12 bg-brand rounded-full shadow-elevation-brand`）；右侧保存下载按钮



