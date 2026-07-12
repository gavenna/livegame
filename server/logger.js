/**
 * 日志模块 — 分类、分级、开关控制、双输出（终端 + 文件）
 *
 * 用法:
 *   const logger = require('./logger');
 *   logger.info('WS', 'Client connected. Total: %d', count);
 *   logger.debug('BATTLE', 'Tick frontLine=%d', fl);
 *   logger.warn('ENGINE', 'Gift ignored: not PLAYING');
 *   logger.error('WS', 'Client error: %s', err.message);
 *
 * 配置在 config.js → LOG 块，启动时由 index.js 调用 logger.init(cfg.LOG)
 */

const fs = require('fs');
const path = require('path');

const LEVELS = { DEBUG: 0, INFO: 1, WARN: 2, ERROR: 3 };
const LEVEL_NAMES = ['DEBUG', 'INFO', 'WARN', 'ERROR'];

/** @type {{ level: number, tags: Record<string,boolean>, toFile: boolean, toConsole: boolean }} */
let config = {
  level: LEVELS.DEBUG,
  tags: {},
  toFile: true,
  toConsole: true,
};

/** @type {fs.WriteStream|null} */
let sessionStream = null;
let errorStream = null;
let sessionPath = '';

function init(cfg) {
  if (!cfg) return;

  // 全局级别
  if (cfg.LEVEL && LEVELS[cfg.LEVEL] !== undefined) {
    config.level = LEVELS[cfg.LEVEL];
  }

  // 标签开关
  if (cfg.TAGS) {
    config.tags = { ...cfg.TAGS };
  }

  config.toFile = cfg.TO_FILE !== false;
  config.toConsole = cfg.TO_CONSOLE !== false;

  // 创建日志目录 + 文件
  if (config.toFile) {
    const logsDir = path.join(__dirname, 'logs');
    if (!fs.existsSync(logsDir)) {
      fs.mkdirSync(logsDir, { recursive: true });
    }

    const now = new Date();
    const ts = now.toISOString().replace(/[:.]/g, '-').slice(0, 19);
    sessionPath = path.join(logsDir, `session-${ts}.log`);
    sessionStream = fs.createWriteStream(sessionPath, { flags: 'a' });

    const errorPath = path.join(logsDir, 'error.log');
    errorStream = fs.createWriteStream(errorPath, { flags: 'a' });
  }
}

function format(level, tag, msg) {
  const now = new Date();
  const ts = now.toISOString().replace('T', ' ').slice(0, 23); // "2026-07-12 14:30:05.123"
  return `[${ts}] [${LEVEL_NAMES[level]}] [${tag}] ${msg}`;
}

function log(level, tag, msg) {
  // 检查该 tag 是否启用
  if (config.tags[tag] === false) return;
  if (config.tags[tag] === 'debug' && level === LEVELS.DEBUG) {
    // 该 tag 设为 'debug' 时忽略 DEBUG 日志
    return;
  }
  if (level < config.level) return;

  const line = format(level, tag, msg);

  // 终端输出
  if (config.toConsole) {
    if (level >= LEVELS.WARN) {
      process.stderr.write(line + '\n');
    } else {
      process.stdout.write(line + '\n');
    }
  }

  // 文件输出
  if (config.toFile && sessionStream) {
    sessionStream.write(line + '\n');
  }

  // ERROR 双写到 error.log
  if (level >= LEVELS.ERROR && config.toFile && errorStream) {
    errorStream.write(line + '\n');
  }
}

/** DEBUG — 调试细节 */
function debug(tag, msg) { log(LEVELS.DEBUG, tag, msg); }

/** INFO — 常规流程 */
function info(tag, msg) { log(LEVELS.INFO, tag, msg); }

/** WARN — 异常但不致命 */
function warn(tag, msg) { log(LEVELS.WARN, tag, msg); }

/** ERROR — 错误，必须关注 */
function error(tag, msg) { log(LEVELS.ERROR, tag, msg); }

/** 获取当前日志文件路径（供外部诊断用） */
function getSessionPath() { return sessionPath; }

/** 获取错误日志路径 */
function getErrorPath() {
  if (errorStream) return path.join(__dirname, 'logs', 'error.log');
  return null;
}

/** 刷新并关闭日志流 */
function close() {
  if (sessionStream) { sessionStream.end(); sessionStream = null; }
  if (errorStream) { errorStream.end(); errorStream = null; }
}

module.exports = { init, debug, info, warn, error, getSessionPath, getErrorPath, close, LEVELS };
