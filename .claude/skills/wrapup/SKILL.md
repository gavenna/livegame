# /wrapup — 会话收尾

每次会话结束前调用。六步：代码盘点 → 文档同步 → bug 登记 → 清理 → Git → 自进化。

## 运行方式

```
/wrapup
```

## 执行铁律

**每一步必须逐项执行，不允许凭感觉跳过。** 完成后对照「提交前确认表」逐项打勾，全部通过才 commit。

---

## 六步流程

### Step 1: 代码资产盘点
- `git diff --stat` 查看改动范围
- `git status -s` 检查未追踪文件
- 检查临时调试代码（`grep -rn "console.log.*DEBUG\|// TODO\|// temp" server/ frontend/`）
- 检查硬编码数值（新参数应放 `config.js`，不放业务代码）

### Step 2: 文档同步（对照 diff 逐文件检查）
- 改了游戏机制 → 更新 `docs/项目规划/游戏设计.md`
- 改了配置项/数值 → 确认 `server/config.js` 注释充分
- 新增踩坑 → 写入 `.claude/rules/pitfalls.md`
- 新增命令/脚本 → 更新 `CLAUDE.md` 命令章节
- 改了前端渲染 → 确认 `frontend/sprites.js` 和 `renderer.js` 无硬编码

### Step 3: 未修复 bug 登记
- 本次发现但没修的 bug → 写入 `docs/项目进展.md` 的「已知问题」段
- 格式：序号递增 + 描述 + 发现日期
- 不修的 bug 必须说明理由
- 检查 `/verify` 或 `/review` 的输出是否有未处理警告

### Step 4: 清理
```bash
find . -name "__pycache__" -type d -exec rm -rf {} + 2>/dev/null
rm -f C:/Users/gaven/.claude/plans/*.md  # 清理过期 plan 文件
```
- 检查是否有未使用的实验产物（如 manifest/json/临时脚本）应删除
- 检查是否有未追踪的新文件应加入 `.gitignore` 或 commit

### Step 5: Git 收尾
- 按路径分仓 commit：
  - `D:\Projects\war-danmaku\` → war-danmaku 仓库
  - `D:\Docs\` → 知识库仓库
- 新增的 memory 文件确认 `MEMORY.md` 索引已更新
- 提交信息描述本次会话实际成果（不写"收尾"）

### Step 6: 自进化（必须）

**每轮收尾结束后，汇报本次遗漏了什么，并更新本 SKILL 防止下次再漏。**

如果本轮有遗漏项：
1. 分析为什么漏了（指令不清晰？被标记为可选？没有强制确认？）
2. 修改本 SKILL.md 对应的步骤，让下次不可能再漏
3. 在修订记录中登记

---

## 提交前确认表（逐项打勾，全部 ✓ 才能 commit）

| # | 检查项 | ✓ |
|---|--------|---|
| 1 | `git diff` 已查看，无意外改动 | |
| 2 | 无临时调试代码残留 | |
| 3 | 新数值参数在 `config.js`，不在业务代码 | |
| 4 | 游戏设计文档已同步 | |
| 5 | CLAUDE.md 命令已更新 | |
| 6 | 新踩坑已写入 pitfalls.md | |
| 7 | 未修复 bug 已登记 | |
| 8 | `__pycache__` 已清理 | |
| 9 | 过期 plan 文件已删除 | |
| 10 | 未使用的实验产物已清理或标注 | |
| 11 | Memory 索引已更新 | |
| 12 | 分仓 commit 正确（项目 vs 知识库） | |
| 13 | 本 SKILL 自进化检查：本轮有无遗漏？需要改什么？ | |

**全部打勾后，在本轮对话中输出确认表的文字版，然后 commit。**

---

## 修订记录

| 日期 | 变更 |
|------|------|
| 2026-07-15 | v2.0：加执行铁律 + 提交前确认表 + Step 6 自进化（必须）。根因：v1.0 "系统进化"标为可选，导致被跳过，遗漏 8 项。 |
| 2026-07-13 | v1.0：初始版本 |
