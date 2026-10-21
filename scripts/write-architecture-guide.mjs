import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import {BaseAdapter} from '../research/adapter.mjs';
const dir='reports/project-cleanup-20261018',planFile='reports/overseas-directory-20261018/directory-plan.json';
const plan=JSON.parse(await fs.readFile(planFile,'utf8'));
const names={knowledge:'01 Overseas Operations Guide（海外运维指南）',thailand:'02 Thailand Project（泰国项目）',malaysia:'03 Malaysia Project（马来项目）',team:'04 Collaboration Hub（协同中枢）'};
for(const f of plan.folders)if(names[f.key])f.name=names[f.key];
for(const f of JSON.parse(await fs.readFile(dir+'/hub-folders.json','utf8')))if(!plan.folders.some(x=>x.id===f.id))plan.folders.push(f);
for(const t of JSON.parse(await fs.readFile(dir+'/collaboration-tables.json','utf8')))if(!plan.tables.some(x=>x.id===t.id))plan.tables.push({id:t.id,name:t.name,parent:t.parent,role:'business'});
Object.assign(plan.tables.find(t=>t.id==='tblCdANuL6HutEy1'),{parent:'collaboration-meetings'});
Object.assign(plan.tables.find(t=>t.id==='tbludeErzRHom8j6'),{parent:'archive',role:'archive'});
Object.assign(plan.documents.find(t=>t.id==='ldxpV5M0qhI0IgVy'),{documentToken:'VDQgdT3wyoWKElxmvFcclf6bnnK'});
const rootOrder=['overview','knowledge','thailand','malaysia','team','archive'];
plan.folders.sort((a,b)=>a.parent&&b.parent?0:a.parent?1:b.parent?-1:rootOrder.indexOf(a.key)-rootOrder.indexOf(b.key));
await fs.writeFile(planFile,JSON.stringify(plan,null,2));
const esc=s=>s.replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;');
const cn=s=>/（([^）]+)）/.exec(s)?.[1]||s;
const label=t=>(t.code?t.code+' ':'')+cn(t.name);
const link=t=>`<a href="https://vnet.feishu.cn/base/${plan.base}?table=${t.id}">${esc(label(t))}</a>`;
const board=s=>`<whiteboard type="mermaid">${s}</whiteboard>`;
const platform=`mindmap
  root((海外运维横向管理平台))
    00 项目总览
      平台架构指南
      项目台账
      项目管理工作区入口
    01 海外运维指南
      知识与标准
      EHS资料
      经验与专题
      培训题库
      工作模板与共用调研
    02 泰国项目
      项目前置统筹与五个运行模块
    03 马来项目
      项目前置统筹与五个运行模块
    04 协同中枢
      会议决策
      协同事项
      资源统筹
      风险联动
    90 历史来源归档
      接维历史
      运维历史
      旧版整理底稿`;
const project=`mindmap
  root((项目业务层级))
${['thailand','malaysia'].map(key=>`    ${plan.folders.find(f=>f.key===key).code} ${key==='thailand'?'泰国项目':'马来项目'}\n${plan.folders.filter(f=>f.parent===key).map(f=>`      ${f.code} ${cn(f.name)}${f.key.startsWith('launchpad-')?'\n        测试前置与运维提前介入\n        '+f.code+'.03 任务执行底表':''}`).join('\n')}`).join('\n')}`;
const hub=`mindmap
  root((协同中枢))
    04.01 会议决策
      团队例会
      跨项目议题与决策
    04.02 协同事项
      共性问题
      专项工作
      牵头与协同人员
      目标日期与办理结果
    04.03 资源统筹
      人员与专家
      物资与供应商
      工具与系统
      协调安排与落实结果
    04.04 风险联动
      多项目影响
      风险等级
      应对措施
      升级与关闭`;
let xml=`<title>${esc(plan.documents.find(d=>d.id==='ldxpV5M0qhI0IgVy').name)}</title>
<p>这份指南用于快速理解平台的目录、业务边界和填报入口。先看总架构，再按项目或业务模块打开对应表格。左侧目录、表名及字段名采用英文在前的中英双语，正文内容使用中文。</p>
<h1>1 平台总架构</h1>${board(platform)}
<p>项目总览负责导航与台账；海外运维指南集中维护知识、标准、经验、模板和共用调研；泰国与马来分别维护正式业务；协同中枢承接跨项目统筹；历史归档保留源记录和旧稿。海外运维指南排在具体项目前面。</p>
<p><b>层级编码规则：</b>一级目录采用两位编码；下级目录、文档和表格继承完整父级编码，再追加两位顺序号。同一父级下的各类目录项统一编号，不分别从01重复开始。例如“02 泰国项目 → 02.01 项目前置统筹 → 02.01.03 任务执行底表”；马来对应表为03.01.03。当前31个文件夹、113张数据表和1份架构云文档共145个目录项，编码全部唯一；编码用于导航，数据关联仍以稳定的表格ID为准。国家名称只保留在项目一级目录，下级文件夹和表名不重复国家名称或TH、MY前缀；中文简称统一使用“马来”。</p>
<h1>2 项目业务层级</h1>${board(project)}
<p>泰国项目和马来项目采用相同的六组结构。“项目前置统筹”排在各自项目的首位，集中管理从原项目管理平台迁入的17张表，涵盖测试前置、运维提前介入、团队组建、任务资料、商务成本及配置留痕；不分散到原有接维、运维或人员模块。原有五个模块继续管理各自业务。通用正式表不重复设置项目字段，也不保留示例和额外备注字段。任务执行表保留用于计算的过程组关联。马来的执行人员、日期和实际结果留空；当地政策、节假日及合同数值待属地核实后填写。</p>`;
for(const key of ['thailand','malaysia']){xml+=`<h2>${key==='thailand'?'2.1 泰国项目':'2.2 马来项目'}</h2>`;for(const f of plan.folders.filter(f=>f.parent===key)){xml+=`<p><b>${esc(label(f))}：</b>${plan.tables.filter(t=>t.parent===f.key).map(link).join(' · ')}</p>`;}}
xml+=`<h1>3 协同中枢分工</h1>${board(hub)}<p>单项目的执行事项进入对应项目表。需要多个项目共同推进的事项进入协同中枢，并用“涉及项目”标明范围。会议形成的行动可进入协同事项，通过来源链接回溯会议；资源需求和联动风险分别进入对应表。三个新台账先保留空表，待真实业务发生后填写。</p>`;
for(const f of plan.folders.filter(f=>f.parent==='team'))xml+=`<p><b>${esc(label(f))}：</b>${plan.tables.filter(t=>t.parent===f.key).map(link).join(' · ')}</p>`;
xml+='<h1>4 海外运维指南与历史归档</h1>';
const knowledge=plan.tables.filter(t=>t.parent==='knowledge');if(knowledge.length)xml+=`<p>${knowledge.map(link).join(' · ')}</p>`;
for(const f of plan.folders.filter(f=>f.parent==='knowledge'))xml+=`<p><b>${esc(label(f))}：</b>${plan.tables.filter(t=>t.parent===f.key).map(link).join(' · ')}</p>`;
xml+='<p>运维经验沉淀保留整理后的经验及来源链接，现场采用前核对适用条件。工作模板保留参照内容与原视图。共用调研中的历史比较事实不作为海外项目执行结果。历史来源归档保留原数据、原视图和附件来源链接；国内基地名称仅表示来源背景。</p>';
for(const f of plan.folders.filter(f=>f.parent==='archive'))xml+=`<p><b>${esc(label(f))}：</b>${plan.tables.filter(t=>t.parent===f.key).map(link).join(' · ')}</p>`;
xml+=`<p><b>归档底表：</b>${plan.tables.filter(t=>t.parent==='archive').map(link).join(' · ')}。原架构索引作为历史目录快照保留，现行导航以本指南为准。</p>
<h1>5 页面与数据源入口</h1>
<p><b>项目台账：</b>${link(plan.tables.find(t=>t.id==='tbl1QmyCUeB1nDHr'))}。</p>
<p><b>统一维护位置：</b>任务执行、合同履约、成本支付和结算回款已迁入本横向平台，后续统一在泰国、马来对应正式表维护。原平台保留为历史来源，工作流暂不迁移。新表的自动通知与反馈按钮暂不触发原流程。</p>
<p><cite doc-id="FmIwbCqj1ax5MvsTp5OcPO5lnue" file-type="bitable" table-id="ldxQTOrMHIaG4vuR" title="DC运维可视化项目管理-海外项目团队组建与接维（泰国Araya/Rojana）" type="doc"></cite></p>
<p><b>知识共享页面：</b>运维知识库对应海外运维指南中的知识、标准、EHS资料和经验；议事航迹分别读取泰国项目会议、马来项目会议，分类名称保持 Thailand Project、Malaysia Project。</p>
<p><b>维护规则：</b>新增表格先确定所属项目、业务模块或协同范围，再同步修改本指南的层级和入口。附件暂保留源附件链接。现场执行记录只写真实情况。</p>`;
await fs.writeFile(dir+'/architecture-guide.xml',xml);
if(!process.argv.includes('--publish')){console.log('Architecture source prepared; cloud edits require the logged-in editor.');process.exit(0);}
const cli=new BaseAdapter({baseToken:plan.base});
const before=await cli.cli('+fetch',['--doc','VDQgdT3wyoWKElxmvFcclf6bnnK','--api-version','v2'],process.cwd(),'docs');
await fs.writeFile(dir+'/architecture-document-before.json',JSON.stringify(before,null,2));
const result=await cli.cli('+update',['--doc','VDQgdT3wyoWKElxmvFcclf6bnnK','--api-version','v2','--command','overwrite','--content','@'+dir+'/architecture-guide.xml'],process.cwd(),'docs');
await fs.writeFile(dir+'/architecture-document-write.json',JSON.stringify(result,null,2));
assert.notEqual(result.result,'failed',JSON.stringify(result.warnings));
const after=await cli.cli('+fetch',['--doc','VDQgdT3wyoWKElxmvFcclf6bnnK','--api-version','v2'],process.cwd(),'docs');
await fs.writeFile(dir+'/architecture-document-after.json',JSON.stringify(after,null,2));
assert.equal((after.document.content.match(/<whiteboard\b/g)||[]).length,3);
console.log(JSON.stringify({document:after.document.document_id,boards:3,tableLinks:plan.tables.length}));
