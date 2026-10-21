import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root=fs.mkdtempSync(path.join(os.tmpdir(),'overseas-release-audit-test-'));
const script=fileURLToPath(new URL('./ServerReleaseAudit.ps1',import.meta.url));
const sentinel='QA-PRIVATE-VALUE-MUST-NOT-LEAVE-THE-FIXTURE';
try {
  const app=path.join(root,'app'),data=path.join(root,'data'),output=path.join(root,'report');
  for(const dir of [app,data,output,path.join(app,'src')])fs.mkdirSync(dir,{recursive:true});
  fs.writeFileSync(path.join(app,'server.mjs'),'// readonly audit fixture\n');
  fs.writeFileSync(path.join(app,'package.json'),JSON.stringify({name:'overseas-project-management-platform',version:'audit-fixture'}));
  fs.writeFileSync(path.join(app,'.env'),`FEISHU_APP_SECRET=${sentinel}\nRESEARCH_DATA_DIR="${data}"\n`);
  fs.writeFileSync(path.join(app,'.hotfix-transaction.json'),JSON.stringify({private:sentinel}));
  fs.writeFileSync(path.join(data,'app-settings.json'),JSON.stringify({appSecret:sentinel}));
  fs.writeFileSync(path.join(data,'state.json'),JSON.stringify({operations:{a:{status:'accepted',payload:{title:sentinel}},b:{status:'error',error:sentinel},c:{status:sentinel}},uploads:{one:{ready:false,name:sentinel}},cache:{private:sentinel}}));
  fs.writeFileSync(path.join(app,'src','public.js'),'// public\n');
  fs.writeFileSync(path.join(app,'src','public.js')+':qa-stream',sentinel);
  fs.symlinkSync(data,path.join(app,'src','junction'),'junction');
  const run=spawnSync('powershell.exe',['-NoProfile','-ExecutionPolicy','Bypass','-File',script,'-Root',app,'-OutputDirectory',output],{windowsHide:true,encoding:'utf8',timeout:45000});
  assert.ifError(run.error);assert.equal(run.status,0,run.stdout+run.stderr);
  const names=fs.readdirSync(output);assert.equal(names.length,1);
  const text=fs.readFileSync(path.join(output,names[0]),'utf8');assert.ok(!text.includes(sentinel));assert.ok(!(run.stdout+run.stderr).includes(sentinel));
  const report=JSON.parse(text);assert.equal(report.readOnly,true);assert.equal(report.releaseReady,false);
  assert.equal(report.oldTransactions[0].path,'.hotfix-transaction.json');
  assert.ok(report.unsafePublicPaths.includes('src/junction'));assert.ok(report.unsafePublicPaths.includes('src/public.js:alternate-stream'));
  const ledger=report.data.find(item=>item.path.toLowerCase()===data.toLowerCase());
  assert.equal(ledger.statusCounts.accepted,1);assert.equal(ledger.statusCounts.error,1);assert.equal(ledger.statusCounts.other,1);assert.equal(ledger.pendingUploads,1);
  assert.ok(report.issues.includes('OUTBOX_REQUIRES_RELEASE_HANDLING'));
  assert.ok(!Object.keys(report.publicFiles).some(name=>/\.env$|app-settings|state\.json|junction/.test(name)));
  assert.equal(fs.readFileSync(path.join(app,'.env'),'utf8'),`FEISHU_APP_SECRET=${sentinel}\nRESEARCH_DATA_DIR="${data}"\n`);
  assert.equal(JSON.parse(fs.readFileSync(path.join(data,'app-settings.json'),'utf8')).appSecret,sentinel);
  console.log('PASS: audit excludes secrets and ledger contents, preserves files, identifies unfinished transactions, pending outbox, alternate streams and junctions.');
} finally {
  assert.ok(path.resolve(root).startsWith(path.resolve(os.tmpdir())+path.sep+'overseas-release-audit-test-'));
  fs.rmSync(root,{recursive:true,force:true});
}
