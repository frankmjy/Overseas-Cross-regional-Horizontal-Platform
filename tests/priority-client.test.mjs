import test from 'node:test';
import assert from 'node:assert/strict';
import { createPriorityClient } from '../src/priority-live.js';
const json=(value,status=200)=>new Response(JSON.stringify(value),{status,headers:{'content-type':'application/json'}});
function environment(t){const before={window:globalThis.window,fetch:globalThis.fetch};const store=new Map();globalThis.window={sessionStorage:{getItem:key=>store.get(key)||null,setItem:(key,value)=>store.set(key,value),removeItem:key=>store.delete(key)},addEventListener(){}};t.after(()=>{if(before.window===undefined)delete globalThis.window;else globalThis.window=before.window;globalThis.fetch=before.fetch;});return store;}
test('formal client persists the mutation before submitting and returns accepted content before slow files',async t=>{
 const store=environment(t);let releaseUpload,uploadStarted=false;const pendingUpload=new Promise(resolve=>releaseUpload=resolve);const paths=[];
 globalThis.fetch=async(url,options)=>{paths.push(url);if(url.includes('/uploads?')){uploadStarted=true;return pendingUpload;}if(options?.method==='POST'){assert.equal(store.size,1);return json({ok:true,ready:true,items:[{id:'pending-one',title:'已受理事项'}],operation:{id:'one',status:'accepted'}});}return json({ok:true,ready:true,items:[{id:'recOne'}]});};
 let changes=0;const client=createPriorityClient('my-001',()=>changes++);t.after(()=>client.close());const file=new File(['QA'],'QA.txt');const saved=await client.save({project:'my-001',clientMutationId:'one',values:{}},new Map([['file-one',file]]));
 assert.equal(saved.operation.status,'accepted');assert.equal(client.snapshot.items[0].title,'已受理事项');assert.equal(store.size,0);assert.equal(uploadStarted,true);assert(paths.every(url=>url.includes('project=my-001')));
 releaseUpload(json({ok:true},201));await new Promise(resolve=>setImmediate(resolve));assert(changes>=1);client.close();const prior=changes;await client.refresh();assert.equal(changes,prior);
});
test('uncertain responses retain the same mutation; definite validation failures clear it',async t=>{
 const store=environment(t),client=createPriorityClient('th-001',()=>{}),raw={project:'th-001',clientMutationId:'stable-id',values:{title:'test'}};t.after(()=>client.close());
 globalThis.fetch=async()=>{throw Error('network interrupted');};await assert.rejects(client.save(raw,new Map()),/network/);assert.equal(JSON.parse([...store.values()][0]).clientMutationId,'stable-id');
 await assert.rejects(client.save({...raw,clientMutationId:'another'},new Map()),/上次提交/);
 globalThis.fetch=async()=>json({ok:false,error:'请选择责任人'},400);await assert.rejects(client.save(raw,new Map()),/责任人/);assert.equal(store.size,0);
});
