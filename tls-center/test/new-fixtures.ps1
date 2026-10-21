param([Parameter(Mandatory=$true)][string]$Destination)
$ErrorActionPreference = 'Stop'
if (Test-Path -LiteralPath $Destination) { throw 'Fixture directory already exists.' }
New-Item -ItemType Directory -Path $Destination | Out-Null
function Pem([string]$Label,[byte[]]$Bytes) {
  return "-----BEGIN $Label-----`n" + [Convert]::ToBase64String($Bytes,[Base64FormattingOptions]::InsertLineBreaks) + "`n-----END $Label-----`n"
}
function B64Url([byte[]]$Bytes) { return [Convert]::ToBase64String($Bytes).TrimEnd('=').Replace('+','-').Replace('/','_') }
$issuerKey = [System.Security.Cryptography.RSACng]::new(2048)
$issuerRequest = [System.Security.Cryptography.X509Certificates.CertificateRequest]::new('CN=VNET Isolated Test CA',$issuerKey,[System.Security.Cryptography.HashAlgorithmName]::SHA256,[System.Security.Cryptography.RSASignaturePadding]::Pkcs1)
$issuerRequest.CertificateExtensions.Add([System.Security.Cryptography.X509Certificates.X509BasicConstraintsExtension]::new($true,$false,0,$true))
$issuerRequest.CertificateExtensions.Add([System.Security.Cryptography.X509Certificates.X509KeyUsageExtension]::new([System.Security.Cryptography.X509Certificates.X509KeyUsageFlags]::KeyCertSign,$true))
$issuer = $issuerRequest.CreateSelfSigned([DateTimeOffset]::UtcNow.AddDays(-5),[DateTimeOffset]::UtcNow.AddDays(30))
[System.IO.File]::WriteAllText((Join-Path $Destination 'ca.pem'),(Pem 'CERTIFICATE' $issuer.RawData))
try {
  foreach ($name in @('first','second','expired')) {
    $leafKey = [System.Security.Cryptography.RSACng]::new(2048)
    $request = [System.Security.Cryptography.X509Certificates.CertificateRequest]::new('CN=sm.sjhl.online',$leafKey,[System.Security.Cryptography.HashAlgorithmName]::SHA256,[System.Security.Cryptography.RSASignaturePadding]::Pkcs1)
    $request.CertificateExtensions.Add([System.Security.Cryptography.X509Certificates.X509BasicConstraintsExtension]::new($false,$false,0,$true))
    $request.CertificateExtensions.Add([System.Security.Cryptography.X509Certificates.X509KeyUsageExtension]::new(([System.Security.Cryptography.X509Certificates.X509KeyUsageFlags]::DigitalSignature -bor [System.Security.Cryptography.X509Certificates.X509KeyUsageFlags]::KeyEncipherment),$true))
    $oids = [System.Security.Cryptography.OidCollection]::new(); [void]$oids.Add([System.Security.Cryptography.Oid]::new('1.3.6.1.5.5.7.3.1'))
    $request.CertificateExtensions.Add([System.Security.Cryptography.X509Certificates.X509EnhancedKeyUsageExtension]::new($oids,$false))
    $sanBytes = [System.Collections.Generic.List[byte]]::new()
    foreach ($domain in @('sm.sjhl.online','www.sm.sjhl.online')) { $bytes=[Text.Encoding]::ASCII.GetBytes($domain); $sanBytes.Add(130); $sanBytes.Add([byte]$bytes.Length); $sanBytes.AddRange($bytes) }
    $san = [byte[]](@(48,[byte]$sanBytes.Count) + $sanBytes.ToArray())
    $request.CertificateExtensions.Add([System.Security.Cryptography.X509Certificates.X509Extension]::new([System.Security.Cryptography.Oid]::new('2.5.29.17'),$san,$false))
    $start=[DateTimeOffset]::UtcNow.AddDays(-1); $end=if ($name -eq 'expired') { [DateTimeOffset]::UtcNow.AddHours(-1) } else { [DateTimeOffset]::UtcNow.AddDays(20) }
    $serial=[guid]::NewGuid().ToByteArray(); $serial[0]=1
    $leaf=$request.Create($issuer,$start,$end,$serial)
    try {
      [System.IO.File]::WriteAllText((Join-Path $Destination "$name.pem"),(Pem 'CERTIFICATE' $leaf.RawData))
      $key=$leafKey.ExportParameters($true)
      $jwk=@{kty='RSA';n=(B64Url $key.Modulus);e=(B64Url $key.Exponent);d=(B64Url $key.D);p=(B64Url $key.P);q=(B64Url $key.Q);dp=(B64Url $key.DP);dq=(B64Url $key.DQ);qi=(B64Url $key.InverseQ)}
      [System.IO.File]::WriteAllText((Join-Path $Destination "$name.jwk"),($jwk | ConvertTo-Json -Compress))
    } finally { $leaf.Dispose(); $leafKey.Dispose() }
  }
} finally { $issuer.Dispose(); $issuerKey.Dispose() }
Write-Host 'Isolated public certificate fixtures generated; keys were not printed.'
