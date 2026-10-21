'use strict';
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {sha}=require('./transaction.cjs');
function previousRelease(source,id=process.env.OVERSEAS_PREVIOUS_RELEASE||'20261017.1'){
 assert.match(id,/^\d{8}\.\d+$/,'Previous release identity is invalid');
 const bundle=path.join(source,'.runtime','project-release-'+id,'bundle'),proofBytes=fs.readFileSync(path.join(source,'reports','project-release-'+id+'.proof.json')),proof=JSON.parse(proofBytes);
 assert.equal(proof.release,id);assert.equal(proof.status,'LOCAL_INSTALL_ROLLBACK_AND_CANDIDATE_SMOKE_PASSED');
 const archive=path.join(source,'reports','overseas-project-hotfix-'+id+'.zip');
 if(fs.existsSync(archive))assert.equal(sha(fs.readFileSync(archive)),proof.sha256,'Previous released archive changed');
 else {const {validateReceipt,receiptPath}=require('./deliver-project.cjs'),receipt=JSON.parse(fs.readFileSync(receiptPath(source,id),'utf8'));validateReceipt(receipt,id,proof.sha256);assert.equal(receipt.proofSha256,sha(proofBytes),'Delivery proof changed');assert.equal(receipt.manifestSha256,proof.manifestSha256);}
 const bytes=fs.readFileSync(path.join(bundle,'release-manifest.json'));assert.equal(sha(bytes),proof.manifestSha256);const manifest=JSON.parse(bytes.toString('utf8').replace(/^\uFEFF/,''));assert.equal(manifest.id,id);
 for(const[name,hash]of Object.entries(manifest.tools))assert.equal(sha(fs.readFileSync(path.join(bundle,name))),hash);
 for(const[name,hash]of Object.entries(manifest.files))assert.equal(sha(fs.readFileSync(path.join(bundle,'payload',name))),hash);
 return{bundle,manifest,proof};
}
async function seedBaseline({source,root,auditFile}){
 const previous=previousRelease(source),audit=JSON.parse(fs.readFileSync(auditFile,'utf8'));fs.mkdirSync(root,{recursive:true});
 for(const[file,info]of Object.entries(audit.publicFiles)){const bytes=fs.readFileSync(path.join(source,'dist/overseas-project-management-deploy-20260605-163554',file));assert.equal(sha(bytes),info.sha256);const target=path.join(root,file);fs.mkdirSync(path.dirname(target),{recursive:true});fs.writeFileSync(target,bytes);}
 const chain=[],seen=new Set();let release=previous;
 while(release){assert(!seen.has(release.manifest.id),'Previous release cycle');seen.add(release.manifest.id);chain.unshift(release);release=release.manifest.predecessor?.id?previousRelease(source,release.manifest.predecessor.id):null;}
 const health=expected=>{const file=fs.existsSync(path.join(root,'research/web/index.html'))?'research/web/index.html':'index.html';assert.equal(sha(fs.readFileSync(path.join(root,file))),expected.rootSha);};
 for(const item of chain){const old=require(path.join(item.bundle,'transaction.cjs'));await old.install({root,payload:path.join(item.bundle,'payload'),manifest:item.manifest,ops:{ownerActive:async()=>false,checkData:async()=>{},validateStorage:async()=>{},captureHealth:async()=>({rootSha:sha(fs.readFileSync(path.join(root,fs.existsSync(path.join(root,'research/web/index.html'))?'research/web/index.html':'index.html')))}),stop:async()=>{},start:async()=>{},health:async expected=>health(expected)}});}
 return previous;
}
function seedFormalCaches(root,source){
 const config=JSON.parse(fs.readFileSync(path.join(source,'research/config.json'),'utf8'));const keys=['questions','findings','evidence','topics'];
 for(const[key,project]of Object.entries(config.projects)){
  const binding=sha(JSON.stringify([key,config.baseToken,...keys.map(table=>project.tables[table])]));const dir=path.join(root,'.runtime/research/projects',key);fs.mkdirSync(dir,{recursive:true});fs.writeFileSync(path.join(dir,'state.json'),JSON.stringify({binding,operations:{},uploads:{},cache:{syncedAt:new Date().toISOString(),raw:Object.fromEntries(keys.map(table=>[table,[]]))}}));
 }
}
module.exports={previousRelease,seedBaseline,seedFormalCaches};
