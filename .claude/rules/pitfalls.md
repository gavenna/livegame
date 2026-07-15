# 踩坑登记簿

> 只登记**机制级/环境级/流程级**经验。不登记具体代码 bug。
> 判断标准：换一个 agent 来干不同的事，会不会再踩一遍？会 → 写进来。

---

## 环境陷阱

### P1. Python `__pycache__` 缓存过时代码

**症状**：明明修了 Python 脚本的 bug，错误一模一样重现。

**根因**：Python 把 `.py` 编译成 `__pycache__/*.pyc`，改源码后可能仍用旧 `.pyc`。

**哪类 agent 会踩**：任何改 Python 脚本的

**修复/预防**：
```bash
find . -name "__pycache__" -type d -exec rm -rf {} + 2>/dev/null
```
`.gitignore` 必须包含 `__pycache__/` 和 `*.pyc`。

---

### P2. Windows Defender 拦截编译产物

**症状**：`os error 4551` / `应用程序控制策略已阻止此文件`

**哪类 agent 会踩**：任何本地开发的 agent

**修复/预防**：Windows 安全中心 → 排除项 → 添加项目文件夹。agent 无法自动修，必须告知用户。

---

### P3. Node.js 子进程 cwd 不确定性

**症状**：`fs.readFile('./config.json')` 有时找到有时找不到。

**根因**：Node 子进程的 cwd 取决于启动方式（直接 `node` vs VS Code task vs npm script），不同启动方式 cwd 可能不同。

**哪类 agent 会踩**：任何写 Node.js 文件读写的

**修复/预防**：用 `path.resolve(__dirname, 'config.json')` 而非相对路径。或启动时 `console.log(process.cwd())` 确认。

---

## 架构约束

### A1. React StrictMode 双重挂载 → boolean flag 死锁

**症状**：async 初始化在 StrictMode 下只执行一次，第二次 mount 被 flag 拦死。

**哪类 agent 会踩**：`frontend-dev`

**修复/预防**：
```js
// ❌ 错误
if (loadingRef.current) return;
loadingRef.current = true;
await doAsync();

// ✅ 正确：generation counter
const gen = ++genRef.current;
await doAsync();
if (gen !== genRef.current) return; // 过期丢弃
```

---

### A2. 无框窗口鼠标事件必须双向拦截

**症状**：按钮点不动、点击变成拖拽窗口。

**哪类 agent 会踩**：`frontend-dev`

**修复/预防**：所有交互元素必须同时拦截 mousedown + mouseup + click。

---

### A3. 配置 partial write 会清空全部数据

**症状**：改了一个配置值，保存后其他所有配置丢失。

**哪类 agent 会踩**：`frontend-dev`、`backend-dev`

**修复/预防**：先 read 全量数据 → spread 覆盖 → write 全量数据。永远不 partial write。

---

### A4. emit 方只发事件，listener 统一持久化

**症状**：同一条数据被写两次（emit 方写一次，listener 又写一次）。

**哪类 agent 会踩**：全部

**修复/预防**：emit 方不写数据，副作用全部在 listener 中集中处理。

---

### A5. Canvas 尺寸不能写死 px

**症状**：OBS 切换分辨率后画面变形、裁剪。

**哪类 agent 会踩**：`frontend-dev`

**修复/预防**：Canvas 尺寸从 config 读取，支持 1920×1080 / 1280×720 两档。

---

### A6. WebSocket 断连不重连 → 游戏画面冻结

**症状**：server 重启后前端画面卡住不动，刷新才恢复。

**哪类 agent 会踩**：`backend-dev`、`frontend-dev`

**修复/预防**：前端 WS 客户端必须实现 exponential backoff 自动重连。server 重启期间前端显示"重连中..."。

---

### A7. 弹幕高并发 → 游戏状态竞态

**症状**：弹幕高峰期（几百条/秒）兵种生成重复、积分漏记。

**哪类 agent 会踩**：`backend-dev`

**修复/预防**：弹幕处理用队列 + 去重（同 uid 同指令 500ms 内只处理一次）。战斗计算用固定 tick rate（10tps），不随弹幕量变化。

---

### A8. 兵种配置改了但渲染不生效

**症状**：改了 `config.js` 里的兵种伤害，重启 server 后前端显示的伤害数字没变。

**根因**：兵种属性在前端 `sprites.js` 里也有一份硬编码（用于客户端预测显示）。

**哪类 agent 会踩**：`frontend-dev`、`backend-dev`

**修复/预防**：兵种属性只存 server 端 `config.js`，前端通过 WS 获取。或者如果前端需要本地副本，新增兵种/改属性时 `grep -rn` 确认没有硬编码残留。类似 waifu-agent 的 TTS 双端同步问题。

---

## 流程纪律

### F1. 改功能前先 grep 全链路

**症状**：改了 A 处，漏了 B/C/D 处，bug "修好了"但下周重现。

**哪类 agent 会踩**：全部

**修复/预防**：动手前 `grep -rn` 所有调用点，画完调用图再改。

---

### F2. "改了但没生效"先查缓存层

**排查顺序**：`.pyc` 字节码 → 浏览器缓存 → Node.js 模块缓存 → OBS 浏览器源缓存。

**哪类 agent 会踩**：全部

**修复/预防**：不要反复加日志重跑。按顺序清缓存。

---

### F3. 用户提供的外部信息须验证

**症状**：用户说"抖音礼物 ID 是 123"，实际是 456。

**哪类 agent 会踩**：全部

**修复/预防**：API URL、礼物 ID 映射、弹幕指令格式等关键配置项自己打开确认，不盲信。

---

### F4. inline style `background` 简写打断动画

**症状**：CSS animation 在 inline style 动态切换 `background` 后动画卡顿/不同步。

**根因**：`background` 是简写属性，切换时会重置 `background-position` 等子属性，打断同元素的 `@keyframes` 动画。

**修复/预防**：不变属性放 CSS class，inline style 只放动态属性。或用 `background-image` 代替 `background` 简写。

---

## 游戏专属陷阱

### G1. OBS 浏览器源缓存极其顽固

**症状**：改了前端代码，浏览器直接打开正常，OBS 里看到的还是旧画面。

**根因**：OBS 浏览器源有自己的缓存层，不完全遵循 HTTP cache-control。

**修复/预防**：
1. 前端 HTML 加 `<meta http-equiv="Cache-Control" content="no-cache">`
2. WS URL 加 query string `?t=${Date.now()}` 防缓存
3. OBS 里右键浏览器源 → 刷新

---

### G2. B站弹幕协议有 5-10 秒延迟

**症状**：发弹幕后游戏画面的反应慢了 5-10 秒。

**根因**：直播流本身就比弹幕传输快，B站 WebSocket 弹幕还有额外的缓冲延迟。

**哪类 agent 会踩**：`backend-dev`

**修复/预防**：这是正常的，不要试图消除延迟。设计上注意：反馈时机写"送礼/弹幕后**立即在画面预告**（'XXX 正在召唤巨龙...'），实际兵种 1-2 秒后出现"。不要让观众觉得"没反应"。

---

### G3. 弹幕采样频率不能太高

**症状**：弹幕滚动区刷屏太快，完全看不清。

**哪类 agent 会踩**：`frontend-dev`

**修复/预防**：弹幕滚动最多同时显示 5 条，每条停留 3 秒。多余弹幕排队或丢弃。不追求"显示所有弹幕"，追求"显示代表弹幕"。

---

### G4. AI 生成精灵图无 Alpha 通道

**症状**：AI API 生成的 PNG 全是 RGB 模式，角色周围是白底/杂色方块，挡住背景。

**根因**：几乎所有文生图 API（包括 agnes-image-2.1-flash）都不支持原生透明 PNG 输出。

**修复/预防**：
1. AI 生成 → `frontend/assets/sprites/`
2. `python server/fix-sprites-rembg.py`（U²-Net 语义分割去背景）
3. **不要裁切**（裁切改变画布尺寸，渲染锚点会偏移）

**哪类 agent 会踩**：任何处理精灵图的

---

### G5. 前端端口混淆（8765 ≠ 3000）

**症状**：用户报告"改了前端但画面没变化"、"图片看起来不对"。

**根因**：`localhost:8765` 是 WebSocket 游戏服务器（不提供前端页面），`localhost:3000` 才是前端静态文件服务器。用户在 8765 看到的是浏览器缓存的旧页面或服务器的基础 HTTP 响应。

**修复/预防**：始终确认用户在 `localhost:3000` 查看游戏画面。8765 只处理 WebSocket 连接和游戏逻辑。

---

### G6. 图生图 API 不保持角色一致性

**症状**：以现有精灵图为输入，img2img 生成的"同角色不同姿态"图片，颜色、比例、细节全变了。

**根因**：`agnes-image-2.0-flash` 把输入图当作"风格参考"而非"像素锚点"。同厂商文生图模型也不支持。

**哪类 agent 会踩**：`artist`、任何想用 AI 生成动画帧的

**修复/预防**：
1. 当前 API 做不到角色一致性 → 程序化动画是唯一可行路线
2. 两个模型都输出 RGB 无 Alpha，如需透明必须 rembg
3. API 忽略 `size` 参数，始终返回 1024²

---

### G7. ctx.restore() 放错位置 → UI 元素随动画乱飞

**症状**：兵种主人名字飞到屏幕角落上下跳动。

**根因**：`ctx.restore()` 写在 HP 条和名字绘制之后，UI 元素受 drawWithAnim() 内的 translate/scale/rotate 污染。

**修复/预防**：`ctx.restore()` 紧跟在 drawImage 之后、UI 元素之前。动画 transform 和 UI 渲染用 save/restore 隔离。
