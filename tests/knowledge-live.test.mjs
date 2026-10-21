import test from 'node:test';import assert from 'node:assert/strict';
import {projectRecord,safeLinks} from '../knowledge/model.mjs';
import {KnowledgeService,KnowledgeAdapter} from '../knowledge/service.mjs';
import {createKnowledgeHandler} from '../knowledge/http.mjs';import {createServer} from 'node:http';
const source={id:'tblabc',kind:'meeting',project:'thailand',name:'Thailand Meetings（泰国项目会议）',category:'meetings'};
test('architecture navigation uses the configured cloud document',()=>{
 const config={baseUrl:'https://vnet.feishu.cn/base/abc',architectureUrl:'https://vnet.feishu.cn/base/abc?table=ldxguide',categories:[],sources:[]};
 assert.equal(new KnowledgeService({config}).snapshot().architectureUrl,config.architectureUrl);
});
test('meeting classification follows its table and preserves source times without inventing conclusions',()=>{
 const r=projectRecord(source,{id:'rec1',cells:{'Meeting Title':'技术沟通','Meeting Date':'2026-10-15T16:12:00.000+08:00',Project:['Malaysia（马来）'],'Minutes Link':'[纪要](https://vnet.feishu.cn/docx/abc)','Action Items':null}},'https://vnet.feishu.cn/base/abc');
 assert.equal(r.project,'thailand');assert.equal(r.date,'2026-10-15');assert.equal(r.time,'16:12');assert.match(r.timezone,/08:00/);assert.deepEqual(r.decisions,[]);assert.deepEqual(r.actions,[]);assert.equal(r.links[0].url,'https://vnet.feishu.cn/docx/abc');assert.ok(!JSON.stringify(r).includes('ou_'));
});
test('knowledge API exposes the service projection and rejects write methods',async t=>{
 const service={read:()=>({state:'ready',documents:[],meetings:[],categories:[]})};const handler=createKnowledgeHandler({root:process.cwd(),service});const server=createServer(async(req,res)=>{if(!await handler(req,res)){res.writeHead(404);res.end();}});await new Promise(r=>server.listen(0,'127.0.0.1',r));t.after(()=>new Promise(r=>server.close(r)));const url=`http://127.0.0.1:${server.address().port}/api/knowledge`;
 assert.equal((await fetch(url)).status,200);assert.equal((await (await fetch(url)).json()).state,'ready');assert.equal((await fetch(url,{method:'POST'})).status,405);assert.equal((await fetch(url,{method:'HEAD'})).status,200);
});
test('links reject scripts and credentials; lessons expose only display fields',()=>{
 assert.deepEqual(safeLinks('javascript:alert(1) https://user:pass@example.com/a'),[]);
 const r=projectRecord({id:'tbl1',kind:'lesson',category:'experience',name:'Operations Lessons（运维经验沉淀）'},{id:'rec2',cells:{Title:'巡检','Key Points':'检查记录','Lesson Type':['Routine Work（例行工作）'],'Source Records':'https://vnet.feishu.cn/base/a\nhttps://vnet.feishu.cn/base/b','Setup Key':'private',Owner:[{id:'ou_secret'}]}},'https://vnet.feishu.cn/base/abc');
 assert.equal(r.subcategory,'Routine Work（例行工作）');assert.equal(r.links.length,2);assert.doesNotMatch(JSON.stringify(r),/private|ou_secret/);
});
test('adapter paginates explicitly projected fields and refuses stalled pages',async()=>{
 const a=new KnowledgeAdapter({baseToken:'abc'});let offsets=[];a.cli=async(c,args)=>{const offset=Number(args[args.indexOf('--offset')+1]);offsets.push(offset);assert.ok(args.includes('fld1'));return {fields:['Renamed title'],data:offset? [['two']]:[['one']],record_id_list:[offset?'rec2':'rec1'],has_more:!offset};};
 const rows=await a.list({id:'tbl1',fields:{Title:{id:'fld1',name:'Renamed title'}}});assert.deepEqual(offsets,[0,1]);assert.equal(rows[1].cells.Title,'two');
 a.cli=async()=>({fields:[],data:[],record_id_list:[],has_more:true});await assert.rejects(a.list({id:'tbl1',fields:{}}),/分页/);
});
test('failed refresh keeps successful sections and never substitutes mock records',async()=>{
 const config={baseUrl:'https://vnet.feishu.cn/base/abc',categories:[],sources:[source,{id:'tblfail',name:'failed',kind:'document'}]};let fail=false,calls=0;
 const adapter={list:async s=>{calls++;if(s.id==='tblfail'||fail)throw Error('unavailable');return [{id:'rec1',cells:{'Meeting Title':'真实会议'}}];}};
 const service=new KnowledgeService({config,adapter});await Promise.all([service.refresh(),service.refresh()]);assert.equal(calls,2);let result=service.snapshot();assert.equal(result.state,'partial');assert.equal(result.meetings.length,1);assert.equal(result.errors.length,1);
 fail=true;await service.refresh();result=service.snapshot();assert.equal(result.meetings[0].title,'真实会议');assert.equal(result.errors.length,2);assert.equal(result.documents.length,0);
});
