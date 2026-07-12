/**
 * B站弹幕适配器（开发调试用）
 *
 * B站开放协议: https://open-live.bilibili.com/
 * 需要: ACCESS_KEY_ID + ACCESS_KEY_SECRET
 *
 * 开发期用这个调试游戏逻辑，跑通后切抖音。
 */

const WebSocket = require('ws');

class BilibiliAdapter {
  constructor(roomId) {
    this.roomId = roomId;
    this.ws = null;
    /** @type {Function|null} 弹幕回调 */
    this.onDanmaku = null;
    /** @type {Function|null} 礼物回调 */
    this.onGift = null;
  }

  /** 连接 B站直播间 */
  async connect() {
    // TODO: Phase 1 实现
    // 1. 获取 ws 地址 (POST https://live-open.biliapi.com/v2/app/start)
    // 2. 连接 WebSocket
    // 3. 解析 protobuf 消息（弹幕/礼物）
    // 4. 调用 this.onDanmaku / this.onGift
    console.log('[Bilibili] Adapter connecting to room:', this.roomId);
    console.log('[Bilibili] (stub — implement in Phase 1)');
  }

  /** 断开连接 */
  disconnect() {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }
}

module.exports = { BilibiliAdapter };
