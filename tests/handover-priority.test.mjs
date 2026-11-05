import test from 'node:test';
import assert from 'node:assert/strict';
import {inheritPriorities,priorityPlaceholder} from '../project-tasks/handover/priority.mjs';

test('继承按同阶段有效父组解析，不改变独立值、原字段和并发版本',()=>{
 const parent={id:'parent',title:'父组',level:'任务组',stage:1,priority:'P0'},child={id:'child',level:'执行项',stage:1,parentId:'parent',priority:'',values:{priority:''},version:'raw-version'};
 const result=inheritPriorities([parent,child,{...child,id:'explicit',priority:'P1',values:{priority:'P1'}}]);
 assert.equal(result[1].priority,'P0');assert.equal(result[1].values.priority,'');assert.equal(result[1].version,'raw-version');assert.equal(result[1].priorityParentName,'父组');
 assert.equal(result[2].priority,'P1');assert.equal(result[2].priorityInherited,false);assert.equal(child.priority,'');assert.deepEqual(inheritPriorities(result),result);
 for(const wrong of [{...parent,deleted:true},{...parent,stage:2},{...parent,level:'执行项'}])assert.equal(inheritPriorities([wrong,child])[1].priority,'');
 assert.equal(priorityPlaceholder(child,[parent]),'跟随上级（P0）');assert.equal(priorityPlaceholder(child,[]),'跟随上级（未指定）');assert.equal(priorityPlaceholder(parent,[]),'未指定');
});
