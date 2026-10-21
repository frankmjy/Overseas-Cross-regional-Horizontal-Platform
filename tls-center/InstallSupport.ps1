$ErrorActionPreference='Stop'
function Open-TlsEnvironmentKey([string]$Scope,[bool]$Writable) {
  if($Scope -eq 'Machine') { return [Microsoft.Win32.Registry]::LocalMachine.OpenSubKey('SYSTEM\CurrentControlSet\Control\Session Manager\Environment',$Writable) }
  if($Scope -eq 'User') { return [Microsoft.Win32.Registry]::CurrentUser.OpenSubKey('Environment',$Writable) }
  throw 'Unrecognized environment scope.'
}
function Get-TlsEnvironment([string]$Scope,[string]$Name) {
  $key=Open-TlsEnvironmentKey $Scope $false
  try {
    if($null -eq $key -or $key.GetValueNames() -notcontains $Name) { return @{exists=$false;value=$null;kind=$null} }
    $kind=$key.GetValueKind($Name).ToString()
    if($kind -notin @('String','ExpandString')) { throw 'Unsupported environment registry type.' }
    return @{exists=$true;value=$key.GetValue($Name,$null,[Microsoft.Win32.RegistryValueOptions]::DoNotExpandEnvironmentNames);kind=$kind}
  } finally { if($key){$key.Dispose()} }
}
function Test-TlsEnvironmentEqual($Left,$Right) {
  return ($Left.exists -eq $Right.exists -and $Left.value -ceq $Right.value -and $Left.kind -ceq $Right.kind)
}
function Set-TlsEnvironment([string]$Scope,[string]$Name,$Snapshot) {
  $key=Open-TlsEnvironmentKey $Scope $true
  try {
    if($null -eq $key){throw 'Environment registry key is unavailable.'}
    if($Snapshot.exists) {
      if($Snapshot.kind -notin @('String','ExpandString') -or $Snapshot.value -isnot [string]){throw 'Invalid environment snapshot.'}
      $key.SetValue($Name,$Snapshot.value,[Microsoft.Win32.RegistryValueKind]$Snapshot.kind)
    } else {$key.DeleteValue($Name,$false)}
    $key.Flush()
  } finally {if($key){$key.Dispose()}}
}
function New-TlsEnvironmentChange([string]$Scope,[string]$Name,[string]$Value) {
  $before=Get-TlsEnvironment $Scope $Name
  $kind=if($before.exists){$before.kind}else{'String'}
  return @{scope=$Scope;name=$Name;before=$before;after=@{exists=$true;value=$Value;kind=$kind}}
}
function Write-TlsState([string]$Root,$Value) {
  $target=Join-Path $Root 'install-state.json';$temporary=$target+'.'+[guid]::NewGuid().ToString('N')+'.tmp'
  $bytes=[Text.UTF8Encoding]::new($false).GetBytes(($Value|ConvertTo-Json -Depth 12))
  $stream=[IO.FileStream]::new($temporary,[IO.FileMode]::CreateNew,[IO.FileAccess]::Write,[IO.FileShare]::None)
  try {$stream.Write($bytes,0,$bytes.Length);$stream.Flush($true)} finally {$stream.Dispose()}
  try {if(Test-Path -LiteralPath $target){[IO.File]::Replace($temporary,$target,[NullString]::Value)}else{[IO.File]::Move($temporary,$target)}} finally {if([IO.File]::Exists($temporary)){[IO.File]::Delete($temporary)}}
}
function Restore-TlsInstallation($State,[string]$Root,[string]$Sid) {
  if($State.schema -ne 2 -or $State.root -cne $Root -or $State.installedBySid -cne $Sid -or $State.task -ne 'VNET TLS Certificate Watcher'){throw 'Recovery state identity mismatch.'}
  $expected=@('Machine:NODE_OPTIONS','User:NODE_OPTIONS','Machine:VNET_TLS_CENTER_ROOT','User:VNET_TLS_CENTER_ROOT')
  $changes=@($State.environment)
  if($changes.Count -ne 4 -or @($changes|ForEach-Object{$_.scope+':'+$_.name}|Select-Object -Unique).Count -ne 4){throw 'Recovery environment manifest is invalid.'}
  foreach($item in $changes) {
    if(($item.scope+':'+$item.name) -notin $expected){throw 'Recovery environment target is invalid.'}
    $actual=Get-TlsEnvironment $item.scope $item.name
    if(-not (Test-TlsEnvironmentEqual $actual $item.before) -and -not (Test-TlsEnvironmentEqual $actual $item.after)){throw 'Environment changed outside the installation; automatic recovery stopped.'}
  }
  $task=Get-ScheduledTask -TaskName $State.task -ErrorAction SilentlyContinue
  if($task) {
    $arguments='"'+(Join-Path $Root 'manage.cjs')+'" watch "'+$Root+'"'
    if(@($task.Actions).Count -ne 1 -or $task.Actions[0].Arguments -cne $arguments -or $task.Actions[0].Execute -cne $State.node){throw 'Scheduled task changed outside the installation; automatic recovery stopped.'}
    Stop-ScheduledTask -TaskName $State.task -ErrorAction Stop
    Unregister-ScheduledTask -TaskName $State.task -Confirm:$false -ErrorAction Stop
  }
  foreach($item in $changes){Set-TlsEnvironment $item.scope $item.name $item.before}
}
