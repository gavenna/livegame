/**
 * 抖音弹幕适配器 — douyinLive 代理 → 游戏服务器
 *
 * 架构:
 *   douyinLive.exe (WS Proxy :1088) ← 本适配器 (WS Client)
 *                                          ↓ EventTranslator
 *                                          ↓ WS Client → :8766 (游戏中继)
 *
 * 用法: node server/danmaku/douyin.js
 * 配置: server/secrets.json → douyin { enabled, roomId, proxyUrl }
 * 依赖: tools/douyinLive.exe 需先启动 (start.ps1 自动处理)
 *
 * 日志: 使用项目统一日志系统，tag=DOUYIN
 *   终端: 搜索 [DOUYIN]
 *   文件: server/logs/combined.log
 */

const WebSocket = require('ws');
const path = require('path');
const fs = require('fs');

// ====== 路径 ======
// SEA 模式: __dirname = exe目录(项目根)。普通模式: __dirname = server/danmaku/
const baseDir = __dirname.endsWith(`server${path.sep}danmaku`) ? path.resolve(__dirname, '..', '..') : __dirname;
const SECRETS_PATH = path.join(baseDir, 'server', 'secrets.json');

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
const ROOM_ID = douyinCfg.roomId || '';
const PROXY_WS_URL = douyinCfg.proxyUrl || 'ws://localhost:1088';
const GAME_WS_URL = `ws://localhost:${secrets.relayPort || 8766}`;

const config = require('../config');
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
    return [{ type: 'gift', troopKey: troop, giftId, giftName: giftName || '', playerId, playerName }];
  }

  _like(raw, playerId, playerName) {
    const cdMs = ADAPTER_CFG.LIKE_COOLDOWN_MS || 1000;
    const last = this.likeCooldowns.get(playerId) || 0;
    if (Date.now() - last < cdMs) return [];
    this.likeCooldowns.set(playerId, Date.now());

    const likeCount = raw.count || 0;
    const name = playerName || playerId;
    if (likeCount >= 100) {
      return [{ type: 'danmaku', text: '杀', playerId, playerName,
        displayText: `感谢 ${name} 的 ${likeCount} 连赞！⚔ 民兵前来助阵` }];
    }
    return [{ type: 'danmaku', text: '赞', playerId, playerName,
      displayText: `感谢 ${name} 的点赞！⚔ 民兵前来助阵` }];
  }

  _follow(raw, playerId, playerName) {
    const cdMs = 5000;
    const last = this.followCooldowns.get(playerId) || 0;
    if (Date.now() - last < cdMs) return [];
    this.followCooldowns.set(playerId, Date.now());

    const msgs = [{ type: 'danmaku', text: `⭐ ${playerName} 关注了直播间！`, playerId, playerName,
      displayText: `⭐ ${playerName || playerId} 关注了直播间！` }];
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
    return [{ type: 'danmaku', text: `🔗 ${playerName} 分享了直播间！`, playerId, playerName,
      displayText: `🔗 ${playerName || playerId} 分享了直播间！` }];
  }
}

// ====== 共享状态 ======

let translator = null;

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
  if (!gameWs || gameWs.readyState !== WebSocket.OPEN) { logger.warn('[DOUYIN] sendToGame 丢弃: gameWs 未连接'); return; }
  try { gameWs.send(JSON.stringify(msg)); } catch (_) { logger.error('[DOUYIN] sendToGame 失败'); }
}

// ====== douyinLive 格式 → 可遇AI 格式映射 ======

function douyinLiveToLegacy(data) {
  // 系统消息 — 仅日志
  if (data.type === 'system') {
    const ev = data.event;
    if (ev === 'live_status') {
      if (data.live) {
        logger.info(`[DOUYIN] 直播间已开播: ${data.live_name || '?'} - ${data.title || ''}`);
      } else {
        logger.info(`[DOUYIN] 直播间未开播: ${data.message} (${data.status})`);
      }
    }
    return null;
  }

  const methodMap = {
    'WebcastChatMessage': '弹幕',
    'WebcastGiftMessage': '礼物',
    'WebcastLikeMessage': '点赞',
    'WebcastMemberMessage': '进房',
    'WebcastSocialMessage': '关注',
    'WebcastFansclubMessage': '粉丝团',
  };

  const msgType = methodMap[data.method];
  if (!msgType) return null;

  const user = data.user || {};
  const gift = data.gift || {};

  return {
    msgType,
    uid: user.id || '',
    name: user.nickname || '',
    content: data.content || '',
    giftId: String(gift.id || ''),
    giftName: gift.name || '',
    diamondCount: gift.diamondCount || 0,
    giftCount: gift.count || data.count || 1,
    count: data.count || 0,
    memberCount: data.memberCount || 0,
    platform: 'douyin',
    timestamp: Date.now(),
  };
}

// ====== ProxyClient (douyinLive :1088) ======

let proxyWs = null;
let proxyReconnectTimer = null;
let proxyReconnectDelay = 2000;

function connectProxy() {
  if (shutdown) return;
  if (!ROOM_ID) {
    logger.error('[DOUYIN] roomId 未配置，请在 server/secrets.json → douyin.roomId 填入直播间号');
    return;
  }

  const wsUrl = `${PROXY_WS_URL}/ws/${ROOM_ID}`;
  logger.info(`[DOUYIN] 连接 douyinLive ${wsUrl}...`);
  const ws = new WebSocket(wsUrl);
  ws.on('open', () => {
    logger.info('[DOUYIN] 已连接 douyinLive');
    proxyReconnectDelay = 2000;
    proxyWs = ws;
  });
  ws.on('message', (raw) => {
    let text;
    try { text = raw.toString(); } catch (_) { return; }
    let data;
    try { data = JSON.parse(text); } catch (_) { return; }

    const method = data.method || data.type || '?';
    const legacy = douyinLiveToLegacy(data);
    if (!legacy) {
      // 非弹幕/礼物消息（点赞/进房/关注等）
      if (method !== 'system' && method !== 'ping' && method !== 'pong') {
        logger.debug(`[DOUYIN] 跳过消息: method=${method} type=${data.type || '?'}`);
      }
      return;
    }

    logger.info(`[DOUYIN] 已收到弹幕数据 (douyin)`);
    logger.info(`[DOUYIN] ${legacy.name}: "${legacy.content}"`);
    const msgs = translator.translate(legacy);
    for (const msg of msgs) sendToGame(msg);
  });
  ws.on('close', () => {
    logger.warn('[DOUYIN] douyinLive 断连');
    proxyWs = null;
    if (!shutdown) {
      clearTimeout(proxyReconnectTimer);
      logger.warn(`[DOUYIN] ${proxyReconnectDelay}ms 后重连...`);
      proxyReconnectTimer = setTimeout(() => {
        connectProxy();
        proxyReconnectDelay = Math.min(proxyReconnectDelay * 2, MAX_RECONNECT_DELAY);
      }, proxyReconnectDelay);
    }
  });
  ws.on('error', (err) => { logger.error(`[DOUYIN] ${err.message}`); });
}

// 心跳 (douyinLive 要求客户端发 ping)
let proxyPingTimer = null;
function startPing() {
  proxyPingTimer = setInterval(() => {
    if (proxyWs && proxyWs.readyState === WebSocket.OPEN) {
      proxyWs.send('ping');
    }
  }, 30000);
}

// ====== 主入口 ======

let _running = false;

function start() {
  if (_running) { logger.info('[DOUYIN] 已在运行中'); return; }
  if (!ENABLED) {
    logger.info('[DOUYIN] 适配器未启用');
    return;
  }
  if (!ROOM_ID) {
    logger.error('[DOUYIN] roomId 未配置，请在 server/secrets.json → douyin.roomId 填入直播间号');
    return;
  }

  _running = true;
  shutdown = false;
  logger.info('[DOUYIN] === 抖音弹幕适配器 (douyinLive) ===');
  logger.info(`[DOUYIN] 直播间: ${ROOM_ID}`);
  logger.info(`[DOUYIN] 代理:   ${PROXY_WS_URL}`);
  logger.info(`[DOUYIN] 游戏:   ${GAME_WS_URL}`);

  translator = new EventTranslator();
  connectGame();
  startPing();
  setTimeout(() => connectProxy(), 500);
}

function stop() {
  logger.info('[DOUYIN] 停止适配器...');
  shutdown = true;
  _running = false;
  clearTimeout(gameReconnectTimer);
  clearTimeout(proxyReconnectTimer);
  if (proxyPingTimer) clearInterval(proxyPingTimer);
  if (gameWs) { try { gameWs.close(); } catch (e) {} gameWs = null; }
  if (proxyWs) { try { proxyWs.close(); } catch (e) {} proxyWs = null; }
  logger.info('[DOUYIN] 已停止');
}

function isRunning() { return _running; }

module.exports = { start, stop, isRunning };

if (require.main === module) start();
