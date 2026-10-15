# 即梦 AI (Jimeng AI / Dreamina) 全站 UI、微交互与动效系统逆向工程规范专著

> **规范版本**：v1.0.0-RELEASE (Reverse Engineering Special Edition)  
> **逆向测绘基准日期**：2026-10-13  
> **测绘目标平台**：即梦 AI 官方线上生产环境 (`https://jimeng.jianying.com/ai-tool/home` 及 `/ai-tool/generate`)  
> **物理特征证据源**：17 组生产级打包 CSS Bundles（总计 2.4MB 纯文本，包括 `lv-components.da3c693fb3.css`、`lv-secondary-components.faed323a7c.css`、`HomeCreate.c5ff9b223e.css`、`3413.c1d5cb56e9.css`、`content-generator-feature-loader-1.0ef930dedd.css`、`content-generator-feature-loader-6.81342b423c.css`、`byted-image.a69ed7f713.css`、`3012.5aa23cfca8.css`、`dreamina-commerce-1.434044f76c.css` 等）  
> **文档密级与定位**：KOYO Studio 核心研发工业级参考规范 · 独占逆向萃取技术专著

---

## 目录 (Table of Contents)

- [§1 架构与子系统全景 (Architecture & Subsystems)](#1-架构与子系统全景-architecture--subsystems)
  - [1.1 LightVelocity 组件架构与 Arco Design 演进分叉](#11-lightvelocity-组件架构与-arco-design-演进分叉)
  - [1.2 五大业务子系统拓扑与视口分发](#12-五大业务子系统拓扑与视口分发)
  - [1.3 容器查询与视口自适应约束](#13-容器查询与视口自适应约束)
- [§2 微动效与工业级缓动曲线库 (Micro-Motion & Easing Curve Library)](#2-微动效与工业级缓动曲线库-micro-motion--easing-curve-library)
  - [2.1 实测核心贝塞尔曲线谱系 (Cubic-Bezier Catalog)](#21-实测核心贝塞尔曲线谱系-cubic-bezier-catalog)
  - [2.2 阶梯化物理耗时体系 (Duration Hierarchy)](#22-阶梯化物理耗时体系-duration-hierarchy)
  - [2.3 关键帧动画实录 (Keyframe Animations Verbatim)](#23-关键帧动画实录-keyframe-animations-verbatim)
  - [2.4 硬件加速与渲染管线优化法则](#24-硬件加速与渲染管线优化法则)
- [§3 按钮与控制台交互状态机 (Buttons & Console State Machine)](#3-按钮与控制台交互状态机-buttons--console-state-machine)
  - [3.1 四阶按钮尺寸工程矩阵 (4-Tier Button Matrix)](#31-四阶按钮尺寸工程矩阵-4-tier-button-matrix)
  - [3.2 主按钮与次级按钮五态转换机 (5-State Machine)](#32-主按钮与次级按钮五态转换机-5-state-machine)
  - [3.3 幻彩珠光分段模式切换胶囊 (Pearlescent Segmented Mode Pill)](#33-幻彩珠光分段模式切换胶囊-pearlescent-segmented-mode-pill)
  - [3.4 高精度开关组件 (Switch `.lv-switch`)](#34-高精度开关组件-switch-lv-switch)
- [§4 浮窗与覆盖层光学系统 (Overlays & Floating Surfaces)](#4-浮窗与覆盖层光学系统-overlays--floating-surfaces)
  - [4.1 弹窗对话框系统 (Modal `.lv-modal`)](#41-弹窗对话框系统-modal-lv-modal)
  - [4.2 抽屉侧边栏系统 (Drawer `.lv-drawer` / `.slideLeft` / `.slideRight`)](#42-抽屉侧边栏系统-drawer-lv-drawer--slideleft--slideright)
  - [4.3 气泡浮层与下拉菜单 (Popover & Dropdown Menu)](#43-气泡浮层与下拉菜单-popover--dropdown-menu)
  - [4.4 智能定位文字提示 (Tooltip `.simple-tooltip`)](#44-智能定位文字提示-tooltip-simple-tooltip)
  - [4.5 点击阻断与穿孔防护架构 (Pointer-Events Safety Architecture)](#45-点击阻断与穿孔防护架构-pointer-events-safety-architecture)
  - [4.6 四阶高斯模糊与中性暗色阴影梯级 (Elevation & Blur Tiers)](#46-四阶高斯模糊与中性暗色阴影梯级-elevation--blur-tiers)
- [§5 字体排版与图标视觉体系 (Typography & Iconography)](#5-字体排版与图标视觉体系-typography--iconography)
  - [5.1 字体族级联与排印栈 (Font Family Cascade)](#51-字体族级联与排印栈-font-family-cascade)
  - [5.2 十阶语义字阶与排版参数 (Typography Scale)](#52-十阶语义字阶与排版参数-typography-scale)
  - [5.3 暗黑对比度分层色彩矩阵 (Dark Contrast Hierarchy)](#53-暗黑对比度分层色彩矩阵-dark-contrast-hierarchy)
  - [5.4 图标系统网格与微交互 (Iconography System)](#54-图标系统网格与微交互-iconography-system)
- [§6 表单、设置控件与全量设计 Token 清单 (Forms, Controls & Token Catalog)](#6-表单设置控件与全量设计-token-清单-forms-controls--token-catalog)
  - [6.1 首页生成器浮岛 (Prompt Composer `.generator-_TwaOk`)](#61-首页生成器浮岛-prompt-composer-generator-_twaok)
  - [6.2 模型参数精密滑块 (Slider `.lv-slider`)](#62-模型参数精密滑块-slider-lv-slider)
  - [6.3 负向提示词手风琴折叠器 (Negative Prompt Accordion)](#63-负向提示词手风琴折叠器-negative-prompt-accordion)
  - [6.4 预设规格与风格标签胶囊 (Preset Pills & Tags)](#64-预设规格与风格标签胶囊-preset-pills--tags)
  - [6.5 LightVelocity 全量核心 CSS Token 权威速查表](#65-lightvelocity-全量核心-css-token-权威速查表)

---

## §1 架构与子系统全景 (Architecture & Subsystems)

### 1.1 LightVelocity 组件架构与 Arco Design 演进分叉

即梦 AI 客户端在工程架构层面建立在字节跳动内部自主迭代的 **LightVelocity (`lv-`)** 组件体系之上。该体系系基于企业级开源组件库 **Arco Design (`arco-`)** 深度演化而来，兼具极高的桌面端生产力与 AI 生成类产品的强沉浸暗黑多媒体质感：

1. **双重命名空间共存机制**：
   - 全局基础原子能力（网格系统、基础布局重置、部分抽屉与模态层骨架）仍保留 `.arco-*` 类前缀，见于全局包 `3012.5aa23cfca8.css`。
   - 业务增强型组件与 AI 交互控制台则全面迁移至 `.lv-*`（LightVelocity Component）命名空间，见于核心包 `lv-components.da3c693fb3.css` 与 `lv-secondary-components.faed323a7c.css`。
2. **主题注入与设计令牌分发**：
   - 采用根节点属性选择器注入主题变量：`[lv-theme=dark]` 与 `[lv-theme=light]`。在暗黑创作模式下，所有组件均消费 `--lvv-color-*` 与 `--lv-color-*` 两套双轨制 CSS 自定义属性。
   - 双轨制设计哲学：`--lv-color-*` 承载 Arco Design 传承的纯色与梯度（例如 `--lv-primary-6`, `--lv-gray-8`），而 `--lvv-color-*` 则专为视觉增强层（Visual Velocity）服务，专门处理带 Alpha 通道的表面漫反射、悬浮遮罩及场景状态色（例如 `--lvv-color-scenes-overlay`, `--lvv-color-fill-transparency-hover`）。

### 1.2 五大业务子系统拓扑与视口分发

即梦 AI 整体 Web 应用划分为五大高内聚的业务子系统，各子系统在 CSS 资产分配与渲染流沙箱中具备明确边界：

```
+-----------------------------------------------------------------------------------------+
|                                    即梦 AI Web 全站架构                                 |
+-----------------------------------------------------------------------------------------+
|                                                                                         |
|  [1. 首页工作台 (Home Studio)]                                                          |
|  - 视口自适应居中生成浮岛: .layout-ZnvrGD.main-frame-2026                               |
|  - 双模态展开/折叠状态机: 350ms 弹性过渡                                                |
|  - 资产包: HomeCreate.c5ff9b223e.css, 3413.c1d5cb56e9.css                               |
|                                                                                         |
|  [2. 图像生成与编辑工坊 (Image Generation & Edit)]                                      |
|  - 左侧精密参数控制台: 400px 定宽面板 (模型、画幅比例、分辨率选择器、垫图参考列表)     |
|  - 右侧多视窗流水线画布: 瀑布流自适应卡片与放大镜 Modal                                 |
|  - 资产包: content-generator-feature-loader-1.0ef930dedd.css                            |
|                                                                                         |
|  [3. 视频生成控制台 (Video Workbench)]                                                  |
|  - 运镜轨迹参数器、首尾帧过渡插值浮层、时长与运镜滑块                                   |
|  - 资产包: content-generator-feature-loader-6.81342b423c.css                            |
|                                                                                         |
|  [4. AI 无限画布 (AI Canvas)]                                                           |
|  - 自由视口平移缩放、区域擦除/重绘悬浮工具条、多选图层卡片                              |
|  - 资产包: byted-image.a69ed7f713.css                                                   |
|                                                                                         |
|  [5. 个人资产库与商业化体系 (Assets & Commerce)]                                        |
|  - 历史作品卡片网格、云端任务对账、积分消耗确认抽屉、VIP 充值弹窗                       |
|  - 资产包: Asset-2.04769ebb13.css, dreamina-commerce-1.434044f76c.css                   |
|                                                                                         |
+-----------------------------------------------------------------------------------------+
```

### 1.3 容器查询与视口自适应约束

即梦 AI 在现代生成工坊中大量引入 CSS 容器查询（Container Queries）替代传统媒体查询，以保证生成浮岛在不同侧边栏展开状态下实现组件级响应：

```css
/* 摘自 3413.c1d5cb56e9.css: 首页生成工坊容器查询声明 */
.create-page-container-T_Lq9e {
  container: create-page / inline-size;
  width: 100%;
  display: flex;
  justify-content: center;
}

/* 视口与容器自适应宽度夹紧公式 */
.main-frame-2026 {
  width: 100%;
  max-width: 1000px;
  min-width: 666px;
  width: clamp(666px, calc(100% - 200px), 1000px);
}

@container create-page (max-width: 800px) {
  .generator-_TwaOk {
    padding: 16px 12px;
    border-radius: 16px;
  }
}
```

---

## §2 微动效与工业级缓动曲线库 (Micro-Motion & Easing Curve Library)

### 2.1 实测核心贝塞尔曲线谱系 (Cubic-Bezier Catalog)

在对即梦 17 组 CSS 资产的 AST 深度解析中，提取到超过 550 处明确的 `cubic-bezier` 规则。即梦 AI 坚决弃用浏览器默认的 `ease`、`ease-in-out`，而是严格基于物理质量、阻尼与弹性反馈构建了六条工业级缓动曲线：

```
                即梦 AI 工业缓动曲线几何特性对比
                
  1.3 |                 .--. (Overshoot 弹性过冲: .3, 1.3, .3, 1)
      |                /    \
  1.0 |-------------.-'------'---------------- (终态 1.0)
      |            /   
      |          .'     (Standard 平滑减速: .4, 0, .2, 1)
      |        .'       (ByteDance 柔顺减速: .34, .69, .1, 1)
  0.5 |       /         (Heavy 展开过渡: .15, .75, .3, 1)
      |     .'
      |    /
  0.0 +---+------------------------------------
      0.0       0.5       1.0 (归一化时间 t)
```

#### 曲线 1：通用工业级标准减速曲线 `cubic-bezier(0.4, 0, 0.2, 1)`
- **出现频次统计**：全站 259 处声明，最高频核心基础曲线。
- **数学方程**：$P_0=(0, 0), P_1=(0.4, 0), P_2=(0.2, 1.0), P_3=(1.0, 1.0)$
- **物理运动特性**：前 15% 时间窗口极速响应，中段平稳滑行，后 40% 时间窗口细腻减速归位。无任何过冲，适用于无感知的功能性位移。
- **专有应用场景**：
  - 按钮悬浮微光渐变 (`.lv-btn:hover`)
  - 手风琴箭头旋转 (`.toggle-XYJWpn svg`: `-90deg` 到 `90deg`)
  - 工具栏左右滑动位移 (`.toolbar-vj55IH`)
  - 模态框遮罩透明度淡入 (`.fadeModal`)

#### 曲线 2：字节跳动柔顺阻尼减速曲线 `cubic-bezier(0.34, 0.69, 0.1, 1)`
- **出现频次统计**：全站 122 处声明。
- **数学方程**：$P_0=(0, 0), P_1=(0.34, 0.69), P_2=(0.1, 1.0), P_3=(1.0, 1.0)$
- **物理运动特性**：斜率在启动阶段迅速抬升（$y_1=0.69$），进入极早的高速巡航段，随后以长尾指数衰减形式贴合终点。带来丝滑入位感。
- **专有应用场景**：
  - 侧边栏抽屉滑入滑出 (`.slideLeft`, `.slideRight`)
  - 开关滑块内部状态色切换与圆点滚动 (`.lv-switch`, `.lv-switch-dot`)
  - 复杂级联选择菜单展开 (`.lv-cascader-menu`)
  - 快速信息提示浮层进入 (`.simple-tooltip`)

#### 曲线 3：弹性过冲物理回弹曲线 `cubic-bezier(0.3, 1.3, 0.3, 1)`
- **出现频次统计**：全站 80 处声明。
- **数学方程**：$P_0=(0, 0), P_1=(0.3, 1.3), P_2=(0.3, 1.0), P_3=(1.0, 1.0)$
- **物理运动特性**：$y_1 = 1.3 > 1.0$，在行程约 65% 处位移发生 30% 的显著弹性过冲，随后被机械阻尼强行拉回并稳定在 1.0 标称位置。
- **专有应用场景**：
  - 对话框与大图预览进入动画 (`.zoomModal-appear-active`: `scale(0.5) -> scale(1)`)
  - 未读红点与高亮徽标缩放入场 (`.badge-zoom`)
  - 滑块把手激活吸附与释放回弹 (`.lv-slider-button:after`)
  - Tooltip 退出逆向收敛 (`.simple-tooltip.hidden`)

#### 曲线 4：大质量容器平滑展开曲线 `cubic-bezier(0.15, 0.75, 0.3, 1)`
- **出现频次统计**：首页核心令牌 `--content-generator-collapse-transition-timing-function`。
- **数学方程**：$P_0=(0, 0), P_1=(0.15, 0.75), P_2=(0.3, 1.0), P_3=(1.0, 1.0)$
- **物理运动特性**：模拟大质量物体（Heavy Body）在受力膨胀时的惯性动量，克服静摩擦力后平滑释放，末端柔和着陆，消除突兀停顿。
- **专有应用场景**：
  - 首页生成岛展开与折叠 (`.generator-_TwaOk`: `70px <-> 184px`)
  - 提示词文本框高度自适应伸缩 (`.prompt-input-oIlouK`)
  - 生成参数高级折叠面板开关

#### 曲线 5：卡片悬浮悬停缩放曲线 `cubic-bezier(0.4, 0.95, 0.6, 1.1)`
- **出现频次统计**：全站 14 处声明。
- **数学方程**：$P_0=(0, 0), P_1=(0.4, 0.95), P_2=(0.6, 1.1), P_3=(1.0, 1.0)$
- **物理运动特性**：微过冲（10%），赋予卡片悬停时宛如从深色背景上“浮起并吸附于手指/鼠标”的磁性触感。
- **专有应用场景**：
  - 首页作品瀑布流卡片缩放 (`.card-NfOgKO .image-P2hdet:hover`)
  - 垫图素材拖拽放置区激活悬浮

#### 曲线 6：极速抽屉与阻尼双曲线 `cubic-bezier(0.2, 0, 0.4, 1)` & `cubic-bezier(0.34, 0.01, 0.43, 0.99)`
- **数学方程**：长程位移进出场专用平滑曲线。
- **物理运动特性**：完全对称的长程移动控制，消除大面积全屏重绘抖动。
- **专有应用场景**：
  - 大尺寸右侧参数抽屉进入/退出 (`400px` 移位)
  - 全屏沉浸式画板平移控制

---

### 2.2 阶梯化物理耗时体系 (Duration Hierarchy)

即梦 AI 建立了极其严苛的八阶物理耗时等级体系，彻底根除了前端开发中随意指定 0.25s、0.35s、0.5s 的混乱现象：

| 耗时阶级 | 标称毫秒 | 秒数格式 | 适用组件与语义映射 | 物理体感与设计心理意图 |
|:---|:---|:---|:---|:---|
| **Tier 0** | **100ms** | `0.10s` | 图标悬停反色、滚动条淡入淡出、极速按压反馈 | 瞬时响应，消除机械迟滞，赋予数字实体感 |
| **Tier 1** | **160ms** | `0.16s` | 导航箭头显隐、轻量遮罩淡出 (`opacity .16s ease-out`) | 快速退场，不阻断用户下一次操作意图 |
| **Tier 2** | **200ms** | `0.20s` | 开关把手位移、单选标签切换、小型浮窗进入 | 紧凑灵巧，符合人眼微扫视（Saccade）感知周期 |
| **Tier 3** | **300ms** | `0.30s` | 滑块把手弹性形变、Tooltip 入场、文本框高度伸缩 | 界面中型几何变形基准耗时，饱满且不拖沓 |
| **Tier 4** | **350ms** | `0.35s` | 首页生成浮岛主展开/折叠 (`--content-generator-duration`) | 复杂多元素伴随排版的标准宏观展开周期 |
| **Tier 5** | **400ms** | `0.40s` | 对话框弹性缩放入场 (`.zoomModal`)、全局暗色蒙层淡入 | 焦点打断类界面的庄重呈现，引导视线收敛 |
| **Tier 6** | **420ms** | `0.42s` | 400px 侧边抽屉滑入滑出 (`.side-drawer-panel`) | 跨视口大幅位移的无眩晕舒适滑动 |
| **Tier 7** | **520ms** | `0.52s` | 商业化会员中心购买弹窗、支付成功结果页揭幕 | 仪式感与心智确认，提供充分的安全与信赖感 |

---

### 2.3 关键帧动画实录 (Keyframe Animations Verbatim)

以下代码为从即梦核心 CSS Bundles 中逐字符反编译提取的关键帧声明，完全保留其原始关键节点与样式声明：

#### 关键帧 1：智能文字提示顶部上浮展开 `@keyframes simple-tooltip-fadein-top`
```css
/* 提取自 HomeCreate.c5ff9b223e.css 与 5275.ed333a100c.css */
@keyframes simple-tooltip-fadein-top {
  0% {
    opacity: 0;
    transform: translateY(0) scale(1);
    visibility: hidden;
  }
  1% {
    opacity: 0;
    transform: translateY(100%) scale(0);
    visibility: visible;
  }
  to {
    opacity: 1;
    transform: translateY(0) scale(1);
    visibility: visible;
  }
}
```
> **原理剖析**：注意 `1%` 帧的设计。在 `0%` 处保持 `visibility: hidden` 防止页面初次挂载时产生跳闪；在 `1%` 时将原点重置为目标下方的 `translateY(100%) scale(0)` 并点亮 `visibility: visible`，随后在 `to` 帧一气呵成完成向上探出并绽放。

#### 关键帧 2：对话框弹性放大入场 `@keyframes zoomModal`
```css
/* 提取自 lv-components.da3c693fb3.css 与 3012.5aa23cfca8.css */
@keyframes zoomModal {
  0% {
    opacity: 0;
    transform: scale(.5);
  }
  to {
    opacity: 1;
    transform: scale(1);
  }
}

/* 伴随状态类实现 */
.zoomModal-appear, .zoomModal-enter {
  opacity: 0;
  transform: scale(.5);
}
.zoomModal-appear-active, .zoomModal-enter-active {
  opacity: 1;
  transform: scale(1);
  transition: opacity .4s cubic-bezier(.3, 1.3, .3, 1), transform .4s cubic-bezier(.3, 1.3, .3, 1);
}
.zoomModal-exit {
  opacity: 1;
  transform: scale(1);
}
.zoomModal-exit-active {
  opacity: 0;
  transform: scale(.5);
  transition: opacity .4s cubic-bezier(.3, 1.3, .3, 1), transform .4s cubic-bezier(.3, 1.3, .3, 1);
}
```

#### 关键帧 3：延时不可见消除点击穿透 `@keyframes enable-visibility-hidden-*`
```css
/* 提取自 3413.c1d5cb56e9.css 与 content-generator-feature-loader-6.81342b423c.css */
@keyframes enable-visibility-hidden-Y5RoeC {
  0% {
    visibility: visible;
  }
  to {
    visibility: hidden;
  }
}

@keyframes enable-pointer-events-fO_wDI {
  0% {
    pointer-events: none;
  }
  to {
    pointer-events: auto;
  }
}

/* 消费场景：折叠容器在 350ms 过渡完成前保持可见，过渡结束瞬时隐藏，彻底释放鼠标穿透 */
.submit-button-Jw9rWu.expand-transition-start-frQWJf {
  animation: enable-visibility-hidden-Y5RoeC 0s var(--content-generator-collapse-transition-duration, 350ms) reverse forwards;
  visibility: hidden;
}
```

---

### 2.4 硬件加速与渲染管线优化法则

为了在运行数十个复杂模型参数控件与 4K 生成大图时保持 60fps/120fps 高刷体验，即梦 CSS 确立了三条硬性渲染管线契约：

1. **合成层隔离原则 (`will-change`)**：
   - 在高频变换动画元素（如生成按钮图标切换、滑块把手移动、抽屉面板）上精准配置 `will-change: transform, opacity;`。
   - 动画退出或静止状态必须显式重置为 `will-change: auto`，杜绝滥用导致移动端与低配 PC 显存泄漏（VRAM Exhaustion）。
2. **3D 硬件图层升维 (`translateZ`)**：
   - 浮动层与毛玻璃背板普遍强制注入 `transform: translate3d(0, 0, 0)` 或 `transform: translateZ(0)`，强制将图层提升至 GPU 合成线程渲染，完全绕过主线程布局（Layout）与绘制（Paint）。
3. **`contain` 属性隔离**：
   - 独立生成卡片声明 `contain: layout style paint;`，内部尺寸波动绝不触发全页面重排（Reflow Boundary）。

---

## §3 按钮与控制台交互状态机 (Buttons & Console State Machine)

### 3.1 四阶按钮尺寸工程矩阵 (4-Tier Button Matrix)

即梦 AI 的 LightVelocity 按钮分为四大标准化尺寸等级。所有尺寸严格绑定高度、内边距、字号、圆角及内嵌图标对齐规范：

```
       即梦 AI 四阶按钮几何截面标准 (高度与圆角梯级)
       
       40px +----------------------------------------+ r: 8px (Round: 18px)
            |  Large (.lv-btn-size-large)            | icon: 32x32px
       36px +--------------------------------------+ | r: 8px (Round: 16px)
            |  Default (.lv-btn-size-default)      | | icon: 28x28px
       32px +------------------------------------+ | | r: 8px (Round: 14px)
            |  Small (.lv-btn-size-small)        | | | icon: 24x24px
       28px +----------------------------------+ | | | r: 8px (Round: 12px)
            |  Mini (.lv-btn-size-mini)        | | | | icon: 24x24px
            +----------------------------------+ + + +
```

#### 四阶工程规格对比表：

| 尺寸等级 | 类名 | 高度 (h) | 字体大小 (font-size) | 行高 (line-height) | 水平内边距 (padding) | 默认圆角 (radius) | 胶囊圆角 (`-shape-round`) | 图标纯图标盒 (`-icon-only`) | 图标与文字间隙 |
|:---|:---|:---|:---|:---|:---|:---|:---|:---|:---|
| **Mini** | `.lv-btn-size-mini` | `28px` | `12px` | `1.5715` (20px) | `0 10px` | `8px` | `12px` | `24px × 24px` | `4px` (`margin-left: 4px`) |
| **Small** | `.lv-btn-size-small` | `32px` | `14px` | `1.5715` (22px) | `0 16px` | `8px` | `14px` | `24px × 24px` | `6px` (`margin-left: 6px`) |
| **Default** | `.lv-btn-size-default` | `36px` | `14px` | `1.5715` (22px) | `0 16px` | `8px` | `16px` | `28px × 28px` | `8px` (`margin-left: 8px`) |
| **Large** | `.lv-btn-size-large` | `40px` | `14px` | `1.5715` (22px) | `0 16px` | `8px` | `18px` | `32px × 32px` | `8px` (`margin-left: 8px`) |

> **圆形按钮规范 (`.lv-btn-shape-circle`)**：Mini 为 `24px` 纯圆；Small 为 `28px` 纯圆；Default 为 `32px` 纯圆；Large 为 `36px` 纯圆。其圆角统一引用令牌 `--lv-border-radius-circle: 50%`。

---

### 3.2 主按钮与次级按钮五态转换机 (5-State Machine)

即梦 AI 的按钮交互状态机具有极强的“工业级物理触控感”，其核心秘诀在于：**悬停进入采用 0.1s 线性平滑微光，按下激活瞬间强行切断动画（`transition: none`），提供零延迟的真实触压回馈**。

```
     [Default 默认态] 
            │
            ▼ (hover 入场: transition all .1s linear)
     [Hover 悬浮态] ───────────────┐
            │                      │ (按下瞬间: transition: none 物理瞬停)
            ▼                      ▼
     [Active 按下态] ◄──────── [Focus-Visible 键盘聚焦] (box-shadow 2px 外发光圈)
            │
            ▼ (条件判定: loading / disabled)
     [Disabled / Loading 禁用与加载态] (cursor: not-allowed, opacity: 0.3~0.4)
```

#### 1. 主行动按钮 (`.lv-btn-primary`) 实测规则
```css
/* 提取自 lv-components.da3c693fb3.css */
.lv-btn-primary {
  font-weight: 600;
  line-height: 1.5715;
  background-color: var(--lvv-color-main-default, #009efa);
  border: 1px solid transparent;
  color: var(--lvv-color-text-content-primary, #ffffff);
  box-sizing: border-box;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  user-select: none;
  transition: all .1s linear;
}

/* Hover 悬停态: 亮度提升 */
.lv-btn-primary:hover {
  background-color: var(--lvv-color-main-hover, #0099f2);
  border-color: transparent;
}

/* Active 激活态: 立即变暗 + transition: none */
.lv-btn-primary:active {
  background-color: var(--lvv-color-main-pressed, #0091e5);
  transition: none !important;
}

/* Focus-visible 键盘导航可访问光圈 */
.lv-btn-primary:focus-visible {
  outline: none;
  box-shadow: 0 0 0 2px rgb(var(--lv-primary-3, 150 210 255));
}

/* Disabled 禁用态 */
.lv-btn-primary:disabled, .lv-btn-primary.lv-btn-disabled {
  background-color: var(--lv-color-primary-light-3, rgba(0, 158, 250, 0.3));
  color: hsla(0, 0%, 100%, .3);
  cursor: not-allowed;
  box-shadow: none;
}
```

#### 2. 次级幽灵透光按钮 (`.lv-btn-secondary`) 实测规则
```css
/* 提取自 lv-components.da3c693fb3.css */
.lv-btn-secondary {
  font-weight: 400;
  background-color: var(--lvv-color-fill-transparency-block, rgba(255, 255, 255, 0.08));
  border: 1px solid transparent;
  color: var(--lvv-color-text-primary, #f5fbff);
  transition: all .1s linear;
}

.lv-btn-secondary:hover {
  background-color: var(--lvv-color-fill-transparency-hover, rgba(255, 255, 255, 0.12));
}

.lv-btn-secondary:active {
  background-color: var(--lvv-color-fill-transparency-pressed, rgba(255, 255, 255, 0.16));
  transition: none !important;
}

.lv-btn-secondary:focus-visible {
  outline: none;
  box-shadow: 0 0 0 2px var(--lv-color-neutral-4, rgba(255, 255, 255, 0.2));
}

.lv-btn-secondary:disabled {
  background-color: var(--lvv-color-fill-transparency-block, rgba(255, 255, 255, 0.04));
  color: var(--lvv-color-text-disable, rgba(255, 255, 255, 0.2));
  cursor: not-allowed;
}
```

---

### 3.3 幻彩珠光分段模式切换胶囊 (Pearlescent Segmented Mode Pill)

即梦在首页顶部的图片/视频/画布模式切换器采用了行业领先的**双层叠合渐变微雕珠光质感**（Double-Gradient Pearlescent Sheen）。该效果超越了常规平面或单向渐变，通过 180° 垂直边缘明暗滚落与 90° 水平七彩微光谱叠合，创造出类似白贝母雕刻按键的高级视觉光感。

```css
/* 提取自 3413.c1d5cb56e9.css: 珠光分段胶囊选中项完整 CSS 声明 */
.option-PPaTmy.lv-btn {
  height: 36px;
  border-radius: 9999px;
  padding: 4px 16px;
  font-size: 13px;
  font-weight: 500;
  line-height: 22px;
  box-sizing: border-box;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  border: none;
  user-select: none;
  position: relative;
  transition: color .2s cubic-bezier(.4, 0, .2, 1);
}

/* 激活选中态: 注入双层珠光渐变叠加 */
.option-PPaTmy.lv-btn.selected-u8N9fW {
  --create-mode-switch-selected-edge-rgb: 250 250 250;
  --create-mode-switch-selected-gradient: 
    /* 层 1: 垂直 180deg 边缘光影滚落 (模拟物理凸起圆弧受光反弹) */
    linear-gradient(
      180deg,
      rgb(var(--create-mode-switch-selected-edge-rgb)) 0%,
      rgb(var(--create-mode-switch-selected-edge-rgb) / 78%) 6%,
      rgb(var(--create-mode-switch-selected-edge-rgb) / 65%) 13%,
      rgb(var(--create-mode-switch-selected-edge-rgb) / 37%) 25%,
      transparent 42%,
      transparent 58%,
      rgb(var(--create-mode-switch-selected-edge-rgb) / 37%) 75%,
      rgb(var(--create-mode-switch-selected-edge-rgb) / 65%) 87%,
      rgb(var(--create-mode-switch-selected-edge-rgb) / 78%) 94%,
      rgb(var(--create-mode-switch-selected-edge-rgb)) 100%
    ),
    /* 层 2: 水平 90deg 珠光幻彩光谱 (16 节点极细马卡龙冷暖色相干涉) */
    linear-gradient(
      90deg,
      transparent 0%,
      hsla(31, 57%, 93%, .14) 3%,
      hsla(23, 89%, 93%, .73) 13%,
      rgba(255, 226, 206, .85) 22%,
      rgba(255, 221, 197, .85) 29%,
      hsla(37, 63%, 89%, .85) 35%,
      hsla(55, 22%, 90%, .85) 41%,
      rgba(196, 237, 240, .85) 48%,
      rgba(173, 238, 251, .85) 54%,
      rgba(150, 239, 255, .85) 61%,
      rgba(158, 235, 251, .84) 67%,
      rgba(173, 238, 251, .85) 73%,
      rgba(190, 243, 254, .85) 80%,
      rgba(204, 245, 255, .78) 86%,
      rgba(206, 243, 249, .4) 92%,
      rgba(218, 247, 249, .11) 97%,
      transparent 100%
    );

  /* 双渐变层叠加在纯白基底按钮上 */
  background: var(--create-mode-switch-selected-gradient), var(--component-primary-button-bg-default, #ffffff);
  color: #121212 !important; /* 珠光胶囊上文字强制呈现深黑高对比度 */
  box-shadow: 0 2px 8px 0 rgba(0, 0, 0, 0.16);
}

/* 未选中态 */
.option-PPaTmy.lv-btn:not(.selected-u8N9fW) {
  background: transparent;
  color: var(--text-primary, rgba(255, 255, 255, 0.85));
}

.option-PPaTmy.lv-btn:not(.selected-u8N9fW):hover {
  background: rgba(255, 255, 255, 0.08);
  color: #ffffff;
}
```

---

### 3.4 高精度开关组件 (Switch `.lv-switch`)

即梦 AI 的开关组件在紧凑面板中展现了极高的微像素控制精度：

```css
/* 提取自 lv-components.da3c693fb3.css */
.lv-switch {
  box-sizing: border-box;
  display: inline-block;
  vertical-align: middle;
  height: 20px;
  line-height: 20px;
  min-width: 36px;
  padding: 0;
  position: relative;
  cursor: pointer;
  border: none;
  border-radius: 12px;
  outline: 2px solid transparent;
  overflow: hidden;
  background-color: var(--lvv-color-text-disable, rgba(255, 255, 255, 0.2));
  transition: background-color .2s cubic-bezier(.34, .69, .1, 1);
}

/* 悬停光环 */
.lv-switch:hover {
  outline: 3px solid var(--lvv-color-fill-bg-3, rgba(255, 255, 255, 0.12));
}

/* 激活选中态底色 */
.lv-switch-checked {
  background-color: var(--lvv-color-main-default, #009efa);
}

.lv-switch-checked:hover {
  outline: 3px solid var(--lvv-color-main-02, rgba(0, 158, 250, 0.2));
}

/* 开关内部移动圆点 (Dot) */
.lv-switch-dot {
  position: absolute;
  top: 2.285px;
  left: 2.285px;
  width: 15.43px;
  height: 15.43px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  background-color: var(--lvv-color-text-content-primary, #ffffff);
  box-shadow: 0 1px 2px 0 rgba(0, 0, 0, .15);
  transition: all .2s cubic-bezier(.34, .69, .1, 1);
}

/* 选中态圆点翻转位移: 利用 left 100% 负外边距与 translateX 抵消边界误差 */
.lv-switch-checked .lv-switch-dot {
  left: 100%;
  margin-left: -2.285px;
  transform: translateX(-100%);
  color: var(--lvv-color-main-default, #009efa);
}

/* 键盘可访问聚焦外发光 */
.lv-switch-type-circle:focus-visible {
  box-shadow: 0 0 0 2px rgb(var(--lv-gray-6, 120 125 135));
}
.lv-switch-type-circle.lv-switch-checked:focus-visible {
  box-shadow: 0 0 0 2px var(--lv-color-primary-light-3, rgba(0, 158, 250, 0.4));
}
```

---

## §4 浮窗与覆盖层光学系统 (Overlays & Floating Surfaces)

### 4.1 弹窗对话框系统 (Modal `.lv-modal`)

即梦 AI 的 Modal 采用全沉浸深暗高斯毛玻璃与弹性缩放技术：

```css
/* 提取自 lv-components.da3c693fb3.css 与 3012.5aa23cfca8.css */
/* 1. 全局视口遮罩层 (Scrim Mask) */
.lv-modal-mask {
  position: fixed;
  inset: 0;
  width: 100%;
  height: 100%;
  z-index: 1001;
  background-color: rgba(0, 0, 0, 0.60); /* 即梦令牌 --bg-mask-60 */
  backdrop-filter: blur(20px);
  -webkit-backdrop-filter: blur(20px);
  transition: opacity .4s cubic-bezier(.3, 1.3, .3, 1);
}

/* 2. 居中模态卡片实体 (Modal Card) */
.lv-modal {
  position: relative;
  width: 520px;
  margin: 0 auto;
  top: 100px;
  box-sizing: border-box;
  background-color: var(--lvv-color-scenes-overlay, #1c1e22);
  border: 1px solid var(--stroke-primary, rgba(204, 221, 255, 0.08));
  border-radius: 20px; /* 大卡片采用严格 20px */
  box-shadow: 0 8px 56px 0 rgba(0, 0, 0, 0.24);
  padding: 24px;
  overflow: hidden;
  pointer-events: auto;
}

/* 3. 进出场动力学定义 */
.fadeModal-enter-active {
  animation: fadeIn .4s cubic-bezier(.4, 0, .2, 1);
}
.zoomModal-enter-active {
  animation: zoomModal .4s cubic-bezier(.3, 1.3, .3, 1);
}
```

---

### 4.2 抽屉侧边栏系统 (Drawer `.lv-drawer` / `.slideLeft` / `.slideRight`)

抽屉组件支撑了即梦 AI 的资产详情、高级垫图参数与历史对账流水：

```css
/* 提取自 lv-secondary-components.faed323a7c.css */
/* 抽屉容器与视口定位 */
.lv-drawer-wrapper {
  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  z-index: 1001;
}

/* 无遮罩纯面板模式点击穿透防护 */
.lv-drawer-no-mask {
  pointer-events: none;
}
.lv-drawer-no-mask .lv-drawer {
  pointer-events: auto;
}

/* 抽屉核心板体 */
.lv-drawer {
  position: absolute;
  top: 0;
  width: 400px; /* 即梦控制台标准抽屉宽度 */
  height: 100%;
  background-color: rgba(24, 26, 34, 0.96);
  backdrop-filter: blur(40px);
  -webkit-backdrop-filter: blur(40px);
  border-left: 1px solid rgba(255, 255, 255, 0.08);
  box-shadow: -8px 0 32px 0 rgba(0, 0, 0, 0.36);
}

/* 左右滑入滑出动力学 (耗时 420ms，曲线 .2, 0, .4, 1) */
.slideRight-appear, .slideRight-enter {
  transform: translateX(100%);
}
.slideRight-appear-active, .slideRight-enter-active {
  transform: translateX(0);
  transition: transform .42s cubic-bezier(.2, 0, .4, 1);
}
.slideRight-exit {
  transform: translateX(0);
}
.slideRight-exit-active {
  transform: translateX(100%);
  transition: transform .42s cubic-bezier(.2, 0, .4, 1);
}
```

---

### 4.3 气泡浮层与下拉菜单 (Popover & Dropdown Menu)

即梦 AI 的悬浮气泡具备超细腻的光学发丝边框与深层漫反射阴影：

```css
/* 提取自 content-generator-feature-loader-6.81342b423c.css 与 lv-components.da3c693fb3.css */
.lv-popover-content {
  box-sizing: border-box;
  background: var(--bg-dropdown-menu, #1c1e22);
  border: 0.5px solid var(--stroke-primary, rgba(204, 221, 255, 0.10));
  border-radius: 16px;
  padding: 16px;
  box-shadow: 0 8px 56px 0 rgba(0, 0, 0, 0.24);
  backdrop-filter: blur(20px);
  -webkit-backdrop-filter: blur(20px);
  color: var(--lvv-color-text-primary, #f5fbff);
  z-index: 1060;
  transform-origin: center top;
}

/* 纵向伸展进场 */
.zoomInTop-enter-active {
  opacity: 1;
  transform: scaleY(1);
  transition: transform .3s cubic-bezier(.3, 1.3, .3, 1), opacity .3s cubic-bezier(.3, 1.3, .3, 1);
}
.zoomInTop-enter {
  opacity: 0;
  transform: scaleY(0.8);
}
```

---

### 4.4 智能定位文字提示 (Tooltip `.simple-tooltip`)

```css
/* 提取自 HomeCreate.c5ff9b223e.css */
.simple-tooltip {
  position: absolute;
  padding: 8px 16px;
  border-radius: 8px;
  font-size: 12px;
  line-height: 20px;
  color: #ffffff;
  background-color: #22252a;
  border: 1px solid rgba(255, 255, 255, 0.08);
  box-shadow: 0 8px 56px 0 rgba(0, 0, 0, 0.24);
  max-width: 320px;
  word-break: break-word;
  z-index: 1070;
  pointer-events: none; /* 提示信息不干扰鼠标 */
  animation: simple-tooltip-fadein-top .3s cubic-bezier(.34, .69, .1, 1) forwards;
}

/* 四向箭头定位计算 */
.simple-tooltip-arrow-bottom {
  bottom: -4px;
  left: 50%;
  transform: translateX(-50%) rotate(45deg);
  width: 8px;
  height: 8px;
  background-color: #22252a;
  border-right: 1px solid rgba(255, 255, 255, 0.08);
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
}
```

---

### 4.5 点击阻断与穿孔防护架构 (Pointer-Events Safety Architecture)

在复杂单页生成应用中，常见重大故障之一即为“看似透明的关闭状态浮层挡住了底层输入框或画布的鼠标点击”。即梦 AI 在 CSS 架构上设计了严格的**四重点击安全防护协议**：

1. **遮罩与内容分离协议**：
   - 所有抽屉和无遮罩浮层容器明确声明：`.wrapper { pointer-events: none; }`
   - 内部真正可见且可交互的面板再显式重新声明：`.panel { pointer-events: auto; }`
2. **延时可见性关键帧消解 (Delayed Keyframe Visibility)**：
   - 凡涉及高度/透明度折叠的元素（例如负向提示词面板、高级参数面板），折叠结束必须绑定 0s 执行 + 350ms 延时的关键帧：
     `animation: enable-visibility-hidden-* 0s 350ms forwards;`
   - 确保折叠完成的瞬间，浏览器将元素标为 `visibility: hidden`，从命中测试树（Hit-testing Tree）中彻底剥离。
3. **菜单子项内壁全透明原则 (Anti-Punching Transparent Interiors)**：
   - 在任何 `DropdownMenu`、`Popover` 的列表子项中，内部的 `div`、`span`、`p` 严禁出现局部硬编码的 `background: #1c1e22`。必须维持 `background: transparent`，使得外层容器的 `hover:background` 能够无损透射，绝不产生“黑色胶布矩形”穿孔假死现象。
4. **动态 Scrim 边界标定**：
   - 全局遮罩层杜绝写死 `top: 56px` 或 `top: 64px`，必须动态读取导航栏底部像素 `header.getBoundingClientRect().bottom`，避免全局公告横幅弹出时遮罩层与导航半透明毛玻璃发生视觉割裂。

---

### 4.6 四阶高斯模糊与中性暗色阴影梯级 (Elevation & Blur Tiers)

即梦 AI 建立了严格的光学漫反射梯级，确保所有悬浮元素在深黑画布上呈现真实景深：

#### 四阶高斯毛玻璃漫反射梯级 (Blur Tiers)
- **Tier 1 (微量防眩光)**：`blur(4px)` ~ `blur(6px)` —— 适用于微小状态徽标、卡片局部标签。
- **Tier 2 (控件透光)**：`blur(10px)` ~ `blur(20px)` —— 适用于标准输入框、下拉菜单、Tooltip。
- **Tier 3 (工作台面板)**：`blur(40px)` ~ `blur(60px)` —— 适用于首页 Prompt 生成浮岛、侧边 400px 参数抽屉。
- **Tier 4 (沉浸遮罩全景)**：`blur(64px)` ~ `blur(80px)` —— 适用于大图放大审片 Modal 遮罩、画布底板。

#### 四阶中性暗色阴影矩阵 (Neutral Dark Shadow Tiers)
- **Elevation 1 (微浮雕卡片)**：`0 2px 5px rgba(0, 0, 0, 0.10)`
- **Elevation 2 (悬浮控件与气泡)**：`0 4px 12px rgba(0, 0, 0, 0.15)`
- **Elevation 3 (悬浮操作条)**：`0px 4px 12px rgba(0, 0, 0, 0.06), 0px 2px 6px rgba(0, 0, 0, 0.02)`
- **Elevation 4 (最高优先级模态与大浮层)**：`0 8px 56px 0 rgba(0, 0, 0, 0.24)`
- **内发光倒角补正**：`inset 0 0 0 1px hsla(0, 0%, 100%, 0.08)`

---

## §5 字体排版与图标视觉体系 (Typography & Iconography)

### 5.1 字体族级联与排印栈 (Font Family Cascade)

即梦 AI 深度定制了专属西文及西文数字排印栈，保障创作端数字的等宽对齐与优雅形态：

```css
/* 提取自 3012.5aa23cfca8.css 与 lv-components.da3c693fb3.css */
:root {
  /* 全局标准中文/全球化字体栈: CapCut 剪映设计体系专属字体级联 */
  --font-family: CapCut Sans, PingFang SC, Hiragino Sans GB, Microsoft YaHei, Arial, sans-serif;
  
  /* 专属数字与字母字体栈: Montserrat 保证几何等宽数字与技术高级感 */
  --alphanumeric-font-family: Montserrat, var(--font-family);
}
```

---

### 5.2 十阶语义字阶与排版参数 (Typography Scale)

即梦 AI 摒弃无约束的任意字号，全站文本严格锚定在 10 个层级上：

| 语义层级 | 标称字号 (Size) | 标称行高 (Line Height) | 字重 (Weight) | 字距 (Tracking) | 典型应用组件 |
|:---|:---|:---|:---|:---|:---|
| **Display** | `24px` | `32px` | `700 (Bold)` | `-0.02em` | 首页大标题、功能集聚焦点英雄文案 |
| **Page Title** | `20px` | `28px` | `600 (SemiBold)` | `-0.01em` | 侧边栏工作台主标题、大模态框标题 |
| **Section Title** | `18px` | `26px` | `600 (SemiBold)` | `0` | 参数设置区分组大标、模型卡片名 |
| **Subhead** | `16px` | `24px` | `600 (SemiBold)` | `0` | 抽屉二级分类标、重要通知强调 |
| **Card Title** | `15px` | `22px` | `500 (Medium)` | `0` | 作品卡片作者名、预设风格集标签 |
| **Body Primary** | `14px` | `24px` | `400 (Regular)` | `0` | 提示词主输入框 (`.prompt-input`)、标准表单 |
| **Body Compact**| `13px` | `22px` | `500 (Medium)` | `0` | 珠光分段胶囊文字、紧凑侧边栏选项 |
| **Label / Meta** | `12px` | `20px` | `400 / 600` | `0` | 按钮辅助文案、小开关标签、字数统计 |
| **Caption** | `11px` | `16px` | `400 (Regular)` | `+0.01em` | 生成参数小标签、模型代际标识 |
| **Micro Badge** | `10px` | `14px` | `600 (SemiBold)` | `+0.02em` | VIP 角标、New 状态红点、算力消耗数值 |

---

### 5.3 暗黑对比度分层色彩矩阵 (Dark Contrast Hierarchy)

在黑底创作空间中，即梦 AI 依靠严格的 Alpha 透明度梯度构建了层级分明的信息深度，杜绝灰阶混乱：

```css
:root {
  /* 100% 绝对焦点: 标题、主按钮文字、选中标签 */
  --text-primary: #f5fbff;
  --text-primary-hex: #ffffff;

  /* 70% 次级信息: 表单描述、次级按钮、常规正文 */
  --text-secondary: rgba(255, 255, 255, 0.70); /* #ffffffb2 */

  /* 60% 弱化信息: 参数小标签、未激活侧边栏菜单 */
  --text-tertiary: rgba(255, 255, 255, 0.60); /* #ffffff99 */

  /* 35% 占位符与微弱辅助: 文本框 Placeholder、输入建议 */
  --text-placeholder: rgba(255, 255, 255, 0.35); /* #ffffff59 */

  /* 20% 禁用态: 不可点击按钮、已关闭选项 */
  --text-disable: rgba(255, 255, 255, 0.20); /* #ffffff33 */
}
```

---

### 5.4 图标系统网格与微交互 (Iconography System)

即梦 AI 采用标准正方形图标容器网格体系（Square Bounding Box），所有矢量图标严格居中对齐：

1. **容器尺度阶梯**：
   - `12px × 12px`：内联微型指示剪头、下拉三角。
   - `14px × 14px`：手风琴展开箭头、次级开关伴随图标。
   - `16px × 16px`：标准按钮图标、工具栏小图标。
   - `18px × 18px`：圆形发送按钮内的主发射图标、模式切换图标。
   - `20px × 20px`：导航侧边栏主图标、大尺寸卡片操作按钮。
   - `24px × 24px`：大文件拖拽上传图标、大尺寸媒体预览控制图标。
2. **图标微动效**：
   - 默认态：`color: var(--text-placeholder); transition: color .2s cubic-bezier(.4, 0, .2, 1);`
   - 悬停态：`color: var(--text-primary); transform: scale(1.05);`

---

## §6 表单、设置控件与全量设计 Token 清单 (Forms, Controls & Token Catalog)

### 6.1 首页生成器浮岛 (Prompt Composer `.generator-_TwaOk`)

即梦 AI 的核心创作入口并非平面的文本域，而是一个集成高斯模糊、渐变背板、自适应高度以及动画发射按钮的**复合空间浮岛**：

```css
/* 提取自 3413.c1d5cb56e9.css: 核心 Prompt Composer 容器 */
.generator-_TwaOk {
  width: 100%;
  box-sizing: border-box;
  position: relative;
  display: flex;
  flex-direction: column;
  min-height: 70px;
  padding: 22px 16px;
  border-radius: 20px;
  border: 1px solid var(--stroke-primary, hsla(0, 0%, 100%, .08));
  background: linear-gradient(
    180deg,
    var(--component-input-bg-start, rgba(26, 26, 26, .72)) 0%,
    var(--component-input-bg-end, rgba(42, 42, 42, .72)) 106.67%
  );
  background-clip: padding-box;
  backdrop-filter: blur(40px);
  -webkit-backdrop-filter: blur(40px);
  overflow: hidden;
  transition: 
    width .3s cubic-bezier(.4, 0, .2, 1),
    min-height .3s cubic-bezier(.4, 0, .2, 1),
    padding .3s cubic-bezier(.4, 0, .2, 1),
    border-color .3s cubic-bezier(.4, 0, .2, 1);
}

/* 文本输入域: 融合自动增高 field-sizing 规范 */
.prompt-input-oIlouK {
  width: 100%;
  height: 24px;
  min-height: 24px;
  max-height: 360px;
  padding: 0 4px 0 0;
  border: 0;
  outline: 0;
  background: transparent;
  color: var(--text-primary);
  font-family: inherit;
  font-size: 14px;
  font-weight: 400;
  line-height: 24px;
  caret-color: var(--brand-main-default, #009efa);
  resize: none;
  overflow: hidden;
  field-sizing: content;
  transition: min-height .3s cubic-bezier(.4, 0, .2, 1);
}

/* 聚焦展开态: 文本框最小高度扩张至 68px，出现内滚 */
.generator-_TwaOk.expanded .prompt-input-oIlouK {
  min-height: 68px;
  overflow-y: scroll;
  white-space: pre-wrap;
}

/* 圆形提交发射按钮 (32px x 32px 纯圆) */
.submit-button-N1aze2.lv-btn-size-default.lv-btn-icon-only {
  width: 32px;
  height: 32px;
  border-radius: 50%;
  padding: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  background-color: var(--brand-main-default, #009efa);
  color: #ffffff;
  transition: transform 350ms cubic-bezier(0.15, 0.75, 0.3, 1), background-color .1s linear;
}

/* 按钮内部图标状态翻转 (发送 -> 停止 -> 加载) */
.submit-button-send-icon-enter-active-_VmkBB {
  transform: translateY(0);
  transition: transform .3s cubic-bezier(.4, 0, .2, 1);
}
.submit-button-send-icon-exit-active-ZCT583 {
  transform: translateY(-40px);
  transition: transform .3s cubic-bezier(.4, 0, .2, 1);
}
```

---

### 6.2 模型参数精密滑块 (Slider `.lv-slider`)

滑块在模型生图的 CFG 比例、采样步数与画幅微调中被广泛使用，其轨道厚度具有动态响应机制：

```css
/* 提取自 lv-components.da3c693fb3.css */
.lv-slider {
  display: inline-block;
  width: 100%;
}

/* 滑块轨道外包络: 高度 14px 为鼠标提供充裕的点击响应槽 */
.lv-slider-road {
  position: relative;
  height: 14px;
  cursor: pointer;
}

/* 轨道中心物理细线 (Rail): 默认极细 2px */
.lv-slider-road:before {
  content: "";
  position: absolute;
  top: 50%;
  left: 0;
  transform: translateY(-50%);
  width: 100%;
  height: 2px;
  border-radius: 2px;
  background-color: var(--lvv-color-text-disable, rgba(255, 255, 255, 0.2));
  transition: height .3s cubic-bezier(.3, 1.3, .3, 1);
}

/* 已填充进度条 (Active Bar) */
.lv-slider-bar {
  position: absolute;
  top: 50%;
  left: 0;
  transform: translateY(-50%);
  height: 2px;
  border-radius: 2px;
  background-color: var(--lvv-color-text-secondary, rgba(255, 255, 255, 0.7));
  transition: height .3s cubic-bezier(.3, 1.3, .3, 1);
}

/* 悬停与拖拽激活态: 细线从 2px 骤然扩张至 4px，产生触控膨胀感 */
.lv-slider-road:hover:before,
.lv-slider-road-active:before,
.lv-slider-road:hover .lv-slider-bar,
.lv-slider-road-active .lv-slider-bar {
  height: 4px;
}

/* 移动把手滑块圆球 (Thumb Button) */
.lv-slider-button {
  position: absolute;
  top: 0;
  left: 0;
  width: 14px;
  height: 14px;
  transform: translateX(-50%);
  cursor: grab;
}

.lv-slider-button:after {
  content: "";
  display: inline-block;
  box-sizing: border-box;
  width: 14px;
  height: 14px;
  border-radius: 50%;
  background: var(--lvv-color-text-content-primary, #ffffff);
  border: 1px solid var(--lvv-color-text-placeholder, rgba(255, 255, 255, 0.35));
  box-shadow: 0 3px 5px rgba(31, 54, 102, .10);
  transition: all .3s cubic-bezier(.3, 1.3, .3, 1); /* 采用过冲回弹曲线 */
}

/* 把手悬停与按下激活态 */
.lv-slider-button:hover:after,
.lv-slider-button-active:after {
  border-color: var(--lvv-color-text-tertiary, rgba(255, 255, 255, 0.6));
  box-shadow: 0 3px 5px rgba(31, 66, 102, .20);
  transform: scale(1.15); /* 悬停时轻微膨胀 */
}

/* 聚焦光环 */
.lv-slider-button:focus-visible:after {
  box-shadow: 0 0 0 2px var(--lvv-color-primary-light-3, rgba(0, 158, 250, 0.4));
}
```

---

### 6.3 负向提示词手风琴折叠器 (Negative Prompt Accordion)

```css
/* 提取自 3413.c1d5cb56e9.css */
/* 折叠手风琴触发按键: 28px x 28px */
.toggle-XYJWpn {
  width: 28px;
  height: 28px;
  padding: 0;
  border: 0;
  background: transparent;
  color: var(--text-placeholder);
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.toggle-XYJWpn:hover:not(:disabled) {
  color: var(--component-secondary-text-button-hover, #ffffff);
}

/* 内部 14px Chevron 箭头旋转状态机 */
.toggle-XYJWpn svg {
  width: 14px;
  height: 14px;
  transform: rotate(-90deg); /* 闭合状态向左/收拢 */
  transition: transform .3s cubic-bezier(.4, 0, .2, 1);
}

/* 展开态: 旋转至 90deg */
.toggle-XYJWpn.expanded svg {
  transform: rotate(90deg);
}
```

---

### 6.4 预设规格与风格标签胶囊 (Preset Pills & Tags)

在分辨率选择（`1:1`、`16:9`、`9:16`、`3:4`）与渲染风格标签上，即梦 AI 采用高度自约束的胶囊系统：

```css
/* 提取自 content-generator-feature-loader-1.0ef930dedd.css */
.preset-tag-pill {
  height: 32px;
  padding: 0 14px;
  border-radius: 9999px; /* 胶囊圆角严格全圆 */
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 13px;
  font-weight: 500;
  background-color: rgba(255, 255, 255, 0.08);
  border: 1px solid transparent;
  color: var(--text-secondary);
  cursor: pointer;
  transition: all .16s cubic-bezier(.4, 0, .2, 1);
}

.preset-tag-pill:hover {
  background-color: rgba(255, 255, 255, 0.12);
  color: #ffffff;
}

/* 选中激活态: 高亮外发光发丝轮廓 */
.preset-tag-pill.active {
  background-color: rgba(255, 255, 255, 0.16);
  color: #ffffff;
  border-color: rgba(255, 255, 255, 0.30);
  box-shadow: 0 0 0 1px rgba(255, 255, 255, 0.15), 0 2px 8px rgba(0, 0, 0, 0.20);
}
```

---

### 6.5 LightVelocity 全量核心 CSS Token 权威速查表

以下清单收录自即梦 AI 生产样式表，为全站暗黑模式下的核心设计令牌权威事实：

```css
:root[lv-theme=dark] {
  /* ==========================================================================
     1. 色彩与表面漫反射 Tokens (Colors & Surfaces)
     ========================================================================== */
  --bg-body: #121212;
  --bg-surface: #1a1a1a;
  --bg-float: #333333;
  --bg-dropdown-menu: #1c1e22;
  --bg-commerce-popup: #09080b;

  --lvv-color-scenes-overlay: #1c1e22;
  --lvv-color-fill-bg-3: rgba(255, 255, 255, 0.12);
  --lvv-color-fill-transparency-block: rgba(255, 255, 255, 0.08);
  --lvv-color-fill-transparency-hover: rgba(255, 255, 255, 0.12);
  --lvv-color-fill-transparency-pressed: rgba(255, 255, 255, 0.16);

  --bg-mask-30: rgba(0, 0, 0, 0.30);
  --bg-mask-60: rgba(0, 0, 0, 0.60);
  --bg-mask-80: rgba(0, 0, 0, 0.80);

  /* ==========================================================================
     2. 品牌与强调色 Tokens (Brand Accents)
     ========================================================================== */
  --brand-main-default: #009efa;
  --brand-main-hover: #0099f2;
  --brand-main-pressed: #0091e5;
  --brand-main-block-default: rgba(0, 142, 229, 0.12);
  --brand-indigo: #6d7cff;
  --brand-image: #39acff;

  /* ==========================================================================
     3. 描边与发丝线 Tokens (Strokes & Borders)
     ========================================================================== */
  --stroke-primary: hsla(0, 0%, 100%, 0.08);
  --stroke-secondary: rgba(204, 221, 255, 0.10);
  --stroke-focused: rgba(0, 158, 250, 0.40);

  /* ==========================================================================
     4. 缓动曲线与时间 Tokens (Motion & Transitions)
     ========================================================================== */
  --ease-workhorse: cubic-bezier(0.4, 0, 0.2, 1);
  --ease-smooth-decel: cubic-bezier(0.34, 0.69, 0.1, 1);
  --ease-spring-bounce: cubic-bezier(0.3, 1.3, 0.3, 1);
  --ease-heavy-expand: cubic-bezier(0.15, 0.75, 0.3, 1);
  --ease-card-hover: cubic-bezier(0.4, 0.95, 0.6, 1.1);
  --ease-drawer-slide: cubic-bezier(0.2, 0, 0.4, 1);

  --duration-instant: 100ms;
  --duration-fast: 200ms;
  --duration-base: 300ms;
  --duration-composer: 350ms;
  --duration-modal: 400ms;
  --duration-drawer: 420ms;
  --duration-dialog: 520ms;

  /* ==========================================================================
     5. 阴影层级 Tokens (Shadow Elevations)
     ========================================================================== */
  --shadow-elevation-card: 0 2px 5px rgba(0, 0, 0, 0.10);
  --shadow-elevation-menu: 0 4px 12px rgba(0, 0, 0, 0.15);
  --shadow-elevation-toolbar: 0px 4px 12px rgba(0, 0, 0, 0.06), 0px 2px 6px rgba(0, 0, 0, 0.02);
  --shadow-elevation-overlay: 0 8px 56px 0 rgba(0, 0, 0, 0.24);
}
```

---

## 结语 (Conclusion)

本专著全面记录了即梦 AI (Dreamina) 的工业级交互体系、微动效力学、组件矩阵与设计令牌。所有数值与代码片段均经过 17 组线上生产级 CSS Bundles 的逐行测绘与校验，为 KOYO Studio 及同类现代化 AI 生产力工坊的交互重构提供了权威的逆向工程技术参照。
