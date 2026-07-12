/**
 * 战斗逻辑 — 兵种生成、交战计算、战线推进
 *
 * 性能敏感：10tps 固定频率，不在 tick 里遍历全量兵种。
 * 用「战线聚合模型」而非「每个兵种独立移动」。
 */

const config = require('./config');

class Battle {
  constructor() {
    this.troops = [];           // 场上活跃兵种
    this.frontLine = 0;        // 战线位置（-1000 ~ +1000, 0=中线, 正值=向蓝方推进）
  }

  /** 生成兵种（玩家送礼/弹幕触发） */
  spawnTroop(team, troopKey, playerId) {
    const troopDef = config.TROOPS[troopKey];
    if (!troopDef) return null;

    const troop = {
      id: Date.now() + Math.random(),
      team,                    // 'red' | 'blue'
      key: troopKey,
      ...troopDef,
      ownerId: playerId,
      x: 0,                   // 出生位置（在己方后方）
      createdAt: Date.now(),
    };

    this.troops.push(troop);
    return troop;
  }

  /** 每 tick 更新战斗状态 */
  update(deltaMs) {
    // TODO: Phase 1 实现
    // 1. 清理过期兵种
    // 2. 双方兵种碰撞 → 计算伤害（含克制关系）
    // 3. 汇总双方总伤害 → 更新战线位置
    // 4. 战线到达城堡 → 对城堡造成伤害
    // 5. 移除已死亡兵种
  }

  /** 计算双方当前总伤害输出 */
  getDamageOutput() {
    let redDmg = 0, blueDmg = 0;
    for (const t of this.troops) {
      if (t.team === 'red') redDmg += t.damage;
      else blueDmg += t.damage;
    }
    return { red: redDmg, blue: blueDmg };
  }

  /** 获取战线位置 */
  getFrontLine() {
    return this.frontLine;
  }
}

module.exports = { Battle };
