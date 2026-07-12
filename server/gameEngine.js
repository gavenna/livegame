/**
 * 游戏引擎 — 状态机 + 主循环
 *
 * 管理游戏生命周期: WAITING → COUNTDOWN → PLAYING → ROUND_END → WAITING
 * 所有游戏类型共用此状态机。
 */

const { broadcast } = require('./wsServer');
const config = require('./config');

const STATE = {
  WAITING: 'WAITING',       // 等待开播
  COUNTDOWN: 'COUNTDOWN',   // 准备倒计时
  PLAYING: 'PLAYING',       // 战斗中
  ROUND_END: 'ROUND_END',   // 结算展示
};

class GameEngine {
  constructor(cfg) {
    this.config = cfg;
    this.state = STATE.WAITING;
    this.round = 0;
    this.roundTimer = null;
    this.tickTimer = null;
    this.startTime = 0;

    // 游戏数据（每局重置）
    this.redTeam = { players: new Map(), castleHP: cfg.CASTLE_HP };
    this.blueTeam = { players: new Map(), castleHP: cfg.CASTLE_HP };
  }

  /** 启动引擎 → 进入第一局准备 */
  start() {
    console.log('[Engine] Starting game loop');
    this.startRound();
  }

  /** 停止引擎 */
  stop() {
    clearTimeout(this.roundTimer);
    clearInterval(this.tickTimer);
    console.log('[Engine] Stopped');
  }

  /** 开始新一局 */
  startRound() {
    this.round++;
    this.state = STATE.COUNTDOWN;
    this.redTeam.castleHP = this.config.CASTLE_HP;
    this.blueTeam.castleHP = this.config.CASTLE_HP;
    this.startTime = Date.now();

    console.log(`[Engine] Round ${this.round} — COUNTDOWN (${this.config.PREP_TIME / 1000}s)`);
    this.pushState();

    // 准备阶段结束 → 进入战斗
    this.roundTimer = setTimeout(() => {
      this.state = STATE.PLAYING;
      console.log(`[Engine] Round ${this.round} — PLAYING`);
      this.pushState();

      // 战斗 tick 循环
      this.tickTimer = setInterval(() => this.tick(), this.config.BATTLE_TICK_MS);

      // 单局超时
      this.roundTimer = setTimeout(() => {
        this.endRound();
      }, this.config.ROUND_TIME);
    }, this.config.PREP_TIME);
  }

  /** 结束当前局 */
  endRound() {
    clearInterval(this.tickTimer);
    this.state = STATE.ROUND_END;

    const duration = Math.round((Date.now() - this.startTime) / 1000);
    console.log(`[Engine] Round ${this.round} — END (${duration}s)`);
    this.pushState();

    // 结算展示 → 下一局
    this.roundTimer = setTimeout(() => {
      this.startRound();
    }, this.config.SETTLE_TIME);
  }

  /** 战斗 tick — 每 100ms 执行一次 */
  tick() {
    const elapsed = (Date.now() - this.startTime) / 1000;

    // TODO: Phase 1 实现战斗计算
    // - 兵种移动与交战
    // - 伤害计算（含克制关系）
    // - 战线推进
    // - 城堡伤害
    // - 动态平衡检查

    this.pushState();
  }

  /** 推送当前状态到前端 */
  pushState() {
    broadcast({
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
      time: Date.now() - this.startTime,
    });
  }
}

module.exports = { GameEngine, STATE };
