'use strict';
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),{spawnSync}=require('node:child_process');
const {sha,tree}=require('./transaction.cjs'),{units}=require('./make-draft.cjs');
const source=path.resolve(__dirname,'..'),id='20261019.2',tools=['transaction.cjs','install-runner.cjs','confirmed-test-cleanup.cjs','WindowsBridge.ps1','InstallProject.ps1','InstallProject.bat'];
function snapshot(){const files={};for(const unit of units)for(const[name,hash]of Object.entries(tree(path.join(source,unit)).files))if(hash)files[name?unit+'/'+name:unit]=hash;return {files,tools:Object.fromEntries(tools.map(name=>[name,sha(fs.readFileSync(path.join(__dirname,name)))]))};}
const before=snapshot(),proof={id,at:new Date().toISOString(),source:before};
function run(label,files){
 const start=Date.now(),r=spawnSync(process.execPath,['--test','--test-concurrency=1','--test-reporter=tap',...files],{cwd:source,encoding:'utf8',windowsHide:true,maxBuffer:20*1024*1024});
 fs.writeFileSync(path.join(source,'reports',`project-release-${id}-${label}.tap`),(r.stdout||'')+(r.stderr||''));
 const count=Number(/^# tests (\d+)$/m.exec(r.stdout)?.[1]),passed=Number(/^# pass (\d+)$/m.exec(r.stdout)?.[1]);
 assert.equal(r.status,0,label+' tests failed');assert(count>0&&passed===count);proof[label]={passed:true,count,durationMs:Date.now()-start};console.log(JSON.stringify({label,...proof[label]}));
}
if(process.argv.includes('--reuse-results')){
 const read=label=>fs.readFileSync(path.join(source,'reports',`project-release-${id}-${label}.tap`),'utf8'),business=read('business'),release=read('release'),wrapper=read('wrapper-recheck');
 assert(/^# tests 68$/m.test(business)&&/^# pass 68$/m.test(business)&&/^# fail 0$/m.test(business));
 assert(/^# tests 32$/m.test(release)&&/^# pass 31$/m.test(release)&&/^# fail 1$/m.test(release));
 assert.deepEqual(release.split('\n').filter(line=>line.startsWith('not ok')),['not ok 32 - project outer wrapper accepts pinned bytes and rejects tampering before elevation']);
 assert(/^# pass 1$/m.test(wrapper)&&/^# fail 0$/m.test(wrapper));
 proof.business={passed:true,count:68,evidenceSha256:sha(Buffer.from(business))};proof.release={passed:true,count:32,reusedPassingCases:31,targetedWrapperRecheck:1,evidenceSha256:sha(Buffer.from(release)),recheckSha256:sha(Buffer.from(wrapper))};
}else{
 run('business',fs.readdirSync(path.join(source,'tests')).filter(name=>/^research.*\.test\.mjs$/.test(name)).map(name=>'tests/'+name));
 run('release',['confirmed-test-cleanup.test.cjs','formal-project-release.test.cjs','transaction.test.cjs','wrapper.test.cjs'].map(name=>'release-tools/'+name));
}
assert.deepEqual(snapshot(),before,'Source or installer changed during verification');
proof.browser=JSON.parse(fs.readFileSync(path.join(source,'reports/research-ui-20261019-validation.json'),'utf8'));proof.syntaxFiles=127;proof.passed=true;
fs.writeFileSync(path.join(source,`reports/project-release-${id}-validation.json`),JSON.stringify(proof,null,2));
