import fs from 'node:fs/promises';
import {buildFullSourcePlan,fullSourceRows} from './overseas-source-data.mjs';
import {dataGaps} from './overseas-source-views.mjs';
const dir='reports/migration-closeout-20261019',read=async p=>JSON.parse(await fs.readFile(p,'utf8'));
const original=await read('reports/base-reorganize-20261018/full-source.json');
const state=await read('reports/base-reorganize-20261018/full-import-progress.json');
const converted=t=>t.rows.map(r=>({id:r.id,cells:Object.fromEntries(t.fields.map(f=>[f.name,r.cells[f.id]]))}));
const source={...original,tables:await Promise.all(original.tables.map(async t=>{const now=await read(`${dir}/reference-${t.id}.json`);return{...t,rows:converted(now)};}))};
const groups=buildFullSourcePlan(source),report={at:new Date().toISOString(),groups:[],sourceTables:source.tables.length};
for(const g of groups){const target=await read(`${dir}/other-${state.tables[g.key]}.json`);report.groups.push({...dataGaps(g,fullSourceRows(g),converted(target)),table:target.table.id});}
report.records=report.groups.reduce((n,g)=>n+g.rows,0);report.cells=report.groups.reduce((n,g)=>n+g.checked,0);report.issues=report.groups.reduce((n,g)=>n+g.issues.length,0);
const a=source.tables.find(t=>t.id==='tbluTxi1VlQJSOKE'),b=await read(`${dir}/other-tblu6ZzrsVaBuIcI.json`),answer=b.fields.find(f=>f.name==='Correct Answer（正确选项）');
report.answers={sourceRecords:a.rows.length,sourcePopulated:a.rows.filter(r=>r.cells['正确选项']).length,targetPopulated:b.rows.filter(r=>r.cells[answer.id]).length};
await fs.writeFile(`${dir}/reference-audit.json`,JSON.stringify(report,null,2));console.log(JSON.stringify({tables:report.sourceTables,groups:report.groups.length,records:report.records,cells:report.cells,issues:report.issues,answers:report.answers,issueGroups:report.groups.filter(g=>g.issues.length).map(g=>({key:g.key,n:g.issues.length,samples:g.issues.slice(0,2)}))}));
