#!/bin/bash
# war-danmaku 一键启动
# 用法: bash start.sh

echo "=== war-danmaku 一键启动 ==="

# 启动服务端
if netstat -ano | grep -q ":8765"; then
  echo "[WARN] 端口 8765 已被占用"
else
  node server/index.js &
  SERVER_PID=$!
  echo "[OK] 游戏服务启动 PID=$SERVER_PID (ws://localhost:8765)"
fi

# 启动前端
if netstat -ano | grep -q ":3000"; then
  echo "[WARN] 端口 3000 已被占用"
else
  npx http-server frontend -p 3000 -c-1 &
  WEB_PID=$!
  echo "[OK] 前端启动 PID=$WEB_PID (http://localhost:3000)"
fi

sleep 2

echo ""
echo "浏览器打开 http://localhost:3000 看画面"
echo ""
echo "=== 输入指令开始玩 ==="
node server/simulator.js
