@echo off
setlocal

set "ROOT=%~dp0"
if "%ROOT:~-1%"=="\" set "ROOT=%ROOT:~0,-1%"
cd /d "%ROOT%"

powershell -NoProfile -ExecutionPolicy Bypass -File "%ROOT%\scripts\configure-domain-cert.ps1" -Domain "www.sm.sjhl.online" -Auto
if errorlevel 1 (
  echo Failed to configure domain certificate.
  if not "%NO_PAUSE%"=="1" pause
  exit /b 1
)

echo.
echo Domain certificate paths are configured.
if not "%NO_PAUSE%"=="1" pause
