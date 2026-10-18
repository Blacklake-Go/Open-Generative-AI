# 屏蔽中国大陆流量临时安全插件 (China IP Block Plugin)

## 1. 功能概述

本插件为**临时安全插件**，旨在满足阶段性合规或防护需求：
- **位置**：管理后台 -> 管理设置 -> 基础运行与安全 (`/admin/settings?tab=runtime`)。
- **操作**：具备即时开关 Switch 按钮，支持一键开启或关闭。
- **效果**：开启后，所有来自中国大陆的访客 IP 在访问全站前台页面时，将被直接阻断并展示标准 403 Forbidden 响应页面。
- **准确性**：
  - 自动嗅探 Cloudflare / Vercel 等边缘 CDN 的原生国家代码标头 (`cf-ipcountry`, `x-vercel-ip-country` 等)。
  - 全面提取反向代理链路中全部候选公网 IP (`cf-connecting-ip`, `true-client-ip`, `x-real-ip`, `x-forwarded-for`)。
  - 通过权威 APNIC 中国大陆 IPv4 与 IPv6 预编译网段库进行高效二分查找，确保所有中国大陆 IP 无一遗漏全部被 403 阻断。
- **安全保障**：
  - **防自锁**：默认勾选管理后台豁免，管理员可随时登入后台关闭开关。
  - **白名单**：支持配置单 IP 或 CIDR 网段白名单（如办公网络）。
  - **诊断工具**：后台弹窗内置实时 IP 检测工具，可在线模拟任意 IP 是否会被拦截。

---

## 2. 代码架构与挂钩点

为实现后续的**100% 干净完全移除**，所有集成代码均位于 `/* --- [TEMPORARY PLUGIN: china-ip-block START] --- */` 与 `/* --- [TEMPORARY PLUGIN: china-ip-block END] --- */` 明确界标之间。

涉及的挂钩文件：
1. `middleware.js`：流量入口拦截挂钩。
2. `components/admin/settings/RuntimeTab.jsx`：管理后台设置行与开关渲染。
3. `app/api/admin/settings/route.js`：IP 检测测试 API 挂钩。
4. `lib/services/settings.js`：配置变更时写入本地缓存文件 `state.json` 的同步挂钩。
5. `plugins/china-ip-block/`：插件主体文件夹。

---

## 3. 后续完全移除（卸载）方法

当后续不再需要此功能时，提供两种移除方式：

### 方式一：一键自动卸载（推荐）

在项目根目录下直接运行卸载脚本：

```bash
node plugins/china-ip-block/uninstall.mjs
```

该脚本将自动完成：
1. 从 `middleware.js`、`RuntimeTab.jsx`、`route.js`、`settings.js` 中抹除所有界标代码块。
2. 从数据库 `system_settings` 中清除 `china_ip_block` 配置。
3. 彻底删除 `plugins/china-ip-block` 目录。
4. 恢复代码库到插件引入前的纯净状态。

### 方式二：手动移除

1. 打开 `middleware.js`，删除 `[TEMPORARY PLUGIN: china-ip-block START]` 与 `END` 之间的 import 和中间件拦截代码。
2. 打开 `components/admin/settings/RuntimeTab.jsx`，删除 `[TEMPORARY PLUGIN: china-ip-block START]` 与 `END` 之间的 import 与 `<ChinaIpBlockSettingRow />` 标签。
3. 打开 `app/api/admin/settings/route.js`，删除 `[TEMPORARY PLUGIN: china-ip-block START]` 与 `END` 之间的测试代码块。
4. 打开 `lib/services/settings.js`，删除 `[TEMPORARY PLUGIN: china-ip-block START]` 与 `END` 之间的同步代码块。
5. 删除整个 `plugins/china-ip-block` 文件夹：
   ```bash
   rm -rf plugins/china-ip-block
   ```
