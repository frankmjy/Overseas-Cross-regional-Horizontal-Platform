const fs=require('node:fs'),path=require('node:path');
const {sha,core}=require('./transaction.cjs');
const units=['server.mjs','base-sync.mjs','application-settings.mjs','team-organization.mjs','package.json','index.html','.env.example','DEPLOY_README.md','RESEARCH_DEPLOY.md','THAI_NEXUSLINK_BOI_bilingual.xlsx','THAI_NEXUSLINK_BOI_original.xlsx','src','assets','research','knowledge','auth','project-tasks','vendor/pdfjs'];
const coreFiles=['server.mjs','base-sync.mjs','application-settings.mjs','team-organization.mjs','package.json','research/adapter.mjs','research/http.mjs','research/service.mjs','research/local-records.mjs','research/config.json','auth/service.mjs','auth/http.mjs','auth/config.json','project-tasks/service.mjs','knowledge/meeting-service.mjs'];
function makeDraft({source,output,auditFile,id=process.env.OVERSEAS_RELEASE_ID||'20261019.2',overrides={}}){
 if(!/^\d{8}\.\d+$/.test(id))throw new Error('RELEASE_ID_INVALID');
 const audit=JSON.parse(fs.readFileSync(auditFile,'utf8')),payload=path.join(output,'payload'),files={};
 fs.mkdirSync(payload,{recursive:true});
 function copy(relative){const input=path.join(source,relative),stat=fs.lstatSync(input);if(stat.isSymbolicLink())throw new Error('RELEASE_SOURCE_REPARSE');if(stat.isDirectory()){for(const name of fs.readdirSync(input))copy(relative+'/'+name);}else{const bytes=fs.readFileSync(input);if(/-----BEGIN (?:RSA |EC |ENCRYPTED )?PRIVATE KEY-----/.test(bytes.toString('utf8')))throw new Error('RELEASE_PRIVATE_MATERIAL');files[relative]=sha(bytes);const destination=path.join(payload,relative);fs.mkdirSync(path.dirname(destination),{recursive:true});fs.writeFileSync(destination,bytes,{flag:'wx'});}}
 for(const unit of units)copy(unit);
 const dependencies=Object.fromEntries(['vendor/lark-cli/run.cjs','vendor/lark-cli/bin/lark-cli.exe'].map(file=>{const hash=audit.publicFiles[file]?.sha256;if(!hash||sha(fs.readFileSync(path.join(source,file)))!==hash)throw new Error('RELEASE_CLI_DEPENDENCY_CHANGED');return [file,hash];}));
 const previous=require('./previous-release.cjs').previousRelease(source);
 const manifest={schema:1,id,targetRoot:audit.root,node:audit.port3333[0].executable,port:3333,domain:'www.sm.sjhl.online',fingerprint:audit.sharedTls.fingerprint,units,files,core:core(payload,coreFiles),baselineCore:previous.manifest.core,dependencies,health:{rootSha:files['research/web/index.html'],projectSha:files['index.html'],formalProjects:true,knowledgeSha:files['knowledge/web/index.html'],authSha:files['auth/web/login.html']},baselineAuditSha256:sha(fs.readFileSync(auditFile)),predecessor:{id:previous.manifest.id,sha256:previous.proof.sha256,manifestSha256:previous.proof.manifestSha256,userConfirmedInstalled:true},...overrides};
 fs.writeFileSync(path.join(output,'release-manifest.json'),JSON.stringify(manifest,null,2));return manifest;
}
module.exports={makeDraft,units,coreFiles};
if(require.main===module){const [source,output,auditFile,id]=process.argv.slice(2);makeDraft({source,output,auditFile,id});}
