const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),net=require('node:net');
const {makeDraft}=require('./make-draft.cjs'),{install,sha}=require('./transaction.cjs'),{windowsOps}=require('./install-runner.cjs');
const {importPair}=require('../tls-center/certificate.cjs');
test('real server baseline performs a failed health rollback and a successful native Windows cold install',{timeout:180000},async()=>{
 const parent=fs.mkdtempSync(path.join(os.tmpdir(),'overseas-native-release-')),root=path.join(parent,'app'),bundle=path.join(parent,'bundle'),source=path.resolve(__dirname,'..'),fixtures=process.env.VNET_TLS_TEST_FIXTURES;
 const auditFile=process.env.OVERSEAS_SERVER_AUDIT,audit=JSON.parse(fs.readFileSync(auditFile,'utf8')),baseline=path.join(source,'dist/overseas-project-management-deploy-20260605-163554');
 fs.mkdirSync(root);fs.mkdirSync(bundle);
 const previous=await require('./previous-release.cjs').seedBaseline({source,root,auditFile});require('./previous-release.cjs').seedFormalCaches(root,source);
 const data=path.join(root,'.runtime/research');fs.mkdirSync(data,{recursive:true});fs.writeFileSync(path.join(data,'state.json'),JSON.stringify(require('./confirmed-test-fixture.cjs').testState()));
 const center=path.join(parent,'center'),cert=importPair(center,fs.readFileSync(path.join(fixtures,'first.pem')),fs.readFileSync(path.join(fixtures,'first.key')),['sm.sjhl.online','www.sm.sjhl.online']);
 const saved=Object.fromEntries(['NODE_OPTIONS','VNET_TLS_CENTER_ROOT','HTTPS_CERT_PATH','HTTPS_KEY_PATH','HTTPS_PFX_PATH','HTTPS_PFX_PASSPHRASE','HTTPS_PFX_PASSPHRASE_FILE'].map(key=>[key,process.env[key]]));
 process.env.NODE_OPTIONS=`--require="${path.join(source,'tls-center/preload.cjs').replaceAll('\\','/')}"`;process.env.VNET_TLS_CENTER_ROOT=center;process.env.HTTPS_CERT_PATH=path.join(fixtures,'first.pem');process.env.HTTPS_KEY_PATH=path.join(fixtures,'first.key');delete process.env.HTTPS_PFX_PATH;delete process.env.HTTPS_PFX_PASSPHRASE;delete process.env.HTTPS_PFX_PASSPHRASE_FILE;
 const probe=net.createServer();await new Promise(r=>probe.listen(0,'127.0.0.1',r));const port=probe.address().port;await new Promise(r=>probe.close(r));
 const manifest=makeDraft({source,output:bundle,auditFile,overrides:{targetRoot:root,node:process.execPath,port,fingerprint:cert.fingerprint}}),ops=windowsOps({root,node:process.execPath,port,domain:manifest.domain,fingerprint:cert.fingerprint});
 let passed=false;
 try {
  await ops.start();await ops.captureHealth();const ledgerBefore=fs.readFileSync(path.join(data,'state.json'));
  const invalid={...manifest,health:{...manifest.health,rootSha:'0'.repeat(64)}};
  await assert.rejects(install({root,payload:path.join(bundle,'payload'),manifest:invalid,ops}));
  assert.equal(sha(fs.readFileSync(path.join(root,'server.mjs'))),previous.manifest.core['server.mjs']);
  await ops.health(previous.manifest.health);assert.deepEqual(fs.readFileSync(path.join(data,'state.json')),ledgerBefore);
  const result=await install({root,payload:path.join(bundle,'payload'),manifest,ops});assert.equal(result.ok,true);await ops.health(manifest.health);
  assert.equal(fs.existsSync(path.join(root,'.maintenance.lock')),false);
  const settled=JSON.parse(fs.readFileSync(path.join(data,'state.json'),'utf8'));for(const id of require('./confirmed-test-cleanup.cjs').ids)assert.equal(settled.operations[id].status,'retired');assert.equal(settled.operations.existing.status,'success');const tx=JSON.parse(fs.readFileSync(path.join(root,'.hotfix-transaction.json')));assert.deepEqual(fs.readFileSync(path.join(root,tx.dataCleanup.backup)),ledgerBefore);
  passed=true;
 } catch(error) {console.error('Native release primary failure: '+(error.code||error.message));throw error;
 } finally {
  try{await ops.stop();}finally{for(const [key,value]of Object.entries(saved)){if(value===undefined)delete process.env[key];else process.env[key]=value;}assert.ok(parent.startsWith(path.resolve(os.tmpdir())+path.sep+'overseas-native-release-'));if(passed)fs.rmSync(parent,{recursive:true,force:true,maxRetries:5,retryDelay:100});else console.error('Retained isolated diagnostic fixture: '+parent);}
 }
});
