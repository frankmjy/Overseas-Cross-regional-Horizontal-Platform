import fs from 'node:fs/promises';
import {BaseAdapter} from '../research/adapter.mjs';
import {normalizeRows} from '../research/service.mjs';
const p=JSON.parse(await fs.readFile('reports/overseas-directory-20261018/directory-plan.json','utf8')),api=new BaseAdapter({baseToken:p.base});
const audit={at:new Date().toISOString(),readOnly:true,tables:[],exactTitleOverlaps:[],recommendation:'会议记录保留日期、纪要、决策及行动项；报告保留周期、运营汇总和阶段成果。通过报告链接关联，不重复维护正文。不合表、不删除、不修改报告页面。'};
for(const code of ['02.05.01','03.05.01','02.05.02','03.05.02']){
 const t=p.tables.find(t=>t.code===code),info=await api.cli('+table-get',['--table-id',t.id]);let rows=[];
 for(let offset=0;;){const page=await api.cli('+record-list',['--table-id',t.id,'--limit','200','--offset',String(offset)]);rows.push(...normalizeRows(page));if(!page.has_more)break;if(!page.data.length)throw Error('Empty pagination');offset+=page.data.length;}
 const primary=info.fields.find(f=>f.id===info.table.primary_field)?.name;
 audit.tables.push({id:t.id,name:t.name,code,fields:info.fields.filter(f=>!/^Setup Key|^Import Key|^Migration/.test(f.name)).map(f=>({name:f.name,type:f.type})),recordCount:rows.length,titles:rows.map(r=>r[primary]).filter(s=>typeof s==='string'&&s.trim())});
}
const meetings=audit.tables.filter(t=>t.code.endsWith('.01')).flatMap(t=>t.titles),reports=audit.tables.filter(t=>t.code.endsWith('.02')).flatMap(t=>t.titles);
audit.exactTitleOverlaps=[...new Set(meetings.filter(t=>reports.includes(t)))];
await fs.writeFile('reports/source-references-20261018/meeting-report-boundary.json',JSON.stringify(audit,null,2));
console.log(JSON.stringify({tables:audit.tables.map(t=>({name:t.name,records:t.recordCount,fields:t.fields.map(f=>f.name)})),exactTitleOverlaps:audit.exactTitleOverlaps.length,readOnly:true}));
