param(
  [string]$Domain = 'www.sm.sjhl.online',
  [string]$CertPath = '',
  [string]$KeyPath = '',
  [switch]$Auto
)

$ErrorActionPreference = 'Stop'

$root = Resolve-Path (Join-Path $PSScriptRoot '..')
$envPath = Join-Path $root '.env'

function Read-EnvFile {
  param([string]$Path)

  $result = [ordered]@{}
  if (-not (Test-Path $Path)) {
    return $result
  }

  Get-Content -Path $Path | ForEach-Object {
    $line = $_.Trim()
    if (-not $line -or $line.StartsWith('#') -or -not $line.Contains('=')) {
      return
    }

    $parts = $line.Split('=', 2)
    $name = $parts[0].Trim()
    if ($name) {
      $result[$name] = $parts[1]
    }
  }

  return $result
}

function Write-EnvFile {
  param(
    [string]$Path,
    [System.Collections.Specialized.OrderedDictionary]$Values
  )

  $lines = foreach ($key in $Values.Keys) {
    "$key=$($Values[$key])"
  }
  Set-Content -Path $Path -Value $lines -Encoding ASCII
}

$domain = if ($Auto) { $Domain } else { Read-Host 'Domain name, example www.sm.sjhl.online' }
if (-not $domain.Trim()) {
  throw 'Domain name is empty.'
}

$certPath = if ($Auto -and -not $CertPath) { "C:\certs\$($domain.Trim())\$($domain.Trim())-chain.pem" } elseif ($CertPath) { $CertPath } else { Read-Host 'Certificate PEM path, example C:\certs\www.sm.sjhl.online\www.sm.sjhl.online-chain.pem' }
if (-not (Test-Path $certPath -PathType Leaf)) {
  throw "Certificate file not found: $certPath"
}

$keyPath = if ($Auto -and -not $KeyPath) { "C:\certs\$($domain.Trim())\$($domain.Trim())-key.pem" } elseif ($KeyPath) { $KeyPath } else { Read-Host 'Private key PEM path, example C:\certs\www.sm.sjhl.online\www.sm.sjhl.online-key.pem' }
if (-not (Test-Path $keyPath -PathType Leaf)) {
  throw "Private key file not found: $keyPath"
}

$values = Read-EnvFile $envPath
$values['PUBLIC_DOMAIN'] = $domain.Trim()
$values['HTTPS_CERT_PATH'] = (Resolve-Path $certPath).Path
$values['HTTPS_KEY_PATH'] = (Resolve-Path $keyPath).Path
$values['SERVER_HOST'] = if ($values['SERVER_HOST']) { $values['SERVER_HOST'] } else { '0.0.0.0' }
$values['PORT'] = if ($values['PORT']) { $values['PORT'] } else { '3333' }

$values.Remove('HTTPS_PFX_PATH')
$values.Remove('HTTPS_PFX_PASSPHRASE')
$values.Remove('HTTPS_PFX_PASSPHRASE_FILE')

Write-EnvFile -Path $envPath -Values $values

Write-Host ".env updated for $($domain.Trim())."
Write-Host 'Restart the service after certificate configuration.'
