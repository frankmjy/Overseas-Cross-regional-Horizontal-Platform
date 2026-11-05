param([Parameter(Mandatory=$true)][string]$TicketFile)
$ErrorActionPreference='Stop'
$stage=Split-Path -Parent $TicketFile
$ticket=Get-Content -LiteralPath $TicketFile -Raw -Encoding UTF8|ConvertFrom-Json
$mutex=[Threading.Mutex]::new($false,'Global\OverseasProjectReleaseInstall')
if(-not $mutex.WaitOne(0)){$mutex.Dispose();throw 'Another installation is active.'}
try {
  if($ticket.root -cne 'C:\ai\overseas-project-management-deploy-20260605-163554' -or $ticket.port -ne 3333){throw 'Target mismatch.'}
  $at=[IO.Path]::GetFullPath($stage)
  while($at){if((Get-Item -LiteralPath $at -Force).Attributes -band [IO.FileAttributes]::ReparsePoint){throw 'Unsafe staging path.'};$at=Split-Path -Parent $at}
  foreach($entry in $ticket.uploadHashes.PSObject.Properties){if([IO.Path]::GetFileName($entry.Name) -cne $entry.Name -or (Get-FileHash -LiteralPath (Join-Path $stage $entry.Name) -Algorithm SHA256).Hash.ToLowerInvariant() -cne $entry.Value){throw 'Upload hash mismatch.'}}
  $listeners=@(Get-NetTCPConnection -LocalPort 3333 -State Listen|Select-Object -ExpandProperty OwningProcess -Unique)
  if($listeners.Count -ne 1 -or $listeners[0] -ne $ticket.process.pid){throw 'Port owner changed.'}
  $process=Get-CimInstance Win32_Process -Filter "ProcessId=$($listeners[0])"
  if($process.Name -ne 'node.exe' -or ([DateTimeOffset]$process.CreationDate).ToUnixTimeMilliseconds() -ne $ticket.process.created -or $process.CommandLine.IndexOf($ticket.root,[StringComparison]::OrdinalIgnoreCase) -lt 0){throw 'Process identity changed.'}
  & powershell.exe -NoLogo -NoProfile -NonInteractive -ExecutionPolicy Bypass -File (Join-Path $stage 'InstallProject.ps1') -ValidateOnly | Out-File -LiteralPath (Join-Path $stage 'archive-check.log') -Encoding utf8
  if($LASTEXITCODE -ne 0){throw 'Approved archive was rejected.'}
  $bundle=Join-Path $stage 'bundle'
  if(Test-Path -LiteralPath $bundle){if($ticket.attempt -ne 2 -or (Get-FileHash -LiteralPath (Join-Path $bundle 'release-manifest.json') -Algorithm SHA256).Hash.ToLowerInvariant() -cne $ticket.manifestSha256){throw 'Existing bundle requires review.'}}
  else{Add-Type -AssemblyName System.IO.Compression.FileSystem;[IO.Compression.ZipFile]::ExtractToDirectory((Join-Path $stage 'project-payload.zip'),$bundle)}
  $envFile=Join-Path $ticket.root '.env'
  foreach($line in [IO.File]::ReadAllLines($envFile)){if($line.Trim().StartsWith('#')){continue};$match=[regex]::Match($line,'^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=(.*)$');if($match.Success -and -not [Environment]::GetEnvironmentVariable($match.Groups[1].Value,'Process')){[Environment]::SetEnvironmentVariable($match.Groups[1].Value,$match.Groups[2].Value.Trim().Trim('"').Trim("'"),'Process')}}
  & $ticket.node (Join-Path $stage 'remote-install.cjs') $bundle $TicketFile *> (Join-Path $stage 'worker.log')
  if($LASTEXITCODE -ne 0){throw 'Installer reported failure; inspect result.json and preserved recovery materials.'}
} catch {
  $resultFile=Join-Path $stage 'result.json'
  if(-not(Test-Path -LiteralPath $resultFile)){@{status='error';ok=$false;release=$ticket.release;error='REMOTE_BOOTSTRAP_FAILED';line=$_.InvocationInfo.ScriptLineNumber;at=[DateTime]::UtcNow.ToString('o')}|ConvertTo-Json -Compress|Set-Content -LiteralPath $resultFile -Encoding utf8}
  exit 1
} finally {$mutex.ReleaseMutex();$mutex.Dispose()}
