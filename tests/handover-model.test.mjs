import test from 'node:test';
import assert from 'node:assert/strict';
import { executionStatus, normalizeTask, taskVersion, validateTaskValues, fields, binding, encodeValues } from '../project-tasks/handover/model.mjs';

const now = Date.parse('2026-11-01T15:00:00Z');
test('按计划自然日得到五种状态，实际完成优先，截止当日不逾期', () => {
  assert.equal(executionStatus({start:'2026-11-02',due:'2026-11-10'},now),'未开始');
  assert.equal(executionStatus({start:'2026-10-01',due:'2026-11-01'},now),'进行中');
  assert.equal(executionStatus({start:'2026-10-01',due:'2026-10-31'},now),'逾期进行');
  assert.equal(executionStatus({due:'2026-10-31',actualCompletion:'2026-10-31'},now),'已完成');
  assert.equal(executionStatus({due:'2026-10-31',actualCompletion:'2026-11-01'},now),'逾期完成');
  assert.equal(executionStatus({},now),'未开始');
  assert.equal(executionStatus({start:'2026-11-02',due:'2026-11-03'},now+3600000),'进行中');
});
test('里程碑打标不改变执行项身份，人员只按稳定ID规范化，附件引用保留', () => {
  const raw={recordId:'recTask', [fields.code.name]:'S1.1-01',[fields.title.name]:'明确岗位需求',[fields.level.name]:'执行项',[fields.stage.name]:'Step1：项目筹备',[fields.milestone.name]:'🚩',[fields.owner.name]:[{id:'ou_verified',name:'已验证用户'}],[fields.attachments.name]:[{name:'岗位清单.txt',file_token:'file_known',size:4}]};
  const task=normalizeTask(raw,now);
  assert.equal(task.level,'执行项');assert.equal(task.milestone,true);assert.deepEqual(task.owner,['ou_verified']);
  assert.equal(task.attachments[0].file_token,'file_known');assert.equal(task.status,'未开始');
  assert.notEqual(taskVersion(task),taskVersion({...task,title:'新名称'}));
  assert.equal(binding.table,'tblgQsrBMFd9eeuX');
});
test('拒绝无效日期、同名冒充人员、悬空父记录及客户端越权状态字段', () => {
  const schema=Object.fromEntries(Object.entries(fields).map(([key,value])=>[key,{...value,options:[]} ]));
  schema.stage.options=['Step1：项目筹备'];schema.category.options=['组织与人才'];
  const context={schema,users:[{id:'ou_verified',name:'已验证用户'}],records:[{id:'recGroup',level:'任务组',stage:1,deleted:false}],now};
  const valid={title:'岗位需求',level:'执行项',stage:1,category:'组织与人才',parentId:'recGroup',start:'2026-10-01',due:'2026-11-01',owner:['ou_verified'],milestone:true};
  assert.equal(validateTaskValues(valid,context).title,'岗位需求');
  assert.throws(()=>validateTaskValues({...valid,due:'2026-02-30'},context),/日期/);
  assert.throws(()=>validateTaskValues({...valid,owner:['已验证用户']},context),/人员|账号/);
  assert.throws(()=>validateTaskValues({...valid,parentId:'recMissing'},context),/任务组|父/);
  assert.throws(()=>validateTaskValues({...valid,status:'已完成'},context),/状态|字段/);
});
test('编号公式只读，新条目写其现有迁移标识字段，不向公式字段写入',()=>{
  const schema=Object.fromEntries(Object.entries(fields).map(([key,value])=>[key,{...value,id:key,options:[]}]));
  const encoded=encodeValues({title:'新条目'},schema,{code:'W-known'});
  assert.ok(!Object.hasOwn(encoded,'code'));assert.equal(encoded.migrationCode,'W-known');
});
