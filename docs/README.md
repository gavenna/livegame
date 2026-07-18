# war-danmaku

> 弹幕互动阵营对抗游戏 · 抖音平台 · Node.js + Canvas

## 我的工作流（给人看的）

```
开新会话 → /pickup → 干活 → /wrapup
```

| 命令 | 用途 |
|------|------|
| `/pickup` | 恢复上次状态（读 HANDOVER + git 对比） |
| `/wrapup` | 收尾复盘（覆写 HANDOVER + 追加 PROGRESS + 日志） |
| `/artist` `/game` `/review` `/verify` | 美术 / 数值 / 审查 / 验证 |

**资产在哪:** `./CLAUDE.md`（AI规则） `./HANDOVER.md`（状态） `./PROGRESS.md`（时间线） `.claude/rules/pitfalls.md`（踩坑） `docs/wrapup-logs/`（记录） `docs/技术文档/`（资料）

---

## 项目概览

> 观众发弹幕选阵营、刷礼物出兵，双方对战推城堡。

---

## 怎么跑

```powershell
# 一键启动（PowerShell 或双击）
.\start.bat

# 或者分步
node server/index.js                      # 终端1: 服务端 (ws://localhost:8765)
npx http-server frontend -p 3000 -c-1     # 终端2: 前端 (http://localhost:3000)
node server/simulator.js                  # 终端3: 模拟器发指令
```

浏览器打开 `http://localhost:3000` 看画面。

---

## 当前阶段

**Phase 2（付费体系）** — 核心战斗已跑通。

- 状态机：WAITING → COUNTDOWN → PLAYING → ROUND_END 自动循环
- 战斗：兵种生成/移动/交战/克制/战线/城堡伤害
- 输入：模拟器发指令，弹幕指令映射，"1"=红方 "2"=蓝方 "杀"=3民兵
- 排行：击杀/伤害/胜方/MVP/SVP 积分结算，内存排行榜

---

## 关键文件

| 想看什么 | 读这个 |
|----------|--------|
| 游戏设计（兵种/付费/话术） | `docs/项目规划/游戏设计.md` |
| 服务器入口 | `server/index.js` |
| 游戏状态机 + 指令处理 | `server/gameEngine.js` |
| 战斗计算 | `server/battle.js` |
| WS 通信 | `server/wsServer.js` |
| 兵种属性 + 数值 | `server/config.js` |
| 积分/段位/排行榜 | `server/ranking.js` |
| Canvas 渲染（前端） | `frontend/renderer.js` |
| 精灵绘制 | `frontend/sprites.js` |

---

## 常用命令

```bash
node --check server/*.js           # JS 语法检查
node server/simulator.js           # 模拟器
bash start.sh                      # bash 一键启动
.\start.bat                        # PS/CMD 一键启动
```

---

## 架构概览

```
simulator / 抖音弹幕 → WS → wsServer → GameEngine → Battle
                              ↓              ↓
                         broadcast      Ranking (积分/段位)
                              ↓
                         前端 Canvas (30fps, 3层画布)
```
