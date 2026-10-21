import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import path from 'node:path';
import {BaseAdapter} from '../research/adapter.mjs';
import {researchProjectConfigs} from '../research/projects.mjs';
const dir='reports/research-formal-20261019',origin='https://localhost:3333';
process.env.LARK_CLI_SCRIPT=path.resolve('.tmp/lark-cli-1.0.98/package/scripts/run.js');
const config=JSON.parse(await fs.readFile('research/config.json','utf8')),targets=researchProjectConfigs(config);
const cases=[{project:'thailand',applicability:'本项目',clientMutationId:'0419f818-01df-4386-927f-42a4d3c76a01',title:'【验收测试20261019】泰国正式表归属'},{project:'malaysia',applicability:'通用',clientMutationId:'0419f818-01df-4386-927f-42a4d3c76a02',title:'【验收测试20261019】通用默认马来'}];
const proof={at:new Date().toISOString(),cases,operations:[],checks:[]};await fs.writeFile(`${dir}/qa-plan.json`,JSON.stringify(proof,null,2));
async function api(route,project,payload){const response=await fetch(`${origin}${route}${route.includes('?')?'&':'?'}project=${project}`,{headers:{origin,'content-type':'application/json'},...(payload?{method:'POST',body:JSON.stringify(payload)}:{}),signal:AbortSignal.timeout(15000)});const data=await response.json();assert(response.ok,`HTTP ${response.status}: ${data.error}`);return data;}
async function finished(id,project){const end=Date.now()+240000;for(;;){const {operation}=await api(`/api/research/operations/${id}`,project);if(operation.status==='success'){proof.operations.push({id,project,status:operation.status,result:operation.result});await fs.writeFile(`${dir}/qa-result.json`,JSON.stringify(proof,null,2));return operation;}assert(!['error','blocked'].includes(operation.status),operation.error);assert(Date.now()<end,'QA operation timed out; reconcile before retry');await new Promise(resolve=>setTimeout(resolve,1000));}}
for(const entry of cases){
 const payload={...entry,kind:'question',category:'组织与人才',priority:false};await api('/api/research/operations',entry.project,payload);await api('/api/research/operations',entry.project,payload);console.log(JSON.stringify({project:entry.project,accepted:entry.clientMutationId}));
}
for(const entry of cases){
 const op=await finished(entry.clientMutationId,entry.project);const adapter=new BaseAdapter(targets[entry.project]);const q=(await adapter.list('questions')).filter(row=>row.迁移键===`web:${entry.clientMutationId}`);assert.equal(q.length,1);assert.equal(q[0].问题列表,entry.title);assert.equal(q[0].适用范围[0],entry.applicability);const details=(await adapter.list('findings')).filter(row=>row.明细编号?.startsWith(op.result.questionId+':'));assert.equal(details.length,5);assert(details.every(row=>row.关联问题.some(link=>link.id===q[0].recordId)));console.log(JSON.stringify({project:entry.project,question:op.result.questionId,formalVerified:true,details:details.length}));
 const other=entry.project==='thailand'?'malaysia':'thailand';assert(!(await new BaseAdapter(targets[other]).list('questions')).some(row=>row.问题列表===entry.title));proof.checks.push({project:entry.project,formalQuestion:q[0].recordId,fiveDetails:true,duplicateReplayCreatedOnce:true,absentOtherProject:true});
}
const common=proof.operations.find(op=>op.project==='malaysia'),snapshot=(await api('/api/research','malaysia')).data;
const finding=snapshot.findings.find(row=>row.questionId===common.result.questionId&&row.company==='万国数据');assert(finding);
const uploadId='0419f818-01df-4386-927f-42a4d3c76a03',findingId='0419f818-01df-4386-927f-42a4d3c76a04',bytes=Buffer.from('QA formal research 20261019\n');
const payload={kind:'finding',project:'malaysia',clientMutationId:findingId,questionId:common.result.questionId,company:'万国数据',content:'【验收测试20261019】正式调研明细回读',proof:'验收完成后清理',version:finding.version,uploadIds:[uploadId],uploadPlans:[{id:uploadId,name:'QA-formal-research-20261019.txt',size:bytes.length}]};
await api('/api/research/operations','malaysia',payload);
const upload=await fetch(`${origin}/api/research/uploads?project=malaysia&name=QA-formal-research-20261019.txt`,{method:'POST',headers:{origin,'content-type':'application/octet-stream','x-upload-id':uploadId},body:bytes});assert.equal(upload.status,201);await finished(findingId,'malaysia');
const adapter=new BaseAdapter(targets.malaysia),details=await adapter.list('findings'),files=await adapter.list('evidence');assert(details.some(row=>row.明细编号===`${common.result.questionId}:万国数据`&&row.调研内容===payload.content));const evidence=files.filter(row=>row.迁移键?.startsWith(`web:${findingId}:`));assert.equal(evidence.length,1);assert.equal(evidence[0].附件[0].size,bytes.length);assert(evidence[0].所属明细.some(link=>details.some(row=>row.recordId===link.id&&row.明细编号===`${common.result.questionId}:万国数据`)));
assert.equal((await fetch(`${origin}/api/research/local-files/${uploadId}?project=thailand`)).status,404);proof.checks.push({formalTextVerified:true,formalAttachmentVerified:true,crossProjectFileRejected:true,uploadId,findingId});
for(const [key,id]of Object.entries(JSON.parse(await fs.readFile(`${dir}/reference-config.json`,'utf8')).tables)){
 const reference=new BaseAdapter(JSON.parse(await fs.readFile(`${dir}/reference-config.json`,'utf8'))),rows=await reference.list(key),baseline=JSON.parse(await fs.readFile(`${dir}/reference-${key}.json`,'utf8')).rows;
 assert.equal(rows.length,baseline.length);assert(!rows.some(row=>JSON.stringify(row).includes('验收测试20261019')));proof.checks.push({referenceTable:id,records:rows.length,noNewQa:true});
}
proof.verified=true;proof.finishedAt=new Date().toISOString();await fs.writeFile(`${dir}/qa-result.json`,JSON.stringify(proof,null,2));console.log(JSON.stringify({verified:true,checks:proof.checks.length}));
