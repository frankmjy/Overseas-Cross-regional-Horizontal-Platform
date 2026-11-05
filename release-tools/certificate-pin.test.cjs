const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),https=require('node:https');
const {X509Certificate}=require('node:crypto');
const {sha}=require('./transaction.cjs'),{windowsOps,createCertificatePin,requestHealth}=require('./install-runner.cjs');
const fixtures=process.env.VNET_TLS_TEST_FIXTURES,domain='www.sm.sjhl.online';
const pem=name=>fs.readFileSync(path.join(fixtures,name+'.pem')),fingerprint=name=>new X509Certificate(pem(name)).fingerprint256;
function center(t,name='second'){
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'overseas-certificate-pin-'));
 t.after(()=>{assert(root.startsWith(path.resolve(os.tmpdir())+path.sep+'overseas-certificate-pin-'));fs.rmSync(root,{recursive:true,force:true});});
 const version=sha(pem(name)),dir=path.join(root,'versions',version);fs.mkdirSync(dir,{recursive:true});fs.writeFileSync(path.join(dir,'fullchain.pem'),pem(name));fs.writeFileSync(path.join(root,'preload.cjs'),'');
 const pointer={schema:1,version,domains:['sm.sjhl.online',domain],fingerprint:fingerprint(name)};fs.writeFileSync(path.join(root,'current.json'),JSON.stringify(pointer));
 const environment={VNET_TLS_CENTER_ROOT:root,NODE_OPTIONS:'--require="'+path.join(root,'preload.cjs').replaceAll('\\','/')+'"'};
 return{root,dir,pointer,environment};
}
test('approved TLS center rollover replaces historical pin without learning a peer certificate',t=>{
 const c=center(t),pin=createCertificatePin({domain,fingerprint:fingerprint('first'),environment:c.environment});
 assert.equal(pin.fingerprint,fingerprint('second'));pin.verify(fingerprint('second'));
 assert.throws(()=>pin.verify(fingerprint('first')),/RELEASE_CERTIFICATE_MISMATCH/);
});
test('legacy installations retain exact historical pin; inactive center cannot authorize a rollover',t=>{
 const c=center(t),pin=createCertificatePin({domain,fingerprint:fingerprint('first'),environment:{...c.environment,NODE_OPTIONS:''}});
 assert.equal(pin.fingerprint,fingerprint('first'));assert.throws(()=>pin.verify(fingerprint('second')),/RELEASE_CERTIFICATE_MISMATCH/);
});
test('center pointer tampering, wrong domain, expired certificate and alternate paths fail closed',t=>{
 for(const kind of ['fingerprint','version','domain','expired','ads']){
  const c=center(t,kind==='expired'?'expired':'second');
  if(kind==='fingerprint')c.pointer.fingerprint=fingerprint('first');
  if(kind==='version')c.pointer.version='0'.repeat(64);
  if(kind==='domain')c.pointer.domains=['other.example'];
  if(kind==='ads'){c.environment.VNET_TLS_CENTER_ROOT+=':stream';c.environment.NODE_OPTIONS='--require="'+path.join(c.environment.VNET_TLS_CENTER_ROOT,'preload.cjs').replaceAll('\\','/')+'"';}
  fs.writeFileSync(path.join(c.root,'current.json'),JSON.stringify(c.pointer));
  assert.throws(()=>createCertificatePin({domain,fingerprint:fingerprint('first'),environment:c.environment}),/RELEASE_(?:CERTIFICATE|ADS)/,kind);
 }
});
test('certificate source is immutable throughout one install and rollback',t=>{
 const c=center(t),pin=createCertificatePin({domain,fingerprint:fingerprint('first'),environment:c.environment});
 fs.writeFileSync(path.join(c.root,'current.json'),JSON.stringify({...c.pointer,fingerprint:fingerprint('first')}));
 assert.throws(()=>pin.verify(fingerprint('second')),/RELEASE_CERTIFICATE_SOURCE_CHANGED/);
});
test('TLS center reparse points are rejected before certificate selection',t=>{
 const c=center(t),alias=path.join(c.root,'linked-center');fs.symlinkSync(c.root,alias,process.platform==='win32'?'junction':'dir');
 const environment={VNET_TLS_CENTER_ROOT:alias,NODE_OPTIONS:'--require="'+path.join(alias,'preload.cjs').replaceAll('\\','/')+'"'};
 assert.throws(()=>createCertificatePin({domain,fingerprint:fingerprint('first'),environment}),/RELEASE_REPARSE_POINT/);
 fs.unlinkSync(alias);
});
test('real HTTPS health accepts approved rollover but still verifies hostname, trust and unexpected leaves',async t=>{
 const c=center(t),pin=createCertificatePin({domain,fingerprint:fingerprint('first'),environment:c.environment});
 const server=https.createServer({cert:pem('second'),key:fs.readFileSync(path.join(fixtures,'second.key'))},(_req,res)=>res.end('healthy'));
 await new Promise(r=>server.listen(0,'127.0.0.1',r));t.after(()=>new Promise(r=>server.close(r)));const port=server.address().port;
 assert.equal((await requestHealth({port,domain,pin},'/')).bytes.toString(),'healthy');
 const historical=createCertificatePin({domain,fingerprint:fingerprint('first'),environment:{}});
 await assert.rejects(requestHealth({port,domain,pin:historical},'/'),/RELEASE_CERTIFICATE_MISMATCH/);
 await assert.rejects(requestHealth({port,domain:'other.example',pin},'/'),/Hostname|altnames|certificate/i);
 const {spawn}=require('node:child_process');
 const result=await new Promise((resolve,reject)=>{const child=spawn(process.execPath,['-e',`require('node:https').get({hostname:'127.0.0.1',port:${port},servername:'${domain}',rejectUnauthorized:true},()=>process.exit(1)).on('error',e=>{console.log(e.code);process.exit(0)})`],{windowsHide:true,env:{...process.env,NODE_EXTRA_CA_CERTS:'',NODE_OPTIONS:''}});let output='';child.stdout.on('data',b=>output+=b);child.on('error',reject);child.on('close',code=>resolve({code,output}));});
 assert.equal(result.code,0);assert.match(result.output,/CERT|ISSUER|VERIFY/);
 const untrusted=https.createServer({cert:pem('expired'),key:fs.readFileSync(path.join(fixtures,'expired.key'))},(_req,res)=>res.end('bad'));
 await new Promise(r=>untrusted.listen(0,'127.0.0.1',r));t.after(()=>new Promise(r=>untrusted.close(r)));
 await assert.rejects(requestHealth({port:untrusted.address().port,domain,pin},'/'),/expired|certificate/i);
});
test('Windows installation captures approved rollover health before stopping old service',async t=>{
 const c=center(t),root=path.join(c.root,'app');fs.mkdirSync(root);fs.writeFileSync(path.join(root,'index.html'),'healthy');
 const saved=Object.fromEntries(Object.keys(c.environment).map(key=>[key,process.env[key]]));for(const[key,value]of Object.entries(c.environment))process.env[key]=value;
 t.after(()=>{for(const[key,value]of Object.entries(saved)){if(value===undefined)delete process.env[key];else process.env[key]=value;}});
 const server=https.createServer({cert:pem('second'),key:fs.readFileSync(path.join(fixtures,'second.key'))},(_req,res)=>res.end('healthy'));
 await new Promise(r=>server.listen(0,'127.0.0.1',r));t.after(()=>new Promise(r=>server.close(r)));
 const ops=windowsOps({root,node:process.execPath,port:server.address().port,domain,fingerprint:fingerprint('first')});
 assert.deepEqual(await ops.captureHealth(),{rootSha:sha('healthy')});
});
