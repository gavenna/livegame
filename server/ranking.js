/**
 * 积分 & 段位 & 排行榜
 *
 * Phase 1-2: 纯内存存储（重启清空）
 * Phase 3: 加 SQLite 持久化
 */

const config = require('./config');

class Ranking {
  constructor() {
    /** @type {Map<string, PlayerStats>}  playerId → stats */
    this.players = new Map();
  }

  /** 获取或创建玩家记录 */
  getOrCreate(playerId) {
    if (!this.players.has(playerId)) {
      this.players.set(playerId, {
        id: playerId,
        totalScore: 0,
        kills: 0,
        wins: 0,
        games: 0,
        streak: 0,
      });
    }
    return this.players.get(playerId);
  }

  /** 加分 */
  addScore(playerId, amount) {
    const p = this.getOrCreate(playerId);
    p.totalScore += amount;
    return p.totalScore;
  }

  /** 获取当前段位 */
  getRank(playerId) {
    const p = this.getOrCreate(playerId);
    const ranks = config.RANKS;
    let rank = ranks[0];
    for (const r of ranks) {
      if (p.totalScore >= r.minScore) rank = r;
    }
    return rank;
  }

  /** 获取排行榜（Top N） */
  getLeaderboard(n = 10) {
    const sorted = [...this.players.values()]
      .sort((a, b) => b.totalScore - a.totalScore)
      .slice(0, n);
    return sorted.map((p, i) => ({
      rank: i + 1,
      id: p.id,
      score: p.totalScore,
      kills: p.kills,
      wins: p.wins,
    }));
  }

  /** 周榜重置（TODO: Phase 3） */
  resetWeekly() {
    // 保留总榜，重置周榜计数器
  }
}

module.exports = { Ranking };
