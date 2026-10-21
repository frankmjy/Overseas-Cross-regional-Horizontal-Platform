const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {spawn}=require('node:child_process');
const {once}=require('node:events');
const {importPair,readCurrent}=require('../certificate.cjs');
const fixtures=process.env.VNET_TLS_TEST_FIXTURES;
async function waitFor(check){const limit=Date.now()+7000;while(Date.now()<limit){if(check())return;await new Promise(r=>setTimeout(r,100));}throw new Error('Watcher did not reach expected state.');}
test('background watcher retains active certificate for a partial update and applies the completed pair',{timeout:15000},async()=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'vnet-tls-watch-test-'));
  const first=importPair(root,fs.readFileSync(path.join(fixtures,'first.pem')),fs.readFileSync(path.join(fixtures,'first.key')),['sm.sjhl.online','www.sm.sjhl.online']);
  const inbox=path.join(root,'inbox');fs.mkdirSync(inbox);
  fs.copyFileSync(path.join(fixtures,'first.pem'),path.join(inbox,'fullchain.pem'));fs.copyFileSync(path.join(fixtures,'first.key'),path.join(inbox,'privkey.pem'));
  const child=spawn(process.execPath,[path.resolve(__dirname,'../manage.cjs'),'watch',root],{env:{...process.env,NODE_OPTIONS:''},windowsHide:true,stdio:['ignore','pipe','pipe']});
  let output='';child.stdout.on('data',c=>{output+=c;});child.stderr.on('data',c=>{output+=c;});
  const status=()=>{try{return JSON.parse(fs.readFileSync(path.join(root,'watch-status.json'),'utf8'));}catch{return {};}};
  try {
    await waitFor(()=>status().state==='ready');
    fs.copyFileSync(path.join(fixtures,'second.pem'),path.join(inbox,'fullchain.pem'));
    await waitFor(()=>status().state==='error');assert.equal(readCurrent(root).fingerprint,first.fingerprint);
    fs.copyFileSync(path.join(fixtures,'second.key'),path.join(inbox,'privkey.pem'));
    await waitFor(()=>status().state==='ready' && readCurrent(root).fingerprint!==first.fingerprint);
    assert.doesNotMatch(output,/BEGIN PRIVATE KEY|BEGIN RSA PRIVATE KEY/);
    assert.equal(child.exitCode,null);
  } finally {
    if(child.exitCode===null){const ended=once(child,'exit');child.kill();await ended;}
    assert.ok(root.startsWith(path.join(os.tmpdir(),'vnet-tls-watch-test-')));fs.rmSync(root,{recursive:true,force:true});
  }
});
