const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const cleanup=require('./confirmed-test-cleanup.cjs'),{testState}=require('./confirmed-test-fixture.cjs'),{windowsOps}=require('./install-runner.cjs');
const bytes=state=>Buffer.from(JSON.stringify(state));
test('only the user-confirmed complete task chain is eligible; payload order is immaterial',()=>{
 const state=testState(),before=bytes(state),plan=cleanup.inspect(before),after=JSON.parse(plan.afterBytes);
 assert.equal(plan.ids.length,3);assert.deepEqual(after.cache,state.cache);assert.deepEqual(after.operations.existing,state.operations.existing);assert.deepEqual(after.uploads,state.uploads);
 for(const id of cleanup.ids){assert.equal(after.operations[id].status,'retired');assert.equal(after.operations[id].hash,state.operations[id].hash);assert(!after.operations[id].payload);}
 state.operations[cleanup.ids[0]].payload={description:'',name:'1111',clientMutationId:cleanup.ids[0],kind:'topic'};assert(cleanup.inspect(bytes(state)));
 assert.equal(cleanup.inspect(plan.afterBytes),null);
});
test('unconfirmed contents, extra work, uploads, partial chains and external dependents remain blocked',()=>{
 for(const change of [s=>s.operations[cleanup.ids[1]].payload.title='real work',s=>s.operations[cleanup.ids[0]].payload.description='real description',s=>s.operations.other={id:'other',status:'accepted'},s=>s.uploads.pending={ready:false},s=>delete s.operations[cleanup.ids[2]],s=>s.operations.existing.dependencies=[cleanup.ids[1]],s=>s.operations[cleanup.ids[1]].payload.uploadIds=['file'],s=>s.operations[cleanup.ids[1]].dependencies=[]]){const s=testState();change(s);assert.throws(()=>cleanup.inspect(bytes(s)),/RELEASE_/);}
});
test('backup, apply and exact-byte restore verify identity and refuse drift or unsafe backup paths',t=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'overseas-cleanup-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 const file=path.join(root,'.runtime/research/state.json'),tx='20261019.2-1234abcd',recovery=path.join(root,'.release-recovery',tx);fs.mkdirSync(path.dirname(file),{recursive:true});fs.mkdirSync(recovery,{recursive:true});
 const original=bytes(testState());fs.writeFileSync(file,original);const plan=cleanup.inspect(original),data=cleanup.prepare(root,recovery,plan);
 assert.deepEqual(fs.readFileSync(path.join(root,data.backup)),original);cleanup.apply(root,tx,data);assert.deepEqual(fs.readFileSync(file),plan.afterBytes);cleanup.restore(root,tx,data);assert.deepEqual(fs.readFileSync(file),original);
 assert.throws(()=>cleanup.validate(root,tx,{...data,backup:'../escape'}),/RELEASE_LEDGER_BACKUP_INVALID/);
 fs.writeFileSync(file,'third-party change');assert.throws(()=>cleanup.apply(root,tx,data),/RELEASE_LEDGER_CHANGED/);assert.throws(()=>cleanup.restore(root,tx,data),/RELEASE_LEDGER_CHANGED/);assert.equal(fs.readFileSync(file,'utf8'),'third-party change');
 fs.writeFileSync(path.join(root,data.backup),'corrupt');assert.throws(()=>cleanup.restore(root,tx,data),/RELEASE_LEDGER_BACKUP_INVALID/);
});
test('approved task identities cannot bypass project or external data-directory guards',async t=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'overseas-cleanup-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));const ops=windowsOps({root});
 const file=path.join(root,'.runtime/research/projects/malaysia/state.json');fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,bytes(testState()));await assert.rejects(ops.checkData(),/RELEASE_OUTBOX_NOT_SETTLED/);
});
