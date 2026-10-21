import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {BaseAdapter} from '../research/adapter.mjs';
import {normalizeRows} from '../research/service.mjs';
import {normalizeRecord,canonicalFieldName,fieldNames} from '../research/field-names.mjs';
import {classifyFinding,text,url} from './formal-research-classification.mjs';
process.env.LARK_CLI_SCRIPT=path.resolve('.tmp/lark-cli-1.0.98/package/scripts/run.js');
const dir='reports/research-formal-20261019',read=async f=>JSON.parse(await fs.readFile(f,'utf8')),save=(name,value)=>fs.writeFile(`${dir}/${name}.json`,JSON.stringify(value,null,2));
const reference=await read(dir+'/reference-config.json'),base=new BaseAdapter(reference),action=process.argv[2]||'plan';
const source=Object.fromEntries(await Promise.all(['questions','findings','evidence','topics'].map(async k=>[k,(await read(`${dir}/reference-${k}.json`)).rows])));
const activeIds=new Set(source.questions.filter(q=>q.已删除!==true).map(q=>text(q.问题编号)));
assert.equal(activeIds.size,63);
const classification=source.findings.filter(f=>activeIds.has(text(f.明细编号).split(':')[0])).map(f=>({sourceRecord:f.recordId,id:text(f.明细编号),...classifyFinding(f)}));
assert.equal(classification.length,315);assert(classification.every(x=>x.kind==='empty'||Object.keys(x.parts).length));
await save('classification',classification);
const configs={},plans={};
for(const [project,prefix]of [['thailand','02.02'],['malaysia','03.02']]){
 const data={};for(const key of ['questions','findings','evidence'])data[key]=await read(`${dir}/${project}-${key}.json`);
 const c={tables:Object.fromEntries(Object.entries(data).map(([k,v])=>[k,v.job.id])),fieldIds:{},parent:project==='thailand'?'bflhgRXdIrhyEeM2':'bflcMSwtgkTT9B99',topicName:`${prefix}.04 Topic Directory（专题目录）`};
 const p={questions:[],findings:[],evidence:[],topics:[]};
 for(const q of source.questions.filter(q=>q.已删除!==true)){
  const id=text(q.问题编号),old=data.questions.rows.find(r=>text(r.问题编号)===id),excluded=project==='thailand'&&id==='Q-050';
  const fields=Object.fromEntries(['问题列表','问题编号','一级分类','原序号','重点标记','分类待确认','源行号','源表链接','迁移键'].map(k=>[k,k==='源表链接'?url(q[k]):k==='一级分类'?text(q[k]):q[k]??null]));
  fields.已删除=excluded;fields.适用范围=id==='Q-050'?'本项目':'通用';fields.源表链接=fields.源表链接||`${reference.baseUrl}?table=${reference.tables.questions}&record=${q.recordId}`;
  p.questions.push({recordId:old?.recordId,fields});
  if(excluded)continue;
  for(const f of source.findings.filter(f=>text(f.明细编号).startsWith(id+':'))){
   const route=classification.find(r=>r.sourceRecord===f.recordId),part=route.parts[project],fields=Object.fromEntries(['明细名称','明细编号','一级分类','调研对象','源内容单元格','源举证单元格','源行号','源表链接','迁移键'].map(k=>[k,k==='源表链接'?url(f[k]):['一级分类','调研对象'].includes(k)?text(f[k]):f[k]??null]));
   fields.调研内容=part?.content||'';fields.举证原文=part?.proof||'';fields.材料状态=part&&(part.content||part.proof)?'有原始材料':'待调研';
   fields.源表链接=fields.源表链接||`${reference.baseUrl}?table=${reference.tables.findings}&record=${f.recordId}`;
   p.findings.push({qid:id,fields,sourceRecord:f.recordId,classification:route.kind});
  }
 }
 for(const e of source.evidence.filter(e=>activeIds.has(text(e.问题编号)))){
  const fid=`${text(e.问题编号)}:${text(e.调研对象)}`,route=classification.find(r=>r.id===fid);assert(route,`Evidence detail not found ${e.recordId}`);if(!route.parts[project])continue;
  const fields=Object.fromEntries(['资料名称','资料编号','调研对象','问题编号','资料类型','源单元格','原文件标识','原文件大小','MIME类型','原始链接','源表链接','SHA256','迁移键'].map(k=>[k,['原始链接','源表链接'].includes(k)?url(e[k]):['调研对象','资料类型'].includes(k)?text(e[k]):e[k]??null]));
  fields.迁移状态='保留原引用';fields.原始链接=fields.原始链接||fields.源表链接;assert(fields.原始链接,`Missing source attachment link ${e.recordId}`);p.evidence.push({fid,fields,sourceRecord:e.recordId});
 }
 for(const topic of source.topics)p.topics.push({fields:{专题名称:text(topic.专题名称),专题说明:text(topic.专题说明),迁移键:text(topic.迁移键)}});
 configs[project]=c;plans[project]=p;
}
await save('plan',plans);
console.log(JSON.stringify(Object.fromEntries(Object.entries(plans).map(([key,p])=>[key,{questions:p.questions.length,active:p.questions.filter(q=>!q.fields.已删除).length,findings:p.findings.length,populated:p.findings.filter(f=>f.fields.材料状态==='有原始材料').length,evidence:p.evidence.length}]))));
if(action==='plan')process.exit(0);
async function list(id){const out=[];for(let offset=0;;offset+=200){const p=await base.cli('+record-list',['--table-id',id,'--limit','200','--offset',String(offset),'--format','json']);const rows=normalizeRows(p).map(r=>normalizeRecord(r));out.push(...rows);if(!p.has_more)return out;assert(rows.length);}}
const writes=await read(`${dir}/writes.json`).catch(e=>{if(e.code!=='ENOENT')throw e;return[];});
const checkpoint=async entry=>{writes.push(entry);await save('writes',writes);};
const equal=(actual,expected)=>Array.isArray(expected)?JSON.stringify((actual||[]).map(x=>x.id).sort())===JSON.stringify(expected.map(x=>x.id).sort()):typeof expected==='boolean'?(actual===true)===expected:typeof expected==='number'?Number(actual)===expected:expected==null?!text(actual):typeof expected==='string'&&/^https?:/.test(expected)?url(actual)===expected:text(actual)===String(expected);
const tableList=(await base.cli('+table-list')).tables;
for(const [project,c]of Object.entries(configs)){
 const candidates=tableList.filter(t=>t.name===c.topicName);assert(candidates.length<=1,'Duplicate formal topic table');
 if(candidates[0])c.tables.topics=candidates[0].id;
 else{
  assert.equal(action,'apply','Formal topic table missing');
  const created=await base.cli('+table-create',['--name',c.topicName,'--fields',JSON.stringify(['专题名称','专题说明','迁移键'].map(k=>({name:fieldNames[k],type:'text'})))]);c.tables.topics=created.table?.id||created.id;assert(c.tables.topics,'Missing topic table ID');await checkpoint({project,createdTable:c.tables.topics});
 }
 await save(`directory-${project}`,{table:c.tables.topics,parent:c.parent,after:c.tables.evidence,name:c.topicName,status:'pending-native-ui'});
 for(const [key,id]of Object.entries(c.tables)){
  let meta=await base.cli('+field-list',['--table-id',id]);
  if(key==='questions'&&!meta.fields.some(f=>canonicalFieldName(f.name)==='适用范围')){
   assert.equal(action,'apply','Applicability missing');await base.cli('+field-create',['--table-id',id,'--json',JSON.stringify({name:fieldNames.适用范围,type:'select',options:[{name:'本项目'},{name:'通用'}]})]);meta=await base.cli('+field-list',['--table-id',id]);
  }
  c.fieldIds[key]=Object.fromEntries(meta.fields.map(f=>[canonicalFieldName(f.name),f.id]));
  for(const field of meta.fields.filter(f=>f.type==='select')){
   const name=canonicalFieldName(field.name),needed=[...new Set(plans[project][key].map(item=>text(item.fields[name])).filter(Boolean))];
   const missing=needed.filter(value=>!field.options?.some(option=>option.name===value));
   if(!missing.length)continue;
   assert.equal(action,'apply',`Missing select options ${project}/${key}/${name}: ${missing}`);
   const current=(await base.cli('+field-get',['--table-id',id,'--field-id',field.id])).field;
   assert.equal(current.type,'select');
   const definition={name:current.name,type:current.type,multiple:current.multiple,options:[...current.options,...missing.filter(value=>!current.options.some(option=>option.name===value)).map(name=>({name}))]};
   if(current.default_value!=null)definition.default_value=current.default_value;
   await base.cli('+field-update',['--table-id',id,'--field-id',field.id,'--json',JSON.stringify(definition),'--yes']);
   const updated=(await base.cli('+field-get',['--table-id',id,'--field-id',field.id])).field;
   assert([...current.options,...missing.map(name=>({name}))].every(option=>updated.options.some(value=>value.name===option.name)));
   await checkpoint({project,key,field:field.id,addedOptions:missing});
  }
  if(key==='findings')assert.equal(meta.fields.find(f=>canonicalFieldName(f.name)==='关联问题').link_table,c.tables.questions);
  if(key==='evidence')assert.equal(meta.fields.find(f=>canonicalFieldName(f.name)==='所属明细').link_table,c.tables.findings);
 }
 await save('formal-config',{baseToken:reference.baseToken,baseUrl:reference.baseUrl,defaultProject:'malaysia',projects:configs});
 for(const key of ['topics','questions','findings','evidence']){
  const id=c.tables[key],items=plans[project][key];let existing=await list(id);
  if(key==='findings'){const qs=await list(c.tables.questions);for(const item of items){const q=qs.filter(q=>text(q.问题编号)===item.qid);assert.equal(q.length,1);item.fields.关联问题=[{id:q[0].recordId}];}}
  if(key==='evidence'){const fs=await list(c.tables.findings);for(const item of items){const f=fs.filter(f=>text(f.明细编号)===item.fid);assert.equal(f.length,1);item.fields.所属明细=[{id:f[0].recordId}];}}
  const create=[];
  for(const item of items){
   const business=key==='questions'?'问题编号':key==='findings'?'明细编号':key==='evidence'?'资料编号':'专题名称';
   const matches=existing.filter(r=>text(r[business])===text(item.fields[business]));assert(matches.length<=1,`Duplicate business identity ${id}`);const old=matches[0];item.recordId=old?.recordId;
   const delta=Object.fromEntries(Object.entries(item.fields).filter(([k,v])=>!equal(old?.[k],v)));
   assert(Object.keys(item.fields).every(k=>c.fieldIds[key][k]),`Missing field binding ${key}`);
   if(action==='verify'){assert(old,`Missing formal row ${key}`);assert.equal(Object.keys(delta).length,0,`Formal mismatch ${project}/${key}/${item.fields[business]}: ${Object.keys(delta)}`);continue;}
   if(!old)create.push(item);
   else if(Object.keys(delta).length){
    const baseline=key==='questions'?(await read(`${dir}/${project}-questions.json`)).rows.find(r=>r.recordId===old.recordId):null;
    for(const k of ['调研内容','举证原文'])if(old[k]&&!equal(old[k],item.fields[k]))throw Error(`Existing formal content must be merged explicitly ${old.recordId}`);
    if(baseline)for(const k of ['问题列表','一级分类'])assert(equal(old[k],baseline[k])||equal(old[k],item.fields[k]),'Concurrent formal question edit');
    await base.cli('+record-upsert',['--table-id',id,'--record-id',old.recordId,'--json',JSON.stringify(Object.fromEntries(Object.entries(delta).map(([k,v])=>[c.fieldIds[key][k],v])))]);await checkpoint({project,key,id:old.recordId,updated:Object.keys(delta)});
   }
  }
  for(let offset=0;offset<create.length;offset+=100){const batch=create.slice(offset,offset+100),columns=[...new Set(batch.flatMap(x=>Object.keys(x.fields)))],payload={fields:columns.map(k=>c.fieldIds[key][k]),rows:batch.map(x=>columns.map(k=>x.fields[k]??null))};await save(`pending-${project}-${key}`,payload);const r=await base.cli('+record-batch-create',['--table-id',id,'--json',`@${dir}/pending-${project}-${key}.json`]);assert.equal(r.record_id_list.length,batch.length);assert(!r.ignored_fields?.length);await checkpoint({project,key,created:r.record_id_list});}
  existing=await list(id);for(const item of items){const row=existing.filter(r=>text(r.迁移键)===text(item.fields.迁移键));assert.equal(row.length,1,`Migration key check ${project}/${key}`);item.recordId=row[0].recordId;for(const[k,v]of Object.entries(item.fields))assert(equal(row[0][k],v),`Semantic readback ${project}/${key}/${k}`);}
  await save(`after-${project}-${key}`,existing);console.log(JSON.stringify({project,key,rows:existing.length,verified:items.length}));
 }
}
await save('verified-plan',plans);await save('formal-config',{baseToken:reference.baseToken,baseUrl:reference.baseUrl,defaultProject:'malaysia',projects:configs});
const coverage=[];for(const route of classification.filter(x=>x.kind!=='empty')){for(const [project,part]of Object.entries(route.parts)){const got=plans[project].findings.find(x=>x.sourceRecord===route.sourceRecord);assert(got);assert.equal(got.fields.调研内容,part.content);assert.equal(got.fields.举证原文,part.proof);}coverage.push({sourceRecord:route.sourceRecord,id:route.id,kind:route.kind,projects:Object.keys(route.parts),verified:true});}
for(const e of source.evidence.filter(e=>activeIds.has(text(e.问题编号))))assert(Object.values(plans).some(p=>p.evidence.some(x=>x.sourceRecord===e.recordId)),'Unmapped active evidence');
await save('coverage',{at:new Date().toISOString(),nonempty:coverage,activeEvidence:source.evidence.filter(e=>activeIds.has(text(e.问题编号))).length,verified:true});
