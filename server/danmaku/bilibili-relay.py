"""
B站直播弹幕中继 — 把 B站弹幕/礼物转发到游戏服务器。

用法: python server/danmaku/bilibili-relay.py
依赖: pip install git+https://github.com/xfgryujk/blivedm.git websocket-client aiohttp
配置: server/secrets.json → bilibili.{roomId, cookie}
"""

import json
import os
import sys
import time
import threading
import asyncio
import logging
from logging.handlers import RotatingFileHandler
import websocket
import aiohttp

# ====== 日志 ======
LOG_DIR = os.path.join(os.path.dirname(os.path.dirname(__file__)), 'logs')
os.makedirs(LOG_DIR, exist_ok=True)

logger = logging.getLogger('bilibili-relay')
logger.setLevel(logging.INFO)

fh = RotatingFileHandler(
    os.path.join(LOG_DIR, 'bilibili-relay.log'),
    maxBytes=5 * 1024 * 1024, backupCount=3, encoding='utf-8'
)
fh.setFormatter(logging.Formatter('%(asctime)s [%(levelname)s] %(message)s'))
logger.addHandler(fh)

# 终端也输出
ch = logging.StreamHandler(sys.stdout)
ch.setFormatter(logging.Formatter('%(asctime)s [%(levelname)s] %(message)s', datefmt='%H:%M:%S'))
logger.addHandler(ch)

from blivedm import BLiveClient, BaseHandler
from blivedm.models.web import DanmakuMessage, GiftMessage, SuperChatMessage, GuardBuyMessage

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
PROJECT_DIR = os.path.dirname(os.path.dirname(SCRIPT_DIR))
SECRETS_PATH = os.path.join(PROJECT_DIR, 'server', 'secrets.json')

# 读配置
with open(SECRETS_PATH, 'r', encoding='utf-8') as f:
    secrets = json.load(f)

bili = secrets.get('bilibili', {})
ROOM_ID = bili.get('roomId', 0)
COOKIE_STR = bili.get('cookie', '')

if not ROOM_ID:
    logger.info("请在 server/secrets.json 的 bilibili.roomId 填写直播间号")
    sys.exit(1)
if not COOKIE_STR:
    logger.info("请复制完整 Cookie 到 server/secrets.json → bilibili.cookie")
    logger.info("获取: F12 → Network → 任意请求 → Request Headers → 复制 Cookie 整行")
    sys.exit(1)

# Cookie 字符串 → 字典
COOKIES = {}
for part in COOKIE_STR.split(';'):
    part = part.strip()
    if '=' in part:
        k, v = part.split('=', 1)
        COOKIES[k.strip()] = v.strip()

GAME_WS_URL = f"ws://localhost:{secrets.get('relayPort', 8766)}"

# ====== 游戏服务器 WS ======
ws = None
ws_lock = threading.Lock()

def connect_game():
    global ws
    for i in range(10):
        try:
            w = websocket.WebSocket()
            w.connect(GAME_WS_URL)
            with ws_lock:
                ws = w
            logger.info(f"已连接游戏服务器 {GAME_WS_URL}")
            return
        except Exception as e:
            logger.info(f"连接游戏服务器 ({i+1}/10): {e}")
            time.sleep(min(2 ** i, 30))
    sys.exit(1)

def send_to_game(msg: dict):
    for _ in range(3):
        try:
            with ws_lock:
                if ws is None:
                    connect_game()
                ws.send(json.dumps(msg, ensure_ascii=False))
            return
        except Exception:
            connect_game()

# ====== B站弹幕处理器 ======
class RelayHandler(BaseHandler):

    def _on_danmaku(self, client: BLiveClient, msg: DanmakuMessage):
        text = (msg.msg or '').strip()
        if not text or len(text) > 50:
            return
        uid = str(msg.uid or 0)
        send_to_game({
            'type': 'danmaku',
            'text': text,
            'playerId': f'bili_{uid}',
            'playerName': msg.uname or f'bili_{uid}',
        })

    def _on_gift(self, client: BLiveClient, msg: GiftMessage):
        uid = str(msg.uid or 0)
        uname = msg.uname or f'bili_{uid}'
        troop = _map_gift(msg)
        if not troop:
            return
        send_to_game({
            'type': 'gift',
            'troopKey': troop,
            'giftId': str(msg.gift_id),
            'playerId': f'bili_{uid}',
            'playerName': uname,
        })

    async def _on_super_chat(self, client: BLiveClient, msg: SuperChatMessage):
        uid = str(msg.uid or 0)
        uname = msg.uname or f'bili_{uid}'
        troop = 'dragonKnight' if msg.price >= 500 else 'giant'
        send_to_game({
            'type': 'gift',
            'troopKey': troop,
            'playerId': f'bili_{uid}',
            'playerName': uname,
        })

    async def _on_buy_guard(self, client: BLiveClient, msg: GuardBuyMessage):
        uid = str(msg.uid or 0)
        uname = msg.username or f'bili_{uid}'
        send_to_game({
            'type': 'gift',
            'troopKey': 'giant',
            'playerId': f'bili_{uid}',
            'playerName': uname,
        })

def _map_gift(gift: GiftMessage):
    """礼物 → 兵种 key"""
    user_map = bili.get('giftMap', {})
    mapped = user_map.get(str(gift.gift_id))
    if mapped:
        return mapped

    price = gift.price or 0
    name = gift.gift_name or ''

    if gift.coin_type == 'silver' or '小心心' in name:
        return 'militia'
    if price >= 1000:
        return 'giant'
    if price >= 500:
        return 'royalGuard'
    if price >= 100:
        return 'knight'
    if price >= 10:
        return 'swordsman'
    return None

# ====== 主入口 ======
async def main():
    logger.info(f"B站弹幕中继 → 直播间 {ROOM_ID}")

    connect_game()

    session = aiohttp.ClientSession(
        timeout=aiohttp.ClientTimeout(total=10),
        cookies=COOKIES,
    )

    client = BLiveClient(ROOM_ID, uid=None, session=session)
    client.set_handler(RelayHandler())

    logger.info("初始化直播间...")
    ok = await client.init_room()
    if ok:
        logger.info(f"连接成功 (uid={client.uid})")
    else:
        logger.info("初始化失败 (Cookie 可能过期)")
        await session.close()
        return

    client.start()
    try:
        await client.join()
    except KeyboardInterrupt:
        pass
    finally:
        await client.stop_and_close()
        await session.close()

if __name__ == '__main__':
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        logger.info("已关闭")
