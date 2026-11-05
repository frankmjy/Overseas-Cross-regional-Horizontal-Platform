import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {HandoverService} from '../project-tasks/handover/service.mjs';
import {HandoverDeliverables} from '../project-tasks/handover/deliverables.mjs';
import {fields,binding} from '../project-tasks/handover/model.mjs';
const actor={openId:'ou_verified',name:'归档验收',project:{id:'th-001',knowledgeKey:'thailand'}};
async function fixture(t){
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'handover-deliverable-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
 const schema=Object.fromEntries(Object.entries(fields).map(([k,f])=>[k,{...f,id:k,options:k==='stage'?['Step1: 项目筹备']:[]} ]));
 let row={recordId:'recTask',[fields.code.name]:'S1.1-04',[fields.title.name]:'项目档案',[fields.level.name]:'执行项',[fields.stage.name]:'Step1: 项目筹备',[fields.attachments.name]:[],[fields.links.name]:'https://example.com/original'};
 let uploads=0,writes=0,creates=0,docUploads=0,loseUpload=false;
 const adapter={async schema(){return schema;},async list(){return[row];},async get(){return structuredClone(row);},async update(id,values){assert.equal(id,row.recordId);for(const[k,v]of Object.entries(values))row[fields[k].name]=v;writes++;},async upload(id,schema,file){assert.equal(id,row.recordId);const bytes=fs.readFileSync(file);row[fields.attachments.name].push({name:path.basename(file),size:bytes.length,file_token:'file_'+(++uploads)});if(loseUpload){loseUpload=false;throw Error('upload response lost');}}};
 const documents={state:{operations:{},uploads:{}},config:{baseUrl:`https://vnet.feishu.cn/base/${binding.base}`},accept(value,user){assert.equal(user.openId,actor.openId);const id=value.clientMutationId;if(this.state.operations[id])return this.state.operations[id];creates++;return this.state.operations[id]={id,value,status:'accepted',recordId:'recArchive',sourceId:'tblArchive'};},storeUpload(id,bytes){docUploads++;this.state.uploads[id]={ready:true,size:bytes.length};},kick(){},retry(){}};
 const service=new HandoverService({dir,adapter,documents,appId:()=>binding.appId,now:()=>Date.parse('2026-11-01T12:00:00Z')});service.init();service.deliverables=new HandoverDeliverables(service);t.after(()=>service.close());await service.refresh();
 const submit=({archive=true,files=[],url='https://example.com/result'}={})=>({clientMutationId:randomUUID(),kind:'deliverable',recordId:'recTask',version:service.snapshot(actor).records[0].version,deliverable:{title:'验收资料',nature:'项目成果',archive,files,url,note:'验收备注'}});
 return{service,documents,submit,get row(){return row;},uploads:()=>uploads,writes:()=>writes,creates:()=>creates,docUploads:()=>docUploads,loseUpload(){loseUpload=true;}};
}
test('URL交付物归档完成后再回链，重试不重复归档，原链接保留',async t=>{
 const f=await fixture(t),raw=f.submit(),id=raw.clientMutationId;f.service.accept(raw,actor);await f.service.flush();assert.equal(f.creates(),1);assert.equal(f.writes(),0);
 f.documents.state.operations[id].status='success';f.service.retry(id,actor);await f.service.flush();assert.equal(f.creates(),1);assert.equal(f.writes(),1);
 assert.ok(f.row[fields.links.name].includes('https://example.com/original'));assert.ok(f.row[fields.links.name].includes('[验收资料](https://example.com/result)'));assert.ok(f.service.state.operations[id].archiveRecord.url.includes('recArchive'));
 assert.ok(f.documents.state.operations[id].value.note.includes('recTask'));assert.equal(f.documents.state.operations[id].value.stage,'1');assert.equal(f.service.state.operations[id].status,'success');
 f.service.retry(id,actor);await f.service.flush();assert.equal(f.writes(),1);assert.equal(f.creates(),1);
});
test('附件先落盘；重复字节可重传，不同字节拒绝；云端回执丢失后只核对不重复上传',async t=>{
 const f=await fixture(t),file={id:randomUUID(),name:'验收清单.txt',size:4},raw=f.submit({archive:false,files:[file],url:''});f.service.accept(raw,actor);
 f.service.deliverables.storeUpload(file.id,Buffer.from('test'),actor);f.service.deliverables.storeUpload(file.id,Buffer.from('test'),actor);
 assert.throws(()=>f.service.deliverables.storeUpload(file.id,Buffer.from('xxxx'),actor),e=>e.status===409);
 f.loseUpload();await f.service.flush();assert.equal(f.uploads(),1);f.service.retry(raw.clientMutationId,actor);await f.service.flush();assert.equal(f.uploads(),1);assert.equal(f.service.state.operations[raw.clientMutationId].status,'success');
});
test('归档附件沿用稳定附件身份，不越项目上传，缺附件时保持受理状态',async t=>{
 const f=await fixture(t),file={id:randomUUID(),name:'清单.txt',size:4},raw=f.submit({files:[file],url:''});f.service.accept(raw,actor);await f.service.flush();assert.equal(f.creates(),0);assert.equal(f.service.state.operations[raw.clientMutationId].status,'accepted');
 assert.throws(()=>f.service.deliverables.storeUpload(file.id,Buffer.from('test'),{...actor,project:{id:'my-001'}}),e=>e.status===409);
 f.service.deliverables.storeUpload(file.id,Buffer.from('test'),actor);await f.service.flush();assert.equal(f.uploads(),1);assert.equal(f.docUploads(),1);assert.equal(f.creates(),1);
 f.documents.state.operations[raw.clientMutationId].status='success';f.service.retry(raw.clientMutationId,actor);await f.service.flush();assert.equal(f.docUploads(),1);assert.equal(f.service.state.operations[raw.clientMutationId].status,'success');
});
test('路径型文件名和超大附件在受理前拒绝',async t=>{
 const f=await fixture(t);for(const file of [{id:randomUUID(),name:'../private.txt',size:4},{id:randomUUID(),name:'large.zip',size:65*1024*1024}])assert.throws(()=>f.service.accept(f.submit({files:[file]}),actor),/附件/);
 assert.equal(Object.keys(f.service.state.operations).length,0);
});

test('内容回链写入回执丢失后重试仍保持内容直达，不追加归档地址',async t=>{
 const f=await fixture(t),raw=f.submit();f.service.accept(raw,actor);await f.service.flush();f.documents.state.operations[raw.clientMutationId].status='success';
 const update=f.service.adapter.update;let lose=true;f.service.adapter.update=async(...args)=>{await update(...args);if(lose){lose=false;throw Error('response lost');}};
 f.service.retry(raw.clientMutationId,actor);await f.service.flush();f.service.retry(raw.clientMutationId,actor);await f.service.flush();
 assert.equal(f.writes(),1);assert.equal(f.creates(),1);assert.equal(f.service.state.operations[raw.clientMutationId].status,'success');assert.doesNotMatch(f.row[fields.links.name],/recArchive/);
});
test('升级前已持久化的旧回链意图重试保持原字节，不重新创建',async t=>{
 const f=await fixture(t),raw=f.submit(),id=raw.clientMutationId;f.service.accept(raw,actor);await f.service.flush();f.documents.state.operations[id].status='success';
 const before=f.row[fields.links.name],after=before+'\n[验收资料]('+f.documents.config.baseUrl+'?table=tblArchive&record=recArchive)';
 f.service.commit(n=>Object.assign(n.operations[id],{linkBefore:before,linkAfter:after}));f.service.retry(id,actor);await f.service.flush();
 assert.equal(f.row[fields.links.name],after);assert.equal(f.creates(),1);assert.equal(f.writes(),1);
});
