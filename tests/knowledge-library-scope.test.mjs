import test from 'node:test';
import assert from 'node:assert/strict';
import {projectRecord} from '../knowledge/model.mjs';
import {libraryScopeFor,libraryDocuments,libraryMetrics} from '../knowledge/library-model.mjs';
const base='https://vnet.feishu.cn/base/fixture';
test('library separates actual project ownership, shared overseas and domestic references',()=>{
 assert.equal(libraryScopeFor({kind:'index'},{Project:['泰国'],'Document Title':'项目图纸'}),'project');
 assert.equal(libraryScopeFor({kind:'index'},{Project:['海外'],'Document Title':'海外手册'}),'shared');
 assert.equal(libraryScopeFor({kind:'index'},{Project:['通用'],'Document Title':'新开国手册【接维篇】_V0.8'}),'shared');
 assert.equal(libraryScopeFor({kind:'index'},{Project:['通用'],'Document Title':'阿里5.0设备厂验-技术中心参与计划'}),'domestic');
 assert.equal(libraryScopeFor({kind:'ehs'},{}),'domestic');
 assert.equal(libraryScopeFor({kind:'index'},{Project:['通用'],'Document Title':'RFQ模板'}),'general');
});
test('project document placeholders remain records in Base but are excluded from files',()=>{
 const source={id:'table',name:'项目资料',kind:'project-document',category:'projects',projectScope:'马来'};
 assert.equal(projectRecord(source,{id:'empty',cells:{'Document Code':'MY-01','Shared At':'2026-10-31'}},base),null);
 const doc=projectRecord(source,{id:'file',cells:{Summary:'移交清单','Stored Link':'https://vnet.feishu.cn/docx/example'}},base);
 assert.equal(doc.title,'移交清单');assert.equal(doc.libraryScope,'project');assert.equal(doc.projectScope,'马来');assert.equal(doc.links[0].url,'https://vnet.feishu.cn/docx/example');
});
test('equipment metadata exposes document nature separately from link type',()=>{
 const doc=projectRecord({id:'shared',name:'维保与技术资料',kind:'equipment',category:'shared'},{id:'a',cells:{'Equipment Name':'冷塔','Document Category':['设备技术规格'],'Link Type':['资料文件夹'],'Linked Document':'https://vnet.feishu.cn/drive/folder/example'}},base);
 assert.equal(doc.title,'冷塔');assert.equal(doc.nature,'设备技术规格');assert.equal(doc.format,'资料文件夹');assert.equal(doc.libraryScope,'shared');assert.equal(doc.classification,'S1.3.3');
});
test('selected project filters only its files and always retains common reference scopes',()=>{
 const docs=[{id:'th',libraryScope:'project',projectScope:'泰国'},{id:'my',libraryScope:'project',projectScope:'马来'},{id:'shared',libraryScope:'shared'},{id:'domestic',libraryScope:'domestic'}];
 assert.deepEqual(libraryDocuments(docs,{project:'malaysia'}).map(d=>d.id),['my','shared','domestic']);
 assert.deepEqual(libraryDocuments(docs,{project:'malaysia',scope:'project'}).map(d=>d.id),['my']);
 assert.equal(libraryMetrics(docs,'malaysia').project,1);
 assert.equal(libraryDocuments(docs,{project:'malaysia',scope:'shared'})[0].id,'shared');
 assert.equal(libraryDocuments(docs,{project:'malaysia',scope:'domestic'})[0].id,'domestic');
});
test('an indexed attachment without a web link opens its actual Base record',()=>{
 const doc=projectRecord({id:'index',name:'资料索引',kind:'index',category:'index'},{id:'attached',cells:{'Document Title':'合同附件',Attachments:[{name:'合同.docx',file_token:'fixture'}]}},base);
 assert.equal(doc.attachmentCount,1);assert.deepEqual(doc.links,[{label:'查看附件',url:base+'?table=index&record=attached'}]);
});
test('a clearly named Araya project file is not treated as shared just because its old scope says overseas',()=>{
 const doc=projectRecord({id:'index',kind:'index',category:'index'},{id:'araya',cells:{'Document Title':'海外项目团队组建与接维（泰国Araya/Rojana）',Project:['海外']}},base);
 assert.equal(doc.projectScope,'泰国');assert.equal(doc.libraryScope,'project');
 assert.equal(libraryDocuments([doc],{project:'malaysia'}).length,0);
 assert.equal(libraryScopeFor({kind:'index'},{'Document Title':'泰国与马来项目经验',Project:['海外']}),'shared');
});
