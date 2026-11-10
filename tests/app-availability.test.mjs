import test from 'node:test';
import assert from 'node:assert/strict';
import {AppAvailability,readAppAvailability} from '../auth/app-availability.mjs';

test('effective roster follows pages, removes explicit denies and resolves only authorized IDs',async()=>{
 const calls=[];
 const fetcher=async(url,options)=>{
  const {pathname,searchParams}=new URL(url);
  calls.push(pathname);
  const data=pathname.endsWith('/internal')?{tenant_access_token:'fixture'}:pathname.endsWith('/visibility')?{data:searchParams.has('user_page_token')?{
   is_visible_to_all:0,has_more_users:0,users:[{open_id:'ou_a'},{open_id:'ou_b'}],invisible_users:[{open_id:'ou_deny'}]
  }:{is_visible_to_all:0,has_more_users:1,user_page_token:'next',users:[{open_id:'ou_a'},{open_id:'ou_deny'}]}}:{data:{users:[...JSON.parse(options.body).user_ids.reverse().map(user_id=>({user_id,name:user_id.toUpperCase()})),{user_id:'ou_other',name:'其他人员'}]}};
  return Response.json({code:0,...data});
 };
 const result=await readAppAvailability({appId:'cli_fixture',appSecret:'fixture'},{fetcher});
 assert.deepEqual(result.people,[{openId:'ou_a',name:'OU_A'},{openId:'ou_b',name:'OU_B'}]);
 assert.equal(calls.filter(x=>x.endsWith('/visibility')).length,2);
});

test('indirect visibility cannot be reported as a complete roster',async()=>{
 const fetcher=async url=>Response.json({code:0,...(url.endsWith('/internal')?{tenant_access_token:'fixture'}:{data:{is_visible_to_all:0,has_more_users:0,groups:[{id:'group1'}],users:[{open_id:'ou_a'}]}})});
 await assert.rejects(readAppAvailability({appId:'cli_fixture',appSecret:'fixture'},{fetcher}),/部门|用户组/);
});

test('a failed refresh preserves the display snapshot, disables writes and never crosses app bindings',async()=>{
 let appId='cli_first',fail=false;
 const roster=new AppAvailability({auth:{config:()=>({appId})},read:async()=>{
  if(fail)throw Error('upstream failed');return {people:[{openId:'ou_a',name:'某人'}]};
 }});
 assert.equal(roster.snapshot().writable,false);
 await roster.refreshIfNeeded();
 assert.equal(roster.snapshot().writable,true);
 fail=true;
 await roster.refreshIfNeeded(true);
 assert.equal(roster.snapshot().people.length,1);
 assert.equal(roster.snapshot().writable,false);
 assert.match(roster.snapshot().error,/上次名单/);
 appId='cli_second';
 assert.deepEqual(roster.snapshot().people,[]);
 assert.equal(roster.snapshot().writable,false);
});
