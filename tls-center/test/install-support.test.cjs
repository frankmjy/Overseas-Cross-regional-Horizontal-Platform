const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {spawnSync}=require('node:child_process');
test('Windows installation rollback preserves registry types and rejects operator drift',()=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'vnet-tls-install-test-'));
  try {
    const run=spawnSync('powershell.exe',['-NoProfile','-ExecutionPolicy','Bypass','-File',path.join(__dirname,'install-support.ps1'),'-Source',path.resolve(__dirname,'..'),'-Workspace',root],{encoding:'utf8',windowsHide:true,timeout:15000});
    assert.ifError(run.error);assert.equal(run.status,0,run.stdout+run.stderr);assert.match(run.stdout,/PASS:/);
  } finally {assert.ok(root.startsWith(path.join(os.tmpdir(),'vnet-tls-install-test-')));fs.rmSync(root,{recursive:true,force:true});}
});
