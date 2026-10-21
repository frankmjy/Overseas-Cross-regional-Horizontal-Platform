import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import {BaseAdapter} from '../research/adapter.mjs';
import {tableDefs,fieldName} from './project-migration-names.mjs';
const dir='reports/source-references-20261018';
const state=JSON.parse(await fs.readFile(dir+'/migration-ledger.json','utf8'));
const api=new BaseAdapter({baseToken:state.target});
if(process.argv.includes('--inventory')){
 const plan=JSON.parse(await fs.readFile('reports/overseas-directory-20261018/directory-plan.json','utf8'));
 let tables=[],offset=0;for(;;){const page=await api.cli('+table-list',['--limit','50','--offset',String(offset)]);tables.push(...page.tables);if(!page.has_more&&tables.length>=page.total)break;assert(page.tables.length);offset+=page.tables.length;}
 const ids=new Set(tables.map(t=>t.id));assert(plan.tables.every(t=>ids.has(t.id)));
 const result={at:new Date().toISOString(),tableCount:tables.length,plannedTables:plan.tables.length,allPlannedTablesRetained:true,tableIds:[...ids]};
 await fs.writeFile(dir+'/final-table-inventory.json',JSON.stringify(result,null,2));console.log(JSON.stringify({tableCount:result.tableCount,allPlannedTablesRetained:true}));process.exit(0);
}
const report=JSON.parse(await fs.readFile(dir+'/migration-audit.json','utf8').catch(e=>{if(e.code!=='ENOENT')throw e;return JSON.stringify({at:new Date().toISOString(),tables:[],problems:[],viewScaffolds:[]});}));
const rawCli=api.cli.bind(api);api.cli=async(...args)=>{try{return await rawCli(...args);}catch{return rawCli(...args);}};
async function rows(tid){let all=[],offset=0;for(;;){const d=await api.cli('+record-list',['--table-id',tid,'--limit','200','--offset',String(offset),'--format','json']);all.push(...d.data.map((row,i)=>({id:d.record_id_list[i],cells:Object.fromEntries(d.fields.map((f,j)=>[f,row[j]]))})));if(!d.has_more)return all;offset+=d.data.length;assert(d.data.length);}}
for(const project of ['th','my'])for(let start=0;start<tableDefs.length;start+=3){
 const results=await Promise.allSettled(tableDefs.slice(start,start+3).filter(def=>!report.tables.some(t=>t.project===project&&t.source===def.id)).map(async def=>{
  const m=state.projects[project][def.id],src=JSON.parse(await fs.readFile(dir+'/'+def.id+'-full.json','utf8'));
  const calls=await Promise.allSettled([api.cli('+table-get',['--table-id',m.id]),rows(m.id)]);
  for(const r of calls)if(r.status==='rejected')throw r.reason;
  const [info,data]=calls.map(r=>r.value);
  await fs.writeFile(dir+`/audit-${project}-${def.id}.json`,JSON.stringify({info,rows:data},null,2));
  const check={project,source:def.id,id:m.id,rows:data.length,expected:m.expectedRecords,fields:info.fields.length,sourceFields:src.fields.length,views:info.views?.length};
  if(data.length!==m.expectedRecords)report.problems.push({table:m.id,kind:'row_count'});
  const byId=new Map(data.map(r=>[r.id,r]));
  const nativeSkip=new Set(['auto_number','formula','lookup','created_by','updated_by','updated_at','attachment','button']);
  for(const f of src.fields){const g=info.fields.find(g=>g.id===m.fields[f.id]);if(!g)report.problems.push({table:m.id,field:f.name,kind:'missing_field'});}
  const norm=(value,type)=>{if(value==null||value===''||Array.isArray(value)&&!value.length)return null;if(type==='datetime'||type==='created_at')return new Date(String(value).replace(' ','T')+'+08:00').getTime();if(type==='user'||type==='link')return value.map(v=>v.id).sort();return value;};
  if(project==='th')for(const r of src.rows){const got=byId.get(m.records[r.id]);if(!got){report.problems.push({table:m.id,kind:'missing_record',sourceRecord:r.id});continue;}
   for(const f of src.fields.filter(f=>!nativeSkip.has(f.type))){let expected=r.cells[f.name];if(f.type==='link')expected=(expected||[]).map(v=>({id:state.projects[project][f.link_table].records[v.id]}));let actual=got.cells[fieldName(f.name)];if(JSON.stringify(norm(expected,f.type))!==JSON.stringify(norm(actual,f.type)))report.problems.push({table:m.id,record:got.id,field:f.name,kind:'value_difference'});}
  }
  if(project==='my')for(const r of data)for(const f of src.fields.filter(f=>['user','datetime','created_at'].includes(f.type)))if(norm(r.cells[fieldName(f.name)],f.type)!==null)report.problems.push({table:m.id,field:f.name,kind:'malaysia_execution_not_blank'});
  const expectedIds=new Set(Object.values(m.views).map(v=>v.id));
  for(const v of info.views||[])if(!expectedIds.has(v.id))report.viewScaffolds.push({table:m.id,view:v.id,name:v.name});
  for(const v of Object.values(m.views))if(!info.views?.some(g=>g.id===v.id))report.problems.push({table:m.id,view:v.id,kind:'missing_view'});
  report.tables.push(check);console.log(JSON.stringify(check));
 }));for(const r of results)if(r.status==='rejected')throw r.reason;
 await fs.writeFile(dir+'/migration-audit.json',JSON.stringify(report,null,2));
}
console.log(JSON.stringify({tables:report.tables.length,thaiRows:report.tables.filter(t=>t.project==='th').reduce((a,t)=>a+t.rows,0),malaysiaRows:report.tables.filter(t=>t.project==='my').reduce((a,t)=>a+t.rows,0),problems:report.problems.length,scaffolds:report.viewScaffolds.length}));
