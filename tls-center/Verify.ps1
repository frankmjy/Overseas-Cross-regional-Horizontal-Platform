param([string]$Root=(Join-Path $env:ProgramData 'VNET\TLSCenter'),[string]$OutputDirectory=$PSScriptRoot)
$ErrorActionPreference='Stop'
$Root=[IO.Path]::GetFullPath($Root)
$state=Get-Content -LiteralPath (Join-Path $Root 'install-state.json') -Raw -Encoding UTF8|ConvertFrom-Json
$current=Get-Content -LiteralPath (Join-Path $Root 'current.json') -Raw -Encoding UTF8|ConvertFrom-Json
if($state.schema -ne 2 -or $state.root -cne $Root){throw 'Installation state identity is invalid.'}
. (Join-Path $Root 'InstallSupport.ps1')
$environmentMatches=$true
foreach($item in $state.environment){if(-not (Test-TlsEnvironmentEqual (Get-TlsEnvironment $item.scope $item.name) $item.after)){$environmentMatches=$false}}
$filesMatch=$true
foreach($file in $state.files.PSObject.Properties) {
  $name=$file.Name
  if($name -in @('Install.ps1','Install.bat','README.md')){continue}
  if([IO.Path]::GetFileName($name) -cne $name){throw 'Invalid runtime manifest path.'}
  $path=Join-Path $Root $name
  if(-not (Test-Path -LiteralPath $path) -or (Get-FileHash -LiteralPath $path -Algorithm SHA256).Hash.ToLowerInvariant() -cne $file.Value){$filesMatch=$false}
}
$nodeIds=@(Get-CimInstance Win32_Process -Filter "Name='node.exe'"|Select-Object -ExpandProperty ProcessId)
$listeners=@(Get-NetTCPConnection -State Listen|Where-Object{$_.OwningProcess -in $nodeIds -and $_.LocalAddress -notmatch '^(127\.|::1$)'})
$ports=@(@($state.ports)+@($listeners|Select-Object -ExpandProperty LocalPort)|Sort-Object -Unique)
function Test-TlsPort([int]$Port,[string]$Domain,[string]$Address) {
  $result=[ordered]@{port=$Port;domain=$Domain;trusted=$false;matchesCenter=$false;certificateSha256=$null;protocol=$null;error=$null}
  $capture=[Collections.Generic.Dictionary[string,object]]::new()
  $callback=[Net.Security.RemoteCertificateValidationCallback]{param($sender,$certificate,$chain,$errors)
    if($certificate){$hash=[Security.Cryptography.SHA256]::Create();try{$capture['fingerprint']=([BitConverter]::ToString($hash.ComputeHash($certificate.GetRawCertData()))).Replace('-','')}finally{$hash.Dispose()}}
    return ($errors -eq [Net.Security.SslPolicyErrors]::None)
  }
  $tcp=[Net.Sockets.TcpClient]::new();$ssl=$null
  try {
    $connect=$tcp.BeginConnect($Address,$Port,$null,$null)
    if(-not $connect.AsyncWaitHandle.WaitOne(2500)){throw 'Connect timeout'}
    $tcp.EndConnect($connect);$tcp.ReceiveTimeout=3000;$tcp.SendTimeout=3000
    $ssl=[Net.Security.SslStream]::new($tcp.GetStream(),$false,$callback)
    $ssl.ReadTimeout=3000;$ssl.WriteTimeout=3000;$ssl.AuthenticateAsClient($Domain)
    $result.protocol=$ssl.SslProtocol.ToString()
    $result.trusted=$result.protocol -in @('Tls12','Tls13')
  } catch {$result.error='TLS_VERIFICATION_FAILED'}
  finally {if($capture.ContainsKey('fingerprint')){$result.certificateSha256=$capture['fingerprint']};if($ssl){$ssl.Dispose()};$tcp.Dispose()}
  $result.matchesCenter=$result.certificateSha256 -eq $current.fingerprint.Replace(':','')
  return [pscustomobject]$result
}
$checks=@()
foreach($port in $ports) {
  $listener=$listeners|Where-Object LocalPort -eq $port|Select-Object -First 1
  $address=if(-not $listener -or $listener.LocalAddress -eq '0.0.0.0'){'127.0.0.1'}elseif($listener.LocalAddress -eq '::'){'::1'}else{$listener.LocalAddress}
  foreach($domain in @('sm.sjhl.online','www.sm.sjhl.online')){$checks+=Test-TlsPort $port $domain $address}
}
$task=Get-ScheduledTask -TaskName 'VNET TLS Certificate Watcher' -ErrorAction SilentlyContinue
$passed=$state.phase -eq 'committed' -and $environmentMatches -and $filesMatch -and $task.State -eq 'Running' -and $checks.Count -gt 0 -and @($checks|Where-Object{-not $_.trusted -or -not $_.matchesCenter}).Count -eq 0
$report=@{schema=1;generatedAt=[DateTime]::UtcNow.ToString('o');passed=$passed;environmentMatches=$environmentMatches;runtimeIntegrity=$filesMatch;watcherRunning=($task.State -eq 'Running');checks=$checks}
$destination=Join-Path ([IO.Path]::GetFullPath($OutputDirectory)) ('tls-verification-'+[DateTime]::Now.ToString('yyyyMMdd-HHmmss')+'.json')
[IO.File]::WriteAllText($destination,($report|ConvertTo-Json -Depth 8),[Text.UTF8Encoding]::new($false))
Write-Host ('Report: '+$destination)
Write-Host ('All checks passed: '+$passed)
if(-not $passed){exit 1}
