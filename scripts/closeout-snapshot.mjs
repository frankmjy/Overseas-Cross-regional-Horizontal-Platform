import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import path from 'node:path';
import {BaseAdapter} from '../research/adapter.mjs';
const dir='reports/migration-closeout-20261019';
await fs.mkdir(dir,{recursive:true});
const ledger=JSON.parse(await fs.readFile('reports/source-references-20261018/migration-ledger.json','utf8'));
const source='FmIwbCqj1ax5MvsTp5OcPO5lnue';
const adapters=new Map([source,ledger.target].map(base=>[base,new BaseAdapter({baseToken:base})]));
async function call(base,c,a){try{return await adapters.get(base).cli(c,a);}catch(e){if(/get|list/.test(c))return adapters.get(base).cli(c,a);throw e;}}
const read=async file=>JSON.parse(await fs.readFile(file,'utf8'));
const save=async(file,v)=>fs.writeFile(file,JSON.stringify(v,null,2));
const jobs=[...Object.keys(ledger.projects.th).map(id=>({side:'source',id,base:source})),...Object.entries(ledger.projects).flatMap(([project,tables])=>Object.entries(tables).map(([sourceId,m])=>({side:project,id:m.id,base:ledger.target,sourceId})))];
const mode=process.argv[2]||'tables';
if(mode==='remaining'){
 const inventory=await read(dir+'/inventory.json');
 const oldSource=await read('reports/base-reorganize-20261018/full-source.json');
 const known=new Set(jobs.filter(j=>j.side!=='source').map(j=>j.id));
 adapters.set(oldSource.base,new BaseAdapter({baseToken:oldSource.base}));
 jobs.length=0;
 jobs.push(...inventory.tables.filter(t=>!known.has(t.id)).map(t=>({side:'other',id:t.id,base:ledger.target})),...oldSource.tables.map(t=>({side:'reference',id:t.id,base:oldSource.base})));
}
if(mode==='reference-views'){
 const oldSource=await read('reports/base-reorganize-20261018/full-source.json'),oldLedger=await read('reports/base-reorganize-20261018/full-import-progress.json');
 adapters.set(oldSource.base,new BaseAdapter({baseToken:oldSource.base}));jobs.length=0;
 jobs.push(...oldSource.tables.map(t=>({side:'reference',id:t.id,base:oldSource.base})),...Object.values(oldLedger.tables).map(id=>({side:'other',id,base:ledger.target})));
}
if(mode==='views'||mode==='reference-views')process.env.LARK_CLI_SCRIPT=path.resolve('.tmp/lark-cli-1.0.98/package/scripts/run.js');
if(mode==='tables'||mode==='remaining'){
 for(let i=0;i<jobs.length;i+=3){const rs=await Promise.allSettled(jobs.slice(i,i+3).map(async job=>{
  const file=dir+`/${job.side}-${job.id}.json`;try{const old=await read(file);if(old.complete)return;}catch(e){if(e.code!=='ENOENT')throw e;}
  const info=await call(job.base,'+table-get',['--table-id',job.id]),rows=[];let rev;
  for(let offset=0;;){const p=await call(job.base,'+record-list',['--table-id',job.id,'--limit','200','--offset',String(offset),'--format','json']);assert(Array.isArray(p.data)&&p.data.length===p.record_id_list.length);if(rev!==undefined)assert.equal(p.rev,rev,'Source changed during pagination');rev=p.rev;
   rows.push(...p.data.map((row,j)=>({id:p.record_id_list[j],cells:Object.fromEntries(p.field_id_list.map((id,k)=>[id,row[k]]))})));if(!p.has_more)break;assert(p.data.length);offset+=p.data.length;}
  await save(file,{at:new Date().toISOString(),job,complete:true,rev,...info,rows});
 }));for(const r of rs)if(r.status==='rejected')throw r.reason;console.log(JSON.stringify({snapshots:Math.min(i+3,jobs.length),total:jobs.length}));}
 const api=adapters.get(ledger.target),tables=[];for(let offset=0;;){const p=await api.cli('+table-list',['--limit','50','--offset',String(offset)]);tables.push(...p.tables);if(!p.has_more&&tables.length>=p.total)break;assert(p.tables.length);offset+=p.tables.length;}
 await save(dir+'/inventory.json',{at:new Date().toISOString(),tables});
}else if(mode==='views'||mode==='reference-views'){
 const tasks=[];for(const job of jobs){const t=await read(dir+`/${job.side}-${job.id}.json`);for(const v of t.views)if(v.type!=='form')tasks.push({job,v});}
 for(let i=0;i<tasks.length;i+=3){const rs=await Promise.allSettled(tasks.slice(i,i+3).map(async({job,v})=>{
  const file=dir+`/view-${job.side}-${job.id}-${v.id}.json`;try{const old=await read(file);if(old.complete)return;}catch(e){if(e.code!=='ENOENT')throw e;}
  const properties={};for(const name of ['visible-fields','filter',...(v.type!=='gallery'?['group']:[]),'sort',...(['gantt','calendar'].includes(v.type)?['timebar']:[]),...(v.type==='gallery'?['card']:[])]){try{properties[name]=await call(job.base,'+view-get-'+name,['--table-id',job.id,'--view-id',v.id]);}catch(e){properties[name]={error:e.message};}}
  await save(file,{at:new Date().toISOString(),complete:true,job,view:v,properties});
 }));for(const r of rs)if(r.status==='rejected')throw r.reason;console.log(JSON.stringify({viewSnapshots:Math.min(i+3,tasks.length),total:tasks.length}));}
}else throw Error('Choose tables or views');
