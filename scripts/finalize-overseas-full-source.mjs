import fs from 'node:fs/promises';import path from 'node:path';import {execFile} from 'node:child_process';import {promisify} from 'node:util';
import {buildFullSourcePlan,fullSourceRows,projects} from './overseas-source-data.mjs';
const root=path.resolve('.'),dir=path.join(root,'reports/base-reorganize-20261018'),exec=promisify(execFile),base='CID8b8V7CaCtKesWGFKcHTdqnlc';
try{await fs.access(path.join(dir,'source-view-reconciliation.json'));throw Error('Source-specific views are now reconciled. Use reconcile-overseas-source-views.mjs; the previous generic layout would overwrite them.')}catch(e){if(e.code!=='ENOENT')throw e}
const source=JSON.parse(await fs.readFile(path.join(dir,'full-source.json'),'utf8')),before=JSON.parse(await fs.readFile(path.join(dir,'before.json'),'utf8'));
const plan=buildFullSourcePlan(source),state=JSON.parse(await fs.readFile(path.join(dir,'full-import-progress.json'),'utf8'));
if(plan.some(g=>!state.verified[g.key]))throw Error('all source data must pass readback before final layout');
const ledgerFile=path.join(dir,'full-layout-progress.json');let ledger;try{ledger=JSON.parse(await fs.readFile(ledgerFile,'utf8'))}catch(e){if(e.code!=='ENOENT')throw e;ledger={views:{},fields:{},core:{}}}
const save=()=>fs.writeFile(ledgerFile,JSON.stringify(ledger,null,2));
async function cli(cmd,args=[],again=false){let stdout;try{({stdout}=await exec(process.execPath,[path.join(root,'vendor/lark-cli/run.cjs'),'base',cmd,'--base-token',base,...args,'--as','bot','--jq','.'],{cwd:root,windowsHide:true,maxBuffer:30e6,timeout:60000}))}catch(e){stdout=e.stdout||e.stderr}let d;try{d=JSON.parse(stdout)}catch{throw Error(`${cmd}: invalid response`)}if(!d.ok){if(!again&&/get|list/.test(cmd)&&/dial tcp|timeout|connectex/.test(d.error?.message||''))return cli(cmd,args,true);if(d.error?.code===800004135){console.log('视图接口限流，等待45秒');await new Promise(r=>setTimeout(r,45000));return cli(cmd,args,true)}throw Error(`${cmd}: ${d.error?.code||d.error?.type||'failed'}`)}return d.data}
async function write(cmd,id,payload,args=[]){const f=path.join(dir,'layout-payload.json');await fs.writeFile(f,JSON.stringify(payload));return cli(cmd,['--table-id',id,...args,'--json','@'+path.relative(root,f)])}
async function read(id){let all=[],offset=0;for(;;){const d=await cli('+record-list',['--table-id',id,'--limit','200','--offset',String(offset)]);all.push(...d.data.map((v,i)=>({id:d.record_id_list[i],cells:Object.fromEntries(d.fields.map((f,j)=>[f,v[j]]))})));if(!d.has_more)return all;if(!d.data.length)throw Error('pagination stalled');offset+=d.data.length}}
const same=(a,b)=>JSON.stringify(a??null)===JSON.stringify(b??null);
function semantic(v,f){if(v===undefined||v===null||v==='')return null;if(f.type==='select')return (Array.isArray(v)?v:[v]).sort();if(['user','group_chat'].includes(f.type))return v.map(x=>x.id).sort();if(f.type==='datetime')return Date.parse(v.includes('T')?v:v.replace(' ','T')+'+08:00');if(f.style?.type==='url'&&typeof v==='string')return /^\[.*\]\((.*)\)$/.exec(v)?.[1]||v;return v}
const summary=[];
for(const g of plan){
  const id=state.tables[g.key],fields=(await cli('+field-list',['--table-id',id])).fields,map=new Map(fields.map(f=>[f.name,f]));
  for(const f of g.fields){const a=map.get(f.name);if(!a||a.type!==f.type||f.style&&!same(a.style,f.style)||f.multiple!==undefined&&a.multiple!==f.multiple)throw Error(`source field format differs ${g.key} ${f.name}`);if(f.type==='select'){if(!same(a.options.map(o=>o.name),f.options.map(o=>o.name))||f.options.some((o,i)=>o.hue&&a.options[i]?.hue!==o.hue||o.lightness&&a.options[i]?.lightness!==o.lightness))throw Error(`source option colors differ ${g.key} ${f.name}`)}}
  const filesField=map.get('Source Files（源附件清单）');
  if(!ledger.fields[id]){const def={name:filesField.name,type:'text',style:filesField.style||{type:'plain'},description:g.fields.find(f=>f.name===filesField.name).description};await write('+field-update',id,def,['--field-id',filesField.id,'--yes']);ledger.fields[id]=true;await save()}
  const hasFiles=g.sources.some(t=>t.rows.some(r=>t.fields.some(f=>f.type==='attachment'&&r.cells[f.name]?.length)));
  const hidden=new Set(['Original Source ID（原始来源标识）','Source Record Key（源记录标识）','Source Identities（源身份标识）','Filter Helper（筛选辅助）','Original Field 1（源字段1）','Original Field 2（源字段2）']);
  let columns=[];
  for(const name of g.visible){if(hidden.has(name)||/^Legacy /.test(name)||name==='Applicable Project（适用项目）'||name==='Source Table（来源表）'||name==='Source Record（原记录链接）'||name==='Source Files（源附件清单）')continue;
    if(map.get(name).type==='attachment'){if(hasFiles&&!columns.includes('Source Files（源附件清单）'))columns.push('Source Files（源附件清单）');continue}columns.push(name)}
  if(hasFiles&&!columns.includes('Source Files（源附件清单）'))columns.push('Source Files（源附件清单）');
  columns.push('Applicable Project（适用项目）','Source Table（来源表）','Source Record（原记录链接）');
  let views=(await cli('+view-list',['--table-id',id])).views;
  const focus=g.key==='initialization'?{name:'Initial Checks（首次检查）',conditions:[['Frequency（频次）','intersects',['初次']],['Category（分类）','intersects',['检查类']]],count:g.sources.flatMap(t=>t.rows).filter(r=>r.cells.频次?.includes('初次')&&r.cells.分类?.includes('检查类')).length}:g.key==='training'?{name:'Pre-Service Training（开服前培训）',conditions:[['Milestone（时间节点）','intersects',['开服前']]],count:g.sources.flatMap(t=>t.rows).filter(r=>r.cells.时间节点?.includes('开服前')).length}:null;
  if(focus){let v=views.find(v=>v.name===focus.name);if(!v){const d=await write('+view-create',id,{name:focus.name,type:'grid'});v=d.views?.[0]||d.view;if(!v?.id)throw Error('focus view response missing ID');views.push(v)}await write('+view-set-filter',id,{logic:'and',conditions:focus.conditions.map(([name,op,value])=>[map.get(name).id,op,value])},['--view-id',v.id]);let count=0,offset=0;for(;;){const d=await cli('+record-list',['--table-id',id,'--view-id',v.id,'--field-id','Source Record Key（源记录标识）','--offset',String(offset),'--limit','200']);count+=d.data.length;if(!d.has_more)break;offset+=d.data.length}if(count!==focus.count)throw Error('focus view record count mismatch');ledger.focus||={};ledger.focus[g.key]={name:focus.name,id:v.id,count};await save()}
  for(const v of views){
    const key=id+':'+v.id;
    const visible=v.name==='Unassigned（待选项目）'?[columns[0],'Applicable Project（适用项目）',...columns.slice(1).filter(n=>n!=='Applicable Project（适用项目）')]:projects.includes(v.name)?columns.filter(n=>n!=='Applicable Project（适用项目）'):columns;
    if(!ledger.views[key]){await write('+view-set-visible-fields',id,{visible_fields:visible.map(n=>map.get(n).id)},['--view-id',v.id]);ledger.views[key]={table:id,name:v.name,visible};await save()}
    const proof=await cli('+view-get-visible-fields',['--table-id',id,'--view-id',v.id]);if(!same(proof.visible_fields,visible))throw Error('final view layout differs from intended columns');
    if(projects.includes(v.name)){const d=await cli('+record-list',['--table-id',id,'--view-id',v.id,'--field-id','Source Record Key（源记录标识）','--limit','1']);if(d.data.length)throw Error('historical data was assigned to an overseas project without screening')}
  }
  const actual=await read(id),expected=fullSourceRows(g),index=new Map(actual.map(r=>[r.cells['Source Record Key（源记录标识）'],r]));
  if(actual.length!==expected.length||index.size!==expected.length)throw Error('final source record count differs');
  let cells=0;
  for(const row of expected){const r=index.get(row['Source Record Key（源记录标识）']);if(!r)throw Error('missing source record');for(const f of g.fields){if(f.type==='attachment')continue;cells++;if(!same(semantic(r.cells[f.name],f),semantic(row[f.name],f)))throw Error(`source value differs ${g.key} ${f.name}`)}}
  summary.push({key:g.key,name:g.name,table:id,sourceTables:g.sources.length,rows:actual.length,cellsChecked:cells,views:views.length,emptyProjectViews:2,attachments:'source links only'});
  console.log(`全量验收 ${g.name}: ${actual.length} 条，${cells} 个单元格，${views.length} 个视图`);
}
// Original research, meetings, knowledge index and project register are preserved byte-for-byte as cell values.
const core=before.tables.filter(t=>!t.rows.some(r=>r.cells['Import Key（导入键）']?.includes(':'))||t.name==='Project Register（项目台账）');
for(const t of core){if(ledger.core[t.id])continue;const actual=await read(t.id),index=new Map(actual.map(r=>[r.id,r]));if(index.size!==t.rows.length)throw Error(`original row set changed ${t.name}`);for(const row of t.rows)for(const [name,v] of Object.entries(row.cells))if(!same(v,index.get(row.id)?.cells[name]))throw Error(`original data changed ${t.name} ${name}`);ledger.core[t.id]={name:t.name,rows:actual.length};await save()}
const manifest=JSON.parse(await fs.readFile(path.join(dir,'attachment-manifest.json'),'utf8'));
const result={at:new Date().toISOString(),sourceTables:source.tables.length,tables:summary.length,records:summary.reduce((n,t)=>n+t.rows,0),cellsChecked:summary.reduce((n,t)=>n+t.cellsChecked,0),views:summary.reduce((n,t)=>n+t.views,0),focusViews:ledger.focus,attachmentReferences:manifest.items.length,attachmentMode:manifest.policy.mode,corePreserved:Object.values(ledger.core),summary};
await fs.writeFile(path.join(dir,'full-final-audit.json'),JSON.stringify(result,null,2));console.log(JSON.stringify({...result,summary:undefined,corePreserved:result.corePreserved.length},null,2));
