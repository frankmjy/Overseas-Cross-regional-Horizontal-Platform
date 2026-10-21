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

set "NODE_PATH_FILE=%TEMP%\overseas-node-auth-%RANDOM%.txt"
powershell -NoProfile -ExecutionPolicy Bypass -File "%ROOT%\scripts\ensure-node.ps1" -Root "%ROOT%" > "%NODE_PATH_FILE%"
if errorlevel 1 (
  echo Node.js runtime was not found and automatic download failed.
  echo If the server already has Node, set NODE_EXE to node.exe path and run again.
  pause
  exit /b 1
)
set /p NODE_EXE=<"%NODE_PATH_FILE%"
del "%NODE_PATH_FILE%" >nul 2>nul

set "LARK_PATH_FILE=%TEMP%\overseas-lark-auth-%RANDOM%.txt"
powershell -NoProfile -ExecutionPolicy Bypass -File "%ROOT%\scripts\ensure-lark-cli.ps1" -Root "%ROOT%" -NodeExe "%NODE_EXE%" > "%LARK_PATH_FILE%"
if errorlevel 1 (
  echo lark-cli dependency is unavailable.
  pause
  exit /b 1
)
set /p LARK_CLI_SCRIPT=<"%LARK_PATH_FILE%"
del "%LARK_PATH_FILE%" >nul 2>nul

echo.
echo Step 1/2: Configuring Feishu app credentials...
set "USE_ENV_CONFIG="
if defined FEISHU_APP_ID if defined FEISHU_APP_SECRET set "USE_ENV_CONFIG=1"
if "%USE_ENV_CONFIG%"=="1" (
  echo Using Feishu app credentials from environment.
  powershell -NoProfile -ExecutionPolicy Bypass -File "%ROOT%\scripts\configure-feishu-app.ps1" -NodeExe "%NODE_EXE%" -LarkCliScript "%LARK_CLI_SCRIPT%"
) else (
  echo Choose Feishu app config method:
  echo   1. Manual App ID / App Secret
  echo   2. One-click Feishu app config by QR/link
  echo   3. Skip config, use existing local config
  echo.
  set /p CONFIG_METHOD=Enter 1, 2 or 3, default 3: 
  if "%CONFIG_METHOD%"=="1" (
    echo Input App ID and App Secret from Feishu Open Platform.
    powershell -NoProfile -ExecutionPolicy Bypass -File "%ROOT%\scripts\configure-feishu-app.ps1" -NodeExe "%NODE_EXE%" -LarkCliScript "%LARK_CLI_SCRIPT%"
  ) else if "%CONFIG_METHOD%"=="2" (
    echo Starting one-click Feishu app config. Follow the verification URL shown by lark-cli.
    "%NODE_EXE%" "%LARK_CLI_SCRIPT%" config init --new --brand feishu --lang zh_cn
  ) else (
    echo Skipped app config.
  )
)
if errorlevel 1 (
  echo Feishu app config failed.
  pause
  exit /b 1
)

echo.
echo Step 2/2: Verifying Feishu Base access with app identity...
"%NODE_EXE%" "%LARK_CLI_SCRIPT%" base +record-list --as bot --base-token CID8b8V7CaCtKesWGFKcHTdqnlc --table-id tblSpSvqS2FMpHks --view-id vewkRPw0CG --limit 1 --format json
if errorlevel 1 (
  echo Base access verification failed with app identity.
  echo Please check Feishu app Base scopes and whether the app has access to this Base.
  pause
  exit /b 1
)

echo.
echo Feishu app identity is ready for Base sync.
pause
