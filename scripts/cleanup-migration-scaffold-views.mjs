import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import {BaseAdapter} from '../research/adapter.mjs';
const dir='reports/source-references-20261018';
const ledger=JSON.parse(await fs.readFile(dir+'/migration-ledger.json','utf8'));
const audit=JSON.parse(await fs.readFile(dir+'/migration-audit.json','utf8'));
const api=new BaseAdapter({baseToken:ledger.target});
const created=new Map(Object.values(ledger.projects).flatMap(p=>Object.values(p)).map(m=>[m.id,m]));
const report=[];
for(const item of audit.viewScaffolds){
 const m=created.get(item.table);assert(m,'Only migration-created tables may change');
 assert(item.name==='表格'||item.table==='tblCTyrV3BYSZkTv'&&item.view==='vewRPk6OJq'&&item.name==='查询页','Unexpected scaffold');
 const current=(await api.cli('+view-list',['--table-id',m.id])).views;
 assert(Object.values(m.views).every(v=>current.some(c=>c.id===v.id)),'Preserved source view missing');
 assert(!Object.values(m.views).some(v=>v.id===item.view));
 if(current.some(v=>v.id===item.view))await api.cli('+view-delete',['--table-id',m.id,'--view-id',item.view,'--yes']);
 const after=(await api.cli('+view-list',['--table-id',m.id])).views;
 assert(!after.some(v=>v.id===item.view));
 assert(Object.values(m.views).every(v=>after.some(c=>c.id===v.id)));
 report.push({...item,removed:true,sourceViewsRetained:true});
 await fs.writeFile(dir+'/scaffold-view-cleanup.json',JSON.stringify(report,null,2));
 console.log(JSON.stringify({table:m.id,remainingViews:after.length,removed:item.name}));
}
