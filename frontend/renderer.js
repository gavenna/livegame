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
const W = 1920, H = 1080;

const battleCanvas = document.getElementById('battle-layer');
const uiCanvas = document.getElementById('ui-layer');
const danmakuCanvas = document.getElementById('danmaku-layer');

const battleCtx = battleCanvas.getContext('2d');
const uiCtx = uiCanvas.getContext('2d');
const danmakuCtx = danmakuCanvas.getContext('2d');

let lastFrameTime = 0;
let frameCount = 0;

/** 弹幕滚动队列（自己维护，逐帧推进） */
const danmakuQueue = [];

/**
 * 主渲染循环
 */
function gameLoop(timestamp) {
  requestAnimationFrame(gameLoop);

  const elapsed = timestamp - lastFrameTime;
  if (elapsed < FRAME_MS) return;
  lastFrameTime = timestamp - (elapsed % FRAME_MS);
  frameCount++;

  const state = window.gameState || {};

  // 渲染三层
  renderBattle(battleCtx, state);
  if (window.renderUI) window.renderUI(uiCtx, state);
  renderDanmaku(danmakuCtx, state);
}

/** 渲染战场层 */
function renderBattle(ctx, state) {
  ctx.clearRect(0, 0, W, H);

  // 背景
  drawBackground(ctx);

  // 中线（根据战线偏移）
  const frontLine = state.frontLine || 0;
  const centerX = W / 2 + frontLine * 0.5; // frontLine 影响中线视觉偏移
  ctx.strokeStyle = '#444';
  ctx.lineWidth = 1;
  ctx.setLineDash([10, 10]);
  ctx.beginPath();
  ctx.moveTo(centerX, 100);
  ctx.lineTo(centerX, H - 50);
  ctx.stroke();
  ctx.setLineDash([]);

  // 战线标签
  ctx.fillStyle = 'rgba(255,255,255,0.3)';
  ctx.font = '12px Microsoft YaHei, sans-serif';
  ctx.textAlign = 'center';
  if (frontLine > 100) ctx.fillText('→ 红方推进中', centerX, 90);
  else if (frontLine < -100) ctx.fillText('← 蓝方推进中', centerX, 90);

  // 城堡
  drawCastles(ctx, state);

  // 兵种
  if (state.troops && window.drawSprite) {
    for (const troop of state.troops) {
      window.drawSprite(ctx, troop);
    }
  }
}

/** 战场背景 */
function drawBackground(ctx) {
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

/** 城堡 */
function drawCastles(ctx, state) {
  const redHP = state.red ? state.red.castleHP : 10000;
  const blueHP = state.blue ? state.blue.castleHP : 10000;
  const maxHP = state.maxHP || 10000;

  ctx.textAlign = 'center';
  ctx.font = 'bold 28px Microsoft YaHei, sans-serif';

  // 红方城堡（左）
  const redPct = redHP / maxHP;
  ctx.fillStyle = '#8B4513';
  ctx.fillRect(20, H * 0.5, 60, 120);
  ctx.fillStyle = `rgb(${Math.round(255 * (1 - redPct))}, ${Math.round(100 * redPct)}, 0)`;
  ctx.fillRect(25, H * 0.5 + 5, 50, 110 * redPct);
  ctx.fillStyle = '#FF6666';
  ctx.fillText('🏰', 50, H * 0.5 - 20);
  ctx.font = '14px Microsoft YaHei, sans-serif';
  ctx.fillText('炎龙', 50, H * 0.5 + 140);

  // 蓝方城堡（右）
  const bluePct = blueHP / maxHP;
  ctx.fillStyle = '#4A4A6A';
  ctx.fillRect(W - 80, H * 0.5, 60, 120);
  ctx.fillStyle = `rgb(${Math.round(100 * bluePct)}, ${Math.round(100 * bluePct)}, ${Math.round(255 * (1 - bluePct))})`;
  ctx.fillRect(W - 75, H * 0.5 + 5, 50, 110 * bluePct);
  ctx.fillStyle = '#6699FF';
  ctx.fillText('🏰', W - 50, H * 0.5 - 20);
  ctx.font = '14px Microsoft YaHei, sans-serif';
  ctx.fillText('霜狼', W - 50, H * 0.5 + 140);
}

/** 弹幕层 */
function renderDanmaku(ctx, state) {
  ctx.clearRect(0, 0, W, H);

  // 从 events 中提取弹幕文本加入队列
  if (state.events) {
    for (const evt of state.events) {
      let text = '';
      switch (evt.type) {
        case 'danmaku_text':
          text = `${evt.playerName || evt.playerId}: ${evt.text}`;
          break;
        case 'spawn':
          if (evt.showAvatar) {
            text = `⚡ ${evt.ownerName} 召唤了 ${evt.key}！`;
          }
          break;
        case 'kill':
          text = `💀 ${evt.killerName} 击杀敌方 ${evt.key}`;
          break;
        case 'global_skill':
          text = `🔥 ${evt.ownerName} 释放了 ${evt.key === 'wrathOfGod' ? '天神之怒' : '火矢齐射'}！`;
          break;
        case 'siege':
          text = `🔨 ${evt.ownerName} 派出攻城锤！`;
          break;
        case 'speed_boost':
          text = `💨 ${evt.playerName} 吹响了冲锋号！`;
          break;
        case 'expire':
          break;
      }
      if (text) {
        danmakuQueue.push({ text, time: Date.now(), y: H - 50 });
      }
    }
  }

  // 清理过期弹幕（3 秒）
  const now = Date.now();
  for (let i = danmakuQueue.length - 1; i >= 0; i--) {
    if (now - danmakuQueue[i].time > 3000) danmakuQueue.splice(i, 1);
  }

  // 限制同时显示数量
  while (danmakuQueue.length > 5) danmakuQueue.shift();

  // 渲染弹幕（底部向上排列）
  ctx.font = '22px Microsoft YaHei, sans-serif';
  ctx.textAlign = 'center';
  for (let i = 0; i < danmakuQueue.length; i++) {
    const dm = danmakuQueue[i];
    const alpha = Math.max(0, 1 - (now - dm.time) / 3000);
    const y = H - 50 - i * 36;
    ctx.fillStyle = `rgba(255,255,255,${alpha})`;
    ctx.strokeStyle = `rgba(0,0,0,${alpha * 0.7})`;
    ctx.lineWidth = 3;
    ctx.strokeText(dm.text, W / 2, y);
    ctx.fillText(dm.text, W / 2, y);
  }
}

// 启动渲染循环
requestAnimationFrame(gameLoop);

// 当 WS 状态更新时触发 UI 重绘
window.onStateUpdate = (state) => {
  if (window.renderUI) window.renderUI(uiCtx, state);
};

console.log('[Renderer] Loop started at', FPS, 'fps');
