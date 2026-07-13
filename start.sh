#!/bin/bash
# war-danmaku 一键启动
# 用法: bash start.sh

cleanup() {
  echo ""
  echo "正在关闭..."
  [ -n "$SERVER_PID" ] && kill $SERVER_PID 2>/dev/null
  [ -n "$RELAY_PID" ] && kill $RELAY_PID 2>/dev/null
  echo "已关闭"
  exit 0
}
trap cleanup SIGINT SIGTERM

echo "=== war-danmaku ==="

# 杀旧进程
for port in 8765 8766; do
  pid=$(netstat -ano 2>/dev/null | grep ":$port " | grep LISTENING | awk '{print $NF}' | head -1)
  if [ -n "$pid" ]; then
    cmd //c "taskkill /F /PID $pid" 2>/dev/null
    echo "[OK] 释放端口 $port"
  fi
done
sleep 1

# 启动游戏服务端
node server/index.js &
SERVER_PID=$!
echo "[OK] 游戏服务端 ws://localhost:8765"

# 如果配置了 B站直播间，启动弹幕中继
ROOM_ID=$(node -e "try{console.log(require('./server/secrets.json').bilibili.roomId||0)}catch(e){console.log(0)}")
if [ "$ROOM_ID" != "0" ] && [ -n "$ROOM_ID" ]; then
  sleep 2
  python server/danmaku/bilibili-relay.py &
  RELAY_PID=$!
  echo "[OK] B站弹幕中继 → 直播间 $ROOM_ID"
else
  echo "[INFO] 未配置 B站直播间，弹幕中继跳过"
fi

echo ""
echo "浏览器 http://localhost:8765"
echo "Ctrl+C 关闭全部"
echo ""

wait
