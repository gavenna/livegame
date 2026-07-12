# war-danmaku one-click start
# Usage: powershell -ExecutionPolicy Bypass -File start.ps1

$projectDir = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $projectDir

Write-Host ""
Write-Host "============================================" -ForegroundColor Cyan
Write-Host "  war-danmaku  -  danmaku battle game" -ForegroundColor Yellow
Write-Host "============================================" -ForegroundColor Cyan
Write-Host ""

# --- 1. Kill old ---
Write-Host "[1/3] Killing old processes..." -ForegroundColor Gray
$pids = (netstat -ano | Select-String ":8765|:3000" | Select-String "LISTENING" | ForEach-Object { ($_ -split '\s+')[-1] } | Sort-Object -Unique)
foreach ($p in $pids) { taskkill /PID $p /F 2>$null }
Start-Sleep 1
Write-Host "  [OK] Done" -ForegroundColor Green

# --- 2. Start server ---
Write-Host "[2/3] Starting game server..." -ForegroundColor Gray
$serverProc = Start-Process node -ArgumentList "server/index.js" -PassThru -WindowStyle Minimized -WorkingDirectory $projectDir
Write-Host "  [OK] Server PID=$($serverProc.Id) - ws://localhost:8765" -ForegroundColor Green

# --- 3. Start frontend ---
Write-Host "[3/3] Starting frontend..." -ForegroundColor Gray
$feProc = Start-Process node -ArgumentList "node_modules/http-server/bin/http-server","frontend","-p","3000","-c-1" -PassThru -WindowStyle Minimized -WorkingDirectory $projectDir
Write-Host "  [OK] Frontend PID=$($feProc.Id) - http://localhost:3000" -ForegroundColor Green

Start-Sleep 3

# --- Verify ---
Write-Host ""
$sOk = netstat -ano | Select-String ":8765" | Select-String "LISTENING"
$fOk = netstat -ano | Select-String ":3000" | Select-String "LISTENING"

if ($sOk) { Write-Host "  [OK] Server running" -ForegroundColor Green }
else       { Write-Host "  [FAIL] Server NOT running" -ForegroundColor Red }

if ($fOk) { Write-Host "  [OK] Frontend running" -ForegroundColor Green }
else       { Write-Host "  [FAIL] Frontend NOT running" -ForegroundColor Red }

Write-Host ""
Write-Host "============================================" -ForegroundColor Cyan
Write-Host "  BROWSER: http://localhost:3000" -ForegroundColor Yellow
Write-Host "============================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "Commands: red / blue / gift knight / danmaku text / help" -ForegroundColor Gray
Write-Host ""

# --- Simulator ---
Write-Host "=== Starting simulator ===" -ForegroundColor Yellow
node server/simulator.js

# --- Cleanup ---
Write-Host ""
Write-Host "Shutting down..." -ForegroundColor Yellow
if ($serverProc) { Stop-Process $serverProc -Force -ErrorAction SilentlyContinue }
if ($feProc) { Stop-Process $feProc -Force -ErrorAction SilentlyContinue }
Write-Host "Done."
