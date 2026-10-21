param([switch]$ValidateOnly)
$ErrorActionPreference='Stop'
$expectedHash='@PROJECT_PAYLOAD_SHA256@'
$archivePath=Join-Path $PSScriptRoot 'project-payload.zip'
function Open-VerifiedArchive {
  if($expectedHash -notmatch '^[a-f0-9]{64}$' -or (Get-FileHash -LiteralPath $archivePath -Algorithm SHA256).Hash.ToLowerInvariant() -cne $expectedHash){throw 'Package SHA-256 mismatch.'}
  Add-Type -AssemblyName System.IO.Compression.FileSystem
  $archive=[IO.Compression.ZipFile]::OpenRead($archivePath)
  $seen=[Collections.Generic.HashSet[string]]::new([StringComparer]::OrdinalIgnoreCase)
  foreach($entry in $archive.Entries){if($entry.FullName -match '(^[/\\]|\\|:|(^|/)\.\.(/|$))' -or -not $seen.Add($entry.FullName) -or $entry.Length -gt 67108864 -or (($entry.ExternalAttributes -shr 16) -band 61440) -eq 40960){$archive.Dispose();throw 'Unsafe package entry.'}}
  if($archive.Entries.Count -gt 1000){$archive.Dispose();throw 'Unexpected package size.'}
  return $archive
}
try {
  $archive=Open-VerifiedArchive;$archive.Dispose()
  if($ValidateOnly){Write-Output 'Outer SHA-256 and archive paths passed.';exit 0}
  $identity=[Security.Principal.WindowsIdentity]::GetCurrent()
  if(-not ([Security.Principal.WindowsPrincipal]::new($identity)).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)){
    $process=Start-Process powershell.exe -ArgumentList @('-NoProfile','-ExecutionPolicy','Bypass','-File',('"'+$MyInvocation.MyCommand.Path+'"')) -Verb RunAs -WindowStyle Hidden -Wait -PassThru
    exit $process.ExitCode
  }
  $mutex=[Threading.Mutex]::new($false,'Global\OverseasProjectReleaseInstall')
  if(-not $mutex.WaitOne(0)){$mutex.Dispose();throw 'Another project installation is active.'}
  try {
    $stage=Join-Path $env:ProgramData ('VNET-Project-Install\'+[guid]::NewGuid().ToString('N'))
    $ancestor=$stage
    while($ancestor){if((Test-Path -LiteralPath $ancestor) -and ((Get-Item -LiteralPath $ancestor -Force).Attributes -band [IO.FileAttributes]::ReparsePoint)){throw 'Unsafe installation staging path.'};$ancestor=Split-Path -Parent $ancestor}
    [void][IO.Directory]::CreateDirectory($stage)
    $acl=[Security.AccessControl.DirectorySecurity]::new();$acl.SetAccessRuleProtection($true,$false)
    foreach($sid in @($identity.User,[Security.Principal.SecurityIdentifier]::new('S-1-5-18'),[Security.Principal.SecurityIdentifier]::new('S-1-5-32-544'))){$acl.AddAccessRule([Security.AccessControl.FileSystemAccessRule]::new($sid,'FullControl','ContainerInherit,ObjectInherit','None','Allow'))}
    Set-Acl -LiteralPath $stage -AclObject $acl
    $archive=Open-VerifiedArchive
    try {foreach($entry in $archive.Entries){$destination=Join-Path $stage $entry.FullName;[void][IO.Directory]::CreateDirectory((Split-Path -Parent $destination));[IO.Compression.ZipFileExtensions]::ExtractToFile($entry,$destination,$false)}}finally{$archive.Dispose()}
    $manifest=Get-Content -LiteralPath (Join-Path $stage 'release-manifest.json') -Raw -Encoding UTF8|ConvertFrom-Json
    foreach($tool in $manifest.tools.PSObject.Properties){if([IO.Path]::GetFileName($tool.Name) -cne $tool.Name -or (Get-FileHash -LiteralPath (Join-Path $stage $tool.Name) -Algorithm SHA256).Hash.ToLowerInvariant() -cne $tool.Value){throw 'Installer tool integrity failed.'}}
    & $manifest.node (Join-Path $stage 'install-runner.cjs') $stage
    if($LASTEXITCODE -ne 0){throw 'Update did not complete. Inspect the release report and .hotfix-transaction.json; recovery materials were retained.'}
    Add-Type -AssemblyName System.Windows.Forms
    [void][Windows.Forms.MessageBox]::Show('Update and HTTPS health checks passed. Open https://www.sm.sjhl.online:3333/ . Only the 3333 application was restarted.','Overseas project update','OK','Information')
  } finally {$mutex.ReleaseMutex();$mutex.Dispose()}
}catch{
  if($ValidateOnly){Write-Output 'Package validation failed.';exit 1}
  Add-Type -AssemblyName System.Windows.Forms
  [void][Windows.Forms.MessageBox]::Show($_.Exception.Message,'Overseas project update failed','OK','Error')
  exit 1
}
