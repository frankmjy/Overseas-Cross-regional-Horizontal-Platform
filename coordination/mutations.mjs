import {createHash} from 'node:crypto';
import {readJson,saveJson,lockWriter,failure} from '../knowledge/storage.mjs';
import {materialFields,projectMaterial} from './model.mjs';

export const calculatedFields=new Set(['referenceAmount','totalReferenceAmount','actualAmount','totalActualAmount']);
const uuid=/^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;
const hash=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
const same=(a,b)=>JSON.stringify(Array.isArray(a)?[...a].sort():a??'')===JSON.stringify(Array.isArray(b)?[...b].sort():b??'');
export function materialVersion(row){return hash(materialFields.filter(f=>!calculatedFields.has(f.key)).map(f=>[f.key,Array.isArray(row[f.key])?[...row[f.key]].sort():row[f.key]??null]));}
export function validateMaterial(values,schema){
 if(!values||Array.isArray(values)||typeof values!=='object'||!Object.keys(values).length)throw failure('请填写修改内容。');
 const result={};for(const [key,value]of Object.entries(values)){
  const field=schema.find(f=>f.key===key);if(!field)throw failure('物资字段无效。');if(!field.editable||calculatedFields.has(key))throw failure('计算字段只读。');
  if(field.type==='number'){if(value!==null&&(typeof value!=='number'||!Number.isFinite(value)||value<0||value>1e12))throw failure(field.label+'数字无效。');if(['sequence','buildingCount'].includes(key)&&value!==null&&!Number.isInteger(value))throw failure(field.label+'须为整数。');result[key]=value;}
  else if(['select','multi'].includes(field.type)){const list=field.type==='multi'?value:value===''?[]:[value];if(!Array.isArray(list)||list.length>100||list.some(v=>typeof v!=='string'||!field.options.includes(v)))throw failure(field.label+'选项无效，请刷新。');result[key]=field.type==='multi'?[...new Set(list)]:list[0]||'';}
  else {if(typeof value!=='string'||value.length>5000)throw failure(field.label+'内容无效。');result[key]=value.trim();}
 }if(Object.hasOwn(result,'name')&&!result.name)throw failure('请填写物资名称。');return result;
}

export class CoordinationMutations{
 constructor({file,adapter,getSchema,getRows,publish,binding='test',isMaintenance=()=>false,serial=fn=>fn()}){Object.assign(this,{file,adapter,getSchema,getRows,publish,isMaintenance,serial,binding});this.state={version:1,binding,operations:{},drafts:{}};}
 async init(){if(this.file)this.state=readJson(this.file,this.state);if(this.state.version!==1||this.state.binding!==this.binding||!this.state.operations||!this.state.drafts)throw Error('物资同步台账无效，请保留原文件。');}
 commit(change){if(!this.file)throw failure('物资写入存储尚未配置。',503);const next=structuredClone(this.state);change(next);saveJson(this.file,next);this.state=next;}
 snapshot(actor){return Object.values(this.state.operations).filter(o=>!actor||o.actor===actor.openId).map(({id,recordId,status,error})=>({id,recordId,status,error}));}
 visibleRecords(records){const visible=new Map(records.map(r=>[r.id,r]));for(const op of Object.values(this.state.operations)){if(['success','discarded'].includes(op.status))continue;const draft=this.state.drafts[op.id]||visible.get(op.recordId);if(!draft)continue;const id=op.recordId||draft.id;visible.delete('local:'+op.id);visible.set(id,{...draft,...op.values,id,syncStatus:op.status,syncError:op.error});}return [...visible.values()];}
 reconcile(records){const changes=[];for(const op of Object.values(this.state.operations)){if(op.recordId||['success','discarded'].includes(op.status))continue;const matches=records.filter(r=>r.importKey==='web:'+op.id);if(matches.length>1)throw Error('物资导入键存在重复记录，请核对。');if(matches.length)changes.push([op.id,matches[0].id]);}if(changes.length)this.commit(s=>{for(const [id,recordId]of changes)s.operations[id].recordId=recordId;});}
 get pending(){return Object.values(this.state.operations).some(o=>!['success','discarded'].includes(o.status));}
 accept(raw,actor){
  if(!actor?.openId)throw failure('请先使用飞书登录。',401);if(this.closed||this.isMaintenance())throw failure('系统正在更新，请稍后提交。',503);
  if(!uuid.test(raw?.clientMutationId||''))throw failure('提交标识无效。');const id=raw.clientMutationId,digest=hash(raw),prior=this.state.operations[id];if(prior){if(prior.hash!==digest||prior.actor!==actor.openId)throw failure('提交标识已用于其他内容。',409);return prior;}
  const schema=this.getSchema();if(!schema?.length)throw failure('字段尚未读取，请同步后重试。',503);const values=validateMaterial(raw.values,schema),current=raw.id?this.getRows().find(r=>r.id===raw.id):null;
  if(raw.id&&!current)throw failure('物资不存在，请刷新。',404);if(current&&materialVersion(current)!==raw.version)throw failure('记录已更新，请重新编辑。',409);if(!current&&!values.name)throw failure('请填写物资名称。');
  if(current&&Object.values(this.state.operations).some(o=>o.recordId===raw.id&&!['success','discarded'].includes(o.status)))throw failure('该物资还有待同步修改。',409);
  const op={id,hash:digest,actor:actor.openId,recordId:raw.id||'',version:raw.version||'',values,status:'accepted',error:'',attempted:false,at:Date.now()};
  this.commit(s=>{s.operations[id]=op;s.drafts[id]=projectMaterial({id:current?.id||'local:'+id,cells:{...current,...values}});});this.kick();return op;
 }
 retry(id,actor){const op=this.state.operations[id];if(!op||op.actor!==actor?.openId)throw failure('同步任务不存在。',404);if(this.isMaintenance()||this.closed)throw failure('系统正在更新。',503);if(op.status==='blocked'){this.commit(s=>{s.operations[id].status='discarded';delete s.drafts[id];});return;}if(['error','uncertain'].includes(op.status)){this.commit(s=>{s.operations[id].status='accepted';s.operations[id].error='';});this.kick();}}
 flush(){if(this.running)return this.running;this.running=this.serial(async()=>{
  for(const original of Object.values(this.state.operations)){
   if(!['accepted','syncing'].includes(original.status)||this.closed||this.isMaintenance())continue;const id=original.id;let op=this.state.operations[id];
   try{
    const schema=await this.adapter.schema();validateMaterial(op.values,schema);let rows=await this.adapter.list({withKeys:true}),record=op.recordId?rows.find(r=>r.id===op.recordId):rows.find(r=>r.importKey==='web:'+id);
    if(!op.recordId&&rows.filter(r=>r.importKey==='web:'+id).length>1)throw failure('新增标识出现重复记录，请核对。',409);
    if(!op.recordId&&record){this.commit(s=>{s.operations[id].recordId=record.id;});op=this.state.operations[id];}
    const matches=r=>r&&Object.entries(op.values).every(([k,v])=>same(r[k],v));
    if(!record&&!op.recordId){
     if(op.attempted)throw failure('上次新增结果未确认，已停止重复创建。',409);
     this.commit(s=>{s.operations[id].status='syncing';s.operations[id].attempted=true;});
     const recordId=await this.adapter.create(op.values,'web:'+id);this.commit(s=>{s.operations[id].recordId=recordId;});op=this.state.operations[id];
    }else if(!record)throw failure('飞书记录已移除，请刷新。',409);
    else if(!matches(record)){
     if(materialVersion(record)!==op.version)throw failure('飞书记录已被修改，请重新编辑。',409);
     this.commit(s=>{s.operations[id].status='syncing';});await this.adapter.update(op.recordId,op.values);
    }
    rows=await this.adapter.list({withKeys:true});record=rows.find(r=>r.id===this.state.operations[id].recordId);if(!matches(record))throw failure('回读尚未一致，请重试同步。',503);
    await this.publish(rows.map(r=>projectMaterial({id:r.id,cells:r})));this.commit(s=>{s.operations[id].status='success';s.operations[id].error='';delete s.drafts[id];});
   }catch(e){const current=this.state.operations[id];this.commit(s=>{s.operations[id].status=!current.recordId&&current.attempted?'uncertain':e.status===409?'blocked':'error';s.operations[id].error=e.status?e.message:'飞书同步未完成，请重试核对。';});}
  }
 }).finally(()=>{this.running=null;if(this.started&&!this.closed&&!this.isMaintenance()&&Object.values(this.state.operations).some(o=>['accepted','syncing'].includes(o.status)))this.kick();});return this.running;}
 kick(){if(this.started&&!this.wakeup&&!this.closed)this.wakeup=setImmediate(()=>{this.wakeup=null;this.flush().catch(()=>{this.error='同步台账保存失败，请检查存储。';});});}
 start(){if(this.started)return;this.unlock=lockWriter(this.file+'.lock');this.started=true;this.timer=setInterval(()=>this.kick(),15000);this.timer.unref();this.kick();}
 async close(){this.closed=true;clearInterval(this.timer);clearImmediate(this.wakeup);await this.running;this.unlock?.();}
}
