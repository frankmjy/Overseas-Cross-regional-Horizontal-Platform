const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {windowsOps}=require('./install-runner.cjs');
test('pending uploads and operations in either formal project block release before stopping',async t=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'overseas-formal-release-'));t.after(()=>{assert(root.startsWith(path.resolve(os.tmpdir())+path.sep));fs.rmSync(root,{recursive:true,force:true});});
 const data=path.join(root,'.runtime/research'),states={};for(const key of ['thailand','malaysia']){const dir=path.join(data,'projects',key);fs.mkdirSync(dir,{recursive:true});states[key]=path.join(dir,'state.json');fs.writeFileSync(states[key],JSON.stringify({operations:{},uploads:{}}));}
 const ops=windowsOps({root,node:process.execPath,port:3333,domain:'unused',fingerprint:'unused'});await ops.checkData();
 for(const key of ['thailand','malaysia']){fs.writeFileSync(states[key],JSON.stringify({operations:{qa:{status:'accepted'}},uploads:{}}));await assert.rejects(ops.checkData(),/RELEASE_OUTBOX_NOT_SETTLED/);fs.writeFileSync(states[key],JSON.stringify({operations:{qa:{status:'retired'}},uploads:{qa:{ready:false}}}));await assert.rejects(ops.checkData(),/RELEASE_OUTBOX_NOT_SETTLED/);fs.writeFileSync(states[key],JSON.stringify({operations:{qa:{status:'retired'}},uploads:{}}));await ops.checkData();}
});
