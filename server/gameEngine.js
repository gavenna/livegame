/**
 * 游戏引擎 — 状态机 + 主循环 + 指令路由
 *
 * 管理游戏生命周期: WAITING → COUNTDOWN → PLAYING → ROUND_END → WAITING
 * 集成 Battle（战斗）、Ranking（排行）、wsServer（消息路由）
 */

const { broadcast, onMessage } = require('./wsServer');
const { Battle } = require('./battle');
const { Ranking } = require('./ranking');
const config = require('./config');
const logger = require('./logger');
const assert = require('./assert');

const STATE = {
  WAITING: 'WAITING',
  COUNTDOWN: 'COUNTDOWN',
  PLAYING: 'PLAYING',
  ROUND_END: 'ROUND_END',
};

const VALID_STATES = Object.values(STATE);

class GameEngine {
  constructor(cfg, db) {
    this.config = cfg;
    this.state = STATE.WAITING;
    this.round = 0;
    this.roundTimer = null;
    this.tickTimer = null;
    this.startTime = 0;
    this.phaseStartedAt = 0;

    // 子系统
    this.battle = new Battle();
    this.db = db || null;
    this.ranking = new Ranking(this.db);
    if (this.db) this.ranking.load();

    // 游戏数据（每局重置）
    this.redTeam = { players: new Map(), castleHP: cfg.CASTLE_HP };
    this.blueTeam = { players: new Map(), castleHP: cfg.CASTLE_HP };

    // 本局统计
    this.roundStats = { kills: new Map(), damageDealt: new Map(), gifts: new Map() };

    // 事件队列（本 tick 产生的事件，推给前端后清空）
    this.pendingEvents = [];

    // 注册 WS 消息处理
    onMessage((msg) => this.handleMessage(msg));
  }

  // ============================================================
  //  生命周期
  // ============================================================

  start() {
    logger.info('ENGINE', 'Starting game loop');
    this.startRound();
  }

  stop() {
    clearTimeout(this.roundTimer);
    clearInterval(this.tickTimer);
    logger.info('ENGINE', 'Stopped');
  }

  /** 跳过 COUNTDOWN 直接开打 */
  startPlaying() {
    clearTimeout(this.roundTimer);
    this.state = STATE.PLAYING;
    this.phaseStartedAt = Date.now();
    logger.info('ENGINE', `Round ${this.round} — PLAYING`);
    this.pushState();

    this.tickTimer = setInterval(() => this.tick(), this.config.BATTLE_TICK_MS);

    this.roundTimer = setTimeout(() => {
      this.endRound();
    }, this.config.ROUND_TIME);
  }

  startRound() {
    this.round++;
    this.state = STATE.COUNTDOWN;
    this.redTeam.castleHP = this.config.CASTLE_HP;
    this.blueTeam.castleHP = this.config.CASTLE_HP;
    this.redTeam.players.clear();
    this.blueTeam.players.clear();
    this.battle = new Battle();
    this.roundStats = { kills: new Map(), damageDealt: new Map(), gifts: new Map() };
    this.startTime = Date.now();
    this.phaseStartedAt = Date.now();  // COUNTDOWN 阶段起点

    logger.info('ENGINE', `Round ${this.round} — COUNTDOWN (${this.config.PREP_TIME / 1000}s)`);
    this.pushState();

    this.roundTimer = setTimeout(() => {
      this.startPlaying();
    }, this.config.PREP_TIME);
  }

  endRound() {
    clearInterval(this.tickTimer);
    clearTimeout(this.roundTimer);
    this.state = STATE.ROUND_END;
    this.phaseStartedAt = Date.now();  // 结算阶段起点

    const duration = Math.round((Date.now() - this.startTime) / 1000);
    const winner = this.redTeam.castleHP > this.blueTeam.castleHP ? 'red'
      : this.blueTeam.castleHP > this.redTeam.castleHP ? 'blue' : 'draw';

    logger.info('ENGINE', `Round ${this.round} — END (${duration}s, winner=${winner})`);
    logger.info('ENGINE', `红方: ${this.redTeam.players.size}人 ${this.redTeam.castleHP}HP | 蓝方: ${this.blueTeam.players.size}人 ${this.blueTeam.castleHP}HP`);

    // 积分结算
    this.settleScores(winner);
    this.pushState();

    this.roundTimer = setTimeout(() => {
      this.startRound();
    }, this.config.SETTLE_TIME);
  }

  // ============================================================
  //  战斗 tick
  // ============================================================

  tick() {
    if (this.state !== STATE.PLAYING) return;

    const battleResult = this.battle.update(this.config.BATTLE_TICK_MS);

    // 处理战斗事件
    for (const event of battleResult.events) {
      switch (event.type) {
        case 'global_skill': {
          const targetTeam = event.team === 'red' ? this.blueTeam : this.redTeam;
          targetTeam.castleHP -= event.damage;
          if (event.castleDmg > 0) {
            const castleDmg = Math.round(this.config.CASTLE_HP * event.castleDmg);
            targetTeam.castleHP -= castleDmg;
            logger.info('ENGINE', `${event.ownerName} 天神之怒! ${event.team}→${event.team === 'red' ? '蓝' : '红'}方 城堡-${castleDmg}HP`);
          }
          if (event.slow > 0) {
            targetTeam.castleHP -= Math.round(event.damage * event.slow);
          }
          this.pendingEvents.push(event);
          this.addStat('damageDealt', event.ownerId, event.damage);
          break;
        }
        case 'siege': {
          const targetTeam = event.team === 'red' ? this.blueTeam : this.redTeam;
          targetTeam.castleHP -= event.damage;
          logger.info('ENGINE', `${event.ownerName} 攻城! ${event.team}→${event.team === 'red' ? '蓝' : '红'}方城堡 -${event.damage}HP`);
          this.pendingEvents.push(event);
          this.addStat('damageDealt', event.ownerId, event.damage);
          break;
        }
        case 'kill': {
          this.addStat('kills', event.killerId, 1);
          this.pendingEvents.push(event);
          break;
        }
        case 'spawn': {
          this.pendingEvents.push(event);
          break;
        }
      }
    }

    // 战线到城堡 → 造成伤害
    const castleDmg = this.battle.getCastleDamage();
    if (castleDmg) {
      const targetTeam = castleDmg.target === 'red' ? this.redTeam : this.blueTeam;
      targetTeam.castleHP -= castleDmg.damage;
      logger.debug('ENGINE', `战线到城堡: ${castleDmg.target}方 -${castleDmg.damage}HP (frontLine=${this.battle.frontLine})`);
    }

    // 检查城堡血量
    this.redTeam.castleHP = Math.max(0, this.redTeam.castleHP);
    this.blueTeam.castleHP = Math.max(0, this.blueTeam.castleHP);
    assert.castleHP(this.redTeam.castleHP, 'red');
    assert.castleHP(this.blueTeam.castleHP, 'blue');

    if (this.redTeam.castleHP <= 0 || this.blueTeam.castleHP <= 0) {
      logger.info('ENGINE', `城堡摧毁 — 红:${this.redTeam.castleHP}HP 蓝:${this.blueTeam.castleHP}HP → 回合结束`);
      this.endRound();
      return;
    }

    // 动态平衡
    this.applyBalance();

    this.pushState();
  }

  // ============================================================
  //  动态平衡
  // ============================================================

  applyBalance() {
    const bal = this.config.BALANCE;
    if (this.state !== STATE.PLAYING) return;

    const redCount = this.redTeam.players.size;
    const blueCount = this.blueTeam.players.size;

    if (redCount > 0 && blueCount > 0) {
      const ratio = Math.max(redCount, blueCount) / Math.min(redCount, blueCount);
      if (ratio > bal.OUTNUMBER_RATIO) {
        const minority = redCount < blueCount ? 'red' : 'blue';
        logger.info('ENGINE', `人数平衡触发: ${minority}方人数劣势 (ratio=${ratio.toFixed(1)}), 伤害+${Math.round(bal.OUTNUMBER_BUFF * 100)}%`);
        for (const t of this.battle.troops) {
          if (t.team === minority && !t._balanced) {
            t.damage = Math.round(t.damage * (1 + bal.OUTNUMBER_BUFF));
            t._balanced = true;
          }
        }
      }
    }

    const redHpRatio = this.redTeam.castleHP / this.config.CASTLE_HP;
    const blueHpRatio = this.blueTeam.castleHP / this.config.CASTLE_HP;
    for (const t of this.battle.troops) {
      if (t.team === 'red' && redHpRatio < bal.COMEBACK_THRESHOLD && !t._comeback) {
        t.damage = Math.round(t.damage * (1 + bal.COMEBACK_BUFF));
        t._comeback = true;
        logger.info('ENGINE', `劣势鼓舞: 红方城堡<${Math.round(bal.COMEBACK_THRESHOLD * 100)}% 伤害+${Math.round(bal.COMEBACK_BUFF * 100)}%`);
      }
      if (t.team === 'blue' && blueHpRatio < bal.COMEBACK_THRESHOLD && !t._comeback) {
        t.damage = Math.round(t.damage * (1 + bal.COMEBACK_BUFF));
        t._comeback = true;
        logger.info('ENGINE', `劣势鼓舞: 蓝方城堡<${Math.round(bal.COMEBACK_THRESHOLD * 100)}% 伤害+${Math.round(bal.COMEBACK_BUFF * 100)}%`);
      }
    }
  }

  // ============================================================
  //  消息处理
  // ============================================================

  handleMessage(msg) {
    assert.playerId(msg.playerId, 'handleMessage');

    switch (msg.type) {
      case 'join':
        assert.validTeam(msg.team);
        this.handleJoin(msg.team, msg.playerId, msg.playerName);
        break;
      case 'danmaku':
        this.handleDanmaku(msg.text, msg.playerId, msg.playerName);
        break;
      case 'gift':
        this.handleGift(msg.troopKey || msg.giftId, msg.playerId, msg.playerName);
        break;
      case 'admin':
        this.handleAdmin(msg.action);
        break;
      default:
        logger.debug('ENGINE', `Unknown message type: ${msg.type}`);
    }
  }

  handleJoin(team, playerId, playerName) {
    assert.playerId(playerId, 'handleJoin');
    assert.validTeam(team);

    const otherTeam = team === 'red' ? this.blueTeam : this.redTeam;
    otherTeam.players.delete(playerId);

    const targetTeam = team === 'red' ? this.redTeam : this.blueTeam;
    if (!targetTeam.players.has(playerId)) {
      targetTeam.players.set(playerId, {
        id: playerId,
        name: playerName || playerId,
        joinedAt: Date.now(),
      });
      logger.info('ENGINE', `${playerName || playerId} → ${team === 'red' ? '红方' : '蓝方'} (${targetTeam.players.size}人)`);
    }

    this.ranking.getOrCreate(playerId);
  }

  handleDanmaku(text, playerId, playerName) {
    if (!text) return;
    text = text.trim();

    const cmd = this.config.DANMAKU_COMMANDS[text];
    if (!cmd) {
      this.pendingEvents.push({ type: 'danmaku_text', text, playerId, playerName, time: Date.now() });
      return;
    }

    logger.debug('DANMAKU', `"${text}" → ${cmd} (${playerName || playerId})`);

    const team = this.getPlayerTeam(playerId);
    const actualTeam = team || (Math.random() < 0.5 ? 'red' : 'blue');
    if (!team) {
      this.handleJoin(actualTeam, playerId, playerName);
    }

    switch (cmd) {
      case 'join_red':
        this.handleJoin('red', playerId, playerName);
        break;
      case 'join_blue':
        this.handleJoin('blue', playerId, playerName);
        break;
      case 'spawn_militia_3':
        if (this.state === STATE.PLAYING) {
          this.battle.spawnTroop(actualTeam, 'militia', playerId, playerName);
          this.battle.spawnTroop(actualTeam, 'militia', playerId, playerName);
          this.battle.spawnTroop(actualTeam, 'militia', playerId, playerName);
        }
        break;
      case 'speed_boost':
        if (this.state === STATE.PLAYING) {
          for (const t of this.battle.troops) {
            if (t.team === actualTeam) {
              t.speed = t.speed * 1.3;
            }
          }
          this.pendingEvents.push({ type: 'speed_boost', team: actualTeam, playerId, playerName, time: Date.now() });
          logger.info('ENGINE', `${playerName || playerId} 吹响冲锋号! ${actualTeam}方全体加速`);
        }
        break;
    }
  }

  handleGift(troopKey, playerId, playerName) {
    assert.playerId(playerId, 'handleGift');
    if (!troopKey) { logger.warn('GIFT', `troopKey 缺失 (player=${playerId})`); return; }
    if (this.state !== STATE.PLAYING) {
      logger.debug('GIFT', `${playerName || playerId} 送礼 ${troopKey} 被忽略 — 非战斗阶段 (state=${this.state})`);
      return;
    }

    let team = this.getPlayerTeam(playerId);
    if (!team) {
      team = Math.random() < 0.5 ? 'red' : 'blue';
      this.handleJoin(team, playerId, playerName);
    }

    let actualKey = this.config.DOUYIN_GIFT_MAP[troopKey] || troopKey;

    const troop = this.battle.spawnTroop(team, actualKey, playerId, playerName);
    if (troop) {
      const giftScore = troop.damage * this.config.SCORE.GIFT_MULTIPLIER;
      this.addStat('gifts', playerId, giftScore);
      logger.info('GIFT', `${playerName || playerId} 送出 ${actualKey} → ${team}方 (伤害:${troop.damage} 积分:+${giftScore})`);
    }
  }

  handleAdmin(action) {
    logger.info('ENGINE', `Admin action: ${action} (state=${this.state})`);

    switch (action) {
      case 'skip_countdown':
        if (this.state === STATE.COUNTDOWN) {
          this.startPlaying();
        }
        break;
      case 'end_round':
        if (this.state === STATE.PLAYING) {
          this.endRound();
        }
        break;
      case 'reset':
        clearInterval(this.tickTimer);
        clearTimeout(this.roundTimer);
        this.startRound();
        break;
      default:
        logger.warn('ENGINE', `Unknown admin action: ${action}`);
    }
  }

  // ============================================================
  //  积分结算
  // ============================================================

  settleScores(winner) {
    // 辅助：获取玩家名字
    const getName = (playerId) => {
      const rp = this.redTeam.players.get(playerId);
      const bp = this.blueTeam.players.get(playerId);
      return (rp || bp || {}).name || playerId;
    };

    for (const [playerId, kills] of this.roundStats.kills) {
      let score = kills * this.config.SCORE.KILL;
      if (kills >= 10) score = Math.round(score * this.config.SCORE.MULTI_KILL_10);
      else if (kills >= 5) score = Math.round(score * this.config.SCORE.MULTI_KILL_5);
      this.ranking.addScore(playerId, score, getName(playerId));
    }

    if (winner !== 'draw') {
      const winTeam = winner === 'red' ? this.redTeam : this.blueTeam;
      for (const [playerId] of winTeam.players) {
        this.ranking.addScore(playerId, this.config.SCORE.WIN_BONUS, getName(playerId));
      }
    }

    const mvp = this.getTopPlayer('damageDealt', winner);
    const svp = this.getTopPlayer('damageDealt', winner === 'red' ? 'blue' : 'red');
    if (mvp) this.ranking.addScore(mvp, this.config.SCORE.MVP_BONUS, getName(mvp));
    if (svp) this.ranking.addScore(svp, this.config.SCORE.SVP_BONUS, getName(svp));

    for (const [playerId, giftValue] of this.roundStats.gifts) {
      this.ranking.addScore(playerId, giftValue, getName(playerId));
    }

    // 持久化对局记录
    if (this.db) {
      const duration = Math.round((Date.now() - this.startTime) / 1000);
      const result = this.db.insertRound(winner, duration);
      const roundId = result.lastInsertRowid;

      const allPlayerIds = new Set([
        ...this.redTeam.players.keys(), ...this.blueTeam.players.keys(),
      ]);
      for (const pid of allPlayerIds) {
        const team = this.redTeam.players.has(pid) ? 'red' : 'blue';
        this.db.insertRoundPlayer(
          roundId, pid, team,
          this.roundStats.kills.get(pid) || 0,
          this.roundStats.damageDealt.get(pid) || 0,
          this.roundStats.gifts.get(pid) || 0,
        );
      }
      logger.info('ENGINE', `Round ${this.round} 已写入 DB (id=${roundId})`);
    }

    logger.info('ENGINE', `MVP: ${mvp || 'none'} (+${this.config.SCORE.MVP_BONUS}), SVP: ${svp || 'none'} (+${this.config.SCORE.SVP_BONUS})`);
  }

  // ============================================================
  //  辅助方法
  // ============================================================

  getPlayerTeam(playerId) {
    if (this.redTeam.players.has(playerId)) return 'red';
    if (this.blueTeam.players.has(playerId)) return 'blue';
    return null;
  }

  addStat(stat, playerId, amount) {
    const map = this.roundStats[stat];
    map.set(playerId, (map.get(playerId) || 0) + amount);
  }

  getTopPlayer(stat, team) {
    const teamPlayers = team === 'red' ? this.redTeam.players : this.blueTeam.players;
    let best = null, bestVal = 0;
    for (const [playerId] of teamPlayers) {
      const val = this.roundStats[stat]?.get(playerId) || 0;
      if (val > bestVal) { bestVal = val; best = playerId; }
    }
    return best;
  }

  /** 推送当前状态到前端 */
  pushState() {
    const now = Date.now();
    let phaseTotal = 0;
    if (this.state === STATE.COUNTDOWN) phaseTotal = this.config.PREP_TIME;
    else if (this.state === STATE.PLAYING) phaseTotal = this.config.ROUND_TIME;
    else if (this.state === STATE.ROUND_END) phaseTotal = this.config.SETTLE_TIME;

    const state = {
      type: 'game_state',
      state: this.state,
      round: this.round,
      red: {
        playerCount: this.redTeam.players.size,
        castleHP: this.redTeam.castleHP,
      },
      blue: {
        playerCount: this.blueTeam.players.size,
        castleHP: this.blueTeam.castleHP,
      },
      frontLine: this.battle.frontLine,
      time: now - this.startTime,
      phaseElapsed: now - this.phaseStartedAt,
      phaseTotal,
      maxHP: this.config.CASTLE_HP,
    };

    if (this.state === STATE.PLAYING || this.state === STATE.ROUND_END) {
      state.troops = this.battle.troops.map(t => ({
        id: t.id,
        team: t.team,
        key: t.key,
        x: t.x,
        y: t.y,
        hp: t.hp,
        maxHp: t.maxHp,
        speed: t.speed,
        ownerName: t.ownerName,
        showAvatar: t.showAvatar,
        avatarSize: t.avatarSize,
        elite: t.key === 'royalGuard',
        boss: t.key === 'giant' || t.key === 'dragonKnight',
        ranged: t.ranged,
      }));

      state.leaderboard = this.ranking.getLeaderboard(10);

      state.events = this.pendingEvents.slice(0, 20);
      this.pendingEvents = [];
    }

    broadcast(state);
  }
}

module.exports = { GameEngine, STATE };
