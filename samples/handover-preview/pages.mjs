import {calendarCells,addDays,day} from './model.mjs';
import {completedStatus,statusPresentation} from '../../project-tasks/handover/status.mjs';
import {taskResources} from '../../project-tasks/handover/resources.mjs';
export const pageDefinitions=[{id:'overview',label:'项目总览',icon:'grid'},{id:'gantt',label:'甘特计划',icon:'chart'},{id:'milestones',label:'交付里程碑',icon:'flag'},{id:'weekly',label:'每周跟进',icon:'calendar'},{id:'monthly',label:'月度回顾',icon:'chart'},{id:'organization',label:'项目组织',icon:'people'}];
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function taskDeliverableCount(row){return taskResources(row).length;}
export function ganttRowControls(row,{editable=false,pending=false}={}){
 const state=statusPresentation(row.status),disabled=!editable||pending,priority=/P[012]/.exec(row.priority||'')?.[0]||'',reason=pending?'后台同步中':!editable?'请登录编辑':'';
 return{
  status:`<span class="task-status-label task-status-${state.tone}" data-task-status="${esc(row.id)}" title="${esc(row.status)}" aria-label="${esc(row.title)}：${state.label}"><i aria-hidden="true"></i>${state.label}</span>`,
  priority:`<button class="priority-cell priority-${priority.toLowerCase()||'none'}" data-priority-task="${esc(row.id)}" aria-label="修改优先级：${esc(row.title)}" title="${esc(reason||(row.priorityInherited?row.priority+' · 继承自 '+row.priorityParentName:row.priority)||'未指定优先级')}"${disabled?' disabled':''}>${priority||'—'}</button>`,
  delivery:taskDeliverableCount(row)?`<button class="task-delivery-icon" data-task-deliverables="${esc(row.id)}" title="交付物 · ${taskDeliverableCount(row)}份" aria-label="查看交付物：${esc(row.title)}，${taskDeliverableCount(row)}份"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 3h7l4 4v14H7zM14 3v5h5M10 12h5m-5 4h5"/></svg></button>`:'',
  actions:editable?`<button class="task-row-actions" aria-haspopup="menu" aria-expanded="false" data-row-actions="${esc(row.id)}" title="条目操作" aria-label="条目操作：${esc(row.title)}"${pending||row.id.startsWith('local:')?' disabled':''}><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="5" cy="12" r="1.5"/><circle cx="12" cy="12" r="1.5"/><circle cx="19" cy="12" r="1.5"/></svg></button>`:'',
 };
}
const date=v=>v?v.replaceAll('-','/'):'未排期';
const status=r=>`<span class="work-status ${r.status==='逾期进行'?'late':completedStatus(r.status)?'done':''}">${statusPresentation(r.status).label}</span>`;
const phase=r=>r.batch?.startsWith('一期')?'一期':r.batch?.startsWith('二期')?'二期':'';
const taskButton=r=>`<button class="work-task-link" data-record="${esc(r.id)}"><small>${esc(r.code)}</small><span>${esc(r.title)}</span>${phase(r)?`<em>${phase(r)}</em>`:''}</button>`;
function metrics(items){return `<div class="work-metrics">${items.map(([label,count,unit,key])=>`<button data-summary="${key||''}"><span>${label}</span><strong>${count}<small>${unit}</small></strong></button>`).join('')}</div>`;}
export function weeklyData(tasks,anchor,today){
 const weekday=(new Date(anchor+'T00:00:00Z').getUTCDay()+6)%7,start=addDays(anchor,-weekday),end=addDays(start,6),nextStart=addDays(end,1),nextEnd=addDays(end,7),cutoff=today<end?today:end;
 const overdue=tasks.filter(r=>!completedStatus(r.status)&&r.end&&r.end<cutoff),completed=tasks.filter(r=>r.actualCompletion&&r.actualCompletion>=start&&r.actualCompletion<=end),current=tasks.filter(r=>(!completedStatus(r.status)&&((r.start&&r.end&&r.start<=end&&r.end>=start)||overdue.some(x=>x.id===r.id)))||completed.some(x=>x.id===r.id)),next=tasks.filter(r=>!completedStatus(r.status)&&r.start&&r.end&&r.start<=nextEnd&&r.end>=nextStart);
 return{start,end,nextStart,nextEnd,overdue,completed,current,next};
}
export function monthlyData(tasks,month){
 const rows=tasks.filter(r=>r.end?.startsWith(month)||r.actualCompletion?.startsWith(month)),completed=tasks.filter(r=>r.actualCompletion?.startsWith(month)),planned=tasks.filter(r=>r.end?.startsWith(month));
 return{rows,completed,planned,late:rows.filter(r=>r.status==='逾期进行'||r.status==='逾期完成')};
}
const overviewDrawings={
 document:'<path d="M7 3h7l4 4v14H7zM14 3v5h5M10 12h5m-5 4h5"/>',
 tasks:'<rect x="4" y="3" width="16" height="18" rx="3"/><path d="m8 9 1 1 2-2m2 1h3m-8 6 1 1 2-2m2 1h3"/>',
 flag:'<path d="M5 21V3m0 1c5-3 9 3 14 0v10c-5 3-9-3-14 0"/>',
 clock:'<circle cx="12" cy="12" r="9"/><path d="M12 6v6l4 2"/>',
 alert:'<path d="m10 4-8 14a2 2 0 0 0 2 3h16a2 2 0 0 0 2-3L14 4a2.3 2.3 0 0 0-4 0Z"/><path d="M12 9v5m0 3v.1"/>',
 calendar:'<rect x="4" y="5" width="16" height="16" rx="3"/><path d="M8 3v5m8-5v5M4 11h16"/>',
 search:'<circle cx="10" cy="10" r="6"/><path d="m15 15 5 5"/>',
};
const overviewIcon=key=>`<svg viewBox="0 0 24 24" aria-hidden="true">${overviewDrawings[key]||overviewDrawings.tasks}</svg>`;
export function overviewAgenda(model,{month,selectedDay=''}){
 const rows=new Map();
 for(const r of [...model.tasks,...model.milestones])if(r.end?.startsWith(month)&&(!selectedDay||r.end===selectedDay))rows.set(r.id,r);
 return [...rows.values()].sort((a,b)=>a.end.localeCompare(b.end)||Number(b.level==='里程碑'||b.milestone)-Number(a.level==='里程碑'||a.milestone)||a.title.localeCompare(b.title,'zh-CN'));
}
const hasDeliverable=row=>!!(row.attachments?.length||row.deliverableLinks);
const hasSchedule=row=>!!(row.start&&row.end);
const scopeName=value=>!value||value==='项目共用'?'项目整体':value;
const scopeRank=value=>value.startsWith('一期')?0:value.startsWith('二期')?1:2;
function insightGroups(rows,key){
 const groups=new Map();for(const row of rows){const value=key(row);if(!groups.has(value))groups.set(value,[]);groups.get(value).push(row);}
 return [...groups].map(([key,items])=>({key,count:items.length,completed:items.filter(r=>completedStatus(r.status)).length,overdue:items.filter(r=>r.status==='逾期进行').length,started:items.filter(r=>r.status==='进行中').length}));
}
export function stageInsight(model,stage){
 const rows=model.tasks.filter(r=>r.stage===Number(stage)),completed=rows.filter(r=>completedStatus(r.status)).length;
 return{total:rows.length,completed,percent:rows.length?Math.round(completed/rows.length*100):0,overdue:rows.filter(r=>r.status==='逾期进行').length,started:rows.filter(r=>r.status==='进行中').length,scheduled:rows.filter(hasSchedule).length,owned:rows.filter(r=>!!r.owner).length,delivered:rows.filter(hasDeliverable).length,categories:insightGroups(rows,r=>r.category||'未分类').sort((a,b)=>b.count-a.count),months:insightGroups(rows.filter(r=>r.end),r=>r.end.slice(0,7)).sort((a,b)=>a.key.localeCompare(b.key)),batches:insightGroups(rows,r=>r.batch||'项目共用').sort((a,b)=>scopeRank(a.key)-scopeRank(b.key)||a.key.localeCompare(b.key,'zh-CN'))};
}
export function stageInsightRows(model,{stage,kind,key=''}){
 const rows=model.tasks.filter(r=>r.stage===Number(stage));
 const predicates={all:()=>true,completed:r=>completedStatus(r.status),category:r=>(r.category||'未分类')===key,month:r=>r.end?.slice(0,7)===key,batch:r=>(r.batch||'项目共用')===key,owned:r=>!!r.owner,delivered:hasDeliverable,scheduled:hasSchedule,unscheduled:r=>!hasSchedule(r)};
 return predicates[kind]?rows.filter(predicates[kind]):[];
}
function renderStageInsight(model,s){
 const d=stageInsight(model,s.id),attrs=(kind,key,label)=>`data-stage-insight="${s.id}" data-insight-kind="${kind}" data-insight-key="${esc(key)}" aria-label="${esc(label)}"`,shortScope=key=>key.startsWith('一期')?'一期':key.startsWith('二期')?'二期':scopeName(key);
 const mostLate=[...d.categories].sort((a,b)=>b.overdue-a.overdue)[0];
 const summaries={1:d.overdue?`${d.overdue}项超过计划截止，${mostLate?.key}逾期${mostLate?.overdue}项。`:`覆盖${d.categories.length}类工作，${d.total-d.completed}项待推进。`,2:`覆盖${d.categories.length}类进场工作，${d.total-d.completed}项待完成。`,3:`${d.batches.map(b=>`${shortScope(b.key)}${b.count}项`).join(' / ')}；逾期${d.overdue}项。`,4:`覆盖${d.categories.length}类验收工作，${d.total-d.completed}项待完成。`,5:`责任人已填${d.owned}/${d.total}，交付物已有${d.delivered}/${d.total}。`,6:`${d.total-d.scheduled}项尚未排期，${d.total-d.completed}项待完成。`};
 let chart='';
 if(!d.total)chart='<p class="overview-empty">暂无阶段数据</p>';
 else if(s.id===1){
  const max=Math.max(...d.categories.map(c=>c.count));
  chart=`<div class="insight-caption">工作量分布</div><div class="insight-categories">${d.categories.map(c=>`<button class="insight-category" ${attrs('category',c.key,`${c.key}，${c.count}项`)}><span>${esc(c.key)}</span><i><b style="width:${c.count/max*100}%"></b></i><strong>${c.count}</strong></button>`).join('')}</div>`;
 }else if(s.id===3){
  chart=`<div class="insight-caption">分期状态</div><div class="insight-batches">${d.batches.map(b=>`<button ${attrs('batch',b.key,`${scopeName(b.key)}，${b.count}项`)}><span><strong>${esc(scopeName(b.key))}</strong><small>${b.count}项</small></span><i><b class="done" style="width:${b.completed/b.count*100}%"></b><b class="late" style="width:${b.overdue/b.count*100}%"></b><b class="started" style="width:${b.started/b.count*100}%"></b></i></button>`).join('')}</div><div class="insight-status-key">${[['done','已完成',d.completed],['started','进行中',d.started],['late','逾期',d.overdue],['pending','未开始',d.total-d.completed-d.started-d.overdue]].filter(x=>x[2]).map(([kind,label,count])=>`<span class="${kind}">${label} ${count}</span>`).join('')}</div>`;
 }else if(s.id===2||s.id===4){
  chart=`<div class="insight-caption">${s.id===2?'进场工作分类':'验收范围'}</div><div class="insight-matrix">${d.categories.map(c=>`<button ${attrs('category',c.key,`${c.key}，${c.count}项`)}><span>${esc(c.key)}</span><strong>${c.count}<small>项</small></strong></button>`).join('')}</div>`;
 }else if(s.id===5){
  chart=`<div class="insight-caption">准备要素覆盖</div><div class="insight-coverage">${[['owned','责任人',d.owned],['delivered','交付物',d.delivered],['scheduled','已排期',d.scheduled]].map(([kind,label,count])=>`<button ${attrs(kind,'',`${label}，${count}/${d.total}项`)}><span>${label}</span><i><b style="width:${count/d.total*100}%"></b></i><strong>${count}/${d.total}</strong></button>`).join('')}</div>`;
 }else{
  const covered=d.scheduled/d.total*100;
  chart=`<div class="insight-caption">复盘计划覆盖</div><div class="insight-planning"><button class="insight-ring" ${attrs('scheduled','','查看已排期任务')} style="--covered:${covered}%"><span><strong>${Math.round(covered)}<small>%</small></strong><em>已排期</em></span></button><div><button ${attrs('unscheduled','','查看未排期任务')}><strong>${d.total-d.scheduled}</strong><span>项待排期</span></button><p>已排期 ${d.scheduled}/${d.total}</p></div></div>`;
 }
 return `<section class="stage-summary stage-visual-${s.id}" data-stage-summary="${s.id}" style="--stage:${s.color}"><header><h3><button data-stage="${s.id}" aria-label="查看${esc(s.name)}计划"><span class="stage-summary-number">0${s.id}</span><span>${esc(s.name)}</span><span class="stage-summary-total">${d.total}<small>项</small></span><span class="stage-summary-arrow" aria-hidden="true">›</span></button></h3></header><p class="stage-summary-copy">${esc(d.total?summaries[s.id]:'暂无阶段任务。')}</p><div class="stage-insight-chart" role="group" aria-label="${esc(s.name)}阶段图表">${chart}</div><footer class="stage-insight-footer"><button ${attrs('completed','','查看已完成任务')}>已完成 ${d.completed}/${d.total}</button><strong>${d.percent}%</strong></footer></section>`;
}
export function overviewCalendarCells(model,month){
 const cells=calendarCells(model,month),last=cells.findLastIndex(c=>c.current);
 return cells.slice(0,Math.ceil((last+1)/7)*7);
}
export function renderOverview(model,{month,today,keyword='',selectedDay=''}){
 const overdue=model.tasks.filter(r=>r.status==='逾期进行'),delivered=model.tasks.filter(r=>r.attachments?.length||r.deliverableLinks),dated=model.tasks.filter(r=>r.start&&r.end),start=dated.map(r=>r.start).sort()[0],end=dated.map(r=>r.end).sort().at(-1),span=start&&end?day(end)-day(start)+1:'—';
 const definitions=[['交付物任务',delivered.length,'项','deliverables','document'],['执行任务',model.tasks.length,'项','tasks','tasks'],['关键里程碑',model.milestones.length,'个','milestones','flag'],['计划跨度',span,'天','period','clock'],['逾期进行',overdue.length,'项','overdue','alert']];
 const top=`<div class="overview-metrics">${definitions.map(([label,count,unit,key,icon])=>`<button data-summary="${key}" class="overview-metric metric-${key}"><span class="overview-metric-icon">${overviewIcon(icon)}</span><span class="overview-metric-copy"><span>${label}</span><strong>${count}<small>${unit}</small></strong></span></button>`).join('')}</div>`;
 const q=keyword.trim().toLowerCase();
 const cards=model.stages.filter(s=>!q||s.name.toLowerCase().includes(q)||model.tasks.some(r=>r.stage===s.id&&[r.category||'',r.title||'',r.notes||''].some(v=>v.toLowerCase().includes(q)))).map(s=>renderStageInsight(model,s)).join('');
 const cells=overviewCalendarCells(model,month),current=cells.filter(c=>c.current),due=current.reduce((n,c)=>n+c.due.length,0),milestones=current.reduce((n,c)=>n+c.milestones.length,0),year=Number(month.slice(0,4));
 const agenda=overviewAgenda(model,{month,selectedDay}),agendaTitle=selectedDay?`${Number(selectedDay.slice(5,7))}月${Number(selectedDay.slice(8))}日 · 当日安排`:'本月安排';
 const calendar=`<section class="overview-calendar" aria-label="项目日历"><header><h2>项目日历</h2><button class="overview-calendar-today" data-action="calendar-today">今日</button></header><div class="overview-calendar-month"><button data-calendar="-1" aria-label="上个月" title="上个月">‹</button><div class="calendar-month-controls"><select id="overviewCalendarYear" aria-label="日历年份">${Array.from({length:5},(_,i)=>year+i-2).map(y=>`<option value="${y}"${y===year?' selected':''}>${y}年</option>`).join('')}</select><select id="overviewCalendarMonth" aria-label="日历月份">${Array.from({length:12},(_,i)=>i+1).map(m=>`<option value="${m}"${m===Number(month.slice(5))?' selected':''}>${m}月</option>`).join('')}</select></div><button data-calendar="1" aria-label="下个月" title="下个月">›</button></div><div class="calendar-grid">${['一','二','三','四','五','六','日'].map(d=>`<span class="calendar-day-head">${d}</span>`).join('')}${cells.map((c,i)=>`<button class="calendar-day${c.current?'':' other'}${c.date===today?' today':''}${i%7>4?' weekend':''}" data-overview-day="${c.date}"${c.date===today?' aria-current="date"':''} title="${c.date.replaceAll('-','/')} · ${c.due.length}项截止 · ${c.milestones.length}个里程碑" aria-pressed="${selectedDay===c.date}" aria-label="${c.date}，${c.due.length}项截止，${c.milestones.length}个里程碑"><strong>${Number(c.date.slice(8))}</strong><span class="calendar-markers" aria-hidden="true">${c.current&&c.due.length?'<i></i>':''}${c.current&&c.milestones.length?'<i class="milestone-dot"></i>':''}</span></button>`).join('')}</div><footer><span><i></i>截止 ${due}</span><span><i></i>里程碑 ${milestones}</span></footer></section>`;
 const list=`<section class="overview-agenda"><header><h3>${agendaTitle}</h3>${selectedDay?'<button data-action="overview-month">本月</button>':`<span>${agenda.length}项</span>`}</header><div class="agenda-items">${agenda.slice(0,4).map(r=>{const milestone=r.level==='里程碑'||r.milestone;return `<button class="agenda-item${milestone?' milestone':''}" data-record="${esc(r.id)}" title="${esc(r.title)}"><time datetime="${r.end}"><strong>${Number(r.end.slice(8))}</strong><span>${Number(r.end.slice(5,7))}月</span></time><span class="agenda-item-copy"><strong>${esc(r.title)}</strong><span>${milestone?'里程碑':esc(r.stageName||model.stages.find(s=>s.id===r.stage)?.name||'任务')}${phase(r)?' · '+phase(r):''}</span></span><span aria-hidden="true">›</span></button>`;}).join('')||`<p class="overview-empty">${selectedDay?'当天没有计划安排':'本月没有计划安排'}</p>`}</div>${agenda.length>4?`<button class="agenda-all" data-overview-agenda>查看全部 ${agenda.length}项 ↗</button>`:''}</section>`;
 return `<div class="project-overview" data-filtered="${Boolean(q)}">${top}<div class="overview-main"><section class="overview-shell"><header class="overview-shell-heading"><div class="overview-section-title"><h2>阶段进度</h2><span>${model.stages.length}个阶段</span></div><div class="overview-toolbar"><label class="overview-search">${overviewIcon('search')}<input id="overviewSearch" type="search" aria-label="搜索总览阶段" placeholder="搜索阶段 / 分类 / 任务" value="${esc(keyword)}"></label></div></header><div class="overview-stages">${cards||'<p class="overview-empty">没有匹配的事项</p>'}</div></section><aside class="overview-schedule">${calendar}${list}</aside></div></div>`;
}

function rowsTable(rows,{page=1,pageSize=12}={}){
 const pages=Math.max(1,Math.ceil(rows.length/pageSize)),current=Math.max(1,Math.min(pages,page)),visible=rows.slice((current-1)*pageSize,current*pageSize);
 return `<div class="work-table-scroll"><table class="work-table"><thead><tr><th>推进事项</th><th>计划截止</th><th>执行状态</th><th>责任人</th><th>最新进展</th></tr></thead><tbody>${visible.map(r=>`<tr><td>${taskButton(r)}</td><td class="date-cell">${date(r.end)}</td><td>${status(r)}</td><td>${esc(r.owner||'—')}</td><td class="work-feedback">${esc((r.feedback||'').split(/【跟进[^】]+】\s*/).at(-1)||'—')}</td></tr>`).join('')||'<tr><td colspan="5" class="work-empty">暂无事项</td></tr>'}</tbody></table></div>${pages>1?`<nav class="work-pagination" aria-label="事项分页"><span>${rows.length}项</span><button data-period-page="${current-1}"${current===1?' disabled':''}>上一页</button><span>${current}/${pages}</span><button data-period-page="${current+1}"${current===pages?' disabled':''}>下一页</button></nav>`:''}`;
}
export function renderWeekly(model,{anchor,today,view='current',page=1}){
 const data=weeklyData(model.tasks,anchor,today),defs=[['current','本周推进',data.current],['overdue','逾期事项',data.overdue],['completed','本周完成',data.completed],['next','下周计划',data.next]],selected=defs.find(d=>d[0]===view)||defs[0];
 return `<div class="period-workspace"><header class="period-heading"><h2>每周跟进 <small>${date(data.start)} — ${date(data.end)}</small></h2><div class="period-picker"><button data-week="-1" aria-label="上一周">‹</button><input id="weekAnchor" type="date" aria-label="选择跟进周" value="${anchor}"><button data-week="1" aria-label="下一周">›</button><button data-action="week-today">本周</button></div></header><div class="period-tabs">${defs.map(([key,label,rows])=>`<button data-weekly-view="${key}" aria-pressed="${selected[0]===key}">${label}<strong>${rows.length}</strong></button>`).join('')}</div><section class="period-panel"><h3>${selected[1]}</h3>${rowsTable(selected[2],{page})}</section></div>`;
}
export function renderMonthly(model,{month,page=1}){
 const data=monthlyData(model.tasks,month);return `<div class="period-workspace"><header class="period-heading"><h2>月度回顾</h2><input id="reviewMonth" type="month" aria-label="选择回顾月份" value="${month}"></header>${metrics([['本月计划截止',data.planned.length,'项','month-planned'],['本月实际完成',data.completed.length,'项','month-completed'],['相关逾期事项',data.late.length,'项','month-overdue']])}<section class="period-panel"><h3>月度事项</h3>${rowsTable(data.rows,{page})}</section></div>`;
}
const organizationRoleRank=role=>/园区.*经理|^园区经理$/.test(role)?0:/运维经理/.test(role)?1:/楼栋经理/.test(role)?2:/主管/.test(role)?3:/工程师/.test(role)?4:/值班长/.test(role)?5:6;
export function organizationData(data){
 const active=(data.people||[]).filter(p=>p.active!==false&&p.status!=='已退出'),nameCounts=new Map();for(const p of active)nameCounts.set(p.name,(nameCounts.get(p.name)||0)+1);
 const people=active.flatMap(p=>{const roles=new Map();for(const value of p.assignments||[]){const match=/^(园区|第一栋|第二栋) · (.+?)(（兼任）)?$/.exec(value);if(match)roles.set(match[1]+match[2],{building:match[1],role:match[2]});}if(nameCounts.get(p.name)===1)for(const row of data.positions||[])if(String(row.candidates||'').split(/[、，,；;]/).map(n=>n.trim()).includes(p.name)&&!roles.has(row.building+row.role))roles.set(row.building+row.role,{building:row.building,role:row.role});const ordered=[...roles.values()].sort((a,b)=>organizationRoleRank(a.role)-organizationRoleRank(b.role)||Number(b.building==='园区')-Number(a.building==='园区'));return ordered.length?[{...p,...ordered[0],concurrent:ordered.slice(1).map(r=>r.building+' · '+r.role).join('、')}]:[];});return{people,updatedAt:data.updatedAt,sourceUrl:data.sourceUrl};
}
export function renderOrganization(data,{loading=false,error='',loginUrl=''}={}){
 if(loading)return '<div class="work-empty" role="status">正在读取项目组织…</div>';
 if(error)return `<div class="work-empty" role="status">${esc(error)}${loginUrl?`<a class="work-more" href="${esc(loginUrl)}">登录查看项目组织 ↗</a>`:'<button data-action="organization-retry">重试</button>'}</div>`;
 const people=data?.people||[],buildings=[...new Set(people.map(p=>p.building||'未分配'))].sort((a,b)=>['园区','第一栋','第二栋'].indexOf(a)-['园区','第一栋','第二栋'].indexOf(b)),rank=organizationRoleRank;
 return `<div class="organization-page"><header><h2>项目组织 <small>${people.length}人</small></h2>${data?.sourceUrl?`<a class="work-more" href="${esc(data.sourceUrl)}" target="_blank" rel="noreferrer">打开来源 ↗</a>`:''}</header>${buildings.map(building=>`<section class="organization-building"><h3>${esc(building)}</h3><div class="organization-people">${people.filter(p=>(p.building||'未分配')===building).sort((a,b)=>rank(a.role)-rank(b.role)||a.name.localeCompare(b.name,'zh-CN')).map(p=>`<article><strong>${esc(p.name)}</strong><span>${esc(p.role||'—')}</span>${p.concurrent?`<small>兼任 ${esc(p.concurrent)}</small>`:''}${p.status?`<em>${esc(p.status)}</em>`:''}${p.actualArrival?`<small>到岗 ${date(p.actualArrival)}</small>`:p.plannedArrival?`<small>计划 ${date(p.plannedArrival)}</small>`:''}</article>`).join('')}</div></section>`).join('')||'<div class="work-empty">当前项目暂无人员记录</div>'}</div>`;
}
