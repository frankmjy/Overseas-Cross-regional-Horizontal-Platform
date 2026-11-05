import { priorityExamples, renderWeeklyPriorities } from './weekly-priorities.js';
const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
const date = value => /^\d{4}-\d\d-\d\d$/.test(value || '') && Number.isFinite(Date.parse(`${value}T00:00:00Z`)) && new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value ? value : '';
const add = (value, days) => new Date(Date.parse(`${value}T00:00:00Z`) + days * 86400000).toISOString().slice(0, 10);
const short = value => value ? `${Number(value.slice(5, 7))}/${Number(value.slice(8))}` : '未排期';
const latest = value => String(value || '').split(/^【跟进 \d+ · \d{4}-\d\d-\d\d \d\d:\d\d · [^\r\n【】]+】\r?\n/gm).at(-1).trim();

export function buildProjectWeekly(plan, { anchor, today, meetingTodos = null, priorityItems = null } = {}) {
  if (!date(anchor) || !date(today)) throw Error('Invalid weekly date');
  const start = add(anchor, -(new Date(`${anchor}T00:00:00Z`).getUTCDay() + 6) % 7), end = add(start, 6), cutoff = today < end ? today : end;
  const nextStart = add(start, 7), nextEnd = add(start, 13);
  const rows = (plan?.keyRows || []).filter(row => ['task', 'milestone'].includes(row.type) && !['已完成', '正常完成', '逾期完成'].includes(row.status) && Number(row.progress || 0) < 100)
    .map(row => ({ ...row, start: date(row.start), end: date(row.end), feedback: latest(row.feedback),
      phaseName: plan.phases?.find(phase => phase.tone === row.phase)?.short || '未分组' }));
  const overdue = row => !!row.end && row.end < cutoff;
  const overlap = (row, from, to) => row.start && row.end && row.start <= to && row.end >= from;
  const order = (a, b) => Number(overdue(b)) - Number(overdue(a)) || Number(b.priority === 'P0') - Number(a.priority === 'P0')
    || (a.end || '9999').localeCompare(b.end || '9999') || String(a.code).localeCompare(String(b.code), 'zh-CN', { numeric: true });
  const current = rows.filter(row => overdue(row) || overlap(row, start, end)).sort(order);
  const late = current.filter(overdue);
  const next = rows.filter(row => overlap(row, nextStart, nextEnd)).sort((a, b) => a.end.localeCompare(b.end));
  const stages = [...new Set(current.map(row => row.phase))].map(phase => {
    const items = current.filter(row => row.phase === phase), lateCount = items.filter(overdue).length;
    return { name: items[0].phaseName, total: items.length, late: lateCount, planned: items.length - lateCount };
  });
  const days = Array.from({ length: 7 }, (_, index) => ({ date: add(start, index), label: ['一', '二', '三', '四', '五', '六', '日'][index], count: current.filter(row => row.end === add(start, index)).length }));
  const availablePlans = (plan?.keyRows || []).filter(row => ['task', 'milestone'].includes(row.type) && row.recordId);
  return { ready: !!plan, anchor, today, start, end, cutoff, nextStart, nextEnd, current, overdue: late, priorityItems: priorityItems ?? priorityExamples(start), next, stages, days, meetingTodos, availablePlans };
}

const update = row => row.recordId ? `<button type="button" class="weekly-update" data-weekly-update="${esc(row.recordId)}">更新进展 <span aria-hidden="true">↗</span></button>` : '';
const status = (row, model) => `<span class="weekly-status ${row.end && row.end < model.cutoff ? 'late' : 'active'}">${row.end && row.end < model.cutoff ? '已逾期' : esc(row.sourceStatus || row.status)}</span>`;
const metricIcon = name => `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="${{ tasks: 'M5 5h14v15H5ZM9 2v6m6-6v6M8 12h8m-8 4h5', clock: 'M12 8v5l3 2M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0', flag: 'M6 22V3m0 1h13l-3 4 3 4H6', meeting: 'M4 4h16v13H4Zm5 13-2 4m8-4 2 4M8 8h8m-8 4h5', next: 'M4 12h15m-5-5 5 5-5 5' }[name]}"/></svg>`;
function renderRows(rows, model) {
  return rows.map(row => `<tr><td><div class="weekly-task-name"><small>${esc(row.code)}</small><strong>${esc(row.title)}</strong><span>${esc(row.phaseName)}</span></div></td><td>${esc(row.owner || '待指定')}</td><td><time class="${row.end && row.end < model.cutoff ? 'is-late' : ''}">${short(row.end)}</time></td><td>${status(row, model)}</td><td><p class="weekly-feedback" title="${esc(row.feedback)}">${esc(row.feedback || '暂无跟进')}</p>${row.sync && row.sync.status !== 'success' ? `<small class="weekly-save-state ${['error', 'blocked'].includes(row.sync.status) ? 'error' : ''}" role="status">${['error', 'blocked'].includes(row.sync.status) ? '待同步' : '同步中'}</small>` : ''}</td><td>${update(row)}</td></tr>`).join('') || '<tr><td colspan="6" class="weekly-empty-row">当前筛选下暂无事项</td></tr>';
}

export function renderProjectWeekly(model, { view = 'current', filter = 'all', page = 1, connected = true, priorityFilter = 'all', priorityQuery = '', priorityPage = 1, priorityError = '', priorityMessage = '', priorityFormal = false, prioritySnapshot = {} } = {}) {
  if (!['current', 'overdue', 'focus', 'meetings', 'next'].includes(view)) view = 'current';
  if (view === 'overdue') filter = 'overdue';
  const title = view === 'overdue' ? '逾期事项' : '本周推进';
  const list = filter === 'overdue' ? model.overdue : filter === 'priority' ? model.current.filter(row => row.priority === 'P0') : model.current;
  const pageCount = Math.max(1, Math.ceil(list.length / 8)), activePage = Math.max(1, Math.min(pageCount, Number(page) || 1));
  const visible = list.slice((activePage - 1) * 8, activePage * 8), maxStage = Math.max(1, ...model.stages.map(stage => stage.total)), maxDay = Math.max(1, ...model.days.map(day => day.count));
  const meetingReady = Array.isArray(model.meetingTodos);
  const metrics = [
    ['本周推进', model.current.length, '项', 'tasks', 'navy', 'current'], ['已逾期待推进', model.overdue.length, '项', 'clock', 'rose', 'overdue'],
    ['重点与卡点', model.priorityItems.length, '项', 'flag', 'amber', 'focus'],
    ['上周会议待办', meetingReady ? model.meetingTodos.length : '—', meetingReady ? '项' : '待接入', 'meeting', 'slate', 'meetings'],
    ['下周计划', model.next.length, '项', 'next', 'teal', 'next'],
  ];
  return `<div class="project-weekly"><header class="weekly-page-header"><div><span class="weekly-eyebrow">项目管理 / 每周跟进</span><h2>每周跟进 <small>${short(model.start)} — ${short(model.end)}</small></h2></div><div class="weekly-period"><button type="button" data-weekly-week="-1" aria-label="上一周">‹</button><label><span class="weekly-sr-only">选择跟进周</span><input type="date" data-weekly-anchor value="${model.anchor}"></label><button type="button" data-weekly-week="1" aria-label="下一周">›</button><button type="button" data-weekly-today>本周</button></div></header>
    <div class="weekly-metrics">${metrics.map(([title, value, unit, icon, tone, viewKey]) => `<button type="button" class="weekly-metric ${tone}" data-weekly-view="${viewKey}" aria-pressed="${view === viewKey}" aria-controls="weekly-view-panel"><span class="weekly-metric-icon">${metricIcon(icon)}</span><div><span>${title}</span><strong>${model.ready || ['meeting', 'flag'].includes(icon) ? value : '—'}<small>${unit}</small></strong>${icon === 'flag' && !priorityFormal ? '<em class="priority-card-example">示例</em>' : ''}</div></button>`).join('')}</div>
    ${!model.ready ? `<div class="weekly-load-state" role="status">${connected ? '正在读取项目计划' : '项目计划待接入'}</div>` : ''}
    <div id="weekly-view-panel" class="weekly-view-panel" data-weekly-panel="${view}">
    ${view === 'current' ? `<div class="weekly-chart-grid"><section class="weekly-panel"><header><h3>推进分布</h3><div class="weekly-legend"><span><i class="late"></i>逾期待推进</span><span><i class="planned"></i>本周计划</span></div></header><div class="weekly-stage-chart">${model.stages.map(stage => `<div><span>${esc(stage.name)}</span><div role="img" aria-label="${esc(stage.name)}：逾期${stage.late}项，本周计划${stage.planned}项"><i class="late" style="width:${stage.late / maxStage * 100}%"></i><i class="planned" style="width:${stage.planned / maxStage * 100}%"></i></div><b>${stage.total}</b></div>`).join('') || '<p class="weekly-muted">暂无推进事项</p>'}</div></section>
    <section class="weekly-panel"><header><h3>本周到期节奏</h3><span class="weekly-muted">${model.days.reduce((sum, day) => sum + day.count, 0)} 项</span></header><div class="weekly-day-chart" role="img" aria-label="${model.days.map(day => `周${day.label}${day.count}项`).join('，')}">${model.days.map(day => `<div class="${day.date === model.today ? 'is-today' : ''}"><b>${day.count}</b><i style="height:${day.count ? 12 + day.count / maxDay * 64 : 3}px"></i><span>周${day.label}</span><small>${short(day.date)}</small></div>`).join('')}</div></section></div>` : ''}
    ${['current', 'overdue'].includes(view) ? `<section class="weekly-panel weekly-current" id="weekly-current" tabindex="-1"><header><div><h3>${title} <span>${list.length}</span></h3><p>${short(model.start)} — ${short(model.end)}</p></div>${view === 'current' ? `<div class="weekly-filters" aria-label="本周事项筛选">${[['all', '全部', model.current.length], ['overdue', '已逾期', model.overdue.length], ['priority', 'P0 高优', model.current.filter(row => row.priority === 'P0').length]].map(([key, label, count]) => `<button type="button" data-weekly-filter="${key}" aria-pressed="${filter === key}">${label}<b>${count}</b></button>`).join('')}</div>` : ''}</header>
    <div class="weekly-table-scroll"><table class="weekly-table"><thead><tr><th>推进事项</th><th>责任人</th><th>计划截止</th><th>状态</th><th>最新进展</th><th></th></tr></thead><tbody>${renderRows(visible, model)}</tbody></table></div>
    ${pageCount > 1 ? `<nav class="weekly-pagination" aria-label="本周清单分页"><span>共 ${list.length} 项</span><button type="button" data-weekly-page="${activePage - 1}"${activePage === 1 ? ' disabled' : ''}>上一页</button><span>${activePage} / ${pageCount}</span><button type="button" data-weekly-page="${activePage + 1}"${activePage === pageCount ? ' disabled' : ''}>下一页</button></nav>` : ''}</section>` : ''}
    ${view === 'focus' ? renderWeeklyPriorities(model.priorityItems, { filter: priorityFilter, error: priorityError, message: priorityMessage, query: priorityQuery, page: priorityPage, plans: model.availablePlans, formal: priorityFormal, snapshot: prioritySnapshot }) : ''}
    ${view === 'meetings' ? `<section class="weekly-panel" id="weekly-meetings" tabindex="-1"><header><h3>上周会议待办</h3><span class="weekly-source-tag">${meetingReady ? `${model.meetingTodos.length} 项` : '待接入'}</span></header>${meetingReady ? model.meetingTodos.map(todo => `<article class="weekly-meeting-item"><strong>${esc(todo.title)}</strong><p>${esc(todo.feedback || '')}</p><span>${esc(todo.owner || '')}</span></article>`).join('') || '<p class="weekly-muted">暂无会议待办</p>' : `<div class="weekly-source-empty">${metricIcon('meeting')}<h4>会议待办数据源待接入</h4><p>${short(add(model.start, -7))} — ${short(add(model.start, -1))}</p><div><span>待办事项</span><span>责任人</span><span>最新跟进</span></div></div>`}</section>` : ''}
    ${view === 'next' ? `<section class="weekly-panel" id="weekly-next" tabindex="-1"><header><div><h3>下周计划 <span>${model.next.length}</span></h3><p>${short(model.nextStart)} — ${short(model.nextEnd)}</p></div></header><div class="weekly-next-grid">${[...new Set(model.next.map(row => row.phase))].map(phase => { const items = model.next.filter(row => row.phase === phase); return `<section><h4>${esc(items[0].phaseName)}<span>${items.length} 项</span></h4>${items.slice(0, 3).map(row => `<article><strong>${esc(row.title)}</strong><div><span>${esc(row.owner || '待指定')}</span><time>${short(row.end)}</time></div>${update(row)}</article>`).join('')}${items.length > 3 ? `<details><summary>另有 ${items.length - 3} 项</summary>${items.slice(3).map(row => `<article><strong>${esc(row.title)}</strong>${update(row)}</article>`).join('')}</details>` : ''}</section>`; }).join('') || '<p class="weekly-muted">暂无已排期的下周计划</p>'}</div></section>` : ''}
    </div>
  </div>`;
}
