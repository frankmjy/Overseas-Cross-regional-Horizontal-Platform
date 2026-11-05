param(
  [Parameter(Mandatory=$true)][string]$HostIP,
  [string]$Username='Administrator',
  [string]$Store='E:\AI\Codex-tools\secrets\overseas-project-deploy',
  [string]$Python='E:\AI\Codex-tools\python\python.exe',
  [string]$Runtime='E:\AI\Codex-tools\ssh-deploy-runtime'
)
$ErrorActionPreference='Stop'
[Console]::OutputEncoding=[Text.UTF8Encoding]::new($false)
$script=Join-Path $PSScriptRoot 'remote-ssh.py'
function Assert-Plain([string]$Target) {
  $full=[IO.Path]::GetFullPath($Target)
  if($full.Substring([IO.Path]::GetPathRoot($full).Length).Contains(':')){throw 'Unsafe path.'}
  for($at=$full;$at;$at=Split-Path -Parent $at){if((Test-Path -LiteralPath $at) -and ((Get-Item -LiteralPath $at -Force).Attributes -band [IO.FileAttributes]::ReparsePoint)){throw 'Linked credential paths are not allowed.'}}
  return $full
}
function Invoke-Client([string[]]$Arguments) {
  $raw=& $Python $script @Arguments --runtime $Runtime
  $exit=$LASTEXITCODE
  try{$result=$raw|ConvertFrom-Json}catch{throw 'SSH tool did not return a valid result.'}
  if($exit -ne 0 -or -not $result.ok){throw ('SSH validation failed: '+$result.error)}
  return $result.data
}
try {
  if(-not(Test-Path -LiteralPath $Python)){throw 'Python runtime is missing.'}
  $Store=Assert-Plain $Store
  [void][IO.Directory]::CreateDirectory($Store)
  $acl=[Security.AccessControl.DirectorySecurity]::new()
  $acl.SetAccessRuleProtection($true,$false)
  $me=[Security.Principal.WindowsIdentity]::GetCurrent().User
  foreach($sid in @($me,[Security.Principal.SecurityIdentifier]::new('S-1-5-18'))){$acl.AddAccessRule([Security.AccessControl.FileSystemAccessRule]::new($sid,'FullControl','ContainerInherit,ObjectInherit','None','Allow'))}
  $acl.SetOwner($me)
  Set-Acl -LiteralPath $Store -AclObject $acl
  $configFile=Join-Path $Store 'target.json'
  $secretFile=Join-Path $Store 'credential.dpapi'
  if((Test-Path -LiteralPath $configFile) -and (Test-Path -LiteralPath $secretFile)){
    $saved=Get-Content -LiteralPath $configFile -Raw -Encoding UTF8|ConvertFrom-Json
    if($saved.host -cne $HostIP -or $saved.username -cne $Username){throw 'Saved target differs. Existing credentials were preserved.'}
    [void](Invoke-Client @('check','--config',$configFile,'--secret',$secretFile))
    Write-Host 'Saved credentials and pinned server identity passed. No password input required.'
    exit 0
  }
  $key=Invoke-Client @('scan','--host',$HostIP,'--port','22')
  Write-Host ('Server: '+$HostIP+':22  User: '+$Username+'  Project port: 3333')
  Write-Host ('SSH host key: '+$key.type+'  '+$key.sha256)
  Write-Host 'First connection: verify this fingerprint using your trusted server console.'
  $keyFile=@{'ssh-ed25519'='ed25519';'ecdsa-sha2-nistp256'='ecdsa';'ssh-rsa'='rsa'}[$key.type]
  if(-not $keyFile){throw 'Unsupported host key type.'}
  Write-Host ('Server console command: ssh-keygen -lf C:\ProgramData\ssh\ssh_host_'+$keyFile+'_key.pub -E sha256')
  if((Read-Host 'After verification, type YES to pin this server') -cne 'YES'){throw 'Server identity was not confirmed. No password was requested or saved.'}
  $secure=Read-Host 'Administrator SSH password (hidden; saved encrypted for future deployments)' -AsSecureString
  if($secure.Length -eq 0){throw 'Password is empty.'}
  Add-Type -AssemblyName System.Security
  $pointer=[IntPtr]::Zero
  $bytes=$null
  try {
    $pointer=[Runtime.InteropServices.Marshal]::SecureStringToGlobalAllocUnicode($secure)
    $plain=[Runtime.InteropServices.Marshal]::PtrToStringUni($pointer)
    $bytes=[Text.Encoding]::UTF8.GetBytes($plain)
    $entropy=[Text.Encoding]::UTF8.GetBytes('VNET-Overseas-Deploy-SSH-v1')
    $encrypted=[Security.Cryptography.ProtectedData]::Protect($bytes,$entropy,[Security.Cryptography.DataProtectionScope]::CurrentUser)
  } finally {
    $plain=$null
    if($bytes){[Array]::Clear($bytes,0,$bytes.Length)}
    if($pointer -ne [IntPtr]::Zero){[Runtime.InteropServices.Marshal]::ZeroFreeGlobalAllocUnicode($pointer)}
    $secure.Dispose()
  }
  $draft=Join-Path $Store ('pending-'+[guid]::NewGuid().ToString('N'))
  [void][IO.Directory]::CreateDirectory($draft)
  $draftConfig=Join-Path $draft 'target.json'
  $draftSecret=Join-Path $draft 'credential.dpapi'
  $config=@{schema=1;host=$HostIP;port=22;username=$Username;root='C:\ai\overseas-project-management-deploy-20260605-163554';applicationPort=3333;hostKey=$key;createdAt=[DateTime]::UtcNow.ToString('o')}
  [IO.File]::WriteAllText($draftConfig,($config|ConvertTo-Json -Depth 5),[Text.UTF8Encoding]::new($false))
  [IO.File]::WriteAllBytes($draftSecret,$encrypted)
  try {
    $probe=Invoke-Client @('check','--config',$draftConfig,'--secret',$draftSecret)
    if(-not $probe.administrator){throw 'The remote SSH session is not elevated. Credentials were not promoted.'}
    if((Test-Path -LiteralPath $configFile) -or (Test-Path -LiteralPath $secretFile)){throw 'Another configuration completed. Existing credentials were preserved.'}
    [IO.File]::Move($draftSecret,$secretFile)
    [IO.File]::Move($draftConfig,$configFile)
    Write-Host 'READY: server identity and administrator login verified. Credentials are encrypted for this Windows user.'
    Write-Host ('Configuration: '+$configFile)
  } finally {
    foreach($file in @($draftConfig,$draftSecret)){if(Test-Path -LiteralPath $file){Remove-Item -LiteralPath $file -Force}}
    if(Test-Path -LiteralPath $draft){[IO.Directory]::Delete($draft)}
  }
} catch {
  Write-Host $_.Exception.Message -ForegroundColor Red
  exit 1
}
