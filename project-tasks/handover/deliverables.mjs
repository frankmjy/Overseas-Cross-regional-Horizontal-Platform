import fs from 'node:fs';
import path from 'node:path';
import {randomUUID,createHash} from 'node:crypto';
import {validateDocument} from '../../knowledge/document-fields.mjs';
import {rootDirectory} from '../../knowledge/directory.mjs';
import {binding,fields,normalizeTask,digest,failure,uuid,text} from './model.mjs';
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const canonical=v=>Array.isArray(v)?v.map(canonical):v&&typeof v==='object'?Object.fromEntries(Object.keys(v).sort().map(k=>[k,canonical(v[k])])):v;
export class HandoverDeliverables {
  constructor(service){this.service=service;}
  accept(raw,actor){
    const s=this.service;s.assertActor(actor);if(s.closed||s.isMaintenance())throw failure('系统正在更新，请稍后提交。',503);
    if(!uuid.test(raw.clientMutationId||''))throw failure('提交标识无效。');
    const id=raw.clientMutationId,hash=digest(canonical(raw)),prior=s.state.operations[id];
    if(prior){if(prior.hash!==hash||prior.actor!==actor.openId)throw failure('提交标识已用于其他内容。',409);return{operation:s.publicOperation(prior),revision:s.state.revision};}
    if(!s.state.schema)throw failure('资料字段尚未就绪，请稍后重试。',503);
    const snapshot=s.snapshot(actor),record=snapshot.records.find(r=>r.id===raw.recordId&&!r.deleted);
    if(!record||record.id.startsWith('local:'))throw failure('请先完成任务同步后提交交付物。',409);
    if(record.version!==raw.version)throw failure('任务已更新，请重新打开。',409);
    if(Object.values(s.state.operations).some(o=>o.recordId===record.id&&!['success','discarded'].includes(o.status)))throw failure('该任务还有待同步修改。',409);
    const v=raw.deliverable;if(!v||typeof v!=='object'||Array.isArray(v)||Object.keys(v).some(k=>!['title','url','nature','archive','files','note','specialty','directoryId'].includes(k)))throw failure('交付物字段不正确。');
    if(v.archive!==undefined&&typeof v.archive!=='boolean')throw failure('归档选项无效。');
    const taskUrl=`https://vnet.feishu.cn/base/${binding.base}?table=${binding.table}&record=${encodeURIComponent(record.id)}`;
    const value=validateDocument({clientMutationId:id,kind:'document',project:binding.knowledgeProject,scope:'project',chapter:'handover',stage:String(record.stage),title:v.title,nature:v.nature||'项目交付物',url:v.url||'',note:v.note||'',specialty:v.specialty||'',directoryId:v.directoryId||'',uploads:v.files||[]});
    if(value.uploads.reduce((sum,u)=>sum+u.size,0)>128*1024*1024)throw failure('本次附件总大小不能超过128MB。');
    if(value.uploads.some(u=>s.state.uploads[u.id]))throw failure('附件标识已使用，请重新选择文件。',409);
    const archiveValue={clientMutationId:id,kind:'document',project:binding.knowledgeProject,scope:'project',chapter:'handover',stage:String(record.stage),title:value.title,nature:value.nature,url:value.url,note:[value.note,`来源任务：${record.code} ${record.title}`,taskUrl].filter(Boolean).join('\n'),specialty:value.specialty,directoryId:value.directoryId,uploads:value.uploads};
    if(v.archive!==false){validateDocument(archiveValue);if(value.directoryId){const nodes=s.documents?.nodes(actor)||[],selected=nodes.find(n=>n.id===value.directoryId),root=rootDirectory(selected,nodes);if(!selected||!root||selected.chapter!=='handover'||root.stage&&root.stage!==String(record.stage))throw failure('请选择来源任务对应接维阶段的归档目录。');}}
    const uploads=value.uploads.map(u=>({...u,storedName:`${id.slice(0,8)}-${u.id.slice(0,8)}-${u.name}`}));
    const op={id,hash,kind:'deliverable',actor:actor.openId,actorName:actor.name,recordId:record.id,appId:s.appId(),values:{},archive:v.archive!==false,archiveValue,uploads,status:'accepted',step:uploads.length?'upload':'archiving',attempts:0,createdAt:s.now(),updatedAt:s.now()};
    s.commit(n=>{n.operations[id]=op;for(const u of uploads)n.uploads[u.id]={...u,operation:id,ready:false};});s.kick();return{operation:s.publicOperation(op),revision:s.state.revision};
  }
  uploadPlan(id,actor){const s=this.service;s.assertActor(actor);const upload=s.state.uploads[id],op=upload&&s.state.operations[upload.operation];if(!op||!s.allowed(op,actor))throw failure('附件任务不存在或无权处理。',403);if(s.closed||s.isMaintenance())throw failure('系统正在更新，请稍后上传。',503);return upload;}
  file(upload){return path.join(this.service.dir,'uploads',upload.id,upload.storedName);}
  storeUpload(id,bytes,actor){
    const s=this.service,u=this.uploadPlan(id,actor);if(!Buffer.isBuffer(bytes)||bytes.length!==u.size)throw failure('附件大小与提交内容不一致。');const hash=sha(bytes);
    if(u.ready){if(u.sha256!==hash)throw failure('同一附件不能替换为不同内容。',409);return;}
    const file=this.file(u),tmp=file+'.'+randomUUID()+'.part';let fd;
    try{fs.mkdirSync(path.dirname(file),{recursive:true});fd=fs.openSync(tmp,'wx',0o600);fs.writeFileSync(fd,bytes);fs.fsyncSync(fd);fs.closeSync(fd);fd=undefined;fs.renameSync(tmp,file);}catch{if(fd!==undefined)fs.closeSync(fd);if(fs.existsSync(tmp))fs.unlinkSync(tmp);throw failure('附件未保存，请检查存储后重试。',503);}
    s.commit(n=>{Object.assign(n.uploads[id],{ready:true,sha256:hash});Object.assign(n.operations[u.operation],{status:'accepted',error:'',nextAttempt:0,updatedAt:s.now()});});s.kick();
  }
  actor(op){return{openId:op.actor,name:op.actorName,project:{id:binding.project,knowledgeKey:binding.knowledgeProject}};}
  wait(id,step){const s=this.service;s.commit(n=>Object.assign(n.operations[id],{status:'accepted',step,error:'',nextAttempt:s.now()+1500,updatedAt:s.now()}));}
  retry(id,actor){const s=this.service,op=s.state.operations[id];if(op?.archive&&s.documents?.state.operations[id]&&s.documents.state.operations[id].status!=='success')s.documents.retry(id,this.actor(op));}
  async flush(saved){
    const s=this.service,id=saved.id;if(saved.uploads.some(u=>!s.state.uploads[u.id]?.ready)){this.wait(id,'upload');return;}
    const schema=await s.adapter.schema();let remote=await s.adapter.get(saved.recordId);
    if(!remote||normalizeTask(remote,s.now()).deleted)throw failure('来源任务已移除，交付物已保留，请核对。',409);
    for(const file of saved.uploads){
      const u=s.state.uploads[file.id],present=row=>(row[fields.attachments.name]||[]).find(a=>a.name===u.storedName&&Number(a.size)===u.size);
      if(!present(remote)){
        if(u.taskAttempted)throw failure('附件上次上传回执尚未确认，已停止重复上传，请重试核对。',425);
        const bytes=fs.readFileSync(this.file(u));if(sha(bytes)!==u.sha256)throw failure('本地附件校验失败，已停止同步。',409);
        s.commit(n=>{n.uploads[u.id].taskAttempted=true;});await s.adapter.upload(saved.recordId,schema,this.file(u));remote=await s.adapter.get(saved.recordId);
        if(!present(remote))throw failure('附件回读尚未一致，请重试核对。',425);
      }
      s.commit(n=>{Object.assign(n.uploads[u.id],{taskUploaded:true,fileToken:present(remote).file_token||present(remote).token||''});n.records=n.records.map(r=>r.recordId===remote.recordId?remote:r);});
    }
    let op=s.state.operations[id],target=op.archiveValue.url;
    if(op.archive){
      if(!s.documents)throw failure('资料归档服务尚未接入，提交已保留。',503);
      const actor=this.actor(op);s.documents.accept(op.archiveValue,actor);
      for(const file of op.uploads)if(!s.documents.state.uploads[file.id]?.ready)s.documents.storeUpload(file.id,fs.readFileSync(this.file(s.state.uploads[file.id])),actor);
      s.documents.kick();const document=s.documents.state.operations[id];
      if(document?.status==='error')throw failure('资料库归档未完成，提交已保留，可重试同步。',503);
      if(document?.status!=='success'){this.wait(id,'archiving');return;}
      if(!document.recordId||!document.sourceId)throw failure('归档记录身份尚未确认，请重试核对。',503);
      const archiveUrl=`${s.documents.config.baseUrl}?table=${document.sourceId}&record=${document.recordId}`;
      target=op.linkAfter?.includes(`](${archiveUrl})`)?archiveUrl:op.archiveValue.url;
      if(!op.archiveRecord)s.commit(n=>{n.operations[id].archiveRecord={sourceId:document.sourceId,recordId:document.recordId,url:archiveUrl};});
    }
    op=s.state.operations[id];remote=await s.adapter.get(op.recordId);if(!remote||normalizeTask(remote,s.now()).deleted)throw failure('来源任务已移除，归档记录已保留。',409);
    if(target){
      const before=text(remote[fields.links.name]),line=`[${op.archiveValue.title.replace(/[\[\]\r\n]/g,' ')}](${target})`;
      if(!before.includes(target)){
        if(op.linkBefore!==undefined&&before!==op.linkBefore&&before!==op.linkAfter)throw failure('任务交付物链接已有外部修改，归档已保留，请核对后处理。',409);
        const after=op.linkAfter||[before,line].filter(Boolean).join('\n');
        if(after.length>30000)throw failure('任务交付物链接已超过容量，归档已保留。',409);
        if(op.linkBefore===undefined)s.commit(n=>Object.assign(n.operations[id],{linkBefore:before,linkAfter:after,step:'linking'}));
        await s.adapter.update(op.recordId,{[schema.links.id]:after});remote=await s.adapter.get(op.recordId);
        if(!text(remote?.[fields.links.name]).includes(target))throw failure('任务交付物回链尚未一致，请重试核对。',503);
      }
    }
    s.commit(n=>{n.records=n.records.map(r=>r.recordId===remote.recordId?remote:r);Object.assign(n.operations[id],{status:'success',step:'done',error:'',updatedAt:s.now(),nextAttempt:0});});
  }
}
