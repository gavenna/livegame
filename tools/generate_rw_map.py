"""
Rusted Warfare Mission 地图生成器
用法: python tools/generate_rw_map.py
"""

import os, gzip, base64, struct

MAP_W, MAP_H = 60, 60
TILE = 20
RW = "D:/Apps/Steam00/steamapps/common/Rusted Warfare"
MAPS = os.path.join(RW, "mods", "maps")
OUT_DIR = os.path.join(MAPS, "war-danmaku-test")
OUT = os.path.join(OUT_DIR, "war_danmaku_test.tmx")

# === 地形: 全 Short Grass ===
GRASS_COLUMNS = 14
GRASS_TILECOUNT = 130
GRASS_GID = 1  # First tileset

# === 单位 tileset (自定义, firstgid=GRASS_GID+1) ===
# 每个 unit tile = (tile_id, unit_name, team)
UNIT_TILES = [
    # Team 0 (Red)
    (0,  "commandCenter", 0),
    (1,  "builder", 0),
    (2,  "tank", 0),
    (3,  "artillery", 0),
    (4,  "turret", 0),
    (5,  "heavyTank", 0),
    (6,  "fabricator", 0),
    # Team 1 (Blue)
    (7,  "commandCenter", 1),
    (8,  "builder", 1),
    (9,  "tank", 1),
    (10, "artillery", 1),
    (11, "turret", 1),
    (12, "heavyTank", 1),
    (13, "fabricator", 1),
]
UNIT_FIRSTGID = GRASS_GID + 1  # = 2
UNIT_TILECOUNT = len(UNIT_TILES)

def gid(tile_id):
    """tile_id -> global GID"""
    return UNIT_FIRSTGID + tile_id

# === 单位部署 ===
PLACEMENTS = [
    # Red base (top-left)
    (3,  3,  gid(0)),   # commandCenter
    (6,  3,  gid(1)),   # builder
    (8,  5,  gid(2)),   # tank
    (10, 3,  gid(2)),   # tank
    (12, 5,  gid(3)),   # artillery
    (5,  7,  gid(4)),   # turret
    (7,  8,  gid(4)),   # turret
    (5,  10, gid(6)),   # fabricator

    # Blue base (bottom-right)
    (56, 56, gid(7)),   # commandCenter
    (53, 56, gid(8)),   # builder
    (51, 54, gid(9)),   # tank
    (49, 56, gid(9)),   # tank
    (47, 54, gid(10)),  # artillery
    (54, 52, gid(11)),  # turret
    (52, 51, gid(11)),  # turret
    (54, 49, gid(13)),  # fabricator
]

def compress_layer(placements):
    buf = bytearray(MAP_W * MAP_H * 4)
    for x, y, gid in placements:
        struct.pack_into('<I', buf, (y * MAP_W + x) * 4, gid)
    return base64.b64encode(gzip.compress(bytes(buf))).decode()

def build_tmx():
    # 全草地
    grass = [(x, y, GRASS_GID) for y in range(MAP_H) for x in range(MAP_W)]

    # 单位 tileset
    unit_tiles_xml = ""
    for tid, name, team in UNIT_TILES:
        unit_tiles_xml += f'''
  <tile id="{tid}">
   <properties>
    <property name="team" value="{team}"/>
    <property name="unit" value="{name}"/>
   </properties>
  </tile>'''

    img_w = 20 * UNIT_TILECOUNT
    tmx = f'''<?xml version="1.0" encoding="UTF-8"?>
<map version="1.10" orientation="orthogonal" renderorder="right-down"
 width="{MAP_W}" height="{MAP_H}" tilewidth="{TILE}" tileheight="{TILE}" nextobjectid="4">

 <!-- Terrain: Short Grass -->
 <tileset firstgid="{GRASS_GID}" name="Short Grass" tilewidth="20" tileheight="20"
  tilecount="{GRASS_TILECOUNT}" columns="{GRASS_COLUMNS}">
  <image source="../terrain/bitmaps/shortgrass.png"/>
 </tileset>

 <!-- Custom Unit Tileset -->
 <tileset firstgid="{UNIT_FIRSTGID}" name="war-danmaku-units" tilewidth="20" tileheight="20"
  tilecount="{UNIT_TILECOUNT}" columns="{UNIT_TILECOUNT}">
  <image source="../terrain/bitmaps/shortgrass.png"/>
  {unit_tiles_xml}
 </tileset>

 <!-- Ground Layer -->
 <layer name="Ground" width="{MAP_W}" height="{MAP_H}">
  <data encoding="base64" compression="gzip">
   {compress_layer(grass)}
  </data>
 </layer>

 <!-- Units Layer -->
 <layer name="Units" width="{MAP_W}" height="{MAP_H}" opacity="0.8">
  <data encoding="base64" compression="gzip">
   {compress_layer(PLACEMENTS)}
  </data>
 </layer>

 <!-- Mission Info -->
 <objectgroup name="Triggers">
  <object id="1" name="map_info" x="40" y="40" width="200" height="120">
   <properties>
    <property name="type" value="mission"/>
    <property name="missionName" value="War Danmaku Test"/>
    <property name="missionDescription" value="Red (top-left) vs Blue (bottom-right)"/>
   </properties>
  </object>
  <object id="2" name="team_0_info" type="team_info" x="80" y="80" width="160" height="140">
   <properties>
    <property name="team" value="0"/>
   </properties>
  </object>
  <object id="3" name="team_1_info" type="team_info" x="1080" y="1080" width="160" height="140">
   <properties>
    <property name="team" value="1"/>
   </properties>
  </object>
 </objectgroup>
</map>'''
    return tmx

if __name__ == '__main__':
    os.makedirs(OUT_DIR, exist_ok=True)
    with open(OUT, 'w', encoding='utf-8') as f:
        f.write(build_tmx())
    print(f"OK -> {OUT}")
    print(f"  Size: {MAP_W*TILE}x{MAP_H*TILE}px")
    print(f"  Units: {len(PLACEMENTS)} placed ({len([p for p in PLACEMENTS if p[2] <= gid(6)])} red, {len([p for p in PLACEMENTS if p[2] > gid(6)])} blue)")
    print(f"\nTest: Open RW -> Single Player -> Custom Maps -> war-danmaku-test")
