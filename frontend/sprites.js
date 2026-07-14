/**
 * 兵种精灵绘制
 *
 * Phase 3: 优先使用 AI 生成的 PNG 精灵图，缺失时回退几何图形。
 * 图片路径: /assets/sprites/<key>.png
 */

/** 显示尺寸（游戏世界中的像素大小） */
const SPRITE_DEFS = {
  militia:     { w: 24, h: 32, label: '民兵' },
  swordsman:   { w: 28, h: 36, label: '剑士' },
  knight:      { w: 48, h: 40, mounted: true, label: '骑士' },
  archer:      { w: 24, h: 36, ranged: true, label: '弓手' },
  catapult:    { w: 56, h: 40, siege: true, label: '投石车' },
  royalGuard:  { w: 32, h: 40, elite: true, label: '皇家卫队' },
  giant:       { w: 72, h: 96, boss: true, label: '巨人' },
  dragonKnight:{ w: 90, h: 72, boss: true, flying: true, label: '龙骑士' },
  fireArrow:   { w: 32, h: 32, label: '' },
  wrathOfGod:  { w: 32, h: 32, label: '' },
  batteringRam:{ w: 64, h: 36, siege: true, label: '攻城锤' },
  warChest:    { w: 24, h: 24, label: '' },
};

// 几何图形 fallback 颜色
const FALLBACK_COLORS = {
  militia:     '#8B7355',
  swordsman:   '#C0C0C0',
  knight:      '#4169E1',
  archer:      '#228B22',
  catapult:    '#8B4513',
  royalGuard:  '#FFD700',
  giant:       '#A0522D',
  dragonKnight:'#FF4500',
  fireArrow:   '#FF6347',
  wrathOfGod:  '#FFD700',
  batteringRam:'#8B4513',
  warChest:    '#DAA520',
};

/** 预加载的图片缓存 */
const imageCache = {};

/** 加载所有精灵图 */
function preloadSprites() {
  const keys = Object.keys(SPRITE_DEFS);
  for (const key of keys) {
    const img = new Image();
    img.src = `/assets/sprites/${key}.png`;
    img.onload = () => { imageCache[key] = img; };
    img.onerror = () => { /* 保持 undefined，走 fallback */ };
  }
}

/**
 * 绘制兵种到 Canvas
 */
function drawSprite(ctx, troop, scale) {
  const key = troop.key || 'militia';
  const def = SPRITE_DEFS[key] || SPRITE_DEFS.militia;
  const teamColor = troop.team === 'red' ? '#FF4444' : '#4488FF';
  const x = troop.x || 0;
  const y = troop.y || 540;
  const s = scale !== undefined ? scale : 1;  // B3: spawn animation scale

  // 飞行兵种上下浮动
  let yOffset = 0;
  if (def.flying) {
    yOffset = Math.sin(Date.now() * 0.003 + (troop.id || 0) * 0.01) * 10;
  }

  // 红方朝右，蓝方朝左
  const facingRight = troop.team === 'red';
  const drawW = def.w * s;
  const drawH = def.h * s;
  const drawX = x - drawW / 2;
  const drawY = y - drawH + yOffset;

  ctx.save();

  // 精英/首领发光
  if (def.elite || def.boss) {
    ctx.shadowColor = teamColor;
    ctx.shadowBlur = 10;
  }

  const img = imageCache[key];

  if (img && img.complete && img.naturalWidth > 0) {
    // —— PNG 精灵图渲染 ——
    if (facingRight) {
      ctx.drawImage(img, drawX, drawY, drawW, drawH);
    } else {
      // 蓝方面向左 → 水平翻转
      ctx.translate(x, 0);
      ctx.scale(-1, 1);
      ctx.drawImage(img, -drawW / 2, drawY, drawW, drawH);
    }
  } else {
    // —— 几何图形 fallback ——
    if (facingRight) {
      ctx.fillStyle = FALLBACK_COLORS[key] || '#888';
      ctx.strokeStyle = teamColor;
      ctx.lineWidth = 2;
      ctx.fillRect(drawX, drawY, drawW, drawH);
      ctx.strokeRect(drawX, drawY, drawW, drawH);
    }

    // 骑兵马身
    if (def.mounted) {
      ctx.fillStyle = '#8B6914';
      ctx.fillRect(drawX - 2, drawY + drawH * 0.55, drawW + 4, drawH * 0.45);
    }

    // 弓手武器
    if (def.ranged) {
      ctx.strokeStyle = '#DEB887';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(x, drawY + drawH * 0.4, drawW * 0.6, 0, Math.PI);
      ctx.stroke();
    }
  }

  ctx.shadowBlur = 0;

  // HP 条（仅损血时显示）
  if (troop.hp !== undefined && troop.maxHp && troop.hp < troop.maxHp) {
    const barW = drawW + 6;
    const barH = 4;
    const barY = drawY - 8;
    const hpPct = Math.max(0, troop.hp / troop.maxHp);
    ctx.fillStyle = '#333';
    ctx.fillRect(x - barW / 2, barY, barW, barH);
    ctx.fillStyle = hpPct > 0.5 ? '#4F4' : hpPct > 0.25 ? '#FF0' : '#F44';
    ctx.fillRect(x - barW / 2, barY, barW * hpPct, barH);
  }

  // 拥有者名字
  if (troop.showAvatar && troop.ownerName) {
    ctx.font = '10px Microsoft YaHei, sans-serif';
    ctx.fillStyle = '#FFF';
    ctx.textAlign = 'center';
    ctx.fillText(troop.ownerName.slice(0, 6), x, drawY - 12);
  }

  ctx.restore();
}

// 启动时预加载
preloadSprites();

// 导出
window.SPRITE_DEFS = SPRITE_DEFS;
window.drawSprite = drawSprite;
window.preloadSprites = preloadSprites;
