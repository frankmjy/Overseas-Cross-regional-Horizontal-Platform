import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { ResearchService } from '../research/service.mjs';
import { loadWorkspace } from '../research/web/startup.mjs';
import fs from 'node:fs/promises';
import vm from 'node:vm';

const deferred = () => { let resolve, reject; const promise = new Promise((a,b) => { resolve=a; reject=b; }); return { promise, resolve, reject }; };
test('one failed data request still paints the other source and keeps the missing source explicit',async()=>{
 let results;const projects=[{key:'thailand'},{key:'malaysia'}];
 await loadWorkspace({projects,read:async(route,key)=>{if(route.endsWith('/operations'))return {operations:[]};if(key==='thailand')throw Error('source offline');return {data:{project:{key}}};},onSnapshot:value=>results=value});
 assert.match(results[0].error,/offline/);assert.equal(results[1].data.project.key,'malaysia');
});
test('a task that finishes after the first snapshot reconciles its final row before idle polling stops',async()=>{
 const snapshots=[],operation={id:'mutation',status:'success'};let reads=0;
 const batches=await loadWorkspace({projects:[{key:'overseas'}],read:async route=>route.endsWith('/operations')?{operations:[operation]}:{data:{project:{key:'overseas'},questions:[{id:'Q-1',...(++reads===1?{sync:{operationId:'mutation',status:'syncing'}}:{})}]}},onSnapshot:results=>snapshots.push(results)});
 assert.equal(reads,2);assert.equal(snapshots.length,2);assert.equal(batches[0].result.data.questions[0].sync,undefined);
});
test('startup timeout ends busy animation and exposes retry instead of spinning forever', async () => {
 const source=(await fs.readFile(new URL('../research/web/app.mjs',import.meta.url),'utf8')).replace('const platformProject = await requirePlatformProject();', 'const platformProject = {id: "my-001", name: "马来项目", researchKey: "malaysia"};')
    .replace(/^import .+;$/gm,'').replace(/^poll\(\);$/m,'');
 const surface={dataset:{},addEventListener(){},setAttribute(key,value){this[key]=value;}};
 const title={},message={},retry={},nodes={'#startupTitle':title,'#startupMessage':message,'[data-initial-retry]':retry};
 const context=vm.createContext({URLSearchParams,location:{search:''},researchProjects:[{key:'malaysia'}],rangeOptions:[],setTimeout,clearTimeout,document:{querySelector:key=>nodes[key]||surface,addEventListener(){}},window:{addEventListener(){}}});
 vm.runInContext(source+'\nglobalThis.draw=renderStartup;',context);
 context.draw({timedOut:true});assert.equal(surface['aria-busy'],'false');assert.equal(surface.dataset.state,'error');assert.equal(retry.hidden,false);assert.match(title.textContent,/超出预期/);
 context.draw();assert.equal(surface['aria-busy'],'true');assert.equal(retry.hidden,true);assert.doesNotMatch(title.textContent+message.textContent,/多维表|飞书|本地/);
});
test('ready research content paints before delayed operation requests complete', async () => {
 const operations=deferred(),painted=[],projects=[{key:'thailand'},{key:'malaysia'}];
 const pending=loadWorkspace({projects,read:(route,key)=>route.endsWith('/operations')?operations.promise:Promise.resolve({data:{project:{key}}}),onSnapshot:results=>painted.push(results)});
 await new Promise(resolve=>setImmediate(resolve));
 assert.equal(painted.length,1);assert.equal(painted[0].length,2);
 operations.resolve({operations:[]});const batches=await pending;assert.equal(batches.length,2);assert.equal(batches[0].result.data.project.key,'thailand');
});
test('operation failures remain explicit after content paints, and cross-project data never paints', async () => {
 const jobs=deferred();let paints=0;
 const pending=loadWorkspace({projects:[{key:'thailand'}],read:route=>route.endsWith('/operations')?jobs.promise:Promise.resolve({data:{project:{key:'thailand'}}}),onSnapshot:()=>paints++});
 await new Promise(resolve=>setImmediate(resolve));assert.equal(paints,1);jobs.reject(Error('jobs unavailable'));await assert.rejects(pending,/jobs unavailable/);
 await assert.rejects(loadWorkspace({projects:[{key:'thailand'}],read:route=>Promise.resolve(route.endsWith('/operations')?{operations:[]}:{data:{project:{key:'malaysia'}}}),onSnapshot:()=>assert.fail('wrong project painted')}),/项目|source/i);
});
test('cold research reads overlap independent tables while findings precede evidence', async t => {
 const dir=await mkdtemp(path.join(os.tmpdir(),'research-startup-'));
 const question=deferred(),finding=deferred(),started=[];
 const base={list:async table=>{started.push(table);if(table==='questions')await question.promise;if(table==='findings')await finding.promise;return[];}};
 const service=new ResearchService({dir,base,autoRun:false});await service.init();t.after(async()=>{await service.close();await rm(dir,{recursive:true,force:true});});
 const refresh=service.refresh();await new Promise(resolve=>setImmediate(resolve));assert.deepEqual(started,['questions','findings']);assert.equal(service.snapshot(),null);
 finding.resolve();await new Promise(resolve=>setImmediate(resolve));assert(started.includes('evidence'));assert(!started.includes('topics'));
 question.resolve();await refresh;assert(service.snapshot());
});
