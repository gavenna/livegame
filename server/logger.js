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
 *   NODE_ENV=production  → JSON 格式写文件 + 错误单独文件
 *   其他                  → pino-pretty 彩色输出到终端
 *   LOG_LEVEL=debug       → 覆盖日志级别
 */

const pino = require('pino');
const path = require('path');

// Windows 控制台默认 GBK，Pino 输出 UTF-8，必须统一编码
if (process.platform === 'win32') {
  const { stdout, stderr } = process;
  if (stdout.setDefaultEncoding) stdout.setDefaultEncoding('utf8');
  if (stderr.setDefaultEncoding) stderr.setDefaultEncoding('utf8');
}

const isProd = process.env.NODE_ENV === 'production';
const level = process.env.LOG_LEVEL || (isProd ? 'info' : 'debug');

const logger = pino({
  level,
  timestamp: pino.stdTimeFunctions.isoTime,
}, pino.transport({
  targets: isProd
    ? [
        { target: 'pino/file', level: 'info', options: { destination: path.join(__dirname, 'logs', 'combined.log'), mkdir: true } },
        { target: 'pino/file', level: 'error', options: { destination: path.join(__dirname, 'logs', 'error.log'), mkdir: true } },
      ]
    : [{ target: 'pino-pretty', options: { colorize: false, translateTime: 'yyyy-mm-dd HH:MM:ss', ignore: 'pid,hostname' } }],
}));

module.exports = logger;
