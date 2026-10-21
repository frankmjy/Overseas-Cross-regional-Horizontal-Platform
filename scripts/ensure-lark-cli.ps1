param(
  [Parameter(Mandatory = $true)]
  [string]$Root,

  [Parameter(Mandatory = $true)]
  [string]$NodeExe
)

$ErrorActionPreference = 'Stop'
$Root = (Resolve-Path $Root).Path
$NodeExe = (Resolve-Path $NodeExe).Path
$NodeDir = Split-Path $NodeExe -Parent

function Get-LarkCliScript {
  param([string]$BaseDir)
  if (-not $BaseDir) {
    return $null
  }

  $script = Join-Path $BaseDir 'node_modules\@larksuite\cli\scripts\run.js'
  if (Test-Path $script -PathType Leaf) {
    return (Resolve-Path $script).Path
  }

  return $null
}

function Get-VendorLarkCliScript {
  param([string]$BaseDir)
  if (-not $BaseDir) {
    return $null
  }

  $script = Join-Path $BaseDir 'vendor\lark-cli\run.cjs'
  $exe = Join-Path $BaseDir 'vendor\lark-cli\bin\lark-cli.exe'
  if ((Test-Path $script -PathType Leaf) -and (Test-Path $exe -PathType Leaf)) {
    return (Resolve-Path $script).Path
  }

  return $null
}

function Write-LarkCliScript {
  param([string]$ScriptPath)
  if ($ScriptPath -and (Test-Path $ScriptPath -PathType Leaf)) {
    Write-Output (Resolve-Path $ScriptPath).Path
    exit 0
  }
}

function Get-NpmCommand {
  param(
    [string]$NpmNodeDir = $NodeDir
  )

  $candidates = @(
    (Join-Path $NpmNodeDir 'npm.cmd'),
    (Join-Path $NpmNodeDir 'npm')
  )

  foreach ($candidate in $candidates) {
    if (Test-Path $candidate -PathType Leaf) {
      return @{ Type = 'command'; Path = (Resolve-Path $candidate).Path }
    }
  }

  $npmCli = Join-Path $NpmNodeDir 'node_modules\npm\bin\npm-cli.js'
  if (Test-Path $npmCli -PathType Leaf) {
    return @{ Type = 'node-script'; Path = (Resolve-Path $npmCli).Path }
  }

  $pathNpm = Get-Command npm.cmd, npm -ErrorAction SilentlyContinue | Select-Object -First 1
  if ($pathNpm -and $pathNpm.Source) {
    return @{ Type = 'command'; Path = $pathNpm.Source }
  }

  return $null
}

$existing = @(
  $env:LARK_CLI_SCRIPT,
  (Get-VendorLarkCliScript $Root),
  (Get-LarkCliScript (Join-Path $Root '.runtime\lark-cli')),
  (Get-LarkCliScript $NodeDir)
) | Where-Object { $_ }

foreach ($script in $existing) {
  Write-LarkCliScript $script
}

$prefix = Join-Path $Root '.runtime\lark-cli'
New-Item -ItemType Directory -Path $prefix -Force | Out-Null

$installNodeExe = $NodeExe
$npm = Get-NpmCommand
if (-not $npm) {
  $nodeWithNpm = & (Join-Path $PSScriptRoot 'ensure-node.ps1') -Root $Root -RequireNpm | Select-Object -First 1
  if ($nodeWithNpm -and (Test-Path $nodeWithNpm -PathType Leaf)) {
    $installNodeExe = (Resolve-Path $nodeWithNpm).Path
    $npm = Get-NpmCommand -NpmNodeDir (Split-Path $installNodeExe -Parent)
  }
}
if (-not $npm) {
  throw 'npm was not found. Cannot install @larksuite/cli automatically.'
}

$installArgs = @('install', '@larksuite/cli', '--prefix', $prefix, '--omit=dev', '--no-audit', '--no-fund')

$installOutput = if ($npm.Type -eq 'node-script') {
  & $installNodeExe $npm.Path @installArgs 2>&1
} else {
  & $npm.Path @installArgs 2>&1
}
$installExitCode = $LASTEXITCODE

if ($installExitCode -ne 0) {
  throw "npm install @larksuite/cli failed with exit code $installExitCode.`n$($installOutput -join "`n")"
}

Write-LarkCliScript (Get-LarkCliScript $prefix)
throw 'lark-cli is still unavailable after installation.'
