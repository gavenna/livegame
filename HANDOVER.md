# HANDOVER.md

> 每次 `/wrapup` 覆写。新会话先读这个 ↔ 再对比 `git status`。
> 代码 > 此文件。有分歧时，代码为准。

## current_state

### verified
- 可编译: 是（所有 server JS `node --check` 通过）
- 可运行: 是（`.\start.ps1` 正常，douyinLive + B站双弹幕源就位）
- douyinLive: ✅ 已连上直播间"默川"(642238215421)，收到实时消息
- Cookie: ✅ 已配置，直播间鉴权通过
- 日志系统: 双写终端+文件
- 精灵图: 14 张 AI 生成
- 音效库: `D:\tmp\游戏动画音效全集\游戏动画音效全集`

### 本轮完成

**可遇AI → douyinLive 迁移**:
- 编译 douyinLive.exe (Go v2.0.3, 本地构建, `tools/douyinLive.exe`, 60MB, MIT 开源)
- `douyin.js` 全面重写：移除可遇AI连接，新增 douyinLive WS 连接 + 格式映射层（`douyinLiveToLegacy()`）
- `start.ps1` 启动流程：自动从 secrets.json 生成 douyinLive.yaml → 启动代理 → 启动适配器
- `secrets.json` 新增 `douyin.roomId` + `douyin.cookie` 两个配置项
- `config.js` DOUYIN_ADAPTER.TOOL_WS_URL → PROXY_WS_URL

**新用户配置流程**:
- 只需改 `secrets.json` 两个字段：`roomId`（直播间网址复制）+ `cookie`（F12 → Network → 复制 Cookie 头）
- 一次配置，数月有效

**代码清理**:
- 删除 playwright、@dycast/core 等未使用依赖
- 删除 `scripts/douyin-login.js`（过度设计的自动化方案）
- `.gitignore` 新增 `tools/`、`vendor/`

## failed_approaches

- Playwright 自动扫码登录方案 → 被用户否决，过度设计。最终方案：两个字段手动配置，和可遇AI 一样简单
- `@dycast/core` npm 包 → DyCast 类依赖浏览器 `location.origin`，无法在 Node.js 后端直接使用
- `document.cookie` 提取 → 漏了 HttpOnly 的 `sessionid`，必须从 Network 标签拿完整 Cookie 头

## next_steps

1. **直播实测** — 真实直播环境全流程测试（弹幕 + 礼物 + 点赞 → 出兵验证）
2. 兵种精灵图动画帧（idle/walk/attack/death）
3. 段位系统可视化（头像框、勋章、进场公告）
4. 主播话术指南
5. 直播数据分析面板
6. 分发方案：douyinLive 预编译二进制（Windows/Linux/Mac）+ 自动化构建

## drift_warning
⚠️ 如果本文件超过 24 小时未更新，先 `git status` / `git diff` 再信它。
