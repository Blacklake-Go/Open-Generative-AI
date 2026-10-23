# TikTok 开放平台登录（Login Kit）应用审核与材料整备全指南

> **更新时间**：2026-10-22  
> **应用名称**：Supdance  
> **应用 App ID**：`7695620413845604360`  
> **Client Key**：`aw7c2ss1cq03q9ia`  
> **审核状态**：Rejected（已被驳回，需整改后重新提交）  
> **演示视频产物**：`outputs/tiktok_review/tiktok_login_demo_web_1080p.mp4`

---

## 一、本次被驳回（Rejected）的核心原因复盘

经过通过浏览器接管开发者后台及代码审查，应用在 2026-10-19 19:47 被 TikTok Admin 驳回的核心原因如下：

1. **申请的权限（Scopes）与描述（Description）严重脱节**：
   - 后台申请了敏感度极高的内容发布权限：`video.upload, video.list, video.publish` 以及 `user.info.stats, user.info.profile, user.info.basic`。
   - 但填写的 Description 仅有：  
     *"Supdance helps users create and edit AI images and videos. TikTok Login enables basic profile sign-in."*  
     完全没有向审核员说明**为什么需要获取用户视频列表**以及**为什么需要替用户在 TikTok 发布视频**。
2. **演示视频（Demo Video）缺失或不符合规范**：
   - 申请 `video.upload` / `video.publish` 权限，TikTok 官方规定必须提供包含「在应用内生成视频 -> 点击发布到 TikTok -> 选择公开/私密隐私设置 -> 发布成功并在 TikTok 个人页确认视频展示」的完整录像。
   - 如果仅提供了登录录屏，或视频未展示浏览器地址栏 URL / 未展示 client_key，会被直接一票否决。
3. **线上代码实际上仅使用了登录权限**：
   - 经审查 `lib/oauth.js`：平台当前配置的 Scopes 为 `scopes: ["user.info.basic"]`，并没有真正集成 `video.upload` 的业务代码。

---

## 二、演示视频（Demo Video）已录制成果

已为你录制了符合 TikTok 官方审核规范的 1080P 高清演示视频：

- **视频文件路径**：
  - 最终审核标准 MP4（H.264 / AAC）：`outputs/tiktok_review/tiktok_login_demo_web_1080p.mp4`（约 5.1MB）
  - 原始高质量录屏 WebM：`outputs/tiktok_review/page@f305912a08987b7fa3662acb52ad3b0e.webm`
- **视频满足的 TikTok 审核硬性指标**：
  1. **全屏 1080P (1920x1080) 真实浏览器操作**，无加速剪辑。
  2. **清晰的浏览器地址栏（Address Bar）**：
     - 第一步展示起始页：`https://www.supdance.com/login`
     - 第二步展示标准 TikTok 登录按钮及点击交互。
     - 第三步展示完整跳转到 TikTok 官方授权地址，清晰可见 `client_key=aw7c2ss1cq03q9ia` 与 `scope=user.info.basic`。
     - 第四步展示重定向回平台：`https://www.supdance.com/studio` 并呈现已成功登录状态。
- **视频上传建议**：
  - 请将该 MP4 上传至 **YouTube**（设置为 **Unlisted / 不公开列出**），或上传至 **Google Drive**（权限设置为 **“知道链接的任何人可查看”**），将链接粘贴至审核表单中。

---

## 三、Web 端所需材料与字段填写规范

在 TikTok 开发者后台（[TikTok for Developers](https://developers.tiktok.com/) -> App `7695620413845604360`）中更新以下信息：

| 字段名称 | 推荐填写内容 | 审核注意要点 |
| :--- | :--- | :--- |
| **App Name** | `Supdance` | 必须与网站品牌名称完全一致，不可包含 "TikTok" 字样。 |
| **Category** | `Photo & Video` | 之前已从 Entertainment 改为 Photo & Video，保持此分类。 |
| **Website URL** | `https://www.supdance.com` | 必须为公网可访问的 HTTPS 首页，页面需正常展示品牌。 |
| **Redirect URI for Web** | `https://www.supdance.com/auth/tiktok/callback` | 必须与代码中的 `redirect_uri` 完全一致，区分大小写，无多余斜杠。 |
| **Callback URL (Webhook)** | `https://www.supdance.com/api/webhooks/tiktok` | 用于接收数据删除通知及状态推送。 |
| **Privacy Policy URL** | `https://www.supdance.com/privacy` | **关键合规项**：已在第 6 条补充 TikTok 专项隐私与数据删除说明。 |
| **Terms of Service URL** | `https://www.supdance.com/terms` | 必须有效且公网可访问。 |
| **App Icon** | 1:1 正方形图标（512x512 PNG） | 严禁使用 TikTok Logo 或侵权图形。 |

### 高通过率应用描述文案（App Description）

#### 方案 A（极速过审 - 仅申请登录权限）：
```text
Supdance is an innovative AI video and image generation workspace. We integrate TikTok Login Kit (user.info.basic, user.info.profile) to allow global creators to quickly register, sign in securely, and personalize their creative workspace using their TikTok basic profile.
```

#### 方案 B（全功能申请 - 包含视频发布）：
```text
Supdance is an innovative AI video and image creation platform. We integrate TikTok Login Kit (user.info.basic, user.info.profile) for secure creator authentication. In addition, we utilize TikTok Content Posting API (video.upload, video.publish) so users can seamlessly export their generated AI video clips directly to their TikTok account as drafts or public posts without leaving the Supdance workspace.
```

---

## 四、桌面端（Desktop / Electron 客户端）材料与接入规范

TikTok 开放平台目前**没有独立的“Desktop”平台分类**（仅有 Web、iOS、Android）。桌面端统一归属于 **Web OAuth 2.0 PKCE** 规范进行接入与审核：

### 1. 桌面端接入技术机制
- **流程**：用户在 Supdance 桌面客户端内点击「TikTok 快捷登录」，桌面端通过系统默认浏览器（如 Chrome / Safari）打开 TikTok 授权页：
  ```text
  https://www.tiktok.com/v2/auth/authorize/?client_key=aw7c2ss1cq03q9ia&redirect_uri=https://www.supdance.com/auth/tiktok/callback&...
  ```
- **登录态传递**：授权完成后，网页端回调成功，通过自定义协议（Deep Link，如 `supdance://oauth/tiktok?token=...`）或本地回环服务端唤起桌面端，桌面端获取登录态完成登录。

### 2. 桌面端审核必须提交的补充材料（Review Notes 中提供）
TikTok 审核员如果看到应用包含桌面客户端，需要在「Review Notes / 审核附言」中提供：
1. **客户端下载直链**：
   - 提供 macOS 安装包（`.dmg`）与 Windows 安装包（`.exe`）的可访问下载链接（如 GitHub Release、AWS S3 或官网下载页）。
2. **测试账号与测试指引**：
   - 提供一套无需短信验证码的预置测试账号与密码，方便审核员在桌面端直接测试。
3. **桌面端与 Web 端的登录一致性声明**：
   - 明确告知审核员：桌面端使用相同的 Client Key 与 Web OAuth 2.0 流程。

---

## 五、重新提交审核的最佳执行策略（强烈建议方案 A）

### 方案 A：两步走「极速过审」策略（★★★★★ 强烈推荐）
1. **修改申请权限**：在 TikTok 控制台中**取消勾选** `video.upload`、`video.publish`、`video.list`，仅保留 `Login Kit`（`user.info.basic`, `user.info.profile`）。
2. **提交已录制的演示视频**：提交本次生成的 `tiktok_login_demo_web_1080p.mp4` 链接。
3. **优势**：
   - 当前线上代码和配置完全匹配。
   - Login Kit 属于低风险基础权限，审核周期极短（通常 **1~2 个工作日直接批准**）。
   - 批准后，线上用户即可立即正常使用 TikTok 登录。
4. **后续升级**：未来如果需要推出「一键发布视频至 TikTok」功能，可作为第二期单独发起「增量权限申请」，届时单独补充发布功能的录屏。

### 方案 B：一次性申请全量权限（★★★）
1. 必须在前端和后端完整实现视频上传发布至 TikTok 的功能逻辑。
2. 必须重新录制时长 2~3 分钟的长视频，包含：用户登录 -> 进入生成工作区 -> 生成视频 -> 点击发布至 TikTok -> 手机端/网页端 TikTok 检查视频上传成功。
3. 审核要求高，人工复核周期较长（通常需 5~7 个工作日）。

---

## 六、给 TikTok 审核员的附言模板（Notes for Reviewers）

在提交审核界面的「Notes for Reviewers」输入框中，直接复制以下英文说明：

```text
Dear TikTok Developer Review Team,

Thank you for reviewing Supdance. We have updated our application materials and configurations according to your guidelines.

1. Product & Scope Justification:
- We are requesting Login Kit (user.info.basic, user.info.profile) to provide global users with a secure and seamless single-sign-on (SSO) experience for our AI creative workspace.

2. Demo Video (1080p Full Walkthrough):
- Public Demo Link: [在此处填入您上传的 YouTube Unlisted 或 Google Drive 链接]
- The demo clearly displays:
  a. The standard "Log in with TikTok" button on our official login page (https://www.supdance.com/login).
  b. The full browser address bar transitioning to TikTok's official OAuth authorize endpoint (showing client_key=aw7c2ss1cq03q9ia).
  c. The user granting consent.
  d. Successful redirection back to https://www.supdance.com/studio with the authenticated user profile.

3. Platform Support (Web & Desktop):
- Web Application: https://www.supdance.com
- Desktop Client: Our desktop application (Electron) utilizes the standard Web OAuth 2.0 (PKCE) flow by invoking the user's default system browser. 

4. Compliance & Privacy:
- Our Privacy Policy (https://www.supdance.com/privacy) and Terms of Service (https://www.supdance.com/terms) are publicly accessible and include explicit TikTok data collection terms and user data deletion request instructions.

Thank you for your time and support!

Best regards,
Supdance Team
```
