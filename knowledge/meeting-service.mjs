import path from 'node:path';
import {createHash} from 'node:crypto';
import {MeetingAdapter,validateMeeting,encodeMeeting,matchesMeeting} from './meeting-fields.mjs';
import {readJson,saveJson,lockWriter,failure} from './storage.mjs';
import {projectRecord} from './model.mjs';

const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const digest=value=>createHash('sha256').update(JSON.stringify(Object.fromEntries(Object.entries(value).sort(([a],[b])=>a.localeCompare(b))))).digest('hex');
export class MeetingService{
 constructor({dir,config,adapter=new MeetingAdapter(config),now=Date.now,isMaintenance=()=>false}){
  this.dir=dir;this.file=path.join(dir,'meeting-ledger.json');this.config=config;this.adapter=adapter;this.now=now;this.isMaintenance=isMaintenance;this.sources=config.sources.filter(s=>s.kind==='meeting');
  this.binding=JSON.stringify([config.baseToken,this.sources.map(s=>[s.project,s.id])]);this.state=readJson(this.file,{version:1,binding:this.binding,schemas:{},people:[],operations:{}});
  if(this.state.version!==1||this.state.binding!==this.binding||!this.state.schemas||!Array.isArray(this.state.people)||!this.state.operations)throw Error('会议台账与当前接表配置不一致，请保留原台账核对。');
 }
 init(){this.unlock=lockWriter(path.join(this.dir,'meetings.lock'));}
 commit(change){const next=structuredClone(this.state);change(next);saveJson(this.file,next);this.state=next;}
 publicOperation(op){return {id:op.id,project:op.project,status:op.status,error:op.error||'',recordId:op.recordId||'',updatedAt:op.updatedAt};}
 get pending(){return Object.values(this.state.operations).some(o=>['accepted','syncing'].includes(o.status));}
 options(user){return {state:this.refreshing?'loading':this.lastError?'error':'ready',error:this.lastError||'',projects:this.sources.map(s=>({id:s.project,name:/（([^）]+)）/.exec(s.name)?.[1]||s.name,ready:!!this.state.schemas[s.project],status:this.state.schemas[s.project]?.status.options||[],priority:this.state.schemas[s.project]?.priority.options||[]})),people:this.people(user)};}
 people(user){const values=new Map(this.state.people.map(p=>[p.id,p]));if(/^ou_\w+$/.test(user?.openId||'')&&user?.name)values.set(user.openId,{id:user.openId,name:user.name});return [...values.values()].sort((a,b)=>a.name.localeCompare(b.name,'zh-CN'));}
 refresh(){if(this.refreshing)return this.refreshing;this.refreshing=(async()=>{const errors=[];for(const source of this.sources){try{const schema=await this.adapter.schema(source),people=await this.adapter.people(source,schema);this.commit(next=>{next.schemas[source.project]=schema;const merged=new Map([...next.people,...people].map(p=>[p.id,p]));next.people=[...merged.values()];next.schemaUpdatedAt=this.now();});}catch{errors.push(source.name);}}this.lastError=errors.length?'部分会议字段读取失败，可使用已读取的范围，或重试连接。':'';return this.options();})().finally(()=>{this.refreshing=null;});return this.refreshing;}
 accept(raw,user){
  if(this.closed||this.isMaintenance())throw failure('系统正在更新，请稍后保存。',503);
  if(!user?.openId||!user?.name)throw failure('请先使用飞书登录。',401);
  if(!uuid.test(raw?.clientMutationId||''))throw failure('提交标识无效，请重新打开表单。');
  const id=raw.clientMutationId,hash=digest(raw),prior=this.state.operations[id];
  if(prior){if(prior.hash!==hash||prior.editor!==user.openId)throw failure('该提交标识已用于其他内容，请核对后重试。',409);return this.publicOperation(prior);}
  const source=this.sources.find(s=>s.project===raw.project),schema=this.state.schemas[raw.project];if(!source||!schema)throw failure('会议字段尚未就绪，请重试连接。',503);
  const people=this.people(user),value=validateMeeting(raw,schema,people),op={id,hash,project:source.project,value,editor:user.openId,people:people.filter(p=>value.participants.includes(p.id)),status:'accepted',attempts:0,updatedAt:this.now()};
  this.commit(next=>{next.operations[id]=op;});this.kick();return this.publicOperation(op);
 }
 retry(id){if(!this.state.operations[id])throw failure('未找到该同步任务。',404);if(this.isMaintenance())throw failure('系统正在更新，请稍后重试。',503);this.commit(next=>{const op=next.operations[id];if(op.status!=='success'){op.status='accepted';op.nextAttempt=0;op.error='';}});this.kick();return this.publicOperation(this.state.operations[id]);}
 merge(snapshot){
  const meetings=snapshot.meetings.map(m=>({...m})),observed=[];for(const op of Object.values(this.state.operations)){
   const source=this.sources.find(s=>s.project===op.project),id=op.recordId||'pending-'+op.id,remote=meetings.find(m=>m.id===source.id+':'+id);
   if(remote){if(op.status!=='success')remote.sync=this.publicOperation(op);else if(!op.observed)observed.push(op.id);continue;}
   if(op.status==='success'&&op.observed)continue;
   const v=op.value,cells={'Meeting Title':v.title,'Meeting Date':v.date+' '+v.time,'Meeting Time':v.time,Status:v.status,Summary:v.summary,'Action Items':v.actions,'Minutes Link':v.minutes,'Recording Link':v.recording,Participants:op.people};
   const record=projectRecord(source,{id,cells},this.config.baseUrl);record.sync=this.publicOperation(op);if(!op.recordId)record.sourceLink='';meetings.push(record);
  }
  if(observed.length)this.commit(next=>{for(const id of observed)next.operations[id].observed=true;});
  return {...snapshot,meetings,sources:snapshot.sources?.map(s=>s.kind==='meeting'?{...s,count:meetings.filter(m=>m.sourceId===s.id).length}:s)};
 }
 flush(){if(this.running)return this.running;if(this.closed||this.isMaintenance())return Promise.resolve();this.running=(async()=>{
  for(const saved of Object.values(this.state.operations)){
   if(this.closed||this.isMaintenance())break;if(saved.status==='success'||saved.nextAttempt>this.now())continue;const id=saved.id,source=this.sources.find(s=>s.project===saved.project);
   try{
    this.commit(next=>{Object.assign(next.operations[id],{status:'syncing',error:'',updatedAt:this.now(),attempts:saved.attempts+1});});
    let schema=await this.adapter.schema(source);schema=await this.adapter.ensureKey(source,schema);
    if(this.isMaintenance()||this.closed)throw Error('系统正在更新，同步任务已保留。');
    const op=this.state.operations[id];validateMeeting(op.value,schema,op.people);let row=await this.adapter.find(source,schema,id),recordId=row?.recordId||op.recordId;
    if(!recordId){
     if(op.createAttempted)throw Error('上次创建回执不明确，正在核对正式表；未重复创建。');
     this.commit(next=>{next.operations[id].createAttempted=true;});
     recordId=await this.adapter.create(source,encodeMeeting(op.value,schema,id));
     this.commit(next=>{next.operations[id].recordId=recordId;});
    }
    row=await this.adapter.get(source,recordId);
    if(!matchesMeeting(row,op.value,schema,id))throw Error('会议回读尚未一致，请核对正式表后重试。');
    this.commit(next=>{Object.assign(next.operations[id],{status:'success',recordId,error:'',updatedAt:this.now(),nextAttempt:0});});
   }catch(e){this.commit(next=>{const op=next.operations[id];Object.assign(op,{status:'error',error:e.message||'会议同步失败，任务已保留。',updatedAt:this.now(),nextAttempt:this.now()+Math.min(300000,5000*2**Math.min(op.attempts,6))});});}
  }
 })().finally(()=>{this.running=null;});return this.running;}
 kick(){if(!this.closed)setImmediate(()=>this.flush().catch(()=>{this.storageError=true;}));}
 start(){this.timer=setInterval(()=>this.kick(),3000);this.timer.unref();this.kick();this.refresh().catch(()=>{this.lastError='会议字段暂未更新，请重试连接。';});}
 async close(){this.closed=true;clearInterval(this.timer);await Promise.allSettled([this.running,this.refreshing].filter(Boolean));this.unlock?.();}
}
