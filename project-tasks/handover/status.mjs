export const executionStatuses = Object.freeze(['未开始', '进行中', '逾期进行', '逾期完成', '已完成']);
export const chinaDay = (now = Date.now()) => new Date(Number(now) + 8 * 3600000).toISOString().slice(0, 10);
export function executionStatus(task, now = Date.now()) {
  if (task.actualCompletion) return task.due && task.actualCompletion > task.due ? '逾期完成' : '已完成';
  if (!task.start || !task.due || task.due < task.start) return '未开始';
  const today = chinaDay(now);
  return today < task.start ? '未开始' : today > task.due ? '逾期进行' : '进行中';
}
export const completedStatus = value => ['已完成', '逾期完成'].includes(value);

export function statusPresentation(value){
 if(completedStatus(value))return{label:'已完成',tone:'done'};
 if(value==='进行中')return{label:'进行中',tone:'active'};
 if(value==='逾期进行'||value==='逾期')return{label:'逾期',tone:'overdue'};
 return{label:'未开始',tone:'planned'};
}
export const statusMatches=(actual,wanted)=>!wanted||statusPresentation(actual).label===wanted||actual===wanted;
export function inheritTaskDeletion(records){
 const own=r=>Boolean(r?.values?.deleted??r?.ownDeleted??r?.deleted),byId=new Map(records.map(r=>[r.id,r]));
 return records.map(r=>{const parent=byId.get(r.parentId),ownDeleted=own(r),inheritedDeleted=!ownDeleted&&parent?.level==='任务组'&&own(parent);return{...r,ownDeleted,inheritedDeleted:Boolean(inheritedDeleted),deleted:ownDeleted||Boolean(inheritedDeleted)};});
}
