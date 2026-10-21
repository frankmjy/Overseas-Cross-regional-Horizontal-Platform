param([string]$Source,[string]$Workspace)
$ErrorActionPreference='Stop'
. (Join-Path $Source 'InstallSupport.ps1')
$registryRoot='Software\VNET-TLS-TEST-'+[guid]::NewGuid().ToString('N')
foreach($scope in @('Machine','User')){$key=[Microsoft.Win32.Registry]::CurrentUser.CreateSubKey($registryRoot+'\'+$scope);$key.Dispose()}
function Open-TlsEnvironmentKey([string]$Scope,[bool]$Writable){return [Microsoft.Win32.Registry]::CurrentUser.OpenSubKey($registryRoot+'\'+$Scope,$Writable)}
function Get-ScheduledTask {param($TaskName,$ErrorAction) return $script:fakeTask}
function Stop-ScheduledTask {param($TaskName,$ErrorAction) $script:stopped=$true}
function Unregister-ScheduledTask {param($TaskName,$Confirm,$ErrorAction) $script:fakeTask=$null}
function Assert-True($Condition,[string]$Message){if(-not $Condition){throw $Message}}
function Assert-Rejects([scriptblock]$Action){$rejected=$false;try{&$Action}catch{$rejected=$true};Assert-True $rejected 'Unsafe recovery was not rejected.'}
$sid='S-1-5-21-TEST';$taskName='VNET TLS Certificate Watcher';$node='C:\runtime\node.exe'
try {
  Set-TlsEnvironment 'Machine' 'NODE_OPTIONS' @{exists=$true;value='--require="%ProgramData%/old.cjs"';kind='ExpandString'}
  Set-TlsEnvironment 'User' 'NODE_OPTIONS' @{exists=$true;value='';kind='String'}
  $changes=@((New-TlsEnvironmentChange 'Machine' 'NODE_OPTIONS' '--require="C:/center/preload.cjs"'),(New-TlsEnvironmentChange 'User' 'NODE_OPTIONS' '--require="C:/center/preload.cjs"'),(New-TlsEnvironmentChange 'Machine' 'VNET_TLS_CENTER_ROOT' $Workspace),(New-TlsEnvironmentChange 'User' 'VNET_TLS_CENTER_ROOT' $Workspace))
  $state=@{schema=2;phase='preparing';root=$Workspace;node=$node;task=$taskName;installedBySid=$sid;environment=$changes}
  for($partial=0;$partial -le 4;$partial++) {
    foreach($change in $changes){Set-TlsEnvironment $change.scope $change.name $change.before}
    for($index=0;$index -lt $partial;$index++){Set-TlsEnvironment $changes[$index].scope $changes[$index].name $changes[$index].after}
    $script:fakeTask=if($partial -eq 4){[pscustomobject]@{Actions=@([pscustomobject]@{Execute=$node;Arguments=('"'+(Join-Path $Workspace 'manage.cjs')+'" watch "'+$Workspace+'"')})}}else{$null}
    $script:stopped=$false
    Restore-TlsInstallation $state $Workspace $sid
    foreach($change in $changes){Assert-True (Test-TlsEnvironmentEqual (Get-TlsEnvironment $change.scope $change.name) $change.before) 'Original registry bytes or type were not restored.'}
    Assert-True ($null -eq $script:fakeTask) 'Owned task was not removed.'
    Restore-TlsInstallation $state $Workspace $sid
  }
  foreach($change in $changes){Set-TlsEnvironment $change.scope $change.name $change.after}
  Set-TlsEnvironment 'User' 'VNET_TLS_CENTER_ROOT' @{exists=$true;value='C:\operator-change';kind='String'}
  Assert-Rejects {Restore-TlsInstallation $state $Workspace $sid}
  Assert-True (Test-TlsEnvironmentEqual (Get-TlsEnvironment 'Machine' 'NODE_OPTIONS') $changes[0].after) 'Recovery overwrote unrelated environment after drift.'
  Set-TlsEnvironment 'User' 'VNET_TLS_CENTER_ROOT' $changes[3].after
  $script:fakeTask=[pscustomobject]@{Actions=@([pscustomobject]@{Execute='C:\other\node.exe';Arguments='other-task'})}
  Assert-Rejects {Restore-TlsInstallation $state $Workspace $sid}
  Assert-True ($null -ne $script:fakeTask) 'Unrelated task was removed.'
  $script:fakeTask=$null
  Assert-Rejects {Restore-TlsInstallation $state $Workspace 'S-1-5-21-OTHER'}
  $wrong=$state.Clone();$wrong.environment=@($changes[0],$changes[0],$changes[2],$changes[3])
  Assert-Rejects {Restore-TlsInstallation $wrong $Workspace $sid}
  Write-TlsState $Workspace $state
  $state.phase='committed';Write-TlsState $Workspace $state
  $stored=Get-Content -LiteralPath (Join-Path $Workspace 'install-state.json') -Raw -Encoding UTF8|ConvertFrom-Json
  Assert-True ($stored.phase -eq 'committed') 'Atomic state update failed.'
  Assert-True ($stored.environment[0].before.kind -eq 'ExpandString' -and $stored.environment[0].before.value.Contains('%ProgramData%')) 'Raw expandable registry value was lost.'
  Write-Output 'PASS: partial installation rollback (0..4), idempotent recovery, typed environment, absent/empty values, drift/task/identity rejection, atomic state.'
} finally {
  if($registryRoot -notmatch '^Software\\VNET-TLS-TEST-[a-f0-9]{32}$'){throw 'Unsafe test registry cleanup target.'}
  [Microsoft.Win32.Registry]::CurrentUser.DeleteSubKeyTree($registryRoot,$false)
}
