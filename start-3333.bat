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
if "%SERVER_HOST%"=="" set "SERVER_HOST=0.0.0.0"
set "PID_FILE=%ROOT%\app-%PORT%.pid"

set "NODE_PATH_FILE=%TEMP%\overseas-node-%PORT%-%RANDOM%.txt"
powershell -NoProfile -ExecutionPolicy Bypass -File "%ROOT%\scripts\ensure-node.ps1" -Root "%ROOT%" > "%NODE_PATH_FILE%"
if errorlevel 1 (
  echo Node.js runtime was not found and automatic download failed.
  echo If the server already has Node, set NODE_EXE to node.exe path and run again.
  echo Example:
  echo set NODE_EXE=C:\ai\nantong-schedule-20260428-101724\.runtime\node\node.exe
  if not "%NO_PAUSE%"=="1" pause
  exit /b 1
)
set /p NODE_EXE=<"%NODE_PATH_FILE%"
del "%NODE_PATH_FILE%" >nul 2>nul
if not exist "%NODE_EXE%" (
  echo Invalid Node.js path: %NODE_EXE%
  if not "%NO_PAUSE%"=="1" pause
  exit /b 1
)

set "LARK_PATH_FILE=%TEMP%\overseas-lark-%PORT%-%RANDOM%.txt"
powershell -NoProfile -ExecutionPolicy Bypass -File "%ROOT%\scripts\ensure-lark-cli.ps1" -Root "%ROOT%" -NodeExe "%NODE_EXE%" > "%LARK_PATH_FILE%"
if errorlevel 1 (
  echo lark-cli dependency was not found and automatic install failed.
  echo The page requires @larksuite/cli for Feishu Base sync.
  echo Please check internet access to npm registry, or install @larksuite/cli manually.
  if not "%NO_PAUSE%"=="1" pause
  exit /b 1
)
set /p LARK_CLI_SCRIPT=<"%LARK_PATH_FILE%"
del "%LARK_PATH_FILE%" >nul 2>nul
if not exist "%LARK_CLI_SCRIPT%" (
  echo Invalid lark-cli script path: %LARK_CLI_SCRIPT%
  if not "%NO_PAUSE%"=="1" pause
  exit /b 1
)

set "USE_ENV_CONFIG="
if defined FEISHU_APP_ID if defined FEISHU_APP_SECRET set "USE_ENV_CONFIG=1"
if "%USE_ENV_CONFIG%"=="1" (
  echo Configuring Feishu app credentials from environment...
  powershell -NoProfile -ExecutionPolicy Bypass -File "%ROOT%\scripts\configure-feishu-app.ps1" -NodeExe "%NODE_EXE%" -LarkCliScript "%LARK_CLI_SCRIPT%"
  if errorlevel 1 (
    echo Feishu app config failed.
    if not "%NO_PAUSE%"=="1" pause
    exit /b 1
  )
)

if exist "%PID_FILE%" (
  powershell -NoProfile -ExecutionPolicy Bypass -Command "$pidFile='%PID_FILE%'; $savedPid=Get-Content $pidFile -ErrorAction SilentlyContinue | Select-Object -First 1; if($savedPid -and (Get-Process -Id ([int]$savedPid) -ErrorAction SilentlyContinue)){ exit 0 } exit 1"
  if not errorlevel 1 (
    set /p OLD_PID=<"%PID_FILE%"
    echo Service is already running. PID: %OLD_PID%
    echo URL: https://localhost:%PORT%/
    if "%NO_PAUSE%"=="1" exit /b 0
    pause
    exit /b 0
  )
)

powershell -NoProfile -ExecutionPolicy Bypass -Command "$env:PORT='%PORT%'; $env:SERVER_HOST='%SERVER_HOST%'; $env:LARK_CLI_SCRIPT='%LARK_CLI_SCRIPT%'; $root='%ROOT%'; $pidFile='%PID_FILE%'; $node='%NODE_EXE%'; $p=Start-Process -FilePath $node -ArgumentList 'server.mjs' -WorkingDirectory $root -WindowStyle Hidden -PassThru; Set-Content -Path $pidFile -Value $p.Id -Encoding ASCII; Start-Sleep -Seconds 2; $conn=Get-NetTCPConnection -LocalPort %PORT% -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1; if(-not $conn){ exit 2 }; Write-Host ('Started PID: ' + $p.Id)"
if errorlevel 1 (
  echo Failed to start service.
  if not "%NO_PAUSE%"=="1" pause
  exit /b 1
)

echo URL: https://localhost:%PORT%/
if "%NO_PAUSE%"=="1" exit /b 0
pause
