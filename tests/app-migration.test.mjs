import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { scopeIdentityCache } from '../auth/identity-cache.mjs';
import { AuthService } from '../auth/service.mjs';
import { ApplicationSettings } from '../application-settings.mjs';
import { MeetingService } from '../knowledge/meeting-service.mjs';
import { ProjectTaskService } from '../project-tasks/service.mjs';

test('cross-app cache scope clears personnel but preserves completed operations',()=>{
  const state={appId:'cli_old',people:[{id:'ou_old'}],schemas:{thailand:{}},operations:{done:{status:'success'}}};
  const next=scopeIdentityCache(state,'cli_new',{people:[],schemas:{}});
  assert.deepEqual(next.people,[]);assert.deepEqual(next.schemas,{});
  assert.equal(next.appId,'cli_new');assert.deepEqual(next.operations,state.operations);
  assert.equal(state.people[0].id,'ou_old');
  assert.equal(scopeIdentityCache(next,'cli_new',{people:[]}),null);
});

test('pending and failed old-app mutations cannot be rebound to a new app',()=>{
  for(const status of ['accepted','syncing','error','blocked']){
    const state={appId:'cli_old',records:[{user:'ou_old'}],operations:{pending:{status}}};
    assert.throws(()=>scopeIdentityCache(state,'cli_new',{records:[]}),/未同步/);
    assert.equal(state.appId,'cli_old');assert.equal(state.records.length,1);
  }
  assert.throws(()=>scopeIdentityCache({operations:{legacy:{status:'error'}}},'cli_new',{}),/未同步/);
});

test('an app change invalidates sessions and does not replay an old login identity under the new app',async t=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'vnet-auth-migration-'));
  t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
  const origin='https://localhost:3333';let appId='cli_old';const writes=[];
  const service=new AuthService({dir,config:()=>({appId,appSecret:'fixture-secret',origins:[origin]}),oauth:async()=>({open_id:appId==='cli_old'?'ou_old_user':'ou_new_user',name:'测试人员'}),sink:{async sync(event){writes.push(event.user.openId);return 'rec_fixture';}}});
  const begin=service.begin(origin,'/');const old=await service.finish(origin,begin.state,begin.browser,'fixture-code');
  appId='cli_new';assert.equal(service.session(old.token),null);
  await service.flush();assert.deepEqual(writes,[]);
  const fresh=service.begin(origin,'/');await service.finish(origin,fresh.state,fresh.browser,'fixture-code');
  await service.flush();assert.deepEqual(writes,['ou_new_user']);
  assert.equal(Object.values(service.state.events).find(e=>e.user.openId==='ou_old_user').syncStatus,'pending');
});

test('app migration guard runs before persisting or applying the new credentials',async t=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'vnet-settings-migration-'));
  t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
  let allowed=true,applied=0;
  const settings=new ApplicationSettings({dir,verify:async()=>{},apply:async()=>{applied++;},canSwitchApp:()=>allowed});
  await settings.save({appId:'cli_old',appSecret:'fixture-secret',clientMutationId:'ffdd6084-cf5a-4ec1-9eaf-44f7db90f1e7'});
  const original=fs.readFileSync(settings.file);
  allowed=false;
  await assert.rejects(settings.save({appId:'cli_new',appSecret:'fixture-new',clientMutationId:'abcd6084-cf5a-4ec1-9eaf-44f7db90f1e7'}),/未同步/);
  assert.equal(applied,1);assert.deepEqual(fs.readFileSync(settings.file),original);
});

test('meeting options and task snapshots discard old-app personnel caches before serving the new app',async t=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'vnet-people-migration-'));
  t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
  const meeting=new MeetingService({dir,config:{baseToken:'fixture',sources:[]},appId:()=> 'cli_new'});
  meeting.init();t.after(()=>meeting.close());
  meeting.commit(s=>{s.appId='cli_old';s.people=[{id:'ou_old',name:'旧缓存'}];s.schemas={old:{}};});
  assert.deepEqual(meeting.options().people,[]);assert.equal(meeting.state.appId,'cli_new');
  const tasks=new ProjectTaskService({dir:path.join(dir,'tasks'),appId:()=> 'cli_new'});
  tasks.commit(s=>{s.appId='cli_old';s.records=[{recordId:'rec_old','Owner':['ou_old']}];s.schema={old:true};});
  assert.deepEqual(tasks.snapshot().users,[]);assert.equal(tasks.state.records.length,0);assert.equal(tasks.state.schema,null);
  tasks.commit(s=>{s.appId='cli_old';s.operations={unfinished:{status:'error'}};});
  assert.throws(()=>tasks.snapshot(),/未同步/);
});
