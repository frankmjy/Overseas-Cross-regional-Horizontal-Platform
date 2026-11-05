function Invoke-FeishuLoginTool {
  param([Parameter(Mandatory=$true)][string]$ToolFile)
  $ErrorActionPreference = 'Stop'
  $root = Split-Path -Parent $ToolFile
  $secretPtr = [IntPtr]::Zero
  $appSecret = $null
  $payload = $null
  $oldEmbedded = $env:VNET_CONFIG_EMBEDDED
  try {
    if (-not (Test-Path -LiteralPath (Join-Path $root 'server.mjs')) -or -not (Test-Path -LiteralPath (Join-Path $root 'application-settings.mjs'))) {
      throw '请把此 BAT 放在平台实际部署目录，与 server.mjs 放在一起。'
    }
    $text = [IO.File]::ReadAllText($ToolFile, [Text.Encoding]::UTF8)
    $marker = '# VNET_NODE_SOURCE' + "`r`n"
    $index = $text.IndexOf($marker, [StringComparison]::Ordinal)
    if ($index -lt 0) { throw '配置工具不完整，请重新下载。' }
    $nodeSource = $text.Substring($index + $marker.Length)
    $node = $null
    $connection = Get-NetTCPConnection -LocalPort 3333 -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1
    if (-not $connection) { throw '3333 服务未启动。请先双击 start-3333.bat，再运行本工具。' }
    $owner = Get-Process -Id $connection.OwningProcess -ErrorAction SilentlyContinue
    if ($owner -and $owner.ProcessName -eq 'node') { $node = $owner.Path }
    if (-not $node) {
      $candidate = Join-Path $root '.runtime/node/node.exe'
      if (Test-Path -LiteralPath $candidate) { $node = $candidate }
      else { $command = Get-Command node.exe -ErrorAction SilentlyContinue; if ($command) { $node = $command.Source } }
    }
    if (-not $node) { throw '未找到 Node.js，请使用平台原有启动入口启动服务。' }
    $certificatePem = $null
    $configured = @{}
    $envFile = Join-Path $root '.env'
    if (Test-Path -LiteralPath $envFile) {
      foreach ($line in [IO.File]::ReadAllLines($envFile)) {
        if ($line -match '^\s*([A-Z_]+)\s*=(.*)$') { $configured[$matches[1]] = $matches[2].Trim().Trim('"').Trim("'") }
      }
    }
    if (-not $configured['HTTPS_CERT_PATH']) {
      $pfx = $configured['HTTPS_PFX_PATH']
      if (-not $pfx) { $pfx = 'certs/localhost.pfx' }
      if (-not [IO.Path]::IsPathRooted($pfx)) { $pfx = Join-Path $root $pfx }
      if (Test-Path -LiteralPath $pfx) {
        $pass = $configured['HTTPS_PFX_PASSPHRASE']
        $passFile = $configured['HTTPS_PFX_PASSPHRASE_FILE']
        if (-not $passFile) { $passFile = 'certs/localhost.passphrase' }
        if (-not [IO.Path]::IsPathRooted($passFile)) { $passFile = Join-Path $root $passFile }
        if (-not $pass -and (Test-Path -LiteralPath $passFile)) { $pass = [IO.File]::ReadAllText($passFile).Trim() }
        $certs = New-Object Security.Cryptography.X509Certificates.X509Certificate2Collection
        $certs.Import([IO.File]::ReadAllBytes($pfx), $pass, [Security.Cryptography.X509Certificates.X509KeyStorageFlags]::EphemeralKeySet)
        try {
          $leaf = $certs | Where-Object { $_.HasPrivateKey } | Select-Object -First 1
          if (-not $leaf) { throw '证书包缺少服务证书。' }
          $certificatePem = "-----BEGIN CERTIFICATE-----`n" + [Convert]::ToBase64String($leaf.Export([Security.Cryptography.X509Certificates.X509ContentType]::Cert), [Base64FormattingOptions]::InsertLineBreaks) + "`n-----END CERTIFICATE-----"
        } finally { foreach ($cert in $certs) { $cert.Dispose() }; $pass = $null }
      }
    }
    function Invoke-LocalConfiguration([hashtable]$InputData) {
      $start = New-Object Diagnostics.ProcessStartInfo
      $start.FileName = $node
      $start.Arguments = '--input-type=module -e "import fs from ''node:fs'';const s=fs.readFileSync(process.env.VNET_CONFIG_TOOL_FILE,''utf8'');const m=''# VNET_NODE_SOURCE\r\n'';await import(''data:text/javascript;base64,''+Buffer.from(s.slice(s.indexOf(m)+m.length)).toString(''base64''));"'
      $start.WorkingDirectory = $root
      $start.UseShellExecute = $false
      $start.CreateNoWindow = $true
      $start.RedirectStandardInput = $true
      $start.RedirectStandardOutput = $true
      $start.RedirectStandardError = $true
      $start.StandardOutputEncoding = [Text.Encoding]::UTF8
      $start.EnvironmentVariables['VNET_CONFIG_EMBEDDED'] = '1'
      $start.EnvironmentVariables['VNET_CONFIG_TOOL_FILE'] = $ToolFile
      $process = New-Object Diagnostics.Process
      $process.StartInfo = $start
      try {
        [void]$process.Start()
        $output = $process.StandardOutput.ReadToEndAsync()
        $errors = $process.StandardError.ReadToEndAsync()
        $bytes = [Text.Encoding]::UTF8.GetBytes(($InputData | ConvertTo-Json -Compress))
        $process.StandardInput.BaseStream.Write($bytes, 0, $bytes.Length)
        $process.StandardInput.Close()
        [Array]::Clear($bytes, 0, $bytes.Length)
        if (-not $process.WaitForExit(90000)) { $process.Kill(); throw '配置请求超时，结果尚未确认，请检查平台配置状态后重试。' }
        $raw = $output.GetAwaiter().GetResult()
        [void]$errors.GetAwaiter().GetResult()
        try { $result = $raw | ConvertFrom-Json } catch { throw '配置工具未能完成，服务未通过检查。' }
        if (-not $result.ok) { throw [string]$result.error }
        if ($process.ExitCode -ne 0) { throw '配置工具未能完成，请检查服务状态。' }
        return $result
      } finally { $process.Dispose() }
    }
    Write-Host ''
    Write-Host '海外协作平台 · 飞书登录配置' -ForegroundColor Cyan
    Write-Host '应用：定盘星  cli_aa547c8de6785ce2'
    Write-Host '正在检查服务器本机 3333 服务…'
    [void](Invoke-LocalConfiguration @{ action='probe'; root=$root; certificatePem=$certificatePem })
    Write-Host '请从飞书开发者后台“凭证与基础信息”复制该应用的 App Secret。'
    $secure = Read-Host 'App Secret（隐藏输入，粘贴后按回车）' -AsSecureString
    $secretPtr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
    $appSecret = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($secretPtr)
    $payload = @{ action='save'; root=$root; certificatePem=$certificatePem; appSecret=$appSecret; clientMutationId=[Guid]::NewGuid().ToString() }
    Write-Host '正在校验、保存并检查登录入口…'
    $result = Invoke-LocalConfiguration $payload
    Write-Host $result.message -ForegroundColor Green
    Write-Host ('登录地址：' + $result.loginUrl)
    Write-Host '原有证书、端口和 .env 文件保持不变。请回到正式页面重新登录。'
    return 0
  } catch {
    # Only deliberate messages are shown; native exception details may contain private configuration.
    $message = if ($_.Exception.Message -match '^(请把此 BAT|配置工具不完整|3333 服务未启动|未找到 Node|配置请求超时|配置工具未能完成|输入无效|此工具仅配置|未找到本平台|飞书应用凭据|平台正在同步|配置保存或应用失败|凭据已保存|本机 HTTPS|未能确认请求结果|配置未完成)') { $_.Exception.Message } else { '配置未完成。请检查部署目录、服务状态、证书及服务器网络。' }
    Write-Host $message -ForegroundColor Red
    return 1
  } finally {
    if ($payload) { $payload.appSecret = $null }
    $appSecret = $null
    if ($secretPtr -ne [IntPtr]::Zero) { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($secretPtr) }
    $env:VNET_CONFIG_EMBEDDED = $oldEmbedded
  }
}
