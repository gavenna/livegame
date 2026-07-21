# HANDOVER.md

> 每次 `/wrapup` 覆写。新会话先读这个 ↔ 再对比 `git status`。

## current_state

### verified
- 可编译: 是（`node --check` 全量通过）
- 可运行: 是（`node server/index.js` 四端口全启）
- 单 exe 架构: `build.js` → `dist/war-danmaku/war-danmaku.exe` (~89 MB)
- 抖音弹幕: ✅ 全链路通
- B站弹幕: ⚠ Cookie 过期，`bilibili.js` 代码逻辑正确，换 Cookie 即可
- 直播实测: ✅ 通过

### 本轮完成（07-21）

**废弃文件清理**:
- 删 `toolbox/server.js`（逻辑已迁入 `server/index.js`）
- 删 `server/danmaku/bilibili-relay.py`（已被 `bilibili.js` 替代）
- `start.ps1` / `start.sh` 同步更新，B站改为走 `bilibili.js`
- CLAUDE.md / wrapup SKILL.md / config.js 文档引用全部同步

**Tauri v2 废弃**:
- 删 `toolbox/src-tauri/`（Rust 后端 + 构建产物）
- 删 `@tauri-apps/cli` dev 依赖
- `toolbox/app.js` 清理所有 `isTauri` / `tauriCall()` 死代码
- `.gitignore` 清理 Tauri 条目
- 理由: SEA 单 exe + 浏览器面板已验证可用，Tauri 多一层 Rust + WebView2 依赖纯属增负

**构建文档**:
- 新增 `docs/构建指南.md`：前置条件、5 步流程、产物结构、运行方式、用户配置

## failed_approaches

- **Tauri v2 工具箱** → WebView2 未安装，与 SEA 方案功能重叠，已废弃全量清扫
- **Neutralinojs** → GitHub 不可达，已删 `desktop/`
- **pino / better-sqlite3** → 已替换为自研 logger + sql.js

## next_steps

- 更新 B站 Cookie 后测试 B站弹幕全链路
- 跑 `node build.js` → 出 dist exe（文档: `docs/构建指南.md`）

## drift_warning
⚠️ 如果本文件超过 24 小时未更新，先 `git status` / `git diff` 再信它。
