const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),net=require('node:net');
const {X509Certificate}=require('node:crypto');
(async()=>{
 const [bundle,auditFile,source]=process.argv.slice(2),manifest=JSON.parse(fs.readFileSync(path.join(bundle,'release-manifest.json'))),audit=JSON.parse(fs.readFileSync(auditFile)),parent=fs.mkdtempSync(path.join(os.tmpdir(),'overseas-candidate-smoke-')),root=path.join(parent,'app');
 const {install,sha}=require(path.join(bundle,'transaction.cjs')),{windowsOps}=require(path.join(bundle,'install-runner.cjs'));
 await require('./previous-release.cjs').seedBaseline({source,root,auditFile});require('./previous-release.cjs').seedFormalCaches(root,source);
 const data=path.join(root,'.runtime/research');fs.mkdirSync(data,{recursive:true});fs.writeFileSync(path.join(data,'state.json'),JSON.stringify(require('./confirmed-test-fixture.cjs').testState()));
 const fixtures=process.env.VNET_TLS_TEST_FIXTURES,cert=new X509Certificate(fs.readFileSync(path.join(fixtures,'first.pem')));
 process.env.HTTPS_CERT_PATH=path.join(fixtures,'first.pem');process.env.HTTPS_KEY_PATH=path.join(fixtures,'first.key');delete process.env.HTTPS_PFX_PATH;delete process.env.HTTPS_PFX_PASSPHRASE;delete process.env.HTTPS_PFX_PASSPHRASE_FILE;delete process.env.NODE_OPTIONS;delete process.env.VNET_TLS_CENTER_ROOT;
 const probe=net.createServer();await new Promise(r=>probe.listen(0,'127.0.0.1',r));const port=probe.address().port;await new Promise(r=>probe.close(r));const ops=windowsOps({root,node:process.execPath,port,domain:manifest.domain,fingerprint:cert.fingerprint256});
 let ok=false;
 try{await ops.start();await ops.captureHealth();const result=await install({root,payload:path.join(bundle,'payload'),manifest,ops});await ops.health(manifest.health);const state=JSON.parse(fs.readFileSync(path.join(data,'state.json'),'utf8'));if(require('./confirmed-test-cleanup.cjs').ids.some(id=>state.operations[id]?.status!=='retired'))throw new Error('CANDIDATE_DATA_CLEANUP_FAILED');if(!result.ok||fs.existsSync(path.join(root,'.maintenance.lock')))throw new Error('CANDIDATE_SMOKE_FAILED');console.log(JSON.stringify({ok:true,release:manifest.id,scope:'exact-candidate-native-install-and-HTTPS-health',isolatedPort:port,baselineFiles:audit.publicFileCount,realFeishuWrites:0}));ok=true;}
 finally{await ops.stop();if(ok){if(!root.startsWith(path.resolve(os.tmpdir())+path.sep+'overseas-candidate-smoke-'))throw new Error('UNSAFE_SMOKE_CLEANUP');fs.rmSync(parent,{recursive:true,force:true,maxRetries:5,retryDelay:100});}}
})().catch(error=>{console.error(/^RELEASE_[A-Z_]+$/.test(error.message)?error.message:'CANDIDATE_SMOKE_FAILED');process.exitCode=1;});
