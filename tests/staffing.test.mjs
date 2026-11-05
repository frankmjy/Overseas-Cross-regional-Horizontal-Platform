import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { buildCandidates, normalizeTracking, fields, validatePatch } from '../project-tasks/staffing/model.mjs';
import { StaffingService } from '../project-tasks/staffing/service.mjs';
import { StaffingAdapter } from '../project-tasks/staffing/adapter.mjs';
import { createStaffingHandler } from '../project-tasks/staffing/http.mjs';
import { safeReturnTo } from '../auth/service.mjs';
test('空表允许飞书省略items，异常结构仍拒绝',async()=>{const a=new StaffingAdapter({table:'tblTest'});a.api=async()=>({has_more:false,total:0});assert.deepEqual(await a.list(),[]);a.api=async()=>({has_more:false});await assert.rejects(a.list(),/不完整/);});
test('视图与分页条件通过params传给CLI，不放在路径中',async()=>{const a=new StaffingAdapter({table:'tblTest'});let call;a.base.cli=async(...args)=>{call=args;return {};};await a.api('GET','/records?view_id=vewTest&page_size=500');assert.equal(call[1][0],'/records');assert.deepEqual(JSON.parse(call[1][2]),{view_id:'vewTest',page_size:'500'});});

const record=(id,name,project='泰国')=>({record_id:id,fields:{输入填写者姓名:name,面试建议定岗:'电气工程师',面试定岗区域:project,所在机房:'甲机房',备注:'完成'}});
const sheet=[['序号','姓名','面试拟定岗','目前所在岗位','所在区域','所在机房','所属项目','岗位计划到岗时间'],[1,'甲','电气工程师','工程师','华东','甲机房','泰国A项目','2027-04-01'],[2,'郁建雪','运维值班长','','','','泰国A项目','2027-05-01']];
test('主源身份、异名不合并，完成不代表已到岗',()=>{
 const result=buildCandidates([record('recA','甲'),record('recB','郝建雪')],sheet);
 assert.equal(result.people.length,2);assert.equal(result.people[0].plannedArrival,'2027-04-01');assert.equal(result.people[0].status,undefined);
 assert.match(result.people[1].issues,/未匹配/);assert.equal(result.unmatched.length,1);assert.equal(result.people[1].plannedArrival,'');
});
test('项目冲突不补日期，重复姓名不猜测，待定不生成日期',()=>{
 const result=buildCandidates([record('recA','甲','马来西亚')],sheet);assert.equal(result.people[0].plannedArrival,'');assert.match(result.people[0].issues,/项目/);
 const duplicate=buildCandidates([record('recA','甲'),record('recB','甲')],sheet);assert.ok(duplicate.people.every(p=>!p.plannedArrival));
 const pending=buildCandidates([record('recA','甲')],[sheet[0],[1,'甲','电气工程师','','','','泰国A项目','待定']]);assert.equal(pending.people[0].plannedArrival,'');
});
test('字段校验拒绝伪造人员、日期和来源字段',()=>{
 assert.throws(()=>validatePatch({owner:'张三'}),/负责人/);assert.throws(()=>validatePatch({actualArrival:'2027-02-30'}),/日期/);
 assert.throws(()=>validatePatch({name:'伪造'}),/字段/);assert.equal(validatePatch({status:'待沟通',owner:'ou_abc',notes:'跟进'}).owner,'ou_abc');
});
test('人工字段规范化与外部回读使用语义值',()=>{
 const row=normalizeTracking({record_id:'recT',fields:{[fields.name]:'甲',[fields.sourceId]:'recA',[fields.status]:'待沟通',[fields.owner]:[{id:'ou_abc',name:'甲'}]}});
 assert.equal(row.owner,'ou_abc');assert.equal(row.status,'待沟通');assert.ok(row.version);
});
function fixture(t){const dir=fs.mkdtempSync(path.join(os.tmpdir(),'staffing-test-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));let rows=[{record_id:'recT',fields:{[fields.name]:'甲',[fields.sourceId]:'recA',[fields.status]:'待沟通'}}];let writes=0;
 const adapter={async list(){return structuredClone(rows);},async update(id,patch){writes++;Object.assign(rows.find(r=>r.record_id===id).fields,patch);},async sources(){return {records:[record('recA','甲')],sheet,demand:[]};}};
 return {dir,adapter,writes:()=>writes,rows:()=>rows};}
test('持久化后受理、重复请求幂等、失败重启可恢复且不覆盖外部修改',async t=>{
 const f=fixture(t),s=new StaffingService({dir:f.dir,adapter:f.adapter});await s.refresh();const item=s.snapshot().people[0];
 const baseline=f.writes();const raw={clientMutationId:'11111111-1111-4111-8111-111111111111',id:item.id,version:item.version,values:{status:'已确认',owner:'',actualArrival:'',notes:'确认'}};
 const actor={openId:'ou_me',name:'测试'};const op=s.accept(raw,actor);assert.equal(op.status,'accepted');assert.ok(fs.existsSync(path.join(f.dir,'ledger.json')));assert.equal(s.accept(raw,actor).id,op.id);
 await s.flush();assert.equal(s.snapshot().operations[0].status,'success');assert.equal(f.writes(),baseline+1);await s.flush();assert.equal(f.writes(),baseline+1);
 assert.throws(()=>s.accept({...raw,values:{...raw.values,notes:'不同'}},actor),/提交标识/);
 const fresh=s.snapshot().people[0];s.accept({...raw,clientMutationId:'22222222-2222-4222-8222-222222222222',version:fresh.version,values:{...raw.values,notes:'新说明'}},actor);
 f.rows()[0].fields[fields.notes]='外部修改';const restarted=new StaffingService({dir:f.dir,adapter:f.adapter});await restarted.flush();assert.equal(restarted.snapshot().operations.at(-1).status,'blocked');assert.equal(f.rows()[0].fields[fields.notes],'外部修改');
});
test('写入已成功但响应丢失，重启回读幂等标识后不重复写入',async t=>{
 const f=fixture(t),s=new StaffingService({dir:f.dir,adapter:f.adapter});await s.refresh();const p=s.snapshot().people[0],update=f.adapter.update;let once=true;f.adapter.update=async(...args)=>{await update(...args);if(once){once=false;throw Error('模拟连接断开');}};
 s.accept({clientMutationId:'33333333-3333-4333-8333-333333333333',id:p.id,version:p.version,values:{notes:'持久化重试测试'}},{openId:'ou_me'});await s.flush();assert.equal(s.snapshot().operations[0].status,'error');const writes=f.writes();const next=new StaffingService({dir:f.dir,adapter:f.adapter});await next.flush();assert.equal(next.snapshot().operations[0].status,'success');assert.equal(f.writes(),writes);
});
test('创建结果不明时先回读；目标仍不存在时禁止重复创建',async t=>{
 const f=fixture(t);f.adapter.list=async()=>[];let calls=0;f.adapter.create=async()=>{calls++;throw Error('timeout');};const s=new StaffingService({dir:f.dir,adapter:f.adapter});await assert.rejects(s.refresh(),/结果待核对/);const next=new StaffingService({dir:f.dir,adapter:f.adapter});await assert.rejects(next.refresh(),/禁止重复创建/);assert.equal(calls,1);
});
test('接口要求登录、拒绝跨站提交；登录返回路径保留新页面',async()=>{
 const handler=createStaffingHandler({snapshot:()=>({people:[]}),adapter:{config:{}}});const response=()=>({writeHead(status){this.status=status;},end(data){this.data=JSON.parse(data);}});let res=response();await handler({url:'/api/staffing',method:'GET',headers:{}},res);assert.equal(res.status,401);res=response();await handler({url:'/api/staffing',method:'POST',auth:{openId:'ou_me'},headers:{origin:'https://other.invalid',host:'local.invalid'}},res);assert.equal(res.status,403);assert.equal(safeReturnTo('/staffing-reserve?project=th-001&token=secret'),'/staffing-reserve?project=th-001');
});
