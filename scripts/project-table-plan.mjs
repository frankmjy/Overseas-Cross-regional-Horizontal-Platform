export const projectDefinitions=[{key:'thailand',name:'Thailand Project（泰国项目）',en:'Thailand',cn:'泰国'},{key:'malaysia',name:'Malaysia Project（马来项目）',en:'Malaysia',cn:'马来'}];
export const businessSources=[
 ['research-questions','tblP7cX0a31BWnXL','preparation'],['research-details','tble4BqmIIpF9Nd7','preparation'],['research-evidence','tblNhxVmRwoRcuu9','preparation'],
 ['initialization','tbl13gnsCDgElBXE','readiness'],['interfaces','tblCoYyFcT6fPpvq','readiness'],['tests','tblqYrnwafWyS0b4','readiness'],
 ['routine','tblnm6WUIyKggmA2','operations'],['sla','tbl4aqimHZmG7kik','operations'],['issues','tblImMw6XG9bTo5Q','operations'],['ehs','tbl0B5LHAgMEt3h0','operations'],
 ['reports','tblFRc89wOp9Wj9R','meetings'],['training','tblHF8fSHxx9Cd2v','people'],['personnel','tbloQ1HIn9mT6XLe','people']
].map(([key,id,module])=>({key,id,module}));
const plain=v=>v==null?'':Array.isArray(v)?v.map(plain).join('、'):String(v);
const redundant=name=>['Project（项目）','Project（项目归属）','Example（示例）'].includes(name)||/（备注）$/.test(name);
export function projectRows(source,project){
 if(['research-details','research-evidence'].includes(source.key))return [];
 const projectField=source.fields.find(f=>/^Project（/.test(f.name))?.name;
 return source.rows.filter(r=>{
   if(r.cells['Example（示例）']===true)return false;
   if(source.key==='research-questions')return true;
   const selected=plain(r.cells[projectField]);
   if(selected)return [project.name,project.en+'（'+project.cn+'）',project.cn,project.cn+'项目'].includes(selected);
   return String(r.cells['Setup Key（初始化标识）']||'').startsWith('work-template:');
 }).map(r=>({...Object.fromEntries(Object.entries(r.cells).filter(([name])=>!redundant(name))),'Setup Key（初始化标识）':`project-table:${project.key}:${source.id}:${r.id}`}));
}
export function cloneProjectFields(source,project,tableIds){
 const fields=source.fields.filter(f=>!redundant(f.name)).sort((a,b)=>Number(b.id===source.primaryField)-Number(a.id===source.primaryField));
 const allowed=['name','type','style','description','multiple','options','link_table','bidirectional'];
 const result=fields.map(f=>{const copy=Object.fromEntries(allowed.filter(n=>f[n]!==undefined).map(n=>[n,structuredClone(f[n])]));if(copy.type==='link'){const target=tableIds[f.link_table];if(!target)throw Error('missing project-local linked table '+f.link_table);copy.link_table=target;copy.bidirectional=false;}if(/^Project（/.test(f.name)){copy.name='Project（项目）';copy.options=[{name:project.name}];copy.multiple=false;}return copy;});
 if(!result.some(f=>f.name==='Setup Key（初始化标识）'))result.push({name:'Setup Key（初始化标识）',type:'text'});
 return result;
}
