/**
 * 兵种精灵绘制（Phase 1: 几何图形 → Phase 3: 精灵图）
 *
 * Phase 1 用纯几何形状区分兵种，不依赖外部素材。
 * Phase 3 替换为 AI 生成的精灵图。
 */

const SPRITE_DEFS = {
  militia:     { color: '#8B7355', shape: 'rect',   w: 12, h: 16, label: '民兵' },
  swordsman:   { color: '#C0C0C0', shape: 'rect',   w: 14, h: 22, label: '剑士' },
  knight:      { color: '#4169E1', shape: 'rect',   w: 24, h: 20, mounted: true, label: '骑士' },
  archer:      { color: '#228B22', shape: 'rect',   w: 12, h: 18, ranged: true, label: '弓手' },
  catapult:    { color: '#8B4513', shape: 'rect',   w: 32, h: 26, siege: true, label: '投石车' },
  royalGuard:  { color: '#FFD700', shape: 'rect',   w: 20, h: 26, elite: true, label: '皇家卫队' },
  giant:       { color: '#A0522D', shape: 'rect',   w: 44, h: 60, boss: true, label: '巨人' },
  dragonKnight:{ color: '#FF4500', shape: 'rect',   w: 54, h: 44, boss: true, flying: true, label: '龙骑士' },
};

/**
 * 绘制兵种到 Canvas
 * @param {CanvasRenderingContext2D} ctx
 * @param {object} troop - 兵种数据（含 team, key, x, y, hp, maxHp）
 */
function drawSprite(ctx, troop) {
  const def = SPRITE_DEFS[troop.key] || SPRITE_DEFS.militia;
  const teamColor = troop.team === 'red' ? '#FF4444' : '#4488FF';
  const x = troop.x || 0;
  const y = troop.y || 540;

  // 飞行兵种有上下浮动
  let yOffset = 0;
  if (def.flying) {
    yOffset = Math.sin(Date.now() * 0.003 + troop.id * 0.01) * 10;
  }

  ctx.save();

  // 精英/首领发光
  if (def.elite || def.boss) {
    ctx.shadowColor = def.color;
    ctx.shadowBlur = 12;
  }

  // 朝向（红的朝右，蓝的朝左）
  const facingRight = troop.team === 'red';

  // 主体
  ctx.fillStyle = def.color;
  ctx.strokeStyle = teamColor;
  ctx.lineWidth = 2;

  const drawX = x - def.w / 2;
  const drawY = y - def.h + yOffset;

  // 不同的几何形状
  switch (def.shape) {
    case 'rect':
    default:
      ctx.fillRect(drawX, drawY, def.w, def.h);
      ctx.strokeRect(drawX, drawY, def.w, def.h);
      break;
  }

  // 骑兵马身
  if (def.mounted) {
    ctx.fillStyle = '#8B6914';
    ctx.fillRect(drawX - 2, drawY + def.h * 0.6, def.w + 4, def.h * 0.4);
    ctx.strokeRect(drawX - 2, drawY + def.h * 0.6, def.w + 4, def.h * 0.4);
  }

  // 弓手武器
  if (def.ranged) {
    ctx.strokeStyle = '#DEB887';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(x, drawY + def.h * 0.4, def.w * 0.6, 0, Math.PI);
    ctx.stroke();
  }

  ctx.shadowBlur = 0;

  // HP 条（仅损血时显示）
  if (troop.hp !== undefined && troop.maxHp && troop.hp < troop.maxHp) {
    const barW = def.w + 6;
    const barH = 4;
    const barY = drawY - 8;
    const hpPct = Math.max(0, troop.hp / troop.maxHp);
    ctx.fillStyle = '#333';
    ctx.fillRect(x - barW / 2, barY, barW, barH);
    ctx.fillStyle = hpPct > 0.5 ? '#4F4' : hpPct > 0.25 ? '#FF0' : '#F44';
    ctx.fillRect(x - barW / 2, barY, barW * hpPct, barH);
  }

  // 拥有者名字（头像兵种）
  if (troop.showAvatar && troop.ownerName) {
    ctx.font = '10px Microsoft YaHei, sans-serif';
    ctx.fillStyle = '#FFF';
    ctx.textAlign = 'center';
    ctx.fillText(troop.ownerName.slice(0, 6), x, drawY - 12);
  }

  ctx.restore();
}

// 导出到全局
window.SPRITE_DEFS = SPRITE_DEFS;
window.drawSprite = drawSprite;
