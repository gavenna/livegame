# war-danmaku
# Usage: .\start.ps1

# 控制台切 UTF-8，否则 Pino 中文乱码
chcp 65001 > $null

$root = $PSScriptRoot
Set-Location $root

Write-Host "=== war-danmaku ===" -ForegroundColor Cyan

# Kill old processes on 8765, 8766, 3000
@(8765, 8766, 3000) | ForEach-Object {
  $port = $_
  $line = netstat -ano 2>$null | Select-String ":$port " | Select-String "LISTENING"
  if ($line) {
    $p = ($line -split '\s+')[-1]
    taskkill /F /PID $p 2>$null | Out-Null
    Write-Host "[OK] Released port $port" -ForegroundColor Gray
  }
}
Start-Sleep 1

# Start game server
$serverProc = Start-Process -FilePath "node" -ArgumentList "server/index.js" -NoNewWindow -PassThru
Write-Host "[OK] Game server http://localhost:8765 (PID $($serverProc.Id))" -ForegroundColor Green

# Start frontend server
$frontendProc = Start-Process -FilePath "cmd" -ArgumentList "/c npx http-server frontend -p 3000 -c-1" -NoNewWindow -PassThru
Write-Host "[OK] Frontend http://localhost:3000 (PID $($frontendProc.Id))" -ForegroundColor Green

# Check Bilibili config
$secrets = Get-Content "$root\server\secrets.json" -Raw | ConvertFrom-Json
$roomId = $secrets.bilibili.roomId

$relayProc = $null
if ($roomId -and $roomId -ne 0) {
  Start-Sleep 3
  $pyOk = python -c "import blivedm, websocket" 2>&1
  if ($LASTEXITCODE -ne 0) {
    Write-Host "[WARN] Installing Python deps..." -ForegroundColor Yellow
    pip install git+https://github.com/xfgryujk/blivedm.git websocket-client
    pip install brotli --upgrade 2>$null
  }
  $relayProc = Start-Process -FilePath "python" -ArgumentList "server/danmaku/bilibili-relay.py" -NoNewWindow -PassThru
  Write-Host "[OK] Bilibili relay -> room $roomId (PID $($relayProc.Id))" -ForegroundColor Green
}
else {
  Write-Host "[INFO] No Bilibili room configured, relay skipped" -ForegroundColor Gray
}

# Check Douyin config
$douyinEnabled = $secrets.douyin.enabled

$douyinProc = $null
if ($douyinEnabled -eq $true) {
  Start-Sleep 1
  $douyinProc = Start-Process -FilePath "node" -ArgumentList "server/danmaku/douyin.js" -NoNewWindow -PassThru
  Write-Host "[OK] Douyin adapter (PID $($douyinProc.Id))" -ForegroundColor Green
}
else {
  Write-Host "[INFO] Douyin adapter disabled, skipped" -ForegroundColor Gray
}

Write-Host ""
Write-Host "Open http://localhost:3000 (game)" -ForegroundColor White
Write-Host "Close this window to stop all" -ForegroundColor Gray
Write-Host ""

# Wait for child processes
try {
  $serverProc.WaitForExit()
  if ($frontendProc) { $frontendProc.WaitForExit() }
  if ($relayProc) { $relayProc.WaitForExit() }
  if ($douyinProc) { $douyinProc.WaitForExit() }
}
catch {
  Write-Host "Shutting down..." -ForegroundColor Yellow
  if (!$serverProc.HasExited) { $serverProc.Kill() }
  if ($frontendProc -and !$frontendProc.HasExited) { $frontendProc.Kill() }
  if ($relayProc -and !$relayProc.HasExited) { $relayProc.Kill() }
  if ($douyinProc -and !$douyinProc.HasExited) { $douyinProc.Kill() }
}
