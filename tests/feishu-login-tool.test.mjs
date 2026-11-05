import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import https from 'node:https';
import { randomUUID } from 'node:crypto';
import { spawn, spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { configureLogin, connectionSettings, safeFailure } from '../scripts/feishu-login-tool.mjs';
import { ApplicationSettings, createApplicationSettingsHandler } from '../application-settings.mjs';
import { AuthService } from '../auth/service.mjs';
import { createAuthHandler } from '../auth/http.mjs';

const appId = 'cli_aa547c8de6785ce2';
const secret = 'fixture-secret-never-print';
const mutation = 'eb0866bd-ddd9-41d1-a1c3-4d54056c4706';
const authorize = { status:303, location:`https://accounts.feishu.cn/open-apis/authen/v1/authorize?client_id=${appId}&redirect_uri=${encodeURIComponent('https://www.sm.sjhl.online:3333/api/auth/feishu/callback')}` };

test('one-click configuration uses the local settings API, then verifies the formal callback', async()=>{
  const calls=[];
  const request=async(method,route,body,formal)=>{
    calls.push({method,route,body,formal});
    if(route==='/api/application-settings')return {status:200,body:{ok:true,editable:true,configured:method==='POST'}};
    return authorize;
  };
  const result=await configureLogin({appSecret:secret,clientMutationId:mutation},request);
  assert.equal(result.ok,true);
  assert.deepEqual(calls.map(x=>x.method),['GET','POST','GET']);
  assert.deepEqual(calls[1].body,{appId,appSecret:secret,clientMutationId:mutation});
  assert.equal(calls[2].formal,true);
  assert.equal(JSON.stringify(result).includes(secret),false);
});

test('a foreign service or rejected credentials never yields a success or leaks an upstream error',async()=>{
  let posts=0;
  await assert.rejects(configureLogin({appSecret:secret,clientMutationId:mutation},async(method)=>{if(method==='POST')posts++;return {status:200,body:{hello:'other service'}};}),/CONFIG_SERVICE_INVALID/);
  assert.equal(posts,0);
  await assert.rejects(configureLogin({appSecret:secret,clientMutationId:mutation},async(method)=>method==='GET'?{status:200,body:{ok:true,editable:true}}:{status:400,body:{ok:false,error:secret}}),/CONFIG_CREDENTIALS_REJECTED/);
  assert.equal(safeFailure(new Error(secret)).includes(secret),false);
});

test('bad input is rejected before transmission and busy services do not auto retry',async()=>{
  for(const bad of ['', 'x\nsecret','x'.repeat(513)])await assert.rejects(configureLogin({appSecret:bad,clientMutationId:mutation},()=>assert.fail('must not send')),/CONFIG_INPUT_INVALID/);
  let posts=0;
  await assert.rejects(configureLogin({appSecret:secret,clientMutationId:mutation},async(method)=>{
    if(method==='POST'){posts++;return {status:409,body:{ok:false}};}return {status:200,body:{ok:true,editable:true}};
  }),/CONFIG_BUSY/);
  assert.equal(posts,1);
});

test('saved credentials are not reported as a fully verified login when authorization is still unavailable',async()=>{
  await assert.rejects(configureLogin({appSecret:secret,clientMutationId:mutation},async(method,route)=>route.includes('authorize')?{status:503,body:{ok:false}}:{status:200,body:{ok:true,editable:true,configured:method==='POST'}}),/CONFIG_SAVED_LOGIN_UNAVAILABLE/);
  await assert.rejects(configureLogin({appSecret:secret,clientMutationId:mutation},async(method,route)=>route.includes('authorize')?{...authorize,location:authorize.location.replace('accounts.feishu.cn','evil.example')}:{status:200,body:{ok:true,editable:true,configured:method==='POST'}}),/CONFIG_SAVED_LOGIN_UNAVAILABLE/);
});

test('connection settings preserve all deployment bytes and stay on loopback with TLS validation',async t=>{
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'vnet-login-tool-'));
  t.after(()=>fs.rm(root,{recursive:true,force:true}));
  const content='\ufeff# original\r\nPORT=3333\r\nPUBLIC_DOMAIN=www.sm.sjhl.online\r\nFEISHU_APP_SECRET=do-not-use-this-value\r\n';
  await fs.writeFile(path.join(root,'.env'),content);
  const settings=connectionSettings(root);
  assert.equal(settings.hostname,'127.0.0.1');
  assert.equal(settings.servername,'www.sm.sjhl.online');
  assert.equal(settings.port,3333);
  assert.notEqual(settings.rejectUnauthorized,false);
  assert.equal(await fs.readFile(path.join(root,'.env'),'utf8'),content);
  await fs.writeFile(path.join(root,'.env'),'PORT=4444\n');
  assert.throws(()=>connectionSettings(root),/CONFIG_PORT_INVALID/);
});

test('standalone BAT sources configure a real isolated HTTPS service through Windows PowerShell', {skip:process.platform!=='win32',timeout:90000},async t=>{
  const root=await fs.mkdtemp(path.join(os.tmpdir(),"vnet-login-中文-'"));
  t.after(()=>fs.rm(root,{recursive:true,force:true}));
  await fs.mkdir(path.join(root,'certs'));
  await fs.mkdir(path.join(root,'auth'));
  for(const file of ['server.mjs','application-settings.mjs','auth/http.mjs'])await fs.writeFile(path.join(root,file),'// isolated fixture');
  const original='\ufeff# preserve original bytes\r\nPORT=3333\r\nHTTPS_PFX_PATH=certs/localhost.pfx\r\n';
  await fs.writeFile(path.join(root,'.env'),original);
  const pass=randomUUID();
  await fs.writeFile(path.join(root,'certs/localhost.passphrase'),pass);
  const certScript=`$ErrorActionPreference='Stop'
$rsa=[Security.Cryptography.RSACng]::new(2048)
$req=[Security.Cryptography.X509Certificates.CertificateRequest]::new('CN=localhost',$rsa,[Security.Cryptography.HashAlgorithmName]::SHA256,[Security.Cryptography.RSASignaturePadding]::Pkcs1)
$san=[byte[]](0x30,0x0b,0x82,0x09)+[Text.Encoding]::ASCII.GetBytes('localhost')
$req.CertificateExtensions.Add([Security.Cryptography.X509Certificates.X509Extension]::new('2.5.29.17',$san,$false))
$cert=$req.CreateSelfSigned([DateTimeOffset]::UtcNow.AddMinutes(-5),[DateTimeOffset]::UtcNow.AddDays(1))
[IO.File]::WriteAllBytes((Join-Path $env:FIXTURE_ROOT 'certs/localhost.pfx'),$cert.Export([Security.Cryptography.X509Certificates.X509ContentType]::Pfx,$env:FIXTURE_PASS))
$cert.Dispose(); $rsa.Dispose()`;
  const generated=spawnSync('powershell.exe',['-NoProfile','-Command',certScript],{encoding:'utf8',windowsHide:true,env:{...process.env,FIXTURE_ROOT:root,FIXTURE_PASS:pass}});
  assert.equal(generated.status,0,generated.stderr);
  const tool=path.join(root,'configure-feishu-login.bat');
  await fs.copyFile('configure-feishu-login.bat',tool);
  let active={appId:'',appSecret:'',origins:['https://localhost:3333','https://www.sm.sjhl.online:3333']};
  let writes=0;
  const settings=new ApplicationSettings({dir:path.join(root,'.runtime/research'),verify:async input=>{if(input.appSecret!==secret)throw Error('fixture rejected');},apply:async input=>{active={...active,appId:input.appId,appSecret:input.appSecret};writes++;}});
  const handleSettings=createApplicationSettingsHandler(settings);
  const auth=new AuthService({dir:path.join(root,'.runtime/auth'),config:()=>active});
  const handleAuth=createAuthHandler({service:auth,root:path.resolve('.')});
  const server=https.createServer({pfx:await fs.readFile(path.join(root,'certs/localhost.pfx')),passphrase:pass},async(req,res)=>{
    if(await handleAuth(req,res))return;
    if(await handleSettings(req,res))return;
    res.writeHead(404);res.end();
  });
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  t.after(()=>new Promise(resolve=>server.close(resolve)));
  const port=server.address().port;
  // Only the test child redirects the hard-coded loopback port to this isolated service.
  const loader=path.join(root,'isolated-request.mjs');
  await fs.writeFile(loader,`import https from 'node:https';const request=https.request;https.request=(options,cb)=>request({...options,port:${port}},cb);`);
  const runner=`$ErrorActionPreference='Stop'
function Get-NetTCPConnection { [pscustomobject]@{OwningProcess=[int]$env:FIXTURE_OWNER} }
function Read-Host { param($Prompt,[switch]$AsSecureString); if(-not $AsSecureString){throw 'Secret input must be hidden'}; ConvertTo-SecureString $env:FIXTURE_SECRET -AsPlainText -Force }
$file=$env:FIXTURE_TOOL
$text=[IO.File]::ReadAllText($file,[Text.Encoding]::UTF8)
$a=$text.IndexOf('# VNET_PS_SOURCE'+[char]13+[char]10);$b=$text.IndexOf('# VNET_NODE_SOURCE'+[char]13+[char]10)
. ([ScriptBlock]::Create($text.Substring($a+18,$b-$a-18)))
exit (Invoke-FeishuLoginTool -ToolFile $file)`;
  async function run(value){
    return new Promise(resolve=>{
      const child=spawn('powershell.exe',['-NoProfile','-Command',runner],{windowsHide:true,env:{...process.env,FIXTURE_TOOL:tool,FIXTURE_OWNER:String(process.pid),FIXTURE_SECRET:value,NODE_OPTIONS:`--import=${pathToFileURL(loader).href}`}});
      let output='';child.stdout.on('data',c=>output+=c);child.stderr.on('data',c=>output+=c);child.on('exit',code=>resolve({code,output}));
    });
  }
  const success=await run(secret);
  assert.equal(success.code,0,success.output);
  assert.match(success.output,/无需重启|\bhttps:\/\/www\.sm\.sjhl\.online:3333\/login/);
  assert.equal(success.output.includes(secret),false);
  assert.equal(writes,1);
  assert.equal(settings.saved.appId,appId);
  assert.equal(settings.saved.appSecret,secret);
  assert.equal(await fs.readFile(path.join(root,'.env'),'utf8'),original);
  const rejected=await run('wrong-fixture-secret');
  assert.equal(rejected.code,1,rejected.output);
  assert.equal(rejected.output.includes('wrong-fixture-secret'),false);
  assert.equal(writes,1);
  assert.equal(settings.saved.appSecret,secret);
});

test('generated BAT exactly embeds the reviewed sources',async()=>{
  const bat=await fs.readFile('configure-feishu-login.bat','utf8');
  const ps=await fs.readFile('scripts/feishu-login-tool.ps1','utf8');
  const js=await fs.readFile('scripts/feishu-login-tool.mjs','utf8');
  const psMarker='# VNET_PS_SOURCE\r\n',jsMarker='# VNET_NODE_SOURCE\r\n';
  assert.equal(bat.slice(bat.indexOf(psMarker)+psMarker.length,bat.indexOf(jsMarker)),(ps+'\n').replace(/\r?\n/g,'\r\n'));
  assert.equal(bat.slice(bat.indexOf(jsMarker)+jsMarker.length),js.replace(/\r?\n/g,'\r\n'));
  assert.doesNotMatch(bat,/fixture-secret-never-print|rejectUnauthorized\s*:\s*false|NODE_TLS_REJECT_UNAUTHORIZED/);
});

test('actual CMD double-click entry stops safely in the wrong directory', {skip:process.platform!=='win32',timeout:20000},async t=>{
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'vnet-login-launcher-中文-'));
  t.after(()=>fs.rm(root,{recursive:true,force:true}));
  await fs.copyFile('configure-feishu-login.bat',path.join(root,'configure-feishu-login.bat'));
  const result=await new Promise(resolve=>{
    const child=spawn('cmd.exe',['/d','/c','configure-feishu-login.bat'],{cwd:root,windowsHide:true});
    let output='';child.stdout.on('data',c=>output+=c);child.stderr.on('data',c=>output+=c);child.stdin.end('\n');child.on('exit',code=>resolve({code,output}));
  });
  assert.equal(result.code,1,result.output);
  assert.match(result.output,/BAT/);
  assert.doesNotMatch(result.output,/CommandNotFoundException|ParserError|SyntaxError/);
});
