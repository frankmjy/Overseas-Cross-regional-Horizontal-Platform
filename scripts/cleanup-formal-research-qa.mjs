import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {BaseAdapter} from '../research/adapter.mjs';
import {researchProjectConfigs} from '../research/projects.mjs';
import {writeAtomic} from '../research/service.mjs';
process.env.LARK_CLI_SCRIPT=path.resolve('.tmp/lark-cli-1.0.98/package/scripts/run.js');
const dir='reports/research-formal-20261019',read=file=>JSON.parse(fs.readFileSync(file,'utf8')),projects=researchProjectConfigs(read('research/config.json'));
assert.equal(read('.maintenance.lock').owner,'formal-research-20261019');assert.equal(read(`${dir}/qa-result.json`).verified,true);
const ids={thailand:['0419f818-01df-4386-927f-42a4d3c76a01'],malaysia:['0419f818-01df-4386-927f-42a4d3c76a02','0419f818-01df-4386-927f-42a4d3c76a04','803c2ae0-524b-4b3a-898d-2d53a3067523']};
const canonical=value=>Array.isArray(value)?value.map(canonical):value&&typeof value==='object'?Object.fromEntries(Object.keys(value).sort().map(k=>[k,canonical(value[k])])):value;
const fingerprint=rows=>createHash('sha256').update(JSON.stringify(canonical(rows.toSorted((a,b)=>a.recordId.localeCompare(b.recordId))))).digest('hex');
const result={at:new Date().toISOString(),projects:{},uiSubmissionVerified:false};
for(const[project,target]of Object.entries(projects)){
 const runtime=path.resolve('.runtime/research/projects',project),lock=read(path.join(runtime,'writer.lock'));let active=true;try{process.kill(lock.pid,0);}catch(e){if(e.code==='ESRCH')active=false;}assert(!active,'Stop the exact local server before cleaning its ledger');
 const state=read(path.join(runtime,'state.json'));assert(Object.values(state.operations).every(op=>['success','retired'].includes(op.status)));
 const operations=ids[project].map(id=>state.operations[id]);assert(operations.every(op=>op?.status==='success'));assert(operations.filter(op=>op.payload.kind==='question').every(op=>op.payload.title.startsWith('【验收测试20261019】')));
 const adapter=new BaseAdapter(target),raw={},selected={};
 for(const table of ['evidence','findings','questions','topics']){raw[table]=await adapter.list(table);selected[table]=raw[table].filter(row=>ids[project].some(id=>row.迁移键===`web:${id}`||row.迁移键?.startsWith(`web:${id}:`)));const baseline=read(`${dir}/after-${project}-${table}.json`);assert.equal(fingerprint(raw[table].filter(row=>!selected[table].some(x=>x.recordId===row.recordId))),fingerprint(baseline),`Non-QA changed ${project}/${table}; do not delete`);}
 assert.equal(selected.questions.length,project==='thailand'?1:2);assert.equal(selected.findings.length,project==='thailand'?5:10);assert.equal(selected.evidence.length,project==='thailand'?0:1);assert.equal(selected.topics.length,0);
 if(project==='malaysia'){
  const ui=operations.find(op=>op.id==='803c2ae0-524b-4b3a-898d-2d53a3067523');assert.equal(ui.payload.project,'malaysia');assert.equal(ui.payload.applicability,'通用');const q=selected.questions.find(row=>row.问题编号===ui.result.questionId);assert.equal(q.问题列表,'【验收测试20261019】前端通用跨国提交');assert.equal(q.适用范围[0],'通用');assert.equal(selected.findings.filter(row=>row.关联问题?.some(link=>link.id===q.recordId)).length,5);result.uiSubmissionVerified=true;
 }
 writeAtomic(`${dir}/qa-cleanup-${project}.json`,{operations:ids[project],selected,nonQaFingerprints:Object.fromEntries(Object.entries(raw).map(([table,rows])=>[table,fingerprint(rows.filter(row=>!selected[table].some(x=>x.recordId===row.recordId)))]))});
 for(const table of ['evidence','findings','questions'])if(selected[table].length){
  const deleted=await adapter.cli('POST',[`/open-apis/bitable/v1/apps/${target.baseToken}/tables/${target.tables[table]}/records/batch_delete`,'--data',JSON.stringify({records:selected[table].map(row=>row.recordId)})],process.cwd(),'api');
  assert.equal(deleted.records.length,selected[table].length);assert(deleted.records.every(row=>row.deleted===true&&selected[table].some(item=>item.recordId===row.record_id)));
 }
 const after={};for(const table of ['questions','findings','evidence','topics']){after[table]=await adapter.list(table);assert.equal(fingerprint(after[table]),fingerprint(read(`${dir}/after-${project}-${table}.json`)),`Final baseline mismatch ${project}/${table}`);}
 for(const op of operations){for(const id of op.payload.uploadIds||[]){const upload=state.uploads[id];assert(upload&&upload.claimed===op.id);const parent=path.resolve(runtime,'uploads',id),file=path.resolve(parent,upload.name);assert(parent.startsWith(runtime+path.sep)&&path.dirname(file)===parent);if(fs.existsSync(file)){assert.equal(createHash('sha256').update(fs.readFileSync(file)).digest('hex'),upload.sha256);fs.unlinkSync(file);}if(fs.existsSync(parent)&&!fs.readdirSync(parent).length)fs.rmdirSync(parent);delete state.uploads[id];}state.operations[op.id]={id:op.id,hash:op.hash,status:'retired',createdAt:op.createdAt,retiredAt:new Date().toISOString()};}
 for(const row of selected.evidence)for(const attachment of row.附件||[]){const cached=path.join(runtime,'files',createHash('sha256').update(attachment.file_token).digest('hex')+'.bin');if(fs.existsSync(cached))fs.unlinkSync(cached);}
 state.cache={raw:after,syncedAt:new Date().toISOString()};writeAtomic(path.join(runtime,'state.json'),state);result.projects[project]={removed:Object.fromEntries(Object.entries(selected).map(([table,rows])=>[table,rows.length])),remaining:Object.fromEntries(Object.entries(after).map(([table,rows])=>[table,rows.length])),nonQaUnchanged:true};console.log(JSON.stringify({project,cleaned:true}));
}
assert(result.uiSubmissionVerified);result.verified=true;writeAtomic(`${dir}/qa-cleanup-result.json`,result);console.log(JSON.stringify({verified:true,uiSubmissionVerified:true}));
