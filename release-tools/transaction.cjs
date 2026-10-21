'use strict';
const fs=require('node:fs');
const path=require('node:path');
const {createHash,randomUUID}=require('node:crypto');
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const fail=code=>{throw Object.assign(new Error(code),{code});};
const readJson=file=>JSON.parse(fs.readFileSync(file,'utf8').replace(/^\uFEFF/,''));
const allowed=new Set(['server.mjs','base-sync.mjs','application-settings.mjs','package.json','index.html','.env.example','DEPLOY_README.md','RESEARCH_DEPLOY.md','THAI_NEXUSLINK_BOI_bilingual.xlsx','THAI_NEXUSLINK_BOI_original.xlsx','src','assets','research','knowledge','vendor/pdfjs']);
function plain(target){
  target=path.resolve(target);
  if(target.slice(path.parse(target).root.length).includes(':'))fail('RELEASE_ADS_PATH');
  for(let at=target;at;){if(fs.existsSync(at)&&fs.lstatSync(at).isSymbolicLink())fail('RELEASE_REPARSE_POINT');const parent=path.dirname(at);if(parent===at)break;at=parent;}
  return target;
}
function inside(root,relative){
  if(typeof relative!=='string'||!relative||relative.includes('\\')||relative.includes(':')||relative.split('/').some(p=>!p||p==='.'||p==='..')||path.isAbsolute(relative))fail('RELEASE_PATH_INVALID');
  const target=path.resolve(root,...relative.split('/'));if(!target.startsWith(path.resolve(root)+path.sep))fail('RELEASE_PATH_ESCAPE');return plain(target);
}
function atomic(file,value){
  plain(file);const temporary=file+'.'+randomUUID()+'.tmp',fd=fs.openSync(temporary,'wx',0o600);
  try{fs.writeFileSync(fd,JSON.stringify(value));fs.fsyncSync(fd);}finally{fs.closeSync(fd);}
  try{fs.renameSync(temporary,file);}finally{if(fs.existsSync(temporary))fs.unlinkSync(temporary);}
}
function tree(target){
  plain(target);if(!fs.existsSync(target))return {exists:false,hash:null,files:{}};
  const files={};const walk=(at,relative)=>{plain(at);const stat=fs.lstatSync(at);if(stat.isDirectory()){files[relative+'/']=null;for(const name of fs.readdirSync(at).sort())walk(path.join(at,name),relative?relative+'/'+name:name);}else if(stat.isFile()){files[relative]=sha(fs.readFileSync(at));}else fail('RELEASE_SPECIAL_FILE');};
  walk(target,'');return {exists:true,hash:sha(JSON.stringify(files)),files};
}
function core(root,keys){return Object.fromEntries(keys.map(file=>{const target=inside(root,file);if(!fs.existsSync(target))return [file,null];if(!fs.lstatSync(target).isFile())fail('RELEASE_CORE_NOT_FILE');return [file,sha(fs.readFileSync(target))];}));}
const equal=(left,right)=>JSON.stringify(left)===JSON.stringify(right);
function verifyCore(root,expected){const actual=core(root,Object.keys(expected));return Object.keys(expected).every(file=>actual[file]===expected[file]);}
function copyTree(source,destination){plain(source);plain(destination);const stat=fs.lstatSync(source);if(stat.isDirectory()){fs.mkdirSync(destination,{recursive:true});for(const name of fs.readdirSync(source))copyTree(path.join(source,name),path.join(destination,name));}else{fs.mkdirSync(path.dirname(destination),{recursive:true});fs.copyFileSync(source,destination,fs.constants.COPYFILE_EXCL);}}
function removeOwned(target,owner){target=plain(target);owner=path.resolve(owner);if(!target.startsWith(owner+path.sep))fail('RELEASE_CLEANUP_ESCAPE');if(!fs.existsSync(target))return;tree(target);fs.rmSync(target,{recursive:true,force:true});}
function markerRole(file){if(!fs.existsSync(file))return null;const raw=fs.readFileSync(file,'utf8').replace(/^\uFEFF/,'').trim();let value;try{value=JSON.parse(raw);}catch{value=raw.toLowerCase();}const role=typeof value==='string'?value:value?.role;return ['release','maintenance','updating'].includes(role)?'release':null;}
function validateManifest(manifest){
  if(manifest.schema!==1||!/^\d{8}\.\d{1,4}$/.test(manifest.id)||!Array.isArray(manifest.units)||new Set(manifest.units).size!==manifest.units.length||manifest.units.some(unit=>!allowed.has(unit)))fail('RELEASE_MANIFEST_INVALID');
  if(!manifest.core||!manifest.baselineCore||!manifest.dependencies||!manifest.files)fail('RELEASE_MANIFEST_INVALID');
  for(const [file,hash]of Object.entries(manifest.files)){if(!manifest.units.some(unit=>file===unit||file.startsWith(unit+'/'))||!/^[a-f0-9]{64}$/.test(hash))fail('RELEASE_MANIFEST_PATH');inside(path.resolve('.'),file);}
  for(const expected of [manifest.core,manifest.baselineCore,manifest.dependencies])for(const [file,hash]of Object.entries(expected)){inside(path.resolve('.'),file);if(hash!==null&&!/^[a-f0-9]{64}$/.test(hash))fail('RELEASE_MANIFEST_HASH');}
}
async function install({root,payload,manifest,ops,fault=()=>{}}){
  validateManifest(manifest);root=plain(root);payload=plain(payload);
  const sourceFiles=Object.fromEntries(Object.entries(tree(payload).files).filter(([name])=>!name.endsWith('/')));
  if(Object.keys(sourceFiles).length!==Object.keys(manifest.files).length||Object.entries(manifest.files).some(([name,hash])=>sourceFiles[name]!==hash))fail('RELEASE_PAYLOAD_INTEGRITY');
  const journalFile=path.join(root,'.hotfix-transaction.json'),marker=path.join(root,'.maintenance.lock'),ownerFile=path.join(root,'.release-owner.lock');
  if(fs.existsSync(ownerFile)){plain(ownerFile);const owner=readJson(ownerFile);if(await ops.ownerActive(owner))fail('RELEASE_OWNER_ACTIVE');fs.renameSync(ownerFile,ownerFile+'.stale.'+randomUUID());}
  const ownerFd=fs.openSync(ownerFile,'wx',0o600);fs.writeFileSync(ownerFd,JSON.stringify({pid:process.pid,startedAt:Date.now()-process.uptime()*1000}));fs.fsyncSync(ownerFd);
  let tx,stopped=false,started=false,mutated=false;
  const save=()=>atomic(journalFile,tx);
  const recover=async value=>{
    if(value.schema!==1||value.root!==root||!/^\d{8}\.\d{1,4}-[a-f0-9]{8}$/.test(value.transaction)||!Array.isArray(value.units)||value.units.some(unit=>!allowed.has(unit)))fail('RELEASE_OLD_TRANSACTION_UNKNOWN');
    const backup=inside(root,'.release-recovery/'+value.transaction+'/before');
    for(const unit of value.units){const snapshot=value.before[unit];if(snapshot.exists&&tree(inside(backup,unit)).hash!==snapshot.hash)fail('RELEASE_OLD_BACKUP_INVALID');}
    if(value.dataCleanup){if(!ops.validateDataBackup)fail('RELEASE_LEDGER_BACKUP_UNSUPPORTED');await ops.validateDataBackup(value.transaction,value.dataCleanup);}
    return backup;
  };
  const rollback=async()=>{
    if(started){await ops.stop();started=false;}
    const backup=await recover(tx);
    for(const unit of tx.units){const target=inside(root,unit);if(tree(target).hash===tx.before[unit].hash)continue;if(fs.existsSync(target))removeOwned(target,root);if(tx.before[unit].exists)copyTree(inside(backup,unit),target);}
    if(!verifyCore(root,tx.beforeCore))fail('RELEASE_ROLLBACK_CORE_FAILED');
    for(const unit of tx.units)if(tree(inside(root,unit)).hash!==tx.before[unit].hash)fail('RELEASE_ROLLBACK_BYTES_FAILED');
    if(tx.dataCleanup)await ops.restoreData(tx.transaction,tx.dataCleanup);
    try{await ops.health(tx.beforeHealth);}catch{started=true;await ops.start();await ops.health(tx.beforeHealth);}tx.phase='rolled-back';save();
    if(fs.existsSync(marker))fs.unlinkSync(marker);stopped=false;
  };
  try{
    let previous,previousBytes;
    if(fs.existsSync(journalFile)){plain(journalFile);previousBytes=fs.readFileSync(journalFile);previous=readJson(journalFile);await recover(previous);}
    if(fs.existsSync(marker)&&(!previous||markerRole(marker)!=='release'))fail('RELEASE_UNOWNED_MAINTENANCE');
    if(!verifyCore(root,manifest.baselineCore)){
      if(!previous||!verifyCore(root,previous.targetCore)){
        if(previous&&!['committed','rolled-back'].includes(previous.phase)&&previous.units.every(unit=>{const current=tree(inside(root,unit));return !current.exists||current.hash===previous.before[unit].hash||current.hash===previous.target[unit].hash;})){
          tx=previous;await ops.stop();stopped=true;await rollback();tx=null;stopped=false;started=false;
          if(!verifyCore(root,manifest.baselineCore))fail('RELEASE_CORE_DRIFT');
        }else fail('RELEASE_CORE_DRIFT');
      }
    }
    if(!verifyCore(root,manifest.dependencies))fail('RELEASE_DEPENDENCY_DRIFT');
    if(previous&&previous.phase!=='committed'&&previous.phase!=='rolled-back'){
      const coherent=verifyCore(root,previous.beforeCore)||verifyCore(root,previous.targetCore)||verifyCore(root,manifest.baselineCore);
      if(!coherent)fail('RELEASE_OLD_RUNTIME_MIXED');
    }
    await ops.checkData();
    const beforeHealth=await ops.captureHealth();
    const snapshotCore=core(root,Object.keys(manifest.core));
    const transaction=manifest.id+'-'+randomUUID().slice(0,8),recovery=inside(root,'.release-recovery/'+transaction),staging=inside(root,'.release-staging/'+transaction);
    fs.mkdirSync(recovery,{recursive:true});fs.mkdirSync(staging,{recursive:true});
    const before={};
    for(const unit of manifest.units){const source=inside(root,unit);before[unit]=tree(source);if(before[unit].exists){copyTree(source,inside(recovery,'before/'+unit));if(tree(inside(recovery,'before/'+unit)).hash!==before[unit].hash)fail('RELEASE_SNAPSHOT_CHANGED');}}
    for(const [relative,hash]of Object.entries(manifest.files)){const source=inside(payload,relative);if(!fs.existsSync(source)||!fs.lstatSync(source).isFile()||sha(fs.readFileSync(source))!==hash)fail('RELEASE_PAYLOAD_INTEGRITY');const destination=inside(staging,relative);fs.mkdirSync(path.dirname(destination),{recursive:true});fs.copyFileSync(source,destination,fs.constants.COPYFILE_EXCL);if(sha(fs.readFileSync(destination))!==hash)fail('RELEASE_STAGING_INTEGRITY');}
    await ops.validateStorage([...manifest.units.map(unit=>inside(root,unit)),staging]);
    const after=Object.fromEntries(manifest.units.map(unit=>[unit,tree(inside(staging,unit))]));
    tx={schema:1,root,release:manifest.id,transaction,phase:'prepared',units:manifest.units,before,target:after,beforeCore:snapshotCore,targetCore:manifest.core,beforeHealth,afterHealth:manifest.health,applied:[]};
    if(ops.prepareData)tx.dataCleanup=await ops.prepareData(recovery);
    if(previousBytes){const archive=inside(recovery,'previous-journal.json');fs.writeFileSync(archive,previousBytes,{flag:'wx'});tx.predecessor={sha256:sha(previousBytes),path:'.release-recovery/'+transaction+'/previous-journal.json'};if(sha(fs.readFileSync(archive))!==tx.predecessor.sha256)fail('RELEASE_OLD_LOG_ARCHIVE_FAILED');}
    save();fault('prepared');
    atomic(marker,{role:'release',releaseId:manifest.id});
    await ops.checkData();
    for(const unit of manifest.units)if(tree(inside(root,unit)).hash!==before[unit].hash)fail('RELEASE_ROOT_CHANGED_BEFORE_STOP');
    if(!verifyCore(root,snapshotCore))fail('RELEASE_CORE_CHANGED_BEFORE_STOP');
    stopped=true;await ops.stop();tx.phase='stopped';save();fault('stopped');
    if(tx.dataCleanup){await ops.applyData(tx.transaction,tx.dataCleanup);save();fault('data-cleanup');}
    for(const unit of manifest.units){const target=inside(root,unit),stage=inside(staging,unit);if(fs.existsSync(target)){const replaced=inside(recovery,'replaced/'+unit);fs.mkdirSync(path.dirname(replaced),{recursive:true});fs.renameSync(target,replaced);}fs.mkdirSync(path.dirname(target),{recursive:true});fs.renameSync(stage,target);tx.applied.push(unit);mutated=true;save();fault('unit:'+unit);}
    if(!verifyCore(root,manifest.core))fail('RELEASE_INSTALLED_CORE_INVALID');
    tx.phase='starting';save();started=true;await ops.start();fault('started');await ops.health(manifest.health);fault('healthy');tx.phase='healthy';save();
    fs.unlinkSync(marker);tx.phase='committed';save();return {ok:true,release:manifest.id,transaction,rollbackDirectory:recovery};
  }catch(error){
    if(tx&&(stopped||mutated)){try{await rollback();}catch(recoveryError){tx.phase='recovery-required';tx.error=error.code||'RELEASE_FAILED';tx.recoveryError=recoveryError.code||'RELEASE_RECOVERY_FAILED';save();throw Object.assign(new Error('RELEASE_RECOVERY_REQUIRED'),{code:'RELEASE_RECOVERY_REQUIRED'});}}
    else if(tx){tx.phase='aborted';save();if(fs.existsSync(marker)&&markerRole(marker)==='release')fs.unlinkSync(marker);}
    throw error;
  }finally{fs.closeSync(ownerFd);fs.unlinkSync(ownerFile);}
}
module.exports={install,sha,tree,core,atomic,inside,plain,validateManifest};
