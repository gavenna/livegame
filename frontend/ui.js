/**
 * UI 层渲染 — HUD、排行榜、弹幕滚动
 *
 * 绘制到独立的 ui-layer Canvas，不和战斗层互相干扰。
 */

const UI_CONFIG = {
  fontFamily: 'Microsoft YaHei, sans-serif',
  leaderboard: { x: 1720, y: 100, width: 180, fontSize: 15, lineHeight: 26, maxItems: 10 },
  castleBar: { width: 300, height: 24, y: 60 },
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
  drawStateBadge(ctx, state);
}

/** 城堡血量条 */
function drawCastleBars(ctx, state) {
  const cfg = UI_CONFIG.castleBar;
  const W = 1920;
  const maxHP = state.maxHP || 10000;

  // 红方城堡（左侧）
  const redHP = state.red ? state.red.castleHP : maxHP;
  const redPct = Math.max(0, redHP / maxHP);
  ctx.fillStyle = '#222';
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
  const blueHP = state.blue ? state.blue.castleHP : maxHP;
  const bluePct = Math.max(0, blueHP / maxHP);
  const bx = W - 50 - cfg.width;
  ctx.fillStyle = '#222';
  ctx.fillRect(bx, cfg.y, cfg.width, cfg.height);
  ctx.fillStyle = '#4488FF';
  ctx.fillRect(bx + cfg.width * (1 - bluePct), cfg.y, cfg.width * bluePct, cfg.height);
  ctx.strokeStyle = '#8888FF';
  ctx.lineWidth = 2;
  ctx.strokeRect(bx, cfg.y, cfg.width, cfg.height);
  ctx.fillStyle = '#FFF';
  ctx.textAlign = 'right';
  ctx.fillText('🏰 霜狼联盟', W - 50, cfg.y - 10);

  // HP 数字
  ctx.textAlign = 'center';
  ctx.font = 'bold 16px ' + UI_CONFIG.fontFamily;
  ctx.fillStyle = '#FFF';
  ctx.fillText(Math.round(redHP), 50 + cfg.width / 2, cfg.y + cfg.height / 2 + 5);
  ctx.fillText(Math.round(blueHP), bx + cfg.width / 2, cfg.y + cfg.height / 2 + 5);
}

/** 双方人数 */
function drawPlayerCount(ctx, state) {
  const W = 1920;
  const redCount = state.red ? state.red.playerCount : 0;
  const blueCount = state.blue ? state.blue.playerCount : 0;

  ctx.font = 'bold 28px ' + UI_CONFIG.fontFamily;
  ctx.textAlign = 'center';

  ctx.fillStyle = '#FF6666';
  ctx.fillText(`🔴 炎龙帝国  ${redCount}人`, W / 2 - 200, 45);

  ctx.fillStyle = '#FFF';
  ctx.fillText('VS', W / 2, 50);

  ctx.fillStyle = '#6699FF';
  ctx.fillText(`${blueCount}人  霜狼联盟 🔵`, W / 2 + 200, 45);
}

/** 排行榜 */
function drawLeaderboard(ctx, state) {
  const cfg = UI_CONFIG.leaderboard;
  const lb = state.leaderboard;
  if (!lb || !lb.length) {
    ctx.font = cfg.fontSize + 'px ' + UI_CONFIG.fontFamily;
    ctx.fillStyle = '#555';
    ctx.textAlign = 'right';
    ctx.fillText('🏆 排行榜', cfg.x + cfg.width, cfg.y - 10);
    ctx.fillText('等待玩家加入...', cfg.x + cfg.width, cfg.y + cfg.lineHeight);
    return;
  }

  // 背景
  ctx.fillStyle = 'rgba(0,0,0,0.5)';
  const boxH = cfg.lineHeight * (lb.length + 1) + 10;
  ctx.fillRect(cfg.x, cfg.y - 25, cfg.width, boxH);
  ctx.strokeStyle = 'rgba(255,255,255,0.2)';
  ctx.lineWidth = 1;
  ctx.strokeRect(cfg.x, cfg.y - 25, cfg.width, boxH);

  // 标题
  ctx.font = 'bold ' + cfg.fontSize + 'px ' + UI_CONFIG.fontFamily;
  ctx.fillStyle = '#FFD700';
  ctx.textAlign = 'center';
  ctx.fillText('🏆 排行榜', cfg.x + cfg.width / 2, cfg.y);

  ctx.font = cfg.fontSize + 'px ' + UI_CONFIG.fontFamily;
  for (let i = 0; i < lb.length; i++) {
    const p = lb[i];
    const y = cfg.y + cfg.lineHeight * (i + 1);

    // 排名颜色
    if (p.rank === 1) ctx.fillStyle = '#FFD700';
    else if (p.rank === 2) ctx.fillStyle = '#C0C0C0';
    else if (p.rank === 3) ctx.fillStyle = '#CD7F32';
    else ctx.fillStyle = '#AAA';

    ctx.textAlign = 'left';
    ctx.fillText(`#${p.rank}`, cfg.x + 5, y);

    ctx.fillStyle = '#EEE';
    const name = (p.id || '').slice(0, 10);
    ctx.fillText(name, cfg.x + 35, y);

    ctx.textAlign = 'right';
    ctx.fillStyle = '#FFD700';
    ctx.fillText(p.score + '', cfg.x + cfg.width - 5, y);
  }
}

/** 游戏状态标签 */
function drawStateBadge(ctx, state) {
  const W = 1920;
  const s = state.state || 'WAITING';
  let text, color;

  switch (s) {
    case 'WAITING':   text = '等待开播'; color = '#888'; break;
    case 'COUNTDOWN': text = '准备中...'; color = '#FFD700'; break;
    case 'PLAYING':   text = '⚔ 战斗中'; color = '#FF4444'; break;
    case 'ROUND_END': text = '结算中'; color = '#44FF44'; break;
    default: text = s; color = '#888';
  }

  const x = W / 2, y = 100;
  ctx.font = 'bold 36px ' + UI_CONFIG.fontFamily;
  ctx.textAlign = 'center';
  ctx.fillStyle = color;
  ctx.strokeStyle = '#000';
  ctx.lineWidth = 3;
  ctx.strokeText(text, x, y);
  ctx.fillText(text, x, y);

  // Round 信息
  if (state.round) {
    ctx.font = '18px ' + UI_CONFIG.fontFamily;
    ctx.fillStyle = '#888';
    ctx.fillText(`Round ${state.round}`, x, y + 30);
  }

  // 计时
  if (state.time > 0) {
    const sec = Math.floor(state.time / 1000);
    const min = Math.floor(sec / 60);
    const s = sec % 60;
    ctx.font = '16px ' + UI_CONFIG.fontFamily;
    ctx.fillStyle = '#AAA';
    ctx.fillText(`${min}:${String(s).padStart(2, '0')}`, x, y + 55);
  }
}

// 导出到全局
window.renderUI = renderUI;
