param(
  [string]$Root = (Join-Path $env:ProgramData 'VNET\TLSCenter'),
  [string]$NodeExe = '',
  [string]$ZipPath = '',
  [string]$CertPath = '',
  [string]$KeyPath = '',
  [switch]$PreflightOnly
)
$ErrorActionPreference = 'Stop'
$taskName = 'VNET TLS Certificate Watcher'
. (Join-Path $PSScriptRoot 'InstallSupport.ps1')
$identity = [Security.Principal.WindowsIdentity]::GetCurrent()
$admin = ([Security.Principal.WindowsPrincipal]::new($identity)).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $admin -and -not $PreflightOnly) {
  if ($Root -ne (Join-Path $env:ProgramData 'VNET\TLSCenter') -or $NodeExe -or $ZipPath -or $CertPath -or $KeyPath) { throw 'Run custom installation arguments from an elevated session.' }
  $script = $MyInvocation.MyCommand.Path
  $process = Start-Process powershell.exe -ArgumentList @('-NoProfile','-ExecutionPolicy','Bypass','-File',('"'+$script+'"')) -Verb RunAs -WindowStyle Hidden -PassThru -Wait
  exit $process.ExitCode
}
$Root = [IO.Path]::GetFullPath($Root)
if ($Root -notmatch '^[A-Za-z]:\\' -or $Root.Substring(2).Contains(':') -or $Root.Length -lt 12) { throw 'TLS center requires an absolute local directory.' }
$ancestor = $Root
while ($ancestor) {
  if ((Test-Path -LiteralPath $ancestor) -and ((Get-Item -LiteralPath $ancestor -Force).Attributes -band [IO.FileAttributes]::ReparsePoint)) { throw 'TLS center path must not contain reparse points.' }
  $ancestor = Split-Path -Parent $ancestor
}
if (-not $NodeExe) {
  $command=Get-Command node.exe -ErrorAction SilentlyContinue
  if($command){$NodeExe=$command.Source}
  else {
    $listener=Get-NetTCPConnection -State Listen -LocalPort 3001 -ErrorAction SilentlyContinue|Select-Object -First 1
    if($listener){$NodeExe=(Get-CimInstance Win32_Process -Filter "ProcessId=$($listener.OwningProcess)").ExecutablePath}
    if(-not $NodeExe){throw 'Node.js was not found on PATH or at the existing 3001 listener.'}
  }
}
$NodeExe=(Resolve-Path -LiteralPath $NodeExe).Path
$savedProcessOptions=[Environment]::GetEnvironmentVariable('NODE_OPTIONS','Process')
try {[Environment]::SetEnvironmentVariable('NODE_OPTIONS',$null,'Process');$version = & $NodeExe -p 'process.versions.node'} finally {[Environment]::SetEnvironmentVariable('NODE_OPTIONS',$savedProcessOptions,'Process')}
if ($LASTEXITCODE -ne 0 -or [int]$version.Split('.')[0] -lt 20) { throw 'Node.js 20 or newer is required.' }
$nodePaths=@(Get-CimInstance Win32_Process -Filter "Name='node.exe'"|Select-Object -ExpandProperty ExecutablePath -Unique)
foreach($nodePath in $nodePaths) {
  if(-not $nodePath){throw 'An existing Node.js runtime could not be inspected.'}
  try {[Environment]::SetEnvironmentVariable('NODE_OPTIONS',$null,'Process');$runtimeVersion=& $nodePath -p 'process.versions.node'} finally {[Environment]::SetEnvironmentVariable('NODE_OPTIONS',$savedProcessOptions,'Process')}
  if($LASTEXITCODE -ne 0 -or [int]$runtimeVersion.Split('.')[0] -lt 20){throw 'An existing Node.js runtime is older than 20; no global configuration was changed.'}
}

$source = $PSScriptRoot
$files = @('certificate.cjs','preload.cjs','manage.cjs','InstallSupport.ps1','ImportCertificate.ps1','UpdateCertificate.bat','Uninstall.ps1','Uninstall.bat','Verify.ps1','Verify.bat','Status.bat')
$manifestPath=Join-Path $source 'manifest.json'
if (-not (Test-Path -LiteralPath $manifestPath)) { throw 'Frozen source manifest is missing. This is not an installable candidate.' }
$manifest=Get-Content -LiteralPath $manifestPath -Raw -Encoding UTF8 | ConvertFrom-Json
foreach ($file in @($files + 'Install.ps1' + 'Install.bat' + 'README.md')) {
  $expected=$manifest.files.PSObject.Properties[$file].Value
  if (-not $expected -or (Get-FileHash -LiteralPath (Join-Path $source $file) -Algorithm SHA256).Hash.ToLowerInvariant() -ne $expected) { throw "Source integrity verification failed: $file" }
}
$preloadPath=(Join-Path $Root 'preload.cjs').Replace('\','/')
$argument='--require="' + $preloadPath + '"'
$oldMachine=(Get-TlsEnvironment 'Machine' 'NODE_OPTIONS').value
$oldUser=(Get-TlsEnvironment 'User' 'NODE_OPTIONS').value
if (($oldMachine + ' ' + $oldUser) -match 'TLSCenter[/\\]preload\.cjs' -and -not (Test-Path -LiteralPath (Join-Path $Root 'install-state.json'))) { throw 'A different TLS center is already configured; inspect its installation state first.' }
$plan=[ordered]@{version='1.0.0-rc1';root=$Root;nodeVersion=$version;domain=@('sm.sjhl.online','www.sm.sjhl.online');machineOptionsPreserved=[bool]$oldMachine;userOptionsPreserved=[bool]$oldUser;initialServerRestartRequired=$true}
if ($PreflightOnly) { $plan | ConvertTo-Json; exit 0 }

$mutex=[Threading.Mutex]::new($false,'Global\VNETTLSCenterInstall')
if (-not $mutex.WaitOne(0)) { $mutex.Dispose(); throw 'Another TLS center installation is active.' }
$committed=$false; $changedEnvironment=$false; $createdTask=$false; $state=$null
try {
  $existingStatePath=Join-Path $Root 'install-state.json'
  if (Test-Path -LiteralPath $existingStatePath) {
    $previous=Get-Content -LiteralPath $existingStatePath -Raw -Encoding UTF8|ConvertFrom-Json
    if($previous.schema -ne 2 -or $previous.root -ne $Root -or $previous.installedBySid -ne $identity.User.Value){throw 'Existing installation state identity is not recognized.'}
    if($previous.phase -eq 'committed'){throw 'TLS center is already installed. Use UpdateCertificate.bat for certificate changes; existing installation was not modified.'}
    if($previous.phase -notin @('preparing','rolled-back','recovery-required','uninstalled')){throw 'Existing transaction phase is not recognized.'}
    if($previous.phase -in @('preparing','recovery-required')){Restore-TlsInstallation $previous $Root $identity.User.Value;$previous.phase='rolled-back';Write-TlsState $Root $previous}
    foreach($file in $files){
      $existing=Join-Path $Root $file
      if((Test-Path -LiteralPath $existing) -and (Get-FileHash -LiteralPath $existing -Algorithm SHA256).Hash.ToLowerInvariant() -ne $manifest.files.PSObject.Properties[$file].Value){throw "Recovery runtime differs from frozen candidate: $file"}
    }
    $oldMachine=(Get-TlsEnvironment 'Machine' 'NODE_OPTIONS').value;$oldUser=(Get-TlsEnvironment 'User' 'NODE_OPTIONS').value
  } elseif (Test-Path -LiteralPath $Root) { if (@(Get-ChildItem -LiteralPath $Root -Force).Count) { throw 'Destination contains unrecognized files; refusing to overwrite.' } }
  if (Get-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue) { throw 'Scheduled task name is already in use.' }
  New-Item -ItemType Directory -Path $Root -Force | Out-Null
  $acl=[Security.AccessControl.DirectorySecurity]::new(); $acl.SetAccessRuleProtection($true,$false); $acl.SetOwner($identity.User)
  foreach ($sid in @($identity.User,[Security.Principal.SecurityIdentifier]::new('S-1-5-18'),[Security.Principal.SecurityIdentifier]::new('S-1-5-32-544'))) {
    $acl.AddAccessRule([Security.AccessControl.FileSystemAccessRule]::new($sid,'FullControl','ContainerInherit,ObjectInherit','None','Allow'))
  }
  # Existing Node.js service accounts need read access to the shared key, but ordinary local users do not.
  $accounts=@(Get-CimInstance Win32_Process -Filter "Name='node.exe'" -ErrorAction Stop | ForEach-Object {
    $owner=Invoke-CimMethod -InputObject $_ -MethodName GetOwner -ErrorAction Stop
    if($owner.ReturnValue -ne 0){throw 'An existing Node.js service account could not be inspected.'}
    if ($owner.ReturnValue -eq 0) { ([Security.Principal.NTAccount]::new($owner.Domain,$owner.User)).Translate([Security.Principal.SecurityIdentifier]) }
  } | Sort-Object Value -Unique)
  foreach ($sid in $accounts) {
    if ($sid.Value -notin @($identity.User.Value,'S-1-5-18','S-1-5-32-544')) { $acl.AddAccessRule([Security.AccessControl.FileSystemAccessRule]::new($sid,'ReadAndExecute','ContainerInherit,ObjectInherit','None','Allow')) }
  }
  Set-Acl -LiteralPath $Root -AclObject $acl
  $newMachine=($oldMachine + ' ' + $argument).Trim()
  $userOptions=Get-TlsEnvironment 'User' 'NODE_OPTIONS'
  $userChange=New-TlsEnvironmentChange 'User' 'NODE_OPTIONS' (($oldUser+' '+$argument).Trim())
  if(-not $userOptions.exists){$userChange.after=$userOptions}
  $userRoot=Get-TlsEnvironment 'User' 'VNET_TLS_CENTER_ROOT'
  $userRootChange=New-TlsEnvironmentChange 'User' 'VNET_TLS_CENTER_ROOT' $Root
  if(-not $userRoot.exists){$userRootChange.after=$userRoot}
  $environment=@((New-TlsEnvironmentChange 'Machine' 'NODE_OPTIONS' $newMachine),$userChange,(New-TlsEnvironmentChange 'Machine' 'VNET_TLS_CENTER_ROOT' $Root),$userRootChange)
  $discoveredPorts=@(Get-NetTCPConnection -State Listen -ErrorAction Stop|Where-Object{$_.LocalAddress -notmatch '^(127\.|::1$)'}|Where-Object{(Get-Process -Id $_.OwningProcess -ErrorAction SilentlyContinue).ProcessName -eq 'node'}|Select-Object -ExpandProperty LocalPort -Unique)
  $ports=@(@(3001,3333,8787)+$discoveredPorts|Sort-Object -Unique)
  $state=@{schema=2;phase='preparing';environment=$environment;root=$Root;node=$NodeExe;task=$taskName;installedBySid=$identity.User.Value;files=$manifest.files;ports=$ports}
  Write-TlsState $Root $state
  foreach ($file in $files) {
    $destination=Join-Path $Root $file
    Copy-Item -LiteralPath (Join-Path $source $file) -Destination $destination -ErrorAction Stop
    if((Get-FileHash -LiteralPath $destination -Algorithm SHA256).Hash.ToLowerInvariant() -ne $manifest.files.PSObject.Properties[$file].Value){throw "Installed runtime integrity failed: $file"}
  }
  $settings=@{schema=1;node=$NodeExe;domains=@('sm.sjhl.online','www.sm.sjhl.online');version='1.0.0-rc1'}
  [IO.File]::WriteAllText((Join-Path $Root 'settings.json'),($settings|ConvertTo-Json),[Text.UTF8Encoding]::new($false))
  & (Join-Path $Root 'ImportCertificate.ps1') -Root $Root -ZipPath $ZipPath -CertPath $CertPath -KeyPath $KeyPath -Initialize
  $changedEnvironment=$true
  foreach($item in $environment){Set-TlsEnvironment $item.scope $item.name $item.after}
  $action=New-ScheduledTaskAction -Execute $NodeExe -Argument ('"' + (Join-Path $Root 'manage.cjs') + '" watch "' + $Root + '"') -WorkingDirectory $Root
  $trigger=New-ScheduledTaskTrigger -AtStartup
  $principal=New-ScheduledTaskPrincipal -UserId 'SYSTEM' -LogonType ServiceAccount -RunLevel Highest
  $taskSettings=New-ScheduledTaskSettingsSet -MultipleInstances IgnoreNew -RestartCount 999 -RestartInterval ([TimeSpan]::FromMinutes(1)) -ExecutionTimeLimit ([TimeSpan]::Zero) -StartWhenAvailable
  Register-ScheduledTask -TaskName $taskName -Action $action -Trigger $trigger -Principal $principal -Settings $taskSettings | Out-Null
  $createdTask=$true
  $watcherStartedAt=[DateTime]::UtcNow
  Start-ScheduledTask -TaskName $taskName
  $watcherReady=$false
  for($attempt=0;$attempt -lt 20;$attempt++) {
    $statusPath=Join-Path $Root 'watch-status.json'
    if(Test-Path -LiteralPath $statusPath) {
      $watchStatus=Get-Content -LiteralPath $statusPath -Raw -Encoding UTF8|ConvertFrom-Json
      $active=Get-Content -LiteralPath (Join-Path $Root 'current.json') -Raw -Encoding UTF8|ConvertFrom-Json
      if($watchStatus.state -eq 'ready' -and [DateTime]::Parse($watchStatus.updatedAt).ToUniversalTime() -ge $watcherStartedAt -and $watchStatus.fingerprint -eq $active.fingerprint -and (Get-ScheduledTask -TaskName $taskName).State -eq 'Running'){$watcherReady=$true;break}
    }
    Start-Sleep -Milliseconds 250
  }
  if(-not $watcherReady){throw 'Certificate watcher failed its startup health check.'}
  $state.phase='committed'
  Write-TlsState $Root $state
  $committed=$true
  Add-Type -AssemblyName System.Windows.Forms
  [void][Windows.Forms.MessageBox]::Show('Installed. Restart the SERVER once so every existing service inherits the shared TLS loader. After that, certificate updates reload automatically without restarting individual applications. No server restart has been triggered.','VNET Shared TLS','OK','Information')
} catch {
  if (-not $committed) {
    if ($state) {
      try {if($changedEnvironment -or $createdTask){Restore-TlsInstallation $state $Root $identity.User.Value};$state.phase='rolled-back'}
      catch {$state.phase='recovery-required';Write-TlsState $Root $state;throw 'Installation failed and recovery needs review. No later operator environment changes were overwritten.'}
      Write-TlsState $Root $state
    }
  }
  throw
} finally { $mutex.ReleaseMutex(); $mutex.Dispose() }
