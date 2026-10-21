@echo off
setlocal

set "ROOT=%~dp0"
if "%ROOT:~-1%"=="\" set "ROOT=%ROOT:~0,-1%"
cd /d "%ROOT%"

powershell -NoProfile -ExecutionPolicy Bypass -File "%ROOT%\scripts\configure-env.ps1"
if errorlevel 1 (
  echo Failed to create .env.
  pause
  exit /b 1
)

echo.
echo Local .env is ready.
pause
