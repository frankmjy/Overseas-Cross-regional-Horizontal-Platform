param([ValidateSet('Port','Start','Stop','Storage','Owner')][string]$Action,[string]$Root,[string]$NodeExe,[int]$Port=3333,[int]$ProcessId,[double]$StartedAt,[string]$InputFile)
$ErrorActionPreference='Stop'
function Get-Owner {
  $owners=@(& netstat.exe -ano -p tcp|ForEach-Object{if($_ -match ('^\s*TCP\s+\S+:'+ $Port +'\s+\S+\s+LISTENING\s+(\d+)\s*$')){[int]$Matches[1]}}|Select-Object -Unique)
  if($owners.Count -gt 1){throw 'Multiple port owners require review.'}
  if(-not $owners.Count){return $null}
  $process=Get-CimInstance Win32_Process -Filter "ProcessId=$($owners[0])"
  if($process.Name -ne 'node.exe'){throw 'The target port is not owned by Node.js.'}
  return @{pid=$process.ProcessId;created=([DateTimeOffset]$process.CreationDate).ToUnixTimeMilliseconds();exe=$process.ExecutablePath}
}
try {
  switch($Action) {
    'Port' {Get-Owner|ConvertTo-Json -Compress}
    'Owner' {
      $process=Get-CimInstance Win32_Process -Filter "ProcessId=$ProcessId"
      $active=$false
      if($process -and $process.Name -eq 'node.exe'){$active=[math]::Abs(([DateTimeOffset]$process.CreationDate).ToUnixTimeMilliseconds()-$StartedAt) -lt 2000}
      @{active=$active}|ConvertTo-Json -Compress
    }
    'Stop' {
      $owner=Get-Owner
      if(-not $owner){$process=Get-CimInstance Win32_Process -Filter "ProcessId=$ProcessId";if($process){if($process.Name -ne 'node.exe' -or [math]::Abs(([DateTimeOffset]$process.CreationDate).ToUnixTimeMilliseconds()-$StartedAt) -gt 1000){throw 'Process identity changed.'};Stop-Process -Id $ProcessId -ErrorAction Stop}}
      if($owner) {
        if($owner.pid -ne $ProcessId -or [math]::Abs($owner.created-$StartedAt) -gt 1000){throw 'Port owner changed; stopping was refused.'}
        Stop-Process -Id $ProcessId -ErrorAction Stop
        $process=Get-Process -Id $ProcessId -ErrorAction SilentlyContinue
        if($process){$process.WaitForExit(7000)|Out-Null}
        if(Get-Owner){throw 'Target port did not stop.'}
      }
      @{stopped=$true}|ConvertTo-Json -Compress
    }
    'Start' {
      if(Get-Owner){throw 'Target port is already occupied.'}
      $envPath=Join-Path $Root '.env'
      if(Test-Path -LiteralPath $envPath){foreach($line in [IO.File]::ReadAllLines($envPath)){
        if($line.Trim() -and -not $line.Trim().StartsWith('#') -and $line.Contains('=')){$pair=$line.Split('=',2);$name=$pair[0].Trim();if($name -match '^[A-Za-z_][A-Za-z0-9_]*$' -and -not [Environment]::GetEnvironmentVariable($name,'Process')){[Environment]::SetEnvironmentVariable($name,$pair[1],'Process')}}
      }}
      $env:PORT=[string]$Port;$env:SERVER_HOST='0.0.0.0';$env:LARK_CLI_SCRIPT=Join-Path $Root 'vendor\lark-cli\run.cjs'
      $logs=Join-Path $Root '.runtime\release-logs';[void][IO.Directory]::CreateDirectory($logs)
      $id=[guid]::NewGuid().ToString('N')
      $process=Start-Process -FilePath $NodeExe -ArgumentList @('server.mjs') -WorkingDirectory $Root -WindowStyle Hidden -RedirectStandardOutput (Join-Path $logs ($id+'.out.log')) -RedirectStandardError (Join-Path $logs ($id+'.err.log')) -PassThru
      @{pid=$process.Id;created=([DateTimeOffset]$process.StartTime).ToUnixTimeMilliseconds()}|ConvertTo-Json -Compress
    }
    'Storage' {
      $paths=Get-Content -LiteralPath $InputFile -Raw -Encoding UTF8|ConvertFrom-Json
      foreach($path in $paths){if(-not(Test-Path -LiteralPath $path)){continue};$items=@(Get-Item -LiteralPath $path -Force);if($items[0].PSIsContainer){$items+=@(Get-ChildItem -LiteralPath $path -Recurse -Force)}
        foreach($item in $items){if($item.Attributes -band [IO.FileAttributes]::ReparsePoint){throw 'Reparse point rejected.'};if(-not $item.PSIsContainer -and @(Get-Item -LiteralPath $item.FullName -Stream *|Where-Object{$_.Stream -notin @(':$DATA','Zone.Identifier')}).Count){throw 'Alternate stream rejected.'}}
      }
      @{safe=$true}|ConvertTo-Json -Compress
    }
  }
}catch{[Console]::Error.WriteLine('RELEASE_WINDOWS_'+$Action.ToUpperInvariant()+'_FAILED; type='+$_.Exception.GetType().Name+'; line='+$_.InvocationInfo.ScriptLineNumber);exit 1}
