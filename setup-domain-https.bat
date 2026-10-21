@echo off
setlocal

set "ROOT=%~dp0"
if "%ROOT:~-1%"=="\" set "ROOT=%ROOT:~0,-1%"
cd /d "%ROOT%"

powershell -NoProfile -ExecutionPolicy Bypass -File "%ROOT%\scripts\setup-domain-https.ps1"
if errorlevel 1 (
  echo.
  echo Domain HTTPS setup failed.
  if not "%NO_PAUSE%"=="1" pause
  exit /b 1
)

echo.
echo Domain HTTPS setup completed.
if not "%NO_PAUSE%"=="1" pause
