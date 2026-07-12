/**
 * war-danmaku 游戏服务器入口
 *
 * 启动: node server/index.js
 * WebSocket: ws://localhost:8765
 */

const { startWSServer } = require('./wsServer');
const { GameEngine } = require('./gameEngine');
const config = require('./config');

console.log('[Server] Starting war-danmaku...');
console.log('[Server] Config:', JSON.stringify({ port: config.WS_PORT, roundTime: config.ROUND_TIME }, null, 2));

// 启动 WebSocket 服务
startWSServer(config.WS_PORT);

// 启动游戏引擎
const engine = new GameEngine(config);
engine.start();

console.log('[Server] Ready. WebSocket on ws://localhost:' + config.WS_PORT);
console.log('[Server] Open http://localhost:3000 in browser for game view');

// 优雅退出
process.on('SIGINT', () => {
  console.log('\n[Server] Shutting down...');
  engine.stop();
  process.exit(0);
});
