param([string]$Source,[string]$Output,[string]$Variant='valid')
$ErrorActionPreference='Stop'
Add-Type -AssemblyName System.IO.Compression
Add-Type -AssemblyName System.IO.Compression.FileSystem
$names=@('certificate.cjs','preload.cjs','manage.cjs','InstallSupport.ps1','ImportCertificate.ps1','UpdateCertificate.bat','Uninstall.ps1','Uninstall.bat','Verify.ps1','Verify.bat','Status.bat','Install.ps1','Install.bat','README.md','manifest.json')
if($Variant -eq 'traversal'){$names[0]='../certificate.cjs'}
if($Variant -eq 'duplicate'){$names[0]='preload.cjs'}
$payload=Join-Path $Output 'payload.zip'
$archive=[IO.Compression.ZipFile]::Open($payload,[IO.Compression.ZipArchiveMode]::Create)
try {foreach($name in $names){$entry=$archive.CreateEntry($name);$stream=$entry.Open();try{$stream.WriteByte(32)}finally{$stream.Dispose()}}}finally{$archive.Dispose()}
$hash=(Get-FileHash -LiteralPath $payload -Algorithm SHA256).Hash.ToLowerInvariant()
$bootstrap=(Get-Content -LiteralPath (Join-Path $Source 'Bootstrap.ps1') -Raw -Encoding UTF8).Replace('@PAYLOAD_SHA256@',$hash)
[IO.File]::WriteAllText((Join-Path $Output 'Bootstrap.ps1'),$bootstrap,[Text.UTF8Encoding]::new($false))
if($Variant -eq 'tampered'){$stream=[IO.File]::Open($payload,[IO.FileMode]::Append);try{$stream.WriteByte(0)}finally{$stream.Dispose()}}
