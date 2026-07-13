/**
 * 游戏配置 — 所有数值参数集中管理
 *
 * 改数值只改这个文件，不在业务代码里写死。
 * 改完后重启 server 生效。
 */

module.exports = {
  // === 服务器 ===
  WS_PORT: 8765,
  RELAY_PORT: 8766,                 // 弹幕中继 WS 端口（bilibili-relay.py 连这个）
  DB_PATH: 'data/war-danmaku.db',   // SQLite 数据库路径

  // === 游戏循环 ===
  ROUND_TIME: 20 * 60 * 1000,       // 单局最大时长 20分钟（ms）
  PREP_TIME: 30 * 1000,             // 准备阶段 30秒
  SETTLE_TIME: 20 * 1000,           // 结算展示 20秒
  BATTLE_TICK_MS: 100,              // 战斗计算 tick 间隔 100ms (10tps)

  // === 城堡 ===
  CASTLE_HP: 10000,                 // 城堡初始血量

  // === 动态平衡 ===
  BALANCE: {
    OUTNUMBER_RATIO: 2.0,           // 人数差 >2倍触发平衡
    OUTNUMBER_BUFF: 0.3,            // 少数方伤害 +30%
    COMEBACK_THRESHOLD: 0.3,        // 城堡 HP <30% 触发背水一战
    COMEBACK_BUFF: 0.15,            // 劣势方伤害 +15%
    STOMP_TIME: 5 * 60 * 1000,      // 碾压 5分钟触发加速
    STOMP_BUFF: 0.10,               // 优势方伤害 +10%
    // 战斗参数
    COUNTER_MULTIPLIER: 2.0,        // 克制伤害倍率
    PUSH_FACTOR: 0.02,             // 战线推进系数（每点伤害差推进的战线单位）
    COLLISION_RANGE: 60,           // 交战距离 (px)
    SPEED_FACTOR: 3,              // 速度→像素转换 (px/tick per speed unit)
    CASTLE_DMG_PER_TICK: 50,      // 战线到城堡时每 tick 伤害
    FRONTLINE_MAX: 1000,          // 战线最大值（到达城堡）
    MAX_TROOP_AGE: 60 * 1000,     // 兵种最大存活时间 60秒
  },

  // === 兵种定义 ===
  // 每个兵种 = 一个付费档位
  TROOPS: {
    // 免费层
    militia:  { name: '民兵',   damage: 1,   hp: 10,  speed: 1.0, cost: 0,     showAvatar: false, avatarSize: 0,    avatarTime: 0,    counters: [] },
    // 入门层 (~1元)
    swordsman:{ name: '剑士',   damage: 5,   hp: 30,  speed: 1.2, cost: 1,     showAvatar: false, avatarSize: 0,    avatarTime: 0,    counters: ['militia'] },
    knight:   { name: '骑士',   damage: 25,  hp: 80,  speed: 2.0, cost: 5,     showAvatar: false, avatarSize: 0,    avatarTime: 0,    counters: ['swordsman', 'archer'] },
    // 进阶层 (1~10元)
    archer:   { name: '弓手',   damage: 40,  hp: 25,  speed: 1.0, cost: 10,    showAvatar: false, avatarSize: 0,    avatarTime: 0,    ranged: true,  counters: ['knight'] },
    catapult: { name: '投石车', damage: 120, hp: 50,  speed: 0.5, cost: 30,    showAvatar: false, avatarSize: 0,    avatarTime: 0,    aoe: true,     counters: ['archer'] },
    // 核心层 (10~100元) ★ 营收主力
    royalGuard:  { name: '皇家卫队', damage: 200, hp: 200, speed: 1.5, cost: 99,  showAvatar: true,  avatarSize: 'small',  avatarTime: 5000,  counters: ['knight', 'archer'] },
    fireArrow:   { name: '火矢齐射', damage: 500, hp: 0,   speed: 0,   cost: 199, showAvatar: false, avatarSize: 0,       avatarTime: 0,    globalSkill: true, slow: 0.3, slowTime: 8000, counters: [] },
    batteringRam:{ name: '攻城锤',   damage: 1500,hp: 0,   speed: 0,   cost: 299, showAvatar: true,  avatarSize: 'medium', avatarTime: 8000,  siege: true,   counters: [] },
    // 顶级层 (100~500元) ★ 大哥专区
    giant:       { name: '岩石巨人', damage: 2500, hp: 500, speed: 0.8, cost: 520,  showAvatar: true, avatarSize: 'large',  avatarTime: 12000, counters: ['militia', 'swordsman', 'knight', 'archer', 'catapult', 'royalGuard'] },
    dragonKnight:{ name: '龙骑士',   damage: 6000, hp: 1000,speed: 3.0, cost: 1200, showAvatar: true, avatarSize: 'huge',   avatarTime: 3000,  fear: true, fearTime: 3000, counters: ['giant'] },
    wrathOfGod:  { name: '天神之怒', damage: 8000, hp: 0,   speed: 0,   cost: 3000, showAvatar: false,avatarSize: 0,       avatarTime: 0,    globalSkill: true, castleDmg: 0.2, counters: [] },
    // 盲盒
    warChest:    { name: '战争宝箱', damage: 0,   hp: 0,   speed: 0,   cost: 99,  showAvatar: false, avatarSize: 0,       avatarTime: 0,    random: true,  counters: [] },
  },

  // === 盲盒概率 ===
  WAR_CHEST_POOL: ['swordsman', 'catapult', 'royalGuard', 'giant', 'dragonKnight'],
  WAR_CHEST_WEIGHTS: [0.35, 0.30, 0.20, 0.10, 0.05],

  // === 积分 ===
  SCORE: {
    KILL: 10,
    CASTLE_DMG_DIVISOR: 10,         // 对城堡伤害/10 = 积分
    WIN_BONUS: 200,
    MVP_BONUS: 500,
    SVP_BONUS: 300,
    GIFT_MULTIPLIER: 3,             // 礼物价值×3 = 积分
    MULTI_KILL_5: 1.5,
    MULTI_KILL_10: 2.0,
  },

  // === 军衔（段位） ===
  RANKS: [
    { name: '新兵',    minScore: 0 },
    { name: '老兵',    minScore: 500 },
    { name: '十夫长',  minScore: 2000 },
    { name: '百夫长',  minScore: 8000 },
    { name: '千夫长',  minScore: 20000 },
    { name: '将军',    minScore: 50000 },
    { name: '元帅',    minScore: 100000 },
  ],

  // === 弹幕指令 ===
  DANMAKU_COMMANDS: {
    '1': 'join_red',
    '红': 'join_red',
    '炎龙': 'join_red',
    '2': 'join_blue',
    '蓝': 'join_blue',
    '霜狼': 'join_blue',
    '杀': 'spawn_militia_3',
    '666': 'spawn_militia_3',
    '冲': 'speed_boost',
  },

  // === 抖音礼物 ID 映射（待补充实际 ID） ===
  DOUYIN_GIFT_MAP: {
    // 正式上线时填入抖音实际的礼物 ID
    // 格式: '礼物ID': '兵种key'
    // '1': 'swordsman',    // 小❤️
    // '5': 'knight',       // 棒棒糖
    // '10': 'archer',      // 鲜花
    // ...
  },

  // === 日志（开发调试） ===
  LOG: {
    LEVEL: 'DEBUG',           // 全局最低级别: DEBUG | INFO | WARN | ERROR
    TAGS: {
      WS: true,               // WebSocket 连接/消息
      ENGINE: true,           // 游戏状态机
      BATTLE: true,           // 战斗计算（高频，INFO 级；设 'debug' 开启每 tick 细节）
      DANMAKU: true,          // 弹幕处理
      RANKING: true,          // 积分/排行
      GIFT: true,             // 礼物处理
      SERVER: true,           // 服务器启动/关闭
      SIMULATOR: true,        // 模拟器（仅 simulator.js）
    },
    TO_FILE: true,            // 日志写入文件 (server/logs/)
    TO_CONSOLE: true,         // 日志输出终端
  },

  // === 渲染 ===
  CANVAS_WIDTH: 1920,
  CANVAS_HEIGHT: 1080,
  FPS_TARGET: 30,
};
