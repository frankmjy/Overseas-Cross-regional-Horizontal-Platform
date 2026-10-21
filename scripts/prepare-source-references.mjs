import fs from 'node:fs/promises';import {BaseAdapter} from '../research/adapter.mjs';
const dir='reports/source-references-20261018',base='FmIwbCqj1ax5MvsTp5OcPO5lnue',b=new BaseAdapter({baseToken:base});
const structs=JSON.parse(await fs.readFile(dir+'/source-structure.json','utf8'));
const defs=[
 ['tasks','tbl6ZRGOwUGLIIWY','Thailand Task Execution（泰国任务执行引用）','readiness-thailand'],
 ['documents','tblYPOOSNaNd16dh','Thailand Project Documents（泰国项目资料引用）','readiness-thailand'],
 ['issues','tbl5ocKDxpRn1T4d','Thailand Project Issues（泰国项目问题引用）','operations-thailand'],
 ['penalties','tblT8FomJ6U6b3gU','Thailand Contract Terms（泰国履约条款引用）','operations-thailand'],
 ['stakeholders','tblY1bLqk8E7xzZP','Thailand Stakeholders（泰国干系人引用）','people-thailand'],
 ['organization','tblczZBgYW8I2ony','Thailand Organization（泰国组织架构引用）','people-thailand'],
 ['staffing','tblme8fLy3FrmZ0s','Thailand Staffing（泰国人员配置引用）','people-thailand'],
 ['costs','tblt7Nmo3HxkHwGz','Thailand Cost Plan（泰国成本交底引用）','finance-thailand'],
 ['payments','tblGQd3xjS1MKLCs','Thailand Payments（泰国支付跟踪引用）','finance-thailand'],
 ['receivables','tblCeib8GCQNGvyZ','Thailand Receivables（泰国结算回款引用）','finance-thailand']
].map(([key,source,name,parent])=>({key,source,name,parent,base}));
const old=await b.cli('+view-list',['--table-id',defs[0].source]);let view=old.views.find(v=>v.name==='Overseas Reference（海外引用源）');
if(!view){const d=await b.cli('+view-create',['--table-id',defs[0].source,'--json',JSON.stringify({name:'Overseas Reference（海外引用源）',type:'grid'})]);view=d.views?.[0]||d.view;await fs.writeFile(dir+'/created-source-view.json',JSON.stringify(view,null,2));}
await b.cli('+view-set-filter',['--table-id',defs[0].source,'--view-id',view.id,'--json',JSON.stringify({logic:'and',conditions:[]})]);
const task=structs.find(t=>t.id===defs[0].source);await b.cli('+view-set-visible-fields',['--table-id',task.id,'--view-id',view.id,'--json',JSON.stringify({visible_fields:task.fields.map(f=>f.id)})]);
for(const d of defs){const s=structs.find(t=>t.id===d.source);d.sourceName=s.table?.name||s.name;d.view=d.key==='tasks'?view.id:s.views.find(v=>v.type==='grid'&&!v._meta?.filter).id;d.viewName=d.key==='tasks'?view.name:s.views.find(v=>v.id===d.view).name;}
await fs.writeFile(dir+'/plan.json',JSON.stringify(defs,null,2));console.log(JSON.stringify(defs.map(d=>({name:d.name,source:d.source,view:d.viewName,parent:d.parent}))));
