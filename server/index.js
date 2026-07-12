/**
 * war-danmaku 游戏服务器入口
 *
 * 启动: node server/index.js
 * WebSocket: ws://localhost:8765
 */

const { startWSServer } = require('./wsServer');
const { GameEngine } = require('./gameEngine');
const config = require('./config');
const logger = require('./logger');

// 初始化日志系统
logger.init(config.LOG);

logger.info('SERVER', 'Starting war-danmaku...');
logger.info('SERVER', `Config: port=${config.WS_PORT} roundTime=${config.ROUND_TIME / 1000}s`);

// 启动 WebSocket 服务
startWSServer(config.WS_PORT);

// 启动游戏引擎
const engine = new GameEngine(config);
engine.start();

logger.info('SERVER', `Ready. WebSocket ws://localhost:${config.WS_PORT}`);
logger.info('SERVER', `Logs → ${logger.getSessionPath() || '(terminal only)'}`);

// 优雅退出
process.on('SIGINT', () => {
  logger.info('SERVER', 'Shutting down...');
  engine.stop();
  logger.close();
  process.exit(0);
});
