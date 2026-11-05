param([Parameter(Mandatory=$true)][string]$TicketFile)
$ErrorActionPreference='Stop';[Console]::OutputEncoding=[Text.UTF8Encoding]::new($false)
try {
 $stage=Split-Path -Parent $TicketFile
 if($stage -notmatch '^C:\\ProgramData\\VNET-Overseas-Deploy\\\d{8}\.\d+-[0-9a-f]{8}$'){throw 'STAGE_MISMATCH'}
 $ticket=Get-Content -LiteralPath $TicketFile -Raw -Encoding UTF8|ConvertFrom-Json
 if($ticket.root -cne 'C:\ai\overseas-project-management-deploy-20260605-163554' -or $ticket.port -ne 3333){throw 'TARGET_MISMATCH'}
 $task='VNET-Overseas-Deploy-'+$ticket.release+'-'+$ticket.manifestSha256.Substring(0,8)
 if((Get-ScheduledTaskInfo -TaskName $task).LastTaskResult -eq 267009){@{ok=$true;waitingForTask=$true}|ConvertTo-Json -Compress;exit 0}
 $manifestFile=Join-Path $stage 'bundle\release-manifest.json'
 if((Get-FileHash -LiteralPath $manifestFile -Algorithm SHA256).Hash.ToLowerInvariant() -cne $ticket.manifestSha256){throw 'MANIFEST_CHANGED'}
 if((Get-FileHash -LiteralPath (Join-Path $ticket.root '.env') -Algorithm SHA256).Hash.ToLowerInvariant() -cne $ticket.environmentSha256){throw 'ENVIRONMENT_CHANGED'}
 if((Test-Path -LiteralPath (Join-Path $ticket.root '.maintenance.lock')) -or (Test-Path -LiteralPath (Join-Path $ticket.root '.release-owner.lock'))){throw 'MAINTENANCE_RESIDUE'}
 $owners=@(Get-NetTCPConnection -LocalPort 3333 -State Listen -ErrorAction SilentlyContinue|Select-Object -ExpandProperty OwningProcess -Unique)
 if($owners.Count -ne 1){throw 'SERVICE_NOT_RUNNING'}
 $owner=Get-CimInstance Win32_Process -Filter "ProcessId=$($owners[0])"
 if($owner.Name -ne 'node.exe' -or $owner.ExecutablePath -ine $ticket.node -or $owner.CommandLine.IndexOf((Join-Path $ticket.root 'server.mjs'),[StringComparison]::OrdinalIgnoreCase) -lt 0){throw 'PROCESS_IDENTITY_CHANGED'}
 foreach($line in [IO.File]::ReadAllLines((Join-Path $ticket.root '.env'))){if($line.Trim().StartsWith('#')){continue};$match=[regex]::Match($line,'^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=(.*)$');if($match.Success -and -not [Environment]::GetEnvironmentVariable($match.Groups[1].Value,'Process')){[Environment]::SetEnvironmentVariable($match.Groups[1].Value,$match.Groups[2].Value.Trim().Trim('"').Trim("'"),'Process')}}
 $code=@'
const fs=require('node:fs'),path=require('node:path');const bundle=process.argv[1],root=process.argv[2],manifest=JSON.parse(fs.readFileSync(path.join(bundle,'release-manifest.json'),'utf8'));const {windowsOps}=require(path.join(bundle,'install-runner.cjs'));(async()=>{const ops=windowsOps({root,node:manifest.node,port:manifest.port,domain:manifest.domain,fingerprint:manifest.fingerprint});await ops.health(manifest.health);console.log('VERIFIED');})().catch(()=>{process.exitCode=1});
'@
 $answer=& $ticket.node -e $code (Join-Path $stage 'bundle') $ticket.root
 if($LASTEXITCODE -ne 0 -or $answer -ne 'VERIFIED'){throw 'HTTPS_HEALTH_FAILED'}
 @{ok=$true;pid=$owner.ProcessId;created=([DateTimeOffset]$owner.CreationDate).ToUnixTimeMilliseconds();at=[DateTime]::UtcNow.ToString('o')}|ConvertTo-Json -Compress
}catch{@{ok=$false;error='POST_TASK_HEALTH_FAILED';type=$_.Exception.GetType().Name;line=$_.InvocationInfo.ScriptLineNumber}|ConvertTo-Json -Compress}
