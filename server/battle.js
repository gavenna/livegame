/**
 * 战斗逻辑 — 兵种生成、交战计算、战线推进
 *
 * 性能敏感：10tps 固定频率，不过度遍历。
 * 用「战线聚合模型」：兵种独立移动 + 碰撞交战 + 战线推拉。
 */

const config = require('./config');
const logger = require('./logger');
const assert = require('./assert');

const CANVAS_W = config.CANVAS_WIDTH;        // 1920
const CANVAS_H = config.CANVAS_HEIGHT;       // 1080
const CENTER_X = CANVAS_W / 2;               // 960 — 中线
const RED_SPAWN_X = 100;                      // 红方出生点
const BLUE_SPAWN_X = CANVAS_W - 100;         // 蓝方出生点 (1820)
const GROUND_Y = CANVAS_H * 0.55;            // 地面线 y 坐标

class Battle {
  constructor() {
    /** @type {Array<{id: number, team: string, key: string, damage: number, hp: number, maxHp: number, speed: number, x: number, y: number, ownerId: string, createdAt: number, counters: string[], ranged: boolean, aoe: boolean, fear: boolean, siege: boolean, globalSkill: boolean, showAvatar: boolean, avatarSize: string, avatarTime: number}>} */
    this.troops = [];
    this.frontLine = 0;              // -1000 ~ +1000, 0=中线
    this.events = [];                // 本 tick 战斗事件
  }

  /** 生成兵种 */
  spawnTroop(team, troopKey, playerId, playerName) {
    assert.validTeam(team);

    const troopDef = config.TROOPS[troopKey];
    assert.troopExists(troopDef, troopKey);

    // 盲盒 → 随机兵种
    let actualKey = troopKey;
    let actualDef = troopDef;
    if (troopDef.random) {
      actualKey = weightedRandom(config.WAR_CHEST_POOL, config.WAR_CHEST_WEIGHTS);
      actualDef = config.TROOPS[actualKey];
      assert.troopExists(actualDef, actualKey);
      logger.info('BATTLE', `${playerName || playerId} 开盲盒 → ${actualDef.name}`);
    }

    const x = team === 'red' ? RED_SPAWN_X : BLUE_SPAWN_X;
    const y = GROUND_Y + (Math.random() - 0.5) * 200;

    const troop = {
      id: Date.now() + Math.random(),
      team,
      key: actualKey,
      damage: actualDef.damage,
      hp: actualDef.hp,
      maxHp: actualDef.hp,
      speed: actualDef.speed,
      x,
      y,
      ownerId: playerId,
      ownerName: playerName || playerId,
      createdAt: Date.now(),
      counters: actualDef.counters || [],
      ranged: actualDef.ranged || false,
      aoe: actualDef.aoe || false,
      fear: actualDef.fear || false,
      siege: actualDef.siege || false,
      globalSkill: actualDef.globalSkill || false,
      showAvatar: actualDef.showAvatar || false,
      avatarSize: actualDef.avatarSize || 0,
      avatarTime: actualDef.avatarTime || 0,
    };

    // 全局技能立即生效，不加入 troops 数组
    if (troop.globalSkill) {
      this.events.push({
        type: 'global_skill',
        team,
        key: actualKey,
        ownerId: playerId,
        ownerName: playerName || playerId,
        damage: actualDef.damage,
        slow: actualDef.slow || 0,
        slowTime: actualDef.slowTime || 0,
        castleDmg: actualDef.castleDmg || 0,
        time: Date.now(),
      });
      logger.info('BATTLE', `${playerName || playerId} 释放全局技能: ${actualDef.name} (伤害:${actualDef.damage})`);
      return troop;
    }

    // 攻城兵种：直接对城堡造成伤害
    if (troop.siege) {
      this.events.push({
        type: 'siege',
        team,
        key: actualKey,
        ownerId: playerId,
        ownerName: playerName || playerId,
        damage: actualDef.damage,
        time: Date.now(),
      });
      logger.info('BATTLE', `${playerName || playerId} 派出攻城兵种: ${actualDef.name} (城堡伤害:${actualDef.damage})`);
      return troop;
    }

    this.troops.push(troop);

    this.events.push({
      type: 'spawn',
      team,
      key: actualKey,
      ownerId: playerId,
      ownerName: playerName || playerId,
      showAvatar: troop.showAvatar,
      avatarSize: troop.avatarSize,
      avatarTime: troop.avatarTime,
      time: Date.now(),
    });

    logger.debug('BATTLE', `${actualDef.name} 生成 — ${team}方 (${playerName || playerId}) x=${Math.round(x)} dmg=${actualDef.damage} hp=${actualDef.hp} speed=${actualDef.speed}`);

    return troop;
  }

  /** 每 tick 更新战斗状态 (100ms) */
  update(deltaMs) {
    const dt = deltaMs / 1000;
    const bal = config.BALANCE;

    // === 1. 清理过期兵种 ===
    const now = Date.now();
    const oldLen = this.troops.length;
    this.troops = this.troops.filter(t => {
      const age = now - t.createdAt;
      if (age > bal.MAX_TROOP_AGE) {
        this.events.push({ type: 'expire', troopId: t.id, team: t.team, key: t.key, time: now });
        return false;
      }
      return true;
    });
    if (oldLen !== this.troops.length) {
      logger.debug('BATTLE', `过期清理: ${oldLen - this.troops.length} 兵种 (剩余 ${this.troops.length})`);
    }

    // === 2. 兵种移动 ===
    for (const t of this.troops) {
      if (t.speed <= 0) continue;
      const moveX = t.speed * bal.SPEED_FACTOR;
      if (t.team === 'red') {
        t.x = Math.min(t.x + moveX, CANVAS_W - 50);
      } else {
        t.x = Math.max(t.x - moveX, 50);
      }
    }

    // === 3. 交战计算 ===
    const redTroops = this.troops.filter(t => t.team === 'red' && t.hp > 0);
    const blueTroops = this.troops.filter(t => t.team === 'blue' && t.hp > 0);

    let redTotalDmg = 0;
    let blueTotalDmg = 0;

    for (const rt of redTroops) {
      let closest = null, closestDist = Infinity;
      for (const bt of blueTroops) {
        if (bt.hp <= 0) continue;
        const dist = Math.abs(rt.x - bt.x);
        if (dist < closestDist) { closest = bt; closestDist = dist; }
      }

      if (closest && closestDist < bal.COLLISION_RANGE) {
        const redDmg = getCounterDamage(rt, closest, bal.COUNTER_MULTIPLIER);
        const blueDmg = getCounterDamage(closest, rt, bal.COUNTER_MULTIPLIER);

        closest.hp -= redDmg;
        rt.hp -= blueDmg;

        if (closest.hp <= 0) {
          this.events.push({ type: 'kill', troopId: closest.id, team: 'blue', key: closest.key, killerId: rt.ownerId, killerName: rt.ownerName, time: now });
        }
        if (rt.hp <= 0) {
          this.events.push({ type: 'kill', troopId: rt.id, team: 'red', key: rt.key, killerId: closest.ownerId, killerName: closest.ownerName, time: now });
        }
      }

      if (rt.hp > 0) {
        redTotalDmg += rt.damage;
        if (rt.aoe) {
          for (const bt of blueTroops) {
            if (bt.hp <= 0) continue;
            if (Math.abs(rt.x - bt.x) < bal.COLLISION_RANGE * 2) {
              const splashDmg = rt.damage * 0.3;
              bt.hp -= splashDmg;
              if (bt.hp <= 0) {
                this.events.push({ type: 'kill', troopId: bt.id, team: 'blue', key: bt.key, killerId: rt.ownerId, killerName: rt.ownerName, time: now });
              }
            }
          }
        }
      }
    }

    for (const bt of blueTroops) {
      if (bt.hp > 0) {
        blueTotalDmg += bt.damage;
        if (bt.aoe) {
          for (const rt of redTroops) {
            if (rt.hp <= 0) continue;
            if (Math.abs(bt.x - rt.x) < bal.COLLISION_RANGE * 2) {
              rt.hp -= bt.damage * 0.3;
              if (rt.hp <= 0) {
                this.events.push({ type: 'kill', troopId: rt.id, team: 'red', key: rt.key, killerId: bt.ownerId, killerName: bt.ownerName, time: now });
              }
            }
          }
        }
      }
    }

    // === 4. 恐惧效果（龙骑士，持续 debuff） ===
    for (const t of this.troops) {
      if (t.fear && t.hp > 0) {
        const enemies = t.team === 'red' ? blueTroops : redTroops;
        for (const enemy of enemies) {
          if (enemy.hp <= 0) continue;
          const dist = Math.abs(t.x - enemy.x);
          if (dist < bal.COLLISION_RANGE * 3) {
            // 施加恐惧 debuff（3s）
            if (!enemy._fearedUntil || enemy._fearedUntil < now) {
              enemy._origSpeed = enemy.speed;
              enemy._fearedUntil = now + 3000;
              enemy.speed = enemy.speed * 0.5;
            }
            // 击退
            if (enemy.team === 'red') enemy.x = Math.max(50, enemy.x - 15);
            else enemy.x = Math.min(CANVAS_W - 50, enemy.x + 15);
          }
        }
      }
    }
    // 清理过期恐惧 debuff
    for (const t of this.troops) {
      if (t._fearedUntil && t._fearedUntil < now && t._origSpeed !== undefined) {
        t.speed = t._origSpeed;
        t._fearedUntil = null;
        t._origSpeed = undefined;
      }
    }

    // === 5. 移除死亡兵种 ===
    const beforeDead = this.troops.length;
    this.troops = this.troops.filter(t => t.hp > 0);
    const deadCount = beforeDead - this.troops.length;

    // === 6. 更新战线 ===
    const dmgDiff = redTotalDmg - blueTotalDmg;
    const totalDmg = redTotalDmg + blueTotalDmg;
    const pushAmount = totalDmg > 0
      ? (dmgDiff / totalDmg) * bal.PUSH_FACTOR * 1000
      : 0;
    this.frontLine = Math.max(-bal.FRONTLINE_MAX, Math.min(bal.FRONTLINE_MAX, this.frontLine + pushAmount));

    // 仅在战线变化显著时记日志
    if (Math.abs(this.frontLine) > 500 && Math.abs(pushAmount) > 5) {
      logger.debug('BATTLE', `战线: ${Math.round(this.frontLine)} (push=${pushAmount.toFixed(2)}) 红dmg:${redTotalDmg} 蓝dmg:${blueTotalDmg} 兵:${this.troops.length} 死:${deadCount}`);
    }

    const tickEvents = [...this.events];
    this.events = [];
    return {
      frontLine: this.frontLine,
      troops: this.troops,
      events: tickEvents,
    };
  }

  /** 获取战线推进到城堡时的伤害（由 GameEngine 调用） */
  getCastleDamage() {
    const bal = config.BALANCE;
    const absFL = Math.abs(this.frontLine);
    if (absFL >= bal.FRONTLINE_MAX) {
      const dmg = bal.CASTLE_DMG_PER_TICK;
      const rebound = bal.FRONTLINE_MAX * 0.3;
      const oldFL = this.frontLine;
      this.frontLine = Math.sign(this.frontLine) * (bal.FRONTLINE_MAX - rebound);
      logger.info('BATTLE', `战线到城堡! ${this.frontLine > 0 ? '红→蓝' : '蓝→红'}方城堡 -${dmg}HP (frontLine=${Math.round(oldFL)}→${Math.round(this.frontLine)})`);
      return {
        target: this.frontLine > 0 ? 'blue' : 'red',
        damage: dmg,
      };
    }
    return null;
  }

  /** 计算双方当前总伤害输出 */
  getDamageOutput() {
    let redDmg = 0, blueDmg = 0;
    for (const t of this.troops) {
      if (t.hp <= 0) continue;
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

/** 计算克制伤害 */
function getCounterDamage(attacker, defender, multiplier) {
  let dmg = attacker.damage;
  if (attacker.counters && attacker.counters.includes(defender.key)) {
    dmg *= multiplier;
  }
  return dmg;
}

/** 加权随机 */
function weightedRandom(items, weights) {
  const total = weights.reduce((s, w) => s + w, 0);
  let r = Math.random() * total;
  for (let i = 0; i < items.length; i++) {
    r -= weights[i];
    if (r <= 0) return items[i];
  }
  return items[items.length - 1];
}

module.exports = { Battle };
