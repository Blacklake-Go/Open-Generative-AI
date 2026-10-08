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
- 醒目洋红/品红大操作按钮（`bg-[#b71676] hover:bg-[#c91882]`）
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

