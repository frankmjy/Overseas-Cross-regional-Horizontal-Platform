import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {ResearchService} from '../research/service.mjs';
import {createResearchHandler} from '../research/http.mjs';
import {createProjectResearchHandler} from '../research/projects.mjs';

test('HTTP mutations, retries and uploads stay inside the selected formal project',async t=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'research-formal-http-')),services={};
 for(const key of ['thailand','malaysia']){
  const base={list:async table=>table==='topics'?[{专题名称:'组织与人才'}]:[]};
  const service=new ResearchService({dir:path.join(dir,key),base,autoRun:false,project:{key,name:key},binding:key});await service.init();await service.refresh();services[key]=service;
 }
 const handler=createProjectResearchHandler({defaultProject:'malaysia',handlers:Object.fromEntries(Object.entries(services).map(([key,service])=>[key,createResearchHandler({root:path.resolve('.'),service,projectOptions:()=>Object.values(services).map(s=>({...s.project,categories:s.snapshot().categories}))})]))});
 const server=createServer(async(req,res)=>{if(!await handler(req,res)){res.writeHead(404);res.end();}});await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const origin=`http://127.0.0.1:${server.address().port}`;
 t.after(async()=>{await new Promise(resolve=>server.close(resolve));await Promise.all(Object.values(services).map(s=>s.close()));await fs.rm(dir,{recursive:true,force:true});});
 const payload={kind:'question',clientMutationId:'be4433e5-e079-4a2f-8c9b-9d8479cb4a0d',project:'malaysia',applicability:'通用',title:'QA通用问题',category:'组织与人才'};
 const post=(url,data)=>fetch(origin+url,{method:'POST',headers:{origin,'content-type':'application/json'},body:JSON.stringify(data)});
 assert.equal((await post('/api/research/operations',payload)).status,400);
 assert.equal((await post('/api/research/operations?project=thailand',payload)).status,400);
 const accepted=await post('/api/research/operations?project=malaysia',payload);assert.equal(accepted.status,202);const result=await accepted.json();assert.equal(result.data.project.key,'malaysia');assert.equal(result.data.questions[0].applicability,'通用');
 assert.equal(Object.keys(services.malaysia.state.operations).length,1);assert.equal(Object.keys(services.thailand.state.operations).length,0);
 assert.equal((await post('/api/research/operations?project=malaysia',payload)).status,202);assert.equal(Object.keys(services.malaysia.state.operations).length,1);
 assert.equal((await fetch(`${origin}/api/research/operations/${payload.clientMutationId}?project=thailand`)).status,404);
 assert.equal((await post(`/api/research/operations/${payload.clientMutationId}/retry?project=thailand`,{})).status,404);
 const fileId='cec433e5-e079-4a2f-8c9b-9d8479cb4a0d';const upload=await fetch(`${origin}/api/research/uploads?project=malaysia&name=QA.txt`,{method:'POST',headers:{origin,'content-type':'application/octet-stream','x-upload-id':fileId},body:'QA bytes'});assert.equal(upload.status,201);
 assert.equal((await fetch(`${origin}/api/research/local-files/${fileId}?project=thailand`)).status,404);
 assert.equal(services.thailand.state.uploads[fileId],undefined);assert(services.malaysia.state.uploads[fileId]);
 const read=await(await fetch(`${origin}/api/research?project=thailand`)).json();assert.equal(read.data.project.key,'thailand');assert.equal(read.data.questions.length,0);assert.equal(read.projects.length,2);
});
