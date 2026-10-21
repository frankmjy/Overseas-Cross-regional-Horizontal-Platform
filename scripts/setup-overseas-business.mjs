import fs from 'node:fs/promises';import path from 'node:path';import {execFile} from 'node:child_process';import {promisify} from 'node:util';
import {buildBusinessPlan,curateLessons,projectNames,lessonTypes} from './overseas-business-data.mjs';
import {normalizedCell} from './overseas-source-views.mjs';
const root=path.resolve('.'),dir=path.join(root,'reports/overseas-directory-20261018'),base='CID8b8V7CaCtKesWGFKcHTdqnlc',exec=promisify(execFile);
const source=JSON.parse(await fs.readFile(path.join(root,'reports/base-reorganize-20261018/full-source.json'),'utf8'));
const plans=[...buildBusinessPlan(source),curateLessons(source)],ledgerFile=path.join(dir,'business-progress.json');
await fs.writeFile(path.join(dir,'business-plan.json'),JSON.stringify(plans,null,2));
let ledger;try{ledger=JSON.parse(await fs.readFile(ledgerFile,'utf8'))}catch(e){if(e.code!=='ENOENT')throw e;ledger={tables:{},views:{},verified:{}}}
const save=()=>fs.writeFile(ledgerFile,JSON.stringify(ledger,null,2));
async function cli(cmd,args=[],retried=false){let stdout;try{({stdout}=await exec(process.execPath,[path.join(root,'vendor/lark-cli/run.cjs'),'base',cmd,'--base-token',base,...args,'--as','bot','--jq','.'],{cwd:root,windowsHide:true,maxBuffer:35e6,timeout:60000}))}catch(e){stdout=e.stdout||e.stderr}let d;try{d=JSON.parse(stdout)}catch{throw Error(cmd+': non-JSON response')}
  if(!d.ok){if(!retried&&/get|list/.test(cmd)&&/timeout|dial tcp|wsarecv|forcibly closed|connectex/.test(d.error?.message||''))return cli(cmd,args,true);if(!retried&&d.error?.code===800004135){console.log('视图限流，等待45秒');await new Promise(r=>setTimeout(r,45000));return cli(cmd,args,true)}throw Error(cmd+': '+JSON.stringify(d.error))}return d.data;}
async function write(cmd,id,payload,args=[]){const f=path.join(dir,'business-payload.json');await fs.writeFile(f,JSON.stringify(payload));return cli(cmd,['--table-id',id,...args,'--json','@'+path.relative(root,f)])}
async function rows(id){let result=[],offset=0;for(;;){const d=await cli('+record-list',['--table-id',id,'--limit','200','--offset',String(offset)]);result.push(...d.data.map((v,i)=>({id:d.record_id_list[i],cells:Object.fromEntries(d.fields.map((f,j)=>[f,v[j]]))})));if(!d.has_more)return result;if(!d.data.length)throw Error('pagination stalled');offset+=d.data.length}}
const key='Setup Key（初始化标识）';
for(const p of plans){
  if(ledger.verified[p.key]){console.log('已验证，保留 '+p.name);continue}
  const tables=(await cli('+table-list')).tables;
  let id=ledger.tables[p.key]||tables.find(t=>t.name===p.name)?.id;
  if(!id){const d=await cli('+table-create',['--name',p.name,'--fields',JSON.stringify(p.fields)]);id=d.table?.id;if(!id)throw Error('table response missing ID')}
  if(tables.some(t=>t.id===id)&&!ledger.tables[p.key])throw Error('unowned table with requested name; do not overwrite '+p.name);
  ledger.tables[p.key]=id;await save();
  const actualFields=(await cli('+field-list',['--table-id',id])).fields,map=new Map(actualFields.map(f=>[f.name,f]));
  for(const f of p.fields)if(map.get(f.name)?.type!==f.type)throw Error('field type mismatch '+p.name+' '+f.name);
  let actual=await rows(id),known=new Set(actual.map(r=>r.cells[key]));
  if(known.size!==actual.length)throw Error('duplicate setup keys');
  const missing=p.rows.filter(r=>!known.has(r[key])),writable=p.fields.filter(f=>f.type!=='attachment');
  for(let i=0;i<missing.length;i+=150)await write('+record-batch-create',id,{fields:writable.map(f=>map.get(f.name).id),rows:missing.slice(i,i+150).map(r=>writable.map(f=>r[f.name]??null))});
  actual=await rows(id);const index=new Map(actual.map(r=>[r.cells[key],r]));
  if(actual.length!==p.rows.length||index.size!==p.rows.length)throw Error('business record set mismatch');
  for(const r of p.rows)for(const f of writable){if(JSON.stringify(normalizedCell(r[f.name],f))!==JSON.stringify(normalizedCell(index.get(r[key])?.cells[f.name],f)))throw Error('business value mismatch '+p.name+' '+f.name)}
  let views=(await cli('+view-list',['--table-id',id])).views;
  const defs=p.key==='operations-lessons'?[{name:'Overview（经验总览）',filter:[]},...lessonTypes.map(name=>({name,filter:[['Lesson Type（经验类别）','==',[name]]]}))]:[{name:'Overview（总览）',filter:[]},...projectNames.map(name=>({name,filter:[['Project（项目）','==',[name]]]})),{name:'Examples（填写示例）',filter:[['Example（示例）','==',true]]}];
  for(const [i,d] of defs.entries()){
    let v=views.find(v=>v.name===d.name);
    if(!v&&i===0&&views.length===1&&views[0].name==='表格'){v=views[0];await cli('+view-rename',['--table-id',id,'--view-id',v.id,'--name',d.name]);v.name=d.name}
    if(!v){const created=await write('+view-create',id,{name:d.name,type:'grid'});v=created.views?.[0]||created.view;if(!v?.id)throw Error('view response missing ID');views.push(v)}
    const checkpoint=id+':'+v.id;
    if(!ledger.views[checkpoint]){
      await write('+view-set-filter',id,{logic:'and',conditions:d.filter.map(([n,...rest])=>[map.get(n).id,...rest])},['--view-id',v.id]);
      const grouped=p.key==='operations-lessons'?['Lesson Type（经验类别）','Discipline（专业）']:['Project（项目）',map.has('Category（分类）')?'Category（分类）':map.has('Site Progress（现场工作进度）')?'Site Progress（现场工作进度）':null].filter(Boolean);
      await write('+view-set-group',id,{group_config:grouped.map(n=>({field:map.get(n).id,desc:false}))},['--view-id',v.id]);
      const visible=p.fields.map(f=>f.name).filter(n=>n!==key);if(map.has('Example（示例）')){visible.splice(visible.indexOf('Example（示例）'),1);visible.splice(2,0,'Example（示例）')}
      await write('+view-set-visible-fields',id,{visible_fields:visible.map(n=>map.get(n).id)},['--view-id',v.id]);
      ledger.views[checkpoint]={name:d.name,filter:d.filter,group:grouped,visible};await save();
    }
    const args=['--table-id',id,'--view-id',v.id];const [filter,visible,group]=await Promise.all(['+view-get-filter','+view-get-visible-fields','+view-get-group'].map(cmd=>cli(cmd,args)));
    const proof=ledger.views[checkpoint];if(JSON.stringify(filter.filter.conditions)!==JSON.stringify(proof.filter)||JSON.stringify(visible.visible_fields)!==JSON.stringify(proof.visible)||JSON.stringify(group.group.map(g=>g.field))!==JSON.stringify(proof.group))throw Error('business view differs '+p.name+' '+d.name);
  }
  ledger.verified[p.key]={id,name:p.name,parent:p.parent,role:p.role,rows:actual.length,views:defs.length,sourceCandidates:p.candidates||null};await save();console.log(`${p.name}: ${actual.length}条，${defs.length}个视图，回读通过`);
}
console.log(JSON.stringify({tables:Object.keys(ledger.verified).length,rows:Object.values(ledger.verified).reduce((n,t)=>n+t.rows,0)}));
