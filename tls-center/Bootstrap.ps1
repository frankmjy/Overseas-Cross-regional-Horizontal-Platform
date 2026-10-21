param([switch]$ValidateOnly)
$ErrorActionPreference='Stop'
$expectedHash='@PAYLOAD_SHA256@'
$payload=Join-Path $PSScriptRoot 'payload.zip'
$allowed=@('certificate.cjs','preload.cjs','manage.cjs','InstallSupport.ps1','ImportCertificate.ps1','UpdateCertificate.bat','Uninstall.ps1','Uninstall.bat','Verify.ps1','Verify.bat','Status.bat','Install.ps1','Install.bat','README.md','manifest.json')
function Assert-Payload {
  if($expectedHash -notmatch '^[a-f0-9]{64}$' -or (Get-FileHash -LiteralPath $payload -Algorithm SHA256).Hash.ToLowerInvariant() -cne $expectedHash){throw 'Payload integrity check failed. No system changes were made.'}
  Add-Type -AssemblyName System.IO.Compression.FileSystem
  $archive=[IO.Compression.ZipFile]::OpenRead($payload)
  try {
    if($archive.Entries.Count -ne $allowed.Count){throw 'Unexpected payload entry count.'}
    $seen=@{}
    foreach($entry in $archive.Entries) {
      if($entry.FullName -cnotin $allowed -or $seen.ContainsKey($entry.FullName) -or $entry.Length -gt 262144 -or (($entry.ExternalAttributes -shr 16) -band 61440) -eq 40960){throw 'Unsafe payload entry.'}
      $seen[$entry.FullName]=$true
    }
  } finally {$archive.Dispose()}
}
try {
  Assert-Payload
  if($ValidateOnly){Write-Output 'Payload SHA-256 and archive paths verified; no system changes.';exit 0}
  $identity=[Security.Principal.WindowsIdentity]::GetCurrent()
  if(-not ([Security.Principal.WindowsPrincipal]::new($identity)).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
    $process=Start-Process powershell.exe -ArgumentList @('-NoProfile','-ExecutionPolicy','Bypass','-File',('"'+$MyInvocation.MyCommand.Path+'"')) -Verb RunAs -WindowStyle Hidden -PassThru -Wait
    exit $process.ExitCode
  }
  Assert-Payload
  $parent=Join-Path $env:ProgramData 'VNET-TLS-Install-Staging'
  $ancestor=$parent
  while($ancestor){if((Test-Path -LiteralPath $ancestor) -and ((Get-Item -LiteralPath $ancestor -Force).Attributes -band [IO.FileAttributes]::ReparsePoint)){throw 'Unsafe installation staging path.'};$ancestor=Split-Path -Parent $ancestor}
  if(-not (Test-Path -LiteralPath $parent)) {
    New-Item -ItemType Directory -Path $parent|Out-Null
    $acl=[Security.AccessControl.DirectorySecurity]::new();$acl.SetAccessRuleProtection($true,$false)
    foreach($sid in @($identity.User,[Security.Principal.SecurityIdentifier]::new('S-1-5-18'),[Security.Principal.SecurityIdentifier]::new('S-1-5-32-544'))){$acl.AddAccessRule([Security.AccessControl.FileSystemAccessRule]::new($sid,'FullControl','ContainerInherit,ObjectInherit','None','Allow'))}
    Set-Acl -LiteralPath $parent -AclObject $acl
  }
  $staging=Join-Path $parent ([guid]::NewGuid().ToString('N'))
  New-Item -ItemType Directory -Path $staging|Out-Null
  $archive=[IO.Compression.ZipFile]::OpenRead($payload)
  try {
    foreach($entry in $archive.Entries){[IO.Compression.ZipFileExtensions]::ExtractToFile($entry,(Join-Path $staging $entry.FullName),$false)}
  } finally {$archive.Dispose()}
  & (Join-Path $staging 'Install.ps1')
} catch {
  if($ValidateOnly){Write-Error 'Payload validation failed.';exit 1}
  Add-Type -AssemblyName System.Windows.Forms
  [void][Windows.Forms.MessageBox]::Show($_.Exception.Message,'VNET TLS - configuration not completed','OK','Error')
  exit 1
}
