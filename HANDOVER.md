# HANDOVER.md

> 每次 `/wrapup` 覆写。新会话先读这个 ↔ 再对比 `git status`。
> 代码 > 此文件。有分歧时，代码为准。

## current_state

### verified
- 可编译: 是（所有 server JS + frontend JS `node --check` 通过）
- 可运行: 是（`.\start.ps1` 正常，B站+抖音双弹幕源就位）
- 日志系统: 始终双写（终端 pino-pretty + `server/logs/combined.log` JSON），不再区分开发/生产
- 音效库: `D:\tmp\游戏动画音效全集\游戏动画音效全集`
- 精灵图: 14 张 AI 生成（11 兵种 + 2 城堡 + 1 背景），新加矛兵/弓兵/突袭兵 3 张

### 本轮完成

**城堡伤害修复**:
- 战线不再造成城堡伤害（`getCastleDamage()` 删除）
- 士兵必须走到敌方城堡 120px 内才能砍到城堡
- `soldier_attack_castle` 事件现在带真实伤害（每 500ms，伤害值=士兵 damage）
- 城堡受击闪烁效果（白黄双层辉光，300ms 衰减）

**免费兵种克制链**（4 兵种闭环）:
- 民兵（克突袭兵）/ 矛兵（克民兵）/ 弓兵（克矛兵）/ 突袭兵（克弓兵）
- 弹幕指令: `杀`×3民兵 / `枪`×2矛兵 / `射`×2弓兵 / `袭`×2突袭兵 / `冲`×2突袭兵 / `666`×3民兵 / `赞`×3民兵
- 精灵图: AI 生成 + rembg 去背景，`spearman.png`/`bowman.png`/`raider.png`

**日志双写**:
- 去掉 `NODE_ENV` 分档，开发/生产统一双写终端+文件
- `server/logs/combined.log` 始终落盘，方便事后 grep 排查

**代码清理**:
- 删除 `speed_boost` 系统（applySpeedBoost/speedBoostTimers/前端渲染/弹幕指令）

## failed_approaches

- 在 sprites.js 手写 fallback 颜色当精灵图 → 被用户纠正，应该走 /artist AI 生成流程
- 编辑 gameEngine.js 时丢失 `comeback` case（fall-through 替换遗漏），已修复

## next_steps

1. **直播实测** — 真实直播环境全流程测试
2. 兵种精灵图动画帧（idle/walk/attack/death）
3. 段位系统可视化（头像框、勋章、进场公告）
4. 主播话术指南
5. 直播数据分析面板
6. 新免费兵种数值实测调优（当前未经过真实对战验证）

## drift_warning
⚠️ 如果本文件超过 24 小时未更新，先 `git status` / `git diff` 再信它。
