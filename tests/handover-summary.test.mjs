import test from 'node:test';
import assert from 'node:assert/strict';
import {rollupTaskDates} from '../project-tasks/handover/summary.mjs';
test('汇总日期仅取同阶段有效子项最早最晚日期，保留原值和版本',()=>{
 const group={id:'g',level:'任务组',stage:1,start:'2000-01-01',due:'2099-01-01',values:{start:'2000-01-01'},version:'v'};
 const child=(id,start,due,extra={})=>({id,parentId:'g',level:'执行项',stage:1,start,due,...extra});
 const records=[group,child('a','2026-10-03','2026-10-10'),child('b','2026-10-01','2026-10-20'),child('deleted','2020-01-01','2090-01-01',{deleted:true}),child('foreign','2020-01-01','2090-01-01',{stage:2})];
 const result=rollupTaskDates(records);assert.equal(result[0].start,'2026-10-01');assert.equal(result[0].due,'2026-10-20');assert.equal(result[0].version,'v');assert.deepEqual(result[0].values,group.values);assert.equal(group.start,'2000-01-01');
 records[2].parentId='other';assert.equal(rollupTaskDates(records)[0].due,'2026-10-10');
 records[1].deleted=true;assert.equal(rollupTaskDates(records)[0].start,'');assert.equal(rollupTaskDates(records)[0].due,'');
});
test('部分日期分别汇总，前端 end 字段与后端 due 口径一致',()=>{
 const result=rollupTaskDates([{id:'g',level:'任务组',stage:1},{id:'a',parentId:'g',level:'执行项',stage:1,start:'2026-10-01',end:''},{id:'b',parentId:'g',level:'执行项',stage:1,start:'',end:'2026-11-01'}],{endKey:'end'});
 assert.equal(result[0].start,'2026-10-01');assert.equal(result[0].end,'2026-11-01');assert.equal(result[0].scheduleDerived,true);
});
