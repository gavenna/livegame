# HANDOVER.md

> 每次 `/wrapup` 覆写。新会话先读这个 ↔ 再对比 `git status`。

## current_state

### verified
- 可编译: 是（`node --check` 全量通过）
- 可运行: 是（`node server/index.js` 四端口全启，工具箱+游戏+弹幕已验证）
- 单 exe 架构: `build.js` → `dist/war-danmaku/war-danmaku.exe` (~89 MB)
- 抖音弹幕: ✅ 直播间 642238215421，全链路通（面板实时可见日志）
- B站弹幕: ⚠ Cookie 过期 (`-352`)，代码逻辑正确，换 Cookie 即可

### 本轮完成

**架构简化 — 单 exe 一体**:
- `server/index.js` 合并工具箱全部功能：:3000 OBS画面 + :8760 管理面板 + :8765 游戏WS + :8766 弹幕中继
- 删独立 toolbox exe，一个 `war-danmaku.exe` 搞定一切
- `build.js` 简化：只构建一个 exe + 静态文件

**控制面板重构**:
- 三个独立按钮：▶ 启动游戏 / 📡 启动抖音 / 📺 启动B站
- "全部停止"全停干净（游戏引擎 reset + 适配器 shutdown + 杀 douyinLive 进程）
- 按钮状态自动同步：运行中 → "● 运行中"灰色不可点
- 日志来源过滤：全部/抖音/B站/游戏 四个标签
- 日志区可选中复制

**日志系统强化**:
- `logger.onLog` 回调 → 所有模块日志自动进面板环缓冲
- 弹幕适配器事件（连接/断连/收到弹幕/礼物）面板实时可见
- `combined.log` 持久化全量日志

**B站 relay Node.js 重写**:
- `server/danmaku/bilibili.js` — 直连 B站 WebSocket 协议
- 消除 Python 依赖，和抖音适配器统一管理
- 重连限制：最多 5 次，递增间隔，超限放弃

**适配器启停控制**:
- `douyin.js` / `bilibili.js` 去 `process.exit()`，导出 `start/stop/isRunning`
- `stop()` 设 `shutdown=true` 彻底阻止重连
- 独立启停 API：`/api/start-douyin` `/api/stop-douyin` `/api/start-bilibili` `/api/stop-bilibili`

**WebSocket 断连修复**:
- 根因：`app.js` 多个 `setTimeout(connectWS)` 冲突导致 5 秒断连循环
- 修复：单一定时器 `wsReconnectTimer`，`connectWS()` 开头 clear

**GameEngine 加强**:
- 新增 `reset()` 方法：清定时器 + 重置回合/兵力/城堡 HP/事件
- 不再 auto-start，等用户点"启动游戏"

**Tauri v2 工具箱**（未完成，暂停）:
- Rust 后端 + 前端已写，`npx tauri build --debug` 编译通过
- 当前环境缺 WebView2 运行时，无声失败
- 保留代码备用（`toolbox/src-tauri/`），SEA 版本作主力

### 进行中（未完成）

- Tauri v2 工具箱：WebView2 依赖问题，待解决或放弃
- B站 Cookie 过期（-352），需更新 `secrets.json`
- `toolbox/server.js` 已废弃但未删除（逻辑已移入 index.js）
- 未跑完整 `node build.js` 出 dist exe

## failed_approaches

- **Tauri `cargo build --release`** → 不打包前端文件，应用窗口空白。需用 `npx tauri build`
- **Tauri `frontendDist: ".."`** → 包含 src-tauri/node_modules，Tauri CLI 拒绝。需独立 `toolbox/dist/` 目录
- **Neutralinojs** → GitHub 不可达，已删 `desktop/`
- **pino / better-sqlite3** → 已替换为自研 logger + sql.js

## next_steps

1. 更新 B站 Cookie，验证 B站弹幕全链路
2. 跑 `node build.js` → 出 dist exe → 端到端测试
3. 清理废弃文件：`toolbox/server.js`、`server/danmaku/bilibili-relay.py`
4. Tauri v2 工具箱：装 WebView2 Runtime 或放弃
5. 直播实测：单 exe 启动 → 工具箱 → 启游戏 → 启抖音 → 发弹幕
6. 考虑加"仅启动游戏不启弹幕"和"仅启动弹幕不启游戏"场景测试

## drift_warning
⚠️ 如果本文件超过 24 小时未更新，先 `git status` / `git diff` 再信它。
