function Write-CanonicalZip([string]$Source,[string]$Destination) {
  Add-Type -AssemblyName System.IO.Compression
  Add-Type -AssemblyName System.IO.Compression.FileSystem
  $Source=[IO.Path]::GetFullPath($Source).TrimEnd('\')
  $archive=[IO.Compression.ZipFile]::Open($Destination,[IO.Compression.ZipArchiveMode]::Create)
  try {foreach($file in Get-ChildItem -LiteralPath $Source -Recurse -File -Force){if($file.Attributes -band [IO.FileAttributes]::ReparsePoint){throw 'Archive source reparse point rejected.'};$relative=$file.FullName.Substring($Source.Length+1).Replace('\','/');[void][IO.Compression.ZipFileExtensions]::CreateEntryFromFile($archive,$file.FullName,$relative,[IO.Compression.CompressionLevel]::Optimal)}}finally{$archive.Dispose()}
}
