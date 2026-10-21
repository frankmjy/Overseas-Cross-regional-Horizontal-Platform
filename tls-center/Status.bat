@echo off
setlocal
powershell.exe -NoProfile -Command "$r=Join-Path $env:ProgramData 'VNET\TLSCenter'; $s=Get-Content -LiteralPath (Join-Path $r 'settings.json') -Raw -Encoding UTF8|ConvertFrom-Json; & $s.node (Join-Path $r 'manage.cjs') status $r; Get-ScheduledTask -TaskName 'VNET TLS Certificate Watcher'|Select-Object TaskName,State"
pause
