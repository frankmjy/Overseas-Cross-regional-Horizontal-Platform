import test from 'node:test';
import assert from 'node:assert/strict';
import {inlineTaskValues,inlineInsertValues,createInlineTaskEntry} from '../samples/handover-preview/inline.mjs';
const parent={id:'recParent',code:'S1.1.1',title:'团队筹备',stage:1,category:'组织与人才',level:'任务组'};
const model={ready:true,capabilities:{editable:true},parents:[parent],pendingRecordIds:[]};
test('组内新增默认归入所在阶段分类任务组，不复制日期或独立优先级',()=>{
 assert.deepEqual(inlineTaskValues(model,parent.id,'  核实岗位需求  '),{title:'核实岗位需求',level:'执行项',stage:1,category:'组织与人才',parentId:'recParent'});
});
test('只读、待同步、无效组和空名称不能发起组内新增',()=>{
 for(const m of [{...model,capabilities:{editable:false}},{...model,pendingRecordIds:['recParent']},{...model,parents:[]},{...model,ready:false}])assert.throws(()=>inlineTaskValues(m,parent.id,'新增任务'));
 assert.throws(()=>inlineTaskValues(model,parent.id,' '));
});
test('组内新增超时保留原提交身份，锁住取消和编辑，重试只提交一次逻辑记录',async()=>{
 const events={},requests=[],accepted=[],root={addEventListener:(k,f)=>events[k]=f,querySelector:()=>({focus(){}})};let controller,calls=0;
 controller=createInlineTaskEntry({root,getModel:()=>model,submit:async input=>{requests.push(structuredClone(input));if(++calls===1)throw Error('请求结果尚未确认');return{ok:true};},onAccepted:(data,parentId)=>accepted.push(parentId),onRender(){},onMessage(){}});
 controller.begin(parent.id);events.input({target:{closest:()=>true,name:'title',value:'组内新任务'}});const event={target:{matches:()=>true},preventDefault(){}};
 events.submit(event);await new Promise(setImmediate);
 assert.match(controller.render(parent,{editable:true}),/data-state="uncertain"/);assert.match(controller.render(parent,{editable:true}),/readonly/);assert.match(controller.render(parent,{editable:true}),/data-inline-cancel disabled/);
 events.submit(event);await new Promise(setImmediate);assert.deepEqual(requests[0],requests[1]);assert.deepEqual(accepted,[parent.id]);assert.equal(controller.active,false);
});

 test('逐条插入继承同层上下文，禁止只读及无排序契约使用',()=>{
 const leaf={id:'leaf',level:'执行项',stage:1,category:'组织与人才',parentId:parent.id},milestone={...parent,id:'node',level:'里程碑'};
 const m={...model,capabilities:{editable:true,ordering:true},records:[parent,leaf,milestone]};
 for(const row of m.records){const v=inlineInsertValues(m,row.id,'下方新项');assert.equal(v.level,row.level);assert.equal(v.category,row.category);assert.equal(v.parentId,row.level==='执行项'?parent.id:'');assert.ok(!Object.hasOwn(v,'code'));}
 for(const change of [{capabilities:{editable:false,ordering:true}},{capabilities:{editable:true,ordering:false}},{pendingRecordIds:['leaf']}])assert.throws(()=>inlineInsertValues({...m,...change},'leaf','新项'));
 });
