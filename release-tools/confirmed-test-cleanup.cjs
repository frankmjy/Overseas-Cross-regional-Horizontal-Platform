'use strict';
const fs=require('node:fs'),path=require('node:path'),{randomUUID}=require('node:crypto');
const {sha,plain,inside}=require('./transaction.cjs');
const ids=['5d4e0a12-4f6d-4f6d-aa47-4a0bdea0749b','32c2771d-8582-4279-8191-519b02fe51d5','7f72ac55-305d-4a04-90a5-fdf1e7c373ee'];
const fail=code=>{throw new Error(code);};
const same=require('node:util').isDeepStrictEqual;
function inspect(bytes,retiredAt=new Date().toISOString()){
 const state=JSON.parse(bytes),pending=Object.values(state.operations||{}).filter(o=>!['success','retired'].includes(o.status));
 if(!pending.length)return null;
 if(pending.length!==3||pending.some(o=>!ids.includes(o.id))||Object.values(state.uploads||{}).some(u=>u.ready===false))fail('RELEASE_OUTBOX_NOT_SETTLED');
 const [topic,question,deleted]=ids.map(id=>state.operations[id]);
 if(!topic||!question||!deleted||topic.status!=='error'||question.status!=='blocked'||deleted.status!=='blocked')fail('RELEASE_TEST_TASK_IDENTITY_MISMATCH');
 const expected=[{kind:'topic',clientMutationId:ids[0],name:'1111',description:''},{kind:'question',clientMutationId:ids[1],title:'23234234',category:'1111',priority:true},{kind:'question-visibility',clientMutationId:ids[2],questionId:'Q-'+ids[1].toUpperCase(),deleted:true,version:deleted.payload?.version}];
 for(let i=0;i<ids.length;i++){
  const op=state.operations[ids[i]];
  if(!same(op.payload,expected[i])||!/^[a-f0-9]{64}$/.test(op.hash||'')||typeof op.createdAt!=='string'||!Array.isArray(op.dependencies)||op.dependencies.some(id=>!ids.slice(0,i).includes(id)))fail('RELEASE_TEST_TASK_IDENTITY_MISMATCH');
 }
 if(!question.dependencies.includes(ids[0])||!deleted.dependencies.includes(ids[1])||!/^[a-f0-9]{64}$/.test(deleted.payload.version||''))fail('RELEASE_TEST_TASK_IDENTITY_MISMATCH');
 for(const op of Object.values(state.operations))if(!ids.includes(op.id)&&(op.dependencies||[]).some(id=>ids.includes(id)))fail('RELEASE_TEST_TASK_HAS_EXTERNAL_DEPENDENT');
 const after=structuredClone(state);
 if(typeof retiredAt!=='string'||!Number.isFinite(Date.parse(retiredAt)))fail('RELEASE_LEDGER_BACKUP_INVALID');
 for(const id of ids){const op=state.operations[id];after.operations[id]={id:op.id,hash:op.hash,status:'retired',createdAt:op.createdAt,retiredAt,retiredReason:'User-confirmed test data; original operation retained in release recovery backup'};}
 return {beforeSha:sha(bytes),afterBytes:Buffer.from(JSON.stringify(after)),retiredAt,ids};
}
function atomicBytes(file,bytes){
 plain(file);const temp=file+'.'+randomUUID()+'.tmp',fd=fs.openSync(temp,'wx',0o600);
 try{fs.writeFileSync(fd,bytes);fs.fsyncSync(fd);}finally{fs.closeSync(fd);}
 try{fs.renameSync(temp,file);}finally{if(fs.existsSync(temp))fs.unlinkSync(temp);}
}
function prepare(root,recovery,plan){
 if(!plan)return null;
 const file=inside(root,'.runtime/research/state.json'),bytes=fs.readFileSync(file);
 if(sha(bytes)!==plan.beforeSha)fail('RELEASE_LEDGER_CHANGED');
 const transaction=path.basename(recovery),relative='.release-recovery/'+transaction+'/confirmed-tests/state.before.json',backup=inside(root,relative);
 fs.mkdirSync(path.dirname(backup),{recursive:true});fs.writeFileSync(backup,bytes,{flag:'wx',mode:0o600});
 if(sha(fs.readFileSync(backup))!==plan.beforeSha)fail('RELEASE_LEDGER_BACKUP_INVALID');
 return {schema:1,source:'.runtime/research/state.json',backup:relative,beforeSha:plan.beforeSha,afterSha:sha(plan.afterBytes),retiredAt:plan.retiredAt,ids};
}
function validate(root,transaction,data){
 if(!data||data.schema!==1||data.source!=='.runtime/research/state.json'||data.backup!=='.release-recovery/'+transaction+'/confirmed-tests/state.before.json'||!same(data.ids,ids)||!['beforeSha','afterSha'].every(k=>/^[a-f0-9]{64}$/.test(data[k]||'')))fail('RELEASE_LEDGER_BACKUP_INVALID');
 const backup=inside(root,data.backup),bytes=fs.readFileSync(backup);
 if(sha(bytes)!==data.beforeSha)fail('RELEASE_LEDGER_BACKUP_INVALID');
 const plan=inspect(bytes,data.retiredAt);if(!plan||sha(plan.afterBytes)!==data.afterSha)fail('RELEASE_LEDGER_BACKUP_INVALID');
 return {file:inside(root,data.source),bytes,plan};
}
function apply(root,transaction,data){
 if(!data)return;
 const {file,plan}=validate(root,transaction,data);
 if(sha(fs.readFileSync(file))!==data.beforeSha)fail('RELEASE_LEDGER_CHANGED');
 atomicBytes(file,plan.afterBytes);
 if(sha(fs.readFileSync(file))!==data.afterSha)fail('RELEASE_LEDGER_WRITE_INVALID');
}
function restore(root,transaction,data){
 if(!data)return;
 const {file,bytes}=validate(root,transaction,data),current=sha(fs.readFileSync(file));
 if(current===data.beforeSha)return;
 if(current!==data.afterSha)fail('RELEASE_LEDGER_CHANGED');
 atomicBytes(file,bytes);
 if(sha(fs.readFileSync(file))!==data.beforeSha)fail('RELEASE_LEDGER_RESTORE_INVALID');
}
module.exports={ids,inspect,prepare,validate,apply,restore};
