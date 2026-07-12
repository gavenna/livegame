/**
 * WebSocket 服务
 *
 * 职责: 维护前端连接池，推送游戏状态，接收前端事件 & 模拟器指令
 */

const { WebSocketServer } = require('ws');
const logger = require('./logger');
const assert = require('./assert');

/** @type {Set<import('ws').WebSocket>} */
const clients = new Set();

/** @type {Map<string, import('ws').WebSocket>} 按 playerId 索引的连接 */
const playerConns = new Map();

/** 消息处理回调（由 GameEngine 注册） */
let messageHandler = null;

/**
 * 注册消息处理回调
 * @param {(msg: object, ws: import('ws').WebSocket) => void} handler
 */
function onMessage(handler) {
  messageHandler = handler;
}

/**
 * 启动 WebSocket 服务
 * @param {number} port
 */
function startWSServer(port) {
  const wss = new WebSocketServer({ port });

  wss.on('listening', () => {
    logger.info('WS', `Listening on port ${port}`);
  });

  wss.on('connection', (ws) => {
    logger.info('WS', `Client connected. Total: ${clients.size + 1}`);
    clients.add(ws);

    ws.on('close', () => {
      clients.delete(ws);
      for (const [pid, conn] of playerConns) {
        if (conn === ws) { playerConns.delete(pid); break; }
      }
      logger.info('WS', `Client disconnected. Total: ${clients.size}`);
    });

    ws.on('error', (err) => {
      logger.error('WS', `Client error: ${err.message}`);
      clients.delete(ws);
    });

    ws.on('message', (data) => {
      try {
        const msg = JSON.parse(data.toString());
        assert.assert(!!msg.type, 'WS 消息缺少 type 字段');

        if (assert.knownMsgType(msg.type)) {
          logger.debug('WS', `Received: type=${msg.type} player=${msg.playerId || '?'}`);
        }

        // 记录 playerId → ws 映射
        if (msg.playerId) {
          playerConns.set(msg.playerId, ws);
        }

        // 路由到游戏引擎
        if (messageHandler) {
          messageHandler(msg, ws);
        }
      } catch (e) {
        if (e.name === 'AssertionError') throw e; // 断言错误上抛
        logger.error('WS', `Invalid message: ${e.message}`);
      }
    });
  });

  logger.info('WS', 'Server started');
}

/**
 * 推送游戏状态到所有前端客户端
 * @param {object} state - 游戏状态对象
 */
function broadcast(state) {
  assert.assert(state && state.type, 'broadcast: state 缺失 type 字段');

  const payload = JSON.stringify(state);
  for (const ws of clients) {
    if (ws.readyState === ws.OPEN) {
      ws.send(payload);
    }
  }
}

/**
 * 发送消息到特定玩家
 * @param {string} playerId
 * @param {object} msg
 */
function sendToPlayer(playerId, msg) {
  const ws = playerConns.get(playerId);
  if (ws && ws.readyState === ws.OPEN) {
    ws.send(JSON.stringify(msg));
  }
}

module.exports = { startWSServer, broadcast, onMessage, sendToPlayer };
