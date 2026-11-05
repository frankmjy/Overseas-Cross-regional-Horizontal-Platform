const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),{spawnSync}=require('node:child_process');
test('stop gate rejects changed port, process, start time, executable and root; approved stop has no prompt',t=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'overseas-stop-test-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
 const source=path.join(dir,'stop.ps1');fs.writeFileSync(source,fs.readFileSync(path.join(__dirname,'Remote-Stop.ps1'),'utf8').replace("[Console]::Error.WriteLine('REMOTE_VERIFIED_STOP_FAILED')","[Console]::Error.WriteLine($_.Exception.Message+'; line='+$_.InvocationInfo.ScriptLineNumber)"));
 const fixture=path.join(dir,'fixture.ps1');fs.writeFileSync(fixture,`
param([string]$Scenario,[string]$Source)
$ErrorActionPreference='Stop'
function Get-NetTCPConnection {if($Scenario -ne 'absent'){[pscustomobject]@{OwningProcess=$(if($Scenario -eq 'port'){999}else{2248})}}}
function Get-CimInstance {if($Scenario -eq 'absent'){return $null};[pscustomobject]@{Name=$(if($Scenario -eq 'name'){'other.exe'}else{'node.exe'});CreationDate=[DateTimeOffset]::FromUnixTimeMilliseconds($(if($Scenario -eq 'created'){1793007768297}else{1793007768296})).UtcDateTime;ExecutablePath=$(if($Scenario -eq 'exe'){'C:\\other\\node.exe'}else{'C:\\approved\\node.exe'});CommandLine=$(if($Scenario -eq 'root'){'C:\\other\\server.mjs'}else{'node.exe C:\\ai\\overseas-project-management-deploy-20260605-163554\\server.mjs'})}}
function Stop-Process {param($Id,[switch]$Force,[switch]$Confirm);if(-not $Force -or $Confirm -or $Id -ne 2248){throw 'unsafe stop'};$script:Stopped=$true}
function Get-Process {return $null}
function Get-NetTCPConnection {if(-not $script:Stopped -and $Scenario -ne 'absent'){[pscustomobject]@{OwningProcess=$(if($Scenario -eq 'port'){999}else{2248})}}}
& $Source -Root 'C:\\ai\\overseas-project-management-deploy-20260605-163554' -NodeExe 'C:\\approved\\node.exe' -ProcessId 2248 -StartedAt 1793007768296
exit $LASTEXITCODE
`);
 for(const scenario of ['valid','absent','port','name','created','exe','root']){const result=spawnSync('powershell.exe',['-NoLogo','-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-File',fixture,'-Scenario',scenario,'-Source',source],{encoding:'utf8',windowsHide:true,timeout:15000});assert.equal(result.status,['valid','absent'].includes(scenario)?0:1,scenario+': '+result.stderr);}
});
