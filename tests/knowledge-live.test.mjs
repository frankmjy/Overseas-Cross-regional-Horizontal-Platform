import test from 'node:test';import assert from 'node:assert/strict';
import {projectRecord,safeLinks} from '../knowledge/model.mjs';
import {KnowledgeService,KnowledgeAdapter} from '../knowledge/service.mjs';
import {createKnowledgeHandler} from '../knowledge/http.mjs';import {createServer} from 'node:http';
import {mkdtemp,rm,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
const source={id:'tblabc',kind:'meeting',project:'thailand',name:'Thailand Meetings（泰国项目会议）',category:'meetings'};
test('云盘目录从全部分页读取，只返回同域的真实子文件夹',async()=>{
 const adapter=new KnowledgeAdapter({});
 const calls=[];
 adapter.cli=async (_method,args)=>{
  const params=JSON.parse(args[2]);calls.push(params);
  return !params.page_token?{files:[{name:'14-DX空调',type:'folder',token:'Dx'},{name:'采购文件',type:'file',token:'File'}],has_more:true,next_page_token:'cursor'}:
   {files:[{name:'2-板换',type:'folder',token:'Plate',url:'https://external.example/'},{name:'坏链接',type:'folder',token:'bad/name'}],has_more:false};
 };
 assert.deepEqual(await adapter.listDriveFolders('https://vnet.feishu.cn/drive/folder/Spec'),[
  {name:'2-板换',url:'https://vnet.feishu.cn/drive/folder/Plate'},
  {name:'14-DX空调',url:'https://vnet.feishu.cn/drive/folder/Dx'},
 ]);
 assert.equal(calls[1].page_token,'cursor');
});
test('知识 API 只发送当前项目可见的云盘目录，读取失败时保留父入口',async t=>{
 const parent='https://vnet.feishu.cn/drive/folder/Spec',dx='https://vnet.feishu.cn/drive/folder/Dx';
 const source={id:'equipment',kind:'equipment',category:'shared',driveCollections:[
  {sourceLibrary:'泰国设备',nature:'设备技术规格',title:'设备规格',url:parent,projectScope:'泰国',allLinked:true},
  {sourceLibrary:'泰国设备',nature:'DX空调',title:'DX 空调',url:dx,projectScope:'泰国',allLinked:true},
 ]};
 const row=(id,nature)=>({id,cells:{'Equipment Name':nature,'Document Category':nature,'Source Library':'泰国设备','Linked Document':'https://vnet.feishu.cn/file/'+id}});
 const child={name:'板换',url:'https://vnet.feishu.cn/drive/folder/Plate'};
 const service=new KnowledgeService({config:{sources:[source]},adapter:{
  list:async()=>[row('spec','设备技术规格'),row('dx','DX空调')],
  async listDriveFolders(root){if(root===dx)throw Error('No permission');return [{name:'DX空调',url:dx},child];}
 }});
 await service.refresh();
 assert.deepEqual(service.driveFolders,{[parent]:[child]});
 const handle=createKnowledgeHandler({root:process.cwd(),service});
 const server=createServer((req,res)=>{req.auth={project:{knowledgeKey:req.headers['test-project']},permissions:{knowledge:{view:true}}};return handle(req,res);});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 t.after(()=>new Promise(resolve=>server.close(resolve)));
 const load=async project=>(await fetch('http://127.0.0.1:'+server.address().port+'/api/knowledge',{headers:{'test-project':project}})).json();
 const thailand=await load('thailand');
 assert.deepEqual(thailand.driveFolders,{[parent]:[child]});
 assert.ok(thailand.documents.some(d=>d.driveCollection.url===dx));
 assert.deepEqual((await load('malaysia')).driveFolders,{});
});
test('旧缓存待读取图纸来源时不继续把项目图纸展示为海外共用',async t=>{
 const dir=await mkdtemp(path.join(tmpdir(),'vnet-drive-collection-'));
 t.after(()=>rm(dir,{recursive:true,force:true}));
 const cacheFile=path.join(dir,'cache.json'),baseUrl='https://vnet.feishu.cn/base/abc';
 const source={id:'equipment',kind:'equipment',category:'shared',driveCollections:[{nature:'施工图纸',sourceLibrary:'泰国工程资料',projectScope:'泰国'}]};
 await writeFile(cacheFile,JSON.stringify({baseUrl,sections:{equipment:{updatedAt:'2026-11-15',records:[
  {id:'old-drawing',sourceId:'equipment',nature:'施工图纸',projectScope:'海外'},
  {id:'equipment-spec',sourceId:'equipment',nature:'设备技术规格',projectScope:'海外'},
 ]}}}));
 const service=new KnowledgeService({config:{baseUrl,sources:[source]},cacheFile,adapter:{
  async list(){return [{id:'drawing',cells:{'Document Category':['施工图纸'],'Source Library':'泰国工程资料'}}];},
 }});
 await service.init();
 assert.deepEqual(service.snapshot().documents.map(row=>row.id),['equipment-spec']);
 await service.refresh();
 assert.equal(service.snapshot().documents[0].projectScope,'泰国');
 const restart=new KnowledgeService({config:service.config,cacheFile});
 await restart.init();
 assert.equal(restart.snapshot().documents[0].id,'equipment:drawing');
});
test('有效资料视图的状态与知识 API 一致，历史记录仍可供同步核对',async t=>{
 const source={id:'tblDocs',kind:'equipment',name:'维保与技术资料',category:'shared',libraryView:'vewActive'};
 const baseUrl='https://vnet.feishu.cn/base/example';
 const rows=['','有效','重复引用','待补资料','无效资料'].map((status,i)=>({id:'rec'+i,cells:{
  'Equipment Name':'资料'+i,'Document Category':['施工图纸'],'Review Status':status?[status]:null,
 }}));
 const service=new KnowledgeService({config:{baseUrl,sources:[source]},adapter:{list:async()=>rows}});
 await service.refresh();
 const snapshot=service.snapshot();
 assert.equal(snapshot.documents.length,5);
 assert.equal(snapshot.sources[0].count,2);
 assert.equal(snapshot.sources[0].url,baseUrl+'?table=tblDocs&view=vewActive');
 const handle=createKnowledgeHandler({root:process.cwd(),service,documents:{merge(feed){return feed;}}});
 const server=createServer((req,res)=>handle(req,res));
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 t.after(()=>new Promise(resolve=>server.close(resolve)));
 const response=await fetch('http://127.0.0.1:'+server.address().port+'/api/knowledge');
 assert.equal(response.status,200);
 assert.deepEqual((await response.json()).documents.map(d=>d.title),['资料0','资料1']);
});
test('architecture navigation uses the configured cloud document',()=>{
 const config={baseUrl:'https://vnet.feishu.cn/base/abc',architectureUrl:'https://vnet.feishu.cn/base/abc?table=ldxguide',categories:[],sources:[]};
 assert.equal(new KnowledgeService({config}).snapshot().architectureUrl,config.architectureUrl);
});
test('meeting classification follows its table and preserves source times without inventing conclusions',()=>{
 const r=projectRecord(source,{id:'rec1',cells:{'Meeting Title':'技术沟通','Meeting Date':'2026-10-15T16:12:00.000+08:00',Project:['Malaysia（马来）'],'Minutes Link':'[纪要](https://vnet.feishu.cn/docx/abc)','Action Items':null}},'https://vnet.feishu.cn/base/abc');
 assert.equal(r.project,'thailand');assert.equal(r.date,'2026-10-15');assert.equal(r.time,'16:12');assert.match(r.timezone,/08:00/);assert.deepEqual(r.decisions,[]);assert.deepEqual(r.actions,[]);assert.equal(r.links[0].url,'https://vnet.feishu.cn/docx/abc');assert.ok(!JSON.stringify(r).includes('ou_'));
});
test('overseas team projection keeps names and splits numbered followups without user identifiers',()=>{
 const r=projectRecord({...source,project:'overseas'},{id:'team',cells:{'Meeting Title':'海外例会','Participants':[{id:'ou_private',name:'测试人员'}],'Action Items':'1. 核对排期。2. 补充清单。\n3. 评审方案。'}},'https://vnet.feishu.cn/base/abc');
 assert.equal(r.project,'overseas');assert.deepEqual(r.participants,['测试人员']);assert.equal(r.actions.length,3);
 assert.doesNotMatch(JSON.stringify(r),/ou_private/);assert.equal(r.actions[1].title,'补充清单。');
});
test('structured follow-ups join by project and original record ID without exposing user IDs',()=>{
 const baseUrl='https://vnet.feishu.cn/base/abc',actionSource={id:'tblactions',kind:'meeting-action'};
 const meeting=projectRecord(source,{id:'rec1',cells:{'Meeting Title':'技术沟通','Meeting Type':['专题评审'],'Action Items':'核对清单\n保留原文'}},baseUrl);
 const cells={'Action Title':'核对清单','Araya Meeting':[{id:'rec1'}],Assignee:[{id:'ou_private',name:'负责人'}],'Due At':'2026-11-15 16:30:00','Action Status':['待办'],'Action Priority':['P0']};
 const action=projectRecord(actionSource,{id:'rec2',cells},baseUrl);
 assert.equal(projectRecord(actionSource,{id:'rec3',cells:{...cells,'Malaysia Meeting':[{id:'rec1'}]}},baseUrl),null);
 const service=new KnowledgeService({config:{baseUrl,sources:[source,actionSource],categories:[]}});
 service.sections={tblabc:{records:[meeting]},tblactions:{records:[action,{...action,project:'malaysia',title:'外项目待办'}]}};
 const result=service.snapshot();
 assert.equal(result.meetings.length,1);
 assert.equal(result.meetings[0].meetingType,'专题评审');
 assert.deepEqual(result.meetings[0].actions.map(a=>[a.title,a.owner,a.due]),[['核对清单','负责人','2026-11-15T16:30'],['保留原文','','']]);
 assert.doesNotMatch(JSON.stringify(result),/ou_private|外项目待办/);
});
test('cross-project meeting overview requires an administrator session',async()=>{
 const service={read:()=>({meetings:[{project:'thailand'},{project:'malaysia'},{project:'overseas'}],sources:[]})};
 const handler=createKnowledgeHandler({root:process.cwd(),service});
 for(const isAdmin of [false,true]){
  let result;
  await handler({url:'/api/knowledge?meetingOverview=1',method:'GET',auth:{project:{knowledgeKey:'thailand'},isAdmin,permissions:{meetings:{view:true}}}},{writeHead(){},end(body){result=JSON.parse(body);}});
  assert.deepEqual(result.meetings.map(m=>m.project),isAdmin?['thailand','malaysia','overseas']:['thailand','overseas']);
 }
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
