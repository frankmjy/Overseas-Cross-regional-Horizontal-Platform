import { filterTasks, hierarchy, timeRange, timelineColumns, stageNames, colors, naturalCompare, day, calendarCells, text } from './model.mjs';
import {completedStatus} from '../../project-tasks/handover/status.mjs';
import {pageDefinitions,renderOverview,renderWeekly,renderMonthly,renderOrganization,monthlyData,organizationData,overviewAgenda,stageInsightRows,ganttRowControls,taskDeliverableCount} from './pages.mjs';
import {createHandoverEditor} from './editor.mjs';
import {createInlineTaskEntry} from './inline.mjs';
import {taskResources,renderResourceLinks,bindOutsideDismiss} from '../../project-tasks/handover/resources.mjs';

const $ = selector => document.querySelector(selector);
const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const drawings = {
  list: '<rect x="4" y="4" width="16" height="16" rx="2"/><path d="M8 8h8M8 12h8M8 16h5"/>',
  layers: '<path d="m12 3 9 5-9 5-9-5 9-5Zm-9 9 9 5 9-5m-18 5 9 5 9-5"/>',
  flag: '<path d="M5 22V3m0 1c5-3 9 3 14 0v10c-5 3-9-3-14 0"/>',
  calendar: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M8 2v6m8-6v6M3 11h18"/>',
  chevron: '<path d="m9 5 7 7-7 7"/>',
  empty: '<path d="M4 7h16v14H4zM9 7V3h6v4M8 12h8m-8 5h5"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 6v6l4 2"/>',
  grid:'<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>',
  chart:'<path d="M4 3v17h17M8 15l4-6 4 3 5-8"/>',
  people:'<circle cx="9" cy="7" r="3"/><path d="M3 21v-4a6 6 0 0 1 12 0v4m2-17a3 3 0 0 1 0 6m1 4a5 5 0 0 1 3 4v3"/>',
};
const icon = key => `<svg viewBox="0 0 24 24" aria-hidden="true">${drawings[key] || drawings.list}</svg>`;
const fullDate = value => value ? value.replaceAll('-', '/') : '未排期';
const planDates = row => !row.start ? '未排期' : row.level === '里程碑' ? fullDate(row.end) : `${fullDate(row.start)} — ${fullDate(row.end)}`;
const ganttMetaWidth = 520;
const batchClass = batch => batch.startsWith('一期') ? ' first' : batch.startsWith('二期') ? ' second' : '';
const scopeLabel = row => row.batch === '项目共用' ? '项目整体' : row.batch || '未填写';
function scopeTag(row) {
  if (!row.batch.startsWith('一期') && !row.batch.startsWith('二期')) return '';
  if (!model.tasks.some(other => other.id !== row.id && other.group === row.group && other.title === row.title && other.batch !== row.batch)) return '';
  return `<span class="batch-tag${batchClass(row.batch)}">${row.batch.startsWith('一期') ? '一期' : '二期'}</span>`;
}
const today = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
const query = new URL(location.href).searchParams;
const securePage=location.protocol==='https:'&&['/project-management','/index.html'].includes(location.pathname);
const localPreview=['localhost','127.0.0.1','[::1]'].includes(location.hostname);
$('.preview-tag').hidden=!localPreview;
document.title='接维项目工作台'+(localPreview?' · 本地预览':'');
const api=securePage?'/api/handover-plan':'/api';
const state = { mode: ['gantt', 'list', 'milestones', 'calendar'].includes(query.get('mode')) ? query.get('mode') : 'gantt',
  page:pageDefinitions.some(p=>p.id===query.get('tab'))?query.get('tab'):query.get('mode')==='milestones'?'milestones':query.get('mode')==='gantt'?'gantt':'overview',
  overviewKeyword:'', overviewDay:'', stage: Number(query.get('stage')) || 0, keyword: query.get('q') || '', category: '', status: '', review: false, unscheduled: false,
  range: 'project', scale: 'fit', open: new Set(), calendar: today().slice(0, 7),week:today(),reviewMonth:today().slice(0,7),weeklyView:'current',periodPage:1 };
let model, phase = 'idle', searchTimer, focusedBeforeDialog,lastRead=0,organization=null,organizationError='',organizationLoading=false;
state.mode=state.page==='milestones'?'milestones':'gantt';
const dialog = $('#detailDialog');
const editor=createHandoverEditor({dialog:$('#taskEditorDialog'),getModel:()=>model,getContext:()=>state,api:securePage?api:'/api/handover-plan',onAccepted:data=>{model=data;render();},onMessage:showMessage});
const rowMenu=document.createElement('div');rowMenu.className='row-action-menu';rowMenu.id='rowActionMenu';rowMenu.setAttribute('role','menu');rowMenu.hidden=true;document.body.append(rowMenu);
function closeRowMenu(){rowMenu.hidden=true;document.querySelectorAll('[data-row-actions][aria-expanded=true]').forEach(b=>b.setAttribute('aria-expanded','false'));}
document.addEventListener('pointerdown',e=>{if(!rowMenu.contains(e.target)&&!e.target.closest('[data-row-actions]'))closeRowMenu();});
document.addEventListener('keydown',e=>{if(e.key==='Escape'&&!rowMenu.hidden){const source=document.querySelector('[data-row-actions][aria-expanded=true]');closeRowMenu();source?.focus();}});
const inlineEntry=createInlineTaskEntry({root:document,getModel:()=>model,submit:input=>editor.createTask(input),onRender:()=>renderBoard(),onMessage:showMessage,onAccepted:(data,parentId)=>{
 model=data;Object.assign(state,{keyword:'',status:'',review:false,unscheduled:false});
 const created=model.records.find(r=>r.id===data.operation?.recordId),parent=model.parents.find(p=>p.id===(created?.level==='任务组'?created.id:parentId));if(parent){state.open.add(`s:${parent.stage}`);state.open.add(`c:${parent.stage}:${parent.category}`);state.open.add(`g:${parent.stage}:${parent.code} ${parent.title}`);}render();
}});
function showMessage(message,error=false){$('#notice').hidden=false;$('#notice').classList.toggle('error',error);$('#notice').textContent=message;}
function loginUrl(){return 'https://localhost:3333/project-management?view=handover&tab='+state.page;}
function setPage(page){if(!pageDefinitions.some(p=>p.id===page))return;state.page=page;state.mode=page==='milestones'?'milestones':'gantt';resetFilters();state.periodPage=1;setOpen();render();$('.workspace').classList.remove('nav-open');if(page==='organization')loadOrganization();}
async function loadOrganization(){if(organizationLoading)return;if(!securePage){organizationError='请在登录后查看当前项目组织。';renderBoard();return;}organizationLoading=true;organizationError='';renderBoard();try{const response=await fetch('/api/staffing',{signal:AbortSignal.timeout(45000)}),data=await response.json();if(!response.ok)throw Error(data.error);organization=organizationData(data);}catch(e){organizationError=e.message||'项目组织未能读取，请重试。';}finally{organizationLoading=false;if(state.page==='organization')renderBoard();}}
function tasks() { return model ? filterTasks(model, state) : []; }
function nodes(filters = state) { return model ? model.milestones.filter(r => (!filters.stage || r.stage === filters.stage)
  && (!filters.category || r.category === filters.category) && (!filters.keyword || [r.title, r.code, r.notes].some(v => v.toLowerCase().includes(filters.keyword.toLowerCase()))))
  .sort((a, b) => a.orderingEnabled&&b.orderingEnabled?naturalCompare(a.code,b.code):(a.end || '').localeCompare(b.end || '') || naturalCompare(a.code, b.code)) : []; }
function parentRows() { const ids=new Set(tasks().map(t=>t.parentId)),all=new Set(model.tasks.map(t=>t.parentId));return model.parents.filter(r=>ids.has(r.id)||!all.has(r.id)&&filterTasks({tasks:[r]},state).length); }
function resetFilters() { Object.assign(state, { stage: 0, keyword: '', overviewKeyword:'', overviewDay:'', category: '', status: '', review: false, unscheduled: false }); }
function syncUrl() {
  const url = new URL(location.href);
  url.searchParams.delete('batch');
  url.searchParams.delete('mode');
  for (const [key, value] of [['tab', state.page], ['stage', state.stage], ['q', state.keyword]]) { if (value) url.searchParams.set(key, value); else url.searchParams.delete(key); }
  history.replaceState(null, '', url);
}
function setOpen(all = false) {
  const tree = hierarchy(tasks(),parentRows(),nodes()); state.open.clear();
  if (all) for (const s of tree) { state.open.add(s.key); for (const c of s.categories) { state.open.add(c.key); for (const g of c.groups) state.open.add(g.key); } }
  else if (tree[0]) { const s = tree[0]; state.open.add(s.key); const c = s.categories[0]; if (c) { state.open.add(c.key); if (c.groups[0]) state.open.add(c.groups[0].key); } }
}
function hasFilter() { return Boolean(state.stage || state.keyword || state.category || state.status || state.unscheduled || state.review); }
function titleForMode() { return { gantt: '执行项', list: '执行项', milestones: '里程碑', calendar: '执行项' }[state.mode]; }
function renderMetrics() {
  const rows = tasks(), parents = parentRows(), unplanned = rows.filter(r => !r.start || !r.end);
  const defs = [
    ['tasks', '执行任务', rows.length, '项', 'list', '#4f79cd'],
    ['groups', '任务组', parents.length, '组', 'layers', '#5a9d94'],
    ['milestones', '交付里程碑', nodes().length, '个', 'flag', '#c79a43'],
    ['unscheduled', '未排期', unplanned.length, '项', 'calendar', '#8c7cbd'],
  ];
  $('#metrics').innerHTML = defs.map(([key, label, count, unit]) => `<button data-metric="${key}" aria-label="查看${label}，${count}${unit}">${label}<strong>${count}</strong><small>${unit}</small></button>`).join('');
}
function renderStages() {
  const batchRows = filterTasks(model, { ...state, stage: 0 });
  $('#sideStages').innerHTML = model.stages.map(s => `<button data-stage="${s.id}" class="${state.stage === s.id ? 'active' : ''}"${state.stage === s.id ? ' aria-current="page"' : ''}><span class="stage-nav-dot" style="--stage:${s.color}"></span><span>${s.name}</span><span class="stage-nav-count">${batchRows.filter(r => r.stage === s.id).length}</span></button>`).join('');
  $('#ganttStages').hidden=state.page!=='gantt';
  $('#workspacePages').innerHTML=pageDefinitions.map(p=>`<button data-page="${p.id}" class="${state.page===p.id?'active':''}"${state.page===p.id?' aria-current="page"':''}>${icon(p.icon)}<span>${p.label}</span></button>`).join('');
}
function renderFilters() {
  const categoryRows = state.mode === 'milestones' ? model.milestones : model.tasks;
  const categories = [...new Set(categoryRows.filter(r => !state.stage || r.stage === state.stage).map(r => r.category))];
  $('#category').innerHTML = '<option value="">全部分类</option>' + categories.map(c => `<option value="${esc(c)}"${c === state.category ? ' selected' : ''}>${esc(c)}</option>`).join('');
  $('#status').value = state.status;
  $('#status').hidden = state.mode === 'milestones';
  $('#search').value = state.keyword;
}
function controls() {
  $('#modeControls').hidden=!['gantt','milestones'].includes(state.page);
  if($('#modeControls').hidden)return;
  const rows = tasks(), count = state.mode === 'milestones' ? nodes().length : rows.length;
  $('#resultsCount').textContent = `${count} ${titleForMode()}`;
  const reviews = parentRows().filter(r => r.basis.includes('复核')).length;
  let left = `<span>已完成 ${rows.filter(r => completedStatus(r.status)).length}/${rows.length}</span>`;
  if (reviews) left += `<button data-action="review" class="${state.review ? 'active' : ''}" aria-pressed="${state.review}">${reviews}组周期待复核</button>`;
  if (state.unscheduled) left += '<button data-action="clear">未排期 ×</button>';
  let right = '';
  if (state.mode === 'gantt') right = `<button data-action="expand">展开全部</button><button data-action="collapse">收起全部</button><button data-action="range" class="${state.range === 'all' ? 'active' : ''}">${state.range === 'all' ? '含护航周期' : '交付周期'}</button><button data-scale="fit" class="${state.scale === 'fit' ? 'active' : ''}">全览</button><button data-scale="month" class="${state.scale === 'month' ? 'active' : ''}">按月</button><button data-action="today">今天</button>`;
  if (state.mode === 'calendar') { left = '<span>计划截止与里程碑</span>'; right = `<div class="calendar-nav"><button data-calendar="-1" aria-label="上个月" title="上个月">‹</button><input id="calendarMonth" class="calendar-month" type="month" aria-label="选择日历月份" value="${state.calendar}"><button data-calendar="1" aria-label="下个月" title="下个月">›</button><button data-action="calendar-today">本月</button></div>`; }
  if (state.mode === 'milestones') { left = '<span>项目计划节点</span>'; right = '<span>日期口径见详情</span>'; }
  $('#modeControls').innerHTML = `<div>${left}</div><div>${right}</div>`;
}
function empty(message = '没有匹配的任务') { return `<div class="empty">${icon('empty')}<h3>${esc(message)}</h3><button class="text-button" data-action="clear">重置筛选</button></div>`; }
function timelineStyle(start, end, range) {
  const total = day(range.end) - day(range.start) + 1;
  const left = Math.max(0, Math.min(100, (day(start) - day(range.start)) / total * 100));
  const right = Math.max(0, Math.min(100, (day(end) - day(range.start) + 1) / total * 100));
  return `--left:${left.toFixed(4)}%;--width:${Math.max(.2, right - left).toFixed(4)}%`;
}
function statusCell(row) { return `<span class="state-cell${completedStatus(row.status) ? ' complete' : ''}${row.status==='逾期进行'?' overdue':''}"><i class="state-dot"></i>${esc(row.status)}</span>`; }
function gantt() {
  const filtered = tasks(); if (!filtered.length&&!parentRows().length&&!nodes().length) return empty();
  const tree = hierarchy(filtered,parentRows(),nodes()), range = timeRange(model, state.range), scale=timelineColumns(range),months=scale.months,meta = ganttMetaWidth;
  const available = Math.max(300, $('#board').clientWidth - meta - 16);
  const width = state.scale === 'month' ? months.length * 144 : Math.max(months.length * 30, available);
  const monthGrid=`linear-gradient(to right,${['transparent 0%',...months.slice(1).map(m=>`transparent calc(${m.left}% - .5px),#dfe7f2 ${m.left}%,transparent calc(${m.left}% + .5px)`),'transparent 100%'].join(',')})`;
  const todayOffset = (day(today()) - day(range.start)) / (day(range.end) - day(range.start) + 1) * 100;
  const inRange = todayOffset >= 0 && todayOffset <= 100;
  const todayStyle = `--today:${todayOffset.toFixed(3)}%`;
  const todayLine = inRange ? `<i class="today-line" style="${todayStyle}" aria-hidden="true"></i>` : '';
  const rowControls=row=>ganttRowControls(row,{editable:!!model.capabilities?.editable,pending:model.pendingRecordIds?.includes(row.id)||row.id.startsWith('local:')});
  const barDates=(start,end)=>width*(Math.min(day(end),day(range.end))-Math.max(day(start),day(range.start))+1)/scale.days>=205?`<span class="bar-dates">${fullDate(start)} — ${fullDate(end)}</span>`:'';
  function groupRow(key, label, rows, depth, kind, color,parentId='') {
    const summaryRows=kind==='package'?model.tasks.filter(r=>r.parentId===(parentId||rows[0]?.parentId)):rows;
    const starts = summaryRows.map(r => r.start).filter(Boolean).sort(), ends = summaryRows.map(r => r.end).filter(Boolean).sort();
    const open = state.open.has(key), bar = starts.length && ends.length && starts[0] <= range.end && ends.at(-1) >= range.start;
    const parent=kind==='package'?model.parents.find(p=>p.id===(parentId||rows[0]?.parentId)):null;
    const marker=parent?.milestone&&parent.end&&parent.end>=range.start&&parent.end<=range.end?`<button class="diamond" style="${timelineStyle(parent.end,parent.end,range)}" data-record="${esc(parent.id)}" aria-label="查看里程碑${esc(parent.title)}，${fullDate(parent.end)}" title="${esc(parent.title)} · ${fullDate(parent.end)}"></button>`:'';
    const name=parent?`<small>${esc(parent.code)}</small><strong>${esc(parent.title)}</strong>`:esc(label);
    const percent=(rows.length?Math.round(rows.filter(r=>completedStatus(r.status)).length/rows.length*100):0),dates=starts.length&&ends.length?planDates({start:starts[0],end:ends.at(-1)}):'未排期';
    return `<div class="plan-row group-row ${kind}" style="--stage:${color}"><div class="meta-cell"><span class="group-completion" title="实际完成 ${rows.filter(r=>completedStatus(r.status)).length}/${rows.length}">${percent}%</span><div class="row-label" style="--indent:${6 + depth * 8}px"><button class="fold" data-fold="${esc(key)}" aria-expanded="${open}" aria-label="${open ? '收起' : '展开'}${esc(label)}">${icon('chevron')}</button><button class="row-name" ${parent?`data-record="${esc(parent.id)}"`:`data-fold="${esc(key)}"`} title="${esc(label+' · '+dates)}">${name}</button><span class="row-count">${rows.length}项</span>${parent?rowControls(parent).delivery:''}</div>${parent?`<div class="row-actions-cell">${rowControls(parent).priority}${rowControls(parent).actions}</div>`:'<span class="priority-placeholder">—</span>'}</div><div class="timeline-cell">${todayLine}${bar ? `<i class="bar group-bar" title="${dates}" style="${timelineStyle(starts[0], ends.at(-1), range)}">${kind==='stage'?barDates(starts[0],ends.at(-1)):''}</i>` : ''}${marker}</div></div>${parent?insertionRow(parent):''}`;
  }
  function taskRow(row, color) {
    const valid = row.start && row.end && row.start <= range.end && row.end >= range.start;
    const milestone = row.level === '里程碑'||row.milestone;
    const control = milestone ? `<button class="diamond" style="${timelineStyle(row.end, row.end, range)}" data-record="${esc(row.id)}" aria-label="查看里程碑${esc(row.title)}，${fullDate(row.end)}" title="${esc(row.title)} · ${fullDate(row.end)}"></button>` : `<button class="bar${completedStatus(row.status) ? ' complete' : ''}" style="${timelineStyle(row.start, row.end, range)}" data-record="${esc(row.id)}" aria-label="查看${esc(row.title)}，${fullDate(row.start)}至${fullDate(row.end)}" title="${esc(`${row.title} · ${fullDate(row.start)}—${fullDate(row.end)}`)}">${barDates(row.start,row.end)}</button>`;
    const controls=rowControls(row);
    return `<div class="plan-row ${milestone ? 'milestone-row' : 'task-row'}${completedStatus(row.status)?' is-complete':''}" ${row.level==='执行项'?`data-task-row="${esc(row.id)}"`:''} ${milestone?`data-milestone-row="${esc(row.id)}"`:''} style="--stage:${color}"><div class="meta-cell">${controls.finish}<div class="row-label" style="--indent:49px"><button class="row-name" data-record="${esc(row.id)}" title="${esc(`${row.code} ${row.title} · ${row.status} · ${planDates(row)}`)}"><small>${esc(row.code)}</small><strong>${esc(row.title)}</strong>${scopeTag(row)}</button><span class="mobile-date">${planDates(row)}</span>${controls.delivery}</div><div class="row-actions-cell">${controls.priority}${controls.actions}</div></div><div class="timeline-cell">${todayLine}${valid ? control : ''}</div></div>${insertionRow(row)}`;
  }
  function insertionRow(row){const content=inlineEntry.renderAfter(row);return content?`<div class="plan-row inline-add-row"><div class="meta-cell"><div class="inline-entry-cell">${content}</div></div><div class="timeline-cell"></div></div>`:'';}
  const body = tree.map(s => {
    let html = groupRow(s.key, `0${s.id} ${s.name}`, s.rows, 0, 'stage', s.color);
    if (state.open.has(s.key)) {
      for (const c of s.categories) {
        html += groupRow(c.key, c.label, c.rows, 1, 'category', s.color);
        if (state.open.has(c.key)) for (const g of c.groups) { html += groupRow(g.key, g.label, g.rows, 2, 'package', s.color,g.parentId); if (state.open.has(g.key)) {html += g.rows.map(r => taskRow(r, s.color)).join('');const parent=model.parents.find(p=>p.id===(g.parentId||g.rows[0]?.parentId));if(parent){const entry=inlineEntry.render(parent,{editable:!!model.capabilities?.editable,pending:model.pendingRecordIds?.includes(parent.id)});if(entry)html+=`<div class="plan-row inline-add-row"><div class="meta-cell"><div class="inline-entry-cell">${entry}</div></div><div class="timeline-cell"></div></div>`;}} }
      }
      html += nodes().filter(r => r.stage === s.id&&r.level==='里程碑').map(r => taskRow(r, s.color)).join('');
    }
    return html;
  }).join('');
  return `<div class="gantt-scroll" tabindex="0" aria-label="甘特时间轴，可滚动查看"><div class="gantt-inner scale-${state.scale}" style="--meta:${meta}px;--timeline:${width}px;--months:${months.length};--days:${scale.days};--month-grid:${monthGrid}"><div class="gantt-header"><div class="meta-head"><span class="completion-head">完成</span><span class="gantt-name-head"><i>编号</i><i>关键工作</i></span><span>优先级</span></div><div class="months">${months.map(m => `<span class="month" style="left:${m.left}%;width:${m.width}%"><b>${state.scale==='month'?`${m.year}.${String(m.month).padStart(2,'0')}`:`${m.month}月`}</b>${state.scale==='fit'?`<small>${m.month===1||m===months[0]?m.year:''}</small>`:''}</span>`).join('')}${state.scale==='month'?`<div class="week-ticks" aria-hidden="true">${scale.weeks.map(w=>`<span style="left:${w.left}%">${w.date.slice(8)}</span>`).join('')}</div>`:''}${inRange ? `<span class="today-head" style="${todayStyle}">今天 ${today().slice(5).replace('-','/')}</span>` : ''}</div></div>${body}</div></div>`;
}
function list() {
  const rows = tasks(); if (!rows.length) return empty();
  const tree = hierarchy(rows);
  const body = tree.map(s => s.categories.map(c => `<tr class="list-group"><td colspan="5">${esc(s.name)}<span class="list-group-gap"> · </span>${esc(c.label)} <span class="row-count">${c.rows.length}项</span></td></tr>${c.groups.map(g => g.rows.map(row => `<tr data-list-record="${esc(row.id)}"><td class="code">${esc(row.code)}</td><td><button class="row-name" data-record="${esc(row.id)}">${esc(row.title)}${scopeTag(row)}</button></td><td class="date-cell">${planDates(row)}</td><td><span class="status-text">${esc(row.status)}</span></td><td>${esc(row.owner || '—')}</td></tr>`).join('')).join('')}`).join('')).join('');
  return `<div class="list-scroll"><table class="task-table execution-table"><colgroup><col style="width:132px"><col><col style="width:216px"><col style="width:96px"><col style="width:100px"></colgroup><thead><tr><th>任务编号</th><th>任务名称</th><th>计划起止</th><th>执行状态</th><th>责任人</th></tr></thead><tbody>${body}</tbody></table></div>`;
}
function milestones() {
  const rows = nodes(); if (!rows.length) return empty('没有匹配的里程碑');
  return `<div class="list-scroll"><table class="task-table milestone-table"><colgroup><col style="width:92px"><col><col style="width:132px"><col style="width:170px"></colgroup><thead><tr><th>编号</th><th>交付里程碑</th><th>计划日期</th><th>日期依据</th></tr></thead><tbody>${rows.map(row => `<tr><td class="code">${esc(row.code)}</td><td><button class="row-name" data-record="${esc(row.id)}">${esc(row.title)}</button></td><td class="milestone-date">${fullDate(row.end)}</td><td><span class="${row.basis.includes('月末') ? 'group-chip' : 'status-text'}">${esc(row.basis)}</span></td></tr>`).join('')}</tbody></table></div>`;
}
function calendar() {
  const filteredModel = { ...model, tasks: tasks(), milestones: nodes() };
  return `<div class="calendar-wrap"><div class="calendar-grid">${['一', '二', '三', '四', '五', '六', '日'].map(d => `<span class="calendar-day-head">${d}</span>`).join('')}${calendarCells(filteredModel, state.calendar).map(c => `<button class="calendar-day${c.current ? '' : ' other'}${c.date === today() ? ' today' : ''}" data-day="${c.date}" aria-label="${c.date}，${c.due.length}项截止，${c.milestones.length}个里程碑"><strong>${Number(c.date.slice(8))}</strong>${c.milestones.slice(0, 2).map(r => `<span class="calendar-event">${esc(r.title)}</span>`).join('')}${c.due.length ? `<span class="calendar-due">${c.due.length}项截止</span>` : ''}</button>`).join('')}</div></div>`;
}
function renderBoard() {
  closeRowMenu();
  controls();
  const scroll = $('.gantt-scroll'), position = { left: scroll?.scrollLeft || 0, top: scroll?.scrollTop || 0 };
  const renderers={gantt,milestones,overview:()=>renderOverview(model,{month:state.calendar,today:today(),keyword:state.overviewKeyword,selectedDay:state.overviewDay}),weekly:()=>renderWeekly(model,{anchor:state.week,today:today(),view:state.weeklyView,page:state.periodPage}),monthly:()=>renderMonthly(model,{month:state.reviewMonth,page:state.periodPage}),organization:()=>renderOrganization(organization,{loading:organizationLoading,error:organizationError,loginUrl:securePage?'':loginUrl()})};
  $('.plan-panel').dataset.page=state.page;$('#board').dataset.page=state.page;$('#board').innerHTML=renderers[state.page]();
  if (state.page === 'gantt') { const next = $('.gantt-scroll'); if (next) { next.scrollLeft = position.left; next.scrollTop = position.top; } }
}
function render() {
  if (!model) return;
  renderMetrics(); renderStages(); renderFilters();
  $('.panel-heading-right').hidden=state.page==='overview';
  $('#workspaceTitle').textContent=pageDefinitions.find(p=>p.id===state.page)?.label||'甘特计划';
  $('#planFilters').hidden=!['gantt','milestones'].includes(state.page);
  $('#newTaskButton').textContent=model.capabilities?.editable?'新增条目':'登录编辑';$('#trashButton').hidden=!model.capabilities?.editable;
  const pending=(model.operations||[]).filter(o=>o.status!=='success');$('#syncButton').hidden=!pending.length;$('#syncButton').textContent=`同步任务 ${pending.length}`;$('#syncButton').classList.toggle('has-error',pending.some(o=>['error','blocked','uncertain'].includes(o.status)));
  $('#writeMode').textContent=model.capabilities?.editable?(localPreview?'本地联动预览':'已连接飞书'):(localPreview?'只读预览':'只读');
  if(securePage)for(const link of document.querySelectorAll('[data-platform-page]'))link.href=link.dataset.platformPage;
  renderBoard(); syncUrl();
  const stamp = new Intl.DateTimeFormat('zh-CN', { timeZone: 'Asia/Shanghai', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(model.source.fetchedAt));
  $('#sourceStamp').textContent = `新表读取 ${stamp}`;
  $('#sourceFooter').textContent = `飞书新表 · ${stamp}`;
}
function safeLink(value) {
  const extracted = /\]\((https:\/\/[^\s]+)\)/.exec(value || '')?.[1] || value;
  try { const url = new URL(extracted); return url.protocol === 'https:' && !url.username && !url.password ? url.href : ''; } catch { return ''; }
}
function section(title, value, className = '') { return value ? `<section class="detail-section"><h3>${esc(title)}</h3><p class="${className}">${esc(value)}</p></section>` : ''; }
function openDialog(html) {
  focusedBeforeDialog = document.activeElement;
  $('#detailContent').innerHTML = html;
  if (!dialog.open) dialog.showModal();
  dialog.scrollTop = 0;
}
function closeDialog() { dialog.close(); focusedBeforeDialog?.focus?.(); }
bindOutsideDismiss(dialog,closeDialog);
function detailActions(row){
  if(!model.capabilities?.editable)return '';
  if(model.pendingRecordIds?.includes(row.id)||row.id.startsWith('local:'))return '<span>修改已保存，后台同步中</span><button data-action="operations">查看同步</button>';
  const children=model.tasks.some(t=>t.parentId===row.id);
  return `<div class="detail-actions"><button data-edit-task="${esc(row.id)}">编辑</button><button data-deliver-task="${esc(row.id)}">提交交付物</button>${row.level!=='任务组'?`<button data-complete-task="${esc(row.id)}">${row.actualCompletion?'重新打开':'标记完成'}</button>`:''}${row.level!=='里程碑'?`<button data-milestone-task="${esc(row.id)}" aria-pressed="${row.milestone}">${row.milestone?'取消里程碑':'标为里程碑'}</button>`:''}<button data-delete-task="${esc(row.id)}"${children?' disabled title="请先调整子项"':''}>删除</button></div>`;
}
function deliverableSection(row){return taskResources(row).length?`<section class="detail-section"><h3>交付物</h3><div class="detail-deliverables">${renderResourceLinks(row)}</div></section>`:'';}
function detail(recordId) {
  const row = model.records.find(r => r.id === recordId); if (!row) return;
  if(model.capabilities?.editable&&!model.pendingRecordIds?.includes(row.id)&&!row.id.startsWith('local:')){if(dialog.open)closeDialog();editor.open(row);return;}
  const parent = model.parents.find(r => r.id === row.parentId), context = parent || row;
  const field = (label, value) => `<div class="detail-field"><dt>${label}</dt><dd>${esc(value || '—')}</dd></div>`;
  const source = safeLink(context.source);
  const children = model.tasks.filter(r => r.parentId === row.id);
  openDialog(`<header class="detail-header"><div class="detail-eyebrow"><span>${esc(row.code)}</span><span>·</span><span>${esc(row.level)}</span></div><h2 id="detailTitle">${esc(row.title)}</h2><button class="icon-button" data-action="close-dialog" title="关闭详情" aria-label="关闭详情">×</button></header><div class="detail-main"><div class="detail-breadcrumb">${esc([row.stageName, row.category, row.level === '执行项' ? context.title : ''].filter(Boolean).join(' / '))}</div><dl class="detail-meta">${field('计划起止', row.start ? `${fullDate(row.start)} — ${fullDate(row.end)}` : '未排期')}${field('执行状态', row.status)}${field('责任人', row.owner || '未关联')}${field('实际完成', row.actualCompletion ? fullDate(row.actualCompletion) : '未填写')}${field('适用范围', scopeLabel(row))}${field('动作类型', row.actionType)}${field('排期依据', row.basis)}</dl>${section('任务备注', row.notes)}${section('最新进展', row.feedback)}${section('任务组目标', context.goal)}${section('手册时间要求', context.timing)}${section('交付要求', context.requirements)}${section('涉及团队', context.teams)}${section('海外差异', context.overseas)}${section('原计划责任信息', row.sourceOwner)}${deliverableSection(row)}${children.length ? `<section class="detail-section"><h3>执行项 ${children.length}</h3><div class="plain-list">${children.map(c => `<button data-record="${esc(c.id)}">${esc(c.code)} · ${esc(c.title)}${scopeTag(c)}</button>`).join('')}</div></section>` : ''}${source ? `<section class="detail-section"><h3>手册来源</h3><a class="text-button" href="${esc(source)}" target="_blank" rel="noreferrer">打开原文 ↗</a></section>` : ''}</div><footer class="detail-footer">${detailActions(row)}<a href="${esc(row.url)}" target="_blank" rel="noreferrer">打开飞书记录 ↗</a></footer>`);
}
function groupsDialog() {
  const parents = parentRows();
  openDialog(`<header class="detail-header"><div class="detail-eyebrow">${parents.length}个任务组</div><h2 id="detailTitle">任务组总览</h2><button class="icon-button" data-action="close-dialog" title="关闭详情" aria-label="关闭详情">×</button></header><div class="detail-main">${model.stages.filter(s=>parents.some(p=>p.stage===s.id)).map(s => `<section class="detail-section"><h3>${esc(s.name)}</h3><div class="plain-list">${parents.filter(p => p.stage === s.id).map(p => `<button data-record="${esc(p.id)}">${esc(p.code)} · ${esc(p.title)}<span class="row-count">${tasks().filter(t => t.parentId === p.id).length}项</span></button>`).join('')}</div></section>`).join('')}</div><footer class="detail-footer"><span>任务组与执行项分别统计</span></footer>`);
}
function taskListDialog(title,rows){openDialog(`<header class="detail-header"><div class="detail-eyebrow">${rows.length}项</div><h2 id="detailTitle">${esc(title)}</h2><button class="icon-button" data-action="close-dialog" aria-label="关闭详情" title="关闭详情">×</button></header><div class="detail-main"><section class="detail-section"><div class="plain-list">${rows.map(r=>`<button data-record="${esc(r.id)}">${esc(r.code)} · ${esc(r.title)}${scopeTag(r)}<small>${esc(r.status)} · ${planDates(r)}</small></button>`).join('')||'<p>暂无事项</p>'}</div></section></div>`);}
function dayDialog(value) {
  const due = tasks().filter(r => r.end === value), m = nodes().filter(r => r.end === value);
  openDialog(`<header class="detail-header"><div class="detail-eyebrow">计划日期</div><h2 id="detailTitle">${fullDate(value)}</h2><button class="icon-button" data-action="close-dialog" title="关闭详情" aria-label="关闭详情">×</button></header><div class="detail-main">${[['里程碑', m], ['任务截止', due]].map(([name, rows]) => rows.length ? `<section class="detail-section"><h3>${name} ${rows.length}</h3><div class="plain-list">${rows.map(r => `<button data-record="${esc(r.id)}">${esc(r.code)} · ${esc(r.title)}</button>`).join('')}</div></section>` : '').join('') || '<div class="empty"><h3>当天没有计划截止或里程碑</h3></div>'}</div>`);
}
async function load(refresh = false,silent=false) {
  if (phase === 'loading') return;
  phase = 'loading'; $('.refresh').disabled = true; $('#sourceStamp').textContent = '正在读取新表';
  if (!model) { $('#loadStatus').hidden = false; $('#loadStatus').innerHTML = '<span class="spinner"></span>正在读取接维任务'; }
  else if(!silent) { $('#notice').hidden = false; $('#notice').classList.remove('error'); $('#notice').textContent = '正在重新读取项目数据…'; }
  try {
    const url=securePage?api+(refresh?'/refresh':''):refresh?'/api/refresh':'/api/plan';
    const response = await fetch(url, { method: refresh ? 'POST' : 'GET',headers:securePage&&refresh?{'Content-Type':'application/json'}:undefined,body:securePage&&refresh?'{}':undefined, signal: AbortSignal.timeout(45000), cache: 'no-store' });
    const data = await response.json(); if (!response.ok || !Array.isArray(data.tasks) || data.source?.table !== 'tblgQsrBMFd9eeuX') throw Error(data.error || '测试数据源未通过校验。');
    if(data.ready===false){model=data;phase='ready';lastRead=Date.now();$('#loadStatus').hidden=false;$('#workspaceData').hidden=true;$('#loadStatus').innerHTML=data.error?`<span>${esc(data.error)}</span><button class="text-button" data-action="refresh">重试连接</button>`:'<span class="spinner"></span>正在读取正式任务';return;}
    const initial = !model,wasPending=model?.numberingPending||model?.operations?.some(o=>o.status!=='success'),changed=initial||data.revision!==model.revision||data.source.fetchedAt!==model.source.fetchedAt||today()!==model.clockDay;model=data;model.clockDay=today();phase = 'ready';lastRead=Date.now();$('#loadStatus').hidden = true; $('#workspaceData').hidden = false;if(!silent)$('#notice').hidden = true;
    if(wasPending&&!data.numberingPending&&!data.operations?.some(o=>o.status!=='success'))showMessage('同步完成。');
    if (initial) setOpen(hasFilter());if(changed||!silent)render();if(initial&&state.page==='organization')loadOrganization();
    if(data.ready===false&&data.error)showMessage(data.error,true);if(data.numberingError)showMessage(data.numberingError,true);
  } catch (error) {
    phase = 'error';
    const message = error.name === 'TimeoutError' ? '读取超时，请重试。' : error.message || '未取得新表数据，请重试。';
    if (!model) { $('#loadStatus').innerHTML = `${icon('empty')}<span>${esc(message)}</span><button class="text-button" data-action="refresh">重试</button>`; }
    else { $('#notice').hidden = false; $('#notice').classList.add('error'); $('#notice').innerHTML = `<span>${esc(message)} 保留上次成功数据。</span><button class="text-button" data-action="refresh">重试</button>`; render(); }
  } finally { $('.refresh').disabled = false; }
}

document.addEventListener('click', async event => {
  if(event.target.closest('[data-home]')){event.preventDefault();setPage('overview');return;}
  const trigger = event.target.closest('button'); if (!trigger) return;
  if(trigger.dataset.page)return setPage(trigger.dataset.page);
  if(trigger.dataset.rowActions){
   const row=model.records.find(r=>r.id===trigger.dataset.rowActions);if(!row||!model.capabilities?.editable||row.id.startsWith('local:')||model.pendingRecordIds?.includes(row.id))return;
   const hasChildren=model.tasks.some(r=>r.parentId===row.id),name={执行项:'任务',任务组:'任务组',里程碑:'里程碑'}[row.level]||'条目';
   rowMenu.innerHTML=`<button role="menuitem" data-insert-after="${esc(row.id)}"${model.capabilities.ordering?'':' disabled'}>在下方插入${name}</button><button role="menuitem" class="danger" data-delete-task="${esc(row.id)}"${hasChildren?' disabled title="请先处理子项"':''}>删除${name}</button>`;
   const rect=trigger.getBoundingClientRect();rowMenu.style.left=Math.max(8,Math.min(innerWidth-174,rect.right-164))+'px';rowMenu.style.top=Math.min(innerHeight-94,rect.bottom+4)+'px';rowMenu.hidden=false;trigger.setAttribute('aria-expanded','true');rowMenu.querySelector('button:not(:disabled)')?.focus();return;
  }
  if(trigger.dataset.insertAfter){closeRowMenu();inlineEntry.beginAfter(trigger.dataset.insertAfter);return;}

  if(trigger.dataset.taskDeliverables){const row=model.records.find(r=>r.id===trigger.dataset.taskDeliverables);if(!row)return;if(!taskDeliverableCount(row)&&model.capabilities?.editable&&!model.pendingRecordIds?.includes(row.id)&&!row.id.startsWith('local:'))editor.deliver(row);else openDialog(`<header class="detail-header"><h2 id="detailTitle">${esc(row.title)} · 交付物</h2><button class="icon-button" data-action="close-dialog" aria-label="关闭详情">×</button></header><div class="detail-main">${deliverableSection(row)||'<p>暂无交付物</p>'}</div><footer class="detail-footer">${model.capabilities?.editable?`<button data-deliver-task="${esc(row.id)}"${model.pendingRecordIds?.includes(row.id)?' disabled':''}>添加交付物</button>`:''}</footer>`);return;}
  const actionKey=['editTask','priorityTask','deliverTask','completeTask','milestoneTask','deleteTask'].find(k=>trigger.dataset[k]);
  if(actionKey){closeRowMenu();const row=model.records.find(r=>r.id===trigger.dataset[actionKey]);if(!row)return;if(!model.capabilities?.editable)return showMessage('请登录后修改。',true);if(model.pendingRecordIds?.includes(row.id)||row.id.startsWith('local:'))return showMessage('该任务正在同步，请稍后。');if(dialog.open)closeDialog();try{trigger.disabled=true;if(actionKey==='editTask')editor.open(row);else if(actionKey==='priorityTask')editor.priority(row);else if(actionKey==='deliverTask')editor.deliver(row);else if(actionKey==='deleteTask')editor.remove(row);else await editor.quick(row,'update',actionKey==='completeTask'?{actualCompletion:row.actualCompletion?'':today()}:{milestone:!row.milestone});}catch(e){showMessage(e.message,true);}finally{if(trigger.isConnected)trigger.disabled=false;}return;}
  if(trigger.dataset.week){state.week=new Date((day(state.week)+Number(trigger.dataset.week)*7)*86400000).toISOString().slice(0,10);state.periodPage=1;renderBoard();return;}
  if(trigger.dataset.weeklyView){state.weeklyView=trigger.dataset.weeklyView;state.periodPage=1;renderBoard();return;}
  if(trigger.dataset.periodPage){state.periodPage=Number(trigger.dataset.periodPage);renderBoard();return;}
  if('summary' in trigger.dataset){const key=trigger.dataset.summary;if(key.startsWith('month-')){const data=monthlyData(model.tasks,state.reviewMonth);taskListDialog(trigger.textContent,key==='month-planned'?data.planned:key==='month-completed'?data.completed:data.late);}else if(key==='milestones')setPage('milestones');else if(key==='period'){state.range='all';setPage('gantt');}else taskListDialog(trigger.textContent,key==='overdue'?model.tasks.filter(r=>r.status==='逾期进行'):key==='deliverables'?model.tasks.filter(r=>r.attachments?.length||r.deliverableLinks):model.tasks);return;}
  if(trigger.dataset.overviewDay){state.overviewDay=trigger.dataset.overviewDay;state.calendar=state.overviewDay.slice(0,7);renderBoard();return;}
  if('overviewAgenda' in trigger.dataset){taskListDialog(state.overviewDay?'当日安排':'本月安排',overviewAgenda(model,{month:state.calendar,selectedDay:state.overviewDay}));return;}
  if(trigger.dataset.stageInsight){const stage=Number(trigger.dataset.stageInsight),kind=trigger.dataset.insightKind,key=trigger.dataset.insightKey||'';taskListDialog((model.stages.find(s=>s.id===stage)?.name||'阶段')+' · '+(key||trigger.getAttribute('aria-label')||'事项'),stageInsightRows(model,{stage,kind,key}));return;}
  if (trigger.dataset.record) return detail(trigger.dataset.record);
  if (trigger.dataset.day) return dayDialog(trigger.dataset.day);
  if ('fold' in trigger.dataset) { const key = trigger.dataset.fold; state.open.has(key) ? state.open.delete(key) : state.open.add(key); renderBoard(); return; }
  if ('stage' in trigger.dataset) { if(state.page!=='gantt'){state.page='gantt';state.mode='gantt';resetFilters();}state.stage = state.stage === Number(trigger.dataset.stage) ? 0 : Number(trigger.dataset.stage); state.category = ''; state.unscheduled = false; setOpen(true); render(); $('.workspace').classList.remove('nav-open'); return; }
  if (trigger.dataset.mode) { state.mode = trigger.dataset.mode; state.category = ''; render(); return; }
  if (trigger.dataset.scale) { state.scale = trigger.dataset.scale; renderBoard(); return; }
  if (trigger.dataset.calendar) { state.overviewDay=''; const [y, m] = state.calendar.split('-').map(Number); state.calendar = new Date(Date.UTC(y, m - 1 + Number(trigger.dataset.calendar), 1)).toISOString().slice(0, 7); renderBoard(); return; }
  if (trigger.dataset.metric) {
    if (trigger.dataset.metric === 'groups') return groupsDialog();
    if (trigger.dataset.metric === 'milestones') { setPage('milestones'); return; }
    if (trigger.dataset.metric === 'unscheduled') { state.unscheduled = !state.unscheduled;state.page='gantt';state.mode='gantt';setOpen(true);render(); return; }
    taskListDialog('执行任务',tasks());return;
  }
  switch (trigger.dataset.action) {
    case 'refresh': load(true); break;
    case 'new-task': if(model.capabilities?.editable)editor.open();else location.href=loginUrl();break;
    case 'operations': editor.operations();break;
    case 'trash': editor.trash();break;
    case 'week-today': state.week=today();state.periodPage=1;renderBoard();break;
    case 'organization-retry': loadOrganization();break;
    case 'close-dialog': closeDialog(); break;
    case 'clear': resetFilters(); setOpen(); render(); break;
    case 'overview': resetFilters(); state.mode = 'gantt'; setOpen(); render(); $('.workspace').classList.remove('nav-open'); break;
    case 'expand': setOpen(true); renderBoard(); break;
    case 'collapse': state.open.clear(); renderBoard(); break;
    case 'range': state.range = state.range === 'all' ? 'project' : 'all'; renderBoard(); break;
    case 'review': state.review = !state.review; setOpen(true); render(); break;
    case 'overview-month': state.overviewDay='';renderBoard();break;
    case 'calendar-today': state.overviewDay=today(); state.calendar = today().slice(0, 7); renderBoard(); break;
    case 'sidebar': $('.workspace').classList.toggle('nav-open'); break;
    case 'today': { const scroller = $('.gantt-scroll'), range = timeRange(model, state.range), inner = $('.gantt-inner'); if (scroller && inner) { const timeline = parseFloat(inner.style.getPropertyValue('--timeline')); const x = (day(today()) - day(range.start)) / (day(range.end) - day(range.start) + 1) * timeline; scroller.scrollLeft = Math.max(0, x - (scroller.clientWidth - ganttMetaWidth) / 2); } break; }
  }
});
document.addEventListener('input', event => { if(event.target.id==='overviewSearch'){clearTimeout(searchTimer);state.overviewKeyword=event.target.value;const position=event.target.selectionStart;searchTimer=setTimeout(()=>{renderBoard();const input=$('#overviewSearch');input?.focus({preventScroll:true});input?.setSelectionRange(position,position);},180);return;} if (event.target.id === 'search') { clearTimeout(searchTimer); state.keyword = event.target.value; searchTimer = setTimeout(() => { setOpen(Boolean(state.keyword)); renderMetrics(); renderStages(); renderBoard(); syncUrl(); }, 120); } });
document.addEventListener('change', event => { if(event.target.id==='overviewCalendarYear'||event.target.id==='overviewCalendarMonth'){const year=$('#overviewCalendarYear').value,month=$('#overviewCalendarMonth').value;state.calendar=year+'-'+month.padStart(2,'0');state.overviewDay='';renderBoard();}else if (event.target.id === 'calendarMonth' && /^\d{4}-\d\d$/.test(event.target.value)) { state.calendar = event.target.value; state.overviewDay='';renderBoard(); } else if(event.target.id==='weekAnchor'&&/^\d{4}-\d\d-\d\d$/.test(event.target.value)){state.week=event.target.value;state.periodPage=1;renderBoard();}else if(event.target.id==='reviewMonth'&&/^\d{4}-\d\d$/.test(event.target.value)){state.reviewMonth=event.target.value;state.periodPage=1;renderBoard();}else if (event.target.id === 'category' || event.target.id === 'status') { state[event.target.id] = event.target.value; setOpen(true); render(); } });
dialog.addEventListener('cancel', () => focusedBeforeDialog?.focus?.());
let resizeTimer;
window.addEventListener('resize', () => { clearTimeout(resizeTimer); resizeTimer = setTimeout(() => { if (model && state.page === 'gantt') renderBoard(); }, 100); });
let polling=false;
setInterval(async()=>{if(document.visibilityState!=='visible'||!model||phase==='loading'||polling||inlineEntry.active)return;if(securePage&&(model.numberingPending||(model.operations||[]).some(o=>o.status!=='success'))){polling=true;try{const response=await fetch(api+'/operations',{signal:AbortSignal.timeout(7000)}),data=await response.json();if(!response.ok)throw Error();if(data.revision!==model.revision)await load(false,true);}catch{showMessage('同步状态暂未更新，已保存的修改会保留。',true);}finally{polling=false;}}else if(model.ready===false||Date.now()-lastRead>60000)load(false,true);},2000);
document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible'&&model&&!inlineEntry.active)load(false,true);});
load();
