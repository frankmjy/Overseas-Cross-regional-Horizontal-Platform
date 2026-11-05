import fs from 'node:fs';
import path from 'node:path';
import { randomUUID,createHash } from 'node:crypto';
import { saveJson,readJson,lockWriter } from '../knowledge/storage.mjs';
import { validUploadName } from '../research/service.mjs';
import { PriorityAdapter } from './adapter.mjs';
import { projects,fields,normalize,validate,encode,matches,digest,uuid,fileIdentity,appendFeedback,failure } from './model.mjs';
const definitiveFailure=error=>/10014|99991672|91403|1254045|1254015|1254104|1254291|CLI 参数或路径/.test(error.message||'');
const terminal=op=>['success','discarded'].includes(op.status);
export class PriorityService{
 constructor({dir,adapter=new PriorityAdapter(),now=Date.now,isMaintenance=()=>false,appId=()=>process.env.FEISHU_APP_ID||''}){
  this.dir=dir;this.file=path.join(dir,'ledger.json');this.adapter=adapter;this.now=now;this.isMaintenance=isMaintenance;this.appId=appId;
  this.state=readJson(this.file,{version:1,appId:appId(),projects:{},operations:{},uploads:{}});
  if(this.state.version!==1||!this.state.projects||!this.state.operations||!this.state.uploads)throw Error('事项台账损坏，请保留原文件恢复。');
  this.queue=Promise.resolve();this.refreshing=new Map();
 }
 init(){this.unlock=lockWriter(path.join(this.dir,'writer.lock'));}
 identity(){if(this.state.appId!==this.appId())throw failure('事项应用身份已变化，请先核对人员映射和待同步任务。',503);}
 commit(change){const next=structuredClone(this.state);change(next);saveJson(this.file,next);this.state=next;}
 serialize(fn){const run=this.queue.then(fn);this.queue=run.catch(()=>{});return run;}
 project(id){if(!Object.hasOwn(projects,id))throw failure('该项目尚未接入重点卡点表。',404);return this.state.projects[id];}
 publicOperation(op){return {id:op.id,status:op.status,error:op.error||'',recordId:op.recordId||'',updatedAt:op.updatedAt,uploads:op.value.attachments.filter(f=>this.state.uploads[f.id]).map(f=>({id:f.id,name:f.name,size:f.size,ready:!!this.state.uploads[f.id].ready,synced:!!op.uploaded?.includes(f.id),error:this.state.uploads[f.id].error||''}))};}
 snapshot(project,actor){
  this.identity();const state=this.project(project),items=(state?.records||[]).map(normalize).filter(r=>!r.example),ops=Object.values(this.state.operations).filter(o=>o.project===project&&o.status!=='discarded');
  for(const op of ops){let index=items.findIndex(r=>r.id===op.recordId||r.id===op.localId);if(!terminal(op)){const row={...op.value,id:op.recordId||op.localId,recordId:op.recordId||'',code:index>=0?items[index].code:'',week:op.week,ownerName:op.ownerName,history:op.historyEntries,version:op.baseVersion||'',sync:this.publicOperation(op)};if(index<0)items.unshift(row);else items[index]=row;}else if(index>=0)items[index].sync=this.publicOperation(op);}
  const people=new Map(Object.values(this.state.projects).flatMap(p=>p.context?.people||[]).map(p=>[p.id,p]));if(actor?.openId)people.set(actor.openId,{id:actor.openId,name:actor.name});
  return {projectName:project==='th-001'?'泰国项目':'马来项目',ready:!!state?.context,refreshing:this.refreshing.has(project),error:this.errors?.[project]||'',items:items.map(r=>({...r,attachments:r.attachments.map(f=>({...f,url:`/api/priorities/files/${encodeURIComponent(r.id)}/${f.id}?project=${project}`}))})),people:[...people.values()],plans:state?.context?.plans||[],impacts:state?.context?.schema.impact.options||[],updatedAt:state?.updatedAt||null};
 }
 refresh(project){this.project(project);if(this.refreshing.has(project))return this.refreshing.get(project);const work=this.serialize(async()=>{this.identity();const context=await this.adapter.context(project),records=await this.adapter.list(project);const people=new Map(context.people.map(p=>[p.id,p]));for(const r of records)for(const u of r[fields.owner[0]]||[])if(u.id&&u.name)people.set(u.id,{id:u.id,name:u.name});context.people=[...people.values()];this.commit(s=>{s.projects[project]={context,records,updatedAt:this.now()};});this.errors={...this.errors,[project]:''};}).catch(e=>{this.errors={...this.errors,[project]:e.message||'事项暂未更新，可重试。'};throw e;}).finally(()=>this.refreshing.delete(project));this.refreshing.set(project,work);return work;}
 accept(raw,actor){
  this.identity();if(this.isMaintenance()||this.closed)throw failure('系统正在更新，请稍后提交。',503);
  if(!actor?.openId||!actor?.name)throw failure('请先使用飞书登录。',401);
  if(!uuid.test(raw?.clientMutationId||''))throw failure('提交标识无效。');
  const id=raw.clientMutationId,hash=digest(raw),prior=this.state.operations[id];if(prior){if(prior.hash!==hash||prior.editor!==actor.openId)throw failure('提交标识已用于其他内容。',409);return {operation:this.publicOperation(prior),...this.snapshot(prior.project,actor)};}
  const project=raw.project,state=this.project(project);if(!state?.context)throw failure('事项字段正在读取，请稍后重试。',503);
  if(!/^\d{4}-\d\d-\d\d$/.test(raw.week||'')||!Number.isFinite(Date.parse(raw.week))||new Date(raw.week+'T00:00:00Z').toISOString().slice(0,10)!==raw.week||new Date(raw.week+'T00:00:00Z').getUTCDay()!==1)throw failure('跟进周无效。');
  const existing=raw.id?state.records.find(r=>r.recordId===raw.id):null;
  if(raw.id&&!existing)throw failure('事项不存在，请刷新页面。',404);
  if(raw.id&&Object.values(this.state.operations).some(o=>o.project===project&&!terminal(o)&&(o.recordId===raw.id||o.localId===raw.id)))throw failure('此事项尚在同步，请完成同步后再编辑。',409);
  const old=existing&&normalize(existing);if(old&&(raw.version!==old.version||old.week!==raw.week))throw failure('事项已更新，请刷新后重新编辑。',409);
  const value=validate(raw.values,{...state.context,people:this.snapshot(project,actor).people},actor),known=new Map((old?.attachments||[]).map(f=>[f.id,f]));
  for(const f of value.attachments){if(known.has(f.id)){if(digest(f)!==digest(known.get(f.id)))throw failure('附件信息不一致。');}else if(this.state.uploads[f.id]||!validUploadName(f.name))throw failure('附件名称、类型或标识无效。');}
  const history=value.progress&&value.progress!==old?.progress?appendFeedback(old?.historyText||'',value.progress,actor,this.now()):old?.historyText||'';
  const entries=history?normalize({recordId:'history',[fields.history[0]]:history}).history:[];
  const op={id,hash,project,editor:actor.openId,actor,value,week:raw.week,localId:'pending-'+id,recordId:raw.id||'',baseVersion:old?.version||'',history,historyEntries:entries,feedbackChanged:!!value.progress&&value.progress!==old?.progress,time:new Date(this.now()+8*3600000).toISOString().slice(0,16).replace('T',' ')+':00',ownerName:state.context.people.find(p=>p.id===value.owner)?.name||actor.name,status:'accepted',attempts:0,updatedAt:this.now(),uploaded:[],removeTokens:(existing?.[fields.attachments[0]]||[]).filter(f=>!value.attachments.some(v=>v.id===fileIdentity(f).id)).map(f=>f.file_token)};
  this.commit(s=>{s.operations[id]=op;for(const f of value.attachments)if(!known.has(f.id))s.uploads[f.id]={...f,project,operation:id,editor:actor.openId,ready:false};});this.kick();return {operation:this.publicOperation(op),...this.snapshot(project,actor)};
 }
 upload(project,id,name,bytes,actor){
  this.identity();if(this.isMaintenance())throw failure('系统正在更新，请稍后重传。',503);this.project(project);const file=this.state.uploads[id];
  if(!file||file.project!==project||file.editor!==actor?.openId)throw failure('附件不存在或无权上传。',404);
  if(file.name!==name||bytes.length!==file.size||bytes.length>20*1024*1024)throw failure('附件名称或大小不匹配。');
  const sha=createHash('sha256').update(bytes).digest('hex');if(file.sha&&file.sha!==sha)throw failure('同一附件标识不能替换不同内容。',409);if(file.ready){if(file.sha!==sha)throw failure('同一附件标识不能替换不同内容。',409);return;}
  const location=path.join(this.dir,'uploads',id,`${id}__${file.name}`);fs.mkdirSync(path.dirname(location),{recursive:true});const temp=location+'.'+randomUUID()+'.part';
  try{const fd=fs.openSync(temp,'wx',0o600);try{fs.writeFileSync(fd,bytes);fs.fsyncSync(fd);}finally{fs.closeSync(fd);}fs.renameSync(temp,location);this.commit(s=>{Object.assign(s.uploads[id],{ready:true,sha,error:''});const op=s.operations[file.operation];if(!terminal(op)){op.nextAttempt=0;op.status='accepted';}});}finally{if(fs.existsSync(temp))fs.unlinkSync(temp);}this.kick();
 }
 uploadFailed(project,id,actor){this.identity();const f=this.state.uploads[id];if(!f||f.project!==project||f.editor!==actor?.openId)throw failure('附件不存在。',404);this.commit(s=>{s.uploads[id].error='上传未完成，请重新选择该文件重传。';});}
 retry(id,actor){this.identity();const op=this.state.operations[id];if(!op||op.editor!==actor?.openId)throw failure('同步任务不存在。',404);if(this.isMaintenance())throw failure('系统正在更新。',503);if(!terminal(op))this.commit(s=>{Object.assign(s.operations[id],{status:'accepted',nextAttempt:0,error:''});});this.kick();return this.publicOperation(this.state.operations[id]);}
 discard(id,actor){this.identity();const op=this.state.operations[id];if(!op||op.editor!==actor?.openId||op.status!=='blocked'||op.contentDone)throw failure('该任务不能放弃。',409);this.commit(s=>{s.operations[id].status='discarded';});}
 flush(){if(this.running)return this.running;if(this.closed||this.isMaintenance())return Promise.resolve();this.running=this.serialize(async()=>{this.identity();for(const saved of Object.values(this.state.operations)){
   if(this.closed||this.isMaintenance())break;if(terminal(saved)||saved.status==='blocked'||saved.nextAttempt>this.now())continue;const id=saved.id,project=saved.project;let observed;
   try{
    this.commit(s=>{Object.assign(s.operations[id],{status:'syncing',error:'',updatedAt:this.now()});});let op=this.state.operations[id],context=this.state.projects[project].context,row;
    if(!op.contentDone){
     if(!op.recordId){const all=await this.adapter.list(project);const found=all.filter(r=>normalize(r).mutation===id);if(found.length>1)throw failure('发现重复提交记录，请人工核对。',409);row=found[0];if(!row){if(op.createAttempted)throw Error('创建回执尚未核实，未重复创建；请核对后重试。');this.commit(s=>{s.operations[id].createAttempted=true;});let recordId;try{recordId=await this.adapter.create(project,encode(op.value,op.week,id,op.history,op.actor,op.time,context.schema,op.feedbackChanged));}catch(error){if(definitiveFailure(error))this.commit(s=>{s.operations[id].createAttempted=false;});throw error;}this.commit(s=>{s.operations[id].recordId=recordId;});}else this.commit(s=>{s.operations[id].recordId=row.recordId;});}
     op=this.state.operations[id];row=await this.adapter.get(project,op.recordId);observed=row;if(!row)throw failure('正式事项已删除，请刷新核对。',409);
     if(!matches(row,op)){if(normalize(row).version!==op.baseVersion)throw failure('正式表内容已变更，请放弃待同步修改后重新编辑。',409);await this.adapter.update(project,op.recordId,encode(op.value,op.week,id,op.history,op.actor,op.time,context.schema,op.feedbackChanged));row=await this.adapter.get(project,op.recordId);}
     if(!matches(row,op))throw Error('事项字段回读尚未一致。');this.commit(s=>{s.operations[id].contentDone=true;});
    }
    op=this.state.operations[id];if(!row)row=await this.adapter.get(project,op.recordId);
    for(const file of op.value.attachments){const local=this.state.uploads[file.id];if(!local||op.uploaded.includes(file.id))continue;let observed=(row[fields.attachments[0]]||[]).find(f=>fileIdentity(f).id===file.id);if(!observed){if(!local.ready)continue;const location=path.join(this.dir,'uploads',file.id,`${file.id}__${file.name}`);if(!fs.existsSync(location)||createHash('sha256').update(fs.readFileSync(location)).digest('hex')!==local.sha){this.commit(s=>{Object.assign(s.uploads[file.id],{ready:false,error:'待同步附件缺失，请重新选择原文件重传。'});});throw Error('待同步附件缺失或校验不符，请重新上传。');}if(this.state.operations[id].uploadAttempted?.includes(file.id))throw Error('附件回执待核对，未重复上传。');this.commit(s=>{(s.operations[id].uploadAttempted ||= []).push(file.id);});try{await this.adapter.upload(project,op.recordId,location,context.schema.attachments.id);}catch(error){if(definitiveFailure(error))this.commit(s=>{s.operations[id].uploadAttempted=s.operations[id].uploadAttempted.filter(v=>v!==file.id);});throw error;}row=await this.adapter.get(project,op.recordId);observed=(row[fields.attachments[0]]||[]).find(f=>fileIdentity(f).id===file.id);}
     if(!observed||Number(observed.size)!==file.size)throw Error('附件回读不一致。');this.commit(s=>{s.operations[id].uploaded.push(file.id);});
    }
    const remaining=(row[fields.attachments[0]]||[]).filter(f=>op.removeTokens.includes(f.file_token)).map(f=>f.file_token);if(remaining.length){await this.adapter.remove(project,op.recordId,remaining,context.schema.attachments.id);row=await this.adapter.get(project,op.recordId);if((row[fields.attachments[0]]||[]).some(f=>remaining.includes(f.file_token)))throw Error('附件移除回读不一致。');}
    const waiting=op.value.attachments.some(f=>this.state.uploads[f.id]&&!this.state.operations[id].uploaded.includes(f.id));
    this.commit(s=>{const records=s.projects[project].records,index=records.findIndex(r=>r.recordId===row.recordId);if(index<0)records.push(row);else records[index]=row;Object.assign(s.operations[id],{status:waiting?'waiting_upload':'success',error:waiting?'基础内容已同步，附件等待上传。':'',nextAttempt:waiting?this.now()+15000:0,updatedAt:this.now()});});
   }catch(e){this.commit(s=>{if(e.status===409&&observed){const list=s.projects[project].records,index=list.findIndex(row=>row.recordId===observed.recordId);if(index>=0)list[index]=observed;}const op=s.operations[id];Object.assign(op,{status:e.status===409?'blocked':'error',error:e.status?e.message:'暂未同步完成，内容已保留，可重试。',attempts:op.attempts+1,nextAttempt:this.now()+Math.min(300000,5000*2**Math.min(op.attempts,6)),updatedAt:this.now()});});}
  }}).finally(()=>{this.running=null;});return this.running;}
 async download(project,recordId,fileId){this.project(project);const visible=this.snapshot(project).items.find(row=>row.id===recordId);if(!visible?.attachments.some(file=>file.id===fileId))throw failure('附件已移除或不存在。',404);const local=this.state.uploads[fileId],op=local&&this.state.operations[local.operation];if(local?.project===project&&local.ready&&(op?.recordId===recordId||op?.localId===recordId)){const location=path.join(this.dir,'uploads',fileId,`${fileId}__${local.name}`);if(fs.existsSync(location)&&createHash('sha256').update(fs.readFileSync(location)).digest('hex')===local.sha)return {file:location,id:fileId,name:local.name,size:local.size};}const row=this.state.projects[project]?.records.find(r=>r.recordId===recordId),remote=row?.[fields.attachments[0]]?.find(f=>fileIdentity(f).id===fileId);if(!remote)throw failure('附件不存在，请刷新事项。',404);const dir=path.join(this.dir,'downloads');fs.mkdirSync(dir,{recursive:true});const file=path.join(dir,digest(remote.file_token)+'.bin');if(!fs.existsSync(file)){const temp=file+'.'+randomUUID()+'.part';try{await this.adapter.download(project,recordId,remote.file_token,temp);if(fs.statSync(temp).size!==Number(remote.size))throw Error('附件下载校验失败。');fs.renameSync(temp,file);}finally{if(fs.existsSync(temp))fs.unlinkSync(temp);}}if(fs.statSync(file).size!==Number(remote.size))throw Error('附件缓存大小不匹配，请重新下载。');return {file,...fileIdentity(remote)};}
 kick(){if(this.timer&&!this.wakeup&&!this.closed)this.wakeup=setImmediate(()=>{this.wakeup=null;this.flush().catch(()=>{console.error('Priority ledger persistence failed; pending changes retained.');});});}
 start(){this.timer=setInterval(()=>this.kick(),2000);this.timer.unref();for(const p of Object.keys(projects))this.refresh(p).catch(()=>{});this.kick();}
 async close(){this.closed=true;clearInterval(this.timer);clearImmediate(this.wakeup);await Promise.allSettled([this.running,...this.refreshing.values()].filter(Boolean));this.unlock?.();}
}
