import test from 'node:test';
import assert from 'node:assert/strict';
import {businessTables,makeDefinition,sourceValue,originalLayouts,meetingLayout} from '../scripts/overseas-base-layout.mjs';

test('initialization follows source business fields and contains no generic adaptation columns',()=>{
  const t=businessTables.find(t=>t.key==='launch');
  for(const k of ['工作内容','实施方法','工作目标','频次','检查岗位','执行岗位','优先级','指导文件','完成时间','现场工作进度','工作结果审核'])assert.ok(t.fields.some(f=>f[0]===k));
  assert.deepEqual(t.group,['频次','分类']);
  assert.ok(businessTables.every(t=>t.fields.every(f=>/^[A-Za-z0-9].*（.+）$/.test(f[1])&&!/Adaptation|Content Basis|Review Status/.test(f[1]))));
});
test('source completion and personal data are not copied as overseas site facts',()=>{
  for(const key of ['完成时间','现场工作进度','负责人','培训导师','年度完成进度','年份'])assert.equal(sourceValue({cells:{[key]:'source value'}},key,{type:'text'}),undefined);
  assert.equal(sourceValue({cells:{实施方法:'检查所有螺栓'}},'实施方法',{type:'text'}),'检查所有螺栓');
});
test('source formats survive and conversion includes existing site choices',()=>{
  const source={fields:[{name:'分类',type:'select',multiple:false,options:[{name:'检查类',hue:'Blue',lightness:'Lighter'}]}]};
  const d=makeDefinition(source,['分类','Category（分类）','Category（分类）'],{rows:[{cells:{'Category（分类）':'现场新增'}}]});
  assert.equal(d.type,'select');assert.equal(d.options[0].hue,'Blue');assert.ok(d.options.some(o=>o.name==='现场新增'));
  assert.equal(new Set(businessTables.map(t=>t.id)).size,12);
  assert.equal(Object.keys(originalLayouts).length,7);assert.equal(meetingLayout.length,12);
});
