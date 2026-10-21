param([string]$Source,[string]$Temporary)
$ErrorActionPreference='Stop'
. (Join-Path $Source 'archive-tools.ps1')
$inputDirectory=Join-Path $Temporary 'input';[void][IO.Directory]::CreateDirectory((Join-Path $inputDirectory 'payload\nested'))
[IO.File]::WriteAllText((Join-Path $inputDirectory 'payload\nested\check.txt'),'fixture')
$zip=Join-Path $Temporary 'project-payload.zip';Write-CanonicalZip $inputDirectory $zip
$archive=[IO.Compression.ZipFile]::OpenRead($zip)
try{if($archive.Entries.Count -ne 1 -or $archive.Entries[0].FullName -cne 'payload/nested/check.txt'){throw 'Nested separator normalization failed.'}}finally{$archive.Dispose()}
$hash=(Get-FileHash -LiteralPath $zip -Algorithm SHA256).Hash.ToLowerInvariant()
$bootstrap=(Get-Content -LiteralPath (Join-Path $Source 'InstallProject.ps1') -Raw -Encoding UTF8).Replace('@PROJECT_PAYLOAD_SHA256@',$hash)
$entry=Join-Path $Temporary 'InstallProject.ps1';[IO.File]::WriteAllText($entry,$bootstrap,[Text.UTF8Encoding]::new($false))
& powershell.exe -NoProfile -ExecutionPolicy Bypass -File $entry -ValidateOnly
if($LASTEXITCODE -ne 0){throw 'Pinned nested payload was rejected.'}
Write-Output 'PASS: canonical nested ZIP accepted by the unchanged production entry.'
