$ErrorActionPreference = 'Stop'

$root = Resolve-Path (Join-Path $PSScriptRoot '..')
$envPath = Join-Path $root '.env'

if (Test-Path $envPath) {
  $answer = Read-Host '.env already exists. Overwrite? (y/N)'
  if ($answer -ne 'y' -and $answer -ne 'Y') {
    Write-Host 'Skipped.'
    exit 0
  }
}

$appId = Read-Host 'Feishu App ID'
if (-not $appId.Trim()) {
  throw 'Feishu App ID is empty.'
}

$secureSecret = Read-Host 'Feishu App Secret (hidden)' -AsSecureString
$secretPtr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secureSecret)

try {
  $appSecret = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($secretPtr)
  if (-not $appSecret) {
    throw 'Feishu App Secret is empty.'
  }

  $lines = @(
    "FEISHU_APP_ID=$($appId.Trim())",
    "FEISHU_APP_SECRET=$appSecret",
    'PORT=3333',
    'SERVER_HOST=0.0.0.0'
  )

  Set-Content -Path $envPath -Value $lines -Encoding ASCII
  Write-Host '.env created in deployment folder.'
  Write-Host 'Do not copy this .env into shared deployment packages.'
} finally {
  if ($secretPtr -ne [IntPtr]::Zero) {
    [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($secretPtr)
  }
}
