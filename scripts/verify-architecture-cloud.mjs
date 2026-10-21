import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {BaseAdapter} from '../research/adapter.mjs';
process.env.LARK_CLI_SCRIPT=path.resolve('.tmp/lark-cli-1.0.98/package/scripts/run.js');
const plan=JSON.parse(await fs.readFile('reports/overseas-directory-20261018/directory-plan.json','utf8'));
const api=new BaseAdapter({baseToken:plan.base});
const dir='reports/project-cleanup-20261018';
let after,content,missing;
for(let attempt=0;attempt<3;attempt++){
 after=await api.cli('+fetch',['--doc','VDQgdT3wyoWKElxmvFcclf6bnnK','--detail','full'],process.cwd(),'docs');content=after.document.content;
 missing=plan.tables.filter(t=>!content.includes('table='+t.id)||!content.includes(t.code));
 if(!missing.length&&(content.match(/<img\b/g)||[]).length===3&&!/【(?:platform|project|hub)图示】/.test(content))break;
}
await fs.writeFile(dir+'/architecture-cloud-final.json',JSON.stringify(after,null,2));
assert(content.includes('项目前置统筹'));assert(content.includes('测试前置'));assert(content.includes('运维提前介入'));
assert.equal((content.match(/<img\b/g)||[]).length,3,'Three diagrams required');assert(!/【(?:platform|project|hub)图示】/.test(content));
assert.equal(missing.length,0,'Missing coded table links: '+missing.map(t=>t.id).join(','));
assert(content.includes('02.01.03'));assert(content.includes('03.01.03'));
assert(!content.includes('马来西亚'),'Use the Chinese short name');
assert(content.includes('国家名称只保留在项目一级目录'),'Naming rule is required');
assert(!/\d{2}\.\d{2}\.\d{2}\s+(?:泰国|马来)/.test(content),'Child table labels must omit country prefixes');
const ids=[...new Set([...content.matchAll(/table=(tbl\w+)/g)].map(m=>m[1]))];assert.equal(ids.length,113);
const title=/<title\b[^>]*>([\s\S]*?)<\/title>/.exec(content)?.[1];assert(title?.includes('00.01'));
const result={at:new Date().toISOString(),document:after.document.document_id,revision:after.document.revision_id,title,images:3,uniqueLinkedTables:ids.length,allCodedTableLinksPresent:true,placeholders:0,contentSha256:createHash('sha256').update(content).digest('hex')};
await fs.writeFile(dir+'/architecture-cloud-verification.json',JSON.stringify(result,null,2));console.log(JSON.stringify(result));
