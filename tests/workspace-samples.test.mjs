import test from 'node:test';
import assert from 'node:assert/strict';
import {projectSnapshotTable,safeSourceUrl,summarizeReadiness,normalizePriority} from '../samples/model.mjs';
import {createPreviewServer} from '../samples/preview.mjs';

test('snapshot preserves blank execution values and excludes people, tokens and unknown fields',()=>{
 const table=projectSnapshotTable({table:{id:'tblABC123',name:'02.03.01 Initialization Work（初始化工作）',primary_field:'fldtitle'},fields:[{id:'fldtitle',name:'Work Item（工作内容）',type:'text'},{id:'fldmethod',name:'Method（实施方法）',type:'text'},{id:'fldstatus',name:'Site Progress（现场工作进度）',type:'select'},{id:'fldperson',name:'Executor（执行人）',type:'user'},{id:'fldphone',name:'Phone（电话）',type:'text'},{id:'fldsecret',name:'Migration Key（迁移标识）',type:'text'}],rows:[{recordId:'recABC','Work Item（工作内容）':'阀门检查','Method（实施方法）':'逐项检查','Site Progress（现场工作进度）':null,'Executor（执行人）':[{id:'ou_private'}],'Phone（电话）':'private-phone','Migration Key（迁移标识）':'private-key'}]}, {base:'CID8b8V7CaCtKesWGFKcHTdqnlc',kind:'initialization',project:'thailand',code:'02.03.01'});
 assert.equal(table.rows[0].title,'阀门检查');assert.equal(table.rows[0].method,'逐项检查');assert.equal(table.rows[0].status,'');
 assert(!JSON.stringify(table).includes('private'));assert(!JSON.stringify(table).includes('执行人'));
 assert.equal(summarizeReadiness(table.rows).unfilled,1);assert.equal(summarizeReadiness(table.rows).completed,0);
 assert.match(table.rows[0].url,/table=tblABC123&record=recABC/);
});

test('only Feishu source URLs are allowed, including Markdown links',()=>{
 assert.equal(safeSourceUrl('javascript:alert(1)'),'');assert.equal(safeSourceUrl('https://vnet.feishu.cn.evil.example/docx/a'),'');
 assert.equal(safeSourceUrl('[资料](https://vnet.feishu.cn/docx/example)'),'https://vnet.feishu.cn/docx/example');
 assert.equal(safeSourceUrl('https://evil.example/'),'');
});

test('unfilled progress never becomes completed and not-applicable remains separate',()=>{
 assert.deepEqual(summarizeReadiness([{status:''},{status:'已完成-待审核'},{status:'进行中'},{status:'不涉及-待审核'}]),{total:4,unfilled:1,completed:1,inProgress:1,notApplicable:1});
});
test('source priority PO using letter O counts as P0 without changing source records',()=>{
 assert.equal(normalizePriority('PO-优高'),'P0-优高');assert.equal(normalizePriority('P0-高优'),'P0-高优');assert.equal(normalizePriority('P1-一般'),'P1-一般');assert.equal(normalizePriority(''),'');
});

test('preview serves only allowlisted resources and rejects write methods and traversal',async()=>{
 const server=createPreviewServer();await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 try{const base='http://127.0.0.1:'+server.address().port;
  assert.equal((await fetch(base+'/model.mjs')).status,200);
  assert.equal((await fetch(base+'/model.mjs',{method:'POST'})).status,405);
  assert.equal((await fetch(base+'/%2e%2e%2fpackage.json')).status,404);
  assert.equal((await fetch(base+'/reports/source-references-20261018/migration-ledger.json')).status,404);
 }finally{await new Promise(resolve=>server.close(resolve));}
});
