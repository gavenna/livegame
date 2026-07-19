/**
 * 日志模块 — Pino 封装
 *
 * 用法:
 *   const logger = require('./logger');
 *   logger.info('Client connected. Total: %d', count);
 *   logger.debug('Tick frontLine=%d', fl);
 *   logger.warn('Gift ignored: not PLAYING');
 *   logger.error('Client error: %s', err.message);
 *
 *   需要模块标识时:
 *   const log = logger.child({ module: 'wsServer' });
 *   log.info('Client connected');
 *
 * 配置:
 *   LOG_LEVEL=debug → 覆盖日志级别（默认 debug）
 *
 * 输出（双写，始终启用）:
 *   终端: pino-pretty 人眼可读格式
 *   文件: server/logs/combined.log（JSON，事后 grep/排查用）
 */

const pino = require('pino');
const path = require('path');

// Windows 控制台默认 GBK，Pino 输出 UTF-8，必须统一编码
if (process.platform === 'win32') {
  const { stdout, stderr } = process;
  if (stdout.setDefaultEncoding) stdout.setDefaultEncoding('utf8');
  if (stderr.setDefaultEncoding) stderr.setDefaultEncoding('utf8');
}

const level = process.env.LOG_LEVEL || 'debug';

const logger = pino({
  level,
  timestamp: pino.stdTimeFunctions.isoTime,
}, pino.transport({
  targets: [
    { target: 'pino-pretty', level, options: { colorize: false, translateTime: 'yyyy-mm-dd HH:MM:ss', ignore: 'pid,hostname' } },
    { target: 'pino/file', level, options: { destination: path.join(__dirname, 'logs', 'combined.log'), mkdir: true } },
  ],
}));

module.exports = logger;
