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
const W = 1920, H = 1080;

const battleCanvas = document.getElementById('battle-layer');
const uiCanvas = document.getElementById('ui-layer');
const danmakuCanvas = document.getElementById('danmaku-layer');

const battleCtx = battleCanvas.getContext('2d');
const uiCtx = uiCanvas.getContext('2d');
const danmakuCtx = danmakuCanvas.getContext('2d');

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
      x: Math.random() * W,
      y: H * 0.5 + Math.random() * H * 0.4,
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
 * 主渲染循环
 */
function gameLoop(timestamp) {
  requestAnimationFrame(gameLoop);

  const elapsed = timestamp - lastFrameTime;
  if (elapsed < FRAME_MS) return;
  lastFrameTime = timestamp - (elapsed % FRAME_MS);
  frameCount++;

  const state = window.gameState || {};

  // 处理事件 → 分发到各特效系统
  processEvents(state);

  // 更新特效
  updateEffects();

  // 渲染三层
  renderBattle(battleCtx, state);
  if (window.renderUI) window.renderUI(uiCtx, state);
  renderDanmaku(danmakuCtx, state);
}

/** 事件去重：跟踪已处理的 events 数组 */
let lastEventHash = '';

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
        break;
      case 'kill':
        dmText = `💀 ${evt.killerName} 击杀敌方 ${evt.key}`;
        // B2: 击杀闪光 — 用死亡兵种坐标（兵种仍在数组中播死亡动画）
        if (window.gameState && window.gameState.troops) {
          const deadTroop = window.gameState.troops.find(t => t.id === evt.troopId);
          if (deadTroop) {
            killFlashes.push({ x: deadTroop.x, y: deadTroop.y, time: now });
          } else {
            const killX = evt.team === 'red' ? W * 0.4 : W * 0.6;
            killFlashes.push({ x: killX, y: H * 0.5 + Math.random() * 100, time: now });
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
        break;
      case 'global_skill':
        dmText = `🔥 ${evt.ownerName} 释放了 ${evt.key === 'wrathOfGod' ? '天神之怒' : '火矢齐射'}！`;
        eventBanners.push({ text: dmText, time: now, color: evt.key === 'wrathOfGod' ? '#FFD700' : '#FF6347' });
        // B5: 技能特效
        skillEffects.push({ type: evt.key, time: now });
        break;
      case 'siege':
        dmText = `🔨 ${evt.ownerName} 派出攻城锤！`;
        eventBanners.push({ text: `🔨 ${evt.ownerName} 的攻城锤撞击城堡！`, time: now, color: '#FF8C00' });
        // B6: 攻城冲击（目标是对立方的城堡）
        siegeImpacts.push({ target: evt.team === 'red' ? 'blue' : 'red', time: now });
        break;
      case 'speed_boost':
        dmText = `💨 ${evt.playerName} 吹响了冲锋号！`;
        eventBanners.push({ text: dmText, time: now, color: '#88CCFF' });
        break;
      case 'expire':
        // B4: 死亡动画
        deathAnims.push({ x: W / 2 + (Math.random() - 0.5) * 400, y: H * 0.5 + Math.random() * 200, key: evt.key, time: now });
        break;
    }
    if (dmText) {
      danmakuQueue.push({ text: dmText, time: now, y: H - 50 });
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

  // C1: 事件播报（2s）
  for (let i = eventBanners.length - 1; i >= 0; i--) {
    if (now - eventBanners[i].time > 2000) eventBanners.splice(i, 1);
  }

  // E1: 粒子更新
  for (const p of particles) {
    p.y -= p.speed;
    p.wobble += 0.02;
    p.x += Math.sin(p.wobble) * 0.3;
    if (p.y < H * 0.4) { p.y = H * 0.75 + Math.random() * H * 0.2; p.x = Math.random() * W; }
  }
}

// === 战场层渲染 ===

function renderBattle(ctx, state) {
  ctx.clearRect(0, 0, W, H);

  drawBackground(ctx);

  const frontLine = state.frontLine || 0;
  drawFrontLine(ctx, frontLine, state);

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

  // 攻城冲击
  drawSiegeImpacts(ctx, state);

  // 环境粒子（在兵种下层）
  drawParticles(ctx);
}

/** B7: 战线可视化 */
function drawFrontLine(ctx, frontLine, state) {
  const centerX = W / 2 + frontLine * 0.5;
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
  ctx.moveTo(centerX, 100);
  ctx.lineTo(centerX, H - 50);
  ctx.stroke();
  ctx.setLineDash([]);

  // 战线到城堡时闪烁
  const isPlaying = state.state === 'PLAYING';
  if (isPlaying && absFL >= 800) {
    const blink = Math.sin(Date.now() * 0.01) > 0;
    if (blink) {
      ctx.strokeStyle = frontLine > 0 ? 'rgba(255,50,50,0.8)' : 'rgba(50,50,255,0.8)';
      ctx.lineWidth = lineWidth + 3;
      ctx.beginPath();
      ctx.moveTo(centerX, 100);
      ctx.lineTo(centerX, H - 50);
      ctx.stroke();
    }
  }

  // 战线标签
  ctx.font = '13px Microsoft YaHei, sans-serif';
  ctx.textAlign = 'center';
  if (frontLine > 300) {
    ctx.fillStyle = 'rgba(255,150,150,0.8)';
    ctx.fillText('→ 红方推进中', centerX, 90);
  } else if (frontLine < -300) {
    ctx.fillStyle = 'rgba(150,150,255,0.8)';
    ctx.fillText('← 蓝方推进中', centerX, 90);
  }
}

/** 战场背景 */
function drawBackground(ctx) {
  if (bgImage.complete && bgImage.naturalWidth > 0) {
    ctx.drawImage(bgImage, 0, 0, W, H);
    return;
  }
  const grad = ctx.createLinearGradient(0, 0, 0, H);
  grad.addColorStop(0, '#1a1a2e');
  grad.addColorStop(0.3, '#2d2d44');
  grad.addColorStop(1, '#3d2b1f');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = '#2d5a1e';
  ctx.fillRect(0, H * 0.75, W, H * 0.25);
}

/** 城堡（含 E2 受损表现） */
function drawCastles(ctx, state) {
  const redHP = state.red ? state.red.castleHP : 10000;
  const blueHP = state.blue ? state.blue.castleHP : 10000;
  const maxHP = state.maxHP || 10000;
  const redPct = redHP / maxHP;
  const bluePct = blueHP / maxHP;

  // 红方城堡（左）
  if (castleRedImg.complete && castleRedImg.naturalWidth > 0) {
    ctx.globalAlpha = 0.4 + redPct * 0.6;
    ctx.drawImage(castleRedImg, 10, H * 0.38, 160, 140);
    ctx.globalAlpha = 1;
    // E2: 受损冒烟/冒火
    drawCastleDamageOverlay(ctx, 90, H * 0.38 + 70, redPct, 'red');
  } else {
    ctx.fillStyle = '#8B4513';
    ctx.fillRect(20, H * 0.5, 60, 120);
  }

  // HP 条
  ctx.fillStyle = '#333';
  ctx.fillRect(20, H * 0.48, 100, 8);
  ctx.fillStyle = redPct > 0.3 ? '#F44' : '#F00';
  ctx.fillRect(20, H * 0.48, 100 * redPct, 8);
  ctx.font = 'bold 16px Microsoft YaHei, sans-serif';
  ctx.fillStyle = '#FF8888';
  ctx.textAlign = 'center';
  ctx.fillText('炎龙帝国', 70, H * 0.46);
  // HP 数字
  ctx.font = '11px Microsoft YaHei, sans-serif';
  ctx.fillText(Math.round(redHP) + ' HP', 70, H * 0.5 + 130);

  // 蓝方城堡（右）
  if (castleBlueImg.complete && castleBlueImg.naturalWidth > 0) {
    ctx.globalAlpha = 0.4 + bluePct * 0.6;
    ctx.drawImage(castleBlueImg, W - 170, H * 0.38, 160, 140);
    ctx.globalAlpha = 1;
    drawCastleDamageOverlay(ctx, W - 90, H * 0.38 + 70, bluePct, 'blue');
  } else {
    ctx.fillStyle = '#4A4A6A';
    ctx.fillRect(W - 80, H * 0.5, 60, 120);
  }

  // HP 条
  ctx.fillStyle = '#333';
  ctx.fillRect(W - 120, H * 0.48, 100, 8);
  ctx.fillStyle = bluePct > 0.3 ? '#48F' : '#00F';
  ctx.fillRect(W - 120, H * 0.48, 100 * bluePct, 8);
  ctx.font = 'bold 16px Microsoft YaHei, sans-serif';
  ctx.fillStyle = '#8888FF';
  ctx.fillText('霜狼联盟', W - 70, H * 0.46);
  ctx.font = '11px Microsoft YaHei, sans-serif';
  ctx.fillText(Math.round(blueHP) + ' HP', W - 70, H * 0.5 + 130);
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
        ctx.fillRect(0, 0, W, H);
      }
      // 金色光柱
      if (progress < 0.6) {
        const colAlpha = (1 - progress / 0.6) * 0.5;
        const grad = ctx.createLinearGradient(0, 0, 0, H);
        grad.addColorStop(0, `rgba(255,215,0,0)`);
        grad.addColorStop(0.3, `rgba(255,215,0,${colAlpha})`);
        grad.addColorStop(0.7, `rgba(255,200,0,${colAlpha})`);
        grad.addColorStop(1, `rgba(255,180,0,0)`);
        ctx.fillStyle = grad;
        ctx.fillRect(W / 2 - 80, 0, 160, H);
      }
    }

    if (se.type === 'fireArrow') {
      // 红色箭雨从上方掠过
      if (progress < 0.5) {
        const alpha = (1 - progress / 0.5) * 0.6;
        ctx.strokeStyle = `rgba(255,80,20,${alpha})`;
        ctx.lineWidth = 2;
        for (let i = 0; i < 12; i++) {
          const arrowX = (i / 12) * W + (progress * 800) % 200 - 100;
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
    const cx = si.target === 'red' ? 90 : W - 90;
    const cy = H * 0.45;
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
  ctx.clearRect(0, 0, W, H);

  const now = Date.now();

  // 清理过期弹幕（3 秒）
  for (let i = danmakuQueue.length - 1; i >= 0; i--) {
    if (now - danmakuQueue[i].time > 3000) danmakuQueue.splice(i, 1);
  }

  // C6: 三轨弹幕布局
  const tracks = [H - 60, H - 110, H - 160];
  const trackUsed = [false, false, false];

  // 限制同时显示 6 条
  while (danmakuQueue.length > 6) danmakuQueue.shift();

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
    ctx.fillRect(W / 2 - textWidth / 2 - 12, y - 16, textWidth + 24, 26);

    ctx.fillStyle = `rgba(255,255,255,${alpha})`;
    ctx.strokeStyle = `rgba(0,0,0,${alpha * 0.7})`;
    ctx.lineWidth = 3;
    ctx.strokeText(dm.text, W / 2, y);
    ctx.fillText(dm.text, W / 2, y);
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
    ctx.strokeText(banner.text, W / 2, bannerY);
    ctx.fillText(banner.text, W / 2, bannerY);
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

// WS 状态更新时触发
window.onStateUpdate = (state) => {
  if (window.renderUI) window.renderUI(uiCtx, state);
};

console.log('[Renderer] Loop started at', FPS, 'fps');
