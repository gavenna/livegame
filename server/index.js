/**
 * war-danmaku 游戏服务器入口
 *
 * 启动: node server/index.js
 * HTTP + WebSocket: http://localhost:8765
 * Relay WebSocket: ws://localhost:8766 (bilibili-relay.py 连这个)
 */

const { startWSServer, startRelayWSS } = require('./wsServer');
const { GameEngine } = require('./gameEngine');
const DB = require('./db');
const config = require('./config');
const logger = require('./logger');
const path = require('path');
const fs = require('fs');

// 确保 data 目录存在
const dataDir = path.resolve(__dirname, '..', 'data');
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

// 初始化日志
logger.init(config.LOG);

logger.info('SERVER', 'Starting war-danmaku...');
logger.info('SERVER', `Config: port=${config.WS_PORT} roundTime=${config.ROUND_TIME / 1000}s`);

// 初始化数据库
const dbPath = path.resolve(__dirname, '..', config.DB_PATH);
const db = new DB(dbPath);
logger.info('SERVER', `DB: ${dbPath}`);

// 启动 WebSocket 服务（前端 + 控制面板）
startWSServer(config.WS_PORT);

// 启动弹幕中继 WebSocket（bilibili-relay.py 连接）
startRelayWSS(config.RELAY_PORT);

// 启动游戏引擎
const engine = new GameEngine(config, db);
engine.start();

logger.info('SERVER', `Ready. HTTP http://localhost:${config.WS_PORT}`);
logger.info('SERVER', `Relay WS ws://localhost:${config.RELAY_PORT}`);
logger.info('SERVER', `Logs → ${logger.getSessionPath() || '(terminal only)'}`);

// 优雅退出
process.on('SIGINT', () => {
  logger.info('SERVER', 'Shutting down...');
  engine.stop();
  db.close();
  logger.close();
  process.exit(0);
});
