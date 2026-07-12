# /wrapup — 会话收尾

每次会话结束前调用。四步扫描：代码 / 文档 / 未修复 bug / pycache。

## 运行方式

```
/wrapup
```

## 四步流程

### Step 1: 代码资产盘点
- `git diff --stat` 查看本次改动范围
- 确认所有改动文件都已 commit（或明确知道哪些未 commit）
- 检查是否有临时调试代码残留（console.log / 注释掉的代码）

### Step 2: 文档同步
- 新增/修改了游戏机制 → 更新 `docs/项目规划/游戏设计.md`
- 新增/修改了配置项 → 更新 `server/config.js` 注释
- 新增了踩坑经验 → 写入 `.claude/rules/pitfalls.md`
- 新增/修改了命令 → 更新 `CLAUDE.md` 的命令章节

### Step 3: 未修复 bug 登记
- 本次会话发现了但没修的 bug → 写入 `docs/项目规划/版本规划.md`
- 格式：`- [ ] bug描述（发现日期）`
- 不修的 bug 必须说明理由

### Step 4: 清理
```bash
find . -name "__pycache__" -type d -exec rm -rf {} + 2>/dev/null
```

### Step 5: Git 收尾
- 按路径分仓 commit：
  - `D:\Projects\war-danmaku\` 下所有改动 → war-danmaku 仓库
  - `D:\Docs\` 下所有改动 → 知识库仓库
- 本次会话的 plan 文件 → 评估是否要更新 `docs/项目规划/游戏设计.md`

## 系统进化（可选）

本次会话有没有值得改进工程体系的地方？
- 某个 Hook 应该新增检查？
- 某个 Skill 的指令需要更新？
- CLAUDE.md 某条规则过时或缺失？
- Memory 有需要更新/新建的条目？
