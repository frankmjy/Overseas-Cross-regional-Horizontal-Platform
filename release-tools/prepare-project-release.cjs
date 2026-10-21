'use strict';
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),{spawnSync}=require('node:child_process');
const {sha,tree,plain}=require('./transaction.cjs'),{units}=require('./make-draft.cjs'),{previousRelease}=require('./previous-release.cjs');
const source=path.resolve(__dirname,'..'),id=process.argv[2],previousId=process.argv[3];
assert.match(id||'',/^\d{8}\.\d+$/);assert.match(previousId||'',/^\d{8}\.\d+$/);assert.notEqual(id,previousId);
process.env.OVERSEAS_RELEASE_ID=id;process.env.OVERSEAS_PREVIOUS_RELEASE=previousId;
const auditFile=process.env.OVERSEAS_SERVER_AUDIT;assert(auditFile&&fs.existsSync(auditFile),'Server baseline audit is missing');
const fixtures=process.env.VNET_TLS_TEST_FIXTURES;assert(fixtures&&fs.existsSync(path.join(fixtures,'first.pem')),'Isolated TLS fixtures are missing');
process.env.NODE_EXTRA_CA_CERTS=path.join(fixtures,'ca.pem');
const crypto=require('node:crypto'),fixtureKey=path.join(fixtures,'first.key');
if(!fs.existsSync(fixtureKey)){const jwk=JSON.parse(fs.readFileSync(path.join(fixtures,'first.jwk'),'utf8'));fs.writeFileSync(fixtureKey,crypto.createPrivateKey({key:jwk,format:'jwk'}).export({format:'pem',type:'pkcs8'}),{flag:'wx',mode:0o600});}
const certificate=new crypto.X509Certificate(fs.readFileSync(path.join(fixtures,'first.pem'))),key=crypto.createPrivateKey(fs.readFileSync(fixtureKey));
assert.equal(certificate.publicKey.export({type:'spki',format:'pem'}),crypto.createPublicKey(key).export({type:'spki',format:'pem'}));assert(certificate.checkHost('www.sm.sjhl.online'));
const fixtureCheck=spawnSync(process.execPath,['-e',"const fs=require('node:fs'),path=require('node:path'),dir=process.env.VNET_TLS_TEST_FIXTURES;require('./tls-center/certificate.cjs').validatePair(fs.readFileSync(path.join(dir,'first.pem')),fs.readFileSync(path.join(dir,'first.key')),['sm.sjhl.online','www.sm.sjhl.online']);"],{cwd:source,env:process.env,encoding:'utf8',windowsHide:true});assert.equal(fixtureCheck.status,0,'TLS fixture trust precheck failed');
const confirmed=JSON.parse(fs.readFileSync(path.join(source,`reports/project-release-${id}-confirmed-baseline.json`),'utf8'));
assert.equal(confirmed.installedRelease,previousId);assert.equal(confirmed.normalOperation,true);assert.equal(confirmed.manualChanges,false);assert.equal(confirmed.unfinishedUpgrade,false);
const previous=previousRelease(source),installerNames=['transaction.cjs','install-runner.cjs','confirmed-test-cleanup.cjs','WindowsBridge.ps1','InstallProject.ps1','InstallProject.bat'];
const packageNames=['make-draft.cjs','previous-release.cjs','package-project.ps1','prepare-project-release.cjs','candidate-smoke.cjs','PROJECT_RELEASE_README.md'];
function snapshot(){const files={};for(const unit of units)for(const[name,hash]of Object.entries(tree(plain(path.join(source,unit))).files))if(hash)files[name?unit+'/'+name:unit]=hash;return{files,tools:Object.fromEntries(installerNames.map(name=>[name,sha(fs.readFileSync(path.join(__dirname,name)))])),packaging:Object.fromEntries(packageNames.map(name=>[name,sha(fs.readFileSync(path.join(__dirname,name)))]))};}
const before=snapshot(),started=Date.now();
const frozenPath=path.join(source,`reports/project-release-${id}-frozen-source.json`);
const resume=process.argv.includes('--resume')?JSON.parse(fs.readFileSync(frozenPath,'utf8')):null;
if(resume){assert.deepEqual(resume.source.files,before.files,'Business bytes changed; verification reuse rejected');assert.deepEqual(resume.source.tools,before.tools,'Installer bytes changed; verification reuse rejected');}
fs.writeFileSync(path.join(source,`reports/project-release-${id}-frozen-source.json`),JSON.stringify({id,at:new Date().toISOString(),source:before},null,2));
function run(label,args,timeout=180000){const start=Date.now(),r=spawnSync(process.execPath,args,{cwd:source,env:process.env,encoding:'utf8',windowsHide:true,maxBuffer:20*1024*1024,timeout});const log=(r.stdout||'')+(r.stderr||'');const logPath=path.join(source,`reports/project-release-${id}-${label}.log`);fs.writeFileSync(logPath,log);if(r.status!==0){console.error(log.slice(-2400));throw Error(label+' failed; see '+path.basename(logPath));}const tests=Number(/^# tests (\d+)$/m.exec(log)?.[1]||0),passed=Number(/^# pass (\d+)$/m.exec(log)?.[1]||0);if(args.includes('--test'))assert(tests>0&&tests===passed);const proof={passed:true,count:tests,durationMs:Date.now()-start,logSha256:sha(Buffer.from(log))};console.log(JSON.stringify({step:label,...proof}));return proof;}
for(const file of Object.keys(before.files)){assert(!/(^|\/)(?:\.env|\.runtime|certs|reports|tests)(?:\/|$)/.test(file));assert(!/\.(?:pfx|key|pem|passphrase)$/i.test(file));const bytes=fs.readFileSync(path.join(source,file));assert(!/-----BEGIN (?:RSA |EC |ENCRYPTED )?PRIVATE KEY-----/.test(bytes.toString('utf8')));}
const pkg=JSON.parse(fs.readFileSync(path.join(source,'package.json')));assert.equal(Object.keys(pkg.dependencies||{}).length,0);assert.equal(Object.keys(pkg.devDependencies||{}).length,0);
for(const[file,hash]of Object.entries(previous.manifest.dependencies))assert.equal(sha(fs.readFileSync(path.join(source,file))),hash);
const pdf=JSON.parse(fs.readFileSync(path.join(source,'vendor/pdfjs/manifest.json')));for(const[file,hash]of Object.entries(pdf.files))assert.equal(sha(fs.readFileSync(path.join(source,'vendor/pdfjs',file))),hash);
for(const file of ['.runtime/project-release.lock','.maintenance.lock','.hotfix-transaction.json'])assert(!fs.existsSync(path.join(source,file)),'Local release state requires inspection: '+file);
const browserFile=path.join(source,'reports/research-ui-20261021-validation.json'),browser=JSON.parse(fs.readFileSync(browserFile,'utf8'));assert.equal(browser.passed,true);
function reuse(label){const log=fs.readFileSync(path.join(source,`reports/project-release-${id}-${label}.log`),'utf8');const count=Number(/^# tests (\d+)$/m.exec(log)?.[1]||0);if(label==='business'){assert(count>0&&Number(/^# pass (\d+)$/m.exec(log)?.[1])===count);assert(/^# fail 0$/m.test(log));}else assert(/JavaScript files: syntax OK/.test(log));const proof={passed:true,count,reused:true,sourceFilesSha256:sha(JSON.stringify(before.files)),logSha256:sha(Buffer.from(log))};console.log(JSON.stringify({step:label,...proof}));return proof;}
const syntax=resume?reuse('syntax'):run('syntax',['scripts/check.mjs']);
const tests=fs.readdirSync(path.join(source,'tests')).filter(name=>/^(?:research.*|project-page|base-sync|platform-navigation)\.test\.mjs$/.test(name)).map(name=>'tests/'+name);
const business=resume?reuse('business'):run('business',['--test','--test-concurrency=1','--test-reporter=tap',...tests]);
const validationFile=path.join(source,`reports/project-release-${previousId}-validation.json`),previousPreflight=path.join(source,`reports/project-release-${previousId}-preflight.json`);
let baselineValidation;
if(fs.existsSync(validationFile))baselineValidation=JSON.parse(fs.readFileSync(validationFile,'utf8'));
else {const bytes=fs.readFileSync(previousPreflight);assert.equal(sha(bytes),previous.proof.preflightSha256,'Previous preflight proof changed');const data=JSON.parse(bytes);assert.equal(data.status,'PREFLIGHT_STATIC_PASSED');baselineValidation={release:data.release,source:{tools:data.tools}};}
assert.equal(baselineValidation.release.passed,true);assert.deepEqual(before.tools,baselineValidation.source.tools,'Installer bytes changed: a new full fault matrix is required');
const releaseEvidenceId=baselineValidation.release.reusedFrom||previousId;assert.match(releaseEvidenceId,/^\d{8}\.\d+$/);
const oldReleaseLog=fs.readFileSync(path.join(source,`reports/project-release-${releaseEvidenceId}-release.tap`));assert.equal(sha(oldReleaseLog),baselineValidation.release.evidenceSha256);
const wrapper=run('packaging-gates',['--test','--test-reporter=tap','release-tools/metadata.test.cjs','release-tools/wrapper.test.cjs']);
const nativeExercise=run('native',['--test','--test-reporter=tap','release-tools/native-install.test.cjs']);
assert.deepEqual(snapshot(),before,'Source or packaging changed during preflight');
const proof={schema:1,id,at:new Date().toISOString(),status:'PREFLIGHT_STATIC_PASSED',predecessor:{id:previousId,sha256:previous.proof.sha256,manifestSha256:previous.proof.manifestSha256,userConfirmedInstalled:true},confirmedBaselineSha256:sha(fs.readFileSync(path.join(source,`reports/project-release-${id}-confirmed-baseline.json`))),baselineAuditSha256:sha(fs.readFileSync(auditFile)),files:before.files,tools:before.tools,packaging:before.packaging,dependencies:previous.manifest.dependencies,pdfFiles:Object.keys(pdf.files).length,productionDependencies:0,businessTests:business.count,syntax,wrapper,nativeExercise,browserSha256:sha(fs.readFileSync(browserFile)),release:{passed:true,count:baselineValidation.release.count,reusedFrom:releaseEvidenceId,installerBytesUnchanged:true,evidenceSha256:sha(oldReleaseLog)},durationMs:Date.now()-started,serverInstallationExecuted:false};
fs.writeFileSync(path.join(source,`reports/project-release-${id}-preflight.json`),JSON.stringify(proof,null,2));
console.log(JSON.stringify({status:proof.status,id,businessTests:business.count,files:Object.keys(before.files).length,durationMs:proof.durationMs}));
