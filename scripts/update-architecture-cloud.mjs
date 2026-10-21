import fs from 'node:fs/promises';
import path from 'node:path';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import assert from 'node:assert/strict';
const exec=promisify(execFile);
const cli=path.resolve('.tmp/lark-cli-1.0.98/package/scripts/run.js');
const dir='reports/project-cleanup-20261018';
const doc='VDQgdT3wyoWKElxmvFcclf6bnnK';
async function call(domain,command,args=[]){
 let stdout;try{({stdout}=await exec(process.execPath,[cli,domain,command,...args,'--as','bot','--jq','.'],{windowsHide:true,timeout:90000,maxBuffer:12*1024*1024,encoding:'utf8'}));}catch(e){stdout=e.stdout||e.stderr;if(!stdout)throw Error('CLI unavailable');}
 const result=JSON.parse(stdout);if(!result.ok){const error={type:result.error?.type,code:result.error?.code??result.code,message:typeof result.error==='string'?result.error.replace(/https?:\/\/\S+/g,'[URL]').slice(0,1600):result.error?.message,keys:Object.keys(result),data:result.data};console.log(JSON.stringify({command,error}));throw Error('Document operation failed');}return result.data;
}
const mode=process.argv[2]||'read';
const before=await call('docs','+fetch',['--doc',doc,'--detail','full']);
await fs.writeFile(dir+'/architecture-cloud-current.json',JSON.stringify(before,null,2));
const content=before.document.content;
console.log(JSON.stringify({document:before.document.document_id,revision:before.document.revision_id,launchpad:content.includes('项目前置统筹'),images:(content.match(/<img\b/g)||[]).length,boards:(content.match(/<whiteboard\b/g)||[]).length}));
if(mode==='write'){
 await fs.writeFile(dir+'/architecture-before-cloud-update.json',JSON.stringify(before,null,2),{flag:'wx'}).catch(e=>{if(e.code!=='EEXIST')throw e;});
 const desired=await fs.readFile(dir+'/architecture-guide.xml','utf8');assert(desired.includes('项目前置统筹'));assert.equal((desired.match(/<whiteboard\b/g)||[]).length,3);
 const out=await call('docs','+update',['--doc',doc,'--command','overwrite','--content','@'+dir+'/architecture-guide.xml']);
 await fs.writeFile(dir+'/architecture-cloud-write-result.json',JSON.stringify(out,null,2));console.log(JSON.stringify({writeResult:out.result,keys:Object.keys(out)}));
}
