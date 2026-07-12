/**
 * UI 层渲染 — HUD、排行榜、弹幕滚动
 *
 * 绘制到独立的 ui-layer Canvas，不和战斗层互相干扰。
 */

const UI_CONFIG = {
  fontFamily: 'Microsoft YaHei, sans-serif',
  // 排行榜
  leaderboard: { x: 1720, y: 100, width: 180, fontSize: 16, lineHeight: 28, maxItems: 10 },
  // 城堡 HP 条
  castleBar: { width: 300, height: 24, y: 60 },
  // 弹幕滚动
  danmaku: { fontSize: 22, lineHeight: 36, maxLines: 5, speed: 80 }, // px/s
};

/**
 * 渲染 UI 层
 * @param {CanvasRenderingContext2D} ctx
 * @param {object} state - game_state
 */
function renderUI(ctx, state) {
  const W = 1920, H = 1080;
  ctx.clearRect(0, 0, W, H);

  drawCastleBars(ctx, state);
  drawPlayerCount(ctx, state);
  drawLeaderboard(ctx, state);
  drawEventFeed(ctx, state);
}

/** 城堡血量条 */
function drawCastleBars(ctx, state) {
  const cfg = UI_CONFIG.castleBar;
  const W = 1920;

  // 红方城堡（左侧）
  const redPct = state.red.castleHP / 10000; // TODO: 从 config 读
  ctx.fillStyle = '#333';
  ctx.fillRect(50, cfg.y, cfg.width, cfg.height);
  ctx.fillStyle = '#FF4444';
  ctx.fillRect(50, cfg.y, cfg.width * redPct, cfg.height);
  ctx.strokeStyle = '#FF8888';
  ctx.lineWidth = 2;
  ctx.strokeRect(50, cfg.y, cfg.width, cfg.height);
  ctx.fillStyle = '#FFF';
  ctx.font = 'bold 20px ' + UI_CONFIG.fontFamily;
  ctx.textAlign = 'left';
  ctx.fillText('🏰 炎龙帝国', 50, cfg.y - 10);

  // 蓝方城堡（右侧）
  const bluePct = state.blue.castleHP / 10000;
  const bx = W - 50 - cfg.width;
  ctx.fillStyle = '#333';
  ctx.fillRect(bx, cfg.y, cfg.width, cfg.height);
  ctx.fillStyle = '#4488FF';
  ctx.fillRect(bx + cfg.width * (1 - bluePct), cfg.y, cfg.width * bluePct, cfg.height);
  ctx.strokeStyle = '#8888FF';
  ctx.lineWidth = 2;
  ctx.strokeRect(bx, cfg.y, cfg.width, cfg.height);
  ctx.textAlign = 'right';
  ctx.fillText('🏰 霜狼联盟', W - 50, cfg.y - 10);

  // HP 数字
  ctx.textAlign = 'center';
  ctx.font = '16px ' + UI_CONFIG.fontFamily;
  ctx.fillText(Math.round(state.red.castleHP), 50 + cfg.width / 2, cfg.y + cfg.height / 2 + 5);
  ctx.fillText(Math.round(state.blue.castleHP), bx + cfg.width / 2, cfg.y + cfg.height / 2 + 5);
}

/** 双方人数 */
function drawPlayerCount(ctx, state) {
  const W = 1920;
  ctx.font = 'bold 28px ' + UI_CONFIG.fontFamily;
  ctx.textAlign = 'center';

  ctx.fillStyle = '#FF6666';
  ctx.fillText(`🔴 炎龙帝国  ${state.red.playerCount}人`, W / 2 - 200, 45);

  ctx.fillStyle = '#FFF';
  ctx.fillText('VS', W / 2, 50);

  ctx.fillStyle = '#6699FF';
  ctx.fillText(`${state.blue.playerCount}人  霜狼联盟 🔵`, W / 2 + 200, 45);
}

/** 排行榜 */
function drawLeaderboard(ctx, state) {
  // TODO: Phase 2 实现 — 从 state 中读取 leaderboard 数据
  const cfg = UI_CONFIG.leaderboard;
  ctx.font = cfg.fontSize + 'px ' + UI_CONFIG.fontFamily;
  ctx.fillStyle = '#AAA';
  ctx.textAlign = 'right';
  ctx.fillText('🏆 排行榜', cfg.x + cfg.width, cfg.y - 10);
}

/** 事件播报（送礼、击杀等） */
function drawEventFeed(ctx, state) {
  // TODO: Phase 2 实现 — 弹幕滚动 + 事件播报
}

// 导出到全局
window.renderUI = renderUI;
