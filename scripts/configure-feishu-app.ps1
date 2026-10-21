param(
  [Parameter(Mandatory = $true)]
  [string]$NodeExe,

  [Parameter(Mandatory = $true)]
  [string]$LarkCliScript
)

$ErrorActionPreference = 'Stop'
$NodeExe = (Resolve-Path $NodeExe).Path
$LarkCliScript = (Resolve-Path $LarkCliScript).Path

$appId = $env:FEISHU_APP_ID
if (-not $appId) {
  $appId = Read-Host 'Feishu App ID'
}
if (-not $appId.Trim()) {
  throw 'Feishu App ID is empty.'
}

$appSecret = $env:FEISHU_APP_SECRET
$secretPtr = [IntPtr]::Zero

try {
  if (-not $appSecret) {
    $secureSecret = Read-Host 'Feishu App Secret (hidden)' -AsSecureString
    $secretPtr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secureSecret)
    $appSecret = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($secretPtr)
  }
  if (-not $appSecret) {
    throw 'Feishu App Secret is empty.'
  }

  $appSecret | & $NodeExe $LarkCliScript config init --app-id $appId.Trim() --app-secret-stdin --brand feishu --lang zh_cn
  exit $LASTEXITCODE
} finally {
  if ($secretPtr -ne [IntPtr]::Zero) {
    [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($secretPtr)
  }
}
