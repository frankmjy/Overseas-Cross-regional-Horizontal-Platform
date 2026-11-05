import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { ResearchService, versionOf, questionVersion } from '../research/service.mjs';
import { BaseAdapter } from '../research/adapter.mjs';
import { researchProjectConfigs,assertResearchSourceSwitch } from '../research/projects.mjs';
import { researchDirectory } from '../research/directory.mjs';
import { researchProjects,questionDestination,researchApiUrl } from '../research/web/project-scope.mjs';
import { mergeProjectSnapshots,questionTarget,matchesResearchRange } from '../research/web/unified-research.mjs';

const uuid='4fa4a033-5274-4cdf-a4e4-d41061cce415';
test('active UI reads and writes the single reviewed source without duplicating common questions',()=>{
 assert.deepEqual(researchProjects,[{key:'overseas',name:'海外项目'}]);assert.deepEqual(questionDestination('common'),{project:'overseas',applicability:'通用'});assert.match(researchApiUrl('/api/research','overseas'),/project=overseas/);assert.deepEqual(questionTarget('overseas:2.1.1'),{project:'overseas',questionId:'2.1.1'});assert(matchesResearchRange({projectKey:'overseas',applicability:'通用'},['overseas']));
});
test('the served project catalog and actual configured Base agree',async()=>{
 const config=JSON.parse(await fs.readFile(new URL('../research/config.json',import.meta.url),'utf8'));assert.equal(config.baseToken,'Xy0LbBykIaSLuys527RcVXEinMh');assert.equal(config.defaultProject,'overseas');assert.deepEqual(Object.keys(config.projects),researchProjects.map(p=>p.key));for(const table of ['questions','findings','evidence','topics'])assert(config.projects.overseas.fieldIds[table].迁移键);assert(config.projects.overseas.fieldIds.questions.已删除);
});
test('switching source refuses to abandon a legacy unfinished queue and leaves its bytes intact',async t=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'research-source-switch-'));t.after(()=>fs.rm(dir,{recursive:true,force:true}));const folder=path.join(dir,'projects','malaysia');await fs.mkdir(folder,{recursive:true});const file=path.join(folder,'state.json'),bytes=JSON.stringify({operations:{test:{status:'waiting_upload'}}});await fs.writeFile(file,bytes);assert.throws(()=>assertResearchSourceSwitch(dir,['overseas']),/未完成/);assert.equal(await fs.readFile(file,'utf8'),bytes);await fs.writeFile(file,JSON.stringify({operations:{test:{status:'success'}}}));assert.doesNotThrow(()=>assertResearchSourceSwitch(dir,['overseas']));
});
class MemoryBase {
  tables={questions:[{recordId:'recQ',问题编号:'2.1.1',问题列表:'团队人员配置',一级分类:'组织与人才',适用范围:'通用'}],findings:[],evidence:[],topics:[{recordId:'recT',专题名称:'组织与人才',层级:'一级'}]};
  writes=[];
  async list(table){return structuredClone(this.tables[table]);}
  async create(table,fields){const recordId='rec'+(this.writes.length+1);this.tables[table].push({...structuredClone(fields),recordId});this.writes.push({table,fields});return recordId;}
  async update(table,id,fields){Object.assign(this.tables[table].find(r=>r.recordId===id),fields);}
}
async function fixture(t){const dir=await fs.mkdtemp(path.join(os.tmpdir(),'research-upgrade-')),base=new MemoryBase(),service=new ResearchService({dir,base,autoRun:false,project:{key:'overseas',name:'海外项目'}});await service.init();t.after(async()=>{await service.close();await fs.rm(dir,{recursive:true,force:true});});return {service,base};}

test('a configured single source is supported without silently binding the legacy countries',()=>{
 const config={baseToken:'base',baseUrl:'https://example.test/base',defaultProject:'overseas',projects:{overseas:{name:'海外项目',tables:{questions:'tblQ',findings:'tblF',evidence:'tblE',topics:'tblT'}}}};
 const projects=researchProjectConfigs(config);assert.deepEqual(Object.keys(projects),['overseas']);assert.equal(projects.overseas.project.name,'海外项目');
});
test('hierarchical IDs and direct detail evidence links load without an original URL',async t=>{
 const {service,base}=await fixture(t);base.tables.findings.push({recordId:'recF',明细编号:'2.1.1｜万国数据',关联问题:[{id:'recQ'}],调研对象:'万国数据',调研内容:'真实正文'});
 base.tables.evidence.push({recordId:'recE',所属明细:[{id:'recF'}],调研对象:'万国数据',资料名称:'qa.png',附件:[{name:'qa.png',size:10,file_token:'fake'}]});await service.refresh();
 const data=service.snapshot();assert.equal(data.questions[0].id,'2.1.1');assert.equal(data.evidence[0].questionId,'2.1.1');assert.equal(data.evidence[0].company,'万国数据');assert.equal(data.evidence[0].downloadable,true);assert.match(data.evidence[0].url,/project=overseas/);
});
test('editing a sparse imported question creates only the missing company detail and retries once',async t=>{
 const {service,base}=await fixture(t);await service.refresh();const payload={kind:'finding',project:'overseas',questionId:'2.1.1',company:'万国数据',content:'补充内容',proof:'',version:versionOf({}),uploadIds:[],clientMutationId:uuid};
 const op=await service.accept(payload);await service.run();assert.equal(op.status,'success',op.error);await service.accept(payload);await service.run();assert.equal(base.tables.findings.length,1);assert.equal(base.tables.findings[0].调研内容,'补充内容');
});
test('pending local edits update the imported fullwidth-delimited detail instead of creating a duplicate',async t=>{
 const {service,base}=await fixture(t);base.tables.findings.push({recordId:'recF',明细编号:'2.1.1｜万国数据',关联问题:[{id:'recQ'}],调研对象:'万国数据',调研内容:'旧内容'});await service.refresh();
 const f=service.snapshot().findings[0];await service.accept({kind:'finding',project:'overseas',questionId:'2.1.1',company:'万国数据',content:'新内容',proof:'',version:f.version,uploadIds:[],clientMutationId:uuid});
 const rows=service.snapshot().findings.filter(f=>f.company==='万国数据');assert.equal(rows.length,1);assert.equal(rows[0].content,'新内容');
});
test('question title updates linked details with either delimiter',async t=>{
 const {service,base}=await fixture(t);base.tables.findings.push({recordId:'recF',明细编号:'2.1.1｜万国数据',关联问题:[{id:'recQ'}],调研对象:'万国数据',明细名称:'万国数据｜团队人员配置'});await service.refresh();
 const op=await service.accept({kind:'question-title',project:'overseas',questionId:'2.1.1',name:'人员配置调整',version:questionVersion(base.tables.questions[0]),clientMutationId:uuid});await service.run();assert.equal(op.status,'success',op.error);assert.equal(base.tables.findings[0].明细名称,'万国数据｜人员配置调整');
});
test('hierarchical directory sorts numerically and excludes child topics',()=>{
 const result=researchDirectory(['2.10.1','2.2.1'].map(id=>({问题编号:id,问题列表:id,一级分类:'组织与人才'})),[{专题名称:'一级专题',层级:'一级'},{专题名称:'二级专题',层级:'二级'}]);assert.deepEqual(result.questions.map(q=>q.问题编号),['2.2.1','2.10.1']);assert(!result.categories.includes('二级专题'));
});
test('field adaptation drops only optional metadata and rejects missing business fields',()=>{
 const base=new BaseAdapter({fieldIds:{questions:{问题编号:'fldId',问题列表:'fldTitle'},evidence:{资料名称:'fldName',资料编号:'fldCode',所属明细:'fldDetail',关联问题:'fldQuestion',调研对象:'fldCompany',资料类型:'fldType',迁移键:'fldMutation'}}});
 assert.deepEqual(base.supported('questions',{问题编号:'Q-1',问题列表:'标题',分类待确认:false}),{问题编号:'Q-1',问题列表:'标题'});
 assert.throws(()=>base.supported('questions',{问题编号:'Q-1',适用范围:'通用'}),/适用范围/);
 assert.deepEqual(base.supported('evidence',{资料编号:'E-1',关联问题:[{id:'recQ'}],问题编号:'2.1.1',SHA256:'fake'}),{资料编号:'E-1',关联问题:[{id:'recQ'}]});
});
