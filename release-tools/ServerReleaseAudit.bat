@echo off
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0ServerReleaseAudit.ps1" -RequireAdministrator -ShowCompletion
if errorlevel 1 pause
