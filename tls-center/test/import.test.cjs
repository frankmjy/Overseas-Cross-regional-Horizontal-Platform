const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const os=require('node:os');
const {spawn}=require('node:child_process');
const {readCurrent}=require('../certificate.cjs');
const fixtures=process.env.VNET_TLS_TEST_FIXTURES;
function ps(script,args) {
  return new Promise((resolve,reject)=>{
    const started=Date.now();
    const child=spawn('powershell.exe',['-NoProfile','-ExecutionPolicy','Bypass','-File',script,...args],{windowsHide:true,env:{...process.env,NODE_OPTIONS:''}});
    const timer=setTimeout(()=>child.kill(),10000);
    let output='';child.stdout.on('data',c=>{output+=c;});child.stderr.on('data',c=>{output+=c;});child.on('error',reject);child.on('close',code=>{clearTimeout(timer);console.log(`${path.basename(script)}: ${Date.now()-started}ms, exit=${code}`);resolve({code,output});});
  });
}
test('Windows ZIP import accepts initial and replacement pairs; rejects mismatches and traversal without changing active version',{timeout:85000},async()=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'vnet-tls-import-'));
  fs.writeFileSync(path.join(root,'settings.json'),JSON.stringify({node:process.execPath}));
  for(const file of ['manage.cjs','certificate.cjs'])fs.copyFileSync(path.join(__dirname,'..',file),path.join(root,file));
  const importer=path.join(__dirname,'../ImportCertificate.ps1');
  try {
    for(const [name,cert,key,prefix] of [['valid','first','first',''],['valid-rotation','second','second',''],['mismatch','second','first',''],['traversal','first','first','../']]) {
      const zip=path.join(root,`${name}.zip`);
      const built=await ps(path.join(__dirname,'zip-fixture.ps1'),['-Cert',path.join(fixtures,`${cert}.pem`),'-Key',path.join(fixtures,`${key}.key`),'-Output',zip,...(prefix?['-Prefix',prefix]:[])]);
      assert.equal(built.code,0,built.output);
      const before=name==='valid'?null:readCurrent(root).version;
      const imported=await ps(importer,['-Root',root,'-ZipPath',zip]);
      assert.doesNotMatch(imported.output,/BEGIN PRIVATE KEY|BEGIN RSA PRIVATE KEY/);
      assert.equal(imported.code===0,name.startsWith('valid'),imported.output);
      if(before){if(name==='valid-rotation')assert.notEqual(readCurrent(root).version,before);else assert.equal(readCurrent(root).version,before);}
    }
    assert.equal(fs.readdirSync(root).filter(n=>n.startsWith('candidate-')).length,0);
  } finally {assert.ok(root.startsWith(path.join(os.tmpdir(),'vnet-tls-import-')));fs.rmSync(root,{recursive:true,force:true});}
});
