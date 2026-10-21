param(
  [string]$Root = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path,
  [switch]$RequireNpm
)

$ErrorActionPreference = 'Stop'
$Root = (Resolve-Path $Root).Path

function Write-NodePath {
  param([string]$Path)
  if ($Path -and (Test-NodePath $Path)) {
    Write-Output (Resolve-Path $Path).Path
    exit 0
  }
}

function Test-NodeHasNpm {
  param([string]$Path)
  if (-not $Path -or -not (Test-Path $Path -PathType Leaf)) {
    return $false
  }

  $nodeDir = Split-Path $Path -Parent
  $npmCandidates = @(
    (Join-Path $nodeDir 'npm.cmd'),
    (Join-Path $nodeDir 'npm'),
    (Join-Path $nodeDir 'node_modules\npm\bin\npm-cli.js')
  )

  foreach ($candidate in $npmCandidates) {
    if (Test-Path $candidate -PathType Leaf) {
      return $true
    }
  }

  return $false
}

function Test-NodePath {
  param([string]$Path)
  if (-not $Path -or -not (Test-Path $Path -PathType Leaf)) {
    return $false
  }
  if ($RequireNpm -and -not (Test-NodeHasNpm $Path)) {
    return $false
  }
  return $true
}

function Find-NodeInFolder {
  param([string]$Folder)
  if (-not $Folder -or -not (Test-Path $Folder -PathType Container)) {
    return $null
  }

  $candidates = @(
    (Join-Path $Folder 'node.exe'),
    (Join-Path $Folder 'node\node.exe'),
    (Join-Path $Folder '.runtime\node\node.exe')
  )

  foreach ($candidate in $candidates) {
    if (Test-Path $candidate -PathType Leaf) {
      $resolved = (Resolve-Path $candidate).Path
      if (Test-NodePath $resolved) {
        return $resolved
      }
    }
  }

  return $null
}

function Find-ReusableNode {
  $paths = New-Object System.Collections.Generic.List[string]

  if ($env:NODE_EXE) {
    $paths.Add($env:NODE_EXE)
  }

  $commands = Get-Command node.exe, node -ErrorAction SilentlyContinue
  foreach ($command in $commands) {
    if ($command.Source) {
      $paths.Add($command.Source)
    }
  }

  $paths.Add((Join-Path $Root '.runtime\node\node.exe'))
  $paths.Add('C:\ai\nantong-schedule-20260428-101724\.runtime\node\node.exe')

  $parent = Split-Path $Root -Parent
  foreach ($base in @($parent, 'C:\ai')) {
    if (-not $base -or -not (Test-Path $base -PathType Container)) {
      continue
    }
    Get-ChildItem -Path $base -Directory -ErrorAction SilentlyContinue | ForEach-Object {
      $found = Find-NodeInFolder $_.FullName
      if ($found) {
        $paths.Add($found)
      }
    }
  }

  foreach ($path in ($paths | Select-Object -Unique)) {
    if (Test-NodePath $path) {
      return (Resolve-Path $path).Path
    }
  }

  return $null
}

function Install-PortableNode {
  $runtimeRoot = Join-Path $Root '.runtime'
  $nodeDir = Join-Path $runtimeRoot 'node'
  $downloadDir = Join-Path $runtimeRoot 'download'
  New-Item -ItemType Directory -Path $runtimeRoot, $downloadDir -Force | Out-Null

  $arch = if ([Environment]::Is64BitOperatingSystem) { 'win-x64' } else { 'win-x86' }
  $fileKey = "$arch-zip"
  $downloadUrl = $env:NODE_DOWNLOAD_URL
  $version = $env:NODE_VERSION

  if (-not $downloadUrl) {
    $index = Invoke-RestMethod -Uri 'https://nodejs.org/dist/index.json' -UseBasicParsing
    $entry = $index | Where-Object {
      $_.version -like 'v22.*' -and $_.files -contains $fileKey
    } | Select-Object -First 1

    if (-not $entry) {
      throw "Cannot resolve a Node.js $arch download from nodejs.org."
    }

    $version = $entry.version
    $downloadUrl = "https://nodejs.org/dist/$version/node-$version-$arch.zip"
  }

  $zipPath = Join-Path $downloadDir 'node.zip'
  Invoke-WebRequest -Uri $downloadUrl -OutFile $zipPath -UseBasicParsing

  $extractDir = Join-Path $downloadDir 'extract'
  if (Test-Path $extractDir) {
    Remove-Item -Path $extractDir -Recurse -Force
  }
  New-Item -ItemType Directory -Path $extractDir -Force | Out-Null
  Expand-Archive -Path $zipPath -DestinationPath $extractDir -Force

  $nodeExe = Get-ChildItem -Path $extractDir -Recurse -Filter node.exe | Select-Object -First 1
  if (-not $nodeExe) {
    throw 'Downloaded Node.js package does not contain node.exe.'
  }

  $sourceDir = Split-Path $nodeExe.FullName -Parent
  if (Test-Path $nodeDir) {
    Remove-Item -Path $nodeDir -Recurse -Force
  }
  New-Item -ItemType Directory -Path $nodeDir -Force | Out-Null
  Copy-Item -Path (Join-Path $sourceDir '*') -Destination $nodeDir -Recurse -Force

  return (Join-Path $nodeDir 'node.exe')
}

$nodePath = Find-ReusableNode
if (-not $nodePath) {
  $nodePath = Install-PortableNode
}

Write-NodePath $nodePath
throw 'Node.js runtime is still unavailable.'
