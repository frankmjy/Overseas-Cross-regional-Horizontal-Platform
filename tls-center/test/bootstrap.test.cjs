const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {spawnSync}=require('node:child_process');
function ps(file,args){const result=spawnSync('powershell.exe',['-NoProfile','-ExecutionPolicy','Bypass','-File',file,...args],{encoding:'utf8',windowsHide:true,timeout:10000});assert.ifError(result.error);return result;}
test('outer launcher verifies payload hash and rejects traversal and duplicate archive paths before elevation',()=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'vnet-tls-bootstrap-test-'));
  try {
    for(const variant of ['valid','tampered','traversal','duplicate']){
      const target=path.join(root,variant);fs.mkdirSync(target);
      const built=ps(path.join(__dirname,'bootstrap-fixture.ps1'),['-Source',path.resolve(__dirname,'..'),'-Output',target,'-Variant',variant]);assert.equal(built.status,0,built.stdout+built.stderr);
      const checked=ps(path.join(target,'Bootstrap.ps1'),['-ValidateOnly']);assert.equal(checked.status===0,variant==='valid',checked.stdout+checked.stderr);
    }
  }finally{assert.ok(root.startsWith(path.join(os.tmpdir(),'vnet-tls-bootstrap-test-')));fs.rmSync(root,{recursive:true,force:true});}
});
