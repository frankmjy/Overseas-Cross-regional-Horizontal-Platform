import {inheritTaskDeletion} from './status.mjs';
import {inheritPriorities} from './priority.mjs';
import {rollupTaskDates} from './summary.mjs';
import {nextChildCode} from './numbering.mjs';
import {orderedTaskRecords,nextInsertOrder,orderScope} from './ordering.mjs';
import path from 'node:path';
import { readJson,saveJson,lockWriter } from '../../knowledge/storage.mjs';
import { binding,fields,normalizeTask,knownUsers,validateTaskValues,encodeValues,executionStatus,chinaDay,digest,failure,uuid,text } from './model.mjs';
import {HandoverDeliverables} from './deliverables.mjs';
import {appendFeedback} from '../model.mjs';

const active = op => !['success','discarded'].includes(op.status);
const same = (a,b) => JSON.stringify(a??'')===JSON.stringify(b??'');
const canonical = v => Array.isArray(v)?v.map(canonical):v&&typeof v==='object'?Object.fromEntries(Object.keys(v).sort().map(k=>[k,canonical(v[k])])):v;
export class HandoverService {
  constructor({dir,adapter,now=Date.now,appId=()=>process.env.FEISHU_APP_ID||'',isMaintenance=()=>false,getUsers=()=>[],documents}={}) {
    Object.assign(this,{dir,adapter,now,appId,isMaintenance,getUsers,documents});this.file=path.join(dir,'ledger.json');
    this.binding=JSON.stringify(binding);this.state=readJson(this.file,{version:1,binding:this.binding,records:[],schema:null,updatedAt:0,operations:{},uploads:{}});
    if(this.state.version!==1||this.state.binding!==this.binding||!Array.isArray(this.state.records)||!this.state.operations||!this.state.uploads)throw Error('接维台账无效，请保留原件核对。');
    this.external=Promise.resolve();this.deliverables=new HandoverDeliverables(this);
  }
  init(){this.unlock=lockWriter(path.join(this.dir,'handover.lock'));}
  commit(change){const next=structuredClone(this.state);change(next);next.revision=(this.state.revision||0)+1;try{saveJson(this.file,next);}catch{throw failure('接维任务未保存，请检查服务器存储后重试。',503);}this.state=next;}
  serialize(work){const run=this.external.then(work);this.external=run.catch(()=>{});return run;}
  ensureBinding(){if(this.appId()!==binding.appId)throw failure('接维计划绑定定盘星应用，请先核对应用配置。',409);}
  assertActor(actor){if(!actor?.openId||!actor.name)throw failure('请先使用飞书登录。',401);if(actor.project?.id!==binding.project||actor.project.knowledgeKey!==binding.knowledgeProject)throw failure('当前项目尚未接入该接维任务表。',409);this.ensureBinding();}
  allowed(op,actor){return op.actor===actor.openId||actor.isAdmin===true;}
  get pending(){return Object.values(this.state.operations).some(active)||!!this.state.orderScopes?.length||!!this.numberingRunning;}
  orderingBusy(row,records=[]){return !!this.numberingInFlight&&(this.numberingInFlight.has(orderScope(row))||row.parentId&&this.numberingInFlight.has(orderScope(records.find(r=>r.id===row.parentId)||{})));}
  publicOperation(op){return{id:op.id,kind:op.kind,recordId:op.recordId,status:op.status,error:op.error||'',updatedAt:op.updatedAt,step:op.step||'',archiveUrl:op.archiveRecord?.url||'',uploads:(op.uploads||[]).map(u=>({id:u.id,name:u.name,size:u.size,ready:!!this.state.uploads[u.id]?.ready}))};}
  rawRecords(){
    const rows=structuredClone(this.state.records);if(!this.state.schema)return rows;
    const named=Object.fromEntries(Object.entries(this.state.schema).map(([k,v])=>[k,{...v,id:v.name}]));
    for(const op of Object.values(this.state.operations)) {
      if(!active(op)||op.status==='blocked'||op.kind==='deliverable')continue;
      let row=rows.find(r=>r.recordId===op.recordId);
      if(!row&&op.kind==='create'){row={recordId:op.recordId,[fields.code.name]:op.code,[fields.mutation.name]:op.id};rows.push(row);}
      if(row)Object.assign(row,encodeValues(op.values,named,{records:rows.map(r=>normalizeTask(r,this.now())),order:op.order}));
    }return rows;
  }
  snapshot(actor){this.assertActor(actor);const raw=this.rawRecords();return{revision:this.state.revision||0,ready:!!this.state.schema,refreshing:!!this.refreshing,error:this.lastError||'',updatedAt:this.state.updatedAt,records:rollupTaskDates(inheritPriorities(orderedTaskRecords(inheritTaskDeletion(raw.map(r=>normalizeTask(r,this.now()))),{enabled:!!(this.state.schema?.order&&this.state.schema?.displayCode)})),{now:this.now()}),schema:this.state.schema,users:knownUsers(raw,actor,this.getUsers()),operations:Object.values(this.state.operations).filter(o=>this.allowed(o,actor)&&o.status!=='discarded').map(o=>this.publicOperation(o))};}
  async refresh(){
    this.ensureBinding();if(this.refreshing)return this.refreshing;
    this.refreshing=this.serialize(async()=>{const schema=await this.adapter.schema(),rows=await this.adapter.list();if(new Set(rows.map(r=>r.recordId)).size!==rows.length)throw Error('任务记录身份重复。');this.ensureBinding();this.commit(n=>{n.records=rows;n.schema=schema;n.updatedAt=this.now();});this.lastError='';});
    try{await this.refreshing;}catch(e){this.lastError=e.status?e.message:'接维资料暂未更新，已保存的内容仍保留。';throw failure(this.lastError,e.status||503);}finally{this.refreshing=null;}
  }
  warm(){if(!this.closed&&!this.isMaintenance()&&!this.refreshing&&(!this.state.updatedAt||this.now()-this.state.updatedAt>300000))this.refresh().catch(()=>{});}
  accept(raw,actor){
    this.assertActor(actor);if(actor.permissions&&!actor.permissions.projects?.edit)throw failure('无权编辑接维计划。',403);if(this.closed||this.isMaintenance())throw failure('系统正在更新，请稍后保存。',503);
    if(raw?.kind==='deliverable')return this.deliverables.accept(raw,actor);
    if(!uuid.test(raw?.clientMutationId||'')||!['create','update','delete','restore'].includes(raw?.kind))throw failure('提交标识或操作类型无效。');
    const hash=digest(canonical(raw)),id=raw.clientMutationId,prior=this.state.operations[id];
    if(prior){if(prior.hash!==hash||prior.actor!==actor.openId)throw failure('提交标识已用于其他内容。',409);return{operation:this.publicOperation(prior),revision:this.state.revision};}
    if(!this.state.schema)throw failure('任务字段尚未就绪，请稍后重试。',503);
    const snapshot=this.snapshot(actor),records=snapshot.records,current=raw.kind==='create'?null:records.find(r=>r.id===raw.recordId);
    if(raw.kind!=='create'&&!current)throw failure('任务不存在，请刷新。',404);
    if(current&&current.version!==raw.version)throw failure('任务已更新，请重新打开后修改。',409);
    if(current&&Object.values(this.state.operations).some(o=>o.recordId===current.id&&active(o)))throw failure('该任务还有待同步修改，请先处理同步结果。',409);
    if(current?.deleted&&raw.kind!=='restore')throw failure('任务已删除，请先恢复。',409);
    if(current&&this.orderingBusy(current,records))throw failure('当前分组正在同步编号，请稍后操作。',409);
    let values;
    if(['delete','restore'].includes(raw.kind)) {
      if(raw.kind==='restore'&&current.parentId&&records.find(r=>r.id===current.parentId)?.deleted)throw failure('请先恢复所属任务组。',409);
      if(raw.kind==='restore'&&!current.deleted)throw failure('条目未删除，请刷新。',409);
      values={deleted:raw.kind==='delete'};
    }else {
      values=validateTaskValues(raw.values,{schema:this.state.schema,users:snapshot.users,records,current,now:this.now()});
      if(Object.hasOwn(values,'feedback')){if(values.feedback.trim())values.feedback=appendFeedback(current?.values.feedback||'',values.feedback,actor,this.now());else if(current)throw failure('请填写本次进展，历史记录不能直接清空。');}
      if(current&&records.some(r=>!r.deleted&&r.parentId===current.id)&&((Object.hasOwn(values,'stage')&&values.stage!==current.stage)||(values.level&&values.level!=='任务组')))throw failure('任务组仍有执行项，不能直接变更阶段或层级。',409);
      if(raw.kind==='create')values={notes:'',goal:'',timing:'',teams:'',overseas:'',requirements:'',feedback:'',links:'',owner:[],participants:[],priority:'',start:'',due:'',actualCompletion:'',parentId:'',milestone:false,deleted:false,...values};
    }
    const parent=raw.kind==='create'&&values.level==='执行项'?records.find(r=>r.id===values.parentId):null;
    const next={...(current||{}),...values};if(this.orderingBusy(next,records))throw failure('当前分组正在同步编号，请稍后操作。',409);
    let order;if(raw.kind==='create'&&this.state.schema.order&&this.state.schema.displayCode){
      if(raw.insertAfter){const at=records.find(r=>r.id===raw.insertAfter.id&&!r.deleted&&!r.id.startsWith('local:'));if(!at||at.version!==raw.insertAfter.version||orderScope(at)!==orderScope(values))throw failure('插入位置已变化，请刷新后重试。',409);}
      order=nextInsertOrder(records,values,raw.insertAfter?.id||'');
    }else if(raw.insertAfter)throw failure('排序字段尚未就绪，暂不能按位置插入。',503);
    if(parent&&(parent.id.startsWith('local:')||Object.values(this.state.operations).some(o=>o.recordId===parent.id&&active(o))))throw failure('任务组正在同步，请稍后新增。',409);
    const recordId=current?.id||`local:${id}`,op={id,hash,kind:raw.kind,actor:actor.openId,actorName:actor.name,recordId,code:current?.sourceCode||current?.code||(parent?nextChildCode(parent,records,Object.values(this.state.operations)):`W-${id.slice(0,8)}`),...(parent?{numbering:{parentId:parent.id,parentCode:parent.sourceCode||parent.code}}:{}),...(order!==undefined?{order}:{}),...(raw.insertAfter?{insertAfter:structuredClone(raw.insertAfter)}:{}),values,before:current?Object.fromEntries(Object.keys(values).map(k=>[k,current.values[k]])):{},appId:this.appId(),status:'accepted',attempts:0,updatedAt:this.now(),createdAt:this.now()};
    const needsOrdering=['create','delete','restore'].includes(raw.kind)||['level','stage','category','parentId'].some(k=>Object.hasOwn(values,k));
    this.commit(n=>{n.operations[id]=op;if(needsOrdering&&n.schema.order&&n.schema.displayCode)n.orderScopes=[...new Set([...(n.orderScopes||[]),orderScope(next),...(current?[orderScope(current)]:[]),...((next.level==='里程碑'||current?.level==='里程碑')?records.filter(r=>r.level==='里程碑').map(orderScope):[])])];});this.kick();return{operation:this.publicOperation(op),revision:this.state.revision};
  }
  retry(id,actor){this.assertActor(actor);const op=this.state.operations[id];if(!op)throw failure('同步任务不存在。',404);if(!this.allowed(op,actor))throw failure('无权处理此任务。',403);if(this.closed||this.isMaintenance())throw failure('系统正在更新，请稍后重试。',503);if(op.status==='blocked')throw failure('源表存在冲突，请先核对或放弃待同步修改。',409);if(op.status!=='success'){if(op.kind==='deliverable')this.deliverables.retry(id,actor);this.commit(n=>Object.assign(n.operations[id],{status:'accepted',error:'',nextAttempt:0,updatedAt:this.now()}));}this.kick();return{operation:this.publicOperation(this.state.operations[id]),revision:this.state.revision};}
  discard(id,actor){this.assertActor(actor);const op=this.state.operations[id];if(!op||!this.allowed(op,actor))throw failure('同步任务不存在或无权处理。',403);if(op.status!=='blocked')throw failure('仅可放弃未同步的冲突修改。',409);this.commit(n=>Object.assign(n.operations[id],{status:'discarded',updatedAt:this.now()}));return{revision:this.state.revision};}
  async flush(){
    if(this.flushing||this.closed||this.isMaintenance())return this.flushing;this.ensureBinding();
    this.flushing=this.serialize(async()=>{for(const saved of Object.values(this.state.operations)){
      if(!['accepted','syncing','error','uncertain'].includes(saved.status)||saved.nextAttempt>this.now()||this.closed||this.isMaintenance())continue;
      const id=saved.id;let observed;
      try{
        if(saved.appId!==this.appId())throw failure('提交所属应用已变化，请使用原应用核对。',409);
        this.commit(n=>Object.assign(n.operations[id],{status:'syncing',updatedAt:this.now()}));
        if(saved.kind==='deliverable'){await this.deliverables.flush(this.state.operations[id]);continue;}
        const schema=await this.adapter.schema();let op=this.state.operations[id];
        let remote=op.kind==='create'?await this.adapter.findMutation(id):await this.adapter.get(op.recordId);
        if(op.kind==='create'&&!remote){
          if(op.attempted)throw failure('上次新增回执尚未确认，已停止重复创建，请重试核对。',425);
          if(op.insertAfter){const anchor=await this.adapter.get(op.insertAfter.id),at=anchor&&normalizeTask(anchor,this.now());if(!at||at.deleted||at.version!==op.insertAfter.version||orderScope(at)!==orderScope(op.values))throw failure('插入位置已被外部修改，请刷新后重新新增。',409);}
          if(op.numbering){
            const fresh=(await this.adapter.list()).map(r=>normalizeTask(r,this.now())),parent=fresh.find(r=>r.id===op.numbering.parentId&&!r.deleted&&r.level==='任务组'&&r.stage===op.values.stage&&r.category===op.values.category);
            if(!parent)throw failure('所属任务组已变化，请核对后新增。',409);
            if(parent.code!==op.numbering.parentCode||fresh.some(r=>r.code===op.code)){
              const code=nextChildCode(parent,[...this.rawRecords().map(r=>normalizeTask(r,this.now())),...fresh],Object.values(this.state.operations));
              this.commit(n=>{n.operations[id].code=code;n.operations[id].numbering.parentCode=parent.code;});op=this.state.operations[id];
            }
          }
          this.commit(n=>{n.operations[id].attempted=true;});
          const recordId=await this.adapter.create(encodeValues({...op.values,status:executionStatus(op.values,this.now())},schema,{code:op.code,mutation:id,order:op.order,records:this.state.records.map(r=>normalizeTask(r,this.now()))}));
          this.commit(n=>{n.operations[id].recordId=recordId;});op=this.state.operations[id];remote=await this.adapter.get(recordId);
        }else if(op.kind!=='create'&&!remote)throw failure('源任务不存在，未覆盖任何记录。',409);
        observed=remote;let normalized=remote&&normalizeTask(remote,this.now());
        if(!normalized)throw failure('新增任务回读尚未确认，请重试核对。',425);
        const matches=task=>Object.entries(op.values).every(([k,v])=>same(task.values[k],v));
        if(op.kind!=='create'&&!matches(normalized)){
          for(const[k,v]of Object.entries(op.values))if(!same(normalized.values[k],op.before[k])&&!same(normalized.values[k],v))throw failure('源表同一字段已有修改，未覆盖外部记录。',409);
          const next={...normalized.values,...op.values};
          await this.adapter.update(op.recordId,encodeValues({...op.values,status:executionStatus(next,this.now())},schema,{records:this.state.records.map(r=>normalizeTask(r,this.now()))}));
          remote=await this.adapter.get(op.recordId);normalized=remote&&normalizeTask(remote,this.now());
        }
        if(!normalized||!matches(normalized)||op.kind==='create'&&op.order!==undefined&&normalized.order!==op.order)throw failure('任务回读尚未一致，修改已保留，请重试核对。',503);
        this.commit(n=>{n.records=[...n.records.filter(r=>r.recordId!==normalized.id),remote];if(op.kind==='restore'&&normalized.level==='任务组')n.statusDay='';Object.assign(n.operations[id],{recordId:normalized.id,status:'success',error:'',updatedAt:this.now(),nextAttempt:0});});
      }catch(e){this.commit(n=>{const op=n.operations[id];if(observed&&e.status===409)n.records=n.records.map(r=>r.recordId===observed.recordId?observed:r);Object.assign(op,{status:e.status===409?'blocked':e.status===425||op.kind==='create'&&op.attempted&&!op.recordId.startsWith('rec')?'uncertain':'error',error:e.status?e.message:'飞书同步未完成，修改已保留，可重试核对。',attempts:op.attempts+1,nextAttempt:this.now()+Math.min(300000,5000*2**Math.min(op.attempts,5)),updatedAt:this.now()});});}
    }});
    try{await this.flushing;}finally{this.flushing=null;}
  }
  async syncNumbering(){
    if(this.numberingRunning||this.closed||this.isMaintenance()||!this.state.orderScopes?.length)return;
    const scopes=new Set(this.state.orderScopes);this.numberingInFlight=scopes;
    this.numberingRunning=this.serialize(async()=>{
      const schema=await this.adapter.schema();if(!schema.order||!schema.displayCode)throw failure('排序字段尚未就绪，编号同步已保留。',503);
      const raw=await this.adapter.list(),rows=inheritTaskDeletion(raw.map(r=>normalizeTask(r,this.now()))),byId=new Map(rows.map(r=>[r.id,r])),affected=r=>scopes.has(orderScope(r))||r.parentId&&scopes.has(orderScope(byId.get(r.parentId)||{}));
      if(Object.values(this.state.operations).some(o=>active(o)&&o.kind!=='deliverable'&&affected({...byId.get(o.recordId),...o.values})))return;
      const desired=orderedTaskRecords(rows);
      for(const task of desired.filter(affected)){
        if(this.closed||this.isMaintenance())throw failure('编号同步已暂停。',503);
        const code=task.deleted?'':task.code;if(task.storedDisplayCode===code)continue;
        let remote=await this.adapter.get(task.id);if(!remote)throw failure('编号同步记录已变化，请重新核对。',425);
        const current=normalizeTask(remote,this.now());if(orderScope(current)!==orderScope(task)||current.order!==task.order||current.deleted!==(task.ownDeleted??task.deleted))throw failure('排序已有外部修改，已保留同步任务。',425);
        await this.adapter.update(task.id,{[schema.displayCode.id||schema.displayCode.name]:code});remote=await this.adapter.get(task.id);
        if(text(remote?.[fields.displayCode.name])!==code)throw failure('显示编号回读未一致，稍后继续核对。',503);
        const index=raw.findIndex(r=>r.recordId===task.id);raw[index]=remote;
      }
      this.commit(n=>{n.records=raw;n.orderScopes=(n.orderScopes||[]).filter(key=>!scopes.has(key));});
    });
    try{await this.numberingRunning;this.numberingError='';}catch(e){this.numberingError=e.status?e.message:'编号同步未完成，任务已保留。';}finally{this.numberingRunning=null;this.numberingInFlight=null;}
  }
  async syncStatuses(){
    if(this.statusRunning||this.closed||this.isMaintenance()||!this.state.schema||this.state.statusDay===chinaDay(this.now()))return;this.ensureBinding();
    this.statusRunning=this.serialize(async()=>{
      const rows=await this.adapter.list(),effective=new Map(inheritTaskDeletion(rows.map(r=>normalizeTask(r,this.now()))).map(r=>[r.id,r])),pending=new Set(Object.values(this.state.operations).filter(active).map(o=>o.recordId)),groups=new Map();
      for(const raw of rows){const r=effective.get(raw.recordId);if(r.deleted||r.level==='任务组'||pending.has(r.id)||r.status===text(raw[fields.status.name]))continue;if(!this.state.schema.status.options.includes(r.status))throw failure('任务状态选项未就绪，请先完成字段配置。',503);if(!groups.has(r.status))groups.set(r.status,[]);groups.get(r.status).push(r.id);}
      for(const[status,ids]of groups)for(let i=0;i<ids.length;i+=200){if(this.closed||this.isMaintenance())throw failure('状态同步已暂停。',503);await this.adapter.batchStatus(ids.slice(i,i+200),status,this.state.schema.status);}
      const fresh=groups.size?await this.adapter.list():rows;
      const verified=new Map(inheritTaskDeletion(fresh.map(r=>normalizeTask(r,this.now()))).map(r=>[r.id,r]));
      if(fresh.some(raw=>{const r=verified.get(raw.recordId);return !r.deleted&&r.level!=='任务组'&&!pending.has(r.id)&&r.status!==text(raw[fields.status.name]);}))throw failure('状态回读尚未一致，稍后继续核对。',503);
      this.commit(n=>{n.records=fresh;n.statusDay=chinaDay(this.now());n.updatedAt=this.now();});
    });
    try{await this.statusRunning;this.statusError='';}catch(e){this.statusError=e.status?e.message:'状态暂未同步到源表，页面计算结果保留。';}finally{this.statusRunning=null;}
  }
  kick(){if(!this.started||this.closed||this.wakeup||this.flushing||this.numberingRunning)return;this.wakeup=setImmediate(()=>{this.wakeup=null;this.flush().then(()=>this.syncNumbering()).then(()=>this.syncStatuses()).catch(()=>{this.lastError='任务台账写入失败，请检查服务器存储。';});});}
  start(){if(this.started)return;this.started=true;this.warm();this.timer=setInterval(()=>{this.kick();this.warm();},5000);this.timer.unref();this.kick();}
  async close(){if(this.closed)return;this.closed=true;clearInterval(this.timer);clearImmediate(this.wakeup);await Promise.allSettled([this.flushing,this.refreshing,this.statusRunning,this.numberingRunning].filter(Boolean));this.unlock?.();}
}
