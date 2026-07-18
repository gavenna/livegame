# PROGRESS.md — 项目时间线

> 追加式。每次 `/wrapup` 在末尾加一条。
> 永不覆盖。只增不改。

---

## 2026-07-18
- 抖音弹幕接入：douyin.js（可遇AI协议适配器）+ douyin-test.js（测试工具）
- 日志系统重构：自研 logger → Pino（8 文件迁移 + B站 Python relay 升级）
- 前端：renderer.js 加 like/follow/share 事件渲染
- 配置：DOUYIN_GIFT_MAP + DOUYIN_ADAPTER + DANMAKU_COMMANDS 加"赞"
- 文档：可遇AI 官方协议文档 + 弹幕对接文档
- wrapup 进化：5 项落地（强制输出约束 + /resume + HANDOVER.md + PROGRESS.md + 模板更新）
- 踩坑登记：G10 (Windows GBK 乱码) + G11 (正则迁移断裂)
- Memory：新增 `diagnose-data-flow-first`

## 2026-07-18（续）
- AP2→AP3 战斗表现层全覆盖：城堡箭塔防御、士兵攻城反馈、受击闪白、城堡损毁四阶段+震屏、战线拉扯增强（辉光+火星+战鼓）、战场环境音（风声+战鼓）
- AP3→AP4 游戏深度层全覆盖：连杀播报6档（3-25杀）、翻盘时刻、盲盒系统（warChest 99钻随机稀有兵种）、战场随机事件（援军/火雨/国王亲征）、指挥官系统（伤害最高者金色光环+1.3×）、城堡防御自动升级（三档）
- 画面文字感谢文化（礼物→"感谢XXX的「礼物名」！召唤了兵种"）+ displayText 机制
- 弹幕指令友好翻译（加红→加入了炎龙帝国，杀→号召民兵出击）+ 非指令聊天不上屏
- OBS分辨率双档适配（设计分辨率1920×1080 + Canvas ctx.scale）
- 音效库路径记忆：D:\tmp\游戏动画音效全集\游戏动画音效全集
- 5个新音效槽位 + 环境音层（ambientGain）
- Memory：sound-library-path.md
