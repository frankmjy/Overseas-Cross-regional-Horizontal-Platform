import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {createServer} from 'node:http';
import {materialFields,projectMaterial,summarizeMaterials,filterMaterials,pageMaterials} from '../coordination/model.mjs';
import {materials} from '../coordination/config.mjs';
import {CoordinationAdapter,CoordinationService} from '../coordination/service.mjs';
import {createCoordinationHandler} from '../coordination/http.mjs';

const row=(id,patch={})=>projectMaterial({id,cells:{sequence:1,name:'风速仪',primary:'资产',category:'仪器仪表',requirement:'必配',region:'泰国',level:'园区',campusQuantity:1,referenceAmount:'1500',totalReferenceAmount:'2000',...patch}});
const rows=()=>[row('rec1'),row('rec2',{sequence:2,name:'安全帽',primary:'低耗',category:'安全工具',requirement:'选配',referenceAmount:'500',unitPrice:0}),row('rec3',{sequence:3,name:null,primary:null,category:null,requirement:null,referenceAmount:'',totalReferenceAmount:'0'})];

test('material projection preserves 27 business fields and distinguishes missing numbers from zero',()=>{
 const r=row('rec1',{unitPrice:0,actualAmount:'',private:'credential',guidance:['单楼1台','备用1台']});
 assert.equal(materialFields.length,27);assert.equal(r.unitPrice,0);assert.equal(r.actualAmount,null);assert.deepEqual(r.guidance,['单楼1台','备用1台']);assert.equal(r.referenceAmount,1500);assert.ok(!JSON.stringify(r).includes('credential'));
 assert.throws(()=>row('rec1',{unitPrice:'not-a-price'}),/数字/);
});
test('summary sums row amounts once and retains unnamed and unclassified records',()=>{
 const m=summarizeMaterials(rows());assert.equal(m.total,3);assert.equal(m.named,2);assert.equal(m.unnamed,1);assert.equal(m.referenceAmount,2000);assert.equal(m.required,1);assert.equal(m.optional,1);assert.equal(m.unknownRequirement,1);assert.equal(m.categories.reduce((n,g)=>n+g.count,0),3);
 assert.equal(summarizeMaterials([row('r',{referenceAmount:null})]).referenceAmount,null);
});
test('local filters compose and search covers model, brand and guidance; paging clamps bounds',()=>{
 const data=rows();data[0].brand='福禄克';data[0].model='925';data[0].guidance=['备用'];
 assert.deepEqual(filterMaterials(data,{q:'福禄克',requirement:'必配',region:'泰国'}).map(r=>r.id),['rec1']);assert.equal(filterMaterials(data,{q:'925'}).length,1);assert.equal(filterMaterials(data,{q:'备用'}).length,1);assert.equal(filterMaterials(data,{category:'__empty__'})[0].id,'rec3');assert.equal(filterMaterials(data,{requirement:'必配',primary:'低耗'}).length,0);
 assert.equal(filterMaterials(data,{sort:'amount-desc'})[0].id,'rec1');const p=pageMaterials(data,100,2);assert.equal(p.page,2);assert.equal(p.rows[0].id,'rec3');assert.equal(pageMaterials([],9,20).page,1);
});
test('adapter projects stable field IDs, validates complete pages and refuses duplicates or stalls',async()=>{
 const a=new CoordinationAdapter(materials);let calls=0;
 a.cli=async(cmd,args)=>{calls++;assert(args.includes(materials.fields.name.id));return {fields:Object.values(materials.fields).map(f=>f.name),record_id_list:['rec'+calls],data:[Object.keys(materials.fields).map(k=>k==='name'?'真实物资':null)],has_more:calls===1};};
 assert.equal((await a.list()).length,2);assert.equal(calls,2);
 a.cli=async()=>({fields:[],record_id_list:[],data:[],has_more:true});await assert.rejects(a.list(),/分页|字段/);
 calls=0;a.cli=async()=>({fields:Object.values(materials.fields).map(f=>f.name),record_id_list:['rec1'],data:[Object.keys(materials.fields).map(()=>null)],has_more:++calls===1});await assert.rejects(a.list(),/重复/);
});
test('service deduplicates refresh, keeps good cache on failure and restores it on restart',async t=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'vnet-coordination-'));t.after(()=>fs.rm(dir,{recursive:true,force:true}));let release,calls=0,fail=false;
 const adapter={list:async()=>{calls++;if(fail)throw Error('unavailable');await new Promise(r=>{release=r;});return rows();}};
 const service=new CoordinationService({config:materials,adapter,cacheFile:path.join(dir,'cache.json')});await service.init();const first=service.refresh();assert.equal(service.refresh(),first);assert.equal(service.snapshot().state,'loading');await new Promise(r=>setImmediate(r));release();await first;assert.equal(calls,1);assert.equal(service.snapshot().records.length,3);
 fail=true;await service.refresh();assert.equal(service.snapshot().state,'partial');assert.equal(service.snapshot().records.length,3);
 const restored=new CoordinationService({config:materials,adapter,cacheFile:path.join(dir,'cache.json')});await restored.init();assert.equal(restored.snapshot().records.length,3);assert.equal(restored.snapshot().state,'ready');
});
test('cache without professional field is not misrepresented as unconfirmed classification',async t=>{const dir=await fs.mkdtemp(path.join(os.tmpdir(),'coord-old-cache-'));t.after(()=>fs.rm(dir,{recursive:true,force:true}));const file=path.join(dir,'cache.json'),service=new CoordinationService({config:materials,cacheFile:file,adapter:{list:async()=>rows()}}),old=rows().map(({specialty,...rest})=>rest);await fs.writeFile(file,JSON.stringify({binding:service.binding,updatedAt:new Date().toISOString(),records:old}));await service.init();assert.equal(service.snapshot().records.length,0);assert.match(service.snapshot().error,/分类字段/);await service.refresh();assert.equal(service.snapshot().records.length,3);assert.equal(service.snapshot().error,'');});
test('coordination HTTP rejects unauthenticated writes and unknown platforms, exposes only explicit assets',async t=>{
 const handler=createCoordinationHandler({root:process.cwd(),service:{read:()=>({state:'ready',records:rows(),refreshing:false})}});const server=createServer(async(req,res)=>{if(!await handler(req,res)){res.writeHead(404);res.end();}});await new Promise(r=>server.listen(0,'127.0.0.1',r));t.after(()=>new Promise(r=>server.close(r)));const origin=`http://127.0.0.1:${server.address().port}`;
 const result=await(await fetch(origin+'/api/coordination?platform=materials')).json();assert.equal(result.ok,true);assert.equal(result.platforms[0].id,'materials');assert.equal(result.records.length,3);
 assert.equal((await fetch(origin+'/api/coordination?platform=unknown')).status,404);assert.equal((await fetch(origin+'/api/coordination',{method:'POST'})).status,401);assert.equal((await fetch(origin+'/api/coordination',{method:'HEAD'})).status,200);
 for(const route of ['/cross-coordination','/coordination/model.mjs'])assert.equal((await fetch(origin+route)).status,200,route);
 for(const route of ['/coordination/config.mjs','/coordination/service.mjs','/coordination/unknown'])assert.equal((await fetch(origin+route)).status,404,route);
});
test('legacy authenticated role retains editing; explicit read-only permission remains denied',async t=>{const handler=createCoordinationHandler({root:process.cwd(),service:{read:()=>({records:[]})}}),server=createServer(async(req,res)=>{if(req.headers['x-test-role'])req.auth={openId:'ou_test',...(req.headers['x-test-role']==='readonly'?{permissions:{materials:{view:true,edit:false}}}:{})};await handler(req,res);});await new Promise(r=>server.listen(0,'127.0.0.1',r));t.after(()=>new Promise(r=>server.close(r)));const origin=`http://127.0.0.1:${server.address().port}`;assert.equal((await(await fetch(origin+'/api/coordination',{headers:{'x-test-role':'legacy'}})).json()).capabilities.edit,true);assert.equal((await(await fetch(origin+'/api/coordination',{headers:{'x-test-role':'readonly'}})).json()).capabilities.edit,false);assert.equal((await fetch(origin+'/api/coordination',{method:'POST',headers:{'x-test-role':'readonly',Origin:origin,'Content-Type':'application/json'},body:'{}'})).status,403);});
