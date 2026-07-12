/**
 * Canvas 渲染主循环
 *
 * 三层 Canvas:
 *   battle-layer  — 战场背景 + 兵种
 *   ui-layer      — HUD + 排行榜
 *   danmaku-layer — 弹幕滚动（独立层，避免重绘战斗区）
 */

const FPS = 30;
const FRAME_MS = 1000 / FPS;

const battleCanvas = document.getElementById('battle-layer');
const uiCanvas = document.getElementById('ui-layer');
const danmakuCanvas = document.getElementById('danmaku-layer');

const battleCtx = battleCanvas.getContext('2d');
const uiCtx = uiCanvas.getContext('2d');
const danmakuCtx = danmakuCanvas.getContext('2d');

let lastFrameTime = 0;
let frameCount = 0;

/**
 * 主渲染循环
 */
function gameLoop(timestamp) {
  requestAnimationFrame(gameLoop);

  const elapsed = timestamp - lastFrameTime;
  if (elapsed < FRAME_MS) return;
  lastFrameTime = timestamp - (elapsed % FRAME_MS);
  frameCount++;

  // 渲染三层
  renderBattle(battleCtx);
  if (window.renderUI) window.renderUI(uiCtx, window.gameState || {});
  renderDanmaku(danmakuCtx);
}

/** 渲染战场层 */
function renderBattle(ctx) {
  const W = 1920, H = 1080;
  ctx.clearRect(0, 0, W, H);

  // 背景
  drawBackground(ctx, W, H);

  // 中线
  ctx.strokeStyle = '#444';
  ctx.lineWidth = 1;
  ctx.setLineDash([10, 10]);
  ctx.beginPath();
  ctx.moveTo(W / 2, 100);
  ctx.lineTo(W / 2, H - 50);
  ctx.stroke();
  ctx.setLineDash([]);

  // 兵种（TODO: Phase 2 — 从 state 读取兵种列表并渲染）
}

/** 战场背景 */
function drawBackground(ctx, W, H) {
  // 天空渐变
  const grad = ctx.createLinearGradient(0, 0, 0, H);
  grad.addColorStop(0, '#1a1a2e');
  grad.addColorStop(0.3, '#2d2d44');
  grad.addColorStop(1, '#3d2b1f');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, W, H);

  // 地面
  ctx.fillStyle = '#2d5a1e';
  ctx.fillRect(0, H * 0.75, W, H * 0.25);
}

/** 弹幕层（独立，避免战斗层重绘时闪烁） */
function renderDanmaku(ctx) {
  // TODO: Phase 2 — 弹幕滚动
  ctx.clearRect(0, 0, 1920, 1080);
}

// 启动渲染循环
requestAnimationFrame(gameLoop);

// 当 WS 状态更新时触发 UI 重绘（UI 层按需渲染）
// battle 层持续跑 requestAnimationFrame
onStateUpdate = (state) => {
  // 状态更新时 UI 层立即重绘一次
  if (window.renderUI) window.renderUI(uiCtx, state);
};

// 导出
window.onStateUpdate = onStateUpdate;
console.log('[Renderer] Loop started at', FPS, 'fps');
