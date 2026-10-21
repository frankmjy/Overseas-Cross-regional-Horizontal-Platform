import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {writeAtomic} from '../research/service.mjs';
import {researchProjectConfigs} from '../research/projects.mjs';
const dir='reports/research-formal-20261019',read=file=>JSON.parse(fs.readFileSync(file,'utf8'));
assert.equal(read('.maintenance.lock').owner,'formal-research-20261019');
assert.equal(read(`${dir}/coverage.json`).verified,true);
const legacy=read('.runtime/research/state.json');
assert(Object.values(legacy.operations).every(op=>['success','retired'].includes(op.status)),'Legacy queue must be settled before cutover');
const config=read(`${dir}/formal-config.json`),projects=researchProjectConfigs(config),proof={at:new Date().toISOString(),projects:{}};
for(const[key,target]of Object.entries(projects)){
 const destination=path.resolve('.runtime/research/projects',key,'state.json');assert(!fs.existsSync(destination),'New project ledger already exists; do not overwrite');
 const raw=Object.fromEntries(['questions','findings','evidence','topics'].map(table=>[table,read(`${dir}/after-${key}-${table}.json`)]));
 assert.equal(raw.questions.length,65);assert.equal(raw.topics.length,12);assert.equal(raw.findings.length,key==='thailand'?310:315);assert.equal(raw.evidence.length,key==='thailand'?4:30);
 assert(Object.keys(target.fieldIds).length===4);
 writeAtomic(destination,{binding:target.binding,operations:{},uploads:{},cache:{raw,syncedAt:new Date().toISOString()}});
 proof.projects[key]={tables:target.tables,counts:Object.fromEntries(Object.entries(raw).map(([table,rows])=>[table,rows.length])),binding:target.binding};
}
assert.deepEqual(read('research/config.json'),read(`${dir}/reference-config.json`),'Root config changed concurrently');
writeAtomic('research/config.json',config);writeAtomic(`${dir}/activation.json`,proof);console.log(JSON.stringify(proof));
