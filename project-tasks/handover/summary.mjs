import {executionStatus} from './status.mjs';
const valid=value=>typeof value==='string'&&/^\d{4}-\d\d-\d\d$/.test(value)&&Number.isFinite(Date.parse(value+'T00:00:00Z'))&&new Date(value+'T00:00:00Z').toISOString().slice(0,10)===value;
export function rollupTaskDates(records,{endKey='due',now=Date.now()}={}){
 return records.map(row=>{
  if(row.level!=='任务组')return row;
  const children=records.filter(r=>r.level==='执行项'&&!r.deleted&&r.parentId===row.id&&r.stage===row.stage);
  const starts=children.map(r=>r.start).filter(valid).sort(),ends=children.map(r=>r[endKey]).filter(valid).sort();
  const start=starts[0]||'',end=ends.at(-1)||'';
  return {...row,start,[endKey]:end,scheduleDerived:true,status:executionStatus({start,due:end,actualCompletion:row.actualCompletion},now)};
 });
}
