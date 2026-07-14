/**
 * UI 层渲染 — HUD、排行榜、兵力条、结算画面
 *
 * 绘制到独立的 ui-layer Canvas。
 */

const UI_CONFIG = {
  fontFamily: 'Microsoft YaHei, sans-serif',
  leaderboard: { x: 1720, y: 100, width: 185, fontSize: 14, lineHeight: 25, maxItems: 10 },
  castleBar: { width: 320, height: 24, y: 60 },
};

/**
 * 渲染 UI 层
 */
function renderUI(ctx, state) {
  const W = 1920, H = 1080;
  ctx.clearRect(0, 0, W, H);

  drawCastleBars(ctx, state);
  drawPlayerCount(ctx, state);

  // C7: 兵力对比条
  if (state.state === 'PLAYING') {
    drawPowerBar(ctx, state);
  }

  drawLeaderboard(ctx, state);
  drawStateBadge(ctx, state);

  // C3: COUNTDOWN 大字倒计时
  if (state.state === 'COUNTDOWN') {
    drawCountdownOverlay(ctx, state);
  }

  // C4: 结算画面
  if (state.state === 'ROUND_END') {
    drawVictoryScreen(ctx, state);
  }
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
  // HP 条渐变
  const redGrad = ctx.createLinearGradient(50, 0, 50 + cfg.width, 0);
  redGrad.addColorStop(0, '#CC3333');
  redGrad.addColorStop(1, redPct > 0.3 ? '#FF4444' : '#FF0000');
  ctx.fillStyle = redGrad;
  ctx.fillRect(50, cfg.y, cfg.width * redPct, cfg.height);
  ctx.strokeStyle = '#FF8888';
  ctx.lineWidth = 2;
  ctx.strokeRect(50, cfg.y, cfg.width, cfg.height);

  ctx.fillStyle = '#FFF';
  ctx.font = 'bold 20px ' + UI_CONFIG.fontFamily;
  ctx.textAlign = 'left';
  ctx.fillText('🏰 炎龙帝国', 50, cfg.y - 10);
  // HP 数字
  ctx.textAlign = 'center';
  ctx.font = 'bold 14px ' + UI_CONFIG.fontFamily;
  ctx.fillText(Math.round(redHP) + ' / ' + maxHP, 50 + cfg.width / 2, cfg.y + cfg.height / 2 + 4);

  // 蓝方城堡（右侧）
  const blueHP = state.blue ? state.blue.castleHP : maxHP;
  const bluePct = Math.max(0, blueHP / maxHP);
  const bx = W - 50 - cfg.width;
  ctx.fillStyle = '#222';
  ctx.fillRect(bx, cfg.y, cfg.width, cfg.height);
  const blueGrad = ctx.createLinearGradient(bx, 0, bx + cfg.width, 0);
  blueGrad.addColorStop(0, bluePct > 0.3 ? '#4488FF' : '#0044FF');
  blueGrad.addColorStop(1, '#3355CC');
  ctx.fillStyle = blueGrad;
  ctx.fillRect(bx + cfg.width * (1 - bluePct), cfg.y, cfg.width * bluePct, cfg.height);
  ctx.strokeStyle = '#8888FF';
  ctx.lineWidth = 2;
  ctx.strokeRect(bx, cfg.y, cfg.width, cfg.height);

  ctx.fillStyle = '#FFF';
  ctx.textAlign = 'right';
  ctx.font = 'bold 20px ' + UI_CONFIG.fontFamily;
  ctx.fillText('🏰 霜狼联盟', W - 50, cfg.y - 10);
  ctx.textAlign = 'center';
  ctx.font = 'bold 14px ' + UI_CONFIG.fontFamily;
  ctx.fillText(Math.round(blueHP) + ' / ' + maxHP, bx + cfg.width / 2, cfg.y + cfg.height / 2 + 4);
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

/** C7: 兵力对比条 */
function drawPowerBar(ctx, state) {
  const W = 1920;
  if (!state.troops || state.troops.length === 0) return;

  let redPower = 0, bluePower = 0;
  for (const t of state.troops) {
    if (t.team === 'red') redPower += (t.maxHp || 0) + (t.damage || 0) * 2;
    else bluePower += (t.maxHp || 0) + (t.damage || 0) * 2;
  }

  const total = redPower + bluePower;
  if (total === 0) return;

  const barW = 500;
  const barH = 8;
  const x = W / 2 - barW / 2;
  const y = 68;

  // 背景
  ctx.fillStyle = 'rgba(0,0,0,0.6)';
  ctx.fillRect(x - 2, y - 2, barW + 4, barH + 4);

  const redW = barW * (redPower / total);
  const blueW = barW * (bluePower / total);

  ctx.fillStyle = '#FF4444';
  ctx.fillRect(x, y, redW, barH);
  ctx.fillStyle = '#4488FF';
  ctx.fillRect(x + redW, y, blueW, barH);

  ctx.strokeStyle = 'rgba(255,255,255,0.3)';
  ctx.lineWidth = 1;
  ctx.strokeRect(x, y, barW, barH);

  // 标签
  ctx.font = '11px ' + UI_CONFIG.fontFamily;
  ctx.fillStyle = '#AAA';
  ctx.textAlign = 'center';
  ctx.fillText(`兵力对比  🔴${state.troops.filter(t => t.team === 'red').length}兵  🔵${state.troops.filter(t => t.team === 'blue').length}兵`, W / 2, y + barH + 12);
}

/** C5: 增强排行榜 */
function drawLeaderboard(ctx, state) {
  const cfg = UI_CONFIG.leaderboard;
  const lb = state.leaderboard;

  // 背景
  const boxH = cfg.lineHeight * 12 + 10;
  ctx.fillStyle = 'rgba(0,0,0,0.55)';
  ctx.fillRect(cfg.x, cfg.y - 25, cfg.width, boxH);
  ctx.strokeStyle = 'rgba(255,255,255,0.15)';
  ctx.lineWidth = 1;
  ctx.strokeRect(cfg.x, cfg.y - 25, cfg.width, boxH);

  // 标题
  ctx.font = 'bold ' + cfg.fontSize + 'px ' + UI_CONFIG.fontFamily;
  ctx.fillStyle = '#FFD700';
  ctx.textAlign = 'center';
  ctx.fillText('🏆 排行榜', cfg.x + cfg.width / 2, cfg.y);

  if (!lb || !lb.length) {
    ctx.font = cfg.fontSize + 'px ' + UI_CONFIG.fontFamily;
    ctx.fillStyle = '#555';
    ctx.fillText('等待玩家...', cfg.x + cfg.width / 2, cfg.y + cfg.lineHeight * 2);
    return;
  }

  // 段位缩略
  const rankBadges = { '新兵': '⭐', '老兵': '⭐⭐', '十夫长': '🛡', '百夫长': '🛡⭐', '千夫长': '⚔', '将军': '👑', '元帅': '👑⭐' };

  ctx.font = cfg.fontSize + 'px ' + UI_CONFIG.fontFamily;
  for (let i = 0; i < Math.min(lb.length, 10); i++) {
    const p = lb[i];
    const y = cfg.y + cfg.lineHeight * (i + 1);

    // C5: 金银铜色
    if (p.rank === 1) {
      ctx.fillStyle = '#FFD700';
      ctx.font = 'bold ' + cfg.fontSize + 'px ' + UI_CONFIG.fontFamily;
    } else if (p.rank === 2) {
      ctx.fillStyle = '#C0C0C0';
      ctx.font = cfg.fontSize + 'px ' + UI_CONFIG.fontFamily;
    } else if (p.rank === 3) {
      ctx.fillStyle = '#CD7F32';
      ctx.font = cfg.fontSize + 'px ' + UI_CONFIG.fontFamily;
    } else {
      ctx.fillStyle = '#AAA';
      ctx.font = cfg.fontSize + 'px ' + UI_CONFIG.fontFamily;
    }

    ctx.textAlign = 'left';
    const rankIcon = p.rank <= 3 ? ['🥇', '🥈', '🥉'][p.rank - 1] : `#${p.rank}`;
    ctx.fillText(rankIcon, cfg.x + 3, y);

    // 玩家名（截断）
    const name = (p.name || p.id || '').slice(0, 8);
    ctx.fillText(name, cfg.x + 38, y);

    // 分数
    ctx.textAlign = 'right';
    ctx.fillStyle = '#FFD700';
    ctx.fillText((p.score || 0) + '', cfg.x + cfg.width - 5, y);
  }
}

/** 游戏状态标签 */
function drawStateBadge(ctx, state) {
  const W = 1920;
  const s = state.state || 'WAITING';
  let text, color;

  switch (s) {
    case 'WAITING':   text = '等待开播'; color = '#888'; break;
    case 'COUNTDOWN': text = '⚔ 准备开战'; color = '#FFD700'; break;
    case 'PLAYING':   text = '⚔ 战斗中'; color = '#FF4444'; break;
    case 'ROUND_END': text = ''; color = '#44FF44'; break; // 用独立的结算画面替代
    default: text = s; color = '#888';
  }

  if (!text) return;

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
    ctx.font = '16px ' + UI_CONFIG.fontFamily;
    ctx.fillStyle = '#777';
    ctx.fillText('Round ' + state.round, x, y + 28);
  }

  // 计时
  if (state.phaseTotal > 0) {
    const elapsed = state.phaseElapsed || 0;
    const remain = Math.max(0, state.phaseTotal - elapsed);
    const sec = Math.ceil(remain / 1000);
    const min = Math.floor(sec / 60);
    const rs = sec % 60;
    const timeStr = min > 0 ? `${min}:${String(rs).padStart(2, '0')}` : `${rs}s`;
    ctx.font = '15px ' + UI_CONFIG.fontFamily;
    ctx.fillStyle = '#999';
    ctx.fillText(timeStr, x, y + 48);
  }

  // DEV_MODE 标识
  if (state.devMode) {
    ctx.font = '11px ' + UI_CONFIG.fontFamily;
    ctx.fillStyle = '#F0F040';
    ctx.fillText('🔧 DEV MODE', W / 2, y + 68);
  }
}

/** C3: COUNTDOWN 倒计时大字 */
function drawCountdownOverlay(ctx, state) {
  const W = 1920, H = 1080;
  if (!state.phaseTotal) return;

  const elapsed = state.phaseElapsed || 0;
  const remain = Math.max(0, state.phaseTotal - elapsed);
  const sec = Math.ceil(remain / 1000);

  if (sec <= 5 && sec > 0) {
    const alpha = 1 - (remain % 1000) / 1000 * 0.3;
    ctx.font = 'bold 120px ' + UI_CONFIG.fontFamily;
    ctx.textAlign = 'center';
    ctx.fillStyle = `rgba(255,215,0,${alpha})`;
    ctx.strokeStyle = `rgba(0,0,0,${alpha})`;
    ctx.lineWidth = 5;
    const text = sec + '';
    ctx.strokeText(text, W / 2, H / 2 + 20);
    ctx.fillText(text, W / 2, H / 2 + 20);
  } else if (sec === 0) {
    ctx.font = 'bold 64px ' + UI_CONFIG.fontFamily;
    ctx.textAlign = 'center';
    ctx.fillStyle = '#FFD700';
    ctx.strokeStyle = '#000';
    ctx.lineWidth = 4;
    ctx.strokeText('开战！', W / 2, H / 2);
    ctx.fillText('开战！', W / 2, H / 2);
  }
}

/** C4: 结算画面 */
function drawVictoryScreen(ctx, state) {
  const W = 1920, H = 1080;
  const redHP = state.red ? state.red.castleHP : 0;
  const blueHP = state.blue ? state.blue.castleHP : 0;

  let winnerText, winnerColor;
  if (redHP > blueHP) {
    winnerText = '🔥 炎龙帝国 胜利！';
    winnerColor = '#FF4444';
  } else if (blueHP > redHP) {
    winnerText = '❄ 霜狼联盟 胜利！';
    winnerColor = '#4488FF';
  } else {
    winnerText = '⚖ 平局';
    winnerColor = '#AAA';
  }

  // 半透明背景
  ctx.fillStyle = 'rgba(0,0,0,0.6)';
  ctx.fillRect(0, H / 2 - 150, W, 300);

  // 胜利文字
  ctx.font = 'bold 64px ' + UI_CONFIG.fontFamily;
  ctx.textAlign = 'center';
  ctx.fillStyle = winnerColor;
  ctx.strokeStyle = '#000';
  ctx.lineWidth = 4;
  ctx.strokeText(winnerText, W / 2, H / 2 - 40);
  ctx.fillText(winnerText, W / 2, H / 2 - 40);

  // 比分
  ctx.font = 'bold 32px ' + UI_CONFIG.fontFamily;
  ctx.fillStyle = '#FFF';
  ctx.fillText(`炎龙 ${Math.round(redHP)} HP  vs  ${Math.round(blueHP)} HP 霜狼`, W / 2, H / 2 + 25);

  // MVP
  const lb = state.leaderboard;
  if (lb && lb.length > 0) {
    ctx.font = '22px ' + UI_CONFIG.fontFamily;
    ctx.fillStyle = '#FFD700';
    ctx.fillText(`🏆 MVP: ${lb[0].name || lb[0].id}  (${lb[0].score}分)`, W / 2, H / 2 + 65);
  }

  // 倒计时到下一局
  if (state.phaseTotal) {
    const elapsed = state.phaseElapsed || 0;
    const remain = Math.max(0, state.phaseTotal - elapsed);
    const sec = Math.ceil(remain / 1000);
    ctx.font = '18px ' + UI_CONFIG.fontFamily;
    ctx.fillStyle = '#888';
    ctx.fillText(`下一局将在 ${sec} 秒后开始...`, W / 2, H / 2 + 100);
  }
}

// 导出
window.renderUI = renderUI;
