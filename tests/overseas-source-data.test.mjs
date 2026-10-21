import test from 'node:test';import assert from 'node:assert/strict';
import fs from 'node:fs';
import {buildFullSourcePlan,fullSourceRows,cellValue} from '../scripts/overseas-source-data.mjs';
const file='reports/base-reorganize-20261018/full-source.json';
test('full migration preserves every source row, including all initialization variants',()=>{
  const source=JSON.parse(fs.readFileSync(file,'utf8')),plan=buildFullSourcePlan(source);
  const rows=plan.flatMap(fullSourceRows);assert.equal(rows.length,source.tables.reduce((n,t)=>n+t.rows.length,0));assert.equal(rows.length,4262);
  assert.equal(new Set(rows.map(r=>r['Source Record Key（源记录标识）'])).size,rows.length);
  assert.equal(plan.find(g=>g.key==='initialization').sources.reduce((n,t)=>n+t.rows.length,0),379);
  assert.equal(plan.find(g=>g.key==='training').sources.reduce((n,t)=>n+t.rows.length,0),394);
  for(const g of plan)for(const f of g.fields)assert.match(f.name,/^[A-Za-z0-9].*（.+）$/);
});
test('raw content is copied without summarizing, renaming sites or fabricating project assignments',()=>{
  const source=JSON.parse(fs.readFileSync(file,'utf8')),g=buildFullSourcePlan(source).find(g=>g.key==='initialization');
  const original=g.sources[0].rows[0],row=fullSourceRows(g)[0];assert.equal(row['Implementation Method（实施方法）'],original.cells.实施方法);
  assert.equal(row['Applicable Project（适用项目）'],undefined);
  assert.deepEqual(cellValue([{id:'ou_test',name:'name'}],{type:'user'}),[{id:'ou_test'}]);
});
test('unavailable source group associations retain the complete stable identity snapshot',()=>{
  const source=JSON.parse(fs.readFileSync(file,'utf8')),group=buildFullSourcePlan(source).find(g=>g.key==='test-projects');
  const originals=group.sources[0].rows,rows=fullSourceRows(group);
  assert.equal(group.fields.find(f=>f.name==='Test Team（测试人员）').type,'text');
  assert.equal(group.fields.find(f=>f.name==='Operations（运营）').type,'user');
  for(let i=0;i<rows.length;i++)assert.deepEqual(JSON.parse(rows[i]['Source Identities（源身份标识）'])['测试人员'],originals[i].cells['测试人员']??null);
});
