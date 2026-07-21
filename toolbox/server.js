/**
 * war-danmaku 工具箱 — 本地管理服务器
 */

const http = require('http');
const fs = require('fs');
const path = require('path');
const { spawn, execSync } = require('child_process');

const PORT = 8760;
const BASE_DIR = path.resolve(__dirname, '..');
const TOOLBOX_DIR = __dirname;
const LOG_DIR = path.join(BASE_DIR, 'server', 'logs');
try { fs.mkdirSync(LOG_DIR, { recursive: true }); } catch (e) {}
const LOG_FILE = path.join(LOG_DIR, 'toolbox.log');

// 内存日志环缓冲（供前端实时拉取）
const LOG_RING = [];
const LOG_RING_MAX = 500;
let logSeq = 0;

function log(level, msg) {
  const ts = new Date().toISOString().replace('T', ' ').substring(0, 19);
  const line = `[${ts}] [${level}] ${msg}`;
  console.log(line);
  try { fs.appendFileSync(LOG_FILE, line + '\n'); } catch (e) {}
  // 只把重要日志放进前端展示的环形缓冲（过滤轮询噪音）
  if (level !== 'DEBUG') {
    LOG_RING.push({ seq: ++logSeq, ts, level, msg });
    if (LOG_RING.length > LOG_RING_MAX) LOG_RING.shift();
  }
}

const MIME = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css',
  '.js': 'application/javascript', '.png': 'image/png',
  '.mp3': 'audio/mpeg', '.wav': 'audio/wav', '.svg': 'image/svg+xml',
};

function serveStatic(req, res, rootDir) {
  const url = new URL(req.url, 'http://localhost');
  let fp = path.join(rootDir, url.pathname === '/' ? '/index.html' : url.pathname);
  if (!fs.existsSync(fp) || fs.statSync(fp).isDirectory()) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { 'Content-Type': MIME[path.extname(fp)] || 'application/octet-stream' });
  fs.createReadStream(fp).pipe(res);
}

// === 进程管理 ===
let gameProc = null, douyinProc = null, douyinAdapterProc = null;

function getExePath(name) {
  for (const c of [path.join(BASE_DIR, name), path.join(BASE_DIR, 'tools', name)])
    if (fs.existsSync(c)) return c;
  return null;
}
function isRunning(p) { return p && p.exitCode === null; }
function killProc(p) {
  if (!p || p.exitCode !== null) return;
  try { execSync(`taskkill /F /PID ${p.pid} 2>nul`, { stdio: 'ignore' }); } catch (e) {}
}

// 前端服务器
let frontendServer = null;
const frontendDir = path.join(BASE_DIR, 'frontend');

function ensureFrontend() {
  return new Promise((resolve, reject) => {
    if (frontendServer && frontendServer.listening) return resolve();
    const app = http.createServer((req, res) => serveStatic(req, res, frontendDir));
    app.on('error', e => { frontendServer = null; reject(e); });
    app.listen(3000, () => { frontendServer = app; log('INFO', 'Frontend :3000 OK'); resolve(); });
  });
}

// 生成 douyinLive.yaml
function genDouyinYaml() {
  const sp = path.join(BASE_DIR, 'server', 'secrets.json');
  const yp = path.join(BASE_DIR, 'tools', 'douyinLive.yaml');
  if (!fs.existsSync(sp)) { log('WARN', 'no secrets.json, skip yaml gen'); return false; }
  const s = JSON.parse(fs.readFileSync(sp, 'utf-8'));
  const ck = s.douyin?.cookie || '';
  if (!ck) { log('WARN', 'no douyin cookie, skip yaml gen'); return false; }
  const dir = path.dirname(yp);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(yp, `port: "1088"\nlog:\n  level: "info"\ncookie:\n  douyin: "${ck}"\n`);
  log('INFO', `Generated douyinLive.yaml (cookie ${ck.length} chars)`);
  return true;
}

// 启动 douyinLive.exe + douyin-adapter.exe
function spawnDouyin() {
  return new Promise((resolve) => {
    if (isRunning(douyinProc)) { log('INFO', 'Douyin already running'); resolve({ ok: true, msg: '已在运行中', pid: douyinProc.pid }); return; }
    const exe = getExePath('douyinLive.exe');
    if (!exe) { resolve({ error: 'douyinLive.exe 未找到' }); return; }
    genDouyinYaml();
    const cfg = path.join(BASE_DIR, 'tools', 'douyinLive.yaml');
    log('INFO', `spawn douyin: ${exe} --config ${cfg}`);
    douyinProc = spawn(exe, ['--config', cfg], { cwd: BASE_DIR, stdio: 'ignore', detached: true });
    douyinProc.on('exit', (code) => { log('INFO', `Douyin exited code=${code}`); douyinProc = null; });

    // 启动适配器（douyinLive → 游戏 relay 8766）
    const adapterExe = getExePath('douyin-adapter.exe');
    if (adapterExe && !isRunning(douyinAdapterProc)) {
      log('INFO', `spawn adapter: ${adapterExe}`);
      douyinAdapterProc = spawn(adapterExe, [], { cwd: BASE_DIR, stdio: 'ignore', detached: true });
      douyinAdapterProc.on('exit', (code) => { log('INFO', `DouyinAdapter exited code=${code}`); douyinAdapterProc = null; });
    }

    resolve({ ok: true, pid: douyinProc.pid });
  });
}

// === API ===
async function handleAPI(req, res, body) {
  const url = new URL(req.url, 'http://localhost');
  const send = (data, code) => {
    log('DEBUG', `API ${url.pathname} -> ${code || 200} ${JSON.stringify(data).substring(0, 150)}`);
    res.writeHead(code || 200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(data));
  };

  try {
    switch (url.pathname) {

      case '/api/status':
        send({ game: isRunning(gameProc), douyin: isRunning(douyinProc), frontend: !!frontendServer?.listening,
               gamePid: gameProc?.pid || null, douyinPid: douyinProc?.pid || null, toolboxPort: PORT });
        break;

      case '/api/start': {
        log('INFO', 'START ALL requested');
        try { await ensureFrontend(); } catch (e) { send({ error: '前端3000端口被占用' }, 500); break; }

        // 检查 douyin 是否启用
        const sp = path.join(BASE_DIR, 'server', 'secrets.json');
        let douyinEnabled = false;
        if (fs.existsSync(sp)) {
          try { douyinEnabled = JSON.parse(fs.readFileSync(sp, 'utf-8')).douyin?.enabled; } catch (e) {}
        }

        // 启动游戏
        if (!isRunning(gameProc)) {
          const exePath = getExePath('war-danmaku.exe');
          if (!exePath) { send({ error: 'war-danmaku.exe 未找到' }, 400); break; }
          log('INFO', `spawn game: ${exePath}`);
          gameProc = spawn(exePath, [], { cwd: BASE_DIR, stdio: 'pipe', detached: true });
          gameProc.stdout?.on('data', d => log('GAME', d.toString().trim()));
          gameProc.stderr?.on('data', d => log('GAME/ERR', d.toString().trim()));
          gameProc.on('exit', (code) => { log('INFO', `Game exited code=${code}`); gameProc = null; });
        }

        // 启动抖音（如果启用）
        let douyinResult = null;
        if (douyinEnabled) {
          douyinResult = await spawnDouyin();
        }

        send({ ok: true, gamePid: gameProc?.pid, douyinPid: douyinProc?.pid,
               douyinStarted: !!douyinProc, douyinResult });
        break;
      }

      case '/api/start-douyin':
        send(await spawnDouyin());
        break;

      case '/api/stop-douyin':
        log('INFO', 'STOP-DOUYIN');
        killProc(douyinProc); douyinProc = null;
        killProc(douyinAdapterProc); douyinAdapterProc = null;
        try { execSync('taskkill /F /IM douyinLive.exe 2>nul & taskkill /F /IM douyin-adapter.exe 2>nul', { stdio: 'ignore' }); } catch (e) {}
        send({ ok: true });
        break;

      case '/api/stop':
        log('INFO', 'STOP ALL');
        killProc(gameProc); gameProc = null;
        killProc(douyinProc); douyinProc = null;
        killProc(douyinAdapterProc); douyinAdapterProc = null;
        try { execSync('taskkill /F /IM war-danmaku.exe 2>nul & taskkill /F /IM douyinLive.exe 2>nul & taskkill /F /IM douyin-adapter.exe 2>nul', { stdio: 'ignore' }); } catch (e) {}
        if (frontendServer) { frontendServer.close(); frontendServer = null; }
        send({ ok: true });
        break;

      case '/api/config': {
        const fp = path.join(BASE_DIR, 'server', 'secrets.json');
        const ex = path.join(BASE_DIR, 'server', 'secrets.json.example');
        if (!fs.existsSync(fp)) {
          if (fs.existsSync(ex)) { fs.copyFileSync(ex, fp); log('INFO', 'Created secrets.json from example'); }
          else { send({ error: 'secrets.json 不存在' }, 404); break; }
        }
        send(JSON.parse(fs.readFileSync(fp, 'utf-8')));
        break;
      }

      case '/api/config/save':
        if (req.method !== 'POST') { send({}, 405); break; }
        fs.writeFileSync(path.join(BASE_DIR, 'server', 'secrets.json'), JSON.stringify(body, null, 2), 'utf-8');
        log('INFO', 'Config saved');
        send({ ok: true });
        break;

      case '/api/logs': {
        const since = parseInt(url.searchParams.get('since')) || 0;
        const entries = LOG_RING.filter(e => e.seq > since);
        send({ entries, latestSeq: logSeq });
        break;
      }

      case '/api/open-folder':
        execSync(`explorer "${url.searchParams.get('path') || path.join(BASE_DIR, 'server', 'logs')}"`, { stdio: 'ignore' });
        send({ ok: true });
        break;

      default:
        send({ error: 'Unknown API' }, 404);
    }
  } catch (err) {
    log('ERROR', `API crash: ${err.message}`);
    send({ error: err.message }, 500);
  }
}

// === HTTP Server ===
const toolboxServer = http.createServer((req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }
  const url = new URL(req.url, 'http://localhost');
  if (url.pathname.startsWith('/api/')) {
    let body = '';
    req.on('data', c => body += c);
    req.on('end', () => { try { body = JSON.parse(body); } catch (e) { body = {}; } handleAPI(req, res, body); });
  } else {
    serveStatic(req, res, TOOLBOX_DIR);
  }
});

// === 启动 ===
log('INFO', '=== Toolbox starting ===');
log('INFO', `BASE=${BASE_DIR} frontend=${frontendDir} exists=${fs.existsSync(frontendDir)}`);

ensureFrontend().catch(e => log('ERROR', 'Frontend pre-start: ' + e.message));

toolboxServer.listen(PORT, () => {
  log('INFO', `UI: http://localhost:${PORT}`);
  const u = `http://localhost:${PORT}`;
  try { execSync(`start "" "${u}"`, { stdio: 'ignore' }); log('INFO', 'Opened browser'); } catch (e) { log('ERROR', 'Browser: '+e.message); }
});
