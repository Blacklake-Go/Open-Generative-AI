# SupDance (Open Generative AI)

<p align="center">
  <img src="https://img.shields.io/badge/Next.js-15.5-black?style=flat-square&logo=next.js" alt="Next.js 15">
  <img src="https://img.shields.io/badge/React-19-61dafb?style=flat-square&logo=react" alt="React 19">
  <img src="https://img.shields.io/badge/TailwindCSS-3.4-38bdf8?style=flat-square&logo=tailwind-css" alt="Tailwind CSS">
  <img src="https://img.shields.io/badge/PostgreSQL-16-336791?style=flat-square&logo=postgresql" alt="PostgreSQL">
  <img src="https://img.shields.io/badge/i18n-6%20Locales-emerald?style=flat-square" alt="i18n">
  <img src="https://img.shields.io/badge/License-MIT-blue?style=flat-square" alt="License MIT">
</p>

<p align="center">
  <b>企业级多模态生成式 AI 生产力工坊 · 全景视听大模型矩阵 · 短剧出海与分镜导演工作流</b>
</p>

<p align="center">
  <a href="https://www.supdance.com">官方体验入口 (www.supdance.com)</a>
  <span> · </span>
  <a href="#-核心特性矩阵">核心特性</a>
  <span> · </span>
  <a href="#-短剧工作坊与画布工具集">短剧工作坊</a>
  <span> · </span>
  <a href="#-快速开始">快速开始</a>
  <span> · </span>
  <a href="#-工程治理与架构">系统架构</a>
</p>

---

<p align="center">
  <img src="docs/assets/supdance-home-preview.png" alt="SupDance AI Studio 核心界面预览" width="100%" style="border-radius: 14px; box-shadow: 0 12px 48px rgba(0, 0, 0, 0.7); border: 1px solid rgba(255, 255, 255, 0.08);">
</p>

<p align="center">
  <sub>✨ <b>创造任何你想象的事物</b> — SupDance 核心控制台：全模态前沿模型调度与沉浸式极光视听无限画布</sub>
</p>

---

## 📖 项目简介 (Overview)

**SupDance**（原 Open Generative AI 深度定制工业级增强版）是一套面向企业、影视创作者、短剧出海团队与数字艺术家的**多模态生成式 AI 生产力平台与创意操作系统**。

本项目在开源社区优秀的生成式 AI 架构基础上，进行了深入全方位的工业级改造与业务重塑：
- **影视与短剧工作流深耕**：提供独立的短剧工作坊、分镜脚本智能体、工业级六大三视图/分镜预设与无限节点画布工具。
- **全前沿模型矩阵网关**：官方级集成火山引擎（即梦 Seedream 4.5/5.0、Seedance 2.5 运镜）、快手可灵 Kling 2.6 Pro、MiniMax 海螺、阿里通义万相、FLUX、Suno 与 DeepSeek。
- **极光流体空间交互**：独创 7 层物理仿真空间光影与极光粒子系统（`SpatialBackground`），兼备极高审美质感与指针交互安全。
- **全栈国际化与本土商业闭环**：覆盖 6 种主流语言，原生支持微信支付、QQ 登录、支付宝以及海外主流 OAuth。

---

## ✨ 核心特性矩阵 (Key Highlights)

### 🎬 1. 短剧工作坊与画布工具集 (Drama Workshop & Canvas Studio)
针对短剧出海、漫剧制作与影视前期视效，系统提供专门的独立工具路由与预设集：
* **扩图 (Outpaint)**：支持 1.5x / 2.0x 智能视野延展，自动保持画幅比例与环境连续性。
* **智能超清 (Upscale)**：2K / 4K 级画质无损增强与细节高精度重建。
* **智能抠图 (Cutout)**：发丝级主体分割与透明通道提取。
* **多角度生成 (Multi-Angle)**：保持角色/物体面部与特征一致的前提下，旋转多视点拍摄角度。
* **6 大工业级分镜与三视图预设**：
  * 🎭 **人物三视图** (`/zh/canvas-tools/three-view/character`)：正/侧/背三面角色设定图。
  * 👤 **面部三视图** (`/zh/canvas-tools/three-view/face`)：特写机位与五官特征锁定。
  * 📦 **产品三视图** (`/zh/canvas-tools/three-view/product`)：商业产品与工业建模打样。
  * 🗺️ **场景俯视图** (`/zh/canvas-tools/three-view/scene-top-view`)：宏观场景场记与空间调度。
  * 🎞️ **连续分镜图** (`/zh/canvas-tools/three-view/storyboard`)：故事脉络连贯叙事板。
  * 🔲 **多机位九宫格** (`/zh/canvas-tools/three-view/nine-grid`)：全机位景别构图矩阵。
* **安全鉴权代理**：线上任务生成结果基于用户会话凭证流式安全代理回传，彻底杜绝云端原图未授权外链与泄露风险。

### ⚡ 2. 全球前沿视觉大模型直连矩阵 (Foundation Model Matrix)
* **字节跳动 · 即梦 (Seedream 4.5 / 5.0)**：独家实现分辨率档位与画幅宽高比例的自动智能换算（`VolcengineAdapter`），彻底杜绝非方形画幅压扁变形。
* **字节跳动 · Seedance 2.5 运镜视频**：60 FPS 电影级镜头运动控制与多时长档位支持。
* **快手 · 可灵 (Kling 2.6 Pro)**：影视级高动态运镜视频生成。
* **MiniMax · 海螺视频 (Hailuo 2.3)**：高质感写实动态视频渲染。
* **阿里 · 通义万相 (Wan 2.1 / 2.2)**：图生视频、文生图流体级真实光影渲染。
* **黑森林实验室 · FLUX.1 [dev]**：4K 高保真排印与艺术质感输出。
* **Suno & ElevenLabs**：商业级流行乐曲谱曲生成与零样本极速声音克隆。
* **DeepSeek 官方网关**：原生集成官方模型路由与提示词创意生成。

### 🌌 3. 空间光影与极光物理系统 (Spatial Aurora UI)
* **7 层流体光场仿真**：基于 CSS 变量与现代物理色彩曲线，动态渲染具有呼吸感与空间景深的极光光场。
* **指针事件穿透安全**：全域背景与浮动图层经过严格 Pointer-Events 安全隔离，零干扰任何页面点击与滚动。
* **微质感非胶囊现代美学**：严格遵循 `UI_DESIGN_SYSTEM.md`，使用分层柔和投影与统一边框色阶，告别大圆角失真。

### 🌐 4. 全栈多语言与全球化商业闭环 (Global i18n & Commerce)
* **6 国多语言全链路支持**：
  * 简体中文 (`zh-CN`) / 繁体中文 (`zh-TW`)
  * 英语 (`en`) / 日语 (`ja-JP`) / 韩语 (`ko-KR`) / 西班牙语 (`es`)
  * 包含路由自适应、服务端首选语言嗅探与字典结构校验测试套件。
* **本土化与海外双通道身份验证**：
  * 微信公众号 / 开放平台扫码登录
  * QQ 互联企鹅图标快捷授权登录
  * 手机短信验证码与邮箱验证
  * Google、X (Twitter)、TikTok、Instagram OAuth 统一网关
* **多渠道支付结算体系**：
  * 原生微信支付商户直连（支持 PC 端 Native 扫码与移动端 H5 唤起）
  * 支付宝网页与当面付扫码
  * 算力积分（Credits）统一核算、充值档位与账单流水追溯

---

## 🛠️ 技术栈 (Tech Stack)

| 领域 | 核心选用技术 |
|---|---|
| **前端框架** | Next.js 15.5 (App Router), React 19, TypeScript / Modern ES |
| **样式与动效** | Tailwind CSS 3.4, PostCSS, Lucide React, Framer-motion, Spatial Aurora Engine |
| **服务端运行时** | Node.js 20+ (ES Modules), Next.js Server Components, API Route Handlers |
| **数据持久化** | PostgreSQL 16+, 连接池管理, 声明式 SQL 脚本版本化迁移 (`001`~`074`) |
| **国际化 (i18n)** | 自研高性能无缝语言路由引擎，多端同构翻译与动态变量插值 |
| **媒体与适配** | Sharp 图像高性能处理, Volcengine SDK, MuAPI Gateway, RESTful Stream Proxy |
| **工程化保障** | Playwright (E2E), ESLint, 自动化发布安全性自检脚本 (`release-safety-check`) |

---

## 🚀 快速开始 (Quick Start)

### 1. 环境准备
确保本机安装了以下环境：
* **Node.js**: `v20.10.0` 或更高版本
* **pnpm** 或 **npm**: 建议使用 `pnpm 9+` 或 `npm 10+`
* **PostgreSQL**: 14+ 实例已就绪

### 2. 获取代码与依赖安装
```bash
# 克隆本二开仓库
git clone https://github.com/Blacklake-Go/Open-Generative-AI.git
cd Open-Generative-AI

# 安装依赖并编译本地工作区依赖包 (Studio / Workflow / AI Agents)
npm run setup
# 或者执行:
# pnpm install && npm run build:packages
```

### 3. 配置环境变量
在项目根目录创建或编辑 `.env.local`：
```ini
# 数据库连接
DATABASE_URL="postgresql://user:password@localhost:5432/supdance"

# 站点域名与密钥
NEXT_PUBLIC_SITE_URL="http://localhost:3000"
JWT_SECRET="your-strong-jwt-secret-key"

# AI 服务商密钥（按需配置）
VOLCENGINE_ACCESS_KEY="your-volcengine-ak"
VOLCENGINE_SECRET_KEY="your-volcengine-sk"
DEEPSEEK_API_KEY="your-deepseek-api-key"
```

### 4. 数据库版本迁移
系统内置自动化迁移检查器，可一键将数据库升级至最新结构：
```bash
npm run db:migrate
```

### 5. 启动本地开发服务
```bash
npm run dev
```
打开浏览器访问 [http://localhost:3000](http://localhost:3000)，即可体验完整的 SupDance 生成式创作中心。

### 6. 生产环境构建与检查
```bash
# 验证多语言字典完整性
npm run test:i18n

# 验证发布安全性规范与文件规则
npm run release:check

# 执行 Next.js 全量生产编译
npm run build
```

---

## 📂 核心目录结构 (Repository Structure)

```text
├── app/                        # Next.js App Router 路由体系
│   ├── [locale]/               # 国际化动态路由页面
│   ├── admin/                  # 管理后台控制台（模型管理、用户审计、登录设置等）
│   ├── api/                    # 后端服务接口 (API Handlers)
│   │   ├── auth/               # 认证、OAuth 登录与第三方回调
│   │   ├── canvas-tools/       # 短剧工作坊能力规格、生成计划与安全结果代理
│   │   ├── generation/         # 任务生成、报价与流水调度
│   │   └── ...
│   ├── canvas-tools/           # 画布工具短链接跳转与独立入口
│   ├── lab/                    # 短剧工作坊总入口与多语言跳转
│   ├── zh/                     # 中文专属优化路由 (/zh/lab, /zh/canvas-tools 等)
│   └── globals.css             # 全站设计系统与颜色 Token 源定义
├── components/                 # 全局业务与 UI 组件库
│   ├── about/                  # 关于页面与模型生态大盘组件
│   ├── auth/                   # 认证、登录弹窗、社交登录按钮组
│   ├── canvasTools/            # 画布工具独立工作台 (CanvasToolsStudio)
│   ├── lab/                    # 实验室短剧工作坊能力卡片组
│   ├── navigation/             # 统一顶部 Mega Navigation 与移动端抽屉
│   ├── site/                   # 品牌图标、页头、模型生态滑块
│   └── spatial/                # 空间光影物理仿真系统 (SpatialBackground)
├── config/                     # 站点配置文件 (如 mega-navigation.js 导航体系)
├── docs/                       # 系统工程架构文档与 UI 设计系统规范
├── lib/                        # 核心服务逻辑与工具层
│   ├── adapters/               # 模型服务商适配器 (Volcengine, DeepSeek 等)
│   ├── canvasTools/            # 画布工具规格、预设配置与选型定义
│   ├── db/migrations/          # 001~074 号数据库全量升级 SQL 补丁
│   ├── locales.js              # 多语言配置与路由辅助函数
│   └── services/               # 任务生成核心引擎、存储抽象、认证服务
├── packages/                   # 内部独立模块工作空间
│   └── studio/                 # 核心可视化 Studio 画布套件
├── public/                     # 静态公共资源库 (品牌资产、社交图标、演示样例)
└── scripts/                    # 运维部署、自动化脚本与健康检查工具
    └── deploy-supdance-fusion.sh # 生产环境一键原子切换发布脚本
```

---

## 🛡️ 线上生产部署架构 (Production Deployment)

线上生产环境使用双机热备与原子目录替换策略进行平滑更新，无需停机中断现有连接：
```bash
# 执行自动化打包、上传与生产原子发布
bash scripts/deploy-supdance-fusion.sh
```
该脚本自动完成：
1. 本地 Next.js 生产产物（`.next`）与源码打包；
2. 远端服务器自动制作带时间戳的完整回滚快照；
3. 原子替换当前运行应用并平滑重启 Systemd 服务守护：
   * `supdance.service` (核心 Web 服务)
   * `canvas-supdance.service` (画布核心服务)
   * `supdance-worker.service` (生成调度后台 Worker)
4. 执行在线健康检查（`/api/ready`、Sitemap、各大核心页面 200 验证）。

---

## 🤝 致谢与开源协议 (Credits & License)

- 本项目基于开源项目 [Anil-matcha/Open-Generative-AI](https://github.com/Anil-matcha/Open-Generative-AI) 进行深度二次开发定制，感谢原作者及开源社区奠定的卓越基石。
- 本项目遵循 [MIT License](LICENSE) 开源协议。
