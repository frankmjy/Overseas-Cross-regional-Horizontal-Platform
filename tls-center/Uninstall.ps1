param([string]$Root=(Join-Path $env:ProgramData 'VNET\TLSCenter'))
$ErrorActionPreference='Stop'
$identity=[Security.Principal.WindowsIdentity]::GetCurrent()
if (-not ([Security.Principal.WindowsPrincipal]::new($identity)).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
  if($Root -ne (Join-Path $env:ProgramData 'VNET\TLSCenter')){throw 'Use an elevated session for a custom root.'}
  $process=Start-Process powershell.exe -ArgumentList @('-NoProfile','-ExecutionPolicy','Bypass','-File',('"'+$MyInvocation.MyCommand.Path+'"')) -Verb RunAs -WindowStyle Hidden -PassThru -Wait
  exit $process.ExitCode
}
. (Join-Path $PSScriptRoot 'InstallSupport.ps1')
$Root=[IO.Path]::GetFullPath($Root)
$state=Get-Content -LiteralPath (Join-Path $Root 'install-state.json') -Raw -Encoding UTF8|ConvertFrom-Json
if($state.phase -notin @('committed','recovery-required','preparing')){throw 'Installation is not active.'}
$mutex=[Threading.Mutex]::new($false,'Global\VNETTLSCenterInstall')
if(-not $mutex.WaitOne(0)){$mutex.Dispose();throw 'Another TLS center operation is active.'}
try {
  Restore-TlsInstallation $state $Root $identity.User.Value
  $state.phase='uninstalled';Write-TlsState $Root $state
  Add-Type -AssemblyName System.Windows.Forms
  [void][Windows.Forms.MessageBox]::Show('Original environment restored. Restart the SERVER once. Certificate and recovery records retained.','VNET Shared TLS','OK','Information')
} finally {$mutex.ReleaseMutex();$mutex.Dispose()}
