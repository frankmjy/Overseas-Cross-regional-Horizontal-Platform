param([Parameter(Mandatory=$true)][ValidatePattern('^\d{8}\.\d+$')][string]$ReleaseId,[Parameter(Mandatory=$true)][string]$AuditFile)
$ErrorActionPreference='Stop'
# Match the user's Windows proxy for this process only; preserve explicit overrides.
if(-not $env:HTTPS_PROXY){
  $proxy=Get-ItemProperty 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Internet Settings' -ErrorAction SilentlyContinue
  if($proxy.ProxyEnable -eq 1 -and $proxy.ProxyServer -match '^127\.0\.0\.1:\d+$'){$env:HTTPS_PROXY='http://'+$proxy.ProxyServer;$env:HTTP_PROXY=$env:HTTPS_PROXY}
}
& (Join-Path $PSScriptRoot 'package-project.ps1') -ReleaseId $ReleaseId -AuditFile $AuditFile
if(-not $?){throw 'Packaging failed; no delivery attempted.'}
& node (Join-Path $PSScriptRoot 'deliver-project.cjs') $ReleaseId
if($LASTEXITCODE -ne 0){throw 'Delivery incomplete; retain candidate and inspect the delivery ledger.'}
