import fs from 'node:fs/promises';
const dir='reports/migration-closeout-20261019',read=async f=>JSON.parse(await fs.readFile(f,'utf8'));
const source=await read('reports/source-references-20261018/gzipSnapshot.json'),target=await read(dir+'/target-raw.json'),ledger=await read('reports/source-references-20261018/migration-ledger.json');
const report={at:new Date().toISOString(),forms:[],gantt:[],calendar:[],layouts:[],formatDifferences:[],timebarDifferences:[]};
for(const [project,tables]of Object.entries(ledger.projects))for(const [sid,m]of Object.entries(tables)){
 const s=source.find(x=>x.schema.data.table.meta.id===sid).schema.data.table,t=target.find(x=>x.schema.data.table.meta.id===m.id).schema.data.table;
 for(const [vid,vm]of Object.entries(m.views)){
  const a=s.viewMap[vid],b=t.viewMap[vm.id];if(!a||!b)throw Error('Missing mapped view');const p=a.property,q=b.property;
  if(vm.type==='form'){
   const visible=(x,fields)=>(x.formSortOrder?.sortOrder||x.fields||[]).filter(id=>fields[id]&&x.fieldInfos[id]?.visible===true).map(id=>({id,required:!!x.fieldInfos[id]?.required}));
   const expected=visible(p,s.fieldMap).map(x=>({...x,id:m.fields[x.id]})),actual=visible(q,t.fieldMap);
   report.forms.push({project,table:m.id,view:vm.id,expected,actual,matches:JSON.stringify(expected)===JSON.stringify(actual)});continue;
  }
  const config=p.ganttConfig||p.calendarConfig;if(config){const got=q.ganttConfig||q.calendarConfig,tm=config.timeBarValue?.timingValue;const expected={start:m.fields[tm?.startDateFieldId],end:m.fields[tm?.endDateFieldId],title:m.fields[config.titleField],officialHoliday:config.officialHoliday,colorType:config.timeBarColor?.type,colorField:m.fields[config.timeBarColor?.selectFieldId]};const actual={start:got?.timeBarValue?.timingValue?.startDateFieldId,end:got?.timeBarValue?.timingValue?.endDateFieldId,title:got?.titleField,officialHoliday:got?.officialHoliday,colorType:got?.timeBarColor?.type,colorField:got?.timeBarColor?.selectFieldId};const r={project,table:m.id,view:vm.id,expected,actual,matches:JSON.stringify(expected)===JSON.stringify(actual)};report[vm.type==='gantt'?'gantt':'calendar'].push(r);if(!r.matches)report.timebarDifferences.push(r);}
  const widths=Object.entries(p.colInfos||{}).filter(([id,c])=>m.fields[id]&&Number.isFinite(c.width)).map(([id,c])=>({field:m.fields[id],expected:c.width,actual:q.colInfos?.[m.fields[id]]?.width}));
  const r={project,table:m.id,view:vm.id,type:vm.type,rowHeight:{expected:p.rowHeightLevel,actual:q.rowHeightLevel},freeze:{expected:p.frozenColCount,actual:q.frozenColCount},widths};report.layouts.push(r);
  if(p.rowHeightLevel!==q.rowHeightLevel||p.frozenColCount!==q.frozenColCount||widths.some(c=>c.expected!==c.actual))report.formatDifferences.push(r);
 }
}
await fs.writeFile(dir+'/native-audit.json',JSON.stringify(report,null,2));console.log(JSON.stringify({forms:report.forms,gantt:report.gantt,calendar:report.calendar,layoutCount:report.layouts.length,formatDifferenceViews:report.formatDifferences.length,rows:report.formatDifferences.filter(r=>r.rowHeight.expected!==r.rowHeight.actual).length,freeze:report.formatDifferences.filter(r=>r.freeze.expected!==r.freeze.actual).length,widths:report.formatDifferences.reduce((n,r)=>n+r.widths.filter(c=>c.expected!==c.actual).length,0)},null,2));
