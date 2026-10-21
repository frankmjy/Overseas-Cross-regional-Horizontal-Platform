import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import {BaseAdapter} from '../research/adapter.mjs';
const dir='reports/source-references-20261018';
const planFile='reports/overseas-directory-20261018/directory-plan.json';
const file=dir+'/country-label-plan.json';
const read=async p=>JSON.parse(await fs.readFile(p,'utf8'));
const save=async(p,v)=>fs.writeFile(p,JSON.stringify(v,null,2));
const plan=await read(planFile),api=new BaseAdapter({baseToken:plan.base});
const mode=process.argv[2]||'plan';
const short=s=>s.replaceAll('马来西亚','马来');
if(mode==='plan'){
 const coded=await read(dir+'/directory-code-plan.json');
 const items=coded.items.map(e=>{
  let name=short(e.name);
  if(/^0[23]\./.test(e.code))name=name.replace(/^(\d+(?:\.\d+)+\s+)(?:Thailand|Malaysia|TH|MY)\s+/,'$1').replace(/（(?:泰国|马来)/,'（');
  return {...e,oldName:e.name,name};
 });
 assert.equal(new Set(items.map(e=>e.name)).size,145);
 const changes=items.filter(e=>e.name!==e.oldName);
 await save(file,{at:new Date().toISOString(),base:plan.base,items,changes});
 console.log(JSON.stringify({changes:changes.length,tables:changes.filter(e=>e.kind==='table').length,folders:changes.filter(e=>e.kind==='folder').length,examples:changes.slice(0,5).map(e=>({from:e.oldName,to:e.name}))}));
}else if(mode==='tables'){
 const labels=await read(file);let done=[];try{done=await read(dir+'/country-table-progress.json');}catch(e){if(e.code!=='ENOENT')throw e;}
 for(const item of labels.changes.filter(e=>e.kind==='table')){
  if(done.some(e=>e.id===item.id&&e.name===item.name))continue;
  try{await api.cli('+table-update',['--table-id',item.id,'--name',item.name]);}catch(e){const got=await api.cli('+table-get',['--table-id',item.id]);if(got.table?.name!==item.name)throw e;}
  done.push({id:item.id,name:item.name});await save(dir+'/country-table-progress.json',done);
  console.log(JSON.stringify({done:done.length,id:item.id}));
 }
 const tables=[];for(let offset=0;;){const p=await api.cli('+table-list',['--limit','50','--offset',String(offset)]);tables.push(...p.tables);if(!p.has_more&&tables.length>=p.total)break;assert(p.tables.length);offset+=p.tables.length;}
 assert.equal(tables.length,113);assert(labels.items.filter(e=>e.kind==='table').every(e=>tables.some(t=>t.id===e.id&&t.name===e.name)));
 await save(dir+'/country-table-verified.json',{at:new Date().toISOString(),tables});console.log('All 113 names verified');
}else if(mode==='commit'){
 const labels=await read(file),proof=await read(dir+'/country-directory-ui-proof.json');
 assert.equal(proof.rows.length,145);assert(labels.items.every(e=>proof.rows.some(r=>r.id===e.id&&r.name===e.name&&r.parent===e.parent)));
 await fs.writeFile(dir+'/directory-before-country-labels.json',JSON.stringify(plan,null,2),{flag:'wx'}).catch(e=>{if(e.code!=='EEXIST')throw e;});
 const mapping=new Map(labels.items.map(e=>[e.id,e])),rename=Object.fromEntries(labels.changes.filter(e=>e.kind==='table').map(e=>[e.oldName,e.name]));
 for(const e of [...plan.folders,...plan.tables,...plan.documents])e.name=mapping.get(e.id).name;
 plan.at=new Date().toISOString();await save(planFile,plan);
 const ledger=await read(dir+'/migration-ledger.json');
 const rewrite=s=>typeof s==='string'?short(s.replace(/\[([^\[\]]+)\]/g,(match,name)=>rename[name]?'['+rename[name]+']':match)):s;
 for(const project of Object.values(ledger.projects))for(const m of Object.values(project)){m.name=mapping.get(m.id).name;for(const calc of Object.values(m.computed||{})){if(calc.expression)calc.expression=rewrite(calc.expression);if(calc.from&&rename[calc.from])calc.from=rename[calc.from];}}
 await save(dir+'/migration-ledger.json',ledger);
 // Current verification inputs follow the live names; the prior snapshot remains above.
 const coded=await read(dir+'/directory-code-plan.json');for(const e of coded.items)e.name=mapping.get(e.id).name;await save(dir+'/directory-code-plan.json',coded);
 await save(dir+'/directory-codes-ui-proof.json',proof);
 await save(dir+'/table-codes-verified.json',await read(dir+'/country-table-verified.json'));
 console.log('Current directory and computed references updated');
}else throw Error('Choose plan, tables, commit');
