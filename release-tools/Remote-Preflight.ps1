param(
  [string]$Root='C:\ai\overseas-project-management-deploy-20260605-163554',
  [int]$Port=3333
)
$ErrorActionPreference='Stop'
[Console]::OutputEncoding=[Text.UTF8Encoding]::new($false)
function Plain([string]$Target) {
  $full=[IO.Path]::GetFullPath($Target)
  if($full.Substring([IO.Path]::GetPathRoot($full).Length).Contains(':')){throw 'UNSAFE_PATH'}
  for($at=$full;$at;$at=Split-Path -Parent $at){if((Test-Path -LiteralPath $at) -and ((Get-Item -LiteralPath $at -Force).Attributes -band [IO.FileAttributes]::ReparsePoint)){throw 'REPARSE_PATH'}}
  return $full
}
function Hash([string]$File){if(Test-Path -LiteralPath $File -PathType Leaf){return (Get-FileHash -LiteralPath (Plain $File) -Algorithm SHA256).Hash.ToLowerInvariant()};return $null}
Add-Type -AssemblyName System.Web.Extensions
$serializer=[Web.Script.Serialization.JavaScriptSerializer]::new()
$serializer.MaxJsonLength=67108864
$serializer.RecursionLimit=256
function SafeJson([string]$File){$item=Get-Item -LiteralPath (Plain $File);if($item.Length -gt 67108864){throw 'JSON_LIMIT'};try{return $serializer.DeserializeObject([IO.File]::ReadAllText($File))}catch{throw 'JSON_UNREADABLE'}}
try {
  if($Port -ne 3333 -or $Root.TrimEnd('\') -ine 'C:\ai\overseas-project-management-deploy-20260605-163554'){throw 'TARGET_MISMATCH'}
  $Root=Plain $Root
  if(-not(Test-Path -LiteralPath (Join-Path $Root 'server.mjs') -PathType Leaf)){throw 'PROJECT_NOT_FOUND'}
  $listeners=@(Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue|Select-Object -ExpandProperty OwningProcess -Unique)
  $processes=@(foreach($pidValue in $listeners){$process=Get-CimInstance Win32_Process -Filter "ProcessId=$pidValue";@{pid=$pidValue;name=$process.Name;executable=$process.ExecutablePath;created=([DateTimeOffset]$process.CreationDate).ToUnixTimeMilliseconds();entryPathVerified=($process.CommandLine -and $process.CommandLine.IndexOf($Root,[StringComparison]::OrdinalIgnoreCase) -ge 0)}})
  $files=@{}
  foreach($name in @('server.mjs','base-sync.mjs','application-settings.mjs','team-organization.mjs','package.json','index.html','research/config.json','auth/application.json','auth/web/login.html')){$files[$name]=Hash (Join-Path $Root $name)}
  $transaction=$null
  $journal=Join-Path $Root '.hotfix-transaction.json'
  if(Test-Path -LiteralPath $journal){$tx=SafeJson $journal;$transaction=@{schema=$tx.schema;release=$tx.release;phase=$tx.phase;root=$tx.root;sha256=Hash $journal;targetCore=$tx.targetCore;beforeCore=$tx.beforeCore}}
  $ledgers=@()
  $specs=@(
    @('handover','ledger.json','operations','status'),
    @('project-tasks','ledger.json','operations','status'),
    @('staffing','ledger.json','operations','status'),
    @('coordination','mutations.json','operations','status'),
    @('priorities','ledger.json','operations','status'),
    @('auth','ledger.json','events','syncStatus'),
    @('knowledge','meeting-ledger.json','operations','status'),
    @('knowledge','document-ledger.json','operations','status'),
    @('research','state.json','operations','status')
  )
  $researchProjects=Join-Path $Root '.runtime\research\projects'
  if(Test-Path -LiteralPath $researchProjects){foreach($folder in Get-ChildItem -LiteralPath (Plain $researchProjects) -Directory){if($folder.Name -notmatch '^[a-z0-9-]+$'){throw 'UNKNOWN_PROJECT_DIRECTORY'};$specs+=,@('research/projects/'+$folder.Name,'state.json','operations','status')}}
  foreach($spec in $specs){$relative='.runtime/'+$spec[0]+'/'+$spec[1];$file=Join-Path $Root $relative;if(-not(Test-Path -LiteralPath $file)){continue};$state=SafeJson $file;$collection=$state[$spec[2]];if($null -eq $collection -or -not($collection -is [Collections.IDictionary])){throw 'LEDGER_FORMAT_INVALID'};$pending=0;foreach($op in $collection.Values){$status=$op[$spec[3]];if($status -notin @('success','retired','discarded','synced')){$pending++}};$uploads=@($state.uploads.Values|Where-Object {$_.ready -eq $false}).Count;$ledgers+=@{path=$relative;pending=$pending;pendingUploads=$uploads;sha256=Hash $file}}
  $recoveries=@();$recoveryRoot=Join-Path $Root '.release-recovery';if(Test-Path -LiteralPath $recoveryRoot){$recoveries=@(Get-ChildItem -LiteralPath (Plain $recoveryRoot) -Directory|ForEach-Object{[void](Plain $_.FullName);$_.Name})}
  @{ok=$true;readOnly=$true;root=$Root;port=$Port;processes=$processes;files=$files;transaction=$transaction;maintenance=(Test-Path -LiteralPath (Join-Path $Root '.maintenance.lock'));releaseOwner=(Test-Path -LiteralPath (Join-Path $Root '.release-owner.lock'));recoveries=$recoveries;ledgers=$ledgers;environmentSha256=Hash (Join-Path $Root '.env');generatedAt=[DateTime]::UtcNow.ToString('o')}|ConvertTo-Json -Depth 10 -Compress
} catch {
  @{ok=$false;readOnly=$true;error='REMOTE_PREFLIGHT_FAILED';errorType=$_.Exception.GetType().Name;line=$_.InvocationInfo.ScriptLineNumber}|ConvertTo-Json -Compress
  exit 1
}
