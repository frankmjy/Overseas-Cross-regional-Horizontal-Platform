import fs from 'node:fs/promises';
import path from 'node:path';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {buildFullSourcePlan,fullSourceRows,projects} from './overseas-source-data.mjs';
const root=path.resolve('.'),dir=path.join(root,'reports/base-reorganize-20261018');
const source=JSON.parse(await fs.readFile(path.join(dir,'full-source.json'),'utf8'));
const base='CID8b8V7CaCtKesWGFKcHTdqnlc',plan=buildFullSourcePlan(source),exec=promisify(execFile);
const stateFile=path.join(dir,'full-import-progress.json');
let state;try{state=JSON.parse(await fs.readFile(stateFile,'utf8'))}catch(e){if(e.code!=='ENOENT')throw e;state={tables:{},rows:{},views:{},verified:{}}}
const save=()=>fs.writeFile(stateFile,JSON.stringify(state,null,2));
async function cli(cmd,args=[],again=false){let stdout;try{({stdout}=await exec(process.execPath,[path.join(root,'vendor/lark-cli/run.cjs'),'base',cmd,'--base-token',base,...args,'--as','bot','--jq','.'],{cwd:root,windowsHide:true,maxBuffer:30e6,timeout:60000}))}catch(e){stdout=e.stdout||e.stderr}
  let d;try{d=JSON.parse(stdout)}catch{throw Error(`${cmd}: invalid response, write not automatically retried`)}
  if(!d.ok){if(!again&&/get|list/.test(cmd)&&/dial tcp|connectex|timeout/i.test(d.error?.message||''))return cli(cmd,args,true);if(d.error?.code===800004135&&/SetVisibleFields limited/.test(d.error?.message||'')){console.log('视图接口限流，等待45秒');await new Promise(r=>setTimeout(r,45000));return cli(cmd,args,true)}throw Error(`${cmd}: ${d.error?.code||d.error?.type||'failed'}; ${/dial tcp|connectex|timeout/i.test(d.error?.message||'')?'network failure':''}`)}return d.data}
async function write(cmd,id,payload,args=[]){const file=path.join(dir,'full-import-payload.json');await fs.writeFile(file,JSON.stringify(payload));return cli(cmd,['--table-id',id,...args,'--json','@'+path.relative(root,file)])}
async function read(id){let out=[],offset=0;for(;;){const d=await cli('+record-list',['--table-id',id,'--limit','200','--offset',String(offset)]);out.push(...d.data.map((v,i)=>({id:d.record_id_list[i],cells:Object.fromEntries(d.fields.map((f,j)=>[f,v[j]]))})));if(!d.has_more)return out;if(!d.data.length)throw Error('pagination stalled');offset+=d.data.length}}
function normalized(v,def){if(v===null||v===undefined||v==='')return null;if(['user','group_chat'].includes(def.type))return v.map(x=>x.id).sort();if(def.type==='select')return (Array.isArray(v)?v:[v]).sort();if(def.type==='datetime')return Date.parse(v.includes('T')?v:v.replace(' ','T')+'+08:00');if(def.type==='text'&&def.style?.type==='url'&&typeof v==='string')return /^\[.*\]\((.*)\)$/.exec(v)?.[1]||v;return v}
await fs.writeFile(path.join(dir,'full-import-plan.json'),JSON.stringify(plan.map(g=>({...g,sources:g.sources.map(s=>({id:s.id,name:s.name,rows:s.rows.length}))})),null,2));
if(!process.argv.includes('--apply')){console.log(JSON.stringify(plan.map(g=>({name:g.name,sources:g.sources.length,rows:fullSourceRows(g).length,fields:g.fields.length})),null,2));process.exit(0)}
const remote=(await cli('+table-list')).tables;
async function importGroup(g){
  if(state.verified[g.key]){console.log(`复用全量核验 ${g.name}: ${state.verified[g.key].rows}`);return}
  console.log(`全量迁移 ${g.name}`);
  let table=remote.find(t=>t.id===state.tables[g.key])||remote.find(t=>t.name===g.name);
  if(!table){const d=await cli('+table-create',['--name',g.name,'--fields',JSON.stringify(g.fields)]);table=d.table;if(!table?.id)throw Error('table creation result missing ID');remote.push(table)}
  state.tables[g.key]=table.id;await save();
  const actualFields=(await cli('+field-list',['--table-id',table.id])).fields,names=new Map(actualFields.map(f=>[f.name,f]));
  for(const f of g.fields){
    let a=names.get(f.name);
    if(!a){const d=await write('+field-create',table.id,f);a=d.field;actualFields.push(a);names.set(a.name,a)}
    if(a.type==='group_chat'&&f.type==='text'){
      const current=await read(table.id);if(current.some(r=>r.cells[a.name]?.length))throw Error('nonempty group field cannot be converted');
      await cli('+field-get',['--table-id',table.id,'--field-id',a.id]);
      const d=await write('+field-update',table.id,f,['--field-id',a.id,'--yes']);names.set(f.name,d.field);
    }
    if(names.get(f.name)?.type!==f.type)throw Error(`schema mismatch ${g.name} ${f.name}`);
  }
  const expected=fullSourceRows(g),current=await read(table.id),byKey=new Map();
  for(const r of current){const k=r.cells['Source Record Key（源记录标识）'];if(!k)throw Error('untracked row in import table');if(byKey.has(k))throw Error('duplicate source key');byKey.set(k,r)}
  const missing=expected.filter(r=>!byKey.has(r['Source Record Key（源记录标识）']));
  const writable=g.fields.filter(f=>f.type!=='attachment');
  const recovered=new Map();
  const snapshotNames=new Set(['Source Identities（源身份标识）',...g.mappings.filter(m=>m.sourceType==='group_chat').map(m=>m.targetName)]);
  for(const row of expected){const existing=byKey.get(row['Source Record Key（源记录标识）']);if(!existing)continue;const patch={};for(const name of snapshotNames)if((existing.cells[name]===null||existing.cells[name]===undefined)&&row[name]!=null)patch[names.get(name).id]=row[name];if(Object.keys(patch).length){const key=JSON.stringify(patch);if(!recovered.has(key))recovered.set(key,{patch,ids:[]});recovered.get(key).ids.push(existing.id)}}
  for(const {patch,ids} of recovered.values())await write('+record-batch-update',table.id,{record_id_list:ids,patch});
  for(let i=0;i<missing.length;i+=150){const batch=missing.slice(i,i+150),d=await write('+record-batch-create',table.id,{fields:writable.map(f=>names.get(f.name).id),rows:batch.map(r=>writable.map(f=>r[f.name]??null))});if(d.ignored_fields?.length||d.record_id_list?.length!==batch.length)throw Error('incomplete batch create, re-read by source key before resume');await save();console.log(`  记录 ${Math.min(i+150,missing.length)}/${missing.length}`)}
  const after=await read(table.id);if(after.length!==expected.length)throw Error('full row count mismatch');
  for(const expectedRow of expected){const k=expectedRow['Source Record Key（源记录标识）'],matches=after.filter(r=>r.cells['Source Record Key（源记录标识）']===k);if(matches.length!==1)throw Error('source key not unique');state.rows[k]={table:table.id,record:matches[0].id,group:g.key};for(const f of writable){if(JSON.stringify(normalized(matches[0].cells[f.name],f))!==JSON.stringify(normalized(expectedRow[f.name],f)))throw Error(`value mismatch ${g.name} ${f.name} ${k}`)}}
  await save();
  let views=(await cli('+view-list',['--table-id',table.id])).views;
  let main=views.find(v=>v.name==='All Source Data（全部源数据）')||views.find(v=>v.name==='表格');
  if(main.name==='表格')await cli('+view-rename',['--table-id',table.id,'--view-id',main.id,'--name','All Source Data（全部源数据）']);
  for(const viewName of [...projects,'Unassigned（待选项目）']){
    let v=views.find(v=>v.name===viewName);if(!v){const d=await write('+view-create',table.id,{name:viewName,type:'grid'});v=d.views?.[0]||d.view;if(!v?.id)throw Error('view create missing ID');views.push(v)}
    const pfield=names.get('Applicable Project（适用项目）').id;
    await write('+view-set-filter',table.id,{logic:'and',conditions:[[pfield,viewName==='Unassigned（待选项目）'?'empty':'intersects',viewName==='Unassigned（待选项目）'?null:[viewName]]]},['--view-id',v.id]);
  }
  views=(await cli('+view-list',['--table-id',table.id])).views;
  const cnGroup=g.sources[0].presentation?.group?.group||[];
  const group=cnGroup.map(x=>({field:g.mappings.find(m=>m.table===g.sources[0].id&&m.sourceName===x.field)?.targetName,desc:x.desc})).filter(x=>x.field&&names.has(x.field)).slice(0,2);
  for(const v of views){
    const key=table.id+':'+v.id;if(state.views[key])continue;
    await write('+view-set-visible-fields',table.id,{visible_fields:g.visible.map(n=>names.get(n).id)},['--view-id',v.id]);
    if(group.length)await write('+view-set-group',table.id,{group_config:group.map(x=>({field:names.get(x.field).id,desc:x.desc}))},['--view-id',v.id]);
    state.views[key]={name:v.name};await save();
  }
  const verification={rows:expected.length,sourceTables:g.sources.map(s=>s.id),fields:g.fields.length,table:table.id,views:views.map(v=>({id:v.id,name:v.id===main.id?'All Source Data（全部源数据）':v.name}))};
  state.verified[g.key]=verification;await save();console.log(`全量核验通过 ${g.name}: ${expected.length} 条`);
}
for(const g of plan){
  for(let attempt=0;attempt<3;attempt++){
    try{await importGroup(g);break}catch(e){
      if(attempt===2||!/network failure|invalid response/.test(e.message))throw e;
      // Never replay an uncertain write: refresh tables, then importGroup reads row keys
      // and existing view names to recompute only what is still missing.
      const fresh=(await cli('+table-list')).tables;
      remote.splice(0,remote.length,...fresh);
      console.log(`网络恢复核对 ${g.name}：已刷新远端表，按源记录键与视图名称继续未完成项`);
    }
  }
}
console.log(`全量结构化记录已迁入：${Object.values(state.verified).reduce((n,v)=>n+v.rows,0)} 条。附件按用户最新确认暂时全部保留源链接。`);
