param(
  [string]$Root='C:\ai\overseas-project-management-deploy-20260605-163554',
  [string]$OutputDirectory=$PSScriptRoot,
  [switch]$RequireAdministrator,
  [switch]$ShowCompletion
)
$ErrorActionPreference='Stop'
$identity=[Security.Principal.WindowsIdentity]::GetCurrent()
$isAdmin=([Security.Principal.WindowsPrincipal]::new($identity)).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
if($RequireAdministrator -and -not $isAdmin) {
  if($Root -ne 'C:\ai\overseas-project-management-deploy-20260605-163554' -or $OutputDirectory -ne $PSScriptRoot){throw 'Custom audit paths require an elevated session.'}
  $arguments=@('-NoProfile','-ExecutionPolicy','Bypass','-File',('"'+$MyInvocation.MyCommand.Path+'"'),'-RequireAdministrator')
  if($ShowCompletion){$arguments+='-ShowCompletion'}
  $process=Start-Process powershell.exe -ArgumentList $arguments -Verb RunAs -WindowStyle Hidden -Wait -PassThru
  exit $process.ExitCode
}
$issues=[Collections.Generic.List[string]]::new()
function Assert-PlainPath([string]$Path) {
  $full=[IO.Path]::GetFullPath($Path)
  if($full -notmatch '^[A-Za-z]:\\' -or $full.Substring(2).Contains(':')){throw 'Only ordinary absolute local paths are supported.'}
  $ancestor=$full
  while($ancestor){if((Test-Path -LiteralPath $ancestor) -and ((Get-Item -LiteralPath $ancestor -Force).Attributes -band [IO.FileAttributes]::ReparsePoint)){throw 'Reparse points are not allowed in audit paths.'};$ancestor=Split-Path -Parent $ancestor}
  return $full
}
function Read-SafeJson([string]$Path,[long]$Limit=67108864) {
  $item=Get-Item -LiteralPath $Path -Force
  if($item.PSIsContainer -or $item.Length -gt $Limit -or ($item.Attributes -band [IO.FileAttributes]::ReparsePoint)){throw 'JSON file is oversized or not an ordinary file.'}
  try {return (Get-Content -LiteralPath $Path -Raw -Encoding UTF8|ConvertFrom-Json)}catch{throw 'JSON file could not be parsed; private contents were not included.'}
}
try {
  $Root=Assert-PlainPath $Root
  $OutputDirectory=Assert-PlainPath $OutputDirectory
  if(-not (Test-Path -LiteralPath $Root -PathType Container)){throw 'The confirmed deployment directory was not found.'}
  if(-not (Test-Path -LiteralPath $OutputDirectory -PathType Container)){throw 'The audit output directory was not found.'}
  if(-not (Test-Path -LiteralPath (Join-Path $Root 'server.mjs'))){throw 'server.mjs is missing; deployment layout needs review.'}
  $package=Read-SafeJson (Join-Path $Root 'package.json') 1048576
  if($package.name -ne 'overseas-project-management-platform'){throw 'This is not the confirmed overseas project application.'}

  $files=[ordered]@{};$unsafePaths=[Collections.Generic.List[string]]::new();$totalBytes=[long]0
  $roots=@('server.mjs','base-sync.mjs','application-settings.mjs','package.json','package-lock.json','.env.example','index.html','start-3333.bat','start-3333.ps1','stop-3333.bat','configure-env.bat','configure-domain-cert.bat','authorize-feishu.bat','setup-domain-https.bat','DEPLOY_README.md','DOMAIN_CERT_README.md','RESEARCH_DEPLOY.md','THAI_NEXUSLINK_BOI_bilingual.xlsx','THAI_NEXUSLINK_BOI_original.xlsx')
  $queue=[Collections.Generic.Queue[string]]::new()
  foreach($relative in @($roots+@('src','assets','research','scripts','vendor\pdfjs','vendor\lark-cli','dist\server','dist\shared','dist\client'))){$path=Join-Path $Root $relative;if(Test-Path -LiteralPath $path){$queue.Enqueue($path)}}
  while($queue.Count) {
    $path=$queue.Dequeue();$item=Get-Item -LiteralPath $path -Force
    $relative=$item.FullName.Substring($Root.TrimEnd('\').Length+1).Replace('\','/')
    if($item.Attributes -band [IO.FileAttributes]::ReparsePoint){$unsafePaths.Add($relative);continue}
    if($item.PSIsContainer){foreach($child in Get-ChildItem -LiteralPath $path -Force){$queue.Enqueue($child.FullName)};continue}
    if($item.Name -eq '.env' -or $item.Name -match '(?i)(?:^|[._-])(secret|credentials?|token|privatekey|app-settings)(?:[._-]|$)' -or $item.Extension -in @('.key','.pem','.pfx','.p12','.passphrase')){$unsafePaths.Add($relative);continue}
    if($files.Count -ge 10000 -or $totalBytes+$item.Length -gt 2147483648){throw 'Public code fingerprint scope exceeded the audit limit.'}
    $streams=@(Get-Item -LiteralPath $path -Stream *|Where-Object{$_.Stream -ne ':$DATA' -and $_.Stream -ne 'Zone.Identifier'})
    if($streams.Count){$unsafePaths.Add($relative+':alternate-stream');continue}
    $hash=(Get-FileHash -LiteralPath $path -Algorithm SHA256).Hash.ToLowerInvariant()
    $after=Get-Item -LiteralPath $path -Force
    if($after.Length -ne $item.Length -or $after.LastWriteTimeUtc -ne $item.LastWriteTimeUtc){$issues.Add('CODE_CHANGED_DURING_AUDIT');continue}
    $files[$relative]=@{sha256=$hash;bytes=$item.Length};$totalBytes+=$item.Length
  }
  if($unsafePaths.Count){$issues.Add('UNSAFE_PUBLIC_PATHS_REQUIRE_REVIEW')}

  $transactions=@()
  foreach($parent in @($Root,(Join-Path $Root '.runtime'))) {
    if(-not (Test-Path -LiteralPath $parent -PathType Container)){continue}
    [void](Assert-PlainPath $parent)
    foreach($entry in Get-ChildItem -LiteralPath $parent -Force) {
      if($entry.Name -match '(?i)hotfix.*transaction|maintenance.*lock|rollback|failed[._-]?candidate|recovery[._-]?archive'){
        $relative=$entry.FullName.Substring($Root.TrimEnd('\').Length+1).Replace('\','/')
        $transactions+=@{path=$relative;directory=$entry.PSIsContainer;reparse=[bool]($entry.Attributes -band [IO.FileAttributes]::ReparsePoint)}
      }
    }
  }

  $dataCandidates=@((Join-Path $Root '.runtime\research'))
  if($env:RESEARCH_DATA_DIR){$value=$env:RESEARCH_DATA_DIR;$dataCandidates+=if([IO.Path]::IsPathRooted($value)){$value}else{Join-Path $Root $value}}
  $envPath=Join-Path $Root '.env'
  if(Test-Path -LiteralPath $envPath) {
    [void](Assert-PlainPath $envPath)
    if((Get-Item -LiteralPath $envPath -Force).Length -gt 1048576){throw 'Environment file exceeded the audit limit.'}
    foreach($line in [IO.File]::ReadAllLines($envPath)) {
      if($line -match '^\s*RESEARCH_DATA_DIR\s*=(.*)$') {
        $value=$Matches[1].Trim().Trim([char[]]@([char]34,[char]39))
        if($value){$dataCandidates+=if([IO.Path]::IsPathRooted($value)){$value}else{Join-Path $Root $value}}
      }
    }
  }
  $data=@()
  foreach($candidate in @($dataCandidates|Select-Object -Unique)) {
    $dataRoot=Assert-PlainPath $candidate
    $entry=@{path=$dataRoot;exists=(Test-Path -LiteralPath $dataRoot -PathType Container);statePresent=$false;settingsPresent=$false;writerPid=$null;statusCounts=$null;pendingUploads=$null;stateRead='not-present'}
    if($entry.exists) {
      $entry.settingsPresent=Test-Path -LiteralPath (Join-Path $dataRoot 'app-settings.json')
      $statePath=Join-Path $dataRoot 'state.json';$entry.statePresent=Test-Path -LiteralPath $statePath
      if($entry.statePresent) {
        try {
          $state=Read-SafeJson $statePath
          $counts=@{accepted=0;syncing=0;blocked=0;error=0;waiting_upload=0;success=0;retired=0;other=0}
          if($state.operations){foreach($operation in $state.operations.PSObject.Properties){$status=[string]$operation.Value.status;if($counts.ContainsKey($status)){$counts[$status]++}else{$counts.other++}}}
          $pending=0;if($state.uploads){foreach($upload in $state.uploads.PSObject.Properties){if($upload.Value.ready -eq $false){$pending++}}}
          $entry.statusCounts=$counts;$entry.pendingUploads=$pending;$entry.stateRead='counts-only'
          if($counts.accepted+$counts.syncing+$counts.blocked+$counts.error+$counts.waiting_upload+$counts.other -gt 0 -or $pending -gt 0){$issues.Add('OUTBOX_REQUIRES_RELEASE_HANDLING')}
        }catch{$entry.stateRead='failed';$issues.Add('OUTBOX_STATUS_UNKNOWN')}
      }
      $lockPath=Join-Path $dataRoot 'writer.lock'
      if(Test-Path -LiteralPath $lockPath){try{$lock=Read-SafeJson $lockPath 4096;if($lock.pid -is [int] -and $lock.pid -gt 0){$entry.writerPid=$lock.pid}}catch{$issues.Add('WRITER_LOCK_STATUS_UNKNOWN')}}
    }
    $data+=$entry
  }

  $listeners=@(Get-NetTCPConnection -State Listen -LocalPort 3333 -ErrorAction SilentlyContinue|Select-Object -Property OwningProcess,LocalAddress -Unique)
  $processes=@();$services=@()
  foreach($listener in $listeners) {
    $process=Get-CimInstance Win32_Process -Filter "ProcessId=$($listener.OwningProcess)"
    if(-not $process){$issues.Add('PORT_OWNER_UNKNOWN');continue}
    $processes+=@{pid=$process.ProcessId;name=$process.Name;executable=$process.ExecutablePath;parentPid=$process.ParentProcessId;rootMentionedInCommand=[bool]($process.CommandLine -and $process.CommandLine.IndexOf($Root,[StringComparison]::OrdinalIgnoreCase) -ge 0);serverEntryMentioned=[bool]($process.CommandLine -match 'server\.mjs');address=$listener.LocalAddress}
    $services+=@(Get-CimInstance Win32_Service|Where-Object{$_.ProcessId -in @($process.ProcessId,$process.ParentProcessId)}|Select-Object Name,State,StartMode)
  }
  if(-not $listeners.Count){$issues.Add('PORT_3333_NOT_LISTENING')}
  $tasks=@()
  foreach($task in Get-ScheduledTask -ErrorAction Stop) {
    $matching=@($task.Actions|Where-Object{($_.WorkingDirectory -and $_.WorkingDirectory.TrimEnd('\') -ieq $Root.TrimEnd('\')) -or ($_.Arguments -and $_.Arguments.IndexOf($Root,[StringComparison]::OrdinalIgnoreCase) -ge 0)})
    if($matching.Count){$tasks+=@{name=$task.TaskName;path=$task.TaskPath;state=$task.State.ToString()}}
  }
  $tlsRoot=Join-Path $env:ProgramData 'VNET\TLSCenter'
  $tls=@{present=(Test-Path -LiteralPath $tlsRoot);fingerprint=$null;watcherRunning=$false}
  if($tls.present){try{$pointer=Read-SafeJson (Join-Path $tlsRoot 'current.json') 16384;if($pointer.fingerprint -match '^(?:[A-Fa-f0-9]{2}:){31}[A-Fa-f0-9]{2}$'){$tls.fingerprint=$pointer.fingerprint};$tls.watcherRunning=(Get-ScheduledTask -TaskName 'VNET TLS Certificate Watcher' -ErrorAction Stop).State -eq 'Running'}catch{$issues.Add('SHARED_TLS_STATUS_UNKNOWN')}}
  $report=[ordered]@{schema=1;kind='overseas-release-readonly-audit';generatedAt=[DateTime]::UtcNow.ToString('o');readOnly=$true;releaseReady=$false;root=$Root;administrator=$isAdmin;package=@{name=$package.name;version=$package.version};publicFiles=$files;publicFileCount=$files.Count;publicBytes=$totalBytes;unsafePublicPaths=@($unsafePaths);oldTransactions=$transactions;data=$data;port3333=$processes;services=$services;startupTasks=$tasks;sharedTls=$tls;issues=@($issues|Select-Object -Unique);preserved=@('.env','.runtime','certs','external data directories','system shared TLS center')}
  $output=Join-Path $OutputDirectory ('overseas-release-audit-'+[DateTime]::Now.ToString('yyyyMMdd-HHmmss')+'.json')
  [IO.File]::WriteAllText($output,($report|ConvertTo-Json -Depth 10),[Text.UTF8Encoding]::new($false))
  Write-Host ('Report: '+$output)
  Write-Host ('Public file fingerprints: '+$files.Count+'; review items: '+$report.issues.Count)
  Write-Host 'Read-only audit finished. No application code, settings, data, tasks or services were changed.'
  if($ShowCompletion){Add-Type -AssemblyName System.Windows.Forms;[void][Windows.Forms.MessageBox]::Show(('Read-only audit finished. Send back this report: '+$output),'Overseas project release audit','OK','Information')}
} catch {
  Write-Host 'Audit failed. No application code, settings, data, tasks or services were changed.'
  if($ShowCompletion){Add-Type -AssemblyName System.Windows.Forms;[void][Windows.Forms.MessageBox]::Show('Audit failed. The confirmed project directory may be missing or unreadable. No application changes were made.','Overseas project release audit','OK','Error')}
  exit 1
}
