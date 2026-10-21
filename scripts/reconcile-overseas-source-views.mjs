import fs from 'node:fs/promises';
import path from 'node:path';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {buildFullSourcePlan,fullSourceRows} from './overseas-source-data.mjs';
import {mappedView,dataGaps} from './overseas-source-views.mjs';
const root=path.resolve('.'),dir=path.join(root,'reports/base-reorganize-20261018');
const run=promisify(execFile),sourceBase='J6UobGBjBa27irsD6L1cRyxsnoU',targetBase='CID8b8V7CaCtKesWGFKcHTdqnlc';
const load=async name=>JSON.parse(await fs.readFile(path.join(dir,name),'utf8'));
const original=await load('full-source.json'),live=await load('source-target-live-data.json');
const source={...original,tables:original.tables.map(t=>({...t,rows:live.source[t.id]}))};
const configs=await load('source-all-view-configs.json'),state=await load('full-import-progress.json');
const groups=buildFullSourcePlan(source),selected=process.argv.find(a=>a.startsWith('--groups='))?.slice(9).split(',');
const ledgerFile=path.join(dir,'source-view-reconciliation.json');
let ledger;try{ledger=await load('source-view-reconciliation.json')}catch(e){if(e.code!=='ENOENT')throw e;ledger={views:{},defaults:{}}}
const save=()=>fs.writeFile(ledgerFile,JSON.stringify(ledger,null,2));
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
const filterConditions=value=>(value||[]).map(([f,op,v])=>v===null||v===undefined?[f,op]:[f,op,v]);
async function cli(base,cmd,args=[],retried=false){
  let stdout;try{({stdout}=await run(process.execPath,[path.join(root,'vendor/lark-cli/run.cjs'),'base',cmd,'--base-token',base,...args,'--as','bot','--jq','.'],{cwd:root,windowsHide:true,maxBuffer:30e6,timeout:60000}))}catch(e){stdout=e.stdout||e.stderr}
  let result;try{result=JSON.parse(stdout)}catch{throw Error(`${cmd}: non-JSON response`)}
  if(!result.ok){
    if(!retried&&/get|list/.test(cmd)&&/dial tcp|timeout|connectex/.test(result.error?.message||''))return cli(base,cmd,args,true);
    if(!retried&&result.error?.code===800004135){console.log('视图接口限流，等待45秒后继续');await new Promise(r=>setTimeout(r,45000));return cli(base,cmd,args,true)}
    throw Error(`${cmd}: ${JSON.stringify(result.error)}`);
  }
  return result.data;
}
async function write(cmd,table,payload,args=[]){
  const file=path.join(dir,'source-view-payload.json');await fs.writeFile(file,JSON.stringify(payload));
  return cli(targetBase,cmd,['--table-id',table,...args,'--json','@'+path.relative(root,file)]);
}
async function readRows(base,table,view,projection){
  let rows=[],offset=0;
  for(;;){const d=await cli(base,'+record-list',['--table-id',table,...(view?['--view-id',view]:[]),...(projection?['--field-id',projection]:[]),'--limit','200','--offset',String(offset)]);
    rows.push(...d.data.map((v,i)=>({id:d.record_id_list[i],cells:Object.fromEntries(d.fields.map((f,j)=>[f,v[j]]))})));
    if(!d.has_more)return rows;if(!d.data.length)throw Error('pagination stalled');offset+=d.data.length;
  }
}
const gaps=groups.map(g=>dataGaps(g,fullSourceRows(g),live.target[state.tables[g.key]]));
if(gaps.some(g=>g.issues.length))throw Error('Resolve live-data-gap-audit before changing presentation');
const configFor=id=>configs.tables.find(t=>t.id===id);
for(const group of [...groups].sort((a,b)=>(a.key==='exams'?-1:b.key==='exams'?1:0))){
  if(selected&&!selected.includes(group.key))continue;
  const table=state.tables[group.key],fields=(await cli(targetBase,'+field-list',['--table-id',table])).fields;
  const byName=new Map(fields.map(f=>[f.name,f.id])),nameFor=id=>fields.find(f=>f.id===id)?.name||id;
  const field=name=>{if(!byName.has(name))throw Error(`target field missing ${name}`);return byName.get(name)};
  let views=(await cli(targetBase,'+view-list',['--table-id',table])).views;
  const firstSource=group.sources[0],firstConfig=configFor(firstSource.id).views.find(v=>v.type!=='form');
  const defaultGroup=mappedView(group,firstSource,firstConfig,0).group;
  // Preserve project/focus filters, but remove the old two-level truncation from their grouping.
  for(const view of views){
    if(!['All Source Data（全部源数据）','Thailand Project（泰国项目）','Malaysia Project（马来项目）','Unassigned（待选项目）','Initial Checks（首次检查）','Pre-Service Training（开服前培训）'].includes(view.name))continue;
    const current=(await cli(targetBase,'+view-get-group',['--table-id',table,'--view-id',view.id])).group;
    if(!same(current,defaultGroup))await write('+view-set-group',table,{group_config:defaultGroup.map(g=>({...g,field:field(g.field)}))},['--view-id',view.id]);
    ledger.defaults[table+':'+view.id]={name:view.name,group:defaultGroup};await save();
  }
  for(const [sourceIndex,sourceTable] of group.sources.entries()){
    for(const [viewIndex,sourceView] of configFor(sourceTable.id).views.entries()){
      if(sourceView.type==='form')continue;
      const definition=mappedView(group,sourceTable,sourceView,group.sources.length>1?sourceIndex:viewIndex);
      const key=sourceTable.id+':'+sourceView.id;
      if(definition.type==='gantt'&&!definition.timebar){
        const d=await cli(sourceBase,'+view-get-timebar',['--table-id',sourceTable.id,'--view-id',sourceView.id]);
        definition.timebar=Object.fromEntries(Object.entries(d.timebar).map(([k,id])=>[k,group.mappings.find(m=>m.table===sourceTable.id&&m.sourceName===sourceTable.fields.find(f=>f.id===id)?.name)?.targetName]));
        if(Object.values(definition.timebar).some(n=>!n))throw Error('unmapped gantt field');
      }
      let entry=ledger.views[key],view=views.find(v=>v.id===entry?.targetView)||views.find(v=>v.name===definition.name);
      if(!view&&definition.reuseOverview)view=views.find(v=>v.name==='All Source Data（全部源数据）');
      if(!view){const d=await write('+view-create',table,{name:definition.name,type:definition.type});view=d.views?.[0]||d.view;if(!view?.id)throw Error('created view has no ID');views.push(view)}
      if(view.type!==definition.type)throw Error('existing view type mismatch');
      if(view.name!==definition.name){await cli(targetBase,'+view-rename',['--table-id',table,'--view-id',view.id,'--name',definition.name]);view.name=definition.name}
      entry||={targetTable:table,targetView:view.id,steps:{}};
      entry.definition=definition;ledger.views[key]=entry;await save();
      const steps={
        filter:['+view-set-filter',{...definition.filter,conditions:definition.filter.conditions.map(([f,...rest])=>[field(f),...rest])}],
        group:['+view-set-group',{group_config:definition.group.map(g=>({...g,field:field(g.field)}))}],
        sort:['+view-set-sort',{sort_config:definition.sort.map(s=>({...s,field:field(s.field)}))}],
        visible:['+view-set-visible-fields',{visible_fields:definition.visible.map(field)}],
        ...(definition.timebar?{timebar:['+view-set-timebar',Object.fromEntries(Object.entries(definition.timebar).map(([k,v])=>[k,field(v)]))]}:{}),
      };
      for(const [step,[cmd,payload]] of Object.entries(steps)){
        if(entry.steps[step]&&same(entry.steps[step],payload))continue;
        await write(cmd,table,payload,['--view-id',view.id]);entry.steps[step]=payload;await save();
      }
      const args=['--table-id',table,'--view-id',view.id];
      const [vf,vg,vs,vv]=await Promise.all(['+view-get-filter','+view-get-group','+view-get-sort','+view-get-visible-fields'].map(cmd=>cli(targetBase,cmd,args)));
      if(!same(filterConditions(vf.filter?.conditions),definition.filter.conditions)||vf.filter?.logic!==definition.filter.logic||!same(vg.group,definition.group)||!same(vs.sort,definition.sort)||!same(vv.visible_fields,definition.visible))throw Error(`view configuration mismatch ${definition.name}`);
      if(definition.timebar){const actual=(await cli(targetBase,'+view-get-timebar',args)).timebar;if(!same(Object.fromEntries(Object.entries(actual).map(([k,id])=>[k,nameFor(id)])),definition.timebar))throw Error('gantt timebar mismatch')}
      // Compare actual cloud-filtered record identities, not just counts or a local filter approximation.
      const sourceRows=await readRows(sourceBase,sourceTable.id,sourceView.id,sourceTable.table.primary_field),targetRows=await readRows(targetBase,table,view.id,'Source Record Key（源记录标识）');
      const want=sourceRows.map(r=>sourceTable.id+':'+r.id),got=targetRows.map(r=>r.cells['Source Record Key（源记录标识）']);
      if(!same([...want].sort(),[...got].sort()))throw Error(`view record set mismatch ${definition.name}: ${want.length}/${got.length}`);
      entry.proof={at:new Date().toISOString(),records:want.length,recordSetMatches:true,recordOrderMatches:same(want,got),configurationMatches:true};await save();
      console.log(`${group.key}: ${definition.name}，${want.length}条，${definition.group.length}层分组`);
    }
  }
}
ledger.at=new Date().toISOString();ledger.dataAudit={records:gaps.reduce((n,g)=>n+g.rows,0),cellsChecked:gaps.reduce((n,g)=>n+g.checked,0),issues:0};
ledger.answers={total:live.source.tbluTxi1VlQJSOKE.length,sourcePopulated:live.source.tbluTxi1VlQJSOKE.filter(r=>r.cells['正确选项']).length,targetPopulated:live.target.tblu6ZzrsVaBuIcI.filter(r=>r.cells['Correct Answer（正确选项）']).length};
await save();console.log(JSON.stringify({sourceViews:Object.keys(ledger.views).length,...ledger.dataAudit,answers:ledger.answers}));
