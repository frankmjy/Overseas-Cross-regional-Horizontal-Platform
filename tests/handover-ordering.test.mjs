import test from 'node:test';
import assert from 'node:assert/strict';
import {orderedTaskRecords,nextInsertOrder,orderScope} from '../project-tasks/handover/ordering.mjs';
const group={id:'g',code:'S1.1.1',level:'任务组',stage:1,category:'组织与人才'};
const a={id:'a',code:'S1.1.1-01',level:'执行项',stage:1,category:group.category,parentId:'g'};
const b={...a,id:'b',code:'S1.1.1-02'};
test('中间插入后按顺序显示连续编号，来源编号和记录身份保留',()=>{
 const rows=[group,a,b],order=nextInsertOrder(rows,a,'a');
 const result=orderedTaskRecords([...rows,{...a,id:'new',code:'S1.1.1-03',order}]);
 assert.deepEqual(result.filter(r=>r.level==='执行项').map(r=>[r.id,r.code]),[['a','S1.1.1-01'],['new','S1.1.1-02'],['b','S1.1.1-03']]);assert.equal(result.find(r=>r.id==='b').sourceCode,'S1.1.1-02');
});
test('软删除和恢复只重排显示编号，保留排序与原始编号',()=>{
 const rows=[group,a,{...b,deleted:true},{...b,id:'c',code:'S1.1.1-03'}];
 assert.equal(orderedTaskRecords(rows).find(r=>r.id==='c').code,'S1.1.1-02');rows[2].deleted=false;assert.equal(orderedTaskRecords(rows).find(r=>r.id==='c').code,'S1.1.1-03');
 assert.throws(()=>nextInsertOrder(rows,{...a,parentId:'other'},'a'),/位置/);
});
test('任务组中间插入同步重排子项显示编号，不改变父记录关联',()=>{
 const other={...group,id:'g2',code:'S1.1.2'},newGroup={...group,id:'gn',code:'W-new',order:nextInsertOrder([group,other],group,'g')};
 const result=orderedTaskRecords([group,a,other,{...b,id:'bc',parentId:'g2',code:'S1.1.2-01'},newGroup]);
 assert.equal(result.find(r=>r.id==='gn').code,'S1.1.2');assert.equal(result.find(r=>r.id==='g2').code,'S1.1.3');assert.equal(result.find(r=>r.id==='bc').code,'S1.1.3-01');assert.equal(result.find(r=>r.id==='bc').parentId,'g2');assert.notEqual(orderScope(group),orderScope(a));
});

 test('同阶段不同分类的独立里程碑保持一条排序链',()=>{
 const rows=[{id:'a',code:'M01',level:'里程碑',stage:1,category:'组织'},{id:'b',code:'M02',level:'里程碑',stage:1,category:'技术'}];
 const value={id:'new',code:'W-new',level:'里程碑',stage:1,category:'组织',order:nextInsertOrder(rows,rows[0],'a')};
 assert.deepEqual(orderedTaskRecords([...rows,value]).map(r=>r.id),['a','new','b']);
 });
