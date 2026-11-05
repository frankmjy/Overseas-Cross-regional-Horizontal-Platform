import test from 'node:test';
import assert from 'node:assert/strict';
import {libraryDocuments} from '../knowledge/library-model.mjs';
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
