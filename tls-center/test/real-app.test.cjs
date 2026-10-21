const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const https=require('node:https');
const {fork}=require('node:child_process');
const {once}=require('node:events');
const {pathToFileURL}=require('node:url');
const {importPair}=require('../certificate.cjs');

test('actual ESM research server starts behind the preload with isolated cached data and exits cleanly', {timeout:12000}, async()=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'vnet-tls-app-'));
  const store=path.join(root,'center'),data=path.join(root,'data'),fixtures=process.env.VNET_TLS_TEST_FIXTURES;
  fs.mkdirSync(data);
  const accepted=importPair(store,fs.readFileSync(path.join(fixtures,'first.pem')),fs.readFileSync(path.join(fixtures,'first.key')),['sm.sjhl.online','www.sm.sjhl.online']);
  fs.writeFileSync(path.join(data,'state.json'),JSON.stringify({operations:{},uploads:{},cache:{syncedAt:new Date().toISOString(),raw:{questions:[{recordId:'recTLSQA',问题编号:'Q-TLS-QA',问题列表:'TLS isolated acceptance',一级分类:'组织与人才'}],findings:[],evidence:[],topics:[]}}}));
  const serverUrl=pathToFileURL(path.resolve(__dirname,'../../server.mjs')).href;
  const runner=path.join(root,'runner.mjs');
  fs.writeFileSync(runner,`await import(${JSON.stringify(serverUrl)}); process.on('message',m=>{if(m==='stop')process.emit('SIGTERM')}); process.send({ready:true});`);
  const nodeEnv={...process.env,PORT:'0',SERVER_HOST:'127.0.0.1',RESEARCH_DATA_DIR:data,VNET_TLS_CENTER_ROOT:store,HTTPS_CERT_PATH:path.join(fixtures,'first.pem'),HTTPS_KEY_PATH:path.join(fixtures,'first.key'),NODE_OPTIONS:`--require="${path.resolve(__dirname,'../preload.cjs').replaceAll('\\','/')}"`};
  delete nodeEnv.HTTPS_PFX_PATH;delete nodeEnv.HTTPS_PFX_PASSPHRASE;delete nodeEnv.HTTPS_PFX_PASSPHRASE_FILE;
  // Use a free loopback port, then start the real server on it.
  const probe=require('node:net').createServer();await new Promise(r=>probe.listen(0,'127.0.0.1',r));const port=probe.address().port;await new Promise(r=>probe.close(r));nodeEnv.PORT=String(port);
  const child=fork(runner,[],{cwd:path.resolve(__dirname,'../..'),env:nodeEnv,execArgv:[],stdio:['ignore','pipe','pipe','ipc']});
  let errors='';child.stderr.on('data',c=>{errors+=c;});
  try {
    await Promise.race([once(child,'message'),once(child,'exit').then(()=>{throw new Error(`Real app exited: ${errors}`);})]);
    for(const route of ['/','/project-management','/api/research']) {
      const result=await new Promise((resolve,reject)=>{
        https.get({hostname:'127.0.0.1',port,servername:'sm.sjhl.online',path:route,agent:false,timeout:3000},res=>{
          const fingerprint=res.socket.getPeerCertificate().fingerprint256;let text='';res.on('data',c=>{text+=c;});res.on('end',()=>resolve({status:res.statusCode,fingerprint,text}));
        }).on('error',reject).on('timeout',function(){this.destroy(new Error('Timeout'));});
      });
      assert.equal(result.status,200);assert.equal(result.fingerprint,accepted.fingerprint);
      if(route==='/api/research'){const snapshot=JSON.parse(result.text);assert.equal(snapshot.state,'ready');assert.equal(snapshot.data.questions.length,1);}
    }
    assert.equal(Object.keys(JSON.parse(fs.readFileSync(path.join(data,'state.json'),'utf8')).operations).length,0);
  } finally {
    if(child.exitCode===null){const ended=once(child,'exit');child.send('stop');await ended;}
    assert.equal(fs.existsSync(path.join(data,'writer.lock')),false);
    assert.ok(root.startsWith(path.join(os.tmpdir(),'vnet-tls-app-')));
    fs.rmSync(root,{recursive:true,force:true});
  }
});
