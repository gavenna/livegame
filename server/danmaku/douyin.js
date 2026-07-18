/**
 * 抖音弹幕适配器 — 可遇AI弹幕工具 → 游戏服务器
 *
 * 架构:
 *   可遇AI (WS Server :12011) ← 本适配器 (WS Client)
 *                                     ↓ EventTranslator
 *                                     ↓ WS Client → :8766 (游戏中继)
 *
 * 用法: node server/danmaku/douyin.js
 * 配置: server/secrets.json → douyin { enabled: true }
 * 文档: docs/技术文档/弹幕对接文档.html
 *
 * 日志: 使用项目统一日志系统，tag=DOUYIN
 *   终端: 搜索 [DOUYIN]
 *   文件: server/logs/session-*.log
 */

const WebSocket = require('ws');
const path = require('path');
const fs = require('fs');

// ====== 路径 ======
const SCRIPT_DIR = __dirname;
const PROJECT_DIR = path.resolve(SCRIPT_DIR, '..', '..');
const SECRETS_PATH = path.join(PROJECT_DIR, 'server', 'secrets.json');
const CONFIG_PATH = path.join(PROJECT_DIR, 'server', 'config.js');

// ====== 加载配置 ======
let secrets;
try {
  secrets = JSON.parse(fs.readFileSync(SECRETS_PATH, 'utf-8'));
} catch (err) {
  console.error('[douyin] 无法读取 secrets.json:', err.message);
  process.exit(1);
}

const douyinCfg = secrets.douyin || {};
const ENABLED = douyinCfg.enabled === true;
const TOOL_WS_URL = douyinCfg.toolWsUrl || 'ws://localhost:12011';
const GAME_WS_URL = `ws://localhost:${secrets.relayPort || 8766}`;

const config = require(CONFIG_PATH);
const DOUYIN_GIFT_MAP = config.DOUYIN_GIFT_MAP || {};
const ADAPTER_CFG = config.DOUYIN_ADAPTER || {};

const logger = require('../logger');

// ====== EventTranslator ======
class EventTranslator {
  constructor() {
    this.giftMap = { ...DOUYIN_GIFT_MAP };
    this.userGiftMap = douyinCfg.giftMap || {};

    // 价格阶梯: 总价(钻石) → 兵种key，从高到低
    this.priceTiers = [
      { min: 3000, troop: 'wrathOfGod' },
      { min: 1200, troop: 'dragonKnight' },
      { min: 520,  troop: 'giant' },
      { min: 299,  troop: 'batteringRam' },
      { min: 199,  troop: 'fireArrow' },
      { min: 99,   troop: 'royalGuard' },
      { min: 30,   troop: 'catapult' },
      { min: 10,   troop: 'archer' },
      { min: 5,    troop: 'knight' },
      { min: 1,    troop: 'swordsman' },
    ];

    // 冷却
    this.likeCooldowns = new Map();
    this.followCooldowns = new Map();
    this.shareCooldowns = new Map();
    this.enterJoins = new Set();
    this.msgCount = 0;
  }

  /**
   * 翻译可遇AI JSON → 游戏消息
   * 协议文档: docs/技术文档/弹幕对接文档.html
   *
   * msgType: 弹幕 | 礼物 | 点赞 | 关注 | 进房 | 分享 | 粉丝团
   */
  translate(raw) {
    if (!raw || typeof raw !== 'object') return [];

    this.msgCount++;
    const msgType = raw.msgType || raw.type || '';

    // 工具握手/状态消息 — 静默跳过
    if (msgType === 'welcome' || msgType === 'heartbeat' || msgType === 'status') return [];
    if (!raw.msgType && raw.type && !raw.uid) return [];

    if (this.msgCount === 1) {
      logger.info(`[DOUYIN] 已收到弹幕数据 (${raw.platform || '?'})`);
    }

    const uid = String(raw.uid || 0);
    const playerId = `douyin_${uid}`;
    const playerName = raw.name || playerId;

    switch (msgType) {
      case '弹幕':
        return this._danmaku(raw, playerId, playerName);

      case '礼物':
        return this._gift(raw, playerId, playerName);

      case '点赞':
        return this._like(raw, playerId, playerName);

      case '关注':
      case '粉丝团':
        return this._follow(raw, playerId, playerName);

      case '进房':
        return this._enter(raw, playerId, playerName);

      case '分享':
        return this._share(raw, playerId, playerName);

      default:
        if (!this._seen) this._seen = {};
        if (!this._seen[msgType]) {
          this._seen[msgType] = true;
          logger.info(`[DOUYIN] 新消息类型: "${msgType}" (platform=${raw.platform})`);
        }
        return [];
    }
  }

  // ---- 各类型翻译 ----

  _danmaku(raw, playerId, playerName) {
    const text = (raw.content || '').trim();
    logger.info(`[DOUYIN] ${playerName}: "${text}"`);
    if (!text || text.length > 50) {
      if (!text) logger.info('[DOUYIN]   → 跳过：内容为空');
      else logger.info(`[DOUYIN]   → 跳过：长度${text.length}>50`);
      return [];
    }
    return [{ type: 'danmaku', text, playerId, playerName }];
  }

  _gift(raw, playerId, playerName) {
    const giftId = String(raw.giftId || '');
    const giftName = raw.giftName || '';
    // diamondCount = 单价，giftCount = 数量，总价 = 单价 × 数量
    const unitPrice = Number(raw.diamondCount || 0);
    const count = Number(raw.giftCount || raw.repeatCount || 1);
    const totalPrice = unitPrice * count;

    logger.info(`[DOUYIN] ${playerName} 送 "${giftName}"(id=${giftId}) 单价${unitPrice}×${count}=${totalPrice}钻`);

    // 查找兵种
    let troop = null;
    if (this.userGiftMap[giftId]) troop = this.userGiftMap[giftId];
    else if (this.giftMap[giftId]) troop = this.giftMap[giftId];
    else if (totalPrice > 0) {
      for (const tier of this.priceTiers) {
        if (totalPrice >= tier.min) { troop = tier.troop; break; }
      }
    }
    // 兜底: 礼物名关键词
    if (!troop && giftName) {
      const n = giftName;
      if (n.includes('小心心') || n.includes('heart')) troop = 'militia';
      else if (n.includes('棒棒糖') || n.includes('lollipop')) troop = 'knight';
      else if (n.includes('鲜花') || n.includes('flower') || n.includes('玫瑰')) troop = 'archer';
      else if (n.includes('城堡') || n.includes('castle')) troop = 'giant';
      else if (n.includes('龙') || n.includes('dragon')) troop = 'dragonKnight';
      else if (n.includes('嘉年华') || n.includes('火箭')) troop = 'wrathOfGod';
    }

    if (!troop) {
      logger.info(`[DOUYIN] 未知礼物: ${giftName}(${giftId}) 单价${unitPrice}×${count}=${totalPrice}`);
      return [];
    }

    logger.info(`[DOUYIN] ${playerName} 送 ${giftName}(id=${giftId}) 单价${unitPrice}×${count}=${totalPrice}钻 → ${troop}`);
    return [{ type: 'gift', troopKey: troop, giftId, playerId, playerName }];
  }

  _like(raw, playerId, playerName) {
    const cdMs = ADAPTER_CFG.LIKE_COOLDOWN_MS || 1000;
    const last = this.likeCooldowns.get(playerId) || 0;
    if (Date.now() - last < cdMs) return [];
    this.likeCooldowns.set(playerId, Date.now());

    const likeCount = raw.count || 0;
    if (likeCount >= 100) {
      return [
        { type: 'danmaku', text: `❤️ ${playerName} 连续点赞×${likeCount}！`, playerId, playerName },
        { type: 'danmaku', text: '杀', playerId, playerName },
      ];
    }
    return [
      { type: 'danmaku', text: `❤️ ${playerName} 点赞`, playerId, playerName },
      { type: 'danmaku', text: '赞', playerId, playerName },
    ];
  }

  _follow(raw, playerId, playerName) {
    const cdMs = 5000;
    const last = this.followCooldowns.get(playerId) || 0;
    if (Date.now() - last < cdMs) return [];
    this.followCooldowns.set(playerId, Date.now());

    const msgs = [{ type: 'danmaku', text: `⭐ ${playerName} 关注了直播间！`, playerId, playerName }];
    const reward = ADAPTER_CFG.FOLLOW_REWARD_TROOP;
    if (reward) {
      for (let i = 0; i < (ADAPTER_CFG.FOLLOW_REWARD_COUNT || 1); i++) {
        msgs.push({ type: 'gift', troopKey: reward, playerId, playerName });
      }
    }
    return msgs;
  }

  _enter(raw, playerId, playerName) {
    if (!ADAPTER_CFG.AUTO_JOIN_ON_ENTER) return [];
    if (this.enterJoins.has(playerId)) return [];
    this.enterJoins.add(playerId);

    const chance = ADAPTER_CFG.ENTER_JOIN_CHANCE || 0;
    if (chance > 0 && Math.random() > chance) return [];

    const team = Math.random() < 0.5 ? 'red' : 'blue';
    logger.info(`[DOUYIN] ${playerName} 进房 → ${team}方 (在线${raw.memberCount || '?'}人)`);
    return [{ type: 'join', team, playerId, playerName }];
  }

  _share(raw, playerId, playerName) {
    const cdMs = 3000;
    const last = this.shareCooldowns.get(playerId) || 0;
    if (Date.now() - last < cdMs) return [];
    this.shareCooldowns.set(playerId, Date.now());
    return [{ type: 'danmaku', text: `🔗 ${playerName} 分享了直播间！`, playerId, playerName }];
  }
}

// ====== GameClient (→ :8766) ======

let gameWs = null;
let gameReconnectTimer = null;
let gameReconnectDelay = 1000;
const MAX_RECONNECT_DELAY = 30000;
let shutdown = false;

function connectGame() {
  if (shutdown) return;
  logger.info(`[DOUYIN] 连接游戏 ${GAME_WS_URL}...`);
  const ws = new WebSocket(GAME_WS_URL);
  ws.on('open', () => { logger.info('[DOUYIN] 已连接'); gameReconnectDelay = 1000; gameWs = ws; });
  ws.on('close', () => {
    logger.warn('[DOUYIN] 断连'); gameWs = null;
    if (!shutdown) {
      clearTimeout(gameReconnectTimer);
      logger.warn(`[DOUYIN] ${gameReconnectDelay}ms 后重连...`);
      gameReconnectTimer = setTimeout(() => {
        connectGame();
        gameReconnectDelay = Math.min(gameReconnectDelay * 2, MAX_RECONNECT_DELAY);
      }, gameReconnectDelay);
    }
  });
  ws.on('error', (err) => { logger.error(`[DOUYIN] ${err.message}`); });
}

function sendToGame(msg) {
  if (!gameWs || gameWs.readyState !== WebSocket.OPEN) { return; }
  try { gameWs.send(JSON.stringify(msg)); } catch (_) {}
}

// ====== ToolClient (可遇AI :12011) ======

let toolWs = null;
let toolReconnectTimer = null;
let toolReconnectDelay = 2000;

function connectTool(url, translator) {
  if (shutdown) return;
  logger.info(`[DOUYIN] 连接可遇AI ${url}...`);
  const ws = new WebSocket(url);
  ws.on('open', () => { logger.info('[DOUYIN] 已连接可遇AI'); toolReconnectDelay = 2000; toolWs = ws; });
  ws.on('message', (raw) => {
    let text;
    try { text = raw.toString(); } catch (_) { return; }
    // 可遇AI 可能一次推送多条 JSON（换行分隔）
    const lines = text.split('\n').filter(l => l.trim());
    for (const line of lines) {
      let parsed;
      try { parsed = JSON.parse(line); } catch (_) { continue; }
      const msgs = translator.translate(parsed);
      for (const msg of msgs) sendToGame(msg);
    }
  });
  ws.on('close', () => {
    logger.warn('[DOUYIN] 可遇AI 断连'); toolWs = null;
    if (!shutdown) {
      clearTimeout(toolReconnectTimer);
      logger.warn(`[DOUYIN] ${toolReconnectDelay}ms 后重连可遇AI...`);
      toolReconnectTimer = setTimeout(() => {
        connectTool(url, translator);
        toolReconnectDelay = Math.min(toolReconnectDelay * 2, MAX_RECONNECT_DELAY);
      }, toolReconnectDelay);
    }
  });
  ws.on('error', (err) => { logger.error(`[DOUYIN] ${err.message}`); });
}

// ====== 主入口 ======

function main() {
  if (!ENABLED) {
    logger.info('[DOUYIN] 适配器未启用，退出');
    process.exit(0);
  }

  logger.info('[DOUYIN] === 抖音弹幕适配器 (可遇AI) ===');
  logger.info(`[DOUYIN] 可遇AI: ${TOOL_WS_URL}`);
  logger.info(`[DOUYIN] 游戏:   ${GAME_WS_URL}`);

  const translator = new EventTranslator();
  connectGame();
  setTimeout(() => connectTool(TOOL_WS_URL, translator), 500);

  process.on('SIGINT', () => {
    logger.info('[DOUYIN] SIGINT，关闭...');
    shutdown = true;
    clearTimeout(gameReconnectTimer);
    clearTimeout(toolReconnectTimer);
    if (gameWs) gameWs.close();
    if (toolWs) toolWs.close();
    setTimeout(() => process.exit(0), 500);
  });
}

main();
