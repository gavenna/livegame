# war-danmaku
# Usage: .\start.ps1

$root = $PSScriptRoot
Set-Location $root

Write-Host "=== war-danmaku ===" -ForegroundColor Cyan

# Kill old processes on 8765, 8766
@(8765, 8766) | ForEach-Object {
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

Write-Host ""
Write-Host "Open http://localhost:8765" -ForegroundColor White
Write-Host "Close this window to stop all" -ForegroundColor Gray
Write-Host ""

# Wait for child processes
try {
  $serverProc.WaitForExit()
  if ($relayProc) { $relayProc.WaitForExit() }
}
catch {
  Write-Host "Shutting down..." -ForegroundColor Yellow
  if (!$serverProc.HasExited) { $serverProc.Kill() }
  if ($relayProc -and !$relayProc.HasExited) { $relayProc.Kill() }
}
