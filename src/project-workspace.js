import { buildProjectWeekly, renderProjectWeekly } from './project-weekly.js';
import { priorityHistoryHtml } from './weekly-priorities.js';
import { validatePriorityResources, renderPriorityResources } from './priority-resources.js';
import { createPriorityClient } from './priority-live.js';
const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
export const workspacePages = [
  { id: 'overview', label: '项目总览', icon: 'grid' },
  { id: 'weekly', label: '每周跟进', icon: 'calendar' },
  { id: 'monthly', label: '月度回顾', icon: 'chart' },
  { id: 'organization', label: '项目组织', icon: 'people' },
  { id: 'preparation', label: '筹备策划', icon: 'layers', stage: true },
  { id: 'construction', label: '建设协同', icon: 'layers', stage: true },
  { id: 'validation', label: '验证测试', icon: 'check', stage: true },
  { id: 'handover', label: '接维交付', icon: 'layers', stage: true },
];
const drawings = {
  grid: '<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>',
  calendar: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M8 3v4m8-4v4M3 11h18m-12 4h3"/>',
  chart: '<path d="M4 3v17h17M8 15l4-6 4 3 5-8"/>',
  people: '<circle cx="9" cy="7" r="3"/><path d="M3 21v-4a6 6 0 0 1 12 0v4m2-17a3 3 0 0 1 0 6m1 4a5 5 0 0 1 3 4v3"/>',
  layers: '<path d="m12 3 10 5-10 5L2 8Zm-9 10 9 5 9-5m-18 5 9 5 9-5"/>',
  check: '<rect x="3" y="3" width="18" height="18" rx="3"/><path d="m7 12 3 3 7-7"/>',
};
const icon = name => `<svg viewBox="0 0 24 24" aria-hidden="true">${drawings[name] || drawings.layers}</svg>`;
const short = date => `${Number(date.slice(5, 7))}/${Number(date.slice(8))}`;
const add = (date, days) => new Date(Date.parse(`${date}T00:00:00Z`) + days * 86400000).toISOString().slice(0, 10);

export function renderWorkspaceSidebar(active = 'overview') {
  const button = page => `<a href="?section=${page.id}" data-workspace-page="${page.id}" aria-label="${page.label}"${active === page.id ? ' aria-current="page"' : ''} title="${page.label}">${icon(page.icon)}<span>${page.label}</span></a>`;
  return `<aside class="project-sidebar"><div class="workspace-sidebar-inner"><div class="workspace-brand"><span>项目工作台</span><button type="button" data-workspace-collapse aria-label="收起项目导航" aria-expanded="true">‹</button></div><nav aria-label="项目导航"><div class="workspace-nav-group">${workspacePages.filter(page => !page.stage).map(button).join('')}</div><div class="workspace-nav-group"><h2>项目阶段</h2>${workspacePages.filter(page => page.stage).map(button).join('')}</div></nav><footer><span class="workspace-dot"></span>海外业务协作平台</footer></div></aside>`;
}

export function buildWorkspaceDemo(anchor) {
  if (!/^\d{4}-\d\d-\d\d$/.test(anchor || '') || !Number.isFinite(Date.parse(`${anchor}T00:00:00Z`)) || new Date(`${anchor}T00:00:00Z`).toISOString().slice(0, 10) !== anchor) throw Error('Invalid demo date');
  const stageTitles = {
    preparation: ['确认接维范围与交付边界', '锁定关键岗位与人员批次', '完成属地合规事项核验', '评审首年运维预算', '发布项目总体计划'],
    construction: ['核对设备台账与资产编码', '确认供配电系统接口', '复核暖通系统运行边界', '整理施工遗留问题', '确认机房移交条件'],
    validation: ['供配电切换场景验证', '制冷失效场景演练', '消防联动与疏散验证', '监控告警链路核验', '全场景联合演练'],
    handover: ['核齐竣工与运维资料', '完成备品备件交接', '组织班组实操考核', '签认交接问题清单', '确认首月运行安排'],
  };
  const tasks = Object.entries(stageTitles).flatMap(([stage, titles], stageIndex) => titles.map((title, index) => {
    const done = index < [4, 2, 2, 1][stageIndex], active = !done && index < 4;
    return { id: `${stage}-${index}`, code: `${String(stageIndex + 1).padStart(2, '0')}-${index + 1}`, title, stage,
      stageName: workspacePages.find(page => page.id === stage).label,
      owner: ['项目统筹', '专业负责人', '属地协调', '技术负责人', '项目经理'][index], due: add(anchor, (index - 2) * 2 + stageIndex),
      status: done ? '已完成' : active ? '进行中' : '待开展', progress: done ? 100 : active ? [65, 40, 75, 50][stageIndex] : 0,
      completedAt: done ? `${anchor.slice(0, 7)}-${String(2 + (stageIndex * 5 + index) % 24).padStart(2, '0')}` : '',
      priority: index === 2 ? 'P0' : 'P1', note: done ? '结果已核对，交付记录已整理。' : ['已形成初稿，待集中评审。', '正在核对专业接口与现场条件。', '需明确复验时间和关闭标准。', '按计划推进，待收齐确认意见。', '前置条件确认后启动。'][index],
      action: ['组织范围评审并确认责任分工。', '逐项核验现场接口，更新差异清单。', '确认责任人与完成日期，跟进问题销项。', '收齐评审意见，完成版本修订。', '确认启动条件并安排执行窗口。'][index] };
  }));
  const statsOf = rows => ({ total: rows.length, done: rows.filter(row => row.status === '已完成').length, active: rows.filter(row => row.status === '进行中').length, waiting: rows.filter(row => row.status === '待开展').length });
  const stages = Object.keys(stageTitles).map(id => ({ id, label: workspacePages.find(page => page.id === id).label, ...statsOf(tasks.filter(task => task.stage === id)) }));
  const team = [['项目管理', 3, 3], ['电气专业', 8, 6], ['暖通专业', 8, 5], ['监控与弱电', 8, 4]].map(([name, total, confirmed], index) => ({ name, total, confirmed,
    people: Array.from({ length: total }, (_, person) => ({ name: `成员 ${String(index * 8 + person + 1).padStart(2, '0')}`, role: person === 0 ? ['项目经理', '电气主管', '暖通主管', '监控主管'][index] : '专业工程师', confirmed: person < confirmed })) }));
  return { anchor, tasks, stages, stats: statsOf(tasks), team, people: team.flatMap(group => group.people), statsOf };
}

const card = (title, value, suffix = '项', tone = '') => `<article class="ws-metric ${tone}"><span>${title}</span><strong>${value}<small>${suffix}</small></strong></article>`;
const panel = (title, body, aside = '') => `<section class="ws-panel"><header><h3>${title}</h3>${aside}</header>${body}</section>`;
const badge = status => `<span class="ws-badge ${status === '已完成' ? 'green' : status === '进行中' ? 'blue' : 'slate'}">${status}</span>`;
function table(rows, status) {
  const visible = rows.filter(row => !status || row.status === status);
  return `<div class="ws-table-scroll"><table class="ws-table"><thead><tr><th>工作事项</th><th>责任人</th><th>截止日期</th><th>进度</th><th>状态</th></tr></thead><tbody>${visible.map(row => `<tr><td><button type="button" data-workspace-detail="${row.id}"><small>${row.code}</small>${esc(row.title)}</button></td><td>${esc(row.owner)}</td><td>${short(row.due)}</td><td><span class="ws-inline-progress"><i style="width:${row.progress}%"></i></span><small>${row.progress}%</small></td><td>${badge(row.status)}</td></tr>`).join('') || '<tr><td colspan="5" class="ws-empty">当前筛选下暂无事项</td></tr>'}</tbody></table></div>`;
}
const statusSelect = status => `<select data-workspace-status aria-label="筛选工作状态">${[['', '全部状态'], ['已完成', '已完成'], ['进行中', '进行中'], ['待开展', '待开展']].map(([value, label]) => `<option value="${value}"${status === value ? ' selected' : ''}>${label}</option>`).join('')}</select>`;
function bars(stages) {
  return `<div class="ws-stage-bars">${stages.map(stage => `<div><span>${stage.label}</span><div role="img" aria-label="${stage.label}已完成${stage.done}项、进行中${stage.active}项、待开展${stage.waiting}项"><i class="green" style="width:${stage.total ? stage.done / stage.total * 100 : 0}%"></i><i class="blue" style="width:${stage.total ? stage.active / stage.total * 100 : 0}%"></i><i class="slate" style="width:${stage.total ? stage.waiting / stage.total * 100 : 0}%"></i></div><b>${stage.done}/${stage.total}</b></div>`).join('')}</div><div class="ws-legend"><span><i class="green"></i>已完成</span><span><i class="blue"></i>进行中</span><span><i class="slate"></i>待开展</span></div>`;
}
function stagePage(id, model, state) {
  const rows = model.tasks.filter(task => task.stage === id), stats = model.statsOf(rows), rate = Math.round(stats.done / stats.total * 100), testing = id === 'validation';
  const focus = rows.find(row => row.status !== '已完成') || rows.at(-1);
  return `<div class="ws-metrics">${card(testing ? '测试通过率' : '阶段完成率', rate, '%', 'navy')}${card(testing ? '验证场景' : '阶段工作', stats.total)}${card(testing ? '已通过' : '已完成', stats.done, '项', 'green')}${card(testing ? '待验证' : '待推进', stats.total - stats.done, '项', 'amber')}</div>
    <div class="ws-grid-2">${panel(testing ? '验证路径' : '阶段节点', `<ol class="ws-milestone-path">${rows.map((row, index) => `<li class="${row.status === '已完成' ? 'done' : ''}"><b>${index + 1}</b><div><strong>${esc(row.title)}</strong><span>${short(row.due)} · ${row.status}</span></div></li>`).join('')}</ol>`)}${panel(testing ? '问题销项' : '关键卡点', `<div class="ws-callout"><span class="ws-badge amber">待跟进</span><h4>${esc(focus.title)}</h4><p>${esc(focus.note)}</p><div><span>${esc(focus.owner)}</span><time>${short(focus.due)} 截止</time></div></div><div class="ws-checks"><h4>${testing ? '验证前检查' : '推进条件'}</h4><p>✓ 责任范围已确认</p><p>✓ 资料版本已核对</p><p>○ ${testing ? '复验窗口与关闭标准待确认' : '最终意见待收齐'}</p></div>`)}</div>
    ${panel(testing ? '测试清单' : '阶段工作清单', table(rows, state.status), statusSelect(state.status))}`;
}
function monthlyPage(model, state) {
  return `<div class="ws-metrics">${card('月度事项', model.stats.total, '项', 'navy')}${card('已完成', model.stats.done, '项', 'green')}${card('完成率', Math.round(model.stats.done / model.stats.total * 100), '%')}${card('待推进', model.stats.total - model.stats.done, '项', 'amber')}</div>
    <div class="ws-grid-2 wide-left">${panel('月度完成趋势', `<div class="ws-month-bars">${[1, 2, 3, 4].map((week, index) => { const count = model.tasks.filter((task, taskIndex) => task.status === '已完成' && Math.min(3, Math.floor((Number(task.completedAt.slice(8)) - 1) / 7)) === index).length; return `<div><b>${count}</b><i style="height:${count * 25 + 4}px"></i><span>第${week}周</span></div>`; }).join('')}</div>`)}${panel('阶段贡献', bars(model.stages))}</div>
    <div class="ws-grid-2">${panel('本月收获', '<ul class="ws-review-list"><li><b>边界更清楚</b><p>接维范围与专业接口形成统一清单。</p></li><li><b>准备更扎实</b><p>测试场景、人员分工与交付资料逐步归档。</p></li></ul>')}${panel('下月着力点', '<ul class="ws-review-list"><li><b>把问题关掉</b><p>逐项确认复验窗口与关闭标准。</p></li><li><b>把交接做实</b><p>资料、备件、班组能力同步核验。</p></li></ul>')}</div>
    ${panel('月度工作回看', table(model.tasks, state.status), statusSelect(state.status))}`;
}
function organizationPage(model) {
  const confirmed = model.people.filter(person => person.confirmed).length;
  return `<div class="ws-metrics">${card('规划编制', model.people.length, '人', 'navy')}${card('已到岗', confirmed, '人', 'green')}${card('待到岗', model.people.length - confirmed, '人', 'amber')}${card('专业团队', model.team.length, '组')}</div>
    ${panel('项目组织', `<div class="ws-org-tree"><div class="ws-org-lead"><small>项目统筹</small><strong>项目经理</strong><span>专业协同 · 现场交付</span></div><div class="ws-org-branches">${model.team.map(group => `<div><span>${icon('people')}</span><h4>${group.name}</h4><b>${group.confirmed}<small> / ${group.total} 人到岗</small></b></div>`).join('')}</div></div>`)}
    <div class="ws-grid-2">${panel('专业配置', `<div class="ws-team-bars">${model.team.map(group => `<div><span>${group.name}</span><div><i style="width:${group.confirmed / group.total * 100}%"></i></div><b>${group.confirmed}/${group.total}</b></div>`).join('')}</div>`)}${panel('到岗概况', `<div class="ws-arrival"><div class="ws-ring" role="img" aria-label="已到岗${confirmed}人，共${model.people.length}人" style="--rate:${confirmed / model.people.length * 100}%"><span><strong>${Math.round(confirmed / model.people.length * 100)}<small>%</small></strong>到岗率</span></div><div><p><i class="green"></i>已到岗 <b>${confirmed} 人</b></p><p><i class="slate"></i>待到岗 <b>${model.people.length - confirmed} 人</b></p></div></div>`)}</div>
    ${panel('岗位名录', `<div class="ws-team-directory">${model.team.map(group => `<section><h4>${group.name}</h4>${group.people.map(person => `<div><span class="ws-avatar">${esc(person.role.slice(0, 1))}</span><span><b>${esc(person.name)}</b><small>${esc(person.role)}</small></span><em class="${person.confirmed ? 'green' : 'slate'}">${person.confirmed ? '已到岗' : '待到岗'}</em></div>`).join('')}</section>`).join('')}</div>`)}`;
}
export function renderWorkspacePage(id, model, state = {}) {
  if (id === 'weekly') return renderProjectWeekly(buildProjectWeekly(state.plan || null, { anchor: model.anchor, today: state.today || model.anchor }), state);
  const page = workspacePages.find(page => page.id === id && id !== 'overview');
  if (!page) throw Error('Unknown workspace page');
  return `<div class="workspace-preview"><header class="ws-page-heading"><div><span class="ws-eyebrow">${page.stage ? '项目阶段' : '项目管理'}</span><h2>${page.label}<span class="ws-demo-tag">演示数据</span></h2></div><div class="ws-period">${id === 'weekly' ? `<label>跟进周<input type="date" data-workspace-period value="${model.anchor}"></label>` : id === 'monthly' ? `<label>回顾月份<input type="month" data-workspace-period value="${model.anchor.slice(0, 7)}"></label>` : `<span>${model.anchor.replaceAll('-', '.')}</span>`}</div></header>
    ${page.stage ? `<nav class="ws-stage-rail" aria-label="阶段切换">${workspacePages.filter(item => item.stage).map((item, index) => `<button type="button" data-workspace-page="${item.id}"${item.id === id ? ' aria-current="step"' : ''}><b>0${index + 1}</b><span>${item.label}</span></button>`).join('')}</nav>` : ''}
    ${id === 'monthly' ? monthlyPage(model, state) : id === 'organization' ? organizationPage(model) : stagePage(id, model, state)}
    <dialog class="ws-detail-dialog" aria-labelledby="workspaceDetailTitle"><form method="dialog"><button aria-label="关闭事项详情">×</button></form><div data-workspace-detail-body></div></dialog></div>`;
}

export function createProjectWorkspace({ root, today, getToday = () => today, getPlan = () => null, connected = true, onUpdate = () => {}, onOverviewVisible = () => {}, onOpenPlan = () => {} }) {
  let active = new URL(window.location.href).searchParams.get('section') || 'overview';
  if (!workspacePages.some(page => page.id === active)) active = 'overview';
  const periods = { weekly: today, monthly: today };
  const weeklyState = { view: 'current', filter: 'all', page: 1 };
  let resourceDraft = { attachments:[], links:[] }, pendingFiles = new Map(), prioritySaving = false;
  let priorityFilter = 'all', priorityQuery = '', priorityPage = 1, priorityError = '', priorityMessage = '', editingPriorityId = '', priorityRefreshPending = false;
  let editingPriority = null, mutationId = '';
  const priorityScope = new URL(window.location.href).searchParams.get('project') || 'th-001';
  const priorityClient = createPriorityClient(priorityScope, () => refresh());
  const priorityItems = start => priorityClient.snapshot.items.filter(row => row.week === start);
  let followCurrentWeek = true;
  let status = '', model;
  const content = root.querySelector('#workspacePage'), overview = root.querySelector('#projectOverview');
  const showResources = () => { content.querySelector('[data-priority-resource-list]').innerHTML = renderPriorityResources({ ...resourceDraft, attachments:resourceDraft.attachments.map(file => ({ ...file, url:pendingFiles.has(file.id) ? undefined : editingPriority?.attachments.find(entry => entry.id === file.id)?.url })) }, pendingFiles); };
  const refresh = () => {
    if (content.querySelector?.('.priority-dialog[open]')) { priorityRefreshPending = true; return; }
    priorityRefreshPending = false;
    const revealingOverview = active === 'overview' && overview.hidden;
    overview.hidden = active !== 'overview'; content.hidden = active === 'overview';
    root.querySelector('.project-command').hidden = active !== 'overview';
    root.querySelectorAll('.project-sidebar [data-workspace-page]').forEach(link => {
      const url = new URL(window.location.href); url.searchParams.set('section', link.dataset.workspacePage); link.href = url.href;
      if (link.dataset.workspacePage === active) link.setAttribute('aria-current', 'page'); else link.removeAttribute('aria-current');
    });
    if (active === 'weekly') {
      if (followCurrentWeek) periods.weekly = getToday();
      const weekly = buildProjectWeekly(getPlan(), { anchor: periods.weekly, today: getToday() });
      weekly.priorityItems = priorityItems(weekly.start); weekly.availablePlans = priorityClient.snapshot.plans;
      content.innerHTML = renderProjectWeekly(weekly, { ...weeklyState, connected, priorityFilter, priorityQuery, priorityPage, priorityError: priorityError || priorityClient.snapshot.error, priorityMessage, priorityFormal: true, prioritySnapshot: priorityClient.snapshot });
    }
    else if (active !== 'overview') { model = buildWorkspaceDemo(periods[active] || today); content.innerHTML = renderWorkspacePage(active, model, { status }); }
    if (revealingOverview) onOverviewVisible();
  };
  root.addEventListener('click', async event => {
    const download = event.target.closest('[data-priority-download]');
    if (download) {
      const message = content.querySelector('[data-priority-resource-status]');
      try {
        const id = download.dataset.priorityDownload, info = resourceDraft.attachments.find(file => file.id === id);
        if (!info) throw Error('附件不存在。');
        const blob = pendingFiles.get(id), url = blob ? URL.createObjectURL(blob) : editingPriority?.attachments.find(file => file.id === id)?.url;
        if (!url) throw Error('附件尚未上传完成，请稍后下载。');
        const link = document.createElement('a'); link.href = url; link.download = info.name; document.body.append(link); link.click(); link.remove();
        if (blob) setTimeout(() => URL.revokeObjectURL(url), 60000); message.textContent = '';
      } catch (error) { message.textContent = error.message || '附件读取失败，请重试。'; }
      return;
    }
    if (event.target.closest('[data-priority-link-add]')) {
      const title = content.querySelector('[data-priority-link-title]'), url = content.querySelector('[data-priority-link-url]'), message = content.querySelector('[data-priority-resource-status]');
      try { resourceDraft = validatePriorityResources({ ...resourceDraft, links:[...resourceDraft.links, { title:title.value, url:url.value }] }); title.value = ''; url.value = ''; message.textContent = ''; showResources(); }
      catch (error) { message.textContent = error.message; }
      return;
    }
    const removeFile = event.target.closest('[data-priority-file-remove]'), removeLink = event.target.closest('[data-priority-link-remove]');
    if (removeFile || removeLink) {
      if (prioritySaving) return;
      if (removeFile) { resourceDraft.attachments = resourceDraft.attachments.filter(file => file.id !== removeFile.dataset.priorityFileRemove); pendingFiles.delete(removeFile.dataset.priorityFileRemove); }
      else resourceDraft.links.splice(Number(removeLink.dataset.priorityLinkRemove), 1);
      showResources(); return;
    }
    if (event.target.closest('[data-priority-refresh]')) { priorityError = ''; await priorityClient.refresh(true); return; }
    const retry = event.target.closest('[data-priority-retry]'), discard = event.target.closest('[data-priority-discard]');
    if (retry || discard) { try { if (retry) await priorityClient.retry(retry.dataset.priorityRetry); else await priorityClient.discard(discard.dataset.priorityDiscard); } catch (error) { priorityError = error.message; refresh(); } return; }
    const priorityChoice = event.target.closest('[data-priority-filter]');
    if (priorityChoice) { priorityFilter = priorityChoice.dataset.priorityFilter; priorityPage = 1; refresh(); if (event.detail === 0) content.querySelector(`[data-priority-filter="${priorityFilter}"]`)?.focus({ preventScroll: true }); return; }
    const priorityPageButton = event.target.closest('[data-priority-page]');
    if (priorityPageButton) { priorityPage = Number(priorityPageButton.dataset.priorityPage); refresh(); content.querySelector('.priority-pagination button:not(:disabled)')?.focus({ preventScroll: true }); return; }
    const relatedPlan = event.target.closest('[data-priority-plan]');
    if (relatedPlan) { onOpenPlan(relatedPlan.dataset.priorityPlan, relatedPlan); return; }
    const priorityNew = event.target.closest('[data-priority-new]'), priorityEdit = event.target.closest('[data-priority-edit], [data-priority-resources]');
    if (priorityNew || priorityEdit) {
      const weekly = buildProjectWeekly(null, { anchor: periods.weekly, today: getToday() });
      if (!priorityClient.snapshot.ready) { priorityError = priorityClient.snapshot.error || '正在读取事项字段，请稍后再试。'; priorityClient.refresh(true); refresh(); return; }
      const item = priorityEdit ? priorityItems(weekly.start).find(row => row.id === (priorityEdit.dataset.priorityEdit || priorityEdit.dataset.priorityResources)) : null;
      if (priorityEdit && !item) return;
      editingPriority = item; editingPriorityId = item?.id || ''; mutationId = crypto.randomUUID();
      const dialog = content.querySelector('.priority-dialog'), form = dialog.querySelector('form');
      form.reset(); form.querySelectorAll('input,select,textarea,button').forEach(control => { control.disabled = false; }); dialog.querySelector('h3').textContent = item ? '跟进事项' : '新增事项';
      for (const name of ['title', 'kind', 'urgency', 'status', 'owner', 'due', 'impact', 'description', 'progress', 'next']) if (item) { const field = form.elements.namedItem(name); if (name === 'impact' && field.multiple) [...field.options].forEach(option => { option.selected = item.impact.split('、').includes(option.value); }); else field.value = item[name]; }
      form.querySelectorAll('[name="planIds"]').forEach(input => { input.checked = !!item?.planIds?.includes(input.value); });
      form.querySelector('[data-priority-plan-count]').textContent = `已选 ${form.querySelectorAll('[name="planIds"]:checked').length} 项`;
      dialog.querySelector('[data-priority-history]').innerHTML = priorityHistoryHtml(item?.history || []);
      dialog.querySelector('[data-priority-form-status]').textContent = '';
      resourceDraft = validatePriorityResources(item || {}); pendingFiles = new Map(); showResources();
      dialog.querySelector('[data-priority-resource-status]').textContent = '';
      if (item?.sync && item.sync.status !== 'success') {
        dialog.querySelector('[data-priority-form-status]').textContent = item.sync.error || '此事项正在同步；附件上传失败时可重新选择原文件后重传。';
        form.querySelectorAll('[name],[data-priority-link-title],[data-priority-link-url],[data-priority-link-add],[data-priority-file-remove],[data-priority-link-remove]').forEach(control => { control.disabled = true; });
        form.querySelector('[type="submit"]').textContent = '重传附件';
      } else form.querySelector('[type="submit"]').textContent = '保存';
      dialog.showModal();
      if (priorityEdit?.hasAttribute('data-priority-resources')) dialog.querySelector('.priority-resources').scrollIntoView({ block:'center' });
      else form.elements.namedItem('title').focus();
      return;
    }
    if (event.target.closest('[data-priority-close]')) { if (prioritySaving) return; pendingFiles.clear(); content.querySelector('.priority-dialog')?.close(); if (priorityRefreshPending) refresh(); return; }
    const update = event.target.closest('[data-weekly-update]');
    if (update) { onUpdate(update.dataset.weeklyUpdate, update); return; }
    const week = event.target.closest('[data-weekly-week]'), thisWeek = event.target.closest('[data-weekly-today]');
    const filter = event.target.closest('[data-weekly-filter]'), page = event.target.closest('[data-weekly-page]');
    const view = event.target.closest('[data-weekly-view]');
    if (view) {
      weeklyState.view = view.dataset.weeklyView; weeklyState.filter = 'all'; weeklyState.page = 1;
      refresh(); content.querySelector(`[data-weekly-view="${weeklyState.view}"]`)?.focus({ preventScroll: true }); return;
    }
    if (week || thisWeek || filter || page) {
      if (week || thisWeek) { followCurrentWeek = !!thisWeek; periods.weekly = thisWeek ? getToday() : add(periods.weekly, Number(week.dataset.weeklyWeek) * 7); weeklyState.page = 1; }
      if (filter) { weeklyState.filter = filter.dataset.weeklyFilter; weeklyState.page = 1; }
      if (page) weeklyState.page = Number(page.dataset.weeklyPage);
      refresh();
      const selector = filter ? `[data-weekly-filter="${weeklyState.filter}"]` : page ? '.weekly-pagination button:not(:disabled)' : '[data-weekly-anchor]';
      content.querySelector(selector)?.focus({ preventScroll: true });
      return;
    }
    const collapse = event.target.closest('[data-workspace-collapse]');
    if (collapse) { const collapsed = root.classList.toggle('is-nav-collapsed'); collapse.setAttribute('aria-expanded', String(!collapsed)); collapse.setAttribute('aria-label', collapsed ? '展开项目导航' : '收起项目导航'); collapse.textContent = collapsed ? '›' : '‹'; return; }
    const nav = event.target.closest('[data-workspace-page]');
    if (nav) {
      event.preventDefault(); active = nav.dataset.workspacePage; status = '';
      const url = new URL(window.location.href); active === 'overview' ? url.searchParams.delete('section') : url.searchParams.set('section', active);
      window.history.replaceState(null, '', url); refresh(); window.scrollTo({ top: 0, behavior: 'auto' });
      (active === 'overview' ? overview : content).focus({ preventScroll: true });
      return;
    }
    const detail = event.target.closest('[data-workspace-detail]');
    if (detail) {
      const task = model?.tasks.find(task => task.id === detail.dataset.workspaceDetail); if (!task) return;
      const dialog = content.querySelector('.ws-detail-dialog');
      dialog.querySelector('[data-workspace-detail-body]').innerHTML = `<span class="ws-demo-tag">演示数据</span><h2 id="workspaceDetailTitle">${esc(task.title)}</h2><div class="ws-detail-meta">${badge(task.status)}<span>${esc(task.owner)}</span><time>${short(task.due)} 截止</time></div><h3>最新跟进</h3><p>${esc(task.note)}</p><h3>下一步</h3><p>${esc(task.action)}</p>`;
      dialog.showModal();
    }
  });
  content.addEventListener('submit', async event => {
    if (!event.target.matches('.priority-form')) return;
    event.preventDefault();
    const form = event.target, status = form.querySelector('[data-priority-form-status]'), submit = form.querySelector('[type="submit"]');
    if (prioritySaving) return;
    prioritySaving = true; submit.disabled = true; submit.textContent = '保存中…';
    const controls = [...form.querySelectorAll('input,select,textarea,button')];
    const disabledBefore = controls.map(control => control === submit ? false : control.disabled);
    try {
      const weekly = buildProjectWeekly(null, { anchor: periods.weekly, today: getToday() });
      const values = Object.fromEntries(new FormData(form));
      values.planIds = new FormData(form).getAll('planIds');
      Object.assign(values, resourceDraft);
      if (form.querySelector('[data-priority-link-url]').value.trim()) throw Error('请先点击“添加链接”，再保存事项。');
      values.impact = new FormData(form).getAll('impact').join('、');
      controls.forEach(control => { control.disabled = true; });
      if (editingPriority?.sync && editingPriority.sync.status !== 'success') {
        if (!pendingFiles.size) throw Error('此事项尚在同步，请使用清单中的重试操作。');
        await priorityClient.retry(editingPriority.sync.id, pendingFiles);
      } else await priorityClient.save({ project:priorityScope, week:weekly.start, id:editingPriorityId || undefined, version:editingPriority?.version, clientMutationId:mutationId, values }, pendingFiles);
      pendingFiles.clear(); priorityFilter = 'all'; priorityQuery = ''; priorityPage = 1; priorityError = ''; priorityMessage = '已保存，后台同步中';
      content.querySelector('.priority-dialog').close(); refresh(); content.querySelector('[data-priority-new]')?.focus({ preventScroll: true });
    } catch (error) { status.textContent = error?.name === 'QuotaExceededError' ? '浏览器空间不足，请移除部分附件后重试。' : error instanceof Error ? error.message : '事项保存失败，请重试。'; }
    finally { prioritySaving = false; controls.forEach((control,index) => { control.disabled = disabledBefore[index]; }); submit.textContent = editingPriority?.sync && editingPriority.sync.status !== 'success' ? '重传附件' : '保存'; }
  });
  content.addEventListener('cancel', event => {
    if (!event.target.matches('.priority-dialog')) return;
    event.preventDefault(); if (prioritySaving) return; pendingFiles.clear(); event.target.close(); if (priorityRefreshPending) refresh();
  }, true);
  content.addEventListener('change', event => {
    if (event.target.matches('[data-priority-files]')) {
      const message = content.querySelector('[data-priority-resource-status]');
      try {
        const selected = [...event.target.files].map(file => ({ file, id:editingPriority?.sync?.uploads?.find(upload => !upload.ready && upload.name === file.name && upload.size === file.size)?.id || crypto.randomUUID(), name:file.name, size:file.size }));
        if (editingPriority?.sync && editingPriority.sync.status !== 'success' && selected.some(file => !resourceDraft.attachments.some(saved => saved.id === file.id))) throw Error('事项正在同步；这里只能重传原附件，请完成同步后再添加其他文件。');
        const draft = validatePriorityResources({ ...resourceDraft, attachments:[...resourceDraft.attachments.filter(f => !selected.some(v => v.id === f.id)), ...selected] });
        selected.forEach(({ id, file }) => pendingFiles.set(id, file)); resourceDraft = draft; showResources(); message.textContent = '已添加，保存事项后保留。';
      } catch (error) { message.textContent = error.message; }
      event.target.value = ''; return;
    }
    if (event.target.matches('[name="planIds"]')) { content.querySelector('[data-priority-plan-count]').textContent = `已选 ${content.querySelectorAll('[name="planIds"]:checked').length} 项`; return; }
    if (event.target.matches('[data-weekly-anchor]') && event.target.value && event.target.validity.valid) { followCurrentWeek = false; periods.weekly = event.target.value; weeklyState.page = 1; refresh(); content.querySelector('[data-weekly-anchor]')?.focus(); return; }
    if (event.target.matches('[data-workspace-status]')) status = event.target.value;
    else if (event.target.matches('[data-workspace-period]') && event.target.value && event.target.validity.valid) periods[active] = event.target.value.length === 7 ? `${event.target.value}-15` : event.target.value;
    else return;
    const selector = event.target.matches('[data-workspace-status]') ? '[data-workspace-status]' : '[data-workspace-period]'; refresh(); content.querySelector(selector)?.focus();
  });
  content.addEventListener('input', event => {
    if (event.target.matches('[data-priority-plan-search]')) {
      const query = event.target.value.trim().toLocaleLowerCase();
      content.querySelectorAll('.priority-plan-option').forEach(option => { option.hidden = !option.textContent.toLocaleLowerCase().includes(query); }); return;
    }
    if (!event.target.matches('[data-priority-search]')) return;
    const selection = [event.target.selectionStart, event.target.selectionEnd];
    priorityQuery = event.target.value; priorityPage = 1; refresh();
    const search = content.querySelector('[data-priority-search]'); search?.focus({ preventScroll: true }); search?.setSelectionRange(...selection);
  });
  refresh();
  if (typeof window.fetch === 'function') priorityClient.start();
  return { refresh, destroy: () => priorityClient.close() };
}
