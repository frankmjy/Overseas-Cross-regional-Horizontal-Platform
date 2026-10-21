$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $root

$envFile = Join-Path $root ".env"
if (Test-Path $envFile) {
  Get-Content -Path $envFile | ForEach-Object {
    $line = $_.Trim()
    if (-not $line -or $line.StartsWith("#") -or -not $line.Contains("=")) {
      return
    }

    $parts = $line.Split("=", 2)
    $name = $parts[0].Trim()
    $value = $parts[1]
    if ($name -and -not [Environment]::GetEnvironmentVariable($name, "Process")) {
      [Environment]::SetEnvironmentVariable($name, $value, "Process")
    }
  }
}

$env:PORT = if ($env:PORT) { $env:PORT } else { "3333" }
$env:SERVER_HOST = if ($env:SERVER_HOST) { $env:SERVER_HOST } else { "0.0.0.0" }

$node = & (Join-Path $root "scripts\ensure-node.ps1") -Root $root | Select-Object -First 1
if (-not $node -or -not (Test-Path $node)) {
  throw "Node.js runtime is unavailable."
}

$larkCliScript = & (Join-Path $root "scripts\ensure-lark-cli.ps1") -Root $root -NodeExe $node | Select-Object -First 1
if (-not $larkCliScript -or -not (Test-Path $larkCliScript)) {
  throw "lark-cli dependency is unavailable."
}

$env:LARK_CLI_SCRIPT = $larkCliScript
if ($env:FEISHU_APP_ID -and $env:FEISHU_APP_SECRET) {
  & (Join-Path $root "scripts\configure-feishu-app.ps1") -NodeExe $node -LarkCliScript $larkCliScript
}
& $node "server.mjs"
