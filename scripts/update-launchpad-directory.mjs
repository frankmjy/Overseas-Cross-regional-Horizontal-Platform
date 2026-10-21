import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
const file='reports/overseas-directory-20261018/directory-plan.json';
const plan=JSON.parse(await fs.readFile(file,'utf8'));
if(plan.folders.some(f=>f.code))throw Error('现行目录已有完整层级编码，禁止用旧阶段脚本重置。');
const ledger=JSON.parse(await fs.readFile('reports/source-references-20261018/migration-ledger.json','utf8'));
const replaced=['commercial-thailand','settings-thailand','commercial-malaysia','settings-malaysia'];
assert(plan.folders.filter(f=>replaced.includes(f.key)).every(f=>f.id));
plan.folders=plan.folders.filter(f=>!replaced.includes(f.key)&&!f.key.startsWith('launchpad-'));
for(const [project,key,id,code] of [['th','thailand','bflW18vVghZVHXpN','TH'],['my','malaysia','bfl9sRi89t5JD1f9','MY']]){
 const folder={key:'launchpad-'+key,id,name:`00 ${code} Project Launchpad（项目前置统筹）`,parent:key};
 const at=plan.folders.findIndex(f=>f.parent===key);plan.folders.splice(at,0,folder);
 for(const table of Object.values(ledger.projects[project])){
  const entry=plan.tables.find(t=>t.id===table.id);assert(entry);entry.parent=folder.key;
 }
}
assert.equal(plan.tables.length,113);
plan.at=new Date().toISOString();
await fs.writeFile(file,JSON.stringify(plan,null,2));
await fs.appendFile('progress.md','\n2026-10-18：用户最新要求迁入表集中在单独模块，并强调同时涵盖测试前置与运维提前介入。已改名 Project Launchpad（项目前置统筹），泰国/马来各17表全部迁入各自项目下独立目录，排项目首位；4个本次新建空目录已清理，原79表及历史归档不动。UI已核对34表父目录；当前仍需完成表单旧版能力、自动编号关联及源视图回读等迁移收尾，不得宣称全部迁移验证完成。\n');
console.log(JSON.stringify({tables:plan.tables.length,folders:plan.folders.length,launchpadTables:plan.tables.filter(t=>t.parent.startsWith('launchpad-')).length}));
