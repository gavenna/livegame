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
