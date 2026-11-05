const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {sha}=require('./transaction.cjs'),{units}=require('./make-draft.cjs');

test('authenticated health supports the login portal while retaining all other redirect gates',async()=>{
 const {authenticatedHealth}=require('./install-runner.cjs'),html=Buffer.from('exact-login'),expected={authSha:sha(html)};
 const request=async route=>route==='/login'?{status:200,bytes:html}:route==='/api/auth/session'?{status:200,bytes:Buffer.from('{"ok":true,"authenticated":false,"user":null}')}:route.startsWith('/api/')||route.startsWith('/.')||route.startsWith('/vendor/')?{status:401,bytes:Buffer.from('{"ok":false}')}: {status:303,location:route==='/'?'/login':'/login?returnTo=%2F',bytes:Buffer.alloc(0)};
 await authenticatedHealth(expected,request);
 for(const route of ['/project-management','/knowledge-sharing','/meeting-trail'])await assert.rejects(authenticatedHealth(expected,async p=>p===route?{status:303,location:'/login',bytes:Buffer.alloc(0)}:request(p)),/AUTH_REDIRECT/);
 for(const location of ['https://evil.test/login','//evil.test/login','/login?evil=1','/project-management'])await assert.rejects(authenticatedHealth(expected,async p=>p==='/'?{status:303,location,bytes:Buffer.alloc(0)}:request(p)),/AUTH_REDIRECT/);
});
test('release payload includes all newly imported application modules',()=>{for(const name of ['auth','project-tasks','team-organization.mjs'])assert(units.includes(name),name+' missing');});
test('authenticated health verifies exact login bytes, redirects and denied APIs',async()=>{
 const {authenticatedHealth}=require('./install-runner.cjs'),html=Buffer.from('exact-login'),expected={authSha:sha(html)};
 const request=async route=>route==='/login'?{status:200,bytes:html}:route==='/api/auth/session'?{status:200,bytes:Buffer.from('{"ok":true,"authenticated":false,"user":null}')}:route.startsWith('/api/')?{status:401,bytes:Buffer.from('{"ok":false}')}:route.startsWith('/.')||route.startsWith('/vendor/')?{status:401,bytes:Buffer.from('{"ok":false}')}: {status:303,location:'/login?returnTo=%2F',bytes:Buffer.alloc(0)};
 await authenticatedHealth(expected,request);
 await assert.rejects(authenticatedHealth(expected,async route=>route==='/login'?{status:200,bytes:Buffer.from('wrong')}:request(route)),/LOGIN_HEALTH/);
 await assert.rejects(authenticatedHealth(expected,async route=>route==='/api/research'?{status:200,bytes:Buffer.from('{"state":"ready"}')}:request(route)),/AUTH_GATE/);
 await assert.rejects(authenticatedHealth(expected,async route=>route==='/'?{status:303,location:'https://evil.test',bytes:Buffer.alloc(0)}:request(route)),/AUTH_REDIRECT/);
});
test('pending meeting, task and login writes block upgrade before stopping',async t=>{const root=fs.mkdtempSync(path.join(os.tmpdir(),'overseas-new-ledgers-'));t.after(()=>{assert(root.startsWith(path.resolve(os.tmpdir())+path.sep));fs.rmSync(root,{recursive:true,force:true});});const {windowsOps}=require('./install-runner.cjs'),ops=windowsOps({root});for(const [relative,value]of [['project-tasks/ledger.json',{operations:{qa:{status:'accepted'}}}],['knowledge/meeting-ledger.json',{operations:{qa:{status:'syncing'}}}],['auth/ledger.json',{events:{qa:{syncStatus:'pending'}}}]]){const file=path.join(root,'.runtime',relative);fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,JSON.stringify(value));await assert.rejects(ops.checkData(),/OUTBOX_NOT_SETTLED/);fs.unlinkSync(file);await ops.checkData();}});
