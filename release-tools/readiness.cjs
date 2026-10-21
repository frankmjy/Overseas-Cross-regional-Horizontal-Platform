'use strict';
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {sha,plain}=require('./transaction.cjs'),{units}=require('./make-draft.cjs'),{previousRelease}=require('./previous-release.cjs');
const source=path.resolve(__dirname,'..'),previous=previousRelease(source),files={};
const validation=JSON.parse(fs.readFileSync(path.join(source,'reports/project-release-20261019.2-validation.json'),'utf8'));assert.equal(validation.passed,true);
function walk(relative){const input=plain(path.join(source,relative)),stat=fs.lstatSync(input);assert(!stat.isSymbolicLink());if(stat.isDirectory())for(const name of fs.readdirSync(input))walk(relative+'/'+name);else{assert(stat.isFile());assert(!/(^|\/)(?:\.env|\.runtime|certs|reports|tests)(?:\/|$)/.test(relative));assert(!/\.(?:pfx|key|pem|passphrase)$/i.test(relative));const bytes=fs.readFileSync(input);assert(!/-----BEGIN (?:RSA |EC |ENCRYPTED )?PRIVATE KEY-----/.test(bytes.toString('utf8')));files[relative]=sha(bytes);}}
for(const unit of units)walk(unit);
const pkg=JSON.parse(fs.readFileSync(path.join(source,'package.json'),'utf8'));assert.equal(Object.keys(pkg.dependencies||{}).length,0);assert.equal(Object.keys(pkg.devDependencies||{}).length,0);
for(const[file,hash]of Object.entries(previous.manifest.dependencies))assert.equal(sha(fs.readFileSync(path.join(source,file))),hash);
const pdf=JSON.parse(fs.readFileSync(path.join(source,'vendor/pdfjs/manifest.json'),'utf8'));for(const[file,hash]of Object.entries(pdf.files))assert.equal(sha(fs.readFileSync(path.join(source,'vendor/pdfjs',file))),hash);
assert(units.includes('knowledge'));for(const file of ['knowledge/service.mjs','knowledge/http.mjs','knowledge/config.json','research/projects.mjs','research/web/project-scope.mjs'])assert(files[file]);
const config=JSON.parse(fs.readFileSync(path.join(source,'research/config.json'),'utf8'));assert.equal(config.defaultProject,'malaysia');assert.equal(Object.keys(config.projects).length,2);assert(!config.tables);
assert.deepEqual(files,validation.source.files);
const proof={schema:1,id:'20261019.2',at:new Date().toISOString(),status:'PREFLIGHT_STATIC_PASSED',predecessor:{id:previous.manifest.id,sha256:previous.proof.sha256,userConfirmedInstalled:true},files,tools:Object.fromEntries(['transaction.cjs','install-runner.cjs','confirmed-test-cleanup.cjs','WindowsBridge.ps1','InstallProject.ps1','InstallProject.bat'].map(name=>[name,sha(fs.readFileSync(path.join(__dirname,name)))])),dependencies:previous.manifest.dependencies,pdfFiles:Object.keys(pdf.files).length,productionDependencies:0,businessTests:validation.business.count,releaseTests:validation.release.count,syntaxFiles:validation.syntaxFiles,serverInstallationExecuted:false};
assert.deepEqual(proof.tools,validation.source.tools);
fs.writeFileSync(path.join(source,'reports/project-release-20261019.2-preflight.json'),JSON.stringify(proof,null,2));console.log(JSON.stringify({files:Object.keys(files).length,pdfFiles:proof.pdfFiles,productionDependencies:0,status:proof.status}));
