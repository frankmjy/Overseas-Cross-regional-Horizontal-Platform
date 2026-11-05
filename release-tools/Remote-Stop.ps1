param([Parameter(Mandatory=$true)][string]$Root,[Parameter(Mandatory=$true)][string]$NodeExe,[int]$Port=3333,[Parameter(Mandatory=$true)][int]$ProcessId,[Parameter(Mandatory=$true)][double]$StartedAt,[switch]$ValidateOnly)
$ErrorActionPreference='Stop'
try {
  if($Root -cne 'C:\ai\overseas-project-management-deploy-20260605-163554' -or $Port -ne 3333){throw 'Target mismatch.'}
  $owners=@(Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue|Select-Object -ExpandProperty OwningProcess -Unique)
  if($owners.Count -gt 1 -or ($owners.Count -eq 1 -and $owners[0] -ne $ProcessId)){throw 'Port owner changed.'}
  $process=Get-CimInstance Win32_Process -Filter "ProcessId=$ProcessId"
  if($process){
    if($process.Name -ne 'node.exe' -or ([DateTimeOffset]$process.CreationDate).ToUnixTimeMilliseconds() -ne $StartedAt -or $process.ExecutablePath -ine $NodeExe -or $process.CommandLine.IndexOf((Join-Path $Root 'server.mjs'),[StringComparison]::OrdinalIgnoreCase) -lt 0){throw 'Process identity changed.'}
    if(-not $ValidateOnly){Stop-Process -Id $ProcessId -Force -Confirm:$false -ErrorAction Stop;$remaining=Get-Process -Id $ProcessId -ErrorAction SilentlyContinue;if($remaining){$remaining.WaitForExit(7000)|Out-Null};if(Get-Process -Id $ProcessId -ErrorAction SilentlyContinue){throw 'Process did not exit.'}}
  }
  if(-not $ValidateOnly -and @(Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue).Count){throw 'Port did not stop.'}
  @{ok=$true;validated=$true;stopped=(-not $ValidateOnly)}|ConvertTo-Json -Compress
}catch{[Console]::Error.WriteLine('REMOTE_VERIFIED_STOP_FAILED');exit 1}
