import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { PriorityService } from '../priorities/service.mjs';
import { fields, normalize, encode } from '../priorities/model.mjs';
import { createServer } from 'node:http';
import { createPriorityHandler } from '../priorities/http.mjs';

const actor = { openId:'ou_testOwner', name:'验收人员' };
const schema = Object.fromEntries(Object.entries(fields).map(([key,[name,type]]) => [key,{id:name,name,type,options:key==='impact'?['现场协同']:[],multiple:key==='impact'}]));
const values = { title:'[验收] 正式事项',kind:'卡点',urgency:'关键',status:'待协调',owner:actor.openId,due:'2026-10-30',impact:'现场协同',description:'条件确认',progress:'首次跟进',next:'确认窗口',planIds:['recPlan'],attachments:[],links:[{title:'验收资料',url:'https://example.com/material'}] };
function setup(t) {
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'priority-qa-')); t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
  let count=0, failAfterCreate=false, failAfterUpload=false;
  const rows={ 'th-001':[], 'my-001':[] };
  const adapter={async context(){return {schema,plans:[{recordId:'recPlan',code:'001',title:'验证窗口'}],people:[{id:actor.openId,name:actor.name}]};}, async list(project){return structuredClone(rows[project]);},async get(project,id){return structuredClone(rows[project].find(r=>r.recordId===id));},async create(project,patch){const row={recordId:'recNew'+(++count),...patch};rows[project].push(row);if(failAfterCreate){failAfterCreate=false;throw Error('response lost');}return row.recordId;},async update(project,id,patch){Object.assign(rows[project].find(r=>r.recordId===id),patch);},async upload(project,id,file){const r=rows[project].find(r=>r.recordId===id);r[fields.attachments[0]]=[...(r[fields.attachments[0]]||[]),{name:path.basename(file),size:fs.statSync(file).size,file_token:'private-'+randomUUID()}];if(failAfterUpload){failAfterUpload=false;throw Error('response lost');}},async remove(project,id,tokens){const r=rows[project].find(r=>r.recordId===id);r[fields.attachments[0]]=r[fields.attachments[0]].filter(f=>!tokens.includes(f.file_token));}};
  const service=new PriorityService({dir,adapter,appId:()=> 'cli_test',now:()=>Date.parse('2026-10-27T03:00:00Z')});
  return {service,dir,rows,adapter,loseCreate:()=>{failAfterCreate=true;},loseUpload:()=>{failAfterUpload=true;}};
}
const mutation=(extra={})=>({project:'th-001',week:'2026-10-26',values,clientMutationId:randomUUID(),...extra});
test('accept persists immediately, is idempotent, appends history and verifies formal fields',async t=>{
  const {service,rows}=setup(t);await service.refresh('th-001'); const raw=mutation();
  const accepted=service.accept(raw,actor); assert.equal(accepted.operation.status,'accepted'); assert.equal(rows['th-001'].length,0);
  assert.equal(service.accept(raw,actor).operation.id,raw.clientMutationId);
  assert.throws(()=>service.accept({...raw,values:{...values,title:'changed'}},actor),/提交标识/);
  await service.flush(); const item=service.snapshot('th-001',actor).items[0];
  assert.equal(item.title,values.title);assert.equal(item.sync.status,'success');assert.equal(item.history.length,1);assert.equal(item.history[0].editor,actor.name);
  const edit=mutation({id:item.id,version:item.version,values:{...values,progress:'第二次跟进'}}); service.accept(edit,actor);await service.flush();
  assert.equal(service.snapshot('th-001',actor).items[0].history.length,2);assert.equal(rows['th-001'].length,1);
});
test('lost creation response reconciles by mutation key without duplicate creation after restart',async t=>{
 const {service,rows,dir,adapter,loseCreate}=setup(t);await service.refresh('th-001');loseCreate();const raw=mutation();service.accept(raw,actor);await service.flush();assert.equal(rows['th-001'].length,1);
 const restarted=new PriorityService({dir,adapter,appId:()=> 'cli_test'});restarted.retry(raw.clientMutationId,actor);await restarted.flush();assert.equal(rows['th-001'].length,1);assert.equal(restarted.snapshot('th-001',actor).items[0].sync.status,'success');
});
test('text commits before upload, uploads reconcile by stable file identity, and removal syncs',async t=>{
 const {service,rows,loseUpload}=setup(t);await service.refresh('th-001');const id=randomUUID(),raw=mutation({values:{...values,attachments:[{id,name:'QA.txt',size:8}]}});service.accept(raw,actor);await service.flush();
 assert.equal(rows['th-001'].length,1);assert.equal(service.state.operations[raw.clientMutationId].status,'waiting_upload');
 service.upload('th-001',id,'QA.txt',Buffer.from('QA bytes'),actor);loseUpload();service.retry(raw.clientMutationId,actor);await service.flush();service.retry(raw.clientMutationId,actor);await service.flush();
 let item=service.snapshot('th-001',actor).items[0];assert.equal(item.sync.status,'success');assert.equal(rows['th-001'][0][fields.attachments[0]].length,1);assert.equal(item.attachments[0].name,'QA.txt');
 service.accept(mutation({id:item.id,version:item.version,values}),actor);await service.flush();assert.equal(rows['th-001'][0][fields.attachments[0]].length,0);
 await assert.rejects(service.download('th-001',item.id,id),/移除|不存在/);
});
test('rejects unknown project, name-only people, foreign plans, stale versions and foreign upload owners',async t=>{
 const {service}=setup(t);await service.refresh('th-001');assert.throws(()=>service.accept(mutation({project:'my-002'}),actor),/项目/);
 assert.throws(()=>service.accept(mutation({values:{...values,owner:'张三'}}),actor),/人员/);assert.throws(()=>service.accept(mutation({values:{...values,planIds:['recForeign']}}),actor),/计划/);
 const id=randomUUID(),raw=mutation({values:{...values,attachments:[{id,name:'QA.txt',size:8}]}});service.accept(raw,actor);
 assert.throws(()=>service.upload('my-001',id,'QA.txt',Buffer.from('QA bytes'),actor),/附件/);
 assert.throws(()=>service.upload('th-001',id,'QA.txt',Buffer.from('QA bytes'),{...actor,openId:'ou_other'}),/附件/);
});

test('HTTP enforces authentication, origin and project, accepts without waiting for Base and verifies upload bytes',async t=>{
 const {service,rows}=setup(t);await service.refresh('th-001');const handle=createPriorityHandler(service);const server=createServer((req,res)=>{if(req.headers.authorization==='QA')req.auth=actor;handle(req,res);});await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));t.after(()=>server.close());const origin=`http://127.0.0.1:${server.address().port}`;
 assert.equal((await fetch(origin+'/api/priorities')).status,401);
 const headers={authorization:'QA',origin,'content-type':'application/json'};
 assert.equal((await fetch(origin+'/api/priorities',{method:'POST',headers:{...headers,origin:'https://evil.example'},body:JSON.stringify(mutation())})).status,403);
 assert.equal((await fetch(origin+'/api/priorities?project=my-001',{method:'POST',headers,body:JSON.stringify(mutation())})).status,400);
 const id=randomUUID(),raw=mutation({values:{...values,attachments:[{id,name:'QA.txt',size:8}]}});const response=await fetch(origin+'/api/priorities',{method:'POST',headers,body:JSON.stringify(raw)});assert.equal(response.status,202);const result=await response.json();assert.equal(result.items[0].title,values.title);assert.equal(rows['th-001'].length,0);
 const upload=(body)=>fetch(origin+'/api/priorities/uploads?name=QA.txt',{method:'POST',headers:{authorization:'QA',origin,'content-type':'application/octet-stream','x-upload-id':id},body});
 assert.equal((await upload('QA bytes')).status,201);assert.equal((await upload('QA bytes')).status,201);assert.equal((await upload('newbytes')).status,409);
 await service.flush();const saved=service.snapshot('th-001',actor).items[0];assert.equal(saved.sync.status,'success');assert.doesNotMatch(JSON.stringify(service.snapshot('th-001',actor)),/private-/);
 const download=await fetch(origin+saved.attachments[0].url,{headers:{authorization:'QA'}});assert.equal(download.status,200);assert.equal(await download.text(),'QA bytes');assert.match(download.headers.get('content-disposition'),/attachment/);
 service.accept(mutation({id:saved.id,version:saved.version,values}),actor);await service.flush();assert.equal((await fetch(origin+saved.attachments[0].url,{headers:{authorization:'QA'}})).status,404);
});

test('remote edits block stale changes, mutation persistence failures are not accepted, and app changes fail closed',async t=>{
 const {service,rows}=setup(t);await service.refresh('th-001');service.accept(mutation(),actor);await service.flush();const item=service.snapshot('th-001',actor).items[0];service.accept(mutation({id:item.id,version:item.version,values:{...values,progress:'待同步'}}),actor);rows['th-001'][0][fields.title[0]]='正式表已修改';await service.flush();assert.equal(service.snapshot('th-001',actor).items[0].sync.status,'blocked');assert.equal(rows['th-001'][0][fields.title[0]],'正式表已修改');
 service.appId=()=> 'cli_changed';assert.throws(()=>service.snapshot('th-001',actor),/身份/);
});

test('plain multi-link text and legacy URL-field markdown normalize semantically',()=>{
 const original='验收资料\nhttps://example.com/priority-qa';
 const row={[fields.links[0]]:`[${original}](http://${original})`};
 assert.deepEqual(normalize(row).links,[{title:'验收资料',url:'https://example.com/priority-qa'}]);
 assert.deepEqual(normalize({[fields.links[0]]:'一号资料\nhttps://example.com/a\n\n二号资料\nhttps://example.com/b'}).links,[{title:'一号资料',url:'https://example.com/a'},{title:'二号资料',url:'https://example.com/b'}]);
});

test('failed durable ledger write does not accept or expose an unpersisted item',async t=>{
 const {service,dir}=setup(t);await service.refresh('th-001');service.file=dir;
 assert.throws(()=>service.accept(mutation(),actor),/未保存/);assert.equal(Object.keys(service.state.operations).length,0);assert.equal(service.snapshot('th-001',actor).items.length,0);
});

test('definitive create rejection can retry after permission recovery without creating twice',async t=>{
 const {service,rows,adapter}=setup(t);await service.refresh('th-001');const create=adapter.create;let first=true;
 adapter.create=async(...args)=>{if(first){first=false;throw Error('飞书应用请求失败（91403）');}return create(...args);};
 const raw=mutation();service.accept(raw,actor);await service.flush();assert.equal(rows['th-001'].length,0);assert.equal(service.state.operations[raw.clientMutationId].createAttempted,false);
 service.retry(raw.clientMutationId,actor);await service.flush();assert.equal(rows['th-001'].length,1);assert.equal(service.state.operations[raw.clientMutationId].status,'success');
});
