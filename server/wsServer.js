/**
 * WebSocket 服务
 *
 * 职责: 维护前端连接池，推送游戏状态，接收前端事件
 */

const { WebSocketServer } = require('ws');

/** @type {Set<import('ws').WebSocket>} */
const clients = new Set();

/**
 * 启动 WebSocket 服务
 * @param {number} port
 */
function startWSServer(port) {
  const wss = new WebSocketServer({ port });

  wss.on('listening', () => {
    console.log('[WS] Listening on port', port);
  });

  wss.on('connection', (ws) => {
    console.log('[WS] Client connected. Total:', clients.size + 1);
    clients.add(ws);

    ws.on('close', () => {
      clients.delete(ws);
      console.log('[WS] Client disconnected. Total:', clients.size);
    });

    ws.on('error', (err) => {
      console.error('[WS] Client error:', err.message);
      clients.delete(ws);
    });

    // 前端发来的消息（暂不处理，预留）
    ws.on('message', (data) => {
      try {
        const msg = JSON.parse(data.toString());
        console.log('[WS] Received from client:', msg);
      } catch (e) {
        // 忽略非 JSON 消息
      }
    });
  });

  console.log('[WS] Server started');
}

/**
 * 推送游戏状态到所有前端客户端
 * @param {object} state - 游戏状态对象
 */
function broadcast(state) {
  const payload = JSON.stringify(state);
  for (const ws of clients) {
    if (ws.readyState === ws.OPEN) {
      ws.send(payload);
    }
  }
}

module.exports = { startWSServer, broadcast };
