import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import {BaseAdapter} from '../research/adapter.mjs';
const dir='reports/source-references-20261018';
const planFile='reports/overseas-directory-20261018/directory-plan.json';
const plan=JSON.parse(await fs.readFile(planFile,'utf8'));
const api=new BaseAdapter({baseToken:plan.base});
const mode=process.argv[2]||'plan';
const codeFile=dir+'/directory-code-plan.json';
if(mode==='plan'){
 const actual=JSON.parse(await fs.readFile(dir+'/directory-before-codes.json','utf8'));
 const objects=new Map([...plan.folders.map(e=>[e.id,{...e,kind:'folder'}]),...plan.tables.map(e=>[e.id,{...e,kind:'table'}]),...plan.documents.map(e=>[e.id,{...e,kind:'docx'}])]);
 assert.equal(actual.length,objects.size);assert.equal(actual.filter(e=>e.id.startsWith('tbl')).length,113);
 const counters=new Map(),codes=new Map(),items=[];
 for(const row of actual){const entry=objects.get(row.id);assert(entry,row.id);
  const parentId=entry.parent?plan.folders.find(f=>f.key===entry.parent)?.id:null;assert.equal(parentId,row.parent);
  let code;if(!row.parent)code=/^\d+/.exec(row.name)?.[0];else{assert(codes.has(row.parent));const n=(counters.get(row.parent)||0)+1;counters.set(row.parent,n);code=codes.get(row.parent)+'.'+String(n).padStart(2,'0');}
  assert(code);codes.set(row.id,code);
  const title=row.name.replace(/^\d+(?:\.\d+)*\s+/,'');items.push({id:row.id,key:entry.key,kind:entry.kind,parent:row.parent,level:row.level,oldName:row.name,code,name:code+' '+title});
 }
 assert.equal(new Set(items.map(e=>e.code)).size,items.length);
 await fs.writeFile(codeFile,JSON.stringify({at:new Date().toISOString(),base:plan.base,items},null,2));
 console.log(JSON.stringify({resources:items.length,tables:113,uniqueCodes:true,examples:items.filter(e=>['tblSpSvqS2FMpHks','tblZ3lzitcYRjxcd'].includes(e.id)).map(e=>e.name)}));
}else if(mode==='tables'){
 const codePlan=JSON.parse(await fs.readFile(codeFile,'utf8'));
 let completed=[];try{completed=JSON.parse(await fs.readFile(dir+'/table-code-progress.json','utf8'));}catch(e){if(e.code!=='ENOENT')throw e;}
 for(const item of codePlan.items.filter(e=>e.kind==='table')){
  if(completed.some(e=>e.id===item.id&&e.name===item.name))continue;
  try{await api.cli('+table-update',['--table-id',item.id,'--name',item.name]);}catch(e){const got=await api.cli('+table-get',['--table-id',item.id]);if((got.table?.name||got.name)!==item.name)throw e;}
  completed.push({id:item.id,name:item.name,at:new Date().toISOString()});await fs.writeFile(dir+'/table-code-progress.json',JSON.stringify(completed,null,2));console.log(JSON.stringify({completed:completed.length,total:113,id:item.id}));
 }
 const all=[];for(let offset=0;;){const page=await api.cli('+table-list',['--limit','50','--offset',String(offset)]);all.push(...page.tables);if(!page.has_more&&all.length>=page.total)break;assert(page.tables.length);offset+=page.tables.length;}
 assert.equal(all.length,113);assert(codePlan.items.filter(e=>e.kind==='table').every(e=>all.some(t=>t.id===e.id&&t.name===e.name)));
 await fs.writeFile(dir+'/table-codes-verified.json',JSON.stringify({at:new Date().toISOString(),count:113,tables:all},null,2));console.log('All 113 table names verified');
}else if(mode==='commit'){
 const codePlan=JSON.parse(await fs.readFile(codeFile,'utf8'));
 const proof=JSON.parse(await fs.readFile(dir+'/directory-codes-ui-proof.json','utf8'));
 assert.equal(proof.rows.length,145);assert(codePlan.items.every(e=>proof.rows.some(r=>r.id===e.id&&r.name===e.name&&r.parent===e.parent)));
 const mapping=new Map(codePlan.items.map(e=>[e.id,e]));
 await fs.writeFile(dir+'/directory-plan-before-codes.json',JSON.stringify(plan,null,2),{flag:'wx'}).catch(e=>{if(e.code!=='EEXIST')throw e;});
 for(const entry of [...plan.folders,...plan.tables,...plan.documents]){const next=mapping.get(entry.id);assert(next);entry.name=next.name;entry.code=next.code;}
 plan.at=new Date().toISOString();await fs.writeFile(planFile,JSON.stringify(plan,null,2));
 const ledgerFile=dir+'/migration-ledger.json',ledger=JSON.parse(await fs.readFile(ledgerFile,'utf8'));
 const rename=Object.fromEntries(codePlan.items.filter(e=>e.kind==='table').map(e=>[e.oldName,e.name]));
 const rewrite=s=>typeof s==='string'?s.replace(/\[([^\[\]]+)\]/g,(match,name)=>rename[name]?'['+rename[name]+']':match):s;
 for(const project of Object.values(ledger.projects))for(const m of Object.values(project)){m.name=mapping.get(m.id).name;for(const calc of Object.values(m.computed||{})){if(calc.expression)calc.expression=rewrite(calc.expression);if(calc.from&&rename[calc.from])calc.from=rename[calc.from];}}
 await fs.writeFile(ledgerFile,JSON.stringify(ledger,null,2));console.log('Numbered directory and migration ledger committed');
}else throw Error('Choose plan, tables or commit');
