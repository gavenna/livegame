/**
 * douyinLive 测试工具 — 连接本地 douyinLive 服务，dump 消息 JSON
 *
 * 用法:
 *   1. 启动 douyinLive: tools\douyinLive.exe --port 1088
 *   2. 运行本脚本: node server/danmaku/douyin-live-test.js <直播间号>
 *
 * 例: node server/danmaku/douyin-live-test.js 516466932480
 */

const WebSocket = require('ws');

const roomId = process.argv[2];
if (!roomId) {
  console.error('用法: node douyin-live-test.js <直播间号>');
  console.error('例: node douyin-live-test.js 516466932480');
  process.exit(1);
}

const PORT = process.env.DOUYINLIVE_PORT || 1088;
const WS_URL = `ws://127.0.0.1:${PORT}/ws/${roomId}`;

console.log(`=== douyinLive 消息 dump ===`);
console.log(`连接: ${WS_URL}`);
console.log('');

const ws = new WebSocket(WS_URL);

// 统计
const stats = { system: 0, chat: 0, gift: 0, like: 0, member: 0, social: 0, fansclub: 0, other: 0 };
let msgCount = 0;

ws.on('open', () => {
  console.log('已连接，等待消息...\n');
});

ws.on('message', (raw) => {
  let data;
  try { data = JSON.parse(raw.toString()); } catch (_) { return; }

  msgCount++;

  // 系统消息
  if (data.type === 'system') {
    stats.system++;
    console.log(`[系统] event=${data.event} code=${data.code} live=${data.live}`);
    console.log(`  message: ${data.message}`);
    if (data.live_name) console.log(`  主播: ${data.live_name} - ${data.title}`);
    console.log(`  完整: ${JSON.stringify(data).slice(0, 200)}`);
    console.log('');
    return;
  }

  // 业务消息
  const method = data.method || 'unknown';
  switch (method) {
    case 'WebcastChatMessage':
      stats.chat++;
      console.log(`[弹幕 #${stats.chat}] ${data.user?.nickname || '?'}: ${data.content}`);
      break;

    case 'WebcastGiftMessage':
      stats.gift++;
      console.log(`[礼物 #${stats.gift}] ${data.user?.nickname || '?'} 送 ${data.gift?.name || '?'} x${data.gift?.count || 1} (${data.gift?.diamondCount || 0}钻)`);
      break;

    case 'WebcastLikeMessage':
      stats.like++;
      console.log(`[点赞 #${stats.like}] ${data.user?.nickname || '?'} x${data.count || '?'}`);
      break;

    case 'WebcastMemberMessage':
      stats.member++;
      console.log(`[进场 #${stats.member}] ${data.user?.nickname || '?'} (在线: ${data.memberCount || '?'})`);
      break;

    case 'WebcastSocialMessage':
      stats.social++;
      console.log(`[关注 #${stats.social}] ${data.user?.nickname || '?'}`);
      break;

    case 'WebcastFansclubMessage':
      stats.fansclub++;
      console.log(`[粉丝团 #${stats.fansclub}] ${data.user?.nickname || '?'}`);
      break;

    default:
      stats.other++;
      console.log(`[其他 #${stats.other}] method=${method}`);
  }

  // 前 20 条打印完整 JSON
  if (msgCount <= 20) {
    const json = JSON.stringify(data);
    console.log(`  📋 完整JSON (${json.length} chars):`);
    console.log(`  ${json.slice(0, 500)}`);
    if (json.length > 500) console.log(`  ... (截断)`);
  }
  console.log('');
});

ws.on('close', (code, reason) => {
  console.log(`\n连接关闭 code=${code}`);
  console.log('=== 统计 ===');
  console.log(`  系统消息: ${stats.system}`);
  console.log(`  弹幕:     ${stats.chat}`);
  console.log(`  礼物:     ${stats.gift}`);
  console.log(`  点赞:     ${stats.like}`);
  console.log(`  进场:     ${stats.member}`);
  console.log(`  关注:     ${stats.social}`);
  console.log(`  粉丝团:   ${stats.fansclub}`);
  console.log(`  其他:     ${stats.other}`);
  console.log(`  总计:     ${msgCount}`);
  process.exit(0);
});

ws.on('error', (err) => {
  console.error(`连接错误: ${err.message}`);
  console.error('确认 douyinLive 已启动: tools\\douyinLive.exe --port 1088');
  process.exit(1);
});

// 心跳 (每 30s 发 ping)
setInterval(() => {
  if (ws.readyState === WebSocket.OPEN) ws.send('ping');
}, 30000);
