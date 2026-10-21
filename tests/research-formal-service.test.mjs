import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {ResearchService,writeAtomic} from '../research/service.mjs';
import {classifyFinding} from '../scripts/formal-research-classification.mjs';

class MemoryBase{
 tables={questions:[],findings:[],evidence:[],topics:[{专题名称:'组织与人才'}]};writes=[];
 async list(key){return structuredClone(this.tables[key]);}
 async create(key,fields){const recordId=`rec${this.writes.length+1}`;this.tables[key].push({...structuredClone(fields),recordId});this.writes.push({key,fields});return recordId;}
 async update(key,id,fields){Object.assign(this.tables[key].find(r=>r.recordId===id),fields);}
}
async function setup(t,key){const dir=await fs.mkdtemp(path.join(os.tmpdir(),'formal-research-test-')),base=new MemoryBase(),service=new ResearchService({dir,base,autoRun:false,project:{key,name:key},binding:key});await service.init();await service.refresh();t.after(async()=>{await service.close();await fs.rm(dir,{recursive:true,force:true});});return{base,service,dir};}
const uuid='4fa4a033-5274-4cdf-a4e4-d41061cce415';
const input=project=>({kind:'question',clientMutationId:uuid,project,title:'QA正式表隔离',category:'组织与人才',priority:false,applicability:'本项目'});
test('the same UUID in separate project ledgers creates separate records and retries remain idempotent',async t=>{
 const th=await setup(t,'thailand'),my=await setup(t,'malaysia');
 await th.service.accept(input('thailand'));await my.service.accept(input('malaysia'));
 assert.equal(th.base.writes.length,0);assert.equal(my.base.writes.length,0);
 await th.service.run();await my.service.run();
 assert.equal(th.base.tables.questions.length,1);assert.equal(my.base.tables.questions.length,1);
 assert.equal(th.base.tables.findings.length,5);assert.equal(my.base.tables.findings.length,5);
 await th.service.accept(input('thailand'));await th.service.run();assert.equal(th.base.tables.questions.length,1);
 await assert.rejects(th.service.accept({...input('thailand'),project:'malaysia'}),/项目/);
});
test('common questions are accepted only by Malaysia and preserve applicability in formal and local records',async t=>{
 const th=await setup(t,'thailand'),my=await setup(t,'malaysia');
 await assert.rejects(th.service.accept({...input('thailand'),applicability:'通用'}),/马来/);
 await my.service.accept({...input('malaysia'),applicability:'通用'});assert.equal(my.service.snapshot().questions[0].applicability,'通用');
 await my.service.run();assert.equal(my.base.tables.questions[0].适用范围,'通用');assert.equal(th.base.writes.length,0);
});
test('a cache or outbox from another table binding cannot start in a project directory',async t=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'formal-binding-test-'));t.after(()=>fs.rm(dir,{recursive:true,force:true}));
 writeAtomic(path.join(dir,'state.json'),{binding:'old-source',operations:{},uploads:{},cache:{raw:{}}});
 const service=new ResearchService({dir,base:new MemoryBase(),autoRun:false,binding:'formal-target'});
 await assert.rejects(service.init(),/绑定不一致/);await assert.rejects(fs.stat(path.join(dir,'writer.lock')),e=>e.code==='ENOENT');
});
test('attachment URLs remain bound to their project',async t=>{
 const {base,service}=await setup(t,'thailand');base.tables.questions.push({recordId:'recQ',问题编号:'Q-1',问题列表:'QA'});base.tables.evidence.push({recordId:'recE',问题编号:'Q-1',调研对象:'万国数据',附件:[{file_token:'test-token',name:'qa.pdf',size:10}]});await service.refresh();
 const file=service.snapshot().evidence[0];assert.equal(new URL(file.url,'http://localhost').searchParams.get('project'),'thailand');assert.equal(new URL(file.feishuUrl,'http://localhost').searchParams.get('project'),'thailand');
});
test('reviewed country splits preserve all text and Malaysia site facts never populate Thailand',()=>{
 const s='马来\nJobStreet Malaysia\n泰国:\nJobsDBThailand',r=classifyFinding({明细编号:'Q-002:万国数据',调研内容:s});assert(r.parts.thailand.content.includes('JobsDBThailand'));assert(!r.parts.thailand.content.includes('JobStreet'));assert.equal(Object.values(r.parts).map(p=>p.content).join('').replace(/\s/g,''),s.replace(/\s/g,''));
 const facts=classifyFinding({明细编号:'Q-026:万国数据',调研内容:'水质原值',举证原文:'水质附件'});assert.equal(facts.parts.thailand,undefined);assert.equal(facts.parts.malaysia.content,'水质原值');
 const common=classifyFinding({明细编号:'Q-048:万国数据',调研内容:'调研清单'});assert.equal(common.parts.thailand.content,common.parts.malaysia.content);
 assert.throws(()=>classifyFinding({明细编号:'Q-999:万国数据',调研内容:'未审内容'}),/Unreviewed/);
});
