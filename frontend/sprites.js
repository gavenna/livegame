/**
 * 兵种精灵绘制（Phase 1: 几何图形 → Phase 3: 精灵图）
 *
 * Phase 1 用纯几何形状区分兵种，不依赖外部素材。
 * Phase 3 替换为 AI 生成的精灵图。
 */

const SPRITE_DEFS = {
  militia:     { color: '#8B7355', shape: 'rect',   w: 10, h: 15 },
  swordsman:   { color: '#C0C0C0', shape: 'rect',   w: 14, h: 20 },
  knight:      { color: '#4169E1', shape: 'rect',   w: 22, h: 18, mounted: true },
  archer:      { color: '#228B22', shape: 'rect',   w: 12, h: 16, ranged: true },
  catapult:    { color: '#8B4513', shape: 'rect',   w: 30, h: 25, siege: true },
  royalGuard:  { color: '#FFD700', shape: 'rect',   w: 18, h: 24, elite: true },
  giant:       { color: '#A0522D', shape: 'rect',   w: 40, h: 55, boss: true },
  dragonKnight:{ color: '#FF4500', shape: 'rect',   w: 50, h: 40, boss: true, flying: true },
};

/**
 * 绘制兵种到 Canvas
 * @param {CanvasRenderingContext2D} ctx
 * @param {object} troop - 兵种数据（含 team, key, x, y）
 */
function drawSprite(ctx, troop) {
  const def = SPRITE_DEFS[troop.key] || SPRITE_DEFS.militia;
  const teamColor = troop.team === 'red' ? '#FF4444' : '#4488FF';

  // TODO: Phase 3 替换为精灵图渲染
  // Phase 1 用几何图形
  ctx.fillStyle = def.color;
  ctx.strokeStyle = teamColor;
  ctx.lineWidth = 2;

  const x = troop.x || 0;
  const y = troop.y || 0;

  // 简易几何形状
  ctx.fillRect(x - def.w / 2, y - def.h, def.w, def.h);
  ctx.strokeRect(x - def.w / 2, y - def.h, def.w, def.h);

  // 精英兵种特效
  if (def.elite || def.boss) {
    ctx.shadowColor = def.color;
    ctx.shadowBlur = 10;
    ctx.fillRect(x - def.w / 2, y - def.h, def.w, def.h);
    ctx.shadowBlur = 0;
  }
}

// 导出到全局
window.SPRITE_DEFS = SPRITE_DEFS;
window.drawSprite = drawSprite;
