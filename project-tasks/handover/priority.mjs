export const explicitPriority = row => row.values?.priority ?? row.explicitPriority ?? row.priority ?? '';
function priorityParent(row,records){
 return row.level==='执行项'?records.find(parent=>parent.id===row.parentId&&parent.level==='任务组'&&!parent.deleted&&parent.stage===row.stage):null;
}
export function inheritPriorities(records){
 return records.map(row=>{
  const own=explicitPriority(row),parent=priorityParent(row,records),inherited=!own&&!!parent&&!!explicitPriority(parent);
  return {...row,explicitPriority:own,priority:own||(parent?explicitPriority(parent):''),priorityInherited:inherited,priorityParentId:inherited?parent.id:'',priorityParentName:inherited?parent.title:''};
 });
}
export function priorityPlaceholder(row,records){
 const parent=priorityParent(row,records),priority=parent&&explicitPriority(parent),short=/P[012]/.exec(priority||'')?.[0]||priority;
 return row.level==='执行项'?`跟随上级（${short||'未指定'}）`:'未指定';
}
