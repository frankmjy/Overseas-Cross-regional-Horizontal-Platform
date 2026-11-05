const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {previousRelease}=require('./previous-release.cjs'),{makeDraft}=require('./make-draft.cjs');
const source=path.resolve(__dirname,'..');
test('confirmed previous release resolves only safe version identities',()=>{assert.throws(()=>previousRelease(source,'../other'));assert.throws(()=>previousRelease(source,'20261021.1/other'));const id=process.env.OVERSEAS_PREVIOUS_RELEASE||'20261019.2',previous=previousRelease(source,id);assert.equal(previous.manifest.id,id);assert.equal(previous.proof.status,'LOCAL_INSTALL_ROLLBACK_AND_CANDIDATE_SMOKE_PASSED');});
test('new candidate rejects malformed identity before touching output',()=>{assert.throws(()=>makeDraft({source,output:'unused',auditFile:'unused',id:'../other'}),/RELEASE_ID_INVALID/);});
test('packager carries the selected release into the frozen manifest',()=>{const packager=fs.readFileSync(path.join(__dirname,'package-project.ps1'),'utf8');assert.match(packager,/\$id=\$ReleaseId/);assert.match(packager,/make-draft\.cjs'\) \$root \$bundle \$AuditFile \$id/);});

test('all relative runtime imports belong to the release payload',()=>{
 const {units}=require('./make-draft.cjs'),files=new Set();
 function visit(relative){const target=path.join(source,relative);if(fs.statSync(target).isDirectory())for(const name of fs.readdirSync(target))visit(relative+'/'+name);else files.add(relative);}
 for(const unit of units)visit(unit);
 require('./transaction.cjs').validateManifest({schema:1,id:'20261031.1',units,files:{},core:{},baselineCore:{},dependencies:{}});
 for(const file of files){if(!/\.(?:mjs|js)$/.test(file)||file.startsWith('vendor/'))continue;const text=fs.readFileSync(path.join(source,file),'utf8');for(const match of text.matchAll(/(?:\bfrom\s*|\bimport\s*\(\s*)['"](\.[^'"]+)['"]/g)){const target=path.posix.normalize(path.posix.join(path.posix.dirname(file),match[1]));assert(files.has(target),`${file} imports missing payload module ${target}`);}}
 assert(files.has('coordination/http.mjs'));assert(files.has('priorities/service.mjs'));assert(files.has('src/staffing-overview.js'));
});
