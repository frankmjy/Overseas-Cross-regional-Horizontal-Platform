const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {previousRelease}=require('./previous-release.cjs'),{makeDraft}=require('./make-draft.cjs');
const source=path.resolve(__dirname,'..');
test('confirmed previous release resolves only safe version identities',()=>{assert.throws(()=>previousRelease(source,'../other'));assert.throws(()=>previousRelease(source,'20261021.1/other'));const previous=previousRelease(source,'20261019.2');assert.equal(previous.manifest.id,'20261019.2');assert.equal(previous.proof.status,'LOCAL_INSTALL_ROLLBACK_AND_CANDIDATE_SMOKE_PASSED');});
test('new candidate rejects malformed identity before touching output',()=>{assert.throws(()=>makeDraft({source,output:'unused',auditFile:'unused',id:'../other'}),/RELEASE_ID_INVALID/);});
test('packager carries the selected release into the frozen manifest',()=>{const packager=fs.readFileSync(path.join(__dirname,'package-project.ps1'),'utf8');assert.match(packager,/\$id=\$ReleaseId/);assert.match(packager,/make-draft\.cjs'\) \$root \$bundle \$AuditFile \$id/);});
