'use strict';
const fs=require('node:fs'),path=require('node:path'),https=require('node:https');
const {execFileSync,spawn}=require('node:child_process');
const {install,sha,plain,atomic}=require('./transaction.cjs');
const confirmedTests=require('./confirmed-test-cleanup.cjs');
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
function windowsOps({root,node,port,domain,fingerprint}){
  const bridge=path.join(__dirname,'WindowsBridge.ps1');let current,cleanupPlan,preparedCleanup;
  function call(action,args=[]){let output;try{output=execFileSync('powershell.exe',['-NoProfile','-ExecutionPolicy','Bypass','-File',bridge,'-Action',action,'-Port',String(port),...args],{windowsHide:true,encoding:'utf8',stdio:['ignore','pipe','pipe'],timeout:15000});}catch{throw Object.assign(new Error('RELEASE_WINDOWS_'+action.toUpperCase()+'_FAILED'),{code:'RELEASE_WINDOWS_'+action.toUpperCase()+'_FAILED'});}return output.trim()?JSON.parse(output.replace(/^\uFEFF/,'')):null;}
  function request(route){return new Promise((resolve,reject)=>{const req=https.get({hostname:'127.0.0.1',servername:domain,port,path:route,headers:{host:domain+':'+port},agent:false,timeout:4000},response=>{const fp=response.socket.getPeerCertificate().fingerprint256;if(fp!==fingerprint){response.destroy();reject(new Error('RELEASE_CERTIFICATE_MISMATCH'));return;}const chunks=[];let size=0;response.on('data',chunk=>{size+=chunk.length;if(size>3000000)response.destroy(new Error('RELEASE_HEALTH_TOO_LARGE'));else chunks.push(chunk);});response.on('end',()=>resolve({status:response.statusCode,bytes:Buffer.concat(chunks)}));response.on('error',reject);});req.on('error',reject);req.on('timeout',()=>req.destroy(new Error('RELEASE_HEALTH_TIMEOUT')));});}
  return {
    ownerActive:owner=>Promise.resolve(call('Owner',['-ProcessId',String(owner.pid),'-StartedAt',String(owner.startedAt)])?.active===true),
    async checkData(){
      const dirs=[path.join(root,'.runtime','research')];
      const envFile=path.join(root,'.env');if(fs.existsSync(envFile))for(const line of fs.readFileSync(envFile,'utf8').split(/\r?\n/)){const match=/^\s*RESEARCH_DATA_DIR\s*=(.*)$/.exec(line);if(match&&match[1].trim())dirs.push(path.resolve(root,match[1].trim().replace(/^['"]|['"]$/g,'')));}
      if(process.env.RESEARCH_DATA_DIR)dirs.push(path.resolve(root,process.env.RESEARCH_DATA_DIR));
      const ledgers=[...new Set(dirs)].flatMap(dir=>[dir,path.join(dir,'projects','thailand'),path.join(dir,'projects','malaysia')]);
      cleanupPlan=null;
      for(const dir of ledgers){plain(dir);const stateFile=path.join(dir,'state.json');if(!fs.existsSync(stateFile))continue;plain(stateFile);let state,bytes;try{bytes=fs.readFileSync(stateFile);state=JSON.parse(bytes);}catch{throw new Error('RELEASE_LEDGER_UNREADABLE');}if(preparedCleanup&&path.relative(path.join(root,'.runtime','research'),path.resolve(dir))===''&&sha(bytes)!==preparedCleanup.beforeSha)throw new Error('RELEASE_LEDGER_CHANGED');if(Object.values(state.uploads||{}).some(upload=>upload.ready===false))throw new Error('RELEASE_OUTBOX_NOT_SETTLED');if(Object.values(state.operations||{}).some(op=>!['success','retired'].includes(op.status))){if(path.relative(path.join(root,'.runtime','research'),path.resolve(dir))!=='')throw new Error('RELEASE_OUTBOX_NOT_SETTLED');cleanupPlan=confirmedTests.inspect(bytes);}}
    },
    async prepareData(recovery){if(cleanupPlan)await this.validateStorage([path.join(root,'.runtime','research','state.json')]);preparedCleanup=confirmedTests.prepare(root,recovery,cleanupPlan);return preparedCleanup;},
    async validateDataBackup(transaction,data){confirmedTests.validate(root,transaction,data);},
    async applyData(transaction,data){confirmedTests.apply(root,transaction,data);},
    async restoreData(transaction,data){confirmedTests.restore(root,transaction,data);},
    async captureHealth(){current=call('Port');if(!current)throw new Error('RELEASE_OLD_SERVICE_NOT_RUNNING');const result=await request('/');const hash=sha(result.bytes);const allowed=['index.html','research/web/index.html'].filter(file=>fs.existsSync(path.join(root,file))).map(file=>sha(fs.readFileSync(path.join(root,file))));if(result.status!==200||!allowed.includes(hash))throw new Error('RELEASE_OLD_HEALTH_MISMATCH');return {rootSha:hash};},
    async stop(){const owner=call('Port');if(current&&owner&&(owner.pid!==current.pid||owner.created!==current.created))throw new Error('RELEASE_PORT_OWNER_DRIFT');const target=owner||current;if(target)call('Stop',['-ProcessId',String(target.pid),'-StartedAt',String(target.created)]);current=null;},
    async start(){
      if(call('Port'))throw new Error('RELEASE_PORT_OCCUPIED');
      const env={...process.env},envFile=path.join(root,'.env');
      if(fs.existsSync(envFile))for(const line of fs.readFileSync(envFile,'utf8').split(/\r?\n/)){if(line.trim().startsWith('#'))continue;const match=/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=(.*)$/.exec(line);if(match&&!env[match[1]])env[match[1]]=match[2];}
      env.PORT=String(port);env.SERVER_HOST='0.0.0.0';env.LARK_CLI_SCRIPT=path.join(root,'vendor/lark-cli/run.cjs');
      const child=spawn(plain(node),[path.join(root,'server.mjs')],{cwd:root,env,windowsHide:true,detached:true,stdio:'ignore'});
      await new Promise((resolve,reject)=>{child.once('spawn',resolve);child.once('error',()=>reject(new Error('RELEASE_PROCESS_SPAWN_FAILED')));});
      current={pid:child.pid,created:Date.now()};child.unref();
      for(let attempt=0;attempt<20;attempt++){await delay(250);if(child.exitCode!==null)throw new Error('RELEASE_START_EXITED');const owner=call('Port');if(owner){if(owner.pid!==child.pid)throw new Error('RELEASE_NEW_PORT_OWNER_MISMATCH');current=owner;return;}}
      throw new Error('RELEASE_START_TIMEOUT');
    },
    async health(expected){let last;for(let attempt=0;attempt<12;attempt++){try{const response=await request('/');if(response.status!==200||sha(response.bytes)!==expected.rootSha)throw new Error('RELEASE_ROOT_HEALTH_MISMATCH');if(expected.projectSha){const project=await request('/project-management');if(project.status!==200||sha(project.bytes)!==expected.projectSha)throw new Error('RELEASE_PROJECT_HEALTH_MISMATCH');const api=await request('/api/research');if(api.status!==200||!JSON.parse(api.bytes).state)throw new Error('RELEASE_RESEARCH_HEALTH_MISMATCH');for(const route of ['/.env','/.runtime/research/state.json','/vendor/lark-cli/run.cjs'])if((await request(route)).status!==404)throw new Error('RELEASE_PRIVATE_PATH_EXPOSED');}if(expected.formalProjects)for(const key of ['thailand','malaysia']){const response=await request('/api/research?project='+key),api=JSON.parse(response.bytes);if(response.status!==200||!['ready','loading'].includes(api.state)||api.error||api.data&&api.data.project?.key!==key||!api.projects?.some(project=>project.key===key))throw new Error('RELEASE_FORMAL_PROJECT_HEALTH_MISMATCH');}if(expected.knowledgeSha){const response=await request('/knowledge-sharing');if(response.status!==200||sha(response.bytes)!==expected.knowledgeSha)throw new Error('RELEASE_KNOWLEDGE_HEALTH_MISMATCH');}return;}catch(error){last=error;await delay(250);}}throw last;},
    async validateStorage(paths){const temporary=path.join(root,'.release-storage-'+process.pid+'.json');atomic(temporary,paths);try{call('Storage',['-InputFile',temporary]);}finally{fs.unlinkSync(temporary);}},
  };
}
async function main(){const bundle=path.resolve(process.argv[2]||__dirname),manifest=JSON.parse(fs.readFileSync(path.join(bundle,'release-manifest.json'),'utf8')),root=plain(manifest.targetRoot);const ops=windowsOps({root,node:manifest.node,port:manifest.port,domain:manifest.domain,fingerprint:manifest.fingerprint});let report;try{report=await install({root,payload:path.join(bundle,'payload'),manifest,ops});}catch(error){report={ok:false,error:/^RELEASE_[A-Z_]+$/.test(error.code||error.message)?(error.code||error.message):'RELEASE_FAILED',review:'.hotfix-transaction.json'};}const reports=path.join(root,'.runtime','release-reports');fs.mkdirSync(reports,{recursive:true});atomic(path.join(reports,manifest.id+'.json'),report);console.log(JSON.stringify(report));if(!report.ok)process.exitCode=1;}
if(require.main===module)main().catch(()=>{console.error('RELEASE_UNEXPECTED_FAILURE');process.exitCode=1;});
module.exports={windowsOps};
