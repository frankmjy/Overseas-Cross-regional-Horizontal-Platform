import fs from 'node:fs/promises';
import path from 'node:path';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {businessTables,originalLayouts,meetingLayout,makeDefinition,sourceValue} from './overseas-base-layout.mjs';

const root=path.resolve('.'), report=path.join(root,'reports/base-reorganize-20261018');
let fullImportExists=false;try{await fs.access(path.join(report,'full-import-progress.json'));fullImportExists=true}catch(e){if(e.code!=='ENOENT')throw e}
if(fullImportExists&&process.argv.includes('--apply'))throw Error('旧草稿整理入口已停用；请使用 import-overseas-full-source.mjs 和 finalize-overseas-full-source.mjs。');
const before=JSON.parse(await fs.readFile(path.join(report,'before.json'),'utf8'));
const source=JSON.parse(await fs.readFile(path.join(report,'source.json'),'utf8'));
const generated=JSON.parse(await fs.readFile(path.join(root,'reports/base-enrichment-20261018/adaptation-plan.json'),'utf8'));
const exec=promisify(execFile), apply=process.argv.includes('--apply');
const progressFile=path.join(report,'progress.json');
let progress;try{progress=JSON.parse(await fs.readFile(progressFile,'utf8'))}catch(e){if(e.code!=='ENOENT')throw e;progress={fields:{},rows:{},views:{},tables:{},verified:{}}}
const save=()=>fs.writeFile(progressFile,JSON.stringify(progress,null,2));
const canonical=v=>Array.isArray(v)?v.map(canonical):v&&typeof v==='object'?Object.fromEntries(Object.keys(v).sort().map(k=>[k,canonical(v[k])])):v;
const same=(a,b)=>JSON.stringify(canonical(a??null))===JSON.stringify(canonical(b??null));
async function cli(cmd,args=[],retry=false){
  let stdout;try{({stdout}=await exec(process.execPath,[path.join(root,'vendor/lark-cli/run.cjs'),'base',cmd,'--base-token',before.base,...args,'--as','bot','--jq','.'],{cwd:root,windowsHide:true,timeout:60000,maxBuffer:25e6}))}catch(e){stdout=e.stdout||e.stderr}
  let d;try{d=JSON.parse(stdout)}catch{throw Error(`${cmd}: response invalid; no automatic write retry`)}
  if(!d.ok){
    if(!retry&&/dial tcp|timeout|connectex|network/i.test(d.error?.message||'')&&/get|list/.test(cmd))return cli(cmd,args,true);
    if(d.error?.code===800004135&&/SetVisibleFields limited/.test(d.error.message||'')){console.log('视图接口限流，等待45秒后继续当前配置。');await new Promise(r=>setTimeout(r,45000));return cli(cmd,args,true)}
    throw Error(`${cmd}: ${JSON.stringify(d.error)}`);
  }
  return d.data;
}
async function write(cmd,table,json,args=[]){
  const file=path.join(report,'current-payload.json');await fs.writeFile(file,JSON.stringify(json));
  return cli(cmd,['--table-id',table,...args,'--json','@'+path.relative(root,file)]);
}
async function rows(id){let out=[],offset=0;for(;;){const d=await cli('+record-list',['--table-id',id,'--offset',String(offset),'--limit','200']);out.push(...d.data.map((v,i)=>({id:d.record_id_list[i],cells:Object.fromEntries(d.fields.map((f,j)=>[f,v[j]]))})));if(!d.has_more)return out;if(!d.data.length)throw Error('pagination stalled');offset+=d.data.length}}
const normalize=(v,def)=>def.type==='select'?(Array.isArray(v)?v:v?[v]:[]).sort():v??null;
function generatedUnchanged(t,row,old){
  const expected=generated.tables.flatMap(t=>t.rows).find(r=>r['Import Key（导入键）']===row.cells['Import Key（导入键）']);
  return !row.cells[old]||expected&&same(row.cells[old],expected[old]);
}
const plan=before.tables.map(t=>{
  const spec=businessTables.find(s=>s.id===t.id);
  if(!spec)return {id:t.id,name:t.name,visible:originalLayouts[t.name]||(/Meetings/.test(t.name)?meetingLayout:[])};
  const src=source.tables.find(s=>s.name===spec.source);
  return {...spec,fields:spec.fields.map(mapping=>({mapping,definition:makeDefinition(src,mapping,t)}))};
});
await fs.writeFile(path.join(report,'layout-plan.json'),JSON.stringify(plan,null,2));
if(!apply){console.log(JSON.stringify(plan.map(t=>({name:t.title||t.name,fields:t.fields?.length||t.visible.length,group:t.group})),null,2));process.exit(0)}

for(const t of before.tables){
  if(t.views.every(v=>progress.views[t.id+':'+v.id])){console.log(`复用已验证结果 ${t.name}`);continue;}
  const spec=plan.find(s=>s.id===t.id);const src=spec.source&&source.tables.find(s=>s.name===spec.source);
  console.log(`开始 ${spec.title||t.name}`);
  let fields=(await cli('+field-list',['--table-id',t.id])).fields;
  const bindings={};
  if(src){
    for(const {mapping,definition} of spec.fields){
      const [cn,name,old]=mapping;
      let f=fields.find(f=>f.name===name)||fields.find(f=>f.name===old);
      const key=t.id+':'+cn;
      if(!progress.fields[key]){
        if(f){
          const original=t.fields.find(x=>x.id===f.id);
          if(!original)throw Error('newly discovered field requires review');
          const actual=(await cli('+field-get',['--table-id',t.id,'--field-id',f.id])).field;
          if(actual.name!==original.name&&actual.name!==name)throw Error('concurrent field rename detected');
          if(!same(Object.fromEntries(Object.keys(definition).map(k=>[k,actual[k]])),definition)){
            const d=await write('+field-update',t.id,definition,['--field-id',f.id,'--yes',...(definition.type==='formula'?['--i-have-read-guide']:[])]);f=d.field;
          }
        }else{
          const d=await write('+field-create',t.id,definition,definition.type==='formula'?['--i-have-read-guide']:[]);f=d.field;
        }
        if(!f?.id)throw Error('field mutation result missing ID');progress.fields[key]=f.id;await save();
      }
      bindings[cn]={id:progress.fields[key],name,definition,old};
    }
    fields=(await cli('+field-list',['--table-id',t.id])).fields;
    for(const [cn,b] of Object.entries(bindings)){
      const f=fields.find(x=>x.id===b.id);if(!f||f.name!==b.name||f.type!==b.definition.type)throw Error(`field readback mismatch ${cn}`);
      if(b.definition.style&&!same(f.style,b.definition.style))throw Error(`field style mismatch ${cn}`);
    }
    const current=await rows(t.id), patches=new Map(), expectedPatches=[];
    for(const row of current){
      if(progress.rows[row.id])continue;
      const original=t.rows.find(x=>x.id===row.id);if(!original)continue;
      const sourceId=original.cells['Import Key（导入键）']?.split(':').at(-1);
      const sr=src.rows.find(x=>x.id===sourceId);const patch={};
      for(const [cn,b] of Object.entries(bindings)){
        let value=sourceValue(sr,cn,b.definition);if(value===undefined)continue;
        const currentValue=row.cells[b.name];
        if(same(normalize(currentValue,b.definition),normalize(value,b.definition)))continue;
        const wasReused=b.old&&t.fields.some(f=>f.name===b.old);
        if(wasReused&&!generatedUnchanged(t,original,b.old))continue;
        if(!wasReused&&currentValue!==null&&currentValue!==undefined&&currentValue!=='')continue;
        // Re-read snapshot content is the optimistic guard against concurrent edits.
        const expectedOld=original.cells[b.old];
        if(wasReused&&b.definition.type==='text'&&!same(currentValue,expectedOld))throw Error(`concurrent cell change: ${row.id} ${b.name}`);
        patch[b.id]=value;
      }
      if(Object.keys(patch).length){const key=JSON.stringify(canonical(patch));if(!patches.has(key))patches.set(key,{patch,ids:[]});patches.get(key).ids.push(row.id);expectedPatches.push({id:row.id,patch})}
      else progress.rows[row.id]=true;
    }
    for(const {patch,ids} of patches.values()){
      for(let i=0;i<ids.length;i+=200){
        const idsBatch=ids.slice(i,i+200);const d=await write('+record-batch-update',t.id,{record_id_list:idsBatch,patch});
        if(d.ignored_fields?.length)throw Error('ignored fields during update');for(const id of idsBatch)progress.rows[id]=true;await save();
      }
    }
    const after=await rows(t.id);
    if(!same(after.map(x=>x.id).sort(),current.map(x=>x.id).sort()))throw Error('record set changed');
    for(const e of expectedPatches){const actual=after.find(r=>r.id===e.id);for(const [id,v] of Object.entries(e.patch)){const b=Object.values(bindings).find(x=>x.id===id);if(!same(normalize(actual.cells[b.name],b.definition),normalize(v,b.definition)))throw Error(`cell readback mismatch: ${b.name}`)}}
    progress.verified[t.id]={rows:after.length,sourceFields:spec.fields.length};await save();
    if(!progress.tables[t.id]&&t.name!==spec.title){await cli('+table-update',['--table-id',t.id,'--name',spec.title]);progress.tables[t.id]=true;await save()}
  }
  // Preserve custom filters; simplify only the duplicate generated All Records view.
  const vs=(await cli('+view-list',['--table-id',t.id])).views;
  const baseVisible=src?spec.fields.map(f=>f.mapping[1]):spec.visible;
  if(!baseVisible?.length)throw Error(`no layout ${t.name}`);
  const project=fields.find(f=>f.name==='Project（项目归属）');
  const visible=src&&project?[baseVisible[0],project.name,...baseVisible.slice(1)]:baseVisible;
  const visibleIds=visible.map(n=>{const f=fields.find(f=>f.name===n);if(!f)throw Error(`layout field missing ${n}`);return f.id});
  for(const v of vs){
    const key=t.id+':'+v.id;if(progress.views[key])continue;
    const state={};for(const [suffix,c] of [['filter','+view-get-filter'],['group','+view-get-group'],['sort','+view-get-sort'],['visible','+view-get-visible-fields']])state[suffix]=await cli(c,['--table-id',t.id,'--view-id',v.id]);
    const archive=path.join(report,'views-before.json');let configs;try{configs=JSON.parse(await fs.readFile(archive,'utf8'))}catch(e){if(e.code!=='ENOENT')throw e;configs={}}if(!configs[key]){configs[key]={table:t.id,view:v,...state};await fs.writeFile(archive,JSON.stringify(configs,null,2))}
    if(v.name==='All Records（全部记录）'&&(src||t.name==='Project Register（项目台账）')&&!state.filter.filter){
      await cli('+view-delete',['--table-id',t.id,'--view-id',v.id,'--yes']);progress.views[key]={removedDuplicate:true};await save();continue;
    }
    if(!same(state.visible.visible_fields,visible))await write('+view-set-visible-fields',t.id,{visible_fields:visibleIds},['--view-id',v.id]);
    let groups;
    if(src){groups=(spec.group||[]).map(cn=>bindings[cn].name);if(v.name==='表格'&&project)groups.unshift(project.name)}
    else if(t.name==='Research Questions（调研问题）')groups=['Primary Category（一级分类）'];
    else if(t.name==='Research Details（调研明细）')groups=['Research Subject（调研对象）','Primary Category（一级分类）'];
    else if(t.name==='Evidence Library（证据资料）')groups=['Research Subject（调研对象）','Evidence Type（资料类型）'];
    else if(t.name==='01 Knowledge Index（知识索引）')groups=['Project（项目归属）','Topic（主题分类）'];
    else if(/Meetings/.test(t.name))groups=[];
    if(groups){const config=groups.map(name=>({field:fields.find(f=>f.name===name).id,desc:false}));await write('+view-set-group',t.id,{group_config:config},['--view-id',v.id]);}
    const rename={'表格':'Overview（总览）','按分类查看':'By Category（按分类）','重点问题':'Priority Questions（重点问题）','分类待确认':'Pending Category（分类待确认）','证据清单':'Evidence List（资料清单）','已有材料':'Available Materials（已有材料）','待调研':'To Research（待调研）'}[v.name];
    if(rename)await cli('+view-rename',['--table-id',t.id,'--view-id',v.id,'--name',rename]);
    const proof=await cli('+view-get-visible-fields',['--table-id',t.id,'--view-id',v.id]);if(!same(proof.visible_fields,visible))throw Error('view layout verification failed');
    progress.views[key]={visible,group:groups};await save();
  }
  console.log(`完成 ${spec.title||t.name}：${t.rows.length} 条记录保留，业务视图已整理`);
}
console.log('全部表字段与视图调整完成，等待目录与浏览器验收。');
