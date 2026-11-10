import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {AuthService} from '../auth/service.mjs';
import {PageAccess,pageCatalog,routeAccess} from '../auth/page-access.mjs';
import {createAuthHandler} from '../auth/http.mjs';
const binding=JSON.parse(fs.readFileSync(new URL('../auth/application.json',import.meta.url))),origin='https://localhost:3333';
async function fixture(t){const dir=fs.mkdtempSync(path.join(os.tmpdir(),'vnet-access-')),config=()=>({appId:binding.appId,appSecret:'fixture',origins:[origin]});let identity={open_id:'ou_reader',name:'只读用户'};const auth=new AuthService({dir,config,oauth:async()=>identity});const login=async(user)=>{identity=user;const s=auth.begin(origin,'/project-management','th-001');return auth.finish(origin,s.state,s.browser,'code');};const reader=await login(identity),admin=await login({open_id:binding.recipient,name:'马进宇'}),access=new PageAccess({auth}),handler=createAuthHandler({service:auth,access,root:process.cwd(),canBootstrap:()=>false});t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));return {auth,access,reader,admin,login,handler,dir,config};}
const rights=(extra={})=>Object.fromEntries(pageCatalog.map(p=>[p.id,{view:p.id==='materials',edit:false,...extra[p.id]}]));
const response=()=>({headers:{},setHeader(k,v){this.headers[k.toLowerCase()]=v;},writeHead(status,headers={}){this.status=status;Object.entries(headers).forEach(([k,v])=>this.setHeader(k,v));},end(body=''){this.body=body;}});
const request=(url,token,extra={})=>({url,method:'GET',socket:{encrypted:true,remoteAddress:'192.0.2.4'},headers:{host:'localhost:3333',cookie:`__Host-vnet_session=${token}`,origin,...extra.headers},...Object.fromEntries(Object.entries(extra).filter(([k])=>k!=='headers'))});
test('effective availability lists never-logged-in people and permits configuring only current members',async t=>{
 const {auth,admin}=await fixture(t);
 let writable=true;
 const access=new PageAccess({auth,availability:{snapshot:()=>({writable,people:[{openId:'ou_new',name:'未登录人员'}]})}});
 assert.deepEqual(access.list().people.map(p=>p.name),['未登录人员']);
 assert.deepEqual(access.summary({openId:'ou_new'}).permissions,rights());
 const raw={clientMutationId:randomUUID(),openId:'ou_new',revision:0,permissions:rights({knowledge:{view:true,edit:false}})};
 assert.throws(()=>access.save({...raw,openId:'ou_reader'},admin.user),{status:400});
 const saved=access.save(raw,admin.user);
 writable=false;
 assert.deepEqual(access.save(raw,admin.user),saved);
 assert.throws(()=>access.save({...raw,clientMutationId:randomUUID(),revision:1},admin.user),{status:412});
 assert.equal(access.summary({openId:'ou_new'}).permissions.knowledge.view,true);
});
test('new authenticated people default to materials view only; server denies writes and other page APIs',async t=>{const f=await fixture(t);for(const [url,method,expected]of [['/cross-coordination?project=th-001','GET',false],['/api/coordination','GET',false],['/api/coordination','POST',true],['/api/coordination/retry','POST',true],['/api/research','GET',true],['/api/knowledge','GET',true],['/api/handover-plan','GET',true],['/api/staffing','POST',true],['/api/new-module','GET',true],['/assets/vnet-thailand-organization.svg','GET',true],['/assets/malaysia-team-comparison.svg','GET',true],['/src/data.js','GET',true]]){const res=response(),handled=await f.handler(request(url,f.reader.token,{method}),res);assert.equal(handled,expected,url);if(expected)assert.equal(res.status,403,url);}const r=response();await f.handler(request('/api/auth/session',f.reader.token),r);const s=JSON.parse(r.body);assert.deepEqual(s.permissions,rights());assert.equal(s.home,'/cross-coordination');});
test('permissions require actual current-app administrator and known person, preserve identity and prevent lockout',async t=>{const {access,admin}=await fixture(t),raw={clientMutationId:randomUUID(),openId:'ou_reader',revision:0,permissions:rights({knowledge:{view:true,edit:true}})};assert.throws(()=>access.save(raw,{openId:'ou_other',name:'马进宇'}),{status:403});assert.throws(()=>access.save({...raw,openId:'ou_unknown'},admin.user),{status:400});assert.throws(()=>access.save({...raw,openId:binding.recipient},admin.user),{status:400});assert.throws(()=>access.save({...raw,permissions:rights({knowledge:{view:false,edit:true}})},admin.user),{status:400});access.save(raw,admin.user);assert.equal(access.summary(admin.user).permissions.knowledge.edit,true);assert.equal(access.summary({openId:'ou_reader'}).permissions.knowledge.edit,true);});
test('successful grants persist across restart and lost responses; stale revisions and storage failures do not silently change grants',async t=>{const f=await fixture(t),raw={clientMutationId:randomUUID(),openId:'ou_reader',revision:0,permissions:rights({materials:{view:true,edit:true}})},saved=f.access.save(raw,f.admin.user);assert.equal(f.access.save(raw,f.admin.user).revision,saved.revision);assert.throws(()=>f.access.save({...raw,clientMutationId:randomUUID()},f.admin.user),{status:409});assert.throws(()=>f.access.save({...raw,revision:1},f.admin.user),{status:409});const again=new AuthService({dir:f.dir,config:f.config}),access=new PageAccess({auth:again});assert.equal(access.summary({openId:'ou_reader'}).permissions.materials.edit,true);const prior=again.file;again.file=f.dir;assert.throws(()=>access.save({...raw,clientMutationId:randomUUID(),revision:1,permissions:rights()},f.admin.user),{status:503});again.file=prior;assert.equal(access.summary({openId:'ou_reader'}).permissions.materials.edit,true);});
test('revocation applies to an already active session, encoded paths and forged roles cannot bypass it',async t=>{const f=await fixture(t);const grant={clientMutationId:randomUUID(),openId:'ou_reader',revision:0,permissions:rights({knowledge:{view:true,edit:true}})};f.access.save(grant,f.admin.user);let r=response();assert.equal(await f.handler(request('/api/knowledge/documents/create',f.reader.token,{method:'POST'}),r),false);f.access.save({...grant,revision:1,clientMutationId:randomUUID(),permissions:rights()},f.admin.user);for(const url of ['/api/knowledge/documents/create','/api/%6bnowledge/documents/create']){r=response();await f.handler(request(url,f.reader.token,{method:'POST',headers:{'x-admin':'true'}}),r);assert.equal(r.status,403);}assert.deepEqual(routeAccess(new URL('/api/knowledge/meetings','https://fixture'),'GET').pages,['meetings']);});
test('login routes select an allowed destination without hiding explicit forbidden page errors',async t=>{const f=await fixture(t),r=response();await f.handler(request('/login?returnTo=%2Fproject-management',f.reader.token),r);assert.equal(r.status,303);assert.match(r.headers.location,/^\/cross-coordination/);const denied=response();await f.handler(request('/knowledge-sharing?project=thailand',f.reader.token),denied);assert.equal(denied.status,403);assert.match(String(denied.body),/无权/);});

test('permissions are scoped to application identity and same-name users stay distinct',async t=>{const f=await fixture(t);f.access.save({clientMutationId:randomUUID(),openId:'ou_reader',revision:0,permissions:rights({knowledge:{view:true,edit:true}})},f.admin.user);f.auth.config=()=>({...f.config(),appId:'cli_other'});assert.deepEqual(f.access.summary({openId:'ou_reader'}).permissions,rights());assert.equal(f.access.people().length,0);assert.equal(f.access.summary({openId:binding.recipient,name:'马进宇'}).permissions.knowledge.edit,false);});

test('ordinary read-only grants cover every page while methods distinguish view and edit',async t=>{const f=await fixture(t),all=rights(Object.fromEntries(pageCatalog.map(p=>[p.id,{view:true,edit:false}])));f.access.save({clientMutationId:randomUUID(),openId:'ou_reader',revision:0,permissions:all},f.admin.user);for(const path of ['/api/coordination','/api/research/operations','/api/handover-plan','/api/project-tasks','/api/priorities','/api/staffing','/api/knowledge/documents/options','/api/knowledge/meetings/options']){assert.equal(f.access.allows(new URL(path,origin),'GET',f.reader.user),true,path);for(const method of ['POST','PUT','PATCH','DELETE'])assert.equal(f.access.allows(new URL(path,origin),method,f.reader.user),false,path+method);}assert.equal(f.access.allows(new URL('/admin',origin),'GET',f.reader.user),false);});

test('shared knowledge feed trims the ungranted module and its source metadata',async()=>{const {scopeKnowledgeAccess}=await import('../knowledge/http.mjs');const snapshot={documents:[{id:'doc'}],meetings:[{id:'meeting'}],sources:[{id:'d',kind:'document'},{id:'m',kind:'meeting'}],categories:[{id:'secret'}],directoryNodes:[{id:'directory'}],templates:[{title:'template'}],projectLibraries:[{name:'library'}]};const m=scopeKnowledgeAccess(snapshot,rights({meetings:{view:true,edit:false}}));assert.deepEqual(m.documents,[]);assert.deepEqual(m.meetings,snapshot.meetings);assert.deepEqual(m.sources,[{id:'m',kind:'meeting'}]);assert.deepEqual(m.directoryNodes,[]);assert.deepEqual(m.templates,[]);const d=scopeKnowledgeAccess(snapshot,rights({knowledge:{view:true,edit:false}}));assert.deepEqual(d.meetings,[]);assert.deepEqual(d.documents,snapshot.documents);assert.equal(d.capabilities.knowledgeEdit,false);});

test('admin permissions endpoint requires authenticated administrator, session CSRF and durable save',async t=>{const {createAdminHandler}=await import('../auth/admin-http.mjs');const {Readable}=await import('node:stream');const f=await fixture(t),handler=createAdminHandler({root:process.cwd(),access:f.access,reader:{read:()=>({refreshing:false,error:''})}}),raw={clientMutationId:randomUUID(),openId:'ou_reader',revision:0,permissions:rights({staffing:{view:true,edit:true}})};async function invoke(user,csrf){const req=Readable.from([Buffer.from(JSON.stringify(raw))]);Object.assign(req,{method:'POST',url:'/api/admin/permissions',auth:user,adminCsrf:f.admin.csrf,headers:{host:'localhost:3333',origin,'content-type':'application/json','x-csrf-token':csrf}});const r=response();await handler(req,r);return r;}assert.equal((await invoke({...f.reader.user,isAdmin:false},f.admin.csrf)).status,403);assert.equal((await invoke({...f.admin.user,isAdmin:true},'wrong')).status,403);const saved=await invoke({...f.admin.user,isAdmin:true},f.admin.csrf);assert.equal(saved.status,200);assert.equal(f.access.summary(f.reader.user).permissions.staffing.edit,true);const gate=response();await f.handler(request('/api/admin/permissions',f.admin.token,{method:'POST'}),gate);assert.equal(gate.status,403);});

test('revoking all page access produces an explicit denial instead of a login redirect loop',async t=>{const f=await fixture(t);f.access.save({clientMutationId:randomUUID(),openId:'ou_reader',revision:0,permissions:rights(Object.fromEntries(pageCatalog.map(p=>[p.id,{view:false,edit:false}]))) },f.admin.user);assert.equal(f.access.summary(f.reader.user).home,null);const r=response();await f.handler(request('/login?returnTo=%2Fproject-management',f.reader.token),r);assert.equal(r.status,403);assert.match(r.body,/尚未分配/);});

test('delegated administrators inherit access immediately but only the owner can manage their role',async t=>{
 const f=await fixture(t),other=await f.login({open_id:'ou_other',name:'普通用户'});
 const submit=(user,revision,changes)=>({clientMutationId:randomUUID(),openId:user.openId,revision,...changes});
 const assigned=rights({knowledge:{view:true,edit:false}});
 f.access.save(submit(f.reader.user,0,{permissions:assigned}),f.admin.user);
 const promote=submit(f.reader.user,1,{subAdmin:true});
 assert.throws(()=>f.access.save(promote,f.reader.user),{status:403});
 const saved=f.access.save(promote,f.admin.user);
 assert.equal(saved.adminRole,'sub');
 assert.deepEqual(f.access.save(promote,f.admin.user),saved);
 const r=response();
 await f.handler(request('/api/auth/session',f.reader.token),r);
 const session=JSON.parse(r.body);
 assert.equal(session.user.name,'只读用户');
 assert.equal(session.isAdmin,true);
 assert.equal(session.canManageSubAdmins,false);
 assert.ok(Object.values(session.permissions).every(right=>right.view&&right.edit));
 for(const route of ['/admin','/api/admin/login-records','/api/application-settings','/api/handover-plan']){
  const req=request(route,f.reader.token);
  assert.equal(await f.handler(req,response()),false,route);
  assert.equal(req.auth.isAdmin,true);
 }
 assert.throws(()=>f.access.save(submit(other.user,0,{subAdmin:true,permissions:rights()}),f.reader.user),{status:403});
 assert.throws(()=>f.access.save(submit(f.reader.user,2,{subAdmin:false}),f.reader.user),{status:403});
 assert.throws(()=>f.access.save(submit(f.admin.user,0,{permissions:rights()}),f.reader.user),{status:400});
 f.access.save(submit(other.user,0,{permissions:assigned}),f.reader.user);
 assert.deepEqual(f.access.summary(other.user).permissions,assigned);
 const restarted=new PageAccess({auth:new AuthService({dir:f.dir,config:f.config})});
 assert.equal(restarted.summary(f.reader.user).isAdmin,true);
 restarted.auth.config=()=>({...f.config(),appId:'cli_other'});
 assert.equal(restarted.summary(f.reader.user).isAdmin,false);
 assert.throws(()=>f.access.save(submit(f.reader.user,1,{subAdmin:false}),f.admin.user),{status:409});
 f.access.save(submit(f.reader.user,2,{subAdmin:false}),f.admin.user);
 const denied=response();
 await f.handler(request('/admin',f.reader.token),denied);
 assert.equal(denied.status,403);
 assert.deepEqual(f.access.summary(f.reader.user).permissions,assigned);
});
