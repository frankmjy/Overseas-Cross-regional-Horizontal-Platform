'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const sha=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
const fail=code=>{throw Error(code);};
const read=file=>JSON.parse(fs.readFileSync(file,'utf8').replace(/^\uFEFF/,''));
function verifiedStop(ticket,owner,exec=require('node:child_process').execFileSync){
 if(!owner)return;
 const output=exec('powershell.exe',['-NoLogo','-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-File',path.join(__dirname,'Remote-Stop.ps1'),'-Root',ticket.root,'-NodeExe',ticket.node,'-Port',String(ticket.port),'-ProcessId',String(owner.pid),'-StartedAt',String(owner.created)],{encoding:'utf8',windowsHide:true,timeout:20000,stdio:['ignore','pipe','pipe']});
 if(readReply(output)?.stopped!==true)fail('REMOTE_STOP_NOT_CONFIRMED');
}
const readReply=output=>output.trim()?JSON.parse(output.replace(/^\uFEFF/,'')):null;
function startManagedService(ticket,stage,exec=require('node:child_process').execFileSync){
 const reply=readReply(exec('powershell.exe',['-NoLogo','-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-File',path.join(stage,'Remote-Service.ps1'),'-TicketFile',path.join(stage,'ticket.json')],{encoding:'utf8',windowsHide:true,timeout:30000,stdio:['ignore','pipe','pipe']}));if(reply?.started!==true)fail('REMOTE_MANAGED_START_NOT_CONFIRMED');return reply;
}
function noPending(root,plain){
 const specs=[['handover','ledger.json'],['staffing','ledger.json'],['coordination','mutations.json'],['priorities','ledger.json'],['knowledge','document-ledger.json']];
 const projectRoot=path.join(root,'.runtime/research/projects');
 if(fs.existsSync(projectRoot)){plain(projectRoot);for(const entry of fs.readdirSync(projectRoot,{withFileTypes:true})){if(!entry.isDirectory()||!entry.name.match(/^[a-z0-9-]+$/))fail('REMOTE_PROJECT_DIRECTORY_INVALID');specs.push(['research/projects/'+entry.name,'state.json']);}}
 for(const[folder,name]of specs){const file=path.join(root,'.runtime',folder,name);if(!fs.existsSync(file))continue;plain(file);const state=read(file);if(!state.operations||Object.values(state.operations).some(op=>!['success','retired','discarded'].includes(op.status))||Object.values(state.uploads||{}).some(upload=>upload.ready===false))fail('REMOTE_OUTBOX_NOT_SETTLED');}
}
function privateHashes(root,plain){
 const result={};const walk=(relative)=>{const file=path.join(root,relative);if(!fs.existsSync(file))return;plain(file);const stat=fs.lstatSync(file);if(stat.isDirectory()){for(const name of fs.readdirSync(file))walk(relative+'/'+name);}else if(stat.isFile()){if(stat.size>67108864)fail('REMOTE_PRIVATE_FILE_LIMIT');result[relative]=sha(fs.readFileSync(file));}else fail('REMOTE_PRIVATE_FILE_INVALID');};
 walk('.env');walk('certs');
 for(const folder of ['auth','staffing','coordination','priorities','project-tasks','knowledge','research']){const base=path.join(root,'.runtime',folder);if(!fs.existsSync(base))continue;const jsonWalk=relative=>{const file=path.join(root,relative);plain(file);const stat=fs.lstatSync(file);if(stat.isDirectory()){for(const name of fs.readdirSync(file))if(!['attachments','uploads','release-logs'].includes(name))jsonWalk(relative+'/'+name);}else if(/\.(json|key|dpapi|enc)$/.test(file))walk(relative);};jsonWalk('.runtime/'+folder);}
 return result;
}
function unchanged(expected,root,plain){const actual=privateHashes(root,plain);for(const[file,hash]of Object.entries(expected))if(actual[file]!==hash)fail('REMOTE_PRIVATE_DATA_CHANGED');}
async function main(bundle,ticketFile){
 const ticket=read(ticketFile),report=path.join(path.dirname(ticketFile),'result.json');
 const write=value=>{const temporary=report+'.new';fs.writeFileSync(temporary,JSON.stringify({release:ticket.release,manifestSha256:ticket.manifestSha256,at:new Date().toISOString(),...value},null,2));fs.renameSync(temporary,report);};
 let ops,manifest,environmentBefore;
 try{
  if(ticket.root!=='C:\\ai\\overseas-project-management-deploy-20260605-163554'||ticket.port!==3333)fail('REMOTE_TARGET_MISMATCH');
  const manifestFile=path.join(bundle,'release-manifest.json');if(sha(fs.readFileSync(manifestFile))!==ticket.manifestSha256)fail('REMOTE_MANIFEST_CHANGED');manifest=read(manifestFile);
  if(manifest.id!==ticket.release||manifest.targetRoot!==ticket.root||manifest.port!==ticket.port||manifest.node!==ticket.node)fail('REMOTE_MANIFEST_TARGET_MISMATCH');
  for(const[name,hash]of Object.entries(manifest.tools)){if(path.basename(name)!==name||sha(fs.readFileSync(path.join(bundle,name)))!==hash)fail('REMOTE_TOOL_INTEGRITY');}
  const {install,plain}=require(path.join(bundle,'transaction.cjs')),{windowsOps}=require(path.join(bundle,'install-runner.cjs'));
  plain(ticket.root);for(const[file,hash]of Object.entries(ticket.baselineCore))if(sha(fs.readFileSync(path.join(ticket.root,file)))!==hash)fail('REMOTE_BASELINE_CHANGED');
  environmentBefore=sha(fs.readFileSync(path.join(ticket.root,'.env')));if(environmentBefore!==ticket.environmentSha256)fail('REMOTE_ENVIRONMENT_CHANGED');
  ops=windowsOps({root:ticket.root,node:manifest.node,port:manifest.port,domain:manifest.domain,fingerprint:manifest.fingerprint});
  const check=ops.checkData,apply=ops.applyData;let protectedBytes,protectionChecks=0,firstStop=true,expectedOwner=ticket.process;
  const currentOwner=()=>readReply(require('node:child_process').execFileSync('powershell.exe',['-NoLogo','-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-File',path.join(bundle,'WindowsBridge.ps1'),'-Action','Port','-Port',String(ticket.port)],{encoding:'utf8',windowsHide:true,timeout:15000,stdio:['ignore','pipe','pipe']}));
  ops.checkData=async()=>{noPending(ticket.root,plain);await check.call(ops);noPending(ticket.root,plain);};
  ops.stop=async()=>{const actual=currentOwner();if(actual&&expectedOwner&&(actual.pid!==expectedOwner.pid||actual.created!==expectedOwner.created))fail('REMOTE_PORT_OWNER_DRIFT');verifiedStop(ticket,actual||expectedOwner);firstStop=false;expectedOwner=null;protectedBytes=privateHashes(ticket.root,plain);};
  ops.applyData=async(...args)=>{const result=await apply.apply(ops,args);if(protectedBytes){const file='.runtime/research/state.json';if(fs.existsSync(path.join(ticket.root,file)))protectedBytes[file]=sha(fs.readFileSync(path.join(ticket.root,file)));}return result;};
  ops.start=async()=>{if(protectedBytes){unchanged(protectedBytes,ticket.root,plain);protectionChecks++;}if(currentOwner())fail('REMOTE_PORT_OCCUPIED');startManagedService(ticket,path.dirname(ticketFile));for(let i=0;i<30;i++){await new Promise(r=>setTimeout(r,250));const owner=currentOwner();if(owner){expectedOwner=owner;return;}}fail('REMOTE_MANAGED_START_TIMEOUT');};
  write({status:'running',phase:'preflight'});
  const result=await install({root:ticket.root,payload:path.join(bundle,'payload'),manifest,ops,fault:phase=>write({status:'running',phase})});
  await ops.health(manifest.health);
  for(const[file,hash]of Object.entries(manifest.files))if(sha(fs.readFileSync(path.join(ticket.root,file)))!==hash)fail('REMOTE_INSTALLED_FILE_MISMATCH');
  if(sha(fs.readFileSync(path.join(ticket.root,'.env')))!==environmentBefore)fail('REMOTE_ENVIRONMENT_CHANGED');
  write({status:'success',phase:'verified',ok:result.ok,remoteServerVerified:true,port:3333,sourceFiles:Object.keys(manifest.files).length,privateDataCheckedBeforeStart:protectionChecks>0,environmentPreserved:true,httpsHealthPassed:true,baselineRelease:ticket.baselineRelease});
 }catch(error){let rollbackVerified=false;try{if(ops){await ops.captureHealth();rollbackVerified=Object.entries(ticket.baselineCore).every(([file,hash])=>sha(fs.readFileSync(path.join(ticket.root,file)))===hash);}}catch{}write({status:'error',ok:false,error:/^[A-Z_]+$/.test(error.code||error.message)?error.code||error.message:'REMOTE_INSTALL_FAILED',rollbackVerified});process.exitCode=1;}
}
module.exports={noPending,privateHashes,unchanged,verifiedStop,startManagedService};
if(require.main===module)main(path.resolve(process.argv[2]),path.resolve(process.argv[3])).catch(()=>{console.error('REMOTE_WORKER_FAILED');process.exitCode=1;});
