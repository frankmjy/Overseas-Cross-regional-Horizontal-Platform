param(
  [string]$Root = (Join-Path $env:ProgramData 'VNET\TLSCenter'),
  [string]$ZipPath = '',
  [string]$CertPath = '',
  [string]$KeyPath = '',
  [switch]$Initialize
)
$ErrorActionPreference = 'Stop'
$rootPath = [IO.Path]::GetFullPath($Root)
if (-not (Test-Path -LiteralPath $rootPath -PathType Container)) { throw 'TLS center is not installed.' }
$ancestor=$rootPath
while($ancestor){if((Test-Path -LiteralPath $ancestor) -and ((Get-Item -LiteralPath $ancestor -Force).Attributes -band [IO.FileAttributes]::ReparsePoint)){throw 'TLS center path must not contain reparse points.'};$ancestor=Split-Path -Parent $ancestor}
$configPath = Join-Path $rootPath 'settings.json'
$config = Get-Content -LiteralPath $configPath -Raw -Encoding UTF8 | ConvertFrom-Json
$inbox = Join-Path $rootPath 'inbox'
if (-not (Test-Path -LiteralPath $inbox)) { New-Item -ItemType Directory -Path $inbox | Out-Null }
if ((Get-Item -LiteralPath $inbox).Attributes -band [IO.FileAttributes]::ReparsePoint) { throw 'Inbox must not be a reparse point.' }

function Read-PairFile([string]$File) {
  $item = Get-Item -LiteralPath $File -ErrorAction Stop
  if ($item.PSIsContainer -or $item.Length -gt 131072 -or ($item.Attributes -band [IO.FileAttributes]::ReparsePoint)) { throw 'Unsafe certificate input.' }
  return [IO.File]::ReadAllBytes($item.FullName)
}
if (-not $ZipPath -and (-not $CertPath -or -not $KeyPath)) {
  Add-Type -AssemblyName System.Windows.Forms
  $dialog = [Windows.Forms.OpenFileDialog]::new()
  $dialog.Title = 'Choose the existing 3001 certificate ZIP (certificate and key)'
  $dialog.Filter = 'Certificate ZIP (*.zip)|*.zip'
  if ($dialog.ShowDialog() -ne [Windows.Forms.DialogResult]::OK) { throw 'Certificate selection canceled; active certificate unchanged.' }
  $ZipPath = $dialog.FileName
}
if ($ZipPath) {
  if((Get-Item -LiteralPath $ZipPath).Length -gt 4194304){throw 'Certificate ZIP exceeds the 4 MiB limit.'}
  Add-Type -AssemblyName System.IO.Compression.FileSystem
  $archive = [IO.Compression.ZipFile]::OpenRead($ZipPath)
  try {
    if($archive.Entries.Count -gt 64){throw 'Certificate ZIP has too many entries.'}
    if(@($archive.Entries|Where-Object{$_.FullName -match '(^[/\\]|:|(^|[/\\])\.\.([/\\]|$))'}).Count){throw 'Unsafe certificate ZIP path.'}
    $certEntries = @($archive.Entries | Where-Object { $_.Name -match '^www\.sm\.sjhl\.online_(bundle|chain|fullchain)\.(pem|crt)$' } | Sort-Object @{Expression={if ($_.Name.EndsWith('.pem')) {0} else {1}}})
    $keyEntries = @($archive.Entries | Where-Object { $_.Name -eq 'www.sm.sjhl.online.key' })
    if (-not $certEntries.Count -or $keyEntries.Count -ne 1) { throw 'ZIP must contain the domain certificate bundle and exactly one matching private key.' }
    if(@($certEntries|Where-Object{$_.Name.EndsWith('.pem')}).Count -gt 1 -or (@($certEntries|Where-Object{$_.Name.EndsWith('.pem')}).Count -eq 0 -and $certEntries.Count -gt 1)){throw 'Certificate ZIP has ambiguous certificate candidates.'}
    $pair = @()
    foreach ($entry in @($certEntries[0],$keyEntries[0])) {
      if ($entry.Length -le 0 -or $entry.Length -gt 131072 -or (($entry.ExternalAttributes -shr 16) -band 61440) -eq 40960) { throw 'Unsafe certificate ZIP entry.' }
      $stream=$entry.Open(); $memory=[IO.MemoryStream]::new()
      try { $stream.CopyTo($memory); $pair += ,$memory.ToArray() } finally { $stream.Dispose(); $memory.Dispose() }
    }
    $certificate=$pair[0]; $privateKey=$pair[1]
  } finally { $archive.Dispose() }
} else { $certificate=Read-PairFile $CertPath; $privateKey=Read-PairFile $KeyPath }

$candidate = Join-Path $rootPath ('candidate-' + [guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $candidate | Out-Null
$candidateCert = Join-Path $candidate 'fullchain.pem'; $candidateKey = Join-Path $candidate 'privkey.pem'
[IO.File]::WriteAllBytes($candidateCert,$certificate); [IO.File]::WriteAllBytes($candidateKey,$privateKey)
try {
  & $config.node (Join-Path $rootPath 'manage.cjs') validate $rootPath $candidateCert $candidateKey
  if ($LASTEXITCODE -ne 0) { throw 'Certificate validation rejected the candidate; active certificate unchanged.' }
  foreach ($item in @(@('fullchain.pem',$certificate),@('privkey.pem',$privateKey))) {
    $target=Join-Path $inbox $item[0]; $temp=$target + '.' + [guid]::NewGuid().ToString('N') + '.tmp'
    [IO.File]::WriteAllBytes($temp,$item[1])
    if (Test-Path -LiteralPath $target) { [IO.File]::Replace($temp,$target,[NullString]::Value) } else { [IO.File]::Move($temp,$target) }
  }
  & $config.node (Join-Path $rootPath 'manage.cjs') import $rootPath $candidateCert $candidateKey
  if ($LASTEXITCODE -ne 0) { throw 'Certificate activation failed; watcher will retry the validated inbox pair.' }
  Write-Host 'Certificate accepted. Running Node.js web listeners reload within approximately 2 seconds.'
} finally {
  # Delete only the two files created by this invocation; never recursively remove a supplied path.
  foreach ($file in @($candidateCert,$candidateKey)) { if (Test-Path -LiteralPath $file) { [IO.File]::Delete($file) } }
  if ([IO.Directory]::Exists($candidate)) { [IO.Directory]::Delete($candidate) }
}
