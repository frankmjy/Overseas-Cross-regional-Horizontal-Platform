param([string]$OutputDirectory=$PSScriptRoot)
$ErrorActionPreference='Stop'
$warnings=[Collections.Generic.List[string]]::new()
$identity=[Security.Principal.WindowsIdentity]::GetCurrent()
$os=Get-CimInstance Win32_OperatingSystem
$allProcesses=@(Get-CimInstance Win32_Process)
$nodes=@($allProcesses|Where-Object Name -eq 'node.exe')
$nodeIds=@($nodes.ProcessId)
$services=@(Get-CimInstance Win32_Service)
$listeners=@(Get-NetTCPConnection -State Listen|Where-Object { $_.OwningProcess -in $nodeIds -and $_.LocalAddress -notmatch '^(127\.|::1$)' }|Sort-Object LocalPort -Unique)
$customServiceOverrides=@()
foreach($service in $services) {
  $serviceRoot='HKLM:\SYSTEM\CurrentControlSet\Services\'+$service.Name
  foreach($entry in @(@($serviceRoot,'Environment'),@((Join-Path $serviceRoot 'Parameters'),'AppEnvironment'),@((Join-Path $serviceRoot 'Parameters'),'AppEnvironmentExtra'))) {
    $property=Get-ItemProperty -LiteralPath $entry[0] -Name $entry[1] -ErrorAction SilentlyContinue
    if ($property) {
      $lines=@($property.PSObject.Properties[$entry[1]].Value)
      if (@($lines|Where-Object { $_ -match '^NODE_OPTIONS=' }).Count) { $customServiceOverrides += [pscustomobject]@{Service=$service.Name;Field=$entry[1];HasSharedLoader=[bool](@($lines|Where-Object { $_ -match '^NODE_OPTIONS=.*TLSCenter[/\\]preload\.cjs' }).Count)} }
    }
  }
}
function Check-LocalTls([int]$Port,[string]$Address) {
  $result=[ordered]@{port=$Port;tls=$false;trusted=$false;certificateSha256=$null;notBefore=$null;notAfter=$null;error=$null}
  $tcp=[Net.Sockets.TcpClient]::new()
  $capture=[Collections.Generic.Dictionary[string,object]]::new()
  $callback=[Net.Security.RemoteCertificateValidationCallback]{param($sender,$certificate,$chain,$errors)
    if($certificate) {
      $cert=[Security.Cryptography.X509Certificates.X509Certificate2]::new($certificate)
      $hash=[Security.Cryptography.SHA256]::Create()
      try {$capture['fingerprint']=([BitConverter]::ToString($hash.ComputeHash($cert.RawData))).Replace('-','');$capture['notBefore']=$cert.NotBefore.ToUniversalTime().ToString('o');$capture['notAfter']=$cert.NotAfter.ToUniversalTime().ToString('o')} finally {$hash.Dispose();$cert.Dispose()}
    }
    $capture['trusted']=($errors -eq [Net.Security.SslPolicyErrors]::None)
    return ($errors -eq [Net.Security.SslPolicyErrors]::None)
  }
  $ssl=$null
  try {
    $connectAddress=if($Address -eq '::') {'::1'} elseif($Address -eq '0.0.0.0') {'127.0.0.1'} else {$Address}
    $connect=$tcp.BeginConnect($connectAddress,$Port,$null,$null)
    if(-not $connect.AsyncWaitHandle.WaitOne(2500)) {throw 'TLS_CONNECT_TIMEOUT'}
    $tcp.EndConnect($connect)
    $tcp.ReceiveTimeout=3000;$tcp.SendTimeout=3000
    $ssl=[Net.Security.SslStream]::new($tcp.GetStream(),$false,$callback)
    $ssl.ReadTimeout=3000;$ssl.WriteTimeout=3000
    $ssl.AuthenticateAsClient('sm.sjhl.online')
    $result.tls=$true;$result.trusted=$true
  } catch {$result.error='TLS_HANDSHAKE_NOT_TRUSTED_OR_NOT_TLS'}
  finally {
    if($capture.ContainsKey('fingerprint')) {$result.tls=$true;$result.certificateSha256=$capture['fingerprint'];$result.notBefore=$capture['notBefore'];$result.notAfter=$capture['notAfter'];$result.trusted=[bool]$capture['trusted']}
    if($ssl) {$ssl.Dispose()};$tcp.Dispose()
  }
  return [pscustomobject]$result
}
$ports=@()
foreach($listener in $listeners) {
  Write-Host ('Checking Node web/TLS listener '+$listener.LocalPort+' ...')
  $check=Check-LocalTls $listener.LocalPort $listener.LocalAddress
  $node=$nodes|Where-Object ProcessId -eq $listener.OwningProcess|Select-Object -First 1
  $associatedServices=@($services|Where-Object { $_.ProcessId -eq $node.ProcessId -or $_.ProcessId -eq $node.ParentProcessId }|Select-Object -ExpandProperty Name)
  $ports += [pscustomobject]@{port=$listener.LocalPort;processId=$node.ProcessId;nodeExecutable=$node.ExecutablePath;serviceNames=$associatedServices;tls=$check}
}
$userOverrides=@()
foreach($node in $nodes) {
  try {
    $owner=Invoke-CimMethod -InputObject $node -MethodName GetOwnerSid
    if($owner.ReturnValue -eq 0) {
      $profile=Get-ItemProperty -LiteralPath ('Registry::HKEY_USERS\'+$owner.Sid+'\Environment') -Name NODE_OPTIONS -ErrorAction SilentlyContinue
      if($profile -and $profile.NODE_OPTIONS) {$userOverrides += [pscustomobject]@{processId=$node.ProcessId;hasUserNodeOptions=$true;hasSharedLoader=($profile.NODE_OPTIONS -match 'TLSCenter[/\\]preload\.cjs')}}
    }
  } catch {$warnings.Add('Some Node service account environments could not be inspected.')}
}
$report=[ordered]@{
  schema=1;generatedAt=[DateTime]::UtcNow.ToString('o');readOnly=$true;
  windows=@{caption=$os.Caption;version=$os.Version;build=$os.BuildNumber;powershell=$PSVersionTable.PSVersion.ToString();administrator=([Security.Principal.WindowsPrincipal]::new($identity)).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)};
  environment=@{machineNodeOptionsPresent=[bool][Environment]::GetEnvironmentVariable('NODE_OPTIONS','Machine');userNodeOptionsPresent=[bool][Environment]::GetEnvironmentVariable('NODE_OPTIONS','User')};
  ports=$ports;serviceNodeOptionsOverrides=$customServiceOverrides;userNodeOptionsOverrides=$userOverrides;warnings=@($warnings|Select-Object -Unique)
}
$path=Join-Path ([IO.Path]::GetFullPath($OutputDirectory)) ('tls-server-preflight-'+[DateTime]::Now.ToString('yyyyMMdd-HHmmss')+'.json')
[IO.File]::WriteAllText($path,($report|ConvertTo-Json -Depth 8),[Text.UTF8Encoding]::new($false))
Write-Host ('Report: '+$path)
Write-Host ('Node public listeners: '+$ports.Count)
Write-Host ('Service NODE_OPTIONS overrides: '+$customServiceOverrides.Count)
Write-Host 'Read-only check finished. No services, certificates, firewall rules or environment values were modified.'
