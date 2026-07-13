/**
 * SQLite 持久化层
 *
 * 三张表:
 *   players       — 玩家积分/段位（跨局持久）
 *   rounds        — 对局记录
 *   round_players — 对局-玩家关联（击杀/伤害/礼物）
 */

const Database = require('better-sqlite3');
const path = require('path');

class DB {
  constructor(dbPath) {
    this.db = new Database(dbPath || path.resolve(__dirname, '..', 'data', 'war-danmaku.db'));
    this.db.pragma('journal_mode = WAL');
    this.db.pragma('foreign_keys = ON');
    this._migrate();
  }

  _migrate() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS players (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        score INTEGER NOT NULL DEFAULT 0,
        rank TEXT NOT NULL DEFAULT '新兵',
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS rounds (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        winner TEXT NOT NULL,
        duration_sec INTEGER NOT NULL,
        created_at INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS round_players (
        round_id INTEGER NOT NULL,
        player_id TEXT NOT NULL,
        team TEXT NOT NULL,
        kills INTEGER NOT NULL DEFAULT 0,
        damage_dealt INTEGER NOT NULL DEFAULT 0,
        gift_value INTEGER NOT NULL DEFAULT 0,
        PRIMARY KEY (round_id, player_id),
        FOREIGN KEY (round_id) REFERENCES rounds(id)
      );
    `);
  }

  // === 玩家 ===

  upsertPlayer(playerId, playerName, score) {
    const now = Date.now();
    this.db.prepare(`
      INSERT INTO players (id, name, score, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        name = excluded.name,
        score = score + excluded.score,
        updated_at = excluded.updated_at
    `).run(playerId, playerName, score, now, now);
  }

  getPlayer(playerId) {
    return this.db.prepare('SELECT * FROM players WHERE id = ?').get(playerId);
  }

  getAllPlayers() {
    return this.db.prepare('SELECT * FROM players ORDER BY score DESC').all();
  }

  // === 对局 ===

  insertRound(winner, durationSec) {
    return this.db.prepare(
      'INSERT INTO rounds (winner, duration_sec, created_at) VALUES (?, ?, ?)'
    ).run(winner, durationSec, Date.now());
  }

  insertRoundPlayer(roundId, playerId, team, kills, damageDealt, giftValue) {
    this.db.prepare(`
      INSERT INTO round_players (round_id, player_id, team, kills, damage_dealt, gift_value)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(roundId, playerId, team, kills, damageDealt, giftValue);
  }

  // === 工具 ===

  close() {
    this.db.close();
  }
}

module.exports = DB;
