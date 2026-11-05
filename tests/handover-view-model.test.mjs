import test from 'node:test';
import assert from 'node:assert/strict';
import {buildModel,timelineColumns,hierarchy} from '../samples/handover-preview/model.mjs';
const field={code:'Task Code（任务编号）',title:'Task Description（任务详情）',level:'Task Level（任务层级）',stage:'Handover Stage（接维阶段）'};
const raw=(id,code,level,title,other={})=>({id,fields:{[field.code]:code,[field.title]:title,[field.level]:level,[field.stage]:'Step1: 项目筹备',...other}});

test('页面模型与后端使用相同优先级继承，明确设置的子项不被覆盖',()=>{
 const model=buildModel([raw('group','S1.1','任务组','团队筹备',{'Priority（优先级）':'P0'}),raw('inherited','S1.1-01','执行项','默认跟随',{'Parent Link（父记录）':[{id:'group'}]}),raw('explicit','S1.1-02','执行项','独立设置',{'Parent Link（父记录）':[{id:'group'}],'Priority（优先级）':'P1'})]);
 assert.equal(model.tasks[0].priority,'P0');assert.equal(model.tasks[0].explicitPriority,'');assert.equal(model.tasks[0].priorityInherited,true);
 assert.equal(model.tasks[1].priority,'P1');assert.equal(model.tasks[1].priorityInherited,false);
});
test('甘特月份和周刻度使用同一自然日比例，跨年和闰月边界一致',()=>{
 const scale=timelineColumns({start:'2027-12-01',end:'2028-03-31'});
 assert.equal(scale.days,122);assert.deepEqual(scale.months.map(m=>m.days),[31,31,29,31]);
 assert.equal(scale.months[2].left,62/122*100);
 assert.ok(Math.abs(scale.months.reduce((n,m)=>n+m.width,0)-100)<1e-9);
 assert.equal(scale.weeks[1].left,7/122*100);
 const clipped=timelineColumns({start:'2028-02-15',end:'2028-03-10'});
 assert.deepEqual(clipped.months.map(m=>m.days),[15,10]);assert.equal(clipped.months[1].left,60);
});
test('打标任务在里程碑中复用原身份，不重复执行任务或展示已软删除任务',()=>{
 const model=buildModel([raw('group','S1.1','任务组','团队筹备'),raw('task','S1.1-01','执行项','岗位核查',{'Parent Link（父记录）':[{id:'group'}],'Milestone（里程碑）':'🚩','Start Time（开始时间）':'2026-10-01','Due Time（截止时间）':'2026-10-02','Actual Completion（实际完成时间）':'2026-10-03'}),raw('deleted','S1.1-02','执行项','已删除任务',{'Parent Link（父记录）':[{id:'group'}],'Deleted（已删除）':true}),raw('native','M05','里程碑','施工图评审完成')],'2026-11-01T12:00:00Z');
 assert.equal(model.tasks.length,1);assert.equal(model.milestones.length,2);assert.equal(model.tasks[0].id,model.milestones.find(r=>r.code==='S1.1-01').id);assert.equal(model.tasks[0].status,'逾期完成');assert.equal(model.summary.completed,1);
 assert.ok(!model.records.some(r=>r.id==='deleted'));assert.equal(model.tasks[0].group,'S1.1 团队筹备');
});

 test('空任务组和只有里程碑的阶段仍显示可操作入口',()=>{
 const group={id:'empty',stage:1,category:'组织与人才',code:'S1.1.2',title:'空组'};
 const tree=hierarchy([], [group], [{stage:6,id:'node'}]);assert.equal(tree.length,2);assert.equal(tree[0].categories[0].groups[0].parentId,'empty');assert.equal(tree[1].id,6);
 });

 test('先保留归档记录排序位置再过滤，前端新插入位置与后端一致',()=>{
 const meta={'Row Order（条目排序）':null,'Display Code（显示编号）':''},parent={'Parent Link（父记录）':[{id:'group'}]};
 const model=buildModel([raw('group','S1.1.1','任务组','组',meta),raw('deleted','S1.1.1-01','执行项','旧归档',{...meta,...parent,'Deleted（已删除）':true}),raw('second','S1.1.1-02','执行项','第二项',{...meta,...parent}),raw('inserted','S1.1.1-03','执行项','插入项',{...meta,...parent,'Row Order（条目排序）':1572864})]);
 assert.deepEqual(model.tasks.map(r=>r.id),['inserted','second']);assert.deepEqual(model.tasks.map(r=>r.code),['S1.1.1-01','S1.1.1-02']);
 });
