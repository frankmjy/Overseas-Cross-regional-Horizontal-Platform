const aliases={
 title:['Work Item','Document Title','Meeting Title','Action','Issue','Resource','Risk','Title','Content','Project Name','Subject','Name'],
 category:['Category','Topic','Lesson Type','Type','Subcategory'],discipline:['Discipline','Specialty','System','Checking Role'],
 method:['Method','Checkpoints','Reference Lesson','Measures','Action Plan','Response'],target:['Target','Standard','Requirement','Agreed Boundary'],
 status:['Site Progress','Status','Progress','Work Review'],frequency:['Frequency'],priority:['Priority','Risk Level'],
 date:['Meeting Date','Target Date','Planned Date','Shared At'],summary:['Summary','Key Points','Meeting Summary','Minutes','Discussion','Description','Coordination Topics'],
};
const detailAllowed=new Set(Object.values(aliases).flat().concat(['Scenario','Source Context','Checking Role','Executing Role','Check Role','Execution Role','Participants','Decision','Decisions','Actions','Action Items','Lesson','Cause','Solution','Purpose','Departments','Document Type','Work Result','Result','Meeting Time','Conclusion']));
const privateNames=/Phone|Email|Migration|Source Record|Source Files|Source Attachments|Setup Key|Import Key|Participants/;
export const plain=value=>value==null?'':Array.isArray(value)?value.filter(v=>typeof v==='string'||typeof v==='number').join('、'):typeof value==='string'||typeof value==='number'?String(value):'';
const key=name=>name.split('（')[0].trim();
export const normalizePriority=value=>plain(value).replace(/^PO(?=[-－—\s]|$)/i,'P0');
export function safeSourceUrl(value){
 const s=plain(value),raw=/^\[.*\]\((https:\/\/[^\s]+)\)$/.exec(s)?.[1]||s;
 try{const u=new URL(raw);return u.protocol==='https:'&&u.hostname==='vnet.feishu.cn'&&!u.username&&!u.password?u.href:'';}catch{return '';}
}
export function projectSnapshotTable({table,fields,rows},manifest){
 if(!/^tbl\w+$/.test(table.id)||!/^\w+$/.test(manifest.base))throw Error('Invalid source identifier');
 const url=`https://vnet.feishu.cn/base/${manifest.base}?table=${table.id}`;
 const allowed=fields.filter(f=>['text','select','number','datetime'].includes(f.type)&&!privateNames.test(key(f.name))&&detailAllowed.has(key(f.name)));
 const titleField=allowed.find(f=>f.id===table.primary_field)||aliases.title.map(a=>allowed.find(f=>key(f.name)===a)).find(Boolean);
 return {id:table.id,name:table.name,code:manifest.code,kind:manifest.kind,project:manifest.project||null,url,rows:rows.map(row=>{
  const item={id:row.recordId,url:url+'&record='+encodeURIComponent(row.recordId),fields:[]};
  for(const [prop,choices]of Object.entries(aliases))item[prop]=plain(row[choices.map(a=>allowed.find(f=>key(f.name)===a)?.name).find(n=>n&&plain(row[n]))]);
  item.priority=normalizePriority(item.priority);
  item.title=plain(row[titleField?.name])||item.title||'未命名记录';
  for(const f of allowed){const value=plain(row[f.name]);if(value)item.fields.push({label:/（(.+)）$/.exec(f.name)?.[1]||f.name,value});}
  item.links=fields.filter(f=>['Document Link','Reference Link','Instruction','Guidance','Guidance Document'].includes(key(f.name))).map(f=>({label:/（(.+)）$/.exec(f.name)?.[1]||'打开资料',url:safeSourceUrl(row[f.name])})).filter(l=>l.url);
  return item;
 })};
}
export function summarizeReadiness(rows){return {total:rows.length,unfilled:rows.filter(r=>!r.status).length,completed:rows.filter(r=>/已完成|审核通过/.test(r.status)&&!r.status.includes('不涉及')).length,inProgress:rows.filter(r=>/进行中/.test(r.status)).length,notApplicable:rows.filter(r=>r.status.includes('不涉及')).length};}
