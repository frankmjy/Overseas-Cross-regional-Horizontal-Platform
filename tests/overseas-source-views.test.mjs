import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {buildFullSourcePlan,fullSourceRows} from '../scripts/overseas-source-data.mjs';
import {mappedView,dataGaps} from '../scripts/overseas-source-views.mjs';
const dir=new URL('../reports/base-reorganize-20261018/',import.meta.url);
const source=JSON.parse(fs.readFileSync(new URL('full-source.json',dir)));
const configs=JSON.parse(fs.readFileSync(new URL('source-all-view-configs.json',dir)));
const groups=buildFullSourcePlan(source);
test('source views retain all three grouping levels and the exact discipline filter',()=>{
  const sla=groups.find(g=>g.key==='sla'),table=sla.sources[0];
  const config=configs.tables.find(t=>t.id===table.id);
  assert.equal(mappedView(sla,table,config.views[0],0).group.length,3);
  const exams=groups.find(g=>g.key==='exams'),e=exams.sources[0];
  const v=mappedView(exams,e,configs.tables.find(t=>t.id===e.id).views[1],1);
  assert.deepEqual(v.filter.conditions,[['Discipline（专业）','==',['电气']]]);
  assert.equal(v.visible[0],'Correct Answer（正确选项）');
  assert.deepEqual(v.visible.slice(3,8),['Option A（选项A）','Option B（选项B）','Option C（选项C）','Option D（选项D）','Option E（选项E）']);
});
test('merged templates intersect the source filter with source provenance',()=>{
  const g=groups.find(g=>g.key==='training'),t=g.sources.at(-1);
  const v=mappedView(g,t,configs.tables.find(x=>x.id===t.id).views[0],g.sources.length-1);
  assert.deepEqual(v.filter.conditions.at(-1),['Source Table（来源表）','==',t.name]);
  assert.equal(v.filter.conditions.length,2);
  assert.ok(!/太仓|怀来|乌兰|安次|巴音/.test(v.name));
});
test('audit detects missing answers even when row counts are equal and preserves source blanks',()=>{
  const g=groups.find(g=>g.key==='exams'),rows=fullSourceRows(g).slice(0,2);
  const actual=rows.map((cells,i)=>({id:`target${i}`,cells:structuredClone(cells)}));
  assert.equal(dataGaps(g,rows,actual).issues.length,0);
  actual[0].cells['Correct Answer（正确选项）']=null;
  assert.deepEqual(dataGaps(g,rows,actual).issues.map(i=>[i.kind,i.field]),[['missing-cell','Correct Answer（正确选项）']]);
});
