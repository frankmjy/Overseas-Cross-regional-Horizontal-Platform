export const orderFieldName='Row Order（条目排序）';
export const displayCodeFieldName='Display Code（显示编号）';
const gap=1048576;
const original=row=>String(row.sourceCode||row.code||'');
const compare=(a,b)=>original(a).localeCompare(original(b),'zh-CN',{numeric:true})||a.id.localeCompare(b.id);
export const orderScope=row=>JSON.stringify(row.level==='执行项'?[row.level,row.parentId]:row.level==='里程碑'?[row.level,row.stage]:[row.level,row.stage,row.category]);
function scopes(records){
 const map=new Map();for(const row of records){const key=orderScope(row);if(!map.has(key))map.set(key,[]);map.get(key).push(row);}
 for(const[key,rows]of map){rows.sort(compare);map.set(key,rows.map((r,i)=>({...r,sortPosition:typeof r.order==='number'&&Number.isFinite(r.order)?r.order:(i+1)*gap})).sort((a,b)=>a.sortPosition-b.sortPosition||compare(a,b)));}return map;
}
export function nextInsertOrder(records,row,afterId=''){
 const rows=scopes(records).get(orderScope(row))||[];
 if(!afterId)return rows.length?rows.at(-1).sortPosition+gap:gap;
 const index=rows.findIndex(r=>r.id===afterId&&!r.deleted);if(index<0)throw Object.assign(Error('插入位置已变化，请刷新。'),{status:409});
 const left=rows[index].sortPosition,right=rows[index+1]?.sortPosition,next=right===undefined?left+gap:(left+right)/2;
 if(!Number.isFinite(next)||next<=left||right!==undefined&&next>=right)throw Object.assign(Error('插入位置过密，请核对排序后重试。'),{status:409});return next;
}
export function orderedTaskRecords(records,{enabled=true}={}){
 if(!enabled)return records;
 const rows=records.map(r=>({...r,sourceCode:original(r),orderingEnabled:true})),map=scopes(rows),byId=new Map(rows.map(r=>[r.id,r]));
 for(const list of map.values()){
  const groups=list.filter(r=>r.level==='任务组');if(!groups.length)continue;
  const seed=groups.map(original).find(c=>/^S\d+(?:\.\d+)+$/.test(c));const prefix=seed?seed.slice(0,seed.lastIndexOf('.')):`S${groups[0].stage}.1`;
  let index=0;for(const r of groups)if(!r.deleted)Object.assign(byId.get(r.id),{code:prefix+'.'+(++index),sortPosition:r.sortPosition});
 }
 for(const list of map.values()){
  const children=list.filter(r=>r.level==='执行项');let index=0;
  for(const r of children){const parent=byId.get(r.parentId);if(!r.deleted&&parent)Object.assign(byId.get(r.id),{code:parent.code+'-'+String(++index).padStart(2,'0'),sortPosition:r.sortPosition});}
 }
 const milestones=[...map.values()].flat().filter(r=>r.level==='里程碑'&&!r.deleted).sort((a,b)=>a.stage-b.stage||a.sortPosition-b.sortPosition||compare(a,b));
 milestones.forEach((r,i)=>Object.assign(byId.get(r.id),{code:'M'+String(i+1).padStart(2,'0'),sortPosition:r.sortPosition}));
 return rows.sort((a,b)=>a.stage-b.stage||(byId.get(a.parentId)?.code||a.code).localeCompare(byId.get(b.parentId)?.code||b.code,'zh-CN',{numeric:true})||Number(a.level==='执行项')-Number(b.level==='执行项')||(a.sortPosition||0)-(b.sortPosition||0)||compare(a,b));
}
