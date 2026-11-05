import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {HandoverService} from '../project-tasks/handover/service.mjs';
import {fields,binding} from '../project-tasks/handover/model.mjs';

const actor={openId:'ou_verified',name:'验收用户',project:{id:'th-001',knowledgeKey:'thailand'}};
function fixture(t){
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'handover-write-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
 const schema=Object.fromEntries(Object.entries(fields).map(([key,f])=>[key,{...f,id:key,options:key==='stage'?['Step1: 项目筹备']:key==='category'?['组织与人才']:key==='priority'?['P0','P1','P2']:key==='level'?['任务组','执行项','里程碑']:key==='status'?['未开始','进行中','逾期进行','逾期完成','已完成']:key==='milestone'?['🚩']:[],multiple:key==='participants'}]));
 const row=(id,code,level,title)=>({recordId:id,[fields.code.name]:code,[fields.title.name]:title,[fields.level.name]:level,[fields.stage.name]:'Step1: 项目筹备',[fields.category.name]:'组织与人才',[fields.start.name]:'2026-09-30',[fields.due.name]:'2026-11-01',[fields.status.name]:'进行中',[fields.owner.name]:[],[fields.deleted.name]:false});
 let rows=[row('recGroup','S1.1','任务组','团队筹备'),{...row('recTask','S1.1-01','执行项','明确岗位需求'),[fields.parentId.name]:[{id:'recGroup'}]}],writes=0,creates=0,lose=false,invisible=false;
 const adapter={async schema(){return structuredClone(schema);},async list(){return structuredClone(rows);},async get(id){return structuredClone(rows.find(r=>r.recordId===id));},async findMutation(id){return invisible?null:structuredClone(rows.find(r=>r[fields.mutation.name]===id));},async create(values){const id='recNew'+(++creates),r={recordId:id};for(const[k,v]of Object.entries(values))r[fields[k].name]=v;rows.push(r);if(lose){lose=false;throw Error('response lost');}return id;},async update(id,values){const r=rows.find(r=>r.recordId===id);for(const[k,v]of Object.entries(values))r[fields[k].name]=v;writes++;}};
 const create=()=>new HandoverService({dir,adapter,now:()=>Date.parse('2026-11-01T12:00:00Z'),appId:()=>binding.appId});
 return{dir,create,adapter,schema,get rows(){return rows;},writes:()=>writes,creates:()=>creates,lose(){lose=true;},invisible(v=true){invisible=v;}};
}
async function ready(t){const f=fixture(t),s=f.create();s.init();t.after(()=>s.close());await s.refresh();return{...f,s};}

test('组内编号保留删除项和待同步预留，重复提交与重启不重复分配',async t=>{
 const f=await ready(t),deleted={...f.rows[1],recordId:'recDeleted',[fields.code.name]:'S1.1-09',[fields.deleted.name]:true};f.rows.push(deleted);await f.s.refresh();
 const create=title=>({clientMutationId:randomUUID(),kind:'create',values:{title,level:'执行项',stage:1,category:'组织与人才',parentId:'recGroup'}});
 const first=create('新增一'),second=create('新增二');f.s.accept(first,actor);f.s.accept(first,actor);f.s.accept(second,actor);
 assert.equal(f.s.state.operations[first.clientMutationId].code,'S1.1-10');assert.equal(f.s.state.operations[second.clientMutationId].code,'S1.1-11');
 await f.s.close();const restarted=f.create();restarted.init();t.after(()=>restarted.close());const third=create('新增三');restarted.accept(third,actor);assert.equal(restarted.state.operations[third.clientMutationId].code,'S1.1-12');
 await restarted.flush();assert.equal(f.creates(),3);assert.equal(f.rows.filter(r=>r[fields.migrationCode.name]==='S1.1-10').length,1);
 for(const r of f.rows.filter(r=>r[fields.migrationCode.name])){assert.deepEqual(r[fields.parentId.name],[{id:'recGroup'}]);assert.equal(r[fields.category.name],'组织与人才');}
});
test('创建前发现云端编号已占用时接续新号，不覆盖其他记录',async t=>{
 const f=await ready(t),input={clientMutationId:randomUUID(),kind:'create',values:{title:'组内新任务',level:'执行项',stage:1,category:'组织与人才',parentId:'recGroup'}};f.s.accept(input,actor);
 assert.equal(f.s.state.operations[input.clientMutationId].code,'S1.1-02');f.rows.push({...f.rows[1],recordId:'recExternal',[fields.code.name]:'S1.1-02',[fields.title.name]:'外部创建'});
 await f.s.flush();assert.equal(f.s.state.operations[input.clientMutationId].code,'S1.1-03');assert.equal(f.creates(),1);assert.equal(f.rows.find(r=>r.recordId==='recExternal')[fields.title.name],'外部创建');
});
test('父组在受理后已被外部删除，创建前阻止写入而保留受理记录',async t=>{
 const f=await ready(t),input={clientMutationId:randomUUID(),kind:'create',values:{title:'组内新任务',level:'执行项',stage:1,category:'组织与人才',parentId:'recGroup'}};f.s.accept(input,actor);f.rows[0][fields.deleted.name]=true;
 await f.s.flush();assert.equal(f.creates(),0);assert.equal(f.s.state.operations[input.clientMutationId].status,'blocked');
});

test('汇总日期拒绝手工修改，子项保存、删除与恢复自动重算；不覆盖历史组日期',async t=>{
 const f=await ready(t),group=()=>f.s.snapshot(actor).records.find(r=>r.id==='recGroup');
 for(const values of [{start:'2026-10-01'},{due:''}])assert.throws(()=>f.s.accept({clientMutationId:randomUUID(),kind:'update',recordId:'recGroup',version:group().version,values},actor),/子项自动计算/);
 let child=f.s.snapshot(actor).records.find(r=>r.id==='recTask');
 f.s.accept({clientMutationId:randomUUID(),kind:'update',recordId:child.id,version:child.version,values:{start:'2026-10-05',due:'2026-10-20'}},actor);
 assert.equal(group().start,'2026-10-05');assert.equal(group().due,'2026-10-20');await f.s.flush();
 assert.equal(f.rows[0][fields.start.name],'2026-09-30');assert.equal(group().values.start,'2026-09-30');
 child=f.s.snapshot(actor).records.find(r=>r.id==='recTask');f.s.accept({clientMutationId:randomUUID(),kind:'delete',recordId:child.id,version:child.version},actor);await f.s.flush();assert.equal(group().start,'');assert.equal(group().due,'');
 child=f.s.snapshot(actor).records.find(r=>r.id==='recTask');f.s.accept({clientMutationId:randomUUID(),kind:'restore',recordId:child.id,version:child.version},actor);await f.s.flush();assert.equal(group().due,'2026-10-20');
});

test('未标定子项继承已保存的父优先级，独立设置保留，清空恢复继承，重启不丢失',async t=>{
 const f=await ready(t),update=async(id,priority,service=f.s)=>{const row=service.snapshot(actor).records.find(r=>r.id===id);service.accept({clientMutationId:randomUUID(),kind:'update',recordId:id,version:row.version,values:{priority}},actor);await service.flush();};
 await update('recGroup','P0');
 let child=f.s.snapshot(actor).records.find(r=>r.id==='recTask');
 assert.equal(child.priority,'P0');assert.equal(child.values.priority,'');assert.equal(child.priorityInherited,true);
 await update('recTask','P1');await update('recGroup','P2');
 child=f.s.snapshot(actor).records.find(r=>r.id==='recTask');assert.equal(child.priority,'P1');assert.equal(child.priorityInherited,false);
 await update('recTask','');child=f.s.snapshot(actor).records.find(r=>r.id==='recTask');assert.equal(child.priority,'P2');assert.equal(child.values.priority,'');
 await f.s.close();const restarted=f.create();restarted.init();t.after(()=>restarted.close());assert.equal(restarted.snapshot(actor).records.find(r=>r.id==='recTask').priority,'P2');
 assert.equal(f.rows.find(r=>r.recordId==='recTask')[fields.priority.name],null);
 await update('recGroup','',restarted);assert.equal(restarted.snapshot(actor).records.find(r=>r.id==='recTask').priority,'');
});
test('行内优先级与完成操作逐字段写入，重开保持优先级且重复提交幂等',async t=>{
 const f=await ready(t);let r=f.s.snapshot(actor).records.find(r=>r.id==='recTask');
 const priority={clientMutationId:randomUUID(),kind:'update',recordId:r.id,version:r.version,values:{priority:'P1'}};
 f.s.accept(priority,actor);f.s.accept(priority,actor);await f.s.flush();assert.equal(f.writes(),1);
 r=f.s.snapshot(actor).records.find(r=>r.id==='recTask');assert.equal(r.priority,'P1');assert.equal(r.status,'进行中');
 f.s.accept({clientMutationId:randomUUID(),kind:'update',recordId:r.id,version:r.version,values:{actualCompletion:'2026-11-01'}},actor);await f.s.flush();
 r=f.s.snapshot(actor).records.find(r=>r.id==='recTask');assert.equal(r.status,'已完成');assert.equal(r.priority,'P1');
 f.s.accept({clientMutationId:randomUUID(),kind:'update',recordId:r.id,version:r.version,values:{actualCompletion:''}},actor);await f.s.flush();
 r=f.s.snapshot(actor).records.find(r=>r.id==='recTask');assert.equal(r.actualCompletion,'');assert.equal(r.priority,'P1');
});
test('受理先持久化，重复提交不重复写；里程碑打标保持同一记录',async t=>{
 const f=await ready(t),r=f.s.snapshot(actor).records.find(r=>r.id==='recTask'),input={clientMutationId:randomUUID(),kind:'update',recordId:r.id,version:r.version,values:{milestone:true,title:'核实岗位需求'}};
 const first=f.s.accept(input,actor),again=f.s.accept(input,actor);assert.equal(first.operation.id,again.operation.id);assert.equal(f.writes(),0);
 assert.ok(JSON.parse(fs.readFileSync(path.join(f.dir,'ledger.json'))).operations[input.clientMutationId]);await f.s.flush();
 assert.equal(f.writes(),1);const task=f.s.snapshot(actor).records.find(r=>r.id==='recTask');assert.equal(task.title,'核实岗位需求');assert.equal(task.level,'执行项');assert.equal(task.milestone,true);
 assert.equal(f.s.snapshot(actor).operations.find(o=>o.id===input.clientMutationId).status,'success');
 assert.throws(()=>f.s.accept({...input,values:{title:'其他内容'}},actor),e=>e.status===409);
});
test('拒绝未登录、其他项目、旧版本和有子项的组删除',async t=>{
 const f=await ready(t),task=f.s.snapshot(actor).records.find(r=>r.id==='recTask'),group=f.s.snapshot(actor).records.find(r=>r.id==='recGroup');
 const input={clientMutationId:randomUUID(),kind:'update',recordId:task.id,version:task.version,values:{title:'新名称'}};
 assert.throws(()=>f.s.accept(input,null),e=>e.status===401);assert.throws(()=>f.s.accept(input,{...actor,project:{id:'my-001',knowledgeKey:'malaysia'}}),e=>e.status===409);
 assert.throws(()=>f.s.accept({...input,version:'stale'},actor),e=>e.status===409);
 assert.throws(()=>f.s.accept({clientMutationId:randomUUID(),kind:'delete',recordId:group.id,version:group.version},actor),e=>e.status===409);
});
test('软删除可恢复，云端原记录和关联身份不变',async t=>{
 const f=await ready(t);let r=f.s.snapshot(actor).records.find(r=>r.id==='recTask');
 f.s.accept({clientMutationId:randomUUID(),kind:'delete',recordId:r.id,version:r.version},actor);await f.s.flush();
 assert.equal(f.s.snapshot(actor).records.find(r=>r.id==='recTask').deleted,true);r=f.s.snapshot(actor).records.find(r=>r.id==='recTask');
 f.s.accept({clientMutationId:randomUUID(),kind:'restore',recordId:r.id,version:r.version},actor);await f.s.flush();assert.equal(f.s.snapshot(actor).records.find(r=>r.id==='recTask').deleted,false);
 assert.equal(f.rows.length,2);
});
test('写入前检查远端同字段冲突，不覆盖；不同用户不能重试他人操作',async t=>{
 const f=await ready(t),r=f.s.snapshot(actor).records.find(r=>r.id==='recTask'),id=randomUUID();
 f.s.accept({clientMutationId:id,kind:'update',recordId:r.id,version:r.version,values:{title:'本地修改'}},actor);f.rows.find(r=>r.recordId==='recTask')[fields.title.name]='外部新版本';await f.s.flush();
 assert.equal(f.writes(),0);assert.equal(f.s.snapshot(actor).operations.find(o=>o.id===id).status,'blocked');
 assert.throws(()=>f.s.retry(id,{...actor,openId:'ou_other'}),e=>e.status===403);
});
test('新增回执丢失后按稳定提交标识恢复，不重复创建',async t=>{
 const f=await ready(t),id=randomUUID();f.lose();
 f.s.accept({clientMutationId:id,kind:'create',values:{title:'新增岗位核对',level:'执行项',stage:1,category:'组织与人才',parentId:'recGroup',start:'2026-11-01',due:'2026-11-03'}},actor);
 await f.s.flush();assert.equal(f.creates(),1);f.s.retry(id,actor);await f.s.flush();assert.equal(f.creates(),1);assert.equal(f.s.snapshot(actor).operations.find(o=>o.id===id).status,'success');
});
test('未知新增结果尚未可见时停止重复创建，重启后受理记录仍存在',async t=>{
 const f=await ready(t),id=randomUUID();f.lose();f.invisible();
 f.s.accept({clientMutationId:id,kind:'create',values:{title:'新增检查项',level:'执行项',stage:1,category:'组织与人才',parentId:'recGroup'}},actor);await f.s.flush();f.s.retry(id,actor);await f.s.flush();assert.equal(f.creates(),1);
 await f.s.close();const recovered=f.create();recovered.init();t.after(()=>recovered.close());assert.ok(recovered.snapshot(actor).operations.some(o=>o.id===id));f.invisible(false);recovered.retry(id,actor);await recovered.flush();assert.equal(f.creates(),1);assert.equal(recovered.snapshot(actor).operations.find(o=>o.id===id).status,'success');
});
test('落盘失败不能返回受理成功',async t=>{
 const f=await ready(t),r=f.s.snapshot(actor).records.find(r=>r.id==='recTask');f.s.file=path.join(f.dir,'cannot-write','ledger.json');fs.writeFileSync(path.join(f.dir,'cannot-write'),'file blocks directory');
 assert.throws(()=>f.s.accept({clientMutationId:randomUUID(),kind:'update',recordId:r.id,version:r.version,values:{title:'不应受理'}},actor),e=>e.status===503);assert.equal(f.writes(),0);
});
test('更新进展按已验证编辑人追加历史，不覆盖旧内容',async t=>{
 const f=await ready(t),r=f.s.snapshot(actor).records.find(r=>r.id==='recTask');f.s.accept({clientMutationId:randomUUID(),kind:'update',recordId:r.id,version:r.version,values:{feedback:'本次核查进展'}},actor);await f.s.flush();
 const feedback=f.rows.find(r=>r.recordId==='recTask')[fields.feedback.name];assert.match(feedback,/验收用户/);assert.match(feedback,/跟进 001/);assert.match(feedback,/本次核查进展/);
});

 test('按位置插入、删除、恢复同步连续显示编号，原来源编号与记录不变',async t=>{
 const f=await ready(t);f.rows.push({...f.rows[1],recordId:'recSecond',[fields.code.name]:'S1.1-02'});await f.s.refresh();
 const anchor=f.s.snapshot(actor).records.find(r=>r.id==='recTask'),input={clientMutationId:randomUUID(),kind:'create',insertAfter:{id:anchor.id,version:anchor.version},values:{title:'中间新项',level:'执行项',stage:1,category:anchor.category,parentId:'recGroup'}};
 f.s.accept(input,actor);await f.s.flush();await f.s.syncNumbering();assert.equal(f.s.state.orderScopes.length,0);
 const added=f.rows.find(r=>r[fields.title.name]==='中间新项');assert.equal(added[fields.displayCode.name],'S1.1-02');assert.equal(f.rows.find(r=>r.recordId==='recSecond')[fields.displayCode.name],'S1.1-03');assert.equal(added[fields.migrationCode.name],'S1.1-03');
 const change=async kind=>{const r=f.s.snapshot(actor).records.find(r=>r.id===added.recordId);f.s.accept({clientMutationId:randomUUID(),kind,recordId:r.id,version:r.version},actor);await f.s.flush();await f.s.syncNumbering();};
 await change('delete');assert.equal(f.rows.find(r=>r.recordId==='recSecond')[fields.displayCode.name],'S1.1-02');await change('restore');assert.equal(added[fields.displayCode.name],'S1.1-02');assert.equal(f.rows.find(r=>r.recordId==='recSecond')[fields.code.name],'S1.1-02');assert.equal(f.creates(),1);
 });
 test('外部修改插入锚点后阻止创建，明确只读身份不能伪造写入',async t=>{
 const f=await ready(t),at=f.s.snapshot(actor).records.find(r=>r.id==='recTask'),input={clientMutationId:randomUUID(),kind:'create',insertAfter:{id:at.id,version:at.version},values:{title:'新项',level:'执行项',stage:1,category:at.category,parentId:'recGroup'}};
 assert.throws(()=>f.s.accept(input,{...actor,permissions:{projects:{view:true,edit:false}}}),e=>e.status===403);
 f.s.accept(input,actor);f.rows[1][fields.title.name]='外部已改';await f.s.flush();assert.equal(f.creates(),0);assert.equal(f.s.state.operations[input.clientMutationId].status,'blocked');
 });
 test('编号同步失败后保留持久化队列，重启继续且不重复创建',async t=>{
 const f=await ready(t),input={clientMutationId:randomUUID(),kind:'create',values:{title:'恢复编号测试',level:'执行项',stage:1,category:'组织与人才',parentId:'recGroup'}};
 f.s.accept(input,actor);await f.s.flush();const update=f.adapter.update;f.adapter.update=async()=>{throw Error('offline');};await f.s.syncNumbering();assert.ok(f.s.state.orderScopes.length);assert.ok(f.s.numberingError);
 await f.s.close();f.adapter.update=update;const recovered=f.create();recovered.init();t.after(()=>recovered.close());await recovered.syncNumbering();assert.equal(recovered.state.orderScopes.length,0);assert.equal(f.creates(),1);assert.equal(f.rows.find(r=>r[fields.title.name]==='恢复编号测试')[fields.displayCode.name],'S1.1-02');
 });
