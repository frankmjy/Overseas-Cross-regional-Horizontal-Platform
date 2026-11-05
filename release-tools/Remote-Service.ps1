param([Parameter(Mandatory=$true)][string]$TicketFile)
$ErrorActionPreference='Stop'
[Console]::OutputEncoding=[Text.UTF8Encoding]::new($false)
function Plain([string]$Target){$full=[IO.Path]::GetFullPath($Target);for($at=$full;$at;$at=Split-Path -Parent $at){if((Test-Path -LiteralPath $at) -and ((Get-Item -LiteralPath $at -Force).Attributes -band [IO.FileAttributes]::ReparsePoint)){throw 'REPARSE_PATH'}};return $full}
try {
 $ticketPath=Plain $TicketFile;$stage=Plain (Split-Path -Parent $ticketPath)
 if($stage -notmatch '^C:\\ProgramData\\VNET-Overseas-Deploy\\\d{8}\.\d+-[0-9a-f]{8}$'){throw 'INVALID_STAGE'}
 $ticket=Get-Content -LiteralPath $ticketPath -Raw -Encoding UTF8|ConvertFrom-Json
 if($ticket.root -cne 'C:\ai\overseas-project-management-deploy-20260605-163554' -or $ticket.port -ne 3333){throw 'TARGET_MISMATCH'}
 [void](Plain $ticket.root);[void](Plain $ticket.node)
 if(-not(Test-Path -LiteralPath $ticket.node -PathType Leaf)){throw 'NODE_MISSING'}
 if(@(Get-NetTCPConnection -LocalPort 3333 -State Listen -ErrorAction SilentlyContinue).Count){throw 'PORT_OCCUPIED'}
 $name='VNET-Overseas-Service-3333'
 $existing=Get-ScheduledTask -TaskName $name -ErrorAction SilentlyContinue
 if($existing){
  if(@($existing.Actions).Count -ne 1 -or $existing.Actions.Execute -notmatch '(^|\\)powershell\.exe$' -or $existing.Actions.Arguments -notmatch 'C:\\ProgramData\\VNET-Overseas-Deploy\\\d{8}\.\d+-[0-9a-f]{8}\\Run-Service-3333(?:-v2)?\.ps1' -or $existing.Principal.UserId -notin @('SYSTEM','S-1-5-18')){throw 'UNKNOWN_SERVICE_TASK'}
  if(-not(Test-Path -LiteralPath (Join-Path $stage 'service-task.before.xml'))){[IO.File]::WriteAllText((Join-Path $stage 'service-task.before.xml'),(Export-ScheduledTask -TaskName $name),[Text.UTF8Encoding]::new($false))}
  for($i=0;$i -lt 20 -and (Get-ScheduledTaskInfo -TaskName $name).LastTaskResult -eq 267009;$i++){Start-Sleep -Milliseconds 250}
  if((Get-ScheduledTaskInfo -TaskName $name).LastTaskResult -eq 267009){throw 'SERVICE_TASK_STILL_RUNNING'}
 }
 $runner=Join-Path $stage 'Run-Service-3333-v2.ps1'
 $source=@'
param([string]$TicketFile)
$ErrorActionPreference='Stop'
$stage=Split-Path -Parent $TicketFile
$ticket=Get-Content -LiteralPath $TicketFile -Raw -Encoding UTF8|ConvertFrom-Json
if($ticket.root -cne 'C:\ai\overseas-project-management-deploy-20260605-163554' -or $ticket.port -ne 3333){throw 'TARGET_MISMATCH'}
if(@(Get-NetTCPConnection -LocalPort 3333 -State Listen -ErrorAction SilentlyContinue).Count){throw 'PORT_OCCUPIED'}
foreach($line in [IO.File]::ReadAllLines((Join-Path $ticket.root '.env'))){if($line.Trim().StartsWith('#')){continue};$match=[regex]::Match($line,'^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=(.*)$');if($match.Success -and -not [Environment]::GetEnvironmentVariable($match.Groups[1].Value,'Process')){[Environment]::SetEnvironmentVariable($match.Groups[1].Value,$match.Groups[2].Value.Trim().Trim('"').Trim("'"),'Process')}}
$env:PORT='3333';$env:SERVER_HOST='0.0.0.0';$env:LARK_CLI_SCRIPT=Join-Path $ticket.root 'vendor\lark-cli\run.cjs'
$log=[guid]::NewGuid().ToString('N')
$child=Start-Process -FilePath $ticket.node -ArgumentList @((Join-Path $ticket.root 'server.mjs')) -WorkingDirectory $ticket.root -WindowStyle Hidden -RedirectStandardOutput (Join-Path $stage ($log+'.service.out.log')) -RedirectStandardError (Join-Path $stage ($log+'.service.err.log')) -PassThru
$child.WaitForExit()
exit $child.ExitCode
'@
 if(Test-Path -LiteralPath $runner){if([IO.File]::ReadAllText($runner) -cne $source){throw 'SERVICE_RUNNER_CHANGED'}}else{[IO.File]::WriteAllText($runner,$source,[Text.UTF8Encoding]::new($false))}
 $arguments='-NoLogo -NoProfile -NonInteractive -ExecutionPolicy Bypass -File "'+$runner+'" -TicketFile "'+$ticketPath+'"'
 $action=New-ScheduledTaskAction -Execute 'powershell.exe' -Argument $arguments -WorkingDirectory $ticket.root
 $principal=New-ScheduledTaskPrincipal -UserId 'SYSTEM' -LogonType ServiceAccount -RunLevel Highest
 $settings=New-ScheduledTaskSettingsSet -ExecutionTimeLimit ([TimeSpan]::Zero) -MultipleInstances IgnoreNew
 Register-ScheduledTask -TaskName $name -Action $action -Principal $principal -Settings $settings -Force|Out-Null
 Start-ScheduledTask -TaskName $name
 @{started=$true;task=$name}|ConvertTo-Json -Compress
}catch{@{started=$false;error='REMOTE_MANAGED_SERVICE_FAILED';type=$_.Exception.GetType().Name;line=$_.InvocationInfo.ScriptLineNumber}|ConvertTo-Json -Compress;exit 1}
