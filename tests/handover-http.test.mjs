import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {createHandoverHandler} from '../project-tasks/handover/http.mjs';
const actor={openId:'ou_test',name:'测试用户',project:{id:'th-001',knowledgeKey:'thailand'}};
async function fixture(t){
 let current=actor,accepted=0;
 const service={state:{operations:{}},now:Date.now,assertActor(a){if(!a)throw Object.assign(Error('请先登录'),{status:401});if(a.project.id!=='th-001')throw Object.assign(Error('项目不一致'),{status:409});},warm(){},snapshot(){return{ready:true,revision:1,records:[],schema:{},users:[],operations:[],updatedAt:Date.now()};},rawRecords(){return[];},accept(raw,a){assert.equal(a,actor);accepted++;return{operation:{id:raw.clientMutationId,status:'accepted'}};},deliverables:{uploadPlan(){return{size:4};},storeUpload(){}}};
 const handler=createHandoverHandler({root:process.cwd(),service}),server=createServer(async(req,res)=>{req.auth=current;if(!await handler(req,res)){res.writeHead(404);res.end();}});server.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));t.after(()=>new Promise(r=>server.close(r)));
 const origin=`http://127.0.0.1:${server.address().port}`;return{origin,get accepted(){return accepted;},actor(value){current=value;}};
}
test('接口独立检查登录、项目与同源；POST才受理',async t=>{
 const f=await fixture(t),url=f.origin+'/api/handover-plan/mutations',body=JSON.stringify({clientMutationId:'known',kind:'update'});
 f.actor(null);assert.equal((await fetch(f.origin+'/api/handover-plan')).status,401);f.actor({...actor,project:{id:'my-001'}});assert.equal((await fetch(f.origin+'/api/handover-plan')).status,409);f.actor(actor);
 assert.equal((await fetch(url,{method:'POST',headers:{Origin:'https://other.invalid','Content-Type':'application/json'},body})).status,403);
 assert.equal((await fetch(url,{method:'POST',headers:{Origin:f.origin,'Content-Type':'text/plain'},body})).status,415);
 const response=await fetch(url,{method:'POST',headers:{Origin:f.origin,'Content-Type':'application/json'},body});assert.equal(response.status,202);assert.equal((await response.json()).operation.status,'accepted');assert.equal(f.accepted,1);
 assert.equal((await fetch(url,{method:'DELETE',headers:{Origin:f.origin}})).status,405);
});
test('静态资源白名单不暴露源表脚本、服务端模型或配置',async t=>{
 const f=await fixture(t);for(const file of ['source.mjs','../../auth/application.json','service.mjs'])assert.equal((await fetch(f.origin+'/handover-preview/'+file)).status,404);
 const css=await fetch(f.origin+'/handover-preview/styles.css');assert.equal(css.status,200);assert.match(css.headers.get('Content-Type'),/css/);
 for(const name of ['resources','summary']){const module=await fetch(f.origin+'/project-tasks/handover/'+name+'.mjs');assert.equal(module.status,200);assert.match(module.headers.get('Content-Type'),/javascript/);}
 const page=await fetch(f.origin+'/project-management?view=handover');assert.equal(page.status,200);const html=await page.text();assert.ok(html.includes('/handover-preview/app.mjs'));
});

test('正式项目入口直接进入新版，兼容旧书签并隔离其他项目',async t=>{
 const f=await fixture(t);
 for(const route of ['/project-management?project=th-001','/project-management?view=handover','/index.html']){
  const response=await fetch(f.origin+route);assert.equal(response.status,200,route);
  const html=await response.text();assert.match(html,/\/handover-preview\/app.mjs/);assert.match(html,/tblgQsrBMFd9eeuX/);
 }
 assert.equal((await fetch(f.origin+'/project-management?project=my-001')).status,409);
 f.actor({...actor,project:{id:'my-001'}});
 assert.equal((await fetch(f.origin+'/project-management?project=my-001')).status,404);
 assert.equal((await fetch(f.origin+'/project-management?view=handover&project=my-001')).status,409);
});

test('已归档的旧任务接口不再读取或修改旧表',async t=>{
 const f=await fixture(t);
 for(const route of ['/api/base-sync','/api/project-tasks','/api/project-tasks/status']){
  const response=await fetch(f.origin+route);assert.equal(response.status,410,route);
  assert.match((await response.json()).error,/已归档/);
 }
 assert.equal(f.accepted,0);
});
