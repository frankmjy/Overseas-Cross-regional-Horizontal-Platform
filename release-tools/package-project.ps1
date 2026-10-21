param([string]$AuditFile='C:\Users\36056\Downloads\overseas-release-audit-20261017-172210.json',[ValidatePattern('^\d{8}\.\d+$')][string]$ReleaseId='20261019.2')
$ErrorActionPreference='Stop'
if([IO.File]::ReadAllText($MyInvocation.MyCommand.Path) -match '[^\x00-\x7F]'){throw 'PowerShell 5 packager source must be ASCII; use ASCII artifact names.'}
. (Join-Path $PSScriptRoot 'archive-tools.ps1')
$root=Split-Path -Parent $PSScriptRoot
$id=$ReleaseId;$final=Join-Path $root ('reports\overseas-project-hotfix-'+$id+'.zip')
$mutex=[Threading.Mutex]::new($false,'Global\OverseasProjectRelease')
if(-not $mutex.WaitOne(0)){$mutex.Dispose();throw 'Another release owner is active.'}
$lock=$null;$lockPath=Join-Path $root '.runtime\project-release.lock'
try {
  $lock=[IO.FileStream]::new($lockPath,[IO.FileMode]::CreateNew,[IO.FileAccess]::Write,[IO.FileShare]::None)
  $preflightPath=Join-Path $root ('reports\project-release-'+$id+'-preflight.json')
  $preflight=Get-Content -LiteralPath $preflightPath -Raw -Encoding UTF8|ConvertFrom-Json
  if($preflight.id -cne $id -or $preflight.status -ne 'PREFLIGHT_STATIC_PASSED' -or -not $preflight.nativeExercise.passed){throw 'Release readiness is incomplete; no formal candidate generated.'}
  foreach($file in $preflight.files.PSObject.Properties){if((Get-FileHash -LiteralPath (Join-Path $root $file.Name) -Algorithm SHA256).Hash.ToLowerInvariant() -cne $file.Value){throw 'Managed source changed after preflight.'}}
  foreach($file in $preflight.tools.PSObject.Properties){if((Get-FileHash -LiteralPath (Join-Path $PSScriptRoot $file.Name) -Algorithm SHA256).Hash.ToLowerInvariant() -cne $file.Value){throw 'Installer changed after preflight.'}}
  foreach($file in $preflight.packaging.PSObject.Properties){if((Get-FileHash -LiteralPath (Join-Path $PSScriptRoot $file.Name) -Algorithm SHA256).Hash.ToLowerInvariant() -cne $file.Value){throw 'Packaging changed after preflight.'}}
  $env:OVERSEAS_PREVIOUS_RELEASE=$preflight.predecessor.id
  $env:OVERSEAS_RELEASE_ID=$id
  if(Test-Path -LiteralPath $final){throw 'A unique formal candidate already exists.'}
  $stage=Join-Path $root ('.runtime\project-release-'+$id)
  if(Test-Path -LiteralPath $stage){throw 'Candidate staging already exists; inspect its proof before proceeding.'}
  [void][IO.Directory]::CreateDirectory($stage)
  $bundle=Join-Path $stage 'bundle';[void][IO.Directory]::CreateDirectory($bundle)
  & node (Join-Path $PSScriptRoot 'make-draft.cjs') $root $bundle $AuditFile $id
  if($LASTEXITCODE -ne 0){throw 'Frozen source staging failed.'}
  $tools=@('transaction.cjs','install-runner.cjs','confirmed-test-cleanup.cjs','WindowsBridge.ps1');$hashes=[ordered]@{}
  foreach($name in $tools){Copy-Item -LiteralPath (Join-Path $PSScriptRoot $name) -Destination $bundle;$hashes[$name]=(Get-FileHash -LiteralPath (Join-Path $bundle $name) -Algorithm SHA256).Hash.ToLowerInvariant()}
  $manifestPath=Join-Path $bundle 'release-manifest.json';$manifest=Get-Content -LiteralPath $manifestPath -Raw -Encoding UTF8|ConvertFrom-Json
  if($manifest.id -cne $id -or $manifest.predecessor.id -cne $preflight.predecessor.id){throw 'Candidate identity does not match preflight.'}
  $manifest|Add-Member -NotePropertyName tools -NotePropertyValue $hashes
  [IO.File]::WriteAllText($manifestPath,($manifest|ConvertTo-Json -Depth 12),[Text.UTF8Encoding]::new($false))
  foreach($file in $manifest.files.PSObject.Properties){if((Get-FileHash -LiteralPath (Join-Path $root $file.Name) -Algorithm SHA256).Hash.ToLowerInvariant() -cne $file.Value){throw 'Source changed after its snapshot.'}}
  foreach($name in $tools){if((Get-FileHash -LiteralPath (Join-Path $PSScriptRoot $name) -Algorithm SHA256).Hash.ToLowerInvariant() -cne $hashes[$name]){throw 'Installer changed after its snapshot.'}}
  $outer=Join-Path $stage 'outer';[void][IO.Directory]::CreateDirectory($outer)
  Add-Type -AssemblyName System.IO.Compression
  Add-Type -AssemblyName System.IO.Compression.FileSystem
  $innerZip=Join-Path $outer 'project-payload.zip';Write-CanonicalZip $bundle $innerZip
  $innerHash=(Get-FileHash -LiteralPath $innerZip -Algorithm SHA256).Hash.ToLowerInvariant()
  $bootstrap=(Get-Content -LiteralPath (Join-Path $PSScriptRoot 'InstallProject.ps1') -Raw -Encoding UTF8).Replace('@PROJECT_PAYLOAD_SHA256@',$innerHash)
  [IO.File]::WriteAllText((Join-Path $outer 'InstallProject.ps1'),$bootstrap,[Text.UTF8Encoding]::new($false))
  Copy-Item -LiteralPath (Join-Path $PSScriptRoot 'InstallProject.bat') -Destination $outer
  Copy-Item -LiteralPath (Join-Path $PSScriptRoot 'PROJECT_RELEASE_README.md') -Destination (Join-Path $outer 'README.md')
  & powershell.exe -NoProfile -ExecutionPolicy Bypass -File (Join-Path $outer 'InstallProject.ps1') -ValidateOnly
  if($LASTEXITCODE -ne 0){throw 'Nested archive readiness preflight failed; no formal candidate generated.'}
  Write-CanonicalZip $outer $final
  $archive=[IO.Compression.ZipFile]::OpenRead($final)
  try {if($archive.Entries.Count -ne 4){throw 'Outer archive entry count mismatch.'};foreach($entry in $archive.Entries){$stream=$entry.Open();$hash=[Security.Cryptography.SHA256]::Create();try{$actual=([BitConverter]::ToString($hash.ComputeHash($stream))).Replace('-','').ToLowerInvariant();if($actual -cne (Get-FileHash -LiteralPath (Join-Path $outer $entry.FullName) -Algorithm SHA256).Hash.ToLowerInvariant()){throw 'Final archive byte identity failed.'}}finally{$hash.Dispose();$stream.Dispose()}}}finally{$archive.Dispose()}
  & powershell.exe -NoProfile -ExecutionPolicy Bypass -File (Join-Path $outer 'InstallProject.ps1') -ValidateOnly
  if($LASTEXITCODE -ne 0){throw 'Final outer package integrity check failed.'}
  $extracted=Join-Path $stage 'candidate-extracted';[IO.Compression.ZipFile]::ExtractToDirectory($innerZip,$extracted)
  $env:NODE_EXTRA_CA_CERTS=Join-Path $env:VNET_TLS_TEST_FIXTURES 'ca.pem'
  & node (Join-Path $PSScriptRoot 'candidate-smoke.cjs') $extracted $AuditFile $root
  if($LASTEXITCODE -ne 0){throw 'Formal candidate failed its production-equivalent installation smoke. Candidate is INVALID.'}
  $hash=(Get-FileHash -LiteralPath $final -Algorithm SHA256).Hash.ToLowerInvariant()
  $proof=@{schema=1;release=$id;status='LOCAL_INSTALL_ROLLBACK_AND_CANDIDATE_SMOKE_PASSED';generatedAt=[DateTime]::UtcNow.ToString('o');sha256=$hash;payloadSha256=$innerHash;baselineAuditSha256=(Get-FileHash -LiteralPath $AuditFile -Algorithm SHA256).Hash.ToLowerInvariant();preflightSha256=(Get-FileHash -LiteralPath $preflightPath -Algorithm SHA256).Hash.ToLowerInvariant();installer=$hashes;manifestSha256=(Get-FileHash -LiteralPath $manifestPath -Algorithm SHA256).Hash.ToLowerInvariant();fileCount=@($manifest.files.PSObject.Properties).Count;preserved=@('.env','.runtime','certs','shared TLS center');serverInstallationExecuted=$false}
  [IO.File]::WriteAllText((Join-Path $root ('reports\project-release-'+$id+'.proof.json')),($proof|ConvertTo-Json -Depth 8),[Text.UTF8Encoding]::new($false))
  [pscustomobject]@{Path=$final;Release=$id;SHA256=$hash;Bytes=(Get-Item -LiteralPath $final).Length;Status='PASSED'}|ConvertTo-Json
}finally{if($lock){$lock.Dispose();[IO.File]::Delete($lockPath)};$mutex.ReleaseMutex();$mutex.Dispose()}
