param([string]$Cert,[string]$Key,[string]$Output,[string]$Prefix='')
$ErrorActionPreference='Stop'
Add-Type -AssemblyName System.IO.Compression
Add-Type -AssemblyName System.IO.Compression.FileSystem
$zip=[IO.Compression.ZipFile]::Open($Output,[IO.Compression.ZipArchiveMode]::Create)
try {
  [void][IO.Compression.ZipFileExtensions]::CreateEntryFromFile($zip,$Cert,($Prefix+'www.sm.sjhl.online_nginx/www.sm.sjhl.online_bundle.pem'))
  [void][IO.Compression.ZipFileExtensions]::CreateEntryFromFile($zip,$Key,($Prefix+'www.sm.sjhl.online_nginx/www.sm.sjhl.online.key'))
} finally {$zip.Dispose()}
