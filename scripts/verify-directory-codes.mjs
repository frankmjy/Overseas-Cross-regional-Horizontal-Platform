import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import {BaseAdapter} from '../research/adapter.mjs';
const dir='reports/source-references-20261018';
const coded=JSON.parse(await fs.readFile(dir+'/directory-code-plan.json','utf8'));
const proof=JSON.parse(await fs.readFile(dir+'/directory-codes-ui-proof.json','utf8'));
const tables=JSON.parse(await fs.readFile(dir+'/table-codes-verified.json','utf8')).tables;
const state=JSON.parse(await fs.readFile(dir+'/migration-ledger.json','utf8'));
assert.equal(new Set(coded.items.map(e=>e.code)).size,145);assert.equal(proof.rows.length,145);assert.equal(tables.length,113);
assert(coded.items.every(e=>proof.rows.some(p=>p.id===e.id&&p.name===e.name&&p.parent===e.parent)));
const api=new BaseAdapter({baseToken:state.target}),jobs=Object.values(state.projects).flatMap(p=>Object.values(p));
const result={at:new Date().toISOString(),directoryItems:145,uniqueCodes:145,tables:113,formulaFields:0,preservedSourceViews:0,recordCount:0,differences:[]};
for(let i=0;i<jobs.length;i+=3){const rs=await Promise.allSettled(jobs.slice(i,i+3).map(async m=>{
 const info=await api.cli('+table-get',['--table-id',m.id]);
 assert.equal(tables.find(t=>t.id===m.id).records_count,m.expectedRecords);result.recordCount+=m.expectedRecords;
 for(const [sourceId,desired]of Object.entries(m.computed||{})){
  const actual=info.fields.find(f=>f.id===m.fields[sourceId]);assert(actual);result.formulaFields++;
  if(actual.type!==desired.type||desired.expression&&actual.expression!==desired.expression||desired.from&&actual.from!==desired.from)result.differences.push({table:m.id,field:actual.name,type:actual.type,expectedType:desired.type,expectedExpression:desired.expression,actualExpression:actual.expression,expectedFrom:desired.from,actualFrom:actual.from});
 }
 for(const v of Object.values(m.views)){assert(info.views.some(g=>g.id===v.id));result.preservedSourceViews++;}
 }));for(const r of rs)if(r.status==='rejected')throw r.reason;}
await fs.writeFile(dir+'/directory-code-verification.json',JSON.stringify(result,null,2));
console.log(JSON.stringify({...result,differences:result.differences.length}));
assert.equal(result.differences.length,0,'Computed reference definition changed unexpectedly');assert.equal(result.preservedSourceViews,72);assert.equal(result.recordCount,744);
