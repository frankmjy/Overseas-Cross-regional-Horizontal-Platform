import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {BaseAdapter} from '../research/adapter.mjs';
import {normalizeRows} from '../research/service.mjs';
import {normalizeRecord,canonicalFieldName} from '../research/field-names.mjs';

process.env.LARK_CLI_SCRIPT=path.resolve('.tmp/lark-cli-1.0.98/package/scripts/run.js');
const dir='reports/research-refresh-20261019',read=async f=>JSON.parse(await fs.readFile(f,'utf8'));
const config=await read('research/config.json'),base=new BaseAdapter(config);
assert(!config.projects,'正式表已启用，此旧参照表同步脚本已停用；请先生成并审核正式表迁移计划。');
const source=await read(`${dir}/cells.json`),structure=await read(`${dir}/structure.json`);
assert.equal(source.has_more,false);assert.equal(source.ranges.length,1);
const range=source.ranges[0];assert.equal(range.actual_range,'A1:S200');
assert.equal(range.row_indices.at(-1),200);assert.equal(range.col_indices.at(-1),'S');
const cells=new Map();for(let i=0;i<range.cells.length;i++)for(let j=0;j<range.cells[i].length;j++)cells.set(`${range.col_indices[j]}${range.row_indices[i]}`,range.cells[i][j]);
const cell=a=>cells.get(a)||{},value=a=>String(cell(a).value??''),text=v=>Array.isArray(v)?text(v[0]):v==null?'':typeof v==='object'?v.text||v.name||'':String(v);
const displayText=v=>v.replaceAll('马来西亚','马来').replaceAll('字节','客户');
const sourceUrl=a=>`https://vnet.feishu.cn/sheets/DCWyskGejheU9ttN82icPJ5xnOg?sheet=wwLsaC&range=${a}`;
const groups=[['万国数据','D','E'],['秦淮数据','F','G'],['中联云港','H','I'],['德衡数据','J','K'],['其他部门输入','L','M']];
assert.equal(value('C1'),'问题列表');for(const [company,col]of groups)assert.equal(value(col+'1'),company);
for(const [a,c]of cells){assert(Object.keys(c).every(k=>['value','rich_text'].includes(k)),`Unmapped cell metadata ${a}`);if(/^[N-S]/.test(a))assert(!c.value&&!c.rich_text?.length,`Unmapped source column ${a}`);for(const r of c.rich_text||[])assert(['text','attachment','embed-image','mention','link'].includes(r.type),`Unmapped rich content ${a}`);}
const categories=new Map();for(const m of structure.merged_cells){const p=/^A(\d+):A(\d+)$/.exec(m.range);if(p)for(let i=+p[1];i<=+p[2];i++)categories.set(i,value(`A${p[1]}`));}
const sourceRows=range.row_indices.filter(r=>r>1&&value(`C${r}`));assert.equal(sourceRows.length,62);assert.equal(sourceRows.at(-1),63);
for(const row of range.row_indices.filter(r=>r>63))for(const col of range.col_indices)assert(!cell(col+row).value&&!cell(col+row).rich_text?.length,`Unexpected tail ${col}${row}`);
async function list(table){const all=[];for(let offset=0;;offset+=200){const page=await base.cli('+record-list',['--table-id',config.tables[table],'--limit','200','--offset',String(offset),'--format','json']);const rows=normalizeRows(page).map(r=>normalizeRecord(r));all.push(...rows);if(!page.has_more)return all;assert(rows.length,'Pagination stalled');}}
const current={};for(const k of ['questions','findings','evidence','topics'])current[k]=await list(k);
const action=process.argv[2]||'prepare';
if(action==='prepare')await fs.writeFile(`${dir}/complete-before.json`,JSON.stringify(current,null,2));
const baseline=(await read('reports/research-migration-20261016/normalized-data.json'))['调研明细'];
const byTitle=new Map(current.questions.map(q=>[text(q.问题列表),q]));assert.equal(byTitle.size,current.questions.length,'Duplicate existing titles');
let nextQ=Math.max(...current.questions.map(q=>/^Q-(\d+)$/.exec(text(q.问题编号))?.[1]||0))+1;
let nextE=Math.max(...current.evidence.map(e=>/^E-(\d+)$/.exec(text(e.资料编号))?.[1]||0))+1;
const plan={revision:source.revision,questions:[],findings:[],evidence:[],topics:[],conflicts:[],preservedQuestions:[],sourceMedia:0};
const used=new Set(),usedEvidence=new Set();
for(const row of sourceRows){
 const title=value(`C${row}`),old=byTitle.get(title),qid=old?text(old.问题编号):`Q-${String(nextQ++).padStart(3,'0')}`;
 const category=value(`A${row}`)||categories.get(row);assert(category,`Missing category ${row}`);used.add(qid);
 plan.questions.push({recordId:old?.recordId,fields:{问题列表:title,问题编号:qid,一级分类:category,原序号:value(`B${row}`),重点标记:/TOP/i.test(value(`B${row}`)),分类待确认:false,源行号:row,源表链接:sourceUrl(`A${row}:M${row}`),迁移键:old?text(old.迁移键):`wwLsaC:${qid}`}});
 for(const [company,answerCol,proofCol]of groups){
  const fid=`${qid}:${company}`,previous=current.findings.find(f=>text(f.明细编号)===fid);
  assert(current.findings.filter(f=>text(f.明细编号)===fid).length<=1,`Duplicate finding ${fid}`);
  const fields={明细名称:`${company}｜${title}`,明细编号:fid,一级分类:category,调研对象:company,调研内容:displayText(value(answerCol+row)),举证原文:displayText(value(proofCol+row)),材料状态:cell(answerCol+row).value||cell(proofCol+row).value?'有原始材料':'待调研',源内容单元格:answerCol+row,源举证单元格:proofCol+row,源行号:row,源表链接:sourceUrl(`${answerCol}${row}:${proofCol}${row}`),迁移键:previous?text(previous.迁移键):`wwLsaC:${fid}`};
  for(const key of ['调研内容','举证原文']){
   const prior=text(previous?.[key]),latest=fields[key],original=displayText(baseline.find(f=>f.明细编号===fid)?.[key]||'');
   if(!latest&&prior)fields[key]=prior;
   else if(prior&&prior!==latest&&prior!==original&&!latest.includes(prior))plan.conflicts.push({fid,key,prior,latest,original});
  }
  if(fields.调研内容||fields.举证原文)fields.材料状态='有原始材料';
  plan.findings.push({recordId:previous?.recordId,qid,fields});
  for(const col of [answerCol,proofCol])for(const rich of cell(col+row).rich_text||[]){
   if(rich.type==='text')continue;plan.sourceMedia++;
   const token=rich.attachment_token||rich.image_token||rich.mention_token||'',name=rich.text||`${company}-${title}.png`;
   const matches=current.evidence.filter(e=>text(e.问题编号)===qid&&text(e.调研对象)===company&&!usedEvidence.has(e.recordId)&&(token&&text(e.原文件标识)===token||text(e.资料名称)===name||rich.link&&text(e.原始链接).includes(rich.link)));
   assert(matches.length<=1,`Ambiguous evidence ${qid} ${name}`);const prior=matches[0];if(prior)usedEvidence.add(prior.recordId);
   plan.evidence.push({recordId:prior?.recordId,fid,fields:{资料名称:name,资料编号:prior?text(prior.资料编号):`E-${String(nextE++).padStart(3,'0')}`,调研对象:company,问题编号:qid,资料类型:rich.type==='attachment'?'文件附件':rich.type==='embed-image'?'单元格图片':rich.type==='mention'?'文件引用':'文件夹链接',迁移状态:prior?.附件?.length?text(prior.迁移状态):'保留原引用',源单元格:col+row,原文件标识:token,原文件大小:rich.file_size??null,MIME类型:rich.mime_type||'',原始链接:rich.link||sourceUrl(col+row),源表链接:sourceUrl(col+row),迁移键:prior?text(prior.迁移键):`wwLsaC:${fid}:${token||rich.link}`}});
  }
 }
}
assert.equal(plan.findings.length,310);assert.equal(plan.sourceMedia,29);
for(const name of [...new Set(plan.questions.map(q=>q.fields.一级分类))])if(!current.topics.some(t=>text(t.专题名称)===name))plan.topics.push({fields:{专题名称:name,专题说明:'',迁移键:`wwLsaC:topic:${name}`}});
plan.preservedQuestions=current.questions.filter(q=>!used.has(text(q.问题编号))).map(q=>({id:text(q.问题编号),title:text(q.问题列表),deleted:q.已删除===true}));
await fs.writeFile(`${dir}/plan.json`,JSON.stringify(plan,null,2));
console.log(JSON.stringify({sourceQuestions:62,matched:plan.questions.filter(q=>q.recordId).length,newQuestions:plan.questions.filter(q=>!q.recordId).length,newFindings:plan.findings.filter(q=>!q.recordId).length,sourceMedia:29,newEvidence:plan.evidence.filter(q=>!q.recordId).length,newTopics:plan.topics.length,conflicts:plan.conflicts.length}));
if(action==='prepare')process.exit(0);
assert.equal(plan.conflicts.length,0,'Concurrent content edits require review; no writes performed');
const comparable=v=>Array.isArray(v)&&v.every(x=>typeof x==='string')?v[0]||'':v==null?'':v;
const eq=(a,b)=>{if(typeof b==='boolean')return(a===true)===b;if(typeof b==='number')return Number(a)===b;if(Array.isArray(b))return JSON.stringify((a||[]).map(x=>x.id).sort())===JSON.stringify(b.map(x=>x.id).sort());if(typeof b==='string'&&b.startsWith('https://'))return text(a)===b||text(a)===`[${b}](${b})`;return comparable(a)===comparable(b);};
const ledgerFile=`${dir}/writes.json`,writes=await read(ledgerFile).catch(e=>{if(e.code!=='ENOENT')throw e;return[];});
async function sync(table,items){
 const fields=(await base.cli('+field-list',['--table-id',config.tables[table]])).fields;
 const fieldIds=Object.fromEntries(fields.map(f=>[canonicalFieldName(f.name),f.id]));
 const existing=current[table],create=[];
 for(const item of items){
  const old=existing.find(r=>r.recordId===item.recordId),delta=Object.fromEntries(Object.entries(item.fields).filter(([k,v])=>!eq(old?.[k],v)));
  if(action==='verify'){assert(old,`Missing ${table}`);assert.equal(Object.keys(delta).length,0,`Mismatch ${table} ${item.recordId}: ${Object.keys(delta).join(',')}`);continue;}
  if(old&&Object.keys(delta).length){await base.cli('+record-upsert',['--table-id',config.tables[table],'--record-id',old.recordId,'--json',JSON.stringify(Object.fromEntries(Object.entries(delta).map(([k,v])=>[fieldIds[k],v])))]);writes.push({table,recordId:old.recordId,fields:Object.keys(delta)});await fs.writeFile(ledgerFile,JSON.stringify(writes,null,2));}
  if(!old)create.push(item);
 }
 for(let i=0;i<create.length;i+=100){const batch=create.slice(i,i+100),keys=[...new Set(batch.flatMap(x=>Object.keys(x.fields)))];assert(keys.every(k=>fieldIds[k]),'Missing field mapping');const payload={fields:keys.map(k=>fieldIds[k]),rows:batch.map(x=>keys.map(k=>x.fields[k]??null))};await fs.writeFile(`${dir}/pending-${table}.json`,JSON.stringify(payload,null,2));const response=await base.cli('+record-batch-create',['--table-id',config.tables[table],'--json',JSON.stringify(payload)]);assert.equal(response.record_id_list.length,batch.length);assert(!response.ignored_fields?.length);writes.push({table,created:response.record_id_list});await fs.writeFile(ledgerFile,JSON.stringify(writes,null,2));}
 current[table]=await list(table);await fs.writeFile(`${dir}/after-${table}.json`,JSON.stringify(current[table],null,2));console.log(table,'verified read',current[table].length);
 for(const item of items){const match=current[table].filter(r=>text(r.迁移键)===item.fields.迁移键);assert.equal(match.length,1,`Migration identity ${table}`);item.recordId=match[0].recordId;for(const[k,v]of Object.entries(item.fields))assert(eq(match[0][k],v),`Readback ${table} ${k}`);}
}
await sync('topics',plan.topics);await sync('questions',plan.questions);
const questionIds=Object.fromEntries(plan.questions.map(q=>[q.fields.问题编号,q.recordId]));for(const f of plan.findings)f.fields.关联问题=[{id:questionIds[f.qid]}];
await sync('findings',plan.findings);const detailIds=Object.fromEntries(plan.findings.map(f=>[f.fields.明细编号,f.recordId]));for(const e of plan.evidence)e.fields.所属明细=[{id:detailIds[e.fid]}];
await sync('evidence',plan.evidence);
await fs.writeFile(`${dir}/verified.json`,JSON.stringify({at:new Date().toISOString(),revision:source.revision,sourceQuestions:62,sourceFindings:310,sourceMedia:29,counts:Object.fromEntries(Object.entries(current).map(([k,v])=>[k,v.length])),preservedQuestions:plan.preservedQuestions},null,2));
