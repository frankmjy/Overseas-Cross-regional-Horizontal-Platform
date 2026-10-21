@echo off
setlocal

set "ROOT=%~dp0"
if "%ROOT:~-1%"=="\" set "ROOT=%ROOT:~0,-1%"
cd /d "%ROOT%"

if exist "%ROOT%\.env" (
  for /f "usebackq eol=# tokens=1,* delims==" %%A in ("%ROOT%\.env") do (
    if not "%%A"=="" if not defined %%A set "%%A=%%B"
  )
)

if "%PORT%"=="" set "PORT=3333"
set "PID_FILE=%ROOT%\app-%PORT%.pid"

powershell -NoProfile -ExecutionPolicy Bypass -Command "$pidFile='%PID_FILE%'; $port=%PORT%; $stopped=@(); if(Test-Path $pidFile){ $savedPid=Get-Content $pidFile -ErrorAction SilentlyContinue | Select-Object -First 1; if($savedPid){ $proc=Get-Process -Id ([int]$savedPid) -ErrorAction SilentlyContinue; if($proc){ Stop-Process -Id $proc.Id -Force; $stopped += $proc.Id } }; Remove-Item $pidFile -Force -ErrorAction SilentlyContinue }; $conns=Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue; foreach($conn in $conns){ if($conn.OwningProcess -and -not ($stopped -contains $conn.OwningProcess)){ Stop-Process -Id $conn.OwningProcess -Force -ErrorAction SilentlyContinue; $stopped += $conn.OwningProcess } }; $unique=$stopped | Select-Object -Unique; if($unique.Count){ Write-Host ('Stopped PID: ' + ($unique -join ', ')) } else { Write-Host ('No service found on port ' + $port) }"

if "%NO_PAUSE%"=="1" exit /b 0
pause
