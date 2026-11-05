param([Parameter(Mandatory=$true)][ValidatePattern('^\d{8}\.\d+$')][string]$ReleaseId,[Parameter(Mandatory=$true)][string]$AuditFile,[switch]$PrepareRemote)
$ErrorActionPreference='Stop'
# Match the user's Windows proxy for this process only; preserve explicit overrides.
if(-not $env:HTTPS_PROXY){
  $proxy=Get-ItemProperty 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Internet Settings' -ErrorAction SilentlyContinue
  if($proxy.ProxyEnable -eq 1 -and $proxy.ProxyServer -match '^127\.0\.0\.1:\d+$'){$env:HTTPS_PROXY='http://'+$proxy.ProxyServer;$env:HTTP_PROXY=$env:HTTPS_PROXY}
}
& (Join-Path $PSScriptRoot 'package-project.ps1') -ReleaseId $ReleaseId -AuditFile $AuditFile
if(-not $?){throw 'Packaging failed; no delivery attempted.'}
if($PrepareRemote){
  $root=Split-Path -Parent $PSScriptRoot
  $stage=Join-Path $root ('.runtime\remote-deploy-'+$ReleaseId)
  if(Test-Path -LiteralPath $stage){throw 'Remote staging exists; inspect its ledger before continuing.'}
  [void][IO.Directory]::CreateDirectory($stage)
  $payload=Join-Path $root ('.runtime\project-release-'+$ReleaseId+'\outer\project-payload.zip')
  $proof=Get-Content -LiteralPath (Join-Path $root ('reports\project-release-'+$ReleaseId+'.proof.json')) -Raw|ConvertFrom-Json
  if((Get-FileHash -LiteralPath $payload -Algorithm SHA256).Hash.ToLowerInvariant() -cne $proof.payloadSha256){throw 'Remote payload identity mismatch.'}
  Copy-Item -LiteralPath $payload -Destination (Join-Path $stage 'project-payload.zip')
  & python (Join-Path $PSScriptRoot 'deploy-remote.py') prepare --release $ReleaseId
  if($LASTEXITCODE -ne 0){throw 'Remote preflight failed; preserve the candidate and deployment ledger.'}
}
& node (Join-Path $PSScriptRoot 'deliver-project.cjs') $ReleaseId
if($LASTEXITCODE -ne 0){throw 'Delivery incomplete; retain candidate and inspect the delivery ledger.'}
