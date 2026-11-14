import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {readJson,saveJson,lockWriter,failure} from './storage.mjs';
import {DocumentAdapter,uuid,validateDocument,validateDocumentUpdate,encodeDocument,matchesDocument} from './document-fields.mjs';
import {editableText,editableDocumentLink,projectRecord} from './model.mjs';
import {matchesDocumentProject} from '../src/project-context-model.mjs';
import {DirectoryAdapter} from './directory-adapter.mjs';
import {visibleDirectory,rootDirectory,isPreparationDirectory} from './directory.mjs';
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const canonical=v=>v&&typeof v==='object'?Array.isArray(v)?v.map(canonical):Object.fromEntries(Object.keys(v).sort().map(k=>[k,canonical(v[k])])):v;
export class DocumentService{
 constructor({dir,config,adapter=new DocumentAdapter(config),now=Date.now,isMaintenance=()=>false,appId=()=>process.env.FEISHU_APP_ID||''}){
  Object.assign(this,{dir,config,adapter,now,isMaintenance,appId});this.file=path.join(dir,'document-ledger.json');this.sources=config.sources.filter(s=>['project-document','index','equipment'].includes(s.kind));this.binding=JSON.stringify([config.baseToken,this.sources.filter(s=>!s.regionalOffice).map(s=>s.id)]);this.state=readJson(this.file,{version:1,binding:this.binding,schemas:{},operations:{},uploads:{}});
  if(this.state.version!==1||this.state.binding!==this.binding||!this.state.schemas||!this.state.operations||!this.state.uploads)throw Error('资料台账与当前接表配置不一致，请保留原件核对。');
  this.regionalSourceId=this.sources.find(source=>source.regionalOffice)?.id;
  if(this.regionalSourceId){
   const regional=this.state.regionalOperations||{};
   if(Object.values(regional).some(op=>op.sourceId!==this.regionalSourceId))throw Error('区域资料台账与当前接表配置不一致，请保留原件核对。');
   Object.assign(this.state.operations,regional);
  }
  this.directoryAdapter=config.directoryTable?new DirectoryAdapter(config):null;
 }
 init(){this.unlock=lockWriter(path.join(this.dir,'documents.lock'));}
 commit(change){
  const next=structuredClone(this.state);change(next);
  if(this.regionalSourceId){
   // Older releases must not try to sync operations for a table they cannot route.
   const entries=Object.entries(next.operations);
   const operations=Object.fromEntries(entries.filter(([,op])=>op.sourceId!==this.regionalSourceId));
   const regionalOperations=Object.fromEntries(entries.filter(([,op])=>op.sourceId===this.regionalSourceId));
   saveJson(this.file,{...next,operations,regionalOperations});
  }else saveJson(this.file,next);
  this.state=next;
 }
 get pending(){return Object.values(this.state.operations).some(o=>!['success','conflict'].includes(o.status));}
 source(v){const s=v.scope==='regional'?this.sources.find(s=>s.regionalOffice):v.scope==='project'?this.sources.find(s=>s.kind==='project-document'&&s.projectScope===(v.project==='thailand'?'泰国':'马来')):v.scope==='shared'&&['设备技术规格','运维维保需求规范'].includes(v.nature)?this.sources.find(s=>s.kind==='equipment'):this.sources.find(s=>s.kind==='index'&&!s.regionalOffice);if(!s)throw failure('对应资料表尚未接入。',503);return s;}
 assertUser(user,project){if(!user?.openId)throw failure('请先使用飞书登录。',401);if(!user.project?.knowledgeKey||user.project.knowledgeKey!==project)throw failure('资料范围与登录项目不一致。',409);}
 allowed(op,user){return op.project===user?.project?.knowledgeKey&&(op.editor===user.openId||user.isAdmin===true);}
 publicOperation(o){return {id:o.id,kind:o.value.kind,title:o.value.title||o.value.nature,status:o.status,error:o.error||'',recordId:o.recordId||'',project:o.project,updatedAt:o.updatedAt,uploads:o.value.uploads.map(u=>({id:u.id,name:u.name,size:u.size,ready:!!this.state.uploads[u.id]?.ready}))};}
 operations(user){return Object.values(this.state.operations).filter(o=>this.allowed(o,user)).map(o=>this.publicOperation(o));}
 nodes(user){const cloud=this.state.directoryNodes||[],pending=Object.values(this.state.operations).filter(o=>o.value.kind==='directory'&&!cloud.some(n=>n.id===o.id)&&!o.observed).map(o=>({...o.node,status:o.status}));return visibleDirectory([...cloud,...pending],user?.project?.knowledgeKey);}
 options(user){const project=user?.project?.knowledgeKey,visible=this.sources.filter(s=>s.kind!=='project-document'||s.projectScope===(project==='thailand'?'泰国':'马来'));return {state:this.refreshing?'loading':this.lastError?'error':'ready',error:this.lastError||'',project,directoryNodes:this.nodes(user),targets:visible.map(s=>({id:s.id,kind:s.kind,regionalOffice:!!s.regionalOffice,ready:!!this.state.schemas[s.id],natures:(this.state.schemas[s.id]?.nature.options||[]).map(o=>o.name.trim())})),natures:[...new Set(visible.filter(s=>!s.regionalOffice).flatMap(s=>(this.state.schemas[s.id]?.nature.options||[]).map(o=>o.name.trim())))].sort((a,b)=>a.localeCompare(b,'zh-CN'))};}
 refresh(){if(this.refreshing)return this.refreshing;this.refreshing=(async()=>{const errors=[];for(const s of this.sources){try{const schema=await this.adapter.schema(s);this.commit(next=>{next.schemas[s.id]=schema;next.schemaUpdatedAt=this.now();});}catch(e){errors.push(e.message);}}if(this.directoryAdapter)try{const nodes=await this.directoryAdapter.list();this.commit(n=>{n.directoryNodes=nodes;for(const o of Object.values(n.operations))if(o.value.kind==='directory'&&o.status==='success'&&nodes.some(v=>v.id===o.id))o.observed=true;});}catch(e){errors.push(e.message);}this.lastError=errors[0]||'';})().finally(()=>{this.refreshing=null;});return this.refreshing;}
 accept(raw,user,options){
  if(this.closed||this.isMaintenance())throw failure('系统正在更新，请稍后保存。',503);this.assertUser(user,raw?.project);if(!uuid.test(raw?.clientMutationId||''))throw failure('提交标识无效。');
  const id=raw.clientMutationId,digest=hash(JSON.stringify(canonical(raw))),prior=this.state.operations[id];if(prior){if(prior.hash!==digest||prior.editor!==user.openId)throw failure('该提交标识已用于其他内容。',409);return this.publicOperation(prior);}
  const value=validateDocument(raw,options),nodes=this.nodes(user);let node;
  if(value.kind==='directory'){
   if(!this.directoryAdapter||!this.config.directoryTable)throw failure('目录配置表未连接。',503);
   if(!['project','shared'].includes(value.scope)||!['handover','operations'].includes(value.chapter)||!['major','minor'].includes(value.level))throw failure('请选择篇章和类别层级。');
   const parent=nodes.find(n=>n.id===value.parentId);if(value.level==='minor'&&(!parent||parent.parentId||parent.chapter!==value.chapter||value.scope==='shared'&&parent.project!=='shared'))throw failure('请选择同一篇章、范围内的大类。');
   if(value.level==='major'&&value.parentId)throw failure('大类不能有上级类别。');
   const project=value.scope==='shared'?'shared':value.project,parentId=value.level==='minor'?parent.id:'';
   if(nodes.some(n=>n.chapter===value.chapter&&n.parentId===parentId&&n.name===value.nature&&['shared',project].includes(n.project)))throw failure('该位置已有同名类别，请直接使用。',409);
   node={id,name:value.nature,chapter:value.chapter,parentId,project,stage:parent?.stage||'',mutation:id};
  }else if(value.kind==='document'&&value.directoryId){const selected=nodes.find(n=>n.id===value.directoryId),root=rootDirectory(selected,nodes);if(!selected||!root||selected.chapter!==value.chapter||!['project','shared'].includes(value.scope)||value.scope==='shared'&&selected.project!=='shared')throw failure('资料目录与篇章或范围不一致。');value.stage=root.stage||'';}
  const source=node?{id:this.config.directoryTable}:this.source(value);if(!node&&!this.state.schemas[source.id])throw failure('对应资料表字段未就绪，请重试连接。',503);
  if(value.uploads.some(u=>this.state.uploads[u.id]))throw failure('附件标识已被使用。',409);
  const op={id,hash:digest,value,...node?{node}:{},sourceId:source.id,project:value.project,editor:user.openId,appId:this.appId(),createdAt:this.now(),updatedAt:this.now(),attempts:0,status:'accepted'};
  this.commit(next=>{next.operations[id]=op;for(const u of value.uploads)next.uploads[u.id]={...u,operation:id,ready:false};});this.kick();return this.publicOperation(op);
 }
 acceptUpdate(raw,user,snapshot){
  if(this.closed||this.isMaintenance())throw failure('系统正在更新，请稍后保存。',503);
  this.assertUser(user,raw?.project);
  if(!uuid.test(raw?.clientMutationId||''))throw failure('提交标识无效。');
  const id=raw.clientMutationId,digest=hash(JSON.stringify(canonical(raw))),prior=this.state.operations[id];
  if(prior){if(prior.hash!==digest||prior.appId!==this.appId()||!this.allowed(prior,user))throw failure('该提交标识已用于其他内容。',409);return this.publicOperation(prior);}
  const value=validateDocumentUpdate(raw),[sourceId,recordId]=value.recordKey.split(':');
  const source=this.sources.find(s=>s.id===sourceId&&s.writable&&!s.libraryEntry);
  const document=this.merge(snapshot,user).documents.find(d=>d.id===value.recordKey&&d.sourceId===sourceId&&matchesDocumentProject(d,value.project));
  if(!source||!document?.edit||document.members)throw failure('未找到可编辑的资料。',404);
  if(Object.values(this.state.operations).some(o=>o.value.recordKey===value.recordKey&&!o.observed&&o.status!=='conflict'))throw failure('此资料正在同步，请稍后编辑。',409);
  if(Object.keys(value.changes).some(key=>!Object.hasOwn(document.edit,key)||value.before[key]!==document.edit[key]))throw failure('资料已更新，请刷新后编辑。',409);
  if(!this.state.schemas[sourceId])throw failure('对应资料表字段未就绪，请重试连接。',503);
  if(value.uploads.some(u=>this.state.uploads[u.id]))throw failure('附件标识已被使用。',409);
  const op={id,hash:digest,value:{...value,title:value.changes.title||document.title},sourceId,recordId,project:value.project,editor:user.openId,appId:this.appId(),createdAt:this.now(),updatedAt:this.now(),attempts:0,status:'accepted'};
  this.commit(next=>{next.operations[id]=op;for(const u of value.uploads)next.uploads[u.id]={...u,operation:id,ready:false};});this.kick();return this.publicOperation(op);
 }
 retry(id,user){const o=this.state.operations[id];if(!o)throw failure('未找到同步任务。',404);if(!this.allowed(o,user))throw failure('无权处理此任务。',403);if(this.closed||this.isMaintenance())throw failure('系统正在更新。',503);if(o.status==='conflict')throw failure(o.error,409);if(o.status!=='success')this.commit(n=>Object.assign(n.operations[id],{status:'accepted',error:'',nextAttempt:0}));this.kick();return this.publicOperation(this.state.operations[id]);}
 uploadPlan(id,user){const u=this.state.uploads[id],op=u&&this.state.operations[u.operation];if(!u||!op)throw failure('附件任务不存在。',404);if(!this.allowed(op,user))throw failure('无权上传此附件。',403);if(this.closed||this.isMaintenance())throw failure('系统正在更新。',503);if(op.status==='conflict')throw failure(op.error,409);return u;}
 storeUpload(id,bytes,user){const plan=this.uploadPlan(id,user);if(bytes.length!==plan.size)throw failure('附件大小与提交内容不一致。');const digest=hash(bytes);if(plan.ready){if(plan.sha256!==digest)throw failure('同一附件不能替换为不同内容。',409);return;}
  const file=path.join(this.dir,'document-uploads',id,plan.name);fs.mkdirSync(path.dirname(file),{recursive:true});const tmp=file+'.part';let fd;try{fd=fs.openSync(tmp,'w',0o600);fs.writeFileSync(fd,bytes);fs.fsyncSync(fd);}finally{if(fd!==undefined)fs.closeSync(fd);}fs.renameSync(tmp,file);this.commit(n=>{Object.assign(n.uploads[id],{ready:true,sha256:digest});const op=n.operations[plan.operation];if(op.status!=='success')Object.assign(op,{status:'accepted',nextAttempt:0,error:''});});this.kick();
 }
 document(op,user){const v=op.value,source=this.sources.find(s=>s.id===op.sourceId),id=op.recordId||'pending-'+op.id;return {id:source.id+':'+id,sourceId:source.id,sourceName:source.name||source.id,sourceLink:op.recordId?`${this.config.baseUrl}?table=${source.id}&record=${id}`:'',title:v.title,nature:v.nature,category:source.category,subcategory:v.nature,note:v.note,summary:v.note,sections:v.note?[['备注',v.note]]:[],specialty:v.specialty,tags:[v.nature],date:new Date(op.createdAt+8*3600000).toISOString().slice(0,10),links:v.url?[{label:'打开资料',url:v.url}]:op.recordId?[{label:'查看附件',url:`${this.config.baseUrl}?table=${source.id}&record=${id}`}]:[],libraryScope:v.scope,projectScope:v.scope==='project'?(op.project==='thailand'?'泰国':'马来'):'',directoryId:v.directoryId,lifecycle:{chapter:v.chapter,stage:v.stage,directoryId:v.directoryId},sync:{...this.publicOperation(op),canRetry:!!user&&this.allowed(op,user)}};}
 merge(snapshot,user){
  const documents=(snapshot.documents||[]).map(d=>({...d})),observed=[],updates=new Map();
  for(const op of Object.values(this.state.operations)){
   if(op.value.kind==='update'){updates.set(op.value.recordKey,op);continue;}
   if(op.value.kind!=='document')continue;
   if(!this.sources.some(source=>source.id===op.sourceId))continue;
   const local=this.document(op,user),remote=documents.find(d=>d.id===local.id);
   if(remote){remote.sync=local.sync;if(op.status==='success'&&!op.observed)observed.push(op.id);}
   else if(!op.observed||op.status!=='success')documents.push(local);
  }
  for(const document of documents){
   const op=updates.get(document.id);
   if(!document.edit||!op||op.observed||op.status==='conflict')continue;
   const {changes,uploads}=op.value;
   if(op.status==='success'&&Object.entries(changes).every(([key,value])=>document.edit[key]===value)&&(!uploads.length||document.attachmentCount>=op.verifiedAttachmentCount)){observed.push(op.id);continue;}
   document.sync={...this.publicOperation(op),canRetry:!!user&&this.allowed(op,user)};
   if(op.status==='error')continue;
   document.edit={...document.edit,...changes};
   for(const key of ['title','note','specialty'])if(Object.hasOwn(changes,key))document[key]=changes[key];
   if(Object.hasOwn(changes,'note'))document.sections=[...(document.sections||[]).filter(([label])=>label!=='备注'),...changes.note?[['备注',changes.note]]:[]];
   if(Object.hasOwn(changes,'url'))document.links=[...changes.url?[{label:'打开资料',url:changes.url}]:[],...document.links.filter(link=>link.label!=='打开资料')];
   if(op.status==='success'&&uploads.length&&!document.links.some(link=>link.url===document.sourceLink))document.links.push({label:'查看附件',url:document.sourceLink});
  }
  if(observed.length)this.commit(n=>{for(const id of observed)n.operations[id].observed=true;});
  return {...snapshot,documents,directoryNodes:this.nodes(user)};
 }
 async syncUploads(op,source,schema,recordId,row){
  for(const upload of op.value.uploads){const u=this.state.uploads[upload.id];if(!u.ready)throw Error('资料已保存，附件待上传。');const present=r=>(r?.[schema.attachments.name]||[]).some(f=>f.name===u.name&&Number(f.size)===u.size);
   if(!present(row)){if(u.attempted)throw Error('附件回执尚未确认，正在核对；未重复上传。');const file=path.join(this.dir,'document-uploads',u.id,u.name);if(hash(fs.readFileSync(file))!==u.sha256)throw Error('本地附件校验失败，已停止同步。');this.commit(n=>{n.uploads[u.id].attempted=true;});await this.adapter.upload(source,recordId,schema,file);row=await this.adapter.get(source,recordId);if(!present(row))throw Error('附件回读尚未一致。');}
  }
  return row;
 }
 async syncUpdate(op,source){
  if(!source?.writable)throw failure('对应资料表已停用编辑，请刷新后核对。',409);
  const schema=await this.adapter.schema(source),{recordId}=op,{before,changes}=op.value;
  let row=await this.adapter.get(source,recordId);
  const cells=Object.fromEntries(Object.entries(source.fields).map(([key,field])=>[key,row?.[field.name]]));
  const document=row&&projectRecord(source,{id:recordId,cells},this.config.baseUrl);
  if(row?.recordId!==recordId||!document||!matchesDocumentProject(document,op.project))throw failure('原资料已移动或移除，请刷新后核对。',409);
  const entries=Object.entries(changes),read=(r,key)=>key==='url'?editableDocumentLink(r?.[schema.url.name])?.url:editableText(r?.[schema[key].name]);
  const beforeUrl=editableDocumentLink(before.url)?.url??before.url;
  if(entries.some(([key,value])=>read(row,key)!==(key==='url'?beforeUrl:before[key])&&read(row,key)!==value))throw failure('飞书原资料已变更，请刷新后重新编辑。',409);
  const fields=Object.fromEntries(entries.filter(([key,value])=>read(row,key)!==value).map(([key,value])=>{
   const label=key==='url'?editableDocumentLink(row[schema.url.name])?.label:undefined;
   return [schema[key].id,value&&label!==undefined?`[${label}](${value})`:value||null];
  }));
  if(Object.keys(fields).length){await this.adapter.update(source,recordId,fields);row=await this.adapter.get(source,recordId);}
  if(row?.recordId!==recordId||entries.some(([key,value])=>read(row,key)!==value))throw Error('资料回读尚未一致，任务已保留。');
  row=await this.syncUploads(op,source,schema,recordId,row);
  this.commit(n=>Object.assign(n.operations[op.id],{status:'success',verifiedAttachmentCount:(row[schema.attachments.name]||[]).length,error:'',updatedAt:this.now(),nextAttempt:0}));
 }
 flush(){if(this.running)return this.running;if(this.closed||this.isMaintenance())return Promise.resolve();this.running=(async()=>{for(const saved of Object.values(this.state.operations)){
  if(this.closed||this.isMaintenance())break;if(['success','conflict'].includes(saved.status)||saved.nextAttempt>this.now())continue;const id=saved.id,source=this.sources.find(s=>s.id===saved.sourceId);
  try{
   if(saved.appId!==this.appId())throw Error('提交所属应用已变化，已保留任务，请管理员核对。');
   this.commit(n=>Object.assign(n.operations[id],{status:'syncing',error:'',attempts:saved.attempts+1,updatedAt:this.now()}));
   if(saved.value.kind==='update'){await this.syncUpdate(saved,source);continue;}
   if(saved.value.kind==='directory'){
    const found=await this.directoryAdapter.find(id);
    if(saved.node.parentId&&!await this.directoryAdapter.find(saved.node.parentId))throw Error('上级目录尚未同步，任务已保留。');
    if(!found&&(await this.directoryAdapter.list()).some(n=>n.id!==id&&n.chapter===saved.node.chapter&&n.parentId===saved.node.parentId&&n.name===saved.node.name&&['shared',saved.node.project].includes(n.project)))throw Error('云端已有同名类别，请使用现有类别。');
    if(!found){if(saved.createAttempted)throw Error('目录创建回执待确认，未重复创建。');this.commit(n=>{n.operations[id].createAttempted=true;});await this.directoryAdapter.create(saved.node);}
    const readback=await this.directoryAdapter.find(id);if(!readback||Object.keys(saved.node).some(k=>String(readback[k]||'')!==String(saved.node[k]||'')))throw Error('目录回读尚未一致，任务已保留。');
    this.commit(n=>{n.directoryNodes=[...(n.directoryNodes||[]).filter(v=>v.id!==id),readback];Object.assign(n.operations[id],{status:'success',error:'',observed:true,updatedAt:this.now(),nextAttempt:0});});continue;
   }
   if(saved.value.directoryId&&!isPreparationDirectory(saved.value.directoryId)&&!await this.directoryAdapter?.find(saved.value.directoryId))throw Error('资料目录尚未同步，任务已保留。');
   const schema=await this.adapter.ensureCategory(source,saved.value.nature);this.commit(n=>{n.schemas[source.id]=schema;});
   if(this.closed||this.isMaintenance())throw Error('系统正在更新，任务已保留。');
   let op=this.state.operations[id];if(op.value.kind==='document'){
    let row=await this.adapter.find(source,schema,id),recordId=row?.recordId||op.recordId;
    if(!recordId){if(op.createAttempted)throw Error('上次回执不明确，正在核对正式表；未重复创建。');this.commit(n=>{n.operations[id].createAttempted=true;});recordId=await this.adapter.create(source,encodeDocument(op.value,schema,id,op.createdAt));this.commit(n=>{n.operations[id].recordId=recordId;});}
    row=await this.adapter.get(source,recordId);if(!matchesDocument(row,op.value,schema,id,op.createdAt))throw Error('资料回读尚未一致，任务已保留。');
    await this.syncUploads(op,source,schema,recordId,row);
   }
   this.commit(n=>Object.assign(n.operations[id],{status:'success',error:'',updatedAt:this.now(),nextAttempt:0}));
  }catch(e){this.commit(n=>Object.assign(n.operations[id],{status:saved.value.kind==='update'&&e.status===409?'conflict':'error',error:e.message||'同步失败，任务已保留。',updatedAt:this.now(),nextAttempt:this.now()+Math.min(300000,5000*2**Math.min(n.operations[id].attempts,6))}));}
 }})().finally(()=>{this.running=null;});return this.running;}
 kick(){if(!this.closed)setImmediate(()=>this.flush().catch(()=>{this.lastError='同步台账写入失败，请检查服务器存储。';}));}
 start(){this.timer=setInterval(()=>this.kick(),3000);this.timer.unref();this.kick();this.refresh().catch(()=>{this.lastError='资料字段读取失败。';});}
 async close(){this.closed=true;clearInterval(this.timer);await Promise.allSettled([this.running,this.refreshing].filter(Boolean));this.unlock?.();}
}
