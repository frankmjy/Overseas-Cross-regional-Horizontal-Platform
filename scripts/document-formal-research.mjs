import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {BaseAdapter} from '../research/adapter.mjs';
const dir='reports/research-formal-20261019',read=async file=>JSON.parse(await fs.readFile(file,'utf8')),config=await read('research/config.json'),base=new BaseAdapter(config);
process.env.LARK_CLI_SCRIPT=path.resolve('.tmp/lark-cli-1.0.98/package/scripts/run.js');
const plan=await read('reports/overseas-directory-20261018/directory-plan.json');
for(const [project,target]of Object.entries(config.projects)){
 const directory=await read(`${dir}/directory-${project}.json`),proof=await read(`${dir}/directory-ui-proof.json`);assert(proof.some(row=>row.id===`bitable-ssr-sidebar-item-${directory.table}`&&row.text===directory.name));
 const parent=plan.folders.find(folder=>folder.id===directory.parent);assert(parent);if(!plan.tables.some(table=>table.id===directory.table))plan.tables.push({id:directory.table,name:directory.name,parent:parent.key,code:project==='thailand'?'02.02.04':'03.02.04',role:'business'});
 directory.status='verified-native-ui';directory.verifiedAt=new Date().toISOString();await fs.writeFile(`${dir}/directory-${project}.json`,JSON.stringify(directory,null,2));
 const views=(await base.cli('+view-list',['--table-id',target.tables.topics])).views;assert.equal(views.length,1);const view=views[0];
 if(view.name!=='Overview（总览）')await base.cli('+view-rename',['--table-id',target.tables.topics,'--view-id',view.id,'--name','Overview（总览）']);
 await base.cli('+view-set-visible-fields',['--table-id',target.tables.topics,'--view-id',view.id,'--json',JSON.stringify({visible_fields:[target.fieldIds.topics.专题名称,target.fieldIds.topics.专题说明]})]);
 const actual=await base.cli('+view-get',['--table-id',target.tables.topics,'--view-id',view.id]);await fs.writeFile(`${dir}/topic-view-${project}.json`,JSON.stringify(actual,null,2));
 const confirmed=(await base.cli('+view-list',['--table-id',target.tables.topics])).views;assert.equal(confirmed[0].name,'Overview（总览）');
}
assert.equal(plan.tables.length,115);await fs.writeFile('reports/overseas-directory-20261018/directory-plan.json',JSON.stringify(plan,null,2));await fs.writeFile(`${dir}/directory-plan.json`,JSON.stringify(plan,null,2));
const doc='VDQgdT3wyoWKElxmvFcclf6bnnK',keyword=()=>base.cli('+fetch',['--doc',doc,'--scope','keyword','--keyword','调研|115|113|5.1','--detail','full'],process.cwd(),'docs');
let current=await keyword();await fs.writeFile(`${dir}/architecture-cloud-before.json`,JSON.stringify(current,null,2));
if(current.document.content.includes('113张数据表'))await base.cli('+update',['--doc',doc,'--command','str_replace','--pattern','113张数据表和1份架构云文档共145个目录项','--content','115张数据表和1份架构云文档共147个目录项'],process.cwd(),'docs');
for(const [project,target]of Object.entries(config.projects)){
 current=await keyword();const prefix=project==='thailand'?'02.02':'03.02';const blocks=[...current.document.content.matchAll(/<p id="([^"]+)">([\s\S]*?)<\/p>/g)];const block=blocks.find(row=>row[2].includes(`${prefix} 项目筹备：`));assert(block);
 if(!block[2].includes(target.tables.topics))await base.cli('+update',['--doc',doc,'--command','block_replace','--block-id',block[1],'--revision-id',String(current.document.revision_id),'--content',`<p>${block[2]} · <a href="${config.baseUrl}?table=${target.tables.topics}">${prefix}.04 专题目录</a></p>`],process.cwd(),'docs');
}
current=await keyword();
if(!current.document.content.includes('5.1 调研正式数据源')){
 const content=`<h2>5.1 调研正式数据源</h2>
<p>调研页面按泰国、马来读取各自项目筹备目录的正式问题、明细、证据和专题目录。原共用调研保留为来源参照，页面不再向参照表新增业务记录。原始表“目录整理版”的有效文字与资料引用已按内容归属整理，来源单元格链接保留在正式表。</p>
<whiteboard type="mermaid">sequenceDiagram
participant U as 调研页面
participant T as 泰国正式表
participant M as 马来正式表
alt 新增选择泰国
U-&gt;&gt;T: 新增问题和五个调研对象明细
else 新增选择马来或通用
U-&gt;&gt;M: 新增问题和五个调研对象明细
end
Note over U,M: 通用条目标记适用范围为通用，默认存入马来
T--&gt;&gt;U: 回读核对正式记录
M--&gt;&gt;U: 回读核对正式记录</whiteboard>
<p>历史资料中可复用内容保留在两国正式表；国家明确的访谈事实和现场参数只进入对应国家。新增问题选择“泰国项目”“马来项目”或“通用”；新增通用默认进入马来正式表，不自动复制到泰国。正文继续使用中文，目录、表名和字段名保持英文在前、中文在后。附件保留原引用；后续页面上传的附件写入所选项目的正式证据表。</p>
<p>页面先持久化正式提交任务，再后台同步飞书。两国分别维护缓存、附件和重试台账，相同提交标识的重试不会重复建表内记录，也不会跨国家写入。</p>`;
 await fs.writeFile(`${dir}/architecture-research.xml`,content);await base.cli('+update',['--doc',doc,'--command','append','--revision-id',String(current.document.revision_id),'--content',`@${dir}/architecture-research.xml`],process.cwd(),'docs');
}
const after=await keyword();assert(after.document.content.includes('115张数据表'));assert(after.document.content.includes('5.1 调研正式数据源'));assert(Object.values(config.projects).every(project=>after.document.content.includes(project.tables.topics)));await fs.writeFile(`${dir}/architecture-cloud-after.json`,JSON.stringify(after,null,2));console.log(JSON.stringify({tables:115,doc,revision:after.document.revision_id,verified:true}));
