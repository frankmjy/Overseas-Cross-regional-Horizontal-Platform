import fs from 'node:fs/promises';
import path from 'node:path';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {normalizedCell} from './overseas-source-views.mjs';
const root=path.resolve('.'),dir=path.join(root,'reports/overseas-directory-20261018'),exec=promisify(execFile);
const plan=JSON.parse(await fs.readFile(path.join(dir,'directory-plan.json'),'utf8'));
if(plan.documents?.some(d=>d.documentToken)&&plan.tables.some(t=>t.id==='tbludeErzRHom8j6'&&t.role==='archive'))throw Error('原架构索引已归档；请维护项目总览中的平台架构指南云文档。');
const ledgerFile=path.join(dir,'index-progress.json');
let ledger;try{ledger=JSON.parse(await fs.readFile(ledgerFile,'utf8'))}catch(e){if(e.code!=='ENOENT')throw e;ledger={};}
const save=()=>fs.writeFile(ledgerFile,JSON.stringify(ledger,null,2));
async function cli(cmd,args=[]){const {stdout}=await exec(process.execPath,[path.join(root,'vendor/lark-cli/run.cjs'),'base',cmd,'--base-token',plan.base,...args,'--as','bot','--jq','.'],{cwd:root,windowsHide:true,maxBuffer:25e6,timeout:60000});const d=JSON.parse(stdout);if(!d.ok)throw Error(JSON.stringify(d.error));return d.data;}
async function write(cmd,payload,args=[]){const f=path.join(dir,'index-payload.json');await fs.writeFile(f,JSON.stringify(payload));return cli(cmd,['--table-id',ledger.id,...args,'--json','@'+path.relative(root,f)]);}
const roles={business:'Business（正式业务）',shared:'Shared（共享资料）',archive:'Archive（历史归档）',navigation:'Navigation（导航说明）'};
const types=['Folder（文件夹）','Table（数据表）','Guide（使用说明）','External Link（外部入口）'];
const text=name=>({name,type:'text'}),choice=(name,values)=>({name,type:'select',options:values.map(name=>({name}))});
const fields=[text('Item（目录项）'),choice('Module（所属模块）',plan.folders.filter(f=>!f.parent).map(f=>f.name)),choice('Data Role（数据性质）',Object.values(roles)),choice('Item Type（入口类型）',types),text('Parent（上级目录）'),text('Purpose（用途说明）'),{...text('Open Link（打开入口）'),style:{type:'url'}},{name:'Order（排序）',type:'number',style:{type:'plain',precision:0}},text('Setup Key（初始化标识）')];
const name='Architecture Index（架构索引）';
if(!ledger.id){const tables=(await cli('+table-list')).tables;if(tables.some(t=>t.name===name))throw Error('Index exists without ownership checkpoint');ledger.id=(await cli('+table-create',['--name',name,'--fields',JSON.stringify(fields)])).table.id;await save();}
if(!plan.tables.some(t=>t.id===ledger.id)){plan.tables.unshift({id:ledger.id,name,parent:'overview',role:'navigation',new:true});await fs.writeFile(path.join(dir,'directory-plan.json'),JSON.stringify(plan,null,2));}
const folderMap=new Map(plan.folders.map(f=>[f.key,f]));
const top=f=>f.parent?top(folderMap.get(f.parent)):f;
const purpose={overview:'整个平台的导航、项目台账及填写规则。',preparation:'记录项目调研问题、调研明细及证据。',readiness:'开服前的初始化、交付界面确认和测试验收。',operations:'正式执行中的例行工作、问题整改和服务指标核查。',meetings:'按项目区分会议，统一管理项目周报、月报。',knowledge:'跨项目复用的知识、标准及经验；采用前确认项目适用条件。',people:'项目人员和培训记录，并保留认证题库及测试人员参考。',archive:'完整保留历史来源和旧稿，不作为海外项目完成记录。'};
const rows=[];
function add(e,type,order){const folder=type===types[0]?e:folderMap.get(e.parent),module=top(folder);let role=e.role||(['archive','handover-history','operations-history','drafts'].includes(e.key)?'archive':['knowledge','standards','hse','experience','people'].includes(e.key)?'shared':'business');let desc=purpose[e.key]||'';if(type===types[1])desc=e.id===ledger.id?'全架构导航入口；按模块和数据性质查找表格。':e.name.startsWith('Operations Lessons')?'正式整理的复用经验，按7类来源及专业分组；保留每条来源链接，项目采用前确认。':e.new?'海外正式业务表；仅初始化1行填写示例，尚无真实执行结果。':e.role==='archive'?'原始历史记录或旧版整理稿；完整保留数据、字段、视图和来源链接。':e.role==='shared'?'源表参考资料；保留原有字段、记录和源视图，供项目查阅与适配。':'海外项目正式记录；保留现有数据与视图。';if(type===types[2]){role='navigation';desc='说明正式业务、共享资料和归档的使用边界，以及示例填写规则。';}rows.push({'Item（目录项）':e.name,'Module（所属模块）':module.name,'Data Role（数据性质）':roles[role],'Item Type（入口类型）':type,'Parent（上级目录）':type===types[0]?(e.parent?folderMap.get(e.parent).name:'Platform Root（平台根目录）'):folder.name,'Purpose（用途说明）':desc||'按所属模块集中组织同类资料。','Open Link（打开入口）':type===types[0]?null:`https://vnet.feishu.cn/base/${plan.base}?table=${e.id}`,'Order（排序）':order,'Setup Key（初始化标识）':'directory:'+e.id});}
let order=0;
function walk(f){add(f,types[0],++order);for(const t of plan.tables.filter(t=>t.parent===f.key))add(t,types[1],++order);for(const doc of plan.documents||[])if(doc.parent===f.key)add(doc,types[2],++order);for(const child of plan.folders.filter(x=>x.parent===f.key))walk(child);}
for(const f of plan.folders.filter(f=>!f.parent))walk(f);
for(const t of plan.tables.filter(t=>t.prepared)){const row=rows.find(r=>r['Setup Key（初始化标识）']==='directory:'+t.id);row['Purpose（用途说明）']=`海外正式业务表，已预置${t.prepared}条通用准备清单；执行信息留空，由现场确认后填写。原填写示例（如有）单独标注。`;}
for(const row of rows){const key=row['Setup Key（初始化标识）'];const e=[...plan.folders,...plan.tables].find(e=>'directory:'+e.id===key);if(!e)continue;if(e.project){row['Purpose（用途说明）']=e.prepared?`${e.project==='thailand'?'泰国':'马来'}项目独立业务表，预置${e.prepared}条适用问题或通用准备项；人员、实际日期和执行结果由本项目现场填写。示例单独标注。`:'本项目独立业务表；保留源字段及格式，未执行事项仅有明确示例或留空，待现场填报。';}else if(e.parent==='templates')row['Purpose（用途说明）']='共用工作模板；保留原记录、字段和视图，用于维护标准和对照。项目执行分别进入泰国、马来独立表。';else if(e.key==='overview')row['Purpose（用途说明）']='平台架构索引、项目台账及使用规则，统一导航到两项目、共享资料、跨项目会议和归档。';else if(e.key==='knowledge')row['Purpose（用途说明）']='跨项目共用知识、标准、EHS资料、经验、培训题库、工作模板和共用调研。';else if(e.key==='team')row['Purpose（用途说明）']='跨项目团队例会及协同记录；单个项目会议在各自项目目录维护。';else if(e.key==='shared-research')row['Purpose（用途说明）']='保留跨公司调研原始问题、明细和证据，不将历史比较数据标成海外项目已完成事实。';}
for(const row of rows){const e=[...plan.folders,...plan.tables].find(e=>'directory:'+e.id===row['Setup Key（初始化标识）']);if(e&&top(e.key?e:folderMap.get(e.parent)).key==='knowledge')row['Data Role（数据性质）']=roles.shared;}
rows.push({'Item（目录项）':'Project Management Workspace（项目管理工作区）','Module（所属模块）':folderMap.get('overview').name,'Data Role（数据性质）':roles.business,'Item Type（入口类型）':types[3],'Parent（上级目录）':folderMap.get('overview').name,'Purpose（用途说明）':'海外项目管理页面的数据源入口，涵盖任务执行、合同履约、项目资料、成本支付和结算回款；执行明细在原工作区维护，本平台只保留导航入口，不复制或同步原表、数据及工作流。','Open Link（打开入口）':'https://vnet.feishu.cn/base/FmIwbCqj1ax5MvsTp5OcPO5lnue?table=ldxQTOrMHIaG4vuR','Order（排序）':4,'Setup Key（初始化标识）':'external:FmIwbCqj1ax5MvsTp5OcPO5lnue'});
rows.push({'Item（目录项）':'Platform Scope & Rules（平台范围与规则）','Module（所属模块）':folderMap.get('overview').name,'Data Role（数据性质）':roles.navigation,'Item Type（入口类型）':types[2],'Parent（上级目录）':folderMap.get('overview').name,'Purpose（用途说明）':'一级按泰国、马来项目分开；各设筹备、接维、运维、会议报告、人员培训五组。标准、经验、模板及共用调研独立共享；源记录和原视图保留，示例不作为实际完成情况。','Open Link（打开入口）':'https://vnet.feishu.cn/base/'+plan.base+'?table=ldxpV5M0qhI0IgVy','Order（排序）':5,'Setup Key（初始化标识）':'notes:project-structure'});
await fs.writeFile(path.join(dir,'index-rows.json'),JSON.stringify(rows,null,2));
const actualFields=(await cli('+field-list',['--table-id',ledger.id])).fields,map=new Map(actualFields.map(f=>[f.name,f.id]));
const typeField=actualFields.find(f=>f.name==='Item Type（入口类型）');
if(!typeField.options.some(o=>o.name===types[3]))await write('+field-update',{name:typeField.name,type:typeField.type,multiple:false,options:[...typeField.options,{name:types[3]}]},['--field-id',typeField.id,'--yes']);
const moduleField=actualFields.find(f=>f.name==='Module（所属模块）'),rootNames=plan.folders.filter(f=>!f.parent).map(f=>f.name),moduleOptions=[...rootNames.map(name=>moduleField.options.find(o=>o.name===name)||{name}),...moduleField.options.filter(o=>!rootNames.includes(o.name))];
if(JSON.stringify(moduleOptions)!==JSON.stringify(moduleField.options))await write('+field-update',{name:moduleField.name,type:moduleField.type,multiple:false,options:moduleOptions},['--field-id',moduleField.id,'--yes']);
const readArgs=['--table-id',ledger.id,'--limit','200',...fields.flatMap(f=>['--field-id',map.get(f.name)])];
const actual=await cli('+record-list',readArgs);const ki=actual.fields.indexOf('Setup Key（初始化标识）'),known=new Set(actual.data.map(r=>r[ki]));if(known.size!==actual.data.length)throw Error('duplicate index key');
const missing=rows.filter(r=>!known.has(r['Setup Key（初始化标识）']));if(missing.length)await write('+record-batch-create',{fields:fields.map(f=>map.get(f.name)),rows:missing.map(r=>fields.map(f=>r[f.name]??null))});
const updates=[];for(const row of rows){const i=actual.data.findIndex(r=>r[ki]===row['Setup Key（初始化标识）']);if(i<0)continue;const patch={};for(const f of fields){const previous=actual.data[i][actual.fields.indexOf(f.name)];if(JSON.stringify(normalizedCell(previous,f))!==JSON.stringify(normalizedCell(row[f.name],f)))patch[map.get(f.name)]=row[f.name]??null;}if(Object.keys(patch).length)updates.push({id:actual.record_id_list[i],patch});}
for(let i=0;i<updates.length;i+=4){const results=await Promise.allSettled(updates.slice(i,i+4).map(u=>cli('+record-upsert',['--table-id',ledger.id,'--record-id',u.id,'--json',JSON.stringify(u.patch)])));for(const r of results)if(r.status==='rejected')throw r.reason;}
let views=(await cli('+view-list',['--table-id',ledger.id])).views;
ledger.views??={};
for(const [i,d] of [{name:'Overview（架构总览）'},...['business','shared','archive'].map(role=>({name:roles[role],role}))].entries()){
 let v=views.find(v=>v.name===d.name);
 if(!v&&i===0&&views.length===1){v=views[0];await cli('+view-rename',['--table-id',ledger.id,'--view-id',v.id,'--name',d.name]);v.name=d.name;}
 if(!v){const c=await write('+view-create',{name:d.name,type:'grid'});v=c.views?.[0]||c.view;views.push(v);}
 if(!ledger.views[v.id]){const args=['--view-id',v.id];await write('+view-set-filter',{logic:'and',conditions:d.role?[[map.get('Data Role（数据性质）'),'==',[roles[d.role]]]]:[]},args);await write('+view-set-group',{group_config:['Module（所属模块）','Parent（上级目录）'].map(n=>({field:map.get(n),desc:false}))},args);await write('+view-set-sort',{sort_config:[{field:map.get('Order（排序）'),desc:false}]},args);await write('+view-set-visible-fields',{visible_fields:fields.filter(f=>!['Order（排序）','Setup Key（初始化标识）'].includes(f.name)).map(f=>map.get(f.name))},args);ledger.views[v.id]={name:d.name,role:d.role||null};await save();}
}
const proof=await cli('+record-list',readArgs);if(proof.data.length!==rows.length)throw Error('index count mismatch');const indices=new Map(proof.fields.map((n,i)=>[n,i]));const result=new Map(proof.data.map(r=>[r[indices.get('Setup Key（初始化标识）')],r]));for(const row of rows)for(const f of fields){const actual=result.get(row['Setup Key（初始化标识）'])?.[indices.get(f.name)];if(JSON.stringify(normalizedCell(actual,f))!==JSON.stringify(normalizedCell(row[f.name],f)))throw Error('index value mismatch '+f.name);}
ledger.verified={rows:rows.length,views:views.length};await save();console.log(JSON.stringify(ledger.verified));
