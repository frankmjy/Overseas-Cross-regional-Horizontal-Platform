import test from 'node:test';
import assert from 'node:assert/strict';
import {compactDriveDocuments,libraryDocuments} from '../knowledge/library-model.mjs';
import {projectRecord} from '../knowledge/model.mjs';
import {filterDocuments} from '../knowledge/web/data.mjs';
const entry={title:'字节 SLA 标准',note:'PUE · 网络 · 电力 · 机房环境 · 门禁',url:'https://vnet.feishu.cn/wiki/example?table=source'};
const row=(id,title,body,specialty='')=>({id,sourceId:'sla',sourceName:'服务标准参考',category:'standards',title,summary:body,sections:[['参考内容',body]],tags:[],date:'',links:[{label:'原始记录',url:'https://vnet.feishu.cn/base/example?record='+id}],sourceLink:'https://vnet.feishu.cn/base/current?record='+id,libraryScope:'domestic',nature:'规范标准',specialty,libraryEntry:entry});

test('a reference source table becomes one business entry while retaining every source record',()=>{
 const original=[row('1','2.1 网络保证','2.1.1 网络定义'),row('2','2.1 网络保证','2.1.2 连通性保证'),row('3','2.2 电力保证','2.2.1 电力定义'),row('4','2.1 网络保证','2.1.1 网络定义')];
 const before=structuredClone(original),result=libraryDocuments(original);
 assert.equal(result.length,1);assert.equal(result[0].title,'字节 SLA 标准');assert.equal(result[0].note,entry.note);
 assert.equal(result[0].members.length,4);assert.equal(new Set(result[0].members.map(row=>row.id)).size,4);
 assert.equal(result[0].sections.filter(([name])=>name==='2.1 网络保证').length,2);
 assert.equal(result[0].links[0].url,entry.url);assert.deepEqual(original,before);
 assert.equal(filterDocuments(result,{query:'2.1.2 连通性保证'}).length,1);
});

test('source grouping does not merge projects, separate source tables, or independent files',()=>{
 const documents=[row('1','同名','A'),{...row('2','同名','B'),sourceId:'other'},
 {...row('3','同名','C'),libraryScope:'project',projectScope:'泰国'},
 {...row('4','同名','D'),libraryScope:'project',projectScope:'马来'},
 {...row('5','文件','E'),libraryEntry:undefined}, {...row('6','文件','F'),libraryEntry:undefined}];
 assert.equal(libraryDocuments(documents).length,6);
 assert.equal(libraryDocuments(documents,{project:'thailand'}).length,5);
});

test('a source entry is matched by the same member for combined search and specialty',()=>{
 const result=libraryDocuments([row('1','UPS','电力检查','电气'),row('2','水泵','冷却检查','暖通')]);
 assert.deepEqual(result[0].specialties,['电气','暖通']);
 assert.equal(filterDocuments(result,{specialties:['暖通'],query:'冷却'}).length,1);
 assert.equal(filterDocuments(result,{specialties:['电气'],query:'冷却'}).length,0);
 assert.equal(filterDocuments(result,{query:'字节 SLA'}).length,1);
 assert.equal(libraryDocuments(result).length,1);
 assert.equal(libraryDocuments(result)[0].members.length,2);
});

test('a configured source entry cannot introduce a script or credential-bearing link',()=>{
 const document=row('1','标准','正文');
 for(const value of ['javascript:alert(1)','https://user:pass@example.com/']){
  const result=libraryDocuments([{...document,libraryEntry:{...entry,url:value}}]);
  assert.equal(result[0].links[0].url,document.sourceLink);
 }
});

test('施工图默认以项目云盘目录展示，原图仍可搜索直达，审图意见独立显示',()=>{
 const base='https://vnet.feishu.cn/base/example', folder='https://vnet.feishu.cn/drive/folder/drawingFolder';
 const source={id:'equipment',kind:'equipment',category:'shared',driveCollections:[
  {sourceLibrary:'泰国工程资料',projectScope:'泰国',nature:'施工图纸',url:folder,title:'施工图纸云盘',extensions:['dwg','pdf']},
 ]};
 const drawing=(id,title,file,origin='泰国工程资料')=>projectRecord(source,{id,cells:{
  'Equipment Name':title,'Linked Document':`[${file}](https://vnet.feishu.cn/file/${id})`,
  'Document Category':['施工图纸'],'Source Library':origin,
 }},base);
 const rows=[drawing('r1','D01S 图纸目录','D01S.dwg'),drawing('r2','暖通施工图','HVAC.pdf'),drawing('r3','第三轮审图意见','审图意见.pdf'),drawing('r4','通用工程样例','sample.dwg','')];
 const thai=libraryDocuments(rows,{project:'thailand'});
 const visible=compactDriveDocuments(thai);
 assert.deepEqual(visible.map(r=>r.title),['施工图纸云盘','第三轮审图意见','通用工程样例']);
 assert.equal(visible[0].driveFolder,folder);
 assert.equal(visible[0].documentCount,2);
 const search={query:'D01S'};
 assert.deepEqual(compactDriveDocuments(filterDocuments(thai,search),search).map(r=>r.links[0].url),['https://vnet.feishu.cn/file/r1']);
 assert.deepEqual(libraryDocuments(rows,{project:'malaysia'}).map(r=>r.id),['equipment:r4']);
});

test('DX 空调按泰国云盘来源隔离，明确共用的规范仍可跨项目查看',()=>{
 const base='https://vnet.feishu.cn/base/example', folder='https://vnet.feishu.cn/drive/folder/dxFolder';
 const source={id:'equipment',kind:'equipment',category:'shared',driveCollections:[
  {sourceLibrary:'泰国专属',projectScope:'泰国',nature:'DX空调',url:folder,title:'DX 空调资料云盘',allLinked:true,sharedTokens:['sharedRef']},
  {sourceLibrary:'工程与设备',projectScope:'泰国',nature:'DX空调',url:folder,title:'DX 空调资料云盘',allLinked:true},
 ]};
 const rows=[['泰国专属','private1','project'],['工程与设备','private2',''],['泰国专属','sharedRef','']].map(([origin,id,scope])=>
  projectRecord(source,{id,cells:{'Equipment Name':id,'Document Category':['DX空调'],'Source Library':origin,'Library Scope':scope,'Linked Document':'https://vnet.feishu.cn/docx/'+id}},base));
 const thai=compactDriveDocuments(libraryDocuments(rows,{project:'thailand'}));
 assert.deepEqual(thai.map(r=>[r.title,r.documentCount]),[['DX 空调资料云盘',2],['sharedRef',undefined]]);
 assert.deepEqual(libraryDocuments(rows,{project:'malaysia'}).map(r=>r.title),['sharedRef']);
});
