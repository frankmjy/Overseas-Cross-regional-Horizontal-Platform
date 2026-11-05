import {inheritPriorities} from '../../project-tasks/handover/priority.mjs';
import {rollupTaskDates} from '../../project-tasks/handover/summary.mjs';
import {orderedTaskRecords,orderFieldName,displayCodeFieldName} from '../../project-tasks/handover/ordering.mjs';
import {executionStatus,completedStatus} from '../../project-tasks/handover/status.mjs';
export const sourceBinding = Object.freeze({ base: 'CID8b8V7CaCtKesWGFKcHTdqnlc', table: 'tblgQsrBMFd9eeuX', view: 'vewkRPw0CG', appId: 'cli_aa547c8de6785ce2' });
export const sourceUrl = `https://vnet.feishu.cn/base/${sourceBinding.base}?table=${sourceBinding.table}&view=${sourceBinding.view}`;
export const stageNames = ['项目筹备', '机电进场', '验证测试', '验收阶段', '开服准备', '反馈优化'];
export const colors = ['#4f7fe0', '#27a6a3', '#9a77c9', '#4d92b8', '#ce9843', '#7188a6'];
export const text = value => value == null ? '' : Array.isArray(value) ? value.map(text).filter(Boolean).join('、') : typeof value === 'object' ? String(value.name || value.text || value.label || value.id || '') : String(value);
export const date = value => {
  if (!value) return '';
  const result = typeof value === 'number' ? new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit' }).format(value) : text(value).slice(0, 10).replaceAll('/', '-');
  return /^\d{4}-\d\d-\d\d$/.test(result) && new Date(`${result}T00:00:00Z`).toISOString().slice(0, 10) === result ? result : '';
};
export const day = value => Date.parse(`${value}T00:00:00Z`) / 86400000;
export const addDays = (value, days) => new Date((day(value) + days) * 86400000).toISOString().slice(0, 10);
export const naturalCompare = (a, b) => a.localeCompare(b, 'zh-CN', { numeric: true });
// 已确认仅作项目总控基准的节点不进入运维视图；施工图评审 M05 保留。
const planOnlyMilestones = new Set(['M02', 'M03', 'M04']);

export function buildModel(raw, fetchedAt = new Date().toISOString(), now = Date.now()) {
  let records = raw.filter(({fields:f})=>![true,1,'true'].includes(f['Deleted（已删除）'])).map(({ id, fields: f }) => {
    const get = key => text(f[key]);
    const stage = Number(/Step(\d)/.exec(get('Handover Stage（接维阶段）'))?.[1] || 0);
    const level = get('Task Level（任务层级）');
    const code = get('Task Code（任务编号）')||get('Migration Key（迁移标识）');
    const completion = date(f['Actual Completion（实际完成时间）']);
    const status = executionStatus({start:date(f['Start Time（开始时间）']),due:date(f['Due Time（截止时间）']),actualCompletion:completion},now);
    return { id, code, title: get('Task Description（任务详情）'), level, stage, stageName: stageNames[stage - 1] || '未分组',
      category: get('Work Category（工作分类）'), group: get('Work Package（任务组）'), batch: get('Delivery Batch（交付批次）'), actionType: get('Action Type（动作类型）'),milestone:get('Milestone（里程碑）')==='🚩',
      start: date(f['Start Time（开始时间）']), end: date(f['Due Time（截止时间）']), actualCompletion: completion, status, owner: get('Owner（责任人）'), priority: get('Priority（优先级）'),order:f[orderFieldName]==null||f[orderFieldName]===''?null:Number(f[orderFieldName]),
      feedback: get('Latest Feedback（最新进展反馈）'), notes: get('Task Notes（任务备注）'), overseas: get('Overseas Notes（海外差异）'), goal: get('Task Goal（任务目标）'),
      timing: get('Timing Requirements（时间要求）'), teams: get('Related Teams（涉及团队）'), requirements: get('Deliverable Requirements（交付物&备注）'),
      basis: get('Schedule Basis（排期依据）'), scheduleNotes: get('Schedule Notes（排期备注）'), sourceOwner: get('Source Owner（计划责任信息）'), source: get('Source Record（源记录）'),
      deliverableLinks: get('交付物-链接'), deliverableAttachments: get('交付物-附件'),attachments:Array.isArray(f['Task Attachments（任务交付附件）'])?f['Task Attachments（任务交付附件）']:[],
      parentId: Array.isArray(f['Parent Link（父记录）']) ? f['Parent Link（父记录）'][0]?.id || '' : '',
      url: `https://vnet.feishu.cn/base/${sourceBinding.base}?table=${sourceBinding.table}&record=${encodeURIComponent(id)}`,
    };
  });
  if (new Set(records.map(r => r.id)).size !== records.length) throw Error('源表记录身份重复。');
  if (records.some(r => !r.title || !r.code || !['任务组', '执行项', '里程碑'].includes(r.level) || r.stage < 1 || r.stage > 6)) throw Error('源表任务名称、层级或阶段不完整。');
  records=rollupTaskDates(inheritPriorities(orderedTaskRecords(records,{enabled:raw.some(r=>Object.hasOwn(r.fields,orderFieldName)&&Object.hasOwn(r.fields,displayCodeFieldName))})),{endKey:'end',now});
  return indexModel(records,fetchedAt);
}
function indexModel(records,fetchedAt){
  const parents = records.filter(r => r.level === '任务组'), tasks = records.filter(r => r.level === '执行项');
  const milestones = records.filter(r => (r.level === '里程碑'||r.milestone) && !planOnlyMilestones.has(r.sourceCode||r.code));
  const parentIds = new Set(parents.map(r => r.id));
  if (tasks.some(r => !parentIds.has(r.parentId))) throw Error('执行项缺少可回查的任务组。');
  for(const task of tasks){const parent=parents.find(r=>r.id===task.parentId);task.group=`${parent.code} ${parent.title}`;}
  const stages = stageNames.map((name, index) => {
    const rows = tasks.filter(r => r.stage === index + 1), dated = rows.filter(r => r.start && r.end);
    return { id: index + 1, name, color: colors[index], total: rows.length, groups: parents.filter(r => r.stage === index + 1).length,
      start: dated.map(r => r.start).sort()[0] || '', end: dated.map(r => r.end).sort().at(-1) || '', completed: rows.filter(r => completedStatus(r.status)).length,
      unscheduled: rows.length - dated.length };
  });
  return { source: { ...sourceBinding, url: sourceUrl, fetchedAt }, records, tasks, parents, milestones, stages,
    summary: { tasks: tasks.length, groups: parents.length, milestones: milestones.length, unscheduled: tasks.filter(r => !r.start || !r.end).length,
      completed: tasks.filter(r => completedStatus(r.status)).length,
      reviewGroups: parents.filter(r => r.basis.includes('复核')).length },
    batches: ['项目共用', '一期60MW', '二期40MW'].map(name => ({ name, count: tasks.filter(r => r.batch === name).length })),
  };
}

export function applyHandoverReceipt(current,data){
 if(data.receipt!=='handover-patch-v1')return data;
 if(current.revision!==data.baseRevision)return{...current,operation:data.operation,...(current.revision<data.revision?{needsRefresh:true}:{})};
 const removed=new Set(data.removedIds),rows=new Map(current.records.filter(r=>!removed.has(r.id)).map(r=>[r.id,r]));for(const r of data.records)rows.set(r.id,r);
 const records=(data.recordOrder?data.recordOrder.map(id=>rows.get(id)):[...rows.values()]).map(r=>({...r}));
 return{...current,...indexModel(records,current.source?.fetchedAt),...data.modelPatch,revision:data.revision,operation:data.operation,needsRefresh:false};
}
export function filterTasks(model, filters = {}) {
  const keyword = (filters.keyword || '').trim().toLowerCase();
  return model.tasks.filter(r => (!filters.stage || r.stage === Number(filters.stage)) && (!filters.batch || r.batch === filters.batch)
    && (!filters.category || r.category === filters.category) && (!filters.actionType || r.actionType === filters.actionType)
    && (!filters.status || r.status === filters.status) && (!filters.unscheduled || !r.start || !r.end)
    && (!filters.review || r.basis.includes('复核'))
    && (!keyword || [r.title, r.code, r.group, r.category, r.notes, r.feedback, r.owner].some(value => value.toLowerCase().includes(keyword))))
    .sort((a, b) => a.stage - b.stage || naturalCompare(a.group, b.group) || naturalCompare(a.code, b.code));
}

export function hierarchy(tasks,parents=[],milestones=[]) {
  return stageNames.flatMap((name, i) => {
    const rows = tasks.filter(r => r.stage === i + 1),stageParents=parents.filter(r=>r.stage===i+1); if (!rows.length&&!stageParents.length&&!milestones.some(r=>r.stage===i+1)) return [];
    const categories = [...new Set([...rows.map(r => r.category),...stageParents.map(r=>r.category)])].map(category => {
      const categoryRows = rows.filter(r => r.category === category);
      const categoryParents=stageParents.filter(r=>r.category===category),groups = [...new Set([...categoryRows.map(r => r.group),...categoryParents.map(r=>r.code+' '+r.title)])].sort(naturalCompare).map(group => ({ key: `g:${i + 1}:${group}`, label: group,parentId:categoryParents.find(r=>r.code+' '+r.title===group)?.id||categoryRows.find(r=>r.group===group)?.parentId, rows: categoryRows.filter(r => r.group === group) }));
      return { key: `c:${i + 1}:${category}`, label: category, rows: categoryRows, groups };
    });
    return [{ key: `s:${i + 1}`, id: i + 1, name, color: colors[i], rows, categories }];
  });
}

export function timeRange(model, mode = 'project') {
  const candidates = [...model.tasks, ...model.milestones].filter(r => r.start && r.end);
  const start = candidates.map(r => r.start).sort()[0] || '2026-09-01';
  const end = candidates.map(r => r.end).sort().at(-1) || '2027-12-31';
  return mode === 'all' ? { start: `${start.slice(0, 7)}-01`, end: `${end.slice(0, 7)}-${new Date(Number(end.slice(0, 4)), Number(end.slice(5, 7)), 0).getDate()}` }
    : { start: '2026-09-01', end: '2027-12-31' };
}

export function timelineColumns(range) {
  const days=day(range.end)-day(range.start)+1,months=[],weeks=[];
  let cursor=`${range.start.slice(0,7)}-01`;
  while(cursor<=range.end){
    const year=Number(cursor.slice(0,4)),month=Number(cursor.slice(5,7)),next=new Date(Date.UTC(year,month,1)).toISOString().slice(0,10);
    const start=cursor<range.start?range.start:cursor,end=addDays(next,-1)>range.end?range.end:addDays(next,-1),count=day(end)-day(start)+1;
    months.push({year,month,start,end,days:count,left:(day(start)-day(range.start))/days*100,width:count/days*100});cursor=next;
  }
  for(let offset=0;offset<days;offset+=7)weeks.push({date:addDays(range.start,offset),left:offset/days*100});
  return{days,months,weeks};
}

export function calendarCells(model, month) {
  const first = `${month}-01`, leading = (new Date(`${first}T00:00:00Z`).getUTCDay() + 6) % 7;
  return Array.from({ length: 42 }, (_, i) => {
    const date = addDays(first, i - leading);
    return { date, current: date.startsWith(month), due: model.tasks.filter(r => r.end === date), milestones: model.milestones.filter(r => r.end === date) };
  });
}
