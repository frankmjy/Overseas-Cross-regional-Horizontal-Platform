import fs from 'node:fs';
import assert from 'node:assert/strict';
const origin='https://localhost:3333',dir='reports/research-formal-20261019',read=file=>JSON.parse(fs.readFileSync(file,'utf8'));
assert.equal(read(`${dir}/qa-cleanup-result.json`).verified,true);assert.equal(read('.maintenance.lock').owner,'formal-research-20261019');
const proof={at:new Date().toISOString(),projects:{},privatePaths:{}};
for(const project of ['thailand','malaysia']){
 const response=await fetch(`${origin}/api/research?project=${project}`);assert.equal(response.status,200);const result=await response.json(),data=result.data;assert.equal(result.error,'');assert.equal(data.project.key,project);assert.equal(data.questions.length,project==='thailand'?62:63);assert.equal(data.findings.length,project==='thailand'?310:315);assert.equal(data.evidence.length,project==='thailand'?4:30);assert(!data.questions.some(row=>row.title.includes('验收测试20261019')));assert.equal(new URL(data.baseUrl).searchParams.get('table'),read('research/config.json').projects[project].tables.questions);assert(!/file_token|app_secret/.test(JSON.stringify(result)));assert.equal(result.projects.length,2);
 const tasks=await(await fetch(`${origin}/api/research/operations?project=${project}`)).json();assert.equal(tasks.operations.length,0);proof.projects[project]={questions:data.questions.length,findings:data.findings.length,evidence:data.evidence.length,baseUrl:data.baseUrl,pending:0};
}
for(const route of ['/.env','/research/config.json','/.runtime/research/projects/malaysia/state.json','/certs/localhost.pfx','/vendor/lark-cli/run.cjs']){const response=await fetch(origin+route,{method:'HEAD'});assert.equal(response.status,404);proof.privatePaths[route]=404;}
assert.equal((await fetch(origin+'/project-management')).status,200);assert.equal((await fetch('http://127.0.0.1:4178/')).status,200);
fs.unlinkSync('.maintenance.lock');
const payload={kind:'question',clientMutationId:'0419f818-01df-4386-927f-42a4d3c76a02',project:'malaysia',applicability:'通用',title:'【验收测试20261019】通用默认马来',category:'组织与人才',priority:false};
const post=url=>fetch(origin+url,{method:'POST',headers:{origin,'content-type':'application/json'},body:JSON.stringify(payload)});
assert.equal((await post('/api/research/operations')).status,400);assert.equal((await post('/api/research/operations?project=malaysia')).status,409);assert.equal((await post('/api/research/operations?project=thailand')).status,400);
proof.maintenance=false;proof.retiredReplayRejected=true;proof.sample4178Preserved=true;proof.verified=true;fs.writeFileSync(`${dir}/final-health.json`,JSON.stringify(proof,null,2));console.log(JSON.stringify(proof));
