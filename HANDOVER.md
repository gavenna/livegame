# HANDOVER.md

> 每次 `/wrapup` 覆写。新会话先读这个 ↔ 再对比 `git status`。
> 代码 > 此文件。有分歧时，代码为准。

## current_state

### verified
- 可编译: 是（`node --check` 全部 server JS 通过）
- 可运行: 是（`.\start.ps1` 正常，`chcp 65001` 防乱码）
- 日志系统: Pino（开发=pino-pretty→终端，生产=`$env:NODE_ENV="production"`→server/logs/）
- 抖音接入: douyin.js 连接可遇AI :12011，翻译 msgType→游戏指令
- B站接入: bilibili-relay.py（Python logging + RotatingFileHandler）

### assumed
- 弹幕数据已到 gameEngine（WS 日志确认），但画面显示待验证

## failed_approaches
- 正则批量迁移 logger 调用 → 模板字符串断裂，修了 15+ 处。以后逐文件改。
- 可遇AI 协议第一版：用 `type` + `data.wrapper` → 实际用 `msgType` + 扁平 JSON

## next_steps
1. 验证抖音弹幕是否显示在画面上（`[DANMAKU]` 日志确认数据到没到 gameEngine）
2. 测试礼物价格阶梯映射是否正确
3. 更新 `docs/项目进展.md` 标记 douyin 接入完成

## drift_warning
⚠️ 如果本文件超过 24 小时未更新，先 `git status` / `git diff` 再信它。
