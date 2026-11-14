const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os'),{spawnSync}=require('node:child_process');
test('project outer wrapper accepts pinned bytes and rejects tampering before elevation',()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'overseas-wrapper-test-'));
 try {
  const payload=path.join(root,'payload');fs.mkdirSync(payload);fs.writeFileSync(path.join(payload,'fixture.txt'),'pinned payload');
  const build=spawnSync('powershell.exe',['-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-Command',`. '${path.join(__dirname,'archive-tools.ps1').replaceAll("'","''")}'; Write-CanonicalZip '${payload.replaceAll("'","''")}' '${path.join(root,'project-payload.zip').replaceAll("'","''")}'`],{windowsHide:true,encoding:'utf8',timeout:30000});assert.equal(build.status,0,build.stderr);
  const {sha}=require('./transaction.cjs'),zip=path.join(root,'project-payload.zip'),file=path.join(root,'InstallProject.ps1');fs.writeFileSync(file,fs.readFileSync(path.join(__dirname,'InstallProject.ps1'),'utf8').replace('@PROJECT_PAYLOAD_SHA256@',sha(fs.readFileSync(zip))));
  const check=()=>spawnSync('powershell.exe',['-NoProfile','-ExecutionPolicy','Bypass','-File',file,'-ValidateOnly'],{windowsHide:true,encoding:'utf8',timeout:30000});
  const valid=check();assert.equal(valid.status,0,valid.error?.message||valid.stderr||valid.stdout);fs.appendFileSync(zip,'tampered');assert.equal(check().status,1);
 }finally{assert.ok(root.startsWith(path.resolve(os.tmpdir())+path.sep+'overseas-wrapper-test-'));fs.rmSync(root,{recursive:true,force:true});}
});
