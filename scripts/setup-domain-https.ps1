param(
  [string]$Domain = $(if ($env:PUBLIC_DOMAIN) { $env:PUBLIC_DOMAIN } else { 'www.sm.sjhl.online' }),
  [string]$Email = $env:ACME_EMAIL,
  [int]$Port = $(if ($env:PORT) { [int]$env:PORT } else { 3333 }),
  [string]$CertZipPath = $env:CERT_ZIP_PATH,
  [switch]$SkipDnsCheck
)

$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'

$root = Resolve-Path (Join-Path $PSScriptRoot '..')
$envPath = Join-Path $root '.env'
$domain = $Domain.Trim().ToLowerInvariant()
if (-not $domain) {
  throw 'Domain is empty.'
}
if ($env:SKIP_DNS_CHECK -eq '1') {
  $SkipDnsCheck = $true
}

function Test-Admin {
  $identity = [Security.Principal.WindowsIdentity]::GetCurrent()
  $principal = [Security.Principal.WindowsPrincipal]::new($identity)
  return $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
}

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

function Get-DefaultEmail {
  param([string]$Name)

  $parts = $Name.Split('.') | Where-Object { $_ }
  if ($parts.Count -ge 2) {
    return "admin@$($parts[-2]).$($parts[-1])"
  }
  return "admin@$Name"
}

function Get-PublicIp {
  try {
    return (Invoke-RestMethod -Uri 'https://api.ipify.org' -TimeoutSec 10).Trim()
  } catch {
    return ''
  }
}

function Resolve-DomainIps {
  param([string]$Name)

  try {
    return @(Resolve-DnsName -Name $Name -Type A -ErrorAction Stop |
      Where-Object { $_.IPAddress } |
      Select-Object -ExpandProperty IPAddress -Unique)
  } catch {
    return @()
  }
}

function Ensure-FirewallRule {
  param(
    [string]$Name,
    [int]$RulePort
  )

  $existing = Get-NetFirewallRule -DisplayName $Name -ErrorAction SilentlyContinue
  if ($existing) {
    return
  }

  New-NetFirewallRule `
    -DisplayName $Name `
    -Direction Inbound `
    -Action Allow `
    -Protocol TCP `
    -LocalPort $RulePort | Out-Null
}

function Ensure-WinAcme {
  $wacsFromPath = Get-Command wacs.exe -ErrorAction SilentlyContinue | Select-Object -First 1
  if ($wacsFromPath -and $wacsFromPath.Source) {
    return $wacsFromPath.Source
  }

  $toolDir = Join-Path $root '.runtime\win-acme'
  $existing = Join-Path $toolDir 'wacs.exe'
  if (Test-Path $existing -PathType Leaf) {
    return (Resolve-Path $existing).Path
  }

  New-Item -ItemType Directory -Path $toolDir -Force | Out-Null
  [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

  Write-Host 'Downloading win-acme...'
  $release = Invoke-RestMethod `
    -Uri 'https://api.github.com/repos/win-acme/win-acme/releases/latest' `
    -Headers @{ 'User-Agent' = 'overseas-project-management-setup' } `
    -TimeoutSec 30
  $asset = $release.assets |
    Where-Object { $_.name -match 'x64.*trimmed\.zip$' } |
    Select-Object -First 1
  if (-not $asset) {
    throw 'Cannot find win-acme x64 trimmed release asset.'
  }

  $zipPath = Join-Path $toolDir $asset.name
  Invoke-WebRequest -Uri $asset.browser_download_url -OutFile $zipPath -TimeoutSec 120
  Expand-Archive -Path $zipPath -DestinationPath $toolDir -Force
  Remove-Item -Path $zipPath -Force

  if (-not (Test-Path $existing -PathType Leaf)) {
    throw 'win-acme downloaded but wacs.exe was not found.'
  }

  return (Resolve-Path $existing).Path
}

function Find-CertFiles {
  param(
    [string]$CertDir,
    [string]$Name
  )

  $chain = Join-Path $CertDir "$Name-chain.pem"
  $cert = Join-Path $CertDir "$Name-crt.pem"
  $key = Join-Path $CertDir "$Name-key.pem"

  if (-not (Test-Path $chain -PathType Leaf)) {
    $chain = $cert
  }
  if (-not (Test-Path $chain -PathType Leaf)) {
    $chain = Get-ChildItem -Path $CertDir -Filter '*chain.pem' -File -ErrorAction SilentlyContinue |
      Sort-Object LastWriteTime -Descending |
      Select-Object -First 1 -ExpandProperty FullName
  }
  if (-not (Test-Path $key -PathType Leaf)) {
    $key = Get-ChildItem -Path $CertDir -Filter '*key.pem' -File -ErrorAction SilentlyContinue |
      Sort-Object LastWriteTime -Descending |
      Select-Object -First 1 -ExpandProperty FullName
  }

  if (-not $chain -or -not (Test-Path $chain -PathType Leaf)) {
    throw 'Certificate PEM file was not found after win-acme run.'
  }
  if (-not $key -or -not (Test-Path $key -PathType Leaf)) {
    throw 'Private key PEM file was not found after win-acme run.'
  }

  return @{
    Cert = (Resolve-Path $chain).Path
    Key = (Resolve-Path $key).Path
  }
}

function Get-ApexDomain {
  param([string]$Name)

  if ($Name.StartsWith('www.')) {
    return $Name.Substring(4)
  }
  return $Name
}

function Get-DefaultCertZipNames {
  param([string]$Name)

  $apex = Get-ApexDomain $Name
  return @(
    "$Name`_root.zip",
    "$apex`_root.zip",
    "$Name.zip",
    "$apex.zip"
  ) | Select-Object -Unique
}

function Find-ProvidedCertZip {
  param(
    [string]$Name,
    [string]$ExplicitPath
  )

  if ($ExplicitPath) {
    if (Test-Path $ExplicitPath -PathType Leaf) {
      return (Resolve-Path $ExplicitPath).Path
    }
    throw "CERT_ZIP_PATH was set but file was not found: $ExplicitPath"
  }

  $dirs = @(
    $root,
    (Join-Path $root 'certs'),
    (Join-Path $env:USERPROFILE 'Downloads')
  ) | Where-Object { $_ } | Select-Object -Unique

  foreach ($dir in $dirs) {
    foreach ($zipName in (Get-DefaultCertZipNames $Name)) {
      $candidate = Join-Path $dir $zipName
      if (Test-Path $candidate -PathType Leaf) {
        return (Resolve-Path $candidate).Path
      }
    }
  }

  return ''
}

function Get-FileScore {
  param(
    [System.IO.FileInfo]$File,
    [string[]]$PreferredNames,
    [string]$Kind
  )

  $name = $File.Name.ToLowerInvariant()
  $score = 0
  foreach ($preferred in $PreferredNames) {
    if ($preferred -and $name.Contains($preferred.ToLowerInvariant())) {
      $score += 100
    }
  }

  if ($Kind -eq 'cert') {
    if ($name.EndsWith('.pem')) { $score += 20 }
    if ($name.EndsWith('.crt')) { $score += 15 }
    if ($name.Contains('bundle') -or $name.Contains('chain') -or $name.Contains('fullchain')) { $score += 40 }
    if ($name.Contains('csr') -or $name.Contains('key')) { $score -= 200 }
  } else {
    if ($name.EndsWith('.key')) { $score += 50 }
    if ($name.EndsWith('key.pem')) { $score += 50 }
    if ($name.Contains('key')) { $score += 30 }
    if ($name.Contains('bundle') -or $name.Contains('chain') -or $name.Contains('csr')) { $score -= 200 }
  }

  return $score
}

function Select-CertArchiveFile {
  param(
    [System.IO.FileInfo[]]$Files,
    [string[]]$PreferredNames,
    [string]$Kind
  )

  $ranked = $Files |
    Where-Object {
      if ($Kind -eq 'cert') {
        $_.Extension.ToLowerInvariant() -in @('.pem', '.crt') -and -not $_.Name.ToLowerInvariant().Contains('csr')
      } else {
        $_.Extension.ToLowerInvariant() -in @('.key', '.pem') -and $_.Name.ToLowerInvariant().Contains('key')
      }
    } |
    ForEach-Object {
      [pscustomobject]@{
        File = $_
        Score = Get-FileScore -File $_ -PreferredNames $PreferredNames -Kind $Kind
      }
    } |
    Sort-Object Score -Descending

  $selected = $ranked | Select-Object -First 1
  if (-not $selected -or $selected.Score -le 0) {
    throw "Cannot find $Kind file in provided certificate archive."
  }

  return $selected.File
}

function Install-ProvidedCertZip {
  param(
    [string]$ZipPath,
    [string]$Name
  )

  $temp = Join-Path $env:TEMP ("overseas-cert-" + [guid]::NewGuid().ToString('N'))
  New-Item -ItemType Directory -Path $temp -Force | Out-Null
  try {
    Expand-Archive -Path $ZipPath -DestinationPath $temp -Force
    $files = @(Get-ChildItem -Path $temp -Recurse -File)
    $preferred = @($Name, (Get-ApexDomain $Name))
    $certFile = Select-CertArchiveFile -Files $files -PreferredNames $preferred -Kind 'cert'
    $keyFile = Select-CertArchiveFile -Files $files -PreferredNames $preferred -Kind 'key'

    $certDir = "C:\certs\$Name"
    New-Item -ItemType Directory -Path $certDir -Force | Out-Null

    $certDest = Join-Path $certDir "$Name-chain.pem"
    $keyDest = Join-Path $certDir "$Name-key.pem"
    Copy-Item -LiteralPath $certFile.FullName -Destination $certDest -Force
    Copy-Item -LiteralPath $keyFile.FullName -Destination $keyDest -Force

    return @{
      Cert = (Resolve-Path $certDest).Path
      Key = (Resolve-Path $keyDest).Path
    }
  } finally {
    if (Test-Path $temp) {
      Remove-Item -LiteralPath $temp -Recurse -Force
    }
  }
}

function Write-HttpsEnv {
  param(
    [string]$Name,
    [string]$Cert,
    [string]$Key
  )

  $values = Read-EnvFile $envPath
  $values['PUBLIC_DOMAIN'] = $Name
  $values['HTTPS_CERT_PATH'] = $Cert
  $values['HTTPS_KEY_PATH'] = $Key
  $values['SERVER_HOST'] = '0.0.0.0'
  $values['PORT'] = [string]$Port
  $values.Remove('HTTPS_PFX_PATH')
  $values.Remove('HTTPS_PFX_PASSPHRASE')
  $values.Remove('HTTPS_PFX_PASSPHRASE_FILE')
  Write-EnvFile -Path $envPath -Values $values
}

function Test-DnsMatchesServer {
  param([string]$Name)

  if ($SkipDnsCheck) {
    return $true
  }

  $publicIp = Get-PublicIp
  $domainIps = Resolve-DomainIps $Name
  Write-Host "Server public IP: $publicIp"
  Write-Host "Domain A record: $($domainIps -join ', ')"

  if ($publicIp -and $domainIps.Count -gt 0 -and -not ($domainIps -contains $publicIp)) {
    return $false
  }

  return $true
}

function Restart-ProjectService {
  Write-Host 'Restarting service...'
  $env:NO_PAUSE = '1'
  & cmd /c "`"$root\stop-3333.bat`""
  & cmd /c "`"$root\start-3333.bat`""
  Remove-Item Env:NO_PAUSE -ErrorAction SilentlyContinue
}

if (-not (Test-Admin)) {
  throw 'Please run setup-domain-https.bat as Administrator.'
}

if (-not $Email) {
  $Email = Get-DefaultEmail $domain
}

Write-Host "Domain: $domain"
Write-Host "ACME email: $Email"
Write-Host "Service port: $Port"

Ensure-FirewallRule -Name "Overseas Project HTTPS $Port" -RulePort $Port

$providedCertZip = Find-ProvidedCertZip -Name $domain -ExplicitPath $CertZipPath
if ($providedCertZip) {
  Write-Host "Using provided certificate archive: $providedCertZip"
  $certFiles = Install-ProvidedCertZip -ZipPath $providedCertZip -Name $domain
  Write-HttpsEnv -Name $domain -Cert $certFiles.Cert -Key $certFiles.Key
  if (-not (Test-DnsMatchesServer $domain)) {
    Write-Warning "DNS mismatch. $domain does not resolve to this server public IP. HTTPS is configured, but external users must access the server through the matching domain."
  }
  Restart-ProjectService
  Write-Host "Trusted HTTPS should be available at: https://$domain`:$Port/"
  exit 0
}

if (-not (Test-DnsMatchesServer $domain)) {
  throw "DNS mismatch. $domain does not resolve to this server public IP. Update the domain A record first, or set SKIP_DNS_CHECK=1 if this server is behind a proxy."
}

$wacs = Ensure-WinAcme
$certDir = "C:\certs\$domain"
New-Item -ItemType Directory -Path $certDir -Force | Out-Null
Ensure-FirewallRule -Name 'win-acme HTTP validation 80' -RulePort 80

Write-Host 'Requesting trusted certificate with win-acme...'
& $wacs `
  --source manual `
  --host $domain `
  --validation selfhosting `
  --store pemfiles `
  --pemfilespath $certDir `
  --pemfilesname $domain `
  --installation none `
  --accepttos `
  --emailaddress $Email

if ($LASTEXITCODE -ne 0) {
  throw "win-acme failed with exit code $LASTEXITCODE."
}

$certFiles = Find-CertFiles -CertDir $certDir -Name $domain
Write-HttpsEnv -Name $domain -Cert $certFiles.Cert -Key $certFiles.Key
Restart-ProjectService

Write-Host "Trusted HTTPS should be available at: https://$domain`:$Port/"
