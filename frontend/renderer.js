/**
 * Canvas 渲染主循环
 *
 * 三层 Canvas:
 *   battle-layer  — 战场背景 + 兵种 + 特效
 *   ui-layer      — HUD + 排行榜
 *   danmaku-layer — 弹幕滚动 + 事件播报
 */

const FPS = 30;
const FRAME_MS = 1000 / FPS;
const DESIGN_W = 1920, DESIGN_H = 1080;
let canvasScaleX = 1, canvasScaleY = 1;

// 三线战场常量（与 server/config.js LANES 同步）
var LANE_Y = [390, 575, 760];
var LANE_NAMES = ['北境', '王道', '河谷'];
var RED_GATE_X = 285;
var BLUE_GATE_X = 1635;

const battleCanvas = document.getElementById('battle-layer');
const uiCanvas = document.getElementById('ui-layer');
const danmakuCanvas = document.getElementById('danmaku-layer');

const battleCtx = battleCanvas.getContext('2d');
const uiCtx = uiCanvas.getContext('2d');
const danmakuCtx = danmakuCanvas.getContext('2d');

// 默认画布尺寸（首帧前使用，WS 连接后由 initCanvas 更新）
battleCanvas.width = DESIGN_W; battleCanvas.height = DESIGN_H;
uiCanvas.width = DESIGN_W; uiCanvas.height = DESIGN_H;
danmakuCanvas.width = DESIGN_W; danmakuCanvas.height = DESIGN_H;
var container = document.getElementById('game-container');
if (container) { container.style.width = DESIGN_W + 'px'; container.style.height = DESIGN_H + 'px'; }

let lastFrameTime = 0;
let frameCount = 0;

/** 弹幕滚动队列 */
const danmakuQueue = [];

// === 特效状态 ===

/** B1: 伤害数字 { x, y, value, color, time, alpha } */
const damageNumbers = [];

/** B2: 击杀闪光 { x, y, time } */
const killFlashes = [];

/** B3: 生成动画 { troopId, time, x, y } */
const spawnAnims = [];

/** B4: 死亡动画 { x, y, key, time } */
const deathAnims = [];

/** B5: 技能特效 { type, time } */
const skillEffects = [];

/** B6: 攻城冲击 { target ('red'|'blue'), time } */
const siegeImpacts = [];

/** B7: 龙焰吐息 { x, y, lane, team, time } */
const dragonBreaths = [];

/** B8: 龙吼冲击波 { x, y, lane, team, time } */
const dragonRoars = [];

/** B9: 城堡箭矢 { team, fromX, fromY, toX, toY, time, duration } */
const castleArrows = [];

/** B10: 攻城碎石 { target, lane, time } */
const castleDebris = [];

/** C1: 事件播报 { text, time, color } */
const eventBanners = [];

/** C2: 连杀计数 { playerId, count } */
const playerKillCounts = {};

/** E1: 环境粒子 */
const particles = [];
const PARTICLE_COUNT = 40;
function initParticles() {
  for (let i = 0; i < PARTICLE_COUNT; i++) {
    particles.push({
      x: Math.random() * DESIGN_W,
      y: DESIGN_H * 0.5 + Math.random() * DESIGN_H * 0.4,
      size: 1 + Math.random() * 3,
      speed: 0.2 + Math.random() * 0.8,
      alpha: 0.15 + Math.random() * 0.3,
      wobble: Math.random() * Math.PI * 2,
    });
  }
}
initParticles();

/** 背景 + 城堡 + 特效图片预加载 */
const bgImage = new Image();
bgImage.src = '/assets/sprites/battlefield.png';
const castleRedImg = new Image();
castleRedImg.src = '/assets/sprites/castle_red.png';
const castleBlueImg = new Image();
castleBlueImg.src = '/assets/sprites/castle_blue.png';
const fireArrowImg = new Image();
fireArrowImg.src = '/assets/sprites/fireArrow_effect.png';
const wrathImg = new Image();
wrathImg.src = '/assets/sprites/wrathOfGod_effect.png';
const siegeImg = new Image();
siegeImg.src = '/assets/sprites/siege_impact.png';

/**
 * 初始化画布分辨率
 */
function initCanvas(cfg) {
  canvasScaleX = cfg.width / DESIGN_W;
  canvasScaleY = cfg.height / DESIGN_H;
  [battleCanvas, uiCanvas, danmakuCanvas].forEach(function(c) {
    c.width = cfg.width;
    c.height = cfg.height;
  });
  var container = document.getElementById('game-container');
  if (container) {
    container.style.width = cfg.width + 'px';
    container.style.height = cfg.height + 'px';
  }
  console.log('[Renderer] Canvas ' + cfg.width + 'x' + cfg.height +
    ' scale=' + canvasScaleX.toFixed(3) + 'x' + canvasScaleY.toFixed(3));
}
window.initCanvas = initCanvas;

/**
 * 主渲染循环
 */
function gameLoop(timestamp) {
  requestAnimationFrame(gameLoop);
  try {

  const elapsed = timestamp - lastFrameTime;
  if (elapsed < FRAME_MS) return;
  lastFrameTime = timestamp - (elapsed % FRAME_MS);
  frameCount++;

  const state = window.gameState || {};

  // 处理事件 → 分发到各特效系统
  processEvents(state);

  // BGM 状态跟踪 + 胜利/战败音效
  if (window.audioEngine) {
    var currentState = state.state || 'WAITING';
    if (currentState !== lastAudioState) {
      window.audioEngine.setBGMState(currentState);
      // 进入结算时播放胜利/战败
      if (currentState === 'ROUND_END') {
        var redHP = state.red ? state.red.castleHP : 0;
        var blueHP = state.blue ? state.blue.castleHP : 0;
        if (redHP > blueHP) {
          window.audioEngine.playVictory();
        } else if (blueHP > redHP) {
          window.audioEngine.playDefeat();
        }
      }
      lastAudioState = currentState;
    }
  }

  // 更新特效
  updateEffects();

  // 渲染三层（应用分辨率缩放）
  battleCtx.save(); battleCtx.scale(canvasScaleX, canvasScaleY);
  renderBattle(battleCtx, state);
  battleCtx.restore();

  if (window.renderUI) {
    uiCtx.save(); uiCtx.scale(canvasScaleX, canvasScaleY);
    window.renderUI(uiCtx, state);
    uiCtx.restore();
  }

  danmakuCtx.save(); danmakuCtx.scale(canvasScaleX, canvasScaleY);
  renderDanmaku(danmakuCtx, state);
  danmakuCtx.restore();

  } catch (e) { console.error('[gameLoop] 渲染崩溃:', e.message, e.stack); }
}

/** 事件去重：跟踪已处理的 events 数组 */
var lastEventHash = '';

/** BGM 状态跟踪 */
var lastAudioState = '';

// === 事件处理 ===

function processEvents(state) {
  if (!state.events || !state.events.length) return;

  // 去重：同一组 events 不重复处理（server 10tps, 前端 30fps）
  const hash = state.events.map(e => e.type + (e.troopId || '') + (e.time || '')).join('|');
  if (hash === lastEventHash) return;
  lastEventHash = hash;

  const now = Date.now();

  for (const evt of state.events) {
    // 弹幕文本 → 弹幕队列
    let dmText = '';
    switch (evt.type) {
      case 'danmaku_text':
        dmText = `${evt.playerName || evt.playerId}: ${evt.text}`;
        break;
      case 'spawn_preview':
        dmText = `⚡ ${evt.text}`;
        eventBanners.push({ text: evt.text, time: now, color: '#FFD700' });
        if (window.audioEngine) window.audioEngine.playSpawn();
        break;
      case 'spawn':
        if (evt.showAvatar) {
          dmText = `⚡ ${evt.ownerName} 召唤了 ${evt.key}！`;
          eventBanners.push({ text: `${evt.ownerName} 召唤了 ${evt.key}！`, time: now, color: '#FFD700' });
        }
        // B3: 生成动画
        if (window.gameState && window.gameState.troops) {
          const troop = window.gameState.troops.find(t => t.ownerName === evt.ownerName && t.key === evt.key);
          if (troop) {
            spawnAnims.push({ troopId: troop.id, time: now, x: troop.x, y: troop.y });
          }
        }
        if (window.audioEngine) window.audioEngine.playSpawn();
        break;
      case 'kill':
        dmText = `💀 ${evt.killerName} 击杀敌方 ${evt.key}`;
        // B2: 击杀闪光 — 用死亡兵种坐标（兵种仍在数组中播死亡动画）
        if (window.gameState && window.gameState.troops) {
          const deadTroop = window.gameState.troops.find(t => t.id === evt.troopId);
          if (deadTroop) {
            killFlashes.push({ x: deadTroop.x, y: deadTroop.y, time: now });
          } else {
            const killX = evt.team === 'red' ? DESIGN_W * 0.4 : DESIGN_W * 0.6;
            killFlashes.push({ x: killX, y: DESIGN_H * 0.5 + Math.random() * 100, time: now });
          }
        }
        // C2: 连杀追踪
        playerKillCounts[evt.killerId] = (playerKillCounts[evt.killerId] || 0) + 1;
        const kc = playerKillCounts[evt.killerId];
        if (kc === 5) {
          eventBanners.push({ text: `${evt.killerName} 正在大杀特杀！(×5)`, time: now, color: '#FF6347' });
        } else if (kc === 10) {
          eventBanners.push({ text: `${evt.killerName} 已经主宰战场！(×10)`, time: now, color: '#FF4500' });
        }
        // B1: 伤害数字
        damageNumbers.push({ x: killFlashes[killFlashes.length - 1].x, y: killFlashes[killFlashes.length - 1].y - 20, value: '💀', color: '#FF4444', time: now });
        if (window.audioEngine) window.audioEngine.playKill();
        break;
      case 'global_skill':
        dmText = `🔥 ${evt.ownerName} 释放了 ${evt.key === 'wrathOfGod' ? '天神之怒' : '火矢齐射'}！`;
        eventBanners.push({ text: dmText, time: now, color: evt.key === 'wrathOfGod' ? '#FFD700' : '#FF6347' });
        // B5: 技能特效
        skillEffects.push({ type: evt.key, time: now });
        if (window.audioEngine) {
          if (evt.key === 'wrathOfGod') window.audioEngine.playWrathOfGod();
          else if (evt.key === 'fireArrow') window.audioEngine.playFireArrow();
        }
        break;
      case 'siege':
        dmText = `🔨 ${evt.ownerName} 派出攻城锤！`;
        eventBanners.push({ text: `🔨 ${evt.ownerName} 的攻城锤撞击城堡！`, time: now, color: '#FF8C00' });
        // B6: 攻城冲击（目标是对立方的城堡）
        siegeImpacts.push({ target: evt.team === 'red' ? 'blue' : 'red', time: now });
        if (window.audioEngine) window.audioEngine.playSiege();
        break;
      case 'speed_boost':
        dmText = `💨 ${evt.playerName} 吹响了冲锋号！`;
        eventBanners.push({ text: dmText, time: now, color: '#88CCFF' });
        if (window.audioEngine) window.audioEngine.playSpeedBoost();
        break;
      case 'dragon_breath':
        // B7: 龙焰吐息
        dragonBreaths.push({ x: evt.x, lane: evt.lane, team: evt.team, time: now });
        eventBanners.push({ text: '🐉 ' + (evt.ownerName || '龙骑士') + ' 喷吐龙焰！×' + (evt.hitCount || 0), time: now, color: '#FF4500' });
        break;
      case 'dragon_roar':
        // B8: 恐惧咆哮
        dragonRoars.push({ x: evt.x, lane: evt.lane, team: evt.team, time: now });
        eventBanners.push({ text: '🦁 ' + (evt.ownerName || '龙骑士') + ' 发出恐惧咆哮！', time: now, color: '#FFD700' });
        break;
      case 'castle_arrow':
        // B9: 城堡箭矢
        if (window.UI_POS && window.UI_POS.lanes) {
          var fromY = window.UI_POS.lanes.Y[evt.targetLane || 1];
          var toY = evt.targetY || fromY;
          castleArrows.push({ team: evt.team, fromX: evt.castleX, fromY: fromY, toX: evt.targetX, toY: toY, time: now, duration: 400 });
        }
        break;
      case 'castle_hit':
        // B10: 攻城碎石
        castleDebris.push({ target: evt.target, lane: evt.lane, time: now });
        break;
      // 抖音社交事件
      case 'like':
        dmText = `❤️ ${evt.playerName} 点赞！`;
        break;
      case 'follow':
        dmText = `⭐ ${evt.playerName} 关注了直播间！`;
        eventBanners.push({ text: `⭐ ${evt.playerName} 关注了直播间！`, time: now, color: '#FF69B4' });
        break;
      case 'share':
        dmText = `🔗 ${evt.playerName} 分享了直播间！`;
        break;
      case 'expire':
        // B4: 死亡动画
        deathAnims.push({ x: DESIGN_W / 2 + (Math.random() - 0.5) * 400, y: DESIGN_H * 0.5 + Math.random() * 200, key: evt.key, time: now });
        if (window.audioEngine) window.audioEngine.playDeath();
        break;
    }
    if (dmText) {
      danmakuQueue.push({ text: dmText, time: now, y: DESIGN_H - 50 });
    }
  }
}

// === 特效更新 ===

function updateEffects() {
  const now = Date.now();

  // B1: 伤害数字（0.6s 生命周期）
  for (let i = damageNumbers.length - 1; i >= 0; i--) {
    const dn = damageNumbers[i];
    dn.y -= 1.5; // 上飘
    if (now - dn.time > 600) damageNumbers.splice(i, 1);
  }

  // B2: 击杀闪光（0.2s）
  for (let i = killFlashes.length - 1; i >= 0; i--) {
    if (now - killFlashes[i].time > 200) killFlashes.splice(i, 1);
  }

  // B3: 生成动画（0.3s）
  for (let i = spawnAnims.length - 1; i >= 0; i--) {
    if (now - spawnAnims[i].time > 300) spawnAnims.splice(i, 1);
  }

  // B4: 死亡动画（0.2s）
  for (let i = deathAnims.length - 1; i >= 0; i--) {
    if (now - deathAnims[i].time > 200) deathAnims.splice(i, 1);
  }

  // B5: 技能特效（1.5s）
  for (let i = skillEffects.length - 1; i >= 0; i--) {
    if (now - skillEffects[i].time > 1500) skillEffects.splice(i, 1);
  }

  // B6: 攻城冲击（1s）
  for (let i = siegeImpacts.length - 1; i >= 0; i--) {
    if (now - siegeImpacts[i].time > 1000) siegeImpacts.splice(i, 1);
  }

  // B7: 龙焰吐息（0.8s）
  for (let i = dragonBreaths.length - 1; i >= 0; i--) {
    if (now - dragonBreaths[i].time > 800) dragonBreaths.splice(i, 1);
  }

  // B8: 龙吼冲击波（1.2s）
  for (let i = dragonRoars.length - 1; i >= 0; i--) {
    if (now - dragonRoars[i].time > 1200) dragonRoars.splice(i, 1);
  }

  // B9: 城堡箭矢（0.4s）
  for (let i = castleArrows.length - 1; i >= 0; i--) {
    if (now - castleArrows[i].time > castleArrows[i].duration) castleArrows.splice(i, 1);
  }

  // B10: 攻城碎石（0.6s）
  for (let i = castleDebris.length - 1; i >= 0; i--) {
    if (now - castleDebris[i].time > 600) castleDebris.splice(i, 1);
  }

  // C1: 事件播报（2s）
  for (let i = eventBanners.length - 1; i >= 0; i--) {
    if (now - eventBanners[i].time > 2000) eventBanners.splice(i, 1);
  }

  // E1: 粒子更新
  for (const p of particles) {
    p.y -= p.speed;
    p.wobble += 0.02;
    p.x += Math.sin(p.wobble) * 0.3;
    if (p.y < DESIGN_H * 0.4) { p.y = DESIGN_H * 0.75 + Math.random() * DESIGN_H * 0.2; p.x = Math.random() * DESIGN_W; }
  }
}

// === 战场层渲染 ===

function renderBattle(ctx, state) {
  ctx.clearRect(0, 0, DESIGN_W, DESIGN_H);

  drawBackground(ctx);

  var frontLines = state.frontLines || (state.frontLine != null ? [state.frontLine, state.frontLine, state.frontLine] : [0, 0, 0]);
  drawFrontLine(ctx, frontLines, state);
  drawLaneBackgrounds(ctx, state);

  drawCastles(ctx, state);

  // 兵种（带生成/死亡动画）
  if (state.troops && window.drawSprite) {
    const now = Date.now();
    const activeIds = [];

    for (const troop of state.troops) {
      // B3: 检查是否有生成动画（仅非死亡兵种）
      const spawnAnim = troop.animState !== 'death'
        ? spawnAnims.find(a => a.troopId === troop.id)
        : null;
      const scale = spawnAnim ? Math.min(1, (now - spawnAnim.time) / 300) : 1;
      const easedScale = spawnAnim ? elasticOut(scale) : 1;

      window.drawSprite(ctx, troop, easedScale, now);
      activeIds.push(troop.id);

      // 战斗音效：攻击动画时触发（按兵种类型选音效，per-unit 节流）
      if (troop.animState === 'attack' && window.audioEngine && window.audioEngine.playUnitAttack) {
        var ae = window.audioEngine;
        var atkKey = troop.key || '';
        // per-unit 节流：每个兵种独立节流间隔
        ae._atkTimes = ae._atkTimes || {};
        var interval = troop.ranged ? 500 : 350;  // 远程间隔略长
        if (!ae._atkTimes[atkKey] || now - ae._atkTimes[atkKey] > interval) {
          ae.playUnitAttack(atkKey);
          ae._atkTimes[atkKey] = now;
        }
      }
    }

    // 清理已移除兵种的动画追踪器
    if (window.cleanupTrackers) {
      window.cleanupTrackers(activeIds);
    }
  }

  // 死亡动画
  drawDeathAnims(ctx);

  // 伤害数字
  drawDamageNumbers(ctx);

  // 击杀闪光
  drawKillFlashes(ctx);

  // 技能特效
  drawSkillEffects(ctx);

  // 城堡箭矢
  drawCastleArrows(ctx);

  // 攻城碎石
  drawCastleDebris(ctx);

  // 攻城冲击
  drawSiegeImpacts(ctx, state);
  drawDragonBreaths(ctx);
  drawDragonRoars(ctx);

  // 环境粒子（在兵种下层）
  drawParticles(ctx);
}

/** B7: 战线可视化 */
function drawFrontLine(ctx, frontLines, state) {
  if (typeof frontLines === 'number') { frontLines = [frontLines, frontLines, frontLines]; }
  if (!frontLines) { frontLines = [0, 0, 0]; }
  var laneY = (window.UI_POS && window.UI_POS.lanes) ? window.UI_POS.lanes.Y : LANE_Y;

  for (var li = 0; li < 3; li++) {
    var frontLine = frontLines[li] || 0;
    var lineH = laneY[li];
  var centerX = DESIGN_W / 2 + frontLine * 0.5;
  const absFL = Math.abs(frontLine);

  // 线宽随战线偏移增大
  const lineWidth = 2 + Math.min(6, absFL / 150);
  ctx.lineWidth = lineWidth;
  ctx.setLineDash([12, 8]);

  // 颜色从灰→红/蓝
  const ratio = Math.min(1, absFL / 500);
  if (frontLine > 0) {
    ctx.strokeStyle = `rgba(${Math.round(68 + ratio * 187)}, ${Math.round(68 - ratio * 24)}, ${Math.round(68 - ratio * 24)}, ${0.6 + ratio * 0.4})`;
  } else if (frontLine < 0) {
    ctx.strokeStyle = `rgba(${Math.round(68 - ratio * 24)}, ${Math.round(68 - ratio * 24)}, ${Math.round(68 + ratio * 187)}, ${0.6 + ratio * 0.4})`;
  } else {
    ctx.strokeStyle = 'rgba(255,255,255,0.3)';
  }

  ctx.beginPath();
  ctx.moveTo(centerX, lineH - 35);
  ctx.lineTo(centerX, lineH + 35);
  ctx.stroke();
  ctx.setLineDash([]);

  // 战线到城堡时闪烁
  if (state.state === 'PLAYING' && absFL >= 800) {
    if (Math.sin(Date.now() * 0.01) > 0) {
      ctx.strokeStyle = frontLine > 0 ? 'rgba(255,50,50,0.8)' : 'rgba(50,50,255,0.8)';
      ctx.lineWidth = lineWidth + 3;
      ctx.beginPath();
      ctx.moveTo(centerX, lineH - 35);
      ctx.lineTo(centerX, lineH + 35);
      ctx.stroke();
    }
  }
  } // end per-lane loop

  // 全局推进标签（基于三线均值）
  var avgFL = frontLines.reduce(function(a, b) { return a + b; }, 0) / 3;
  ctx.font = '13px Microsoft YaHei, sans-serif';
  ctx.textAlign = 'center';
  if (avgFL > 300) {
    ctx.fillStyle = 'rgba(255,150,150,0.8)';
    ctx.fillText('→ 红方推进中', DESIGN_W / 2, 85);
  } else if (avgFL < -300) {
    ctx.fillStyle = 'rgba(150,150,255,0.8)';
    ctx.fillText('← 蓝方推进中', DESIGN_W / 2, 85);
  }
}

/** 三线背景带 + 线名标签 */
function drawLaneBackgrounds(ctx, state) {
  var P = window.UI_POS ? window.UI_POS.lanes : null;
  var laneY = P ? P.Y : LANE_Y;
  var laneNames = P ? P.names : LANE_NAMES;

  for (var i = 0; i < 3; i++) {
    var y = laneY[i];
    var pressure = 0;
    if (state.lanes && state.lanes[i]) { pressure = state.lanes[i].pressure; }

    // 压力着色
    if (pressure > 0.8) {
      ctx.fillStyle = 'rgba(255,85,77,0.06)';
    } else if (pressure < -0.8) {
      ctx.fillStyle = 'rgba(60,156,255,0.06)';
    } else {
      ctx.fillStyle = 'rgba(255,255,255,0.03)';
    }
    ctx.fillRect(0, y - 45, DESIGN_W, 90);

    // 车道分隔线
    ctx.strokeStyle = 'rgba(255,255,255,0.06)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, y - 45);
    ctx.lineTo(DESIGN_W, y - 45);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(0, y + 45);
    ctx.lineTo(DESIGN_W, y + 45);
    ctx.stroke();

    // 线名标签
    ctx.font = '15px Microsoft YaHei, sans-serif';
    ctx.fillStyle = 'rgba(255,255,255,0.18)';
    ctx.textAlign = 'center';
    ctx.fillText(laneNames[i], DESIGN_W / 2, y + 5);
  }

  // 城门标记
  var gateRX = P ? P.gateRedX : RED_GATE_X;
  var gateBX = P ? P.gateBlueX : BLUE_GATE_X;
  for (var j = 0; j < 3; j++) {
    var gy = laneY[j];
    // 红方城门
    ctx.strokeStyle = 'rgba(255,85,77,0.25)';
    ctx.lineWidth = 2;
    ctx.strokeRect(gateRX - 10, gy - 30, 20, 60);
    ctx.fillStyle = 'rgba(255,85,77,0.15)';
    ctx.fillRect(gateRX - 10, gy - 30, 20, 60);
    // 蓝方城门
    ctx.strokeStyle = 'rgba(60,156,255,0.25)';
    ctx.strokeRect(gateBX - 10, gy - 30, 20, 60);
    ctx.fillStyle = 'rgba(60,156,255,0.15)';
    ctx.fillRect(gateBX - 10, gy - 30, 20, 60);
  }
}

/** 战场背景 */
function drawBackground(ctx) {
  if (bgImage.complete && bgImage.naturalWidth > 0) {
    ctx.drawImage(bgImage, 0, 0, DESIGN_W, DESIGN_H);
    return;
  }
  const grad = ctx.createLinearGradient(0, 0, 0, DESIGN_H);
  grad.addColorStop(0, '#1a1a2e');
  grad.addColorStop(0.3, '#2d2d44');
  grad.addColorStop(1, '#3d2b1f');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, DESIGN_W, DESIGN_H);
  ctx.fillStyle = '#2d5a1e';
  ctx.fillRect(0, DESIGN_H * 0.75, DESIGN_W, DESIGN_H * 0.25);
}

/** 城堡（含 E2 受损表现） */
function drawCastles(ctx, state) {
  const P = window.UI_POS ? window.UI_POS.castle : null;
  const redHP = state.red ? state.red.castleHP : 10000;
  const blueHP = state.blue ? state.blue.castleHP : 10000;
  const maxHP = state.maxHP || 10000;
  const redPct = redHP / maxHP;
  const bluePct = blueHP / maxHP;

  // 红方城堡（左）— 图片
  const ri = P ? P.redImg : { x: 10, y: DESIGN_H * 0.38, w: 160, h: 140 };
  const rcx = ri.x + ri.w / 2;  // 红方城堡中心 X
  const rcy = ri.y + ri.h / 2;

  if (castleRedImg.complete && castleRedImg.naturalWidth > 0) {
    ctx.globalAlpha = 0.4 + redPct * 0.6;
    ctx.drawImage(castleRedImg, ri.x, ri.y, ri.w, ri.h);
    ctx.globalAlpha = 1;
    drawCastleDamageOverlay(ctx, rcx, rcy, redPct, 'red');
  } else {
    ctx.fillStyle = '#8B4513';
    ctx.fillRect(ri.x + 10, DESIGN_H * 0.5, 60, 120);
  }

  // 红方 HP 条（battle 层小血条）
  const rhp = P ? P.hpBar : { redX: 20, y: DESIGN_H * 0.48, w: 100, h: 8 };
  const rhpCX = rhp.redX + rhp.w / 2;
  ctx.fillStyle = '#333';
  ctx.fillRect(rhp.redX, rhp.y, rhp.w, rhp.h);
  ctx.fillStyle = redPct > 0.3 ? '#F44' : '#F00';
  ctx.fillRect(rhp.redX, rhp.y, rhp.w * redPct, rhp.h);

  // 红方名字
  const rnY = P && P.nameY ? P.nameY.red : DESIGN_H * 0.46;
  ctx.font = 'bold 16px Microsoft YaHei, sans-serif';
  ctx.fillStyle = '#FF8888';
  ctx.textAlign = 'center';
  ctx.fillText('炎龙帝国', rhpCX, rnY);

  // 红方 HP 数字
  ctx.font = '11px Microsoft YaHei, sans-serif';
  ctx.fillText(Math.round(redHP) + ' HP', rhpCX, rhp.y + rhp.h + 28);

  // 蓝方城堡（右）— 图片
  const bi = P ? P.blueImg : { x: DESIGN_W - 170, y: DESIGN_H * 0.38, w: 160, h: 140 };
  const bcx = bi.x + bi.w / 2;
  const bcy = bi.y + bi.h / 2;

  if (castleBlueImg.complete && castleBlueImg.naturalWidth > 0) {
    ctx.globalAlpha = 0.4 + bluePct * 0.6;
    ctx.drawImage(castleBlueImg, bi.x, bi.y, bi.w, bi.h);
    ctx.globalAlpha = 1;
    drawCastleDamageOverlay(ctx, bcx, bcy, bluePct, 'blue');
  } else {
    ctx.fillStyle = '#4A4A6A';
    ctx.fillRect(bi.x + 10, DESIGN_H * 0.5, 60, 120);
  }

  // 蓝方 HP 条（battle 层小血条）
  const bhp = P ? {
    x: P.hpBar.blueRightX - P.hpBar.w,
    y: P.hpBar.y, w: P.hpBar.w, h: P.hpBar.h
  } : { x: DESIGN_W - 120, y: DESIGN_H * 0.48, w: 100, h: 8 };
  const bhpCX = bhp.x + bhp.w / 2;
  ctx.fillStyle = '#333';
  ctx.fillRect(bhp.x, bhp.y, bhp.w, bhp.h);
  ctx.fillStyle = bluePct > 0.3 ? '#48F' : '#00F';
  ctx.fillRect(bhp.x, bhp.y, bhp.w * bluePct, bhp.h);

  // 蓝方名字
  const bnY = P && P.nameY ? P.nameY.blue : DESIGN_H * 0.46;
  ctx.font = 'bold 16px Microsoft YaHei, sans-serif';
  ctx.fillStyle = '#8888FF';
  ctx.fillText('霜狼联盟', bhpCX, bnY);

  // 蓝方 HP 数字
  ctx.font = '11px Microsoft YaHei, sans-serif';
  ctx.fillText(Math.round(blueHP) + ' HP', bhpCX, bhp.y + bhp.h + 28);
}

/** E2: 城堡受损覆盖层 */
function drawCastleDamageOverlay(ctx, cx, cy, hpPct, team) {
  const now = Date.now();
  if (hpPct < 0.5) {
    // 冒烟
    for (let i = 0; i < 3; i++) {
      const smokeX = cx + (Math.sin(now * 0.002 + i * 2) * 20);
      const smokeY = cy - 20 - i * 15 - (now * 0.03 % 40);
      const alpha = 0.15 + (hpPct < 0.2 ? 0.1 : 0);
      ctx.fillStyle = `rgba(80,80,80,${alpha})`;
      ctx.beginPath();
      ctx.arc(smokeX, smokeY, 8 + i * 3, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  if (hpPct < 0.2) {
    // 冒火
    for (let i = 0; i < 2; i++) {
      const fireX = cx + (Math.sin(now * 0.005 + i) * 15);
      const fireY = cy - 10 - (now * 0.02 % 20);
      const alpha = 0.3 + Math.random() * 0.2;
      const grad = ctx.createRadialGradient(fireX, fireY, 2, fireX, fireY, 10);
      grad.addColorStop(0, `rgba(255,100,0,${alpha})`);
      grad.addColorStop(1, `rgba(255,50,0,0)`);
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(fireX, fireY, 10, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

// === B1: 伤害数字 ===

function drawDamageNumbers(ctx) {
  const now = Date.now();
  for (const dn of damageNumbers) {
    const age = now - dn.time;
    const alpha = Math.max(0, 1 - age / 600);
    ctx.font = 'bold 16px Microsoft YaHei, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillStyle = `rgba(${dn.color === '#FF4444' ? '255,68,68' : '255,200,50'},${alpha})`;
    ctx.strokeStyle = `rgba(0,0,0,${alpha * 0.7})`;
    ctx.lineWidth = 2;
    ctx.strokeText(dn.value, dn.x, dn.y);
    ctx.fillText(dn.value, dn.x, dn.y);
  }
}

// === B2: 击杀闪光 ===

function drawKillFlashes(ctx) {
  const now = Date.now();
  for (const kf of killFlashes) {
    const age = now - kf.time;
    const alpha = Math.max(0, 1 - age / 200);
    const radius = 20 + age * 0.3;
    const grad = ctx.createRadialGradient(kf.x, kf.y, 0, kf.x, kf.y, radius);
    grad.addColorStop(0, `rgba(255,255,255,${alpha})`);
    grad.addColorStop(1, `rgba(255,255,255,0)`);
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(kf.x, kf.y, radius, 0, Math.PI * 2);
    ctx.fill();
  }
}

// === B3: 缓动函数 ===

function elasticOut(t) {
  return Math.sin(-13 * (t + 1) * Math.PI / 2) * Math.pow(2, -10 * t) + 1;
}

// === B4: 死亡动画 ===

function drawDeathAnims(ctx) {
  const now = Date.now();
  for (const da of deathAnims) {
    const age = now - da.time;
    const progress = age / 200;
    const alpha = Math.max(0, 1 - progress);
    const scale = 1 - progress * 0.5;
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.translate(da.x, da.y);
    ctx.scale(scale, scale);
    ctx.fillStyle = '#FFF';
    ctx.fillRect(-10, -10, 20, 20);
    ctx.restore();
  }
}

// === B5: 技能特效 ===

function drawSkillEffects(ctx) {
  const now = Date.now();
  for (const se of skillEffects) {
    const age = now - se.time;
    const progress = age / 1500;

    if (se.type === 'wrathOfGod') {
      // 全屏金色闪光
      if (progress < 0.3) {
        const alpha = (1 - progress / 0.3) * 0.4;
        ctx.fillStyle = `rgba(255,215,0,${alpha})`;
        ctx.fillRect(0, 0, DESIGN_W, DESIGN_H);
      }
      // 金色光柱
      if (progress < 0.6) {
        const colAlpha = (1 - progress / 0.6) * 0.5;
        const grad = ctx.createLinearGradient(0, 0, 0, DESIGN_H);
        grad.addColorStop(0, `rgba(255,215,0,0)`);
        grad.addColorStop(0.3, `rgba(255,215,0,${colAlpha})`);
        grad.addColorStop(0.7, `rgba(255,200,0,${colAlpha})`);
        grad.addColorStop(1, `rgba(255,180,0,0)`);
        ctx.fillStyle = grad;
        ctx.fillRect(DESIGN_W / 2 - 80, 0, 160, DESIGN_H);
      }
    }

    if (se.type === 'fireArrow') {
      // 红色箭雨从上方掠过
      if (progress < 0.5) {
        const alpha = (1 - progress / 0.5) * 0.6;
        ctx.strokeStyle = `rgba(255,80,20,${alpha})`;
        ctx.lineWidth = 2;
        for (let i = 0; i < 12; i++) {
          const arrowX = (i / 12) * DESIGN_W + (progress * 800) % 200 - 100;
          const arrowY = 80 + i * 30 + progress * 300;
          ctx.beginPath();
          ctx.moveTo(arrowX, arrowY);
          ctx.lineTo(arrowX - 15, arrowY + 25);
          ctx.stroke();
          // 火焰拖尾
          ctx.fillStyle = `rgba(255,140,0,${alpha * 0.5})`;
          ctx.beginPath();
          ctx.arc(arrowX - 8, arrowY + 12, 5, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    }
  }
}

// === B6: 攻城冲击 ===

function drawSiegeImpacts(ctx, state) {
  const now = Date.now();
  for (const si of siegeImpacts) {
    const age = now - si.time;
    const progress = age / 1000;
    const alpha = Math.max(0, 1 - progress);

    // 城堡震动偏移（仅 UI 方面，不影响实际坐标）
    const shakeX = progress < 0.3 ? Math.sin(progress * 50) * 8 * (1 - progress / 0.3) : 0;

    // 冲击环
    const cx = si.target === 'red' ? 90 : DESIGN_W - 90;
    const cy = DESIGN_H * 0.45;
    const radius = 30 + progress * 150;
    ctx.strokeStyle = `rgba(255,140,0,${alpha})`;
    ctx.lineWidth = 4 * (1 - progress);
    ctx.beginPath();
    ctx.arc(cx + shakeX, cy, radius, 0, Math.PI * 2);
    ctx.stroke();

    // 碎片粒子
    for (let i = 0; i < 6; i++) {
      const pAngle = (i / 6) * Math.PI * 2;
      const pDist = progress * 80 + i * 10;
      const px = cx + Math.cos(pAngle) * pDist + shakeX;
      const py = cy + Math.sin(pAngle) * pDist;
      ctx.fillStyle = `rgba(180,140,100,${alpha})`;
      ctx.fillRect(px - 2, py - 2, 4, 4);
    }
  }
}

// === E1: 环境粒子 ===

/** 龙焰吐息 — 锥形火焰粒子 */
function drawDragonBreaths(ctx) {
  var P = window.UI_POS ? window.UI_POS.lanes : null;
  var laneY = P ? P.Y : LANE_Y;
  var now = Date.now();

  for (var i = 0; i < dragonBreaths.length; i++) {
    var db = dragonBreaths[i];
    var age = now - db.time;
    var progress = age / 800;
    var y = laneY[db.lane];
    var isRed = db.team === 'red';
    var dir = isRed ? 1 : -1;

    // 锥形火焰粒子群
    for (var p = 0; p < 12; p++) {
      var angle = (p - 6) * 0.08;                        // 扇形角度
      var dist = progress * 200 + Math.random() * 30;    // 火焰推进距离
      var px = db.x + Math.cos(angle) * dist * dir;
      var py = y + Math.sin(angle) * dist + (Math.random() - 0.5) * 40;
      var alpha = 1 - progress;
      var size = 4 + (1 - progress) * 12;

      // 火焰渐变色（红→橙→黄）
      var r = 255, g = Math.round(100 + progress * 100), b = 0;
      ctx.fillStyle = 'rgba(' + r + ', ' + g + ', ' + b + ', ' + alpha.toFixed(2) + ')';
      ctx.beginPath();
      ctx.arc(px, py, size, 0, Math.PI * 2);
      ctx.fill();
    }

    // 核心火焰锥
    var grad = ctx.createLinearGradient(db.x, y, db.x + 200 * dir, y);
    grad.addColorStop(0, 'rgba(255,200,0,0.4)');
    grad.addColorStop(0.3, 'rgba(255,100,0,0.3)');
    grad.addColorStop(0.7, 'rgba(255,50,0,0.1)');
    grad.addColorStop(1, 'rgba(255,0,0,0)');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.moveTo(db.x, y - 25);
    ctx.lineTo(db.x + 200 * dir, y);
    ctx.lineTo(db.x, y + 25);
    ctx.closePath();
    ctx.fill();
  }
}

/** B9: 城堡箭矢 — 红色/蓝色箭矢从城堡飞向目标 */
function drawCastleArrows(ctx) {
  var now = Date.now();
  var arrowSpeed = 500; // px/s
  for (var i = 0; i < castleArrows.length; i++) {
    var ca = castleArrows[i];
    var age = now - ca.time;
    var progress = Math.min(1, age / ca.duration);
    var ease = progress < 0.3 ? progress / 0.3 * 0.7 : 0.7 + (progress - 0.3) / 0.7 * 0.3; // fast then slow
    var ax = ca.fromX + (ca.toX - ca.fromX) * ease;
    var ay = ca.fromY + (ca.toY - ca.fromY) * ease;
    var alpha = 1 - progress * 0.3;

    // 箭杆
    var angle = Math.atan2(ca.toY - ca.fromY, ca.toX - ca.fromX);
    var shaftLen = 24;
    ctx.strokeStyle = ca.team === 'red'
      ? 'rgba(255,200,150,' + alpha.toFixed(2) + ')'
      : 'rgba(150,200,255,' + alpha.toFixed(2) + ')';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(ax, ay);
    ctx.lineTo(ax - Math.cos(angle) * shaftLen, ay - Math.sin(angle) * shaftLen);
    ctx.stroke();

    // 箭头
    var headSize = 6;
    var hx = ax + Math.cos(angle) * headSize;
    var hy = ay + Math.sin(angle) * headSize;
    ctx.fillStyle = ca.team === 'red' ? 'rgba(255,120,80,' + alpha.toFixed(2) + ')' : 'rgba(80,160,255,' + alpha.toFixed(2) + ')';
    ctx.beginPath();
    ctx.moveTo(hx, hy);
    ctx.lineTo(ax - Math.cos(angle + 0.6) * headSize, ay - Math.sin(angle + 0.6) * headSize);
    ctx.lineTo(ax - Math.cos(angle - 0.6) * headSize, ay - Math.sin(angle - 0.6) * headSize);
    ctx.closePath();
    ctx.fill();

    // 尾迹粒子
    for (var p = 0; p < 3; p++) {
      var px = ax - Math.cos(angle) * (shaftLen + p * 8 + Math.random() * 6);
      var py = ay - Math.sin(angle) * (shaftLen + p * 8 + Math.random() * 6);
      ctx.fillStyle = 'rgba(255,255,200,' + (alpha * 0.5).toFixed(2) + ')';
      ctx.beginPath();
      ctx.arc(px, py, 1.5, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

/** B10: 攻城碎石 — 城堡受击碎片飞溅 */
function drawCastleDebris(ctx) {
  var now = Date.now();
  var P = window.UI_POS ? window.UI_POS.lanes : null;
  var laneY = P ? P.Y : LANE_Y;
  for (var i = 0; i < castleDebris.length; i++) {
    var cd = castleDebris[i];
    var age = now - cd.time;
    var progress = age / 600;
    var alpha = 1 - progress;
    var cx = cd.target === 'red' ? 90 : DESIGN_W - 90;
    var cy = laneY[cd.lane] || DESIGN_H * 0.55;
    // 固定种子让每帧碎片位置一致
    var seed = cd.time % 1000;
    for (var p = 0; p < 8; p++) {
      var angle = (p / 8) * Math.PI * 2 + seed * 0.01;
      var dist = progress * 60 + p * 5;
      var px = cx + Math.cos(angle) * dist;
      var py = cy + Math.sin(angle) * dist - progress * 30;
      var size = 2 + (1 - progress) * 3;
      ctx.fillStyle = 'rgba(180,150,120,' + alpha.toFixed(2) + ')';
      ctx.fillRect(px - size / 2, py - size / 2, size, size);
    }
    // 冲击微尘
    ctx.fillStyle = 'rgba(200,180,150,' + (alpha * 0.3).toFixed(2) + ')';
    ctx.beginPath();
    ctx.arc(cx, cy, progress * 40, 0, Math.PI * 2);
    ctx.fill();
  }
}

/** 龙吼冲击波 — 金色扩散环 */
function drawDragonRoars(ctx) {
  var P = window.UI_POS ? window.UI_POS.lanes : null;
  var laneY = P ? P.Y : LANE_Y;
  var now = Date.now();

  for (var i = 0; i < dragonRoars.length; i++) {
    var dr = dragonRoars[i];
    var age = now - dr.time;
    var progress = age / 1200;
    var y = laneY[dr.lane];
    var alpha = 1 - progress;
    var radius = progress * 350;

    // 冲击环
    ctx.strokeStyle = 'rgba(255,215,0,' + alpha.toFixed(2) + ')';
    ctx.lineWidth = 4 + (1 - progress) * 8;
    ctx.beginPath();
    ctx.arc(dr.x, y, radius, 0, Math.PI * 2);
    ctx.stroke();

    // 内层淡环
    ctx.strokeStyle = 'rgba(255,255,200,' + (alpha * 0.5).toFixed(2) + ')';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(dr.x, y, radius * 0.6, 0, Math.PI * 2);
    ctx.stroke();
  }
}

function drawParticles(ctx) {
  for (const p of particles) {
    ctx.fillStyle = `rgba(180,160,140,${p.alpha})`;
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
    ctx.fill();
  }
}

// === 弹幕层 ===

function renderDanmaku(ctx, state) {
  ctx.clearRect(0, 0, DESIGN_W, DESIGN_H);

  const now = Date.now();

  // 清理过期弹幕（3 秒）
  for (let i = danmakuQueue.length - 1; i >= 0; i--) {
    if (now - danmakuQueue[i].time > 3000) danmakuQueue.splice(i, 1);
  }

  // C6: 三轨弹幕布局
  const POS = window.UI_POS || { danmaku: { tracks: [DESIGN_H - 60, DESIGN_H - 110, DESIGN_H - 160], maxVisible: 6, lifetime: 3000 } };
  const tracks = POS.danmaku.tracks;
  const trackUsed = tracks.map(() => false);

  // 限制同时显示 6 条
  while (danmakuQueue.length > POS.danmaku.maxVisible) danmakuQueue.shift();

  // 为每条弹幕分配轨道
  ctx.font = '20px Microsoft YaHei, sans-serif';
  ctx.textAlign = 'center';

  const reverse = [...danmakuQueue].reverse(); // 旧的在下
  for (const dm of reverse) {
    // 找空闲轨道
    let trackIdx = 0;
    for (let i = 0; i < tracks.length; i++) {
      if (!trackUsed[i]) { trackIdx = i; break; }
    }
    trackUsed[trackIdx] = true;
    const y = tracks[trackIdx];

    const alpha = Math.max(0, 1 - (now - dm.time) / 3000);

    // 半透明底条
    const textWidth = ctx.measureText(dm.text).width;
    ctx.fillStyle = `rgba(0,0,0,${alpha * 0.5})`;
    ctx.fillRect(DESIGN_W / 2 - textWidth / 2 - 12, y - 16, textWidth + 24, 26);

    ctx.fillStyle = `rgba(255,255,255,${alpha})`;
    ctx.strokeStyle = `rgba(0,0,0,${alpha * 0.7})`;
    ctx.lineWidth = 3;
    ctx.strokeText(dm.text, DESIGN_W / 2, y);
    ctx.fillText(dm.text, DESIGN_W / 2, y);
  }

  // C1: 事件播报（中央顶部大字）
  ctx.font = 'bold 28px Microsoft YaHei, sans-serif';
  for (const banner of eventBanners) {
    const age = now - banner.time;
    let alpha;
    if (age < 300) alpha = age / 300;           // fade in
    else if (age < 1500) alpha = 1;              // hold
    else alpha = Math.max(0, 1 - (age - 1500) / 500); // fade out

    const bannerY = 160 + eventBanners.indexOf(banner) * 42;
    ctx.fillStyle = banner.color.replace(')', `,${alpha})`).replace('rgb', 'rgba');
    // Convert hex to rgba
    const hexAlpha = alpha;
    ctx.fillStyle = hexToRgba(banner.color, hexAlpha);
    ctx.strokeStyle = `rgba(0,0,0,${alpha * 0.8})`;
    ctx.lineWidth = 3;
    ctx.strokeText(banner.text, DESIGN_W / 2, bannerY);
    ctx.fillText(banner.text, DESIGN_W / 2, bannerY);
  }
}

/** 简单 hex → rgba */
function hexToRgba(hex, alpha) {
  if (hex.startsWith('#')) {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return `rgba(${r},${g},${b},${alpha})`;
  }
  return hex;
}

// 启动渲染循环
requestAnimationFrame(gameLoop);

// === 鼠标追踪（调试用） ===
const gameContainer = document.getElementById('game-container');
if (gameContainer) {
  gameContainer.addEventListener('mousemove', (e) => {
    const rect = gameContainer.getBoundingClientRect();
    const scaleX = 1920 / rect.width;
    const scaleY = 1080 / rect.height;
    const cx = (e.clientX - rect.left) * scaleX;
    const cy = (e.clientY - rect.top) * scaleY;
    if (window.setMousePos) window.setMousePos(cx, cy);
  });
  gameContainer.addEventListener('mouseleave', () => {
    if (window.setMousePos) window.setMousePos(-1, -1);
  });
  // 点击时在控制台打印坐标
  gameContainer.addEventListener('click', (e) => {
    const rect = gameContainer.getBoundingClientRect();
    const scaleX = 1920 / rect.width;
    const scaleY = 1080 / rect.height;
    const cx = Math.round((e.clientX - rect.left) * scaleX);
    const cy = Math.round((e.clientY - rect.top) * scaleY);
    console.log(`📍 点击坐标: X:${cx}  Y:${cy}`);
  });
}

// WS 状态更新时触发
window.onStateUpdate = (state) => {
  if (window.renderUI) window.renderUI(uiCtx, state);
};

console.log('[Renderer] Loop started at', FPS, 'fps');
console.log('[Renderer] Canvas check — battle:', !!battleCtx, 'ui:', !!uiCtx, 'danmaku:', !!danmakuCtx);
console.log('[Renderer] UI_POS:', window.UI_POS ? 'OK' : 'MISSING');
console.log('[Renderer] drawSprite:', typeof window.drawSprite);
console.log('[Renderer] renderUI:', typeof window.renderUI);
