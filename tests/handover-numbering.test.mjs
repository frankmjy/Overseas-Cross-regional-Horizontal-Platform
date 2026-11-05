import test from 'node:test';
import assert from 'node:assert/strict';
import {nextChildCode} from '../project-tasks/handover/numbering.mjs';
test('组内编号包含软删除及已保留编号，不按行数重复分配',()=>{
 const parent={id:'parent',code:'S1.1.1'},records=[{id:'a',code:'S1.1.1-01'},{id:'b',code:'S1.1.1-04',deleted:true},{id:'c',code:'S1.1.2-99'}];
 assert.equal(nextChildCode(parent,records,[{kind:'create',code:'S1.1.1-05',status:'blocked'}]),'S1.1.1-06');
 assert.equal(nextChildCode(parent,[]),'S1.1.1-01');
 assert.equal(nextChildCode(parent,[{code:'S1.1.1-99'}]),'S1.1.1-100');
});
