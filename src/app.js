import { renderPlatformHeader } from './platform-navigation.js';
import { legalHolidays as defaultLegalHolidays } from './data.js';
import { createTeamOrganization } from './team-organization.js';
import { createTaskEditor } from './task-editor.js';
import { todayMarker, centeredTimelineScroll } from './gantt-today.js';
import { attachGanttPan } from './gantt-pan.js';

const root = document.querySelector('#app');
const today = new Date();
today.setHours(0, 0, 0, 0);
let ganttPlan = null;
let legalHolidays = defaultLegalHolidays;
let milestones = [];
let phases = [];
let planState = 'idle';
let lastSyncedLabel = '';
let detailReturnFocus = null;
let organizationChartReturnFocus = null;
let teamOrganization = null;
let taskEditor = null;
let ganttTodayTimer = null;
let calendarCursor = new Date(today.getFullYear(), today.getMonth(), 1);
let selectedCalendarDate = dateKey(today);
let calendarModalOpen = false;
let detailModalOpen = false;
let planSyncing = false;
let planStatusDay = dateKey(today);
const ganttCollapsedGroups = new Set(['amber', 'green', 'indigo']);
const completionIcon = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m5 12 4 4L19 6"></path></svg>';
const projectCatalog = [
  { id: 'th-001', country: 'TH', countryName: '泰国', code: 'TH-001', name: 'Araya / Rojana', connected: true },
  { id: 'th-002', country: 'TH', countryName: '泰国', code: 'TH-002', name: 'TH-002', connected: false },
  { id: 'my-001', country: 'MY', countryName: '马来西亚', code: 'MY-001', name: 'MY-001', connected: false },
  { id: 'my-002', country: 'MY', countryName: '马来西亚', code: 'MY-002', name: 'MY-002', connected: false },
];
let activeProject = projectCatalog[0];
let planRequestId = 0;
let planRequestController = null;
let planCacheNotice = '';
let projectPickerOpen = false;

function planCacheKey() {
  return `overseas-project-plan:v1:${activeProject.id}:tblSpSvqS2FMpHks`;
}

function isValidPlanCache(data) {
  const plan = data?.ganttPlan;
  return activeProject.connected && plan?.source?.tableId === 'tblSpSvqS2FMpHks'
    && plan.source.baseUrl === 'https://vnet.feishu.cn/base/CID8b8V7CaCtKesWGFKcHTdqnlc?table=tblSpSvqS2FMpHks'
    && typeof data.syncedAtLabel === 'string'
    && Array.isArray(data.phases) && Array.isArray(data.milestones)
    && Array.isArray(plan.phases) && Array.isArray(plan.keyRows) && Array.isArray(plan.riskRadar)
    && ['totalTasks', 'completedTasks', 'p0Tasks', 'milestoneCount', 'durationDays'].every(key => Number.isFinite(plan[key]))
    && data.phases.every(phase => typeof phase.title === 'string' && Array.isArray(phase.tasks)
      && ['total', 'completed', 'remaining', 'progress'].every(key => Number.isFinite(phase[key])))
    && plan.keyRows.every(row => row && ['task', 'phase', 'milestone'].includes(row.type)
      && ['title', 'code', 'start', 'end', 'phase', 'priority', 'status'].every(key => typeof row[key] === 'string'));
}

function restorePlanCache() {
  if (!activeProject.connected) return false;
  try {
    const cached = JSON.parse(window.localStorage.getItem(planCacheKey()));
    if (cached?.version !== 1 || !isValidPlanCache(cached.data)) return false;
    assignPlanData(cached.data);
    planState = 'ready';
    return true;
  } catch {
    planCacheNotice = '本机快照不可用，正在重新读取飞书。';
    return false;
  }
}

function savePlanCache(data) {
  if (!isValidPlanCache(data)) return false;
  try {
    window.localStorage.setItem(planCacheKey(), JSON.stringify({ version: 1, data }));
    planCacheNotice = '';
    return true;
  } catch {
    planCacheNotice = '数据已同步，但本机无法保存快照，下次打开时需要重新加载。';
    return false;
  }
}

function renderProjectPicker() {
  const groups = ['TH', 'MY'].map(country => {
    const projects = projectCatalog.filter(project => project.country === country);
    return `<div class="project-picker-group" role="group" aria-labelledby="project-group-${country}">
      <h3 id="project-group-${country}">${projects[0].countryName}<small>${projects.length} 个项目</small></h3>
      ${projects.map(project => `<button class="project-picker-option" type="button" role="menuitemradio" aria-checked="${project.id === activeProject.id}" tabindex="-1" data-project-id="${project.id}">
        <i class="project-country-code">${country}</i>
        <div><strong>${project.name}</strong><small>${project.code}${project.connected ? ' · 共享团队计划' : ' · 待接入任务表'}</small></div>
        ${project.id === activeProject.id ? `<b class="project-picker-check">${completionIcon}</b>` : ''}
      </button>`).join('')}
    </div>`;
  }).join('');
  return `<div class="project-picker" data-open="false">
    <button class="project-picker-trigger" id="projectPickerTrigger" type="button" aria-label="切换项目，当前${activeProject.countryName} ${activeProject.name}" aria-haspopup="menu" aria-expanded="false" aria-controls="projectPickerMenu"><b>${activeProject.countryName} · ${activeProject.name}</b>${icon('chevron-right')}</button>
    <div class="project-picker-menu" id="projectPickerMenu" role="menu" aria-label="切换海外项目" hidden>
      <div class="project-picker-heading"><strong>切换项目</strong><small>按国家浏览项目工作区</small></div>${groups}
    </div>
  </div>`;
}

function setProjectPickerOpen(open, returnFocus = false) {
  projectPickerOpen = open;
  const trigger = document.querySelector('#projectPickerTrigger');
  const menu = document.querySelector('#projectPickerMenu');
  if (!trigger || !menu) return;
  trigger.setAttribute('aria-expanded', String(open));
  trigger.closest('.project-picker').dataset.open = String(open);
  menu.hidden = !open;
  if (open) menu.querySelector('[aria-checked="true"]')?.focus();
  else if (returnFocus) trigger.focus();
}

function handleProjectPickerOutside(event) {
  if (projectPickerOpen && !event.target.closest('.project-picker')) setProjectPickerOpen(false);
}

function handleProjectPickerKeydown(event) {
  if (!projectPickerOpen) {
    if (event.target.id === 'projectPickerTrigger' && ['ArrowDown', 'ArrowUp'].includes(event.key)) {
      event.preventDefault();
      setProjectPickerOpen(true);
    }
    return;
  }
  if (event.key === 'Escape') {
    event.preventDefault();
    setProjectPickerOpen(false, true);
    return;
  }
  if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return;
  event.preventDefault();
  const items = [...document.querySelectorAll('#projectPickerMenu [data-project-id]')];
  const current = items.indexOf(document.activeElement);
  const next = event.key === 'Home' ? 0 : event.key === 'End' ? items.length - 1
    : (current + (event.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length;
  items[next]?.focus();
}

function switchProject(id) {
  const project = projectCatalog.find(item => item.id === id);
  if (!project || project.id === activeProject.id) return;
  closeCalendarModal();
  closeDetailModal();
  resetProjectState(project);
  const url = new URL(window.location.href);
  url.searchParams.set('project', project.id);
  window.history.replaceState(null, '', url);
  restorePlanCache();
  renderShell();
  renderGanttBoard();
  renderCompactPhases();
  renderCalendar();
  document.querySelector('.page').classList.add('project-transition');
  document.querySelector('#projectPickerTrigger').focus();
  if (project.connected) syncBitableData();
}

function resetProjectState(project) {
  planRequestId++;
  planRequestController?.abort();
  planSyncing = false;
  activeProject = project;
  ganttPlan = null;
  phases = [];
  milestones = [];
  legalHolidays = defaultLegalHolidays;
  lastSyncedLabel = '';
  planCacheNotice = '';
  planState = 'idle';
  projectPickerOpen = false;
}

function renderKpiSkeletons() {
  return Array.from({ length: 5 }, () => '<article class="kpi-card kpi-skeleton" aria-hidden="true"><i class="skeleton-block skeleton-icon"></i><div><i class="skeleton-block skeleton-label"></i><i class="skeleton-block skeleton-value"></i></div></article>').join('');
}

function renderPlanSkeleton() {
  return `<div class="plan-skeleton" role="status" aria-label="正在加载项目计划"><div class="skeleton-toolbar"><i class="skeleton-block"></i><span>正在加载项目计划</span></div><div class="skeleton-overview">${Array.from({ length: 4 }, () => '<div><i class="skeleton-block skeleton-label"></i><i class="skeleton-block skeleton-value"></i><i class="skeleton-block"></i><i class="skeleton-block"></i></div>').join('')}</div><div class="skeleton-timeline">${Array.from({ length: 6 }, (_, index) => `<div><i class="skeleton-block"></i><i class="skeleton-block" style="width:${35 + index * 7}%"></i></div>`).join('')}</div></div>`;
}

const phaseCardCopy = {
  '01': {
    title: '合规筹备',
    subtitle: '资质申请',
    iconName: 'shield',
    focus: 'BOI、HRBP、外派材料对齐。',
    current: '劳务外包锁定',
    actions: ['BOI 配额', '合同社保'],
  },
  '02': {
    title: '核心管理',
    subtitle: '骨干招聘',
    iconName: 'users',
    focus: '中泰骨干同步锁岗。',
    current: '猎头渠道启动',
    actions: ['骨干匹配', '签证材料'],
  },
  '03': {
    title: '基层招聘',
    subtitle: '入职培训',
    iconName: 'route',
    focus: '7x24 班组补齐并首训。',
    current: '院校劳务渠道',
    actions: ['宿舍通勤', '入职台账'],
  },
};

function getPhaseCardCopy(phase) {
  const visual = phaseCardCopy[phase.no] || {};
  const actions = phase.tasks?.slice(1, 3) || [];
  return {
    title: phase.short || phase.title,
    subtitle: phase.title,
    iconName: visual.iconName || 'route',
    focus: phase.desc,
    current: phase.tasks?.[0] || phase.deliverable || phase.title,
    actions,
  };
}

function summarizeText(value, maxLength = 18) {
  const text = String(value || '').replace(/\s+/g, ' ').trim();
  return text.length > maxLength ? `${text.slice(0, maxLength)}...` : text;
}

function summarizeTaskTitle(value) {
  const text = String(value || '').replace(/\s+/g, ' ').trim();
  const normalized = text
    .replace(/^调研并/, '')
    .replace(/^明确首个项目/, '')
    .replace(/^制定/, '')
    .replace(/^建立/, '')
    .replace(/^完成/, '')
    .replace(/^核验/, '');
  return summarizeText(normalized || text, 12);
}

function summarizeAction(value) {
  return summarizeText(value, 6);
}

function icon(name) {
  return `<svg><use href="#icon-${name}"></use></svg>`;
}

function escapeAttribute(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function toDate(value) {
  return new Date(`${value}T00:00:00`);
}

function sameDay(left, right) {
  return (
    left.getFullYear() === right.getFullYear() &&
    left.getMonth() === right.getMonth() &&
    left.getDate() === right.getDate()
  );
}

function formatCompact(date) {
  if (Number.isNaN(date.getTime())) return '未排期';
  return `${date.getMonth() + 1}/${date.getDate()}`;
}

function formatMonth(date) {
  return `${date.getFullYear()}年${date.getMonth() + 1}月`;
}

function dateKey(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(
    2,
    '0',
  )}-${String(date.getDate()).padStart(2, '0')}`;
}

function daysBetween(start, end) {
  return Math.round((toDate(end) - toDate(start)) / 86400000);
}

function formatPeriod(start, end) {
  if (!start || !end) return start || end ? `${start || '未填开始'} - ${end || '未填截止'}` : '未排期';
  return `${formatCompact(toDate(start))} - ${formatCompact(toDate(end))}`;
}

function formatTightPeriod(start, end) {
  return `${formatCompact(toDate(start))}-${formatCompact(toDate(end))}`;
}

function getOverdueRows() {
  return (ganttPlan?.keyRows || [])
    .filter((row) => row.type !== 'phase')
    .filter((row) => row.end)
    .filter((row) => row.status !== '已完成' && row.progress < 100)
    .filter((row) => toDate(row.end) < today)
    .sort((left, right) => toDate(left.end) - toDate(right.end));
}

function getGanttMonths() {
  if (!ganttPlan.rangeStart || !ganttPlan.rangeEnd) return [{ label: '未排期', days: 30 }];
  const months = [];
  const cursor = toDate(ganttPlan.rangeStart);
  cursor.setDate(1);
  const end = toDate(ganttPlan.rangeEnd);
  while (cursor <= end) {
    months.push({
      label: `${cursor.getFullYear()}.${String(cursor.getMonth() + 1).padStart(2, '0')}`,
      days: new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0).getDate(),
    });
    cursor.setMonth(cursor.getMonth() + 1);
  }
  return months;
}

function getGanttWeeks() {
  return getGanttMonths().flatMap(month => Array.from({ length: Math.ceil(month.days / 7) }, (_, i) => ({
    label: month.label === '未排期' ? '—' : String(i * 7 + 1).padStart(2, '0'),
    days: Math.min(7, month.days - i * 7),
  })));
}

function ganttPosition(row) {
  if (!row.start || !row.end || !ganttPlan.rangeStart || !ganttPlan.rangeEnd) return { left: 0, width: 0 };
  const startMonth = toDate(ganttPlan.rangeStart);
  const endMonth = toDate(ganttPlan.rangeEnd);
  const timelineStart = dateKey(new Date(startMonth.getFullYear(), startMonth.getMonth(), 1));
  const timelineEnd = dateKey(new Date(endMonth.getFullYear(), endMonth.getMonth() + 1, 0));
  const totalDays = daysBetween(timelineStart, timelineEnd) + 1;
  const startOffset = Math.max(0, daysBetween(timelineStart, row.start));
  const endOffset = Math.min(totalDays, daysBetween(timelineStart, row.end) + 1);
  const width = row.type === 'milestone' ? 0 : Math.max(0, ((endOffset - startOffset) / totalDays) * 100);
  return {
    left: Math.min(100, (startOffset / totalDays) * 100),
    width,
  };
}

function getGanttFilterState() {
  return {
    keyword: document.querySelector('#ganttSearch')?.value.trim().toLowerCase() || '',
    priority: document.querySelector('#ganttPriority')?.value || 'all',
  };
}

function ganttRowMatches(row, filters) {
  const matchesKeyword = [row.code, row.title, row.status, row.priority]
    .join(' ')
    .toLowerCase()
    .includes(filters.keyword);
  const matchesPriority =
    filters.priority === 'all' ||
    row.priority === filters.priority ||
    (filters.priority === 'milestone' && row.type === 'milestone');
  return matchesKeyword && matchesPriority;
}

function getGanttGroups() {
  const filters = getGanttFilterState();
  const hasFilter = Boolean(filters.keyword) || filters.priority !== 'all';

  return ganttPlan.phases
    .map((phase) => {
      const rows = ganttPlan.keyRows.filter((row) => row.phase === phase.tone);
      const header = rows.find((row) => row.type === 'phase');
      const children = rows.filter((row) => row.type !== 'phase');
      const visibleChildren = hasFilter ? children.filter((row) => ganttRowMatches(row, filters)) : children;
      const shouldShowHeader = header && (!hasFilter || ganttRowMatches(header, filters) || visibleChildren.length > 0);

      if (!shouldShowHeader) return null;

      return {
        phase,
        header,
        children: visibleChildren,
        totalChildren: children.length,
        collapsed: !hasFilter && ganttCollapsedGroups.has(phase.tone),
        hasFilter,
      };
    })
    .filter(Boolean);
}

function renderShell() {
  root.innerHTML = `
    ${renderPlatformHeader('projects')}
    <div class="page">
      <header class="hero project-command">
        <div class="hero-inner project-command-inner">
          <div class="hero-title">
            <h1>海外项目管理</h1>
            <div class="project-scope">团队组建与接维 ${renderProjectPicker()}</div>
          </div>
          <div class="hero-tools"><span class="update-time">${activeProject.connected ? lastSyncedLabel ? `上次同步 ${escapeHtml(lastSyncedLabel)}` : '正在加载项目计划' : `${activeProject.code} · 待接入`}</span><button class="refresh" type="button"${activeProject.connected ? '' : ' disabled'}>${icon('refresh')} ${activeProject.connected ? '手动同步' : '待接入'}</button></div>
        </div>
      </header>

      <main>
        <div id="planSyncStatus" class="plan-sync-status" role="status" hidden></div>
        <section class="kpi-grid" aria-label="项目指标"${activeProject.connected ? '' : ' hidden'}>
          ${ganttPlan ? renderKpiCards() : renderKpiSkeletons()}
        </section>

        <section class="gantt-shell" id="ganttBoard" aria-label="项目甘特计划总览"></section>
      </main>

      <div class="detail-modal" id="detailModal" hidden>
        <div class="detail-modal-backdrop" data-detail-close></div>
        <section class="detail-modal-panel" role="dialog" aria-modal="true" aria-labelledby="detailModalTitle">
          <button class="detail-modal-close" type="button" data-detail-close aria-label="关闭卡片详情">关闭</button>
          <div class="detail-modal-body" id="detailModalBody"></div>
        </section>
      </div>
      <dialog class="organization-chart-dialog" id="organizationChartDialog" aria-labelledby="organizationChartTitle">
        <header class="organization-chart-toolbar">
          <h3 id="organizationChartTitle">泰国项目组织架构与人员进场计划</h3>
          <button type="button" class="diagram-tool diagram-sync" id="organizationChartSync" aria-label="同步人员" title="同步人员">${icon('refresh')}</button>
          <button type="button" class="diagram-tool diagram-close" data-organization-chart-close aria-label="关闭组织架构图" title="关闭" autofocus><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 6 12 12M6 18 18 6"/></svg></button>
        </header>
        <div class="organization-chart-canvas" id="organizationChartCanvas" data-state="idle">
          <div class="organization-chart-status" role="status">
            <span id="organizationChartStatus"></span>
            <button type="button" id="organizationChartRetry" hidden>重试</button>
          </div>
          <img id="organizationChartImage" alt="世纪互联VNET泰国项目组织架构与人员进场计划，含岗位人数、需求到岗日期及用工占比" width="2000" height="1400" hidden>
        </div>
      </dialog>
    </div>
  `;

  document.querySelector('.refresh').addEventListener('click', syncBitableData);
  const syncStamp = document.querySelector('.update-time');
  if (activeProject.connected) {
    syncStamp.setAttribute('role', 'button'); syncStamp.setAttribute('tabindex', '0'); syncStamp.setAttribute('aria-label', '重新计算并同步任务状态');
    syncStamp.addEventListener('click', () => syncBitableData(true));
    syncStamp.addEventListener('keydown', event => { if (['Enter', ' '].includes(event.key)) { event.preventDefault(); syncBitableData(true); } });
  }
  document.querySelector('#projectPickerTrigger').addEventListener('click', () => setProjectPickerOpen(!projectPickerOpen));
  document.querySelector('#projectPickerMenu').addEventListener('click', event => {
    const item = event.target.closest('[data-project-id]');
    if (!item) return;
    setProjectPickerOpen(false, true);
    switchProject(item.dataset.projectId);
  });
  document.addEventListener('pointerdown', handleProjectPickerOutside);
  document.addEventListener('focusin', handleProjectPickerOutside);
  document.addEventListener('keydown', handleProjectPickerKeydown);
  document.querySelector('.page').addEventListener('click', handleDetailCardActivation);
  document.querySelector('.page').addEventListener('keydown', handleDetailCardActivation);
  document.querySelector('#detailModal').addEventListener('click', (event) => {
    const chartTrigger = event.target.closest('[data-organization-chart]');
    if (chartTrigger) { openOrganizationChart(chartTrigger); return; }
    if (!event.target.closest('[data-detail-close]')) return;
    closeDetailModal();
  });
  setupOrganizationChart();
  document.addEventListener('keydown', handleDetailModalKeydown);
}

function setupOrganizationChart() {
  const dialog = document.querySelector('#organizationChartDialog');
  const canvas = document.querySelector('#organizationChartCanvas');
  teamOrganization = createTeamOrganization({ dialog, canvas, onClose: closeOrganizationChart });
  dialog.addEventListener('close', () => {
    if (organizationChartReturnFocus?.isConnected) organizationChartReturnFocus.focus();
    organizationChartReturnFocus = null;
  });
}

function openOrganizationChart(trigger) {
  if (activeProject.id !== 'th-001') return;
  const dialog = document.querySelector('#organizationChartDialog');
  if (dialog.open) return;
  organizationChartReturnFocus = trigger;
  teamOrganization.open();
  dialog.showModal();
}

function closeOrganizationChart() {
  const dialog = document.querySelector('#organizationChartDialog');
  if (dialog?.open) dialog.close();
}

function setRefreshButtonState(label, disabled = false) {
  const button = document.querySelector('.refresh');
  if (!button) return;
  button.disabled = disabled;
  button.innerHTML = `${icon('refresh')} ${label}`;
}

function resetCollapsedGanttGroups() {
  ganttCollapsedGroups.clear();
  ganttPlan.phases
    .filter((phase) => phase.tone !== 'blue')
    .forEach((phase) => ganttCollapsedGroups.add(phase.tone));
}

function assignPlanData(data) {
  if (!data?.ganttPlan || !Array.isArray(data.phases) || !Array.isArray(data.milestones)) {
    throw new Error('同步接口返回的数据结构不完整');
  }

  ganttPlan = data.ganttPlan;
  phases = data.phases;
  milestones = data.milestones;
  if (Array.isArray(data.legalHolidays)) legalHolidays = data.legalHolidays;
  resetCollapsedGanttGroups();
  lastSyncedLabel = data.syncedAtLabel || data.syncedAt || '';
}

function applySyncedPlan(data) {
  assignPlanData(data);
  document.querySelector('.kpi-grid').innerHTML = renderKpiCards();
  renderGanttBoard();
  renderCompactPhases();
  renderCalendar();

  const updateTime = document.querySelector('.update-time');
  if (updateTime) updateTime.textContent = `飞书同步 ${lastSyncedLabel}`;
}

function applyEditedPlan(data) {
  if (activeProject.id !== 'th-001') return;
  const collapsed = [...ganttCollapsedGroups], filters = getGanttFilterState();
  const scroll = document.querySelector('.gantt-main'), position = { left: scroll?.scrollLeft || 0, top: scroll?.scrollTop || 0 };
  applySyncedPlan(data); savePlanCache(data);
  ganttCollapsedGroups.clear(); collapsed.forEach(tone => ganttCollapsedGroups.add(tone));
  document.querySelector('#ganttSearch').value = filters.keyword;
  document.querySelector('#ganttPriority').value = filters.priority;
  renderGanttRows();
  const next = document.querySelector('.gantt-main'); if (next) { next.scrollLeft = position.left; next.scrollTop = position.top; }
}

function updateTodayMarker() {
  const previousDay = dateKey(today);
  today.setTime(Date.now()); today.setHours(0, 0, 0, 0);
  if (previousDay !== dateKey(today) && document.querySelector('#calendarDays')) {
    renderCalendar();
    const kpis = document.querySelector('.kpi-grid'); if (kpis) kpis.innerHTML = renderKpiCards();
  }
  const main = document.querySelector('.gantt-main'); if (!main || !ganttPlan) return;
  const marker = todayMarker(ganttPlan.rangeStart, ganttPlan.rangeEnd);
  main.style.setProperty('--gantt-today-display', marker ? 'block' : 'none');
  main.style.setProperty('--gantt-today-offset', `${(marker?.offset || 0) * 4.5}px`);
  const label = main.querySelector('.gantt-today-label'); if (label) { label.textContent = marker?.label || ''; label.title = marker?.date || ''; }
  const button = document.querySelector('#ganttToday'); if (button) { button.disabled = !marker; button.title = marker ? marker.date : '今天不在当前计划范围内'; }
  if (activeProject.connected && planStatusDay !== dateKey(today) && !planSyncing) syncBitableData(true, true);
}

function centerGanttToday(smooth = false) {
  const main = document.querySelector('.gantt-main'), marker = todayMarker(ganttPlan.rangeStart, ganttPlan.rangeEnd);
  if (!main || !marker) return;
  const left = centeredTimelineScroll({ offset: marker.offset, dayWidth: 4.5, viewportWidth: main.clientWidth, frozenWidth: main.querySelector('.gantt-table-head').getBoundingClientRect().width, scrollWidth: main.scrollWidth });
  main.scrollTo({ left, behavior: smooth && !matchMedia('(prefers-reduced-motion: reduce)').matches ? 'smooth' : 'auto' });
}

async function syncBitableData(manual = false, preserveView = false) {
  if (planSyncing || !activeProject.connected) return;
  const requestId = ++planRequestId;
  const controller = new AbortController();
  planRequestController = controller;
  const timeout = window.setTimeout(() => controller.abort(new DOMException('项目同步超时', 'TimeoutError')), 35000);
  planSyncing = true;
  planState = 'loading';
  const status = document.querySelector('#planSyncStatus');
  status.dataset.state = planState;
  status.textContent = '';
  status.hidden = true;
  document.querySelector('#ganttBoard').setAttribute('aria-busy', 'true');
  closeCalendarModal();
  closeDetailModal();
  setRefreshButtonState('同步中', true);

  try {
    const response = await fetch('/api/base-sync', { method: manual ? 'POST' : 'GET', cache: 'no-store', signal: controller.signal });
    const payload = await response.json();
    if (requestId !== planRequestId) return;
    if (!response.ok || !payload.ok) {
      throw new Error(payload.error || `同步失败：HTTP ${response.status}`);
    }
    if (preserveView) applyEditedPlan(payload.data);
    else { applySyncedPlan(payload.data); savePlanCache(payload.data); }
    planStatusDay = payload.data.statusRefreshedDay || dateKey(today);
    taskEditor?.preload().catch(() => {});
    planState = 'ready';
    status.textContent = planCacheNotice;
    status.hidden = !planCacheNotice;
    setRefreshButtonState('已同步', false);
    window.setTimeout(() => { if (requestId === planRequestId) setRefreshButtonState('手动同步', false); }, 1400);
  } catch (error) {
    if (requestId !== planRequestId) return;
    planState = 'error';
    setRefreshButtonState('重试同步', false);
    const retained = ganttPlan ? '当前保留上次成功同步的数据。' : '尚未取得飞书数据，请点击“重试同步”。';
    const message = error.name === 'TimeoutError' ? '项目同步超时，请稍后重试。'
      : error instanceof TypeError ? '无法连接项目同步服务，请检查网络后重试。'
      : error.message || '项目同步失败，请稍后重试。';
    status.textContent = `${message} ${retained}`;
    status.hidden = false;
    document.querySelector('.update-time').textContent = lastSyncedLabel ? `同步失败 · 上次 ${lastSyncedLabel}` : '未取得飞书数据';
    if (!ganttPlan) {
      document.querySelector('.kpi-grid').innerHTML = renderKpiCards();
      renderGanttBoard();
    }
  } finally {
    window.clearTimeout(timeout);
    if (requestId === planRequestId) {
      status.dataset.state = planState;
      document.querySelector('#ganttBoard').setAttribute('aria-busy', 'false');
      planSyncing = false;
      planRequestController = null;
    }
  }
}

function getDeliverableRows() {
  return (ganttPlan?.keyRows || []).filter(row => row.type !== 'phase' && row.deliverables?.length);
}

function renderKpiCards() {
  const overdueRows = getOverdueRows();
  const deliverableCount = getDeliverableRows().reduce((count, row) => count + row.deliverables.length, 0);
  const cards = [
    { id: 'deliverables', label: '交付物', value: ganttPlan ? deliverableCount : '—', unit: '份', iconName: 'file', tone: '' },
    { id: 'p0', label: 'P0 高优风险', value: ganttPlan?.p0Tasks ?? '—', unit: '项', iconName: 'alert', tone: 'tone-rose' },
    { id: 'milestones', label: '关键里程碑', value: ganttPlan?.milestoneCount ?? '—', unit: '个', iconName: 'calendar', tone: 'tone-amber' },
    { id: 'duration', label: '计划周期', value: ganttPlan?.durationDays ?? '—', unit: '天', iconName: 'clock', tone: 'tone-green' },
    { id: 'overdue', label: '已逾期', value: ganttPlan ? overdueRows.length : '—', unit: '项', iconName: 'alert', tone: 'tone-overdue' },
  ];

  return cards
        .map(
      (card) => `
        <article class="kpi-card ${card.tone}" role="button" tabindex="0" data-detail-card="${card.id}" aria-haspopup="dialog" aria-label="查看${card.label}详情">
          <div class="kpi-icon">${icon(card.iconName)}</div>
          <div class="kpi-content">
            <h2>${card.label}</h2>
            <div class="kpi-value"><strong>${card.value}</strong><span>${card.unit}</span></div>
          </div>
        </article>
      `,
    )
    .join('');
}

function handleDetailCardActivation(event) {
  if (!ganttPlan) return;
  if (event.type === 'keydown' && !['Enter', ' '].includes(event.key)) return;
  const card = event.target.closest('[data-detail-card]');
  if (!card) return;
  if (event.type === 'keydown') event.preventDefault();
  openDetailModal(card.dataset.detailCard);
}

function handleDetailModalKeydown(event) {
  if (document.querySelector('#organizationChartDialog')?.open) return;
  if (!detailModalOpen) return;
  if (event.key === 'Escape') closeDetailModal();
  if (event.key !== 'Tab') return;
  const controls = [...document.querySelector('#detailModal').querySelectorAll('button, a[href]')];
  const first = controls[0];
  const last = controls.at(-1);
  if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
  else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
}

function openDetailModal(cardId) {
  const detail = getDetailCardData(cardId);
  if (!detail) return;
  detailReturnFocus = document.activeElement;
  closeCalendarModal();
  const modal = document.querySelector('#detailModal');
  const body = document.querySelector('#detailModalBody');
  body.innerHTML = renderDetailModal(detail);
  modal.hidden = false;
  detailModalOpen = true;
  document.body.classList.add('detail-modal-open');
  modal.querySelector('button[data-detail-close]')?.focus();
}

function closeDetailModal() {
  closeOrganizationChart();
  const modal = document.querySelector('#detailModal');
  if (!modal) return;
  modal.hidden = true;
  if (detailModalOpen && detailReturnFocus?.isConnected) detailReturnFocus.focus();
  detailModalOpen = false;
  document.body.classList.remove('detail-modal-open');
}

function renderDetailModal(detail) {
  const stats = detail.stats
    .map(
      (stat) => `
        <div class="detail-stat">
          <strong>${escapeHtml(stat.value)}</strong>
          <span>${escapeHtml(stat.label)}</span>
        </div>
      `,
    )
    .join('');
  const sections = detail.sections
    .map(
      (section) => `
        <section class="detail-section">
          <h4>${escapeHtml(section.title)}</h4>
          <ul class="detail-list">
            ${section.items.map(renderDetailItem).join('')}
          </ul>
        </section>
      `,
    )
    .join('');

  return `
    <div class="detail-hero ${detail.tone}">
      <span class="detail-icon">${icon(detail.iconName)}</span>
      <div>
        <span class="detail-eyebrow">${escapeHtml(detail.eyebrow)}</span>
        <h3 id="detailModalTitle">${escapeHtml(detail.title)}</h3>
        <p>${escapeHtml(detail.body)}</p>
      </div>
    </div>
    <div class="detail-stat-grid">${stats}</div>
    ${sections}
  `;
}

function renderDetailItem(item) {
  return `
    <li${item.organizationChart ? ' class="detail-item-with-action"' : ''}>
      ${item.organizationChart ? '<button class="detail-item-action" type="button" data-organization-chart aria-haspopup="dialog">' : ''}
      <i class="${escapeAttribute(item.tone || '')}"></i>
      <${item.organizationChart ? 'span' : 'div'}>
        ${item.url ? `<a class="deliverable-document" href="${escapeAttribute(item.url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(item.title)} ${icon('external')}</a>` : `<strong>${escapeHtml(item.title)}</strong>`}
        ${item.meta ? `<small>${escapeHtml(item.meta)}</small>` : ''}
      </${item.organizationChart ? 'span' : 'div'}>
      ${item.tag ? `<em>${escapeHtml(item.tag)}</em>` : ''}
      ${item.organizationChart ? '</button>' : ''}
    </li>
  `;
}

function getDetailCardData(cardId) {
  if (cardId === 'deliverables') {
    const rows = getDeliverableRows();
    const count = rows.reduce((sum, row) => sum + row.deliverables.length, 0);
    return {
      tone: 'blue', iconName: 'file', eyebrow: '项目交付资料', title: '交付物',
      body: count ? '按任务汇总已提交的交付资料，点击资料名称即可查看。' : '暂无交付物。源表补充交付资料后，点击手动同步更新。',
      stats: [{ label: '交付资料', value: count }, { label: '关联任务', value: rows.length }, { label: '项目任务', value: ganttPlan.totalTasks }],
      sections: rows.map(row => ({
        title: `${row.code} · ${row.title}`,
        items: row.deliverables.map(file => ({ title: file.name, url: file.url, meta: file.inSource ? '在飞书源记录中查看附件' : '在新窗口打开', tone: row.phase })),
      })),
    };
  }
  if (cardId.startsWith('deliverables-')) {
    const row = ganttPlan.keyRows.find(row => `deliverables-${row.recordId || row.code}` === cardId);
    if (!row?.deliverables?.length) return null;
    return {
      tone: row.phase, iconName: 'external', eyebrow: `任务 ${row.code} · 交付物`, title: row.title,
      body: '点击资料名称，在新窗口查看交付物。',
      stats: [{ label: '交付物', value: row.deliverables.length }, { label: '源表状态', value: row.sourceStatus || row.status }, { label: '优先级', value: row.priority }],
      sections: [{ title: '交付资料', items: row.deliverables.map(file => ({ title: file.name, url: file.url, meta: file.inSource ? '在飞书源记录中查看附件' : new URL(file.url).hostname, tone: row.phase })) }],
    };
  }
  if (cardId.startsWith('phase-')) {
    return getPhaseDetail(cardId.replace('phase-', ''));
  }
  const taskRows = ganttPlan.keyRows.filter((row) => row.type === 'task');
  const p0Rows = taskRows.filter((row) => row.priority === 'P0');
  const p1Rows = taskRows.filter((row) => row.priority === 'P1');
  const overdueRows = getOverdueRows();
  const p0Risks = ganttPlan.riskRadar.filter((risk) => risk.level === 'P0');
  const projectStart = ganttPlan.rangeStart;
  const projectEnd = ganttPlan.rangeEnd;
  const holidayCounts = legalHolidays.reduce(
    (counts, holiday) => ({
      ...counts,
      [holiday.country]: (counts[holiday.country] || 0) + 1,
    }),
    {},
  );

  const phaseItems = phases.map((phase) => ({
    title: `${phase.no} ${phase.title}`,
    meta: `${formatPeriod(phase.start, phase.end)} · P0 ${phase.p0} / P1 ${phase.p1}`,
    tag: `${phase.total}项`,
    tone: phase.tone,
  }));

  const details = {
    tasks: {
      tone: 'blue',
      iconName: 'briefcase',
      eyebrow: '任务总览',
      title: '团队任务总览',
      body: `飞书泰国任务执行表共 ${ganttPlan.totalTasks} 项，已完成 ${ganttPlan.completedTasks} 项。`,
      stats: [
        { label: '底表任务', value: ganttPlan.totalTasks },
        { label: '阶段', value: phases.length },
        { label: 'P0 高优', value: ganttPlan.p0Tasks },
      ],
      sections: [
        { title: '阶段分布', items: phaseItems },
        {
          title: '当前缺口',
          items: ganttPlan.gaps.slice(0, 4).map((gap) => ({ title: gap, tone: 'amber' })),
        },
      ],
    },
    p0: {
      tone: 'rose',
      iconName: 'alert',
      eyebrow: '风险关注',
      title: 'P0 高优风险',
      body: '优先关注会影响合规、签证、宿舍通勤和关键人员进场的高优事项。',
      stats: [
        { label: 'P0 任务', value: p0Rows.length },
        { label: '风险雷达', value: p0Risks.length },
        { label: '覆盖阶段', value: phases.length },
      ],
      sections: [
        {
          title: '风险雷达',
          items: p0Risks.map((risk) => ({
            title: risk.title,
            meta: risk.body,
            tag: risk.level,
            tone: 'rose',
          })),
        },
        {
          title: '高优任务样例',
          items: p0Rows.slice(0, 6).map((row) => ({
            title: row.title,
            meta: `${getPhaseShortName(row.phase)} · ${formatPeriod(row.start, row.end)}`,
            tag: row.code,
            tone: 'rose',
          })),
        },
      ],
    },
    milestones: {
      tone: 'amber',
      iconName: 'calendar',
      eyebrow: '交付节点',
      title: '关键里程碑',
      body: '里程碑及日期取自飞书泰国任务执行表。',
      stats: [
        { label: '里程碑', value: milestones.length },
        { label: '最早节点', value: formatCompact(toDate(milestones.map(item => item.date).sort()[0])) },
        { label: '最终收官', value: formatCompact(toDate(milestones.map(item => item.date).sort().at(-1))) },
      ],
      sections: [
        {
          title: '重点交付',
          items: milestones.map((milestone, index) => ({
            title: milestone.title,
            meta: formatDateLabel(toDate(milestone.date)),
            tag: `M${index + 1}`,
            tone: 'amber',
          })),
        },
      ],
    },
    duration: {
      tone: 'green',
      iconName: 'clock',
      eyebrow: '计划周期',
      title: '计划周期',
      body: '计划周期根据飞书任务的最早开始日期和最晚截止日期计算。',
      stats: [
        { label: '计划天数', value: ganttPlan.durationDays },
        { label: '开始', value: formatCompact(toDate(projectStart)) },
        { label: '收官', value: formatCompact(toDate(projectEnd)) },
      ],
      sections: [
        { title: '阶段窗口', items: phaseItems },
        {
          title: '节假日提示',
          items: [
            { title: '中国法定节假日', meta: `${holidayCounts.CN || 0} 天已标识在项目日历`, tone: 'rose' },
            { title: '泰国法定节假日', meta: `${holidayCounts.TH || 0} 天已标识在项目日历`, tone: 'green' },
          ],
        },
      ],
    },
    overdue: {
      tone: 'overdue',
      iconName: 'alert',
      eyebrow: '逾期预警',
      title: '已逾期条目',
      body: overdueRows.length
        ? '以下条目已超过截止日期且未完成，需要优先拉回节奏。'
        : '按当前日期核对，暂无已逾期未完成条目。',
      stats: [
        { label: '逾期条目', value: overdueRows.length },
        { label: 'P0 逾期', value: overdueRows.filter((row) => row.priority === 'P0').length },
        { label: '检查日期', value: formatCompact(today) },
      ],
      sections: [
        {
          title: '逾期清单',
          items: overdueRows.length
            ? overdueRows.map((row) => ({
                title: row.title,
                meta: `${getPhaseShortName(row.phase)} · 截止 ${formatDateLabel(toDate(row.end))}`,
                tag: row.priority,
                tone: row.priority === 'P0' ? 'overdue' : 'amber',
              }))
            : [
                {
                  title: '当前没有已逾期条目',
                  meta: `检查日期：${formatDateLabel(today)}；P1 一般任务 ${p1Rows.length} 项仍按计划跟进。`,
                  tag: '正常',
                  tone: 'green',
                },
              ],
        },
      ],
    },
  };

  return details[cardId];
}

function getPhaseDetail(phaseNo) {
  const phase = phases.find((item) => item.no === phaseNo);
  if (!phase) return null;
  const rows = ganttPlan.keyRows.filter((row) => row.phase === phase.tone);
  const taskRows = rows.filter((row) => row.type === 'task');
  const phaseMilestones = rows.filter((row) => row.type === 'milestone');
  const copy = getPhaseCardCopy(phase);

  return {
    tone: phase.tone,
    iconName: copy.iconName,
    eyebrow: `阶段 ${phase.no}`,
    title: phase.title,
    body: phase.desc,
    stats: [
      { label: '阶段任务', value: phase.total },
      { label: 'P0', value: phase.p0 },
      { label: 'P1', value: phase.p1 },
    ],
    sections: [
      {
        title: '当前推进',
        items: [
          { title: copy.current, meta: copy.focus, tag: phase.status, tone: phase.tone },
          ...copy.actions.map((task) => ({ title: task, tone: phase.tone })),
        ],
      },
      {
        title: '关键工作',
        items: taskRows.slice(0, 6).map((row) => ({
          title: row.title,
          meta: formatPeriod(row.start, row.end),
          tag: row.priority,
          tone: row.priority === 'P0' ? 'rose' : 'amber',
          organizationChart: activeProject.id === 'th-001' && (row.recordId === 'reczz28OqA6vFK96' || row.code === '001-20'),
        })),
      },
      {
        title: '阶段交付',
        items: [
          { title: phase.deliverable, tone: phase.tone },
          ...phaseMilestones.map((row) => ({
            title: row.title,
            meta: formatDateLabel(toDate(row.start)),
            tag: '里程碑',
            tone: 'amber',
          })),
        ],
      },
    ],
  };
}

function getPhaseShortName(tone) {
  return phases.find((phase) => phase.tone === tone)?.short || '未分组';
}

function renderGanttBoard() {
  if (!activeProject.connected) {
    document.querySelector('#ganttBoard').innerHTML = `<div class="project-setup"><span class="section-icon">${icon('calendar')}</span><div><span class="project-setup-code">${activeProject.countryName} / ${activeProject.code}</span><h2>${activeProject.name} 项目工作区</h2><p>尚未接入项目任务表。接入后将在这里显示任务、交付物、日历和甘特计划。</p><span class="project-setup-status">待接入 · 未展示其他项目数据</span></div></div>`;
    return;
  }
  if (!ganttPlan && planState !== 'error') {
    document.querySelector('#ganttBoard').innerHTML = renderPlanSkeleton();
    return;
  }
  if (!ganttPlan || !ganttPlan.totalTasks) {
    document.querySelector('#ganttBoard').innerHTML = `<div class="gantt-empty"><strong>${!ganttPlan ? planState === 'error' ? '飞书数据暂未加载' : '正在连接泰国项目任务表' : '飞书任务表暂无记录'}</strong><span>${!ganttPlan ? '同步成功后显示任务、阶段和甘特计划。' : '新增任务后，点击手动同步更新。'}</span></div>`;
    return;
  }
  const months = getGanttMonths();
  const weeks = getGanttWeeks();
  const dayWidth = 4.5;
  const timelineWidth = months.reduce((sum, month) => sum + month.days, 0) * dayWidth;

  document.querySelector('#ganttBoard').innerHTML = `
    <div class="gantt-top">
      <div class="gantt-title">
        <span class="section-icon">${icon('calendar')}</span>
        <div>
          <h2>团队组建甘特计划总览</h2>
        </div>
      </div>
      <div class="gantt-toolbar">
        <label class="gantt-search">
          ${icon('check')}
          <input id="ganttSearch" type="search" placeholder="搜索任务 / 关键字" autocomplete="off">
        </label>
        <select id="ganttPriority" aria-label="甘特优先级筛选">
          <option value="all">全部关键项</option>
          <option value="P0">P0 高优</option>
          <option value="P1">P1 一般</option>
          <option value="milestone">仅里程碑</option>
        </select>
        <span class="gantt-range">${ganttPlan.rangeStart.slice(0, 7).replace('-', '.')} - ${ganttPlan.rangeEnd.slice(0, 7).replace('-', '.')}</span>
        <div class="gantt-group-actions" aria-label="甘特分组控制">
          <button type="button" id="ganttToday">今天</button>
          <button type="button" id="ganttExpandAll">展开</button>
          <button type="button" id="ganttCollapseAll">收起</button>
        </div>
        <a class="gantt-action" href="${ganttPlan.source.baseUrl}" target="_blank" rel="noreferrer">${icon('external')} 打开底表</a>
      </div>
    </div>

    <div class="gantt-overview-grid">
      <section class="panel stage-panel gantt-stage-panel">
        <div class="phase-grid" id="phaseCards"></div>
      </section>

      <section class="panel calendar-panel gantt-calendar-panel">
        <div class="calendar-top">
          <strong class="calendar-caption">项目日历</strong>
          <div class="calendar-controls">
            <button class="icon-button" type="button" aria-label="上个月" title="上个月" id="prevMonth">${icon('chevron-left')}</button>
            <strong class="calendar-month" id="calendarMonth">2026年6月</strong>
            <button class="icon-button" type="button" aria-label="下个月" title="下个月" id="nextMonth">${icon('chevron-right')}</button>
            <button class="today-button" type="button" id="todayMonth">今日</button>
          </div>
        </div>
        <p class="calendar-summary" id="calendarSummary" aria-live="polite"></p>
        <div class="calendar">
          <div class="weekdays">
            <span>一</span><span>二</span><span>三</span><span>四</span><span>五</span><span>六</span><span>日</span>
          </div>
          <div class="days" id="calendarDays"></div>
        </div>
        <div class="calendar-key" aria-label="日历标识说明"><span>截止：计划结束</span><span>节点：里程碑</span><span>中休 / 泰休：两国假日</span></div>
      </section>
    </div>

    <div class="gantt-layout">
      <div class="gantt-main" style="--gantt-day-width:${dayWidth}px; --gantt-week-width:${dayWidth * 7}px; --gantt-timeline-width:${timelineWidth}px;">
        <div class="gantt-table-head">
          <span class="gantt-completion-heading">完成</span>
          <span>编号</span>
          <span>关键工作</span>
          <span>优先级</span>
        </div>
        <div class="gantt-axis">
          <span class="gantt-today-label" aria-label="今天时间线"></span>
          <div class="gantt-months" style="grid-template-columns:${months.map(month => `${month.days * dayWidth}px`).join(' ')};">
            ${months.map((month) => `<span>${month.label}</span>`).join('')}
          </div>
          <div class="gantt-weeks" style="grid-template-columns:${weeks.map(week => `${week.days * dayWidth}px`).join(' ')};">
            ${weeks.map((week) => `<span>${week.days < 3 ? '' : week.label}</span>`).join('')}
          </div>
        </div>
        <div class="gantt-rows" id="ganttRows"></div>
      </div>

    </div>

    <div class="gantt-legend">
      <span><i class="legend-line blue"></i>合规筹备</span>
      <span><i class="legend-line amber"></i>核心骨干</span>
      <span><i class="legend-line green"></i>基层招聘</span>
      <span><i class="legend-line indigo"></i>体系演练</span>
      <span><i class="legend-diamond"></i>里程碑</span>
      <span><i class="legend-risk"></i>P0 风险事项</span>
      <span><i class="legend-p1"></i>P1 一般任务</span>
      <span class="completion-legend">${completionIcon} 已完成</span>
      <span class="gantt-source">来源：泰国任务执行表 / ${ganttPlan.source.fetchedAt} · 完成率按已完成任务数计算</span>
    </div>

    <div class="calendar-modal" id="calendarModal" hidden>
      <div class="calendar-modal-backdrop" data-calendar-close></div>
      <section class="calendar-modal-panel" role="dialog" aria-modal="true" aria-labelledby="calendarModalTitle">
        <button class="calendar-modal-close" type="button" data-calendar-close aria-label="关闭日期详情">关闭</button>
        <div class="day-detail" id="calendarDayDetail" aria-live="polite"></div>
      </section>
    </div>
  `;

  renderGanttRows();
  updateTodayMarker();
  centerGanttToday();
  attachGanttPan(document.querySelector('.gantt-main'));
  document.querySelector('#ganttToday').addEventListener('click', () => centerGanttToday(true));
  document.querySelector('#ganttSearch').addEventListener('input', renderGanttRows);
  document.querySelector('#ganttPriority').addEventListener('change', renderGanttRows);
  document.querySelector('#ganttExpandAll').addEventListener('click', () => {
    ganttCollapsedGroups.clear();
    renderGanttRows();
  });
  document.querySelector('#ganttCollapseAll').addEventListener('click', () => {
    ganttPlan.phases.forEach((phase) => ganttCollapsedGroups.add(phase.tone));
    renderGanttRows();
  });
  document.querySelector('#prevMonth').addEventListener('click', () => {
    calendarCursor = new Date(
      calendarCursor.getFullYear(),
      calendarCursor.getMonth() - 1,
      1,
    );
    selectedCalendarDate = dateKey(calendarCursor);
    closeCalendarModal();
    renderCalendar();
  });
  document.querySelector('#nextMonth').addEventListener('click', () => {
    calendarCursor = new Date(
      calendarCursor.getFullYear(),
      calendarCursor.getMonth() + 1,
      1,
    );
    selectedCalendarDate = dateKey(calendarCursor);
    closeCalendarModal();
    renderCalendar();
  });
  document.querySelector('#todayMonth').addEventListener('click', () => {
    calendarCursor = new Date(today.getFullYear(), today.getMonth(), 1);
    selectedCalendarDate = dateKey(today);
    closeCalendarModal();
    renderCalendar();
  });
  document.querySelector('#calendarDays').addEventListener('click', (event) => {
    const dayButton = event.target.closest('[data-date]');
    if (!dayButton) return;
    selectedCalendarDate = dayButton.dataset.date;
    const selected = toDate(selectedCalendarDate);
    if (selected.getMonth() !== calendarCursor.getMonth() || selected.getFullYear() !== calendarCursor.getFullYear()) {
      calendarCursor = new Date(selected.getFullYear(), selected.getMonth(), 1);
    }
    renderCalendar();
    openCalendarModal();
  });
  document.querySelector('#calendarModal').addEventListener('click', (event) => {
    if (!event.target.closest('[data-calendar-close]')) return;
    closeCalendarModal();
  });
  document.addEventListener('keydown', handleCalendarModalKeydown);
  document.querySelector('#ganttRows').addEventListener('click', (event) => {
    const edit = event.target.closest('[data-edit-task]');
    if (edit) { taskEditor?.open(edit.dataset.editTask, edit, edit.dataset.taskCode); return; }
    const toggle = event.target.closest('[data-gantt-toggle]');
    if (!toggle) return;
    const tone = toggle.dataset.ganttToggle;
    if (ganttCollapsedGroups.has(tone)) {
      ganttCollapsedGroups.delete(tone);
    } else {
      ganttCollapsedGroups.add(tone);
    }
    renderGanttRows();
  });
  setupGanttTooltip();
}

function renderGanttRows() {
  const groups = getGanttGroups();
  const empty = `
    <div class="gantt-empty">
      <strong>没有匹配的关键任务</strong>
      <span>请调整搜索词或筛选条件。</span>
    </div>
  `;

  const rows = groups.map((group, groupIndex) => renderGanttGroup(group, groupIndex + 1));

  document.querySelector('#ganttRows').innerHTML = groups.length === 0 ? empty : rows.join('');
}

function renderGanttGroup(group) {
  const header = renderGanttRow(group.header, {
    collapsed: group.collapsed,
    totalChildren: group.totalChildren,
    visibleChildren: group.children.length,
  });
  if (group.collapsed) return header;
  return `${header}${group.children
    .map((row) => {
      if (row.type === 'milestone') {
        return renderGanttRow(row, { displayCode: '' });
      }
      return renderGanttRow(row);
    })
    .join('')}`;
}

function renderGanttRow(row, options = {}) {
  const scheduled = Boolean(row.start && row.end);
  const completed = row.status === '已完成';
  const sourceStatus = row.sourceStatus || row.status;
  const completion = row.type === 'phase'
    ? `<span class="gantt-completion-group" title="阶段完成率">${row.progress}%</span>`
    : `<span class="gantt-completion${completed ? ' is-complete' : ''}" role="img" aria-label="${escapeAttribute(`${completed ? '已完成' : '未完成'}：${sourceStatus}`)}" title="${escapeAttribute(sourceStatus)}">${completed ? completionIcon : ''}</span>`;
  const pos = ganttPosition(row);
  const typeText = row.type === 'phase' ? `${formatPeriod(row.start, row.end)} · ${row.title}` : row.title;
  const milestone = row.type === 'milestone';
  const compactBar = !milestone && (pos.width < 8 || (row.type === 'phase' && pos.width < 15));
  const phaseMeta = ganttPlan.phases.find((phase) => phase.tone === row.phase);
  const fullText = `${row.code} · ${row.title} · ${formatPeriod(row.start, row.end)} · ${row.priority} · ${row.sourceStatus || row.status}`;
  const fullAttr = escapeAttribute(fullText);
  const displayCode = options.displayCode || row.code;
  const barLabel = compactBar
    ? row.type === 'phase'
      ? `${displayCode} ${formatTightPeriod(row.start, row.end)}`
      : formatCompact(toDate(row.start))
    : row.type === 'phase'
      ? `${displayCode} ${phaseMeta?.short || row.title}`
      : formatPeriod(row.start, row.end);
  const barDate = !compactBar && row.type === 'phase' ? `<em>${formatPeriod(row.start, row.end)}</em>` : '';
  const priorityClass = row.priority === 'P0' ? 'priority-p0' : row.priority === 'P1' ? 'priority-p1' : 'priority-p2';
  const expanded = !options.collapsed;
  const codeCell =
    row.type === 'phase'
      ? `<span class="gantt-code gantt-code-group">
          <button class="gantt-toggle" type="button" data-gantt-toggle="${row.phase}" aria-expanded="${expanded}" title="${expanded ? '收起阶段' : '展开阶段'}">${icon('chevron-right')}</button>
          <b title="${escapeAttribute(row.code)}">${escapeHtml(displayCode)}</b>
        </span>`
      : milestone
        ? `<span class="gantt-code gantt-code-milestone" title="${escapeAttribute(row.code)}">
          <span class="milestone-icon">${icon('calendar')}</span>
        </span>`
        : `<span class="gantt-code gantt-code-child" title="${escapeAttribute(row.code)}"><i></i><b>${escapeHtml(displayCode)}</b></span>`;

  const editable = row.type !== 'phase' && row.recordId;
  const editAttr = editable ? `data-edit-task="${escapeAttribute(row.recordId)}" data-task-code="${escapeAttribute(row.code)}" aria-haspopup="dialog"` : '';
  const syncLabel = row.sync && row.sync.status !== 'success' ? `<small class="task-row-sync ${row.sync.status}" title="${escapeAttribute(row.sync.error || '后台同步中')}">${['error', 'blocked'].includes(row.sync.status) ? '待处理' : '同步中'}</small>` : '';
  return `
    <div class="gantt-row ${row.type} tone-${row.phase} ${priorityClass} ${completed ? 'is-complete' : ''} ${options.collapsed ? 'is-collapsed' : ''}">
      <div class="gantt-row-info">
        ${completion}
        ${codeCell}
        <span class="gantt-task-label">${editable ? `<button type="button" class="gantt-name gantt-edit-name" ${editAttr} title="${escapeAttribute(typeText)}"><span>${escapeHtml(typeText)}</span></button>` : `<span class="gantt-name" title="${escapeAttribute(typeText)}"><span>${escapeHtml(typeText)}</span></span>`}${syncLabel}${renderDeliverableEntry(row)}</span>
        <span class="gantt-priority">${escapeHtml(row.priority)}</span>
      </div>
      <div class="gantt-track">
        ${
          !scheduled ? '<span class="gantt-unscheduled">未排期</span>' : milestone
            ? `<button type="button" class="gantt-diamond" ${editAttr} style="--start:${pos.left}" aria-label="编辑任务：${escapeAttribute(row.title)}" title="${escapeAttribute(row.title)} · ${row.start}" data-full="${fullAttr}"></button>`
            : `<${editable ? 'button type="button"' : 'span'} class="gantt-bar ${compactBar ? 'compact' : ''}" ${editAttr} style="--start:${pos.left};--width:${pos.width};--progress:${row.progress}" title="${fullAttr}" data-full="${fullAttr}">
                <b>${escapeHtml(barLabel)}</b>
                ${barDate}
              </${editable ? 'button' : 'span'}>`
        }
      </div>
    </div>
  `;
}

function renderDeliverableEntry(row) {
  const files = row.deliverables || [];
  if (!files.length) return '';
  if (files.length === 1) {
    const file = files[0];
    return `<a class="gantt-deliverable" href="${escapeAttribute(file.url)}" target="_blank" rel="noopener noreferrer" aria-label="查看交付物：${escapeAttribute(file.name)}" title="${escapeAttribute(file.name)}">${icon('external')}<span>交付物</span></a>`;
  }
  return `<button class="gantt-deliverable" type="button" data-detail-card="${escapeAttribute(`deliverables-${row.recordId || row.code}`)}" aria-haspopup="dialog" aria-label="查看${escapeAttribute(row.title)}的 ${files.length} 份交付物" title="${escapeAttribute(files.map(file => file.name).join('、'))}">${icon('external')}<span>交付物 ${files.length}</span></button>`;
}

function setupGanttTooltip() {
  const rows = document.querySelector('#ganttRows');
  document.querySelectorAll('.gantt-tooltip').forEach((item) => item.remove());
  const tooltip = document.createElement('div');
  tooltip.className = 'gantt-tooltip';
  tooltip.hidden = true;
  document.body.append(tooltip);
  document.querySelector('.gantt-main').addEventListener('scroll', () => { tooltip.hidden = true; });

  const showTooltip = (target, event) => {
    tooltip.textContent = target.dataset.full;
    tooltip.hidden = false;
    positionGanttTooltip(tooltip, event);
  };

  rows.addEventListener('pointerover', (event) => {
    const target = event.target.closest('[data-full]');
    if (!target) return;
    showTooltip(target, event);
  });

  rows.addEventListener('pointermove', (event) => {
    if (tooltip.hidden) return;
    positionGanttTooltip(tooltip, event);
  });

  rows.addEventListener('pointerout', (event) => {
    if (!event.target.closest('[data-full]')) return;
    tooltip.hidden = true;
  });

  rows.addEventListener('click', (event) => {
    const target = event.target.closest('[data-full]');
    if (!target || event.target.closest('[data-gantt-toggle]')) return;
    showTooltip(target, event);
  });
}

function positionGanttTooltip(tooltip, event) {
  const width = Math.min(360, window.innerWidth - 32);
  const left = Math.min(event.clientX + 14, window.innerWidth - width - 16);
  const top = event.clientY > 110 ? event.clientY - 58 : event.clientY + 18;
  tooltip.style.width = `${width}px`;
  tooltip.style.left = `${Math.max(16, left)}px`;
  tooltip.style.top = `${Math.max(16, top)}px`;
}

function renderPhases() {
  document.querySelector('#phaseCards').innerHTML = phases
    .slice(0, 3)
    .map(
      (phase) => `
        <article class="phase-card ${phase.tone}">
          <div class="phase-head">
            <div class="phase-no">${phase.no}</div>
            <div>
              <h3>${phase.title}</h3>
            </div>
            <span class="phase-mark" title="阶段标识">${icon(getPhaseCardCopy(phase).iconName)}</span>
          </div>
          <div class="phase-dashboard">
            <div class="phase-big">
              <strong>${phase.total}</strong>
              <span>待推进</span>
            </div>
            <div class="phase-counts">
              <span>完成 0</span>
              <span>共 ${phase.total}</span>
            </div>
          </div>
          <div class="bar"><i style="--value:0%"></i></div>
          <div class="phase-current">
            <div>
              <strong>${phase.tasks[0]}</strong>
              <small>${phase.desc}</small>
            </div>
            <span>未开始</span>
          </div>
          <div class="phase-actions">
            ${phase.tasks.slice(1, 3).map((task) => `<span>${task}</span>`).join('')}
          </div>
        </article>
      `,
    )
    .join('');
}

function renderCompactPhases() {
  if (!document.querySelector('#phaseCards')) return;
  document.querySelector('#phaseCards').innerHTML = phases
    .slice(0, 3)
    .map((phase) => {
      const copy = getPhaseCardCopy(phase);
      const cardTitle = [
        phase.title,
        copy.current,
        copy.focus,
        ...copy.actions,
      ]
        .filter(Boolean)
        .join(' | ');
      const currentTitle = copy.current;
      const currentFocus = copy.focus;

      return `
        <article class="phase-card ${phase.tone}" role="button" tabindex="0" data-detail-card="phase-${phase.no}" aria-haspopup="dialog" aria-label="查看${phase.title}详情" title="${escapeAttribute(cardTitle)}">
          <div class="phase-head">
            <div class="phase-no">${phase.no}</div>
            <div class="phase-title-wrap">
              <h3 title="${escapeAttribute(copy.title)}">${escapeHtml(copy.title)}</h3>
              <div class="phase-subtitle" title="${escapeAttribute(copy.subtitle)}">${escapeHtml(summarizeText(copy.subtitle, 13))}</div>
            </div>
            <span class="phase-mark" title="阶段标识">${icon(copy.iconName)}</span>
          </div>
          <div class="phase-dashboard">
            <div class="phase-big">
              <strong>${phase.remaining}</strong>
              <span>待推进</span>
            </div>
            <div class="phase-counts">
              <span>完成 ${phase.completed}</span>
              <span>共 ${phase.total}</span>
            </div>
          </div>
          <div class="phase-progress">
            <div class="phase-progress-label"><span>完成进度</span><strong>${phase.progress}%</strong></div>
            <div class="bar" role="progressbar" aria-label="${escapeAttribute(phase.title)}完成进度" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${phase.progress}"><i style="--value:${phase.progress}%"></i></div>
          </div>
          <div class="phase-current">
            <div>
              <strong title="${escapeAttribute(copy.current)}">${escapeHtml(currentTitle)}</strong>
              <small title="${escapeAttribute(copy.focus)}">${escapeHtml(currentFocus)}</small>
            </div>
            <span>${escapeHtml(phase.status)}</span>
          </div>
          <div class="phase-actions">
            ${copy.actions
              .map((task) => `<span title="${escapeAttribute(task)}">${escapeHtml(summarizeAction(task))}</span>`)
              .join('')}
          </div>
        </article>
      `;
    })
    .join('');
}

function formatDateLabel(date) {
  return `${date.getFullYear()}年${date.getMonth() + 1}月${date.getDate()}日`;
}

function holidayCountryLabel(country) {
  return country === 'CN' ? '中国' : '泰国';
}

function isDateWithinRange(day, start, end) {
  const time = day.getTime();
  return time >= toDate(start).getTime() && time <= toDate(end).getTime();
}

function getCalendarDayData(day) {
  const holidays = legalHolidays.filter((item) => sameDay(toDate(item.date), day));
  const dayMilestones = milestones.filter((item) => sameDay(toDate(item.date), day));
  const activePhases = ganttPlan.keyRows.filter((row) => row.type === 'phase' && isDateWithinRange(day, row.start, row.end));
  const tasks = ganttPlan.keyRows
    .filter((row) => row.type === 'task' && isDateWithinRange(day, row.start, row.end))
    .sort((left, right) => (left.priority === right.priority ? 0 : left.priority === 'P0' ? -1 : 1));

  const dueTasks = ganttPlan.keyRows.filter((row) => row.type === 'task' && row.end === dateKey(day));
  return { activePhases, holidays, milestones: dayMilestones, tasks, dueTasks };
}

function renderCalendarMarkers(data) {
  const countries = new Set(data.holidays.map((holiday) => holiday.country));
  const holiday = countries.has('CN') && countries.has('TH') ? '中泰休' : countries.has('CN') ? '中休' : countries.has('TH') ? '泰休' : '';
  if (data.milestones.length) return '<span class="day-event milestone-event">节点</span>';
  if (data.dueTasks.length) return `<span class="day-task-count">${data.dueTasks.length}截止</span>`;
  return holiday ? `<span class="day-event">${holiday}</span>` : '';
}

function setCalendarModalOpen(open) {
  calendarModalOpen = open;
  const modal = document.querySelector('#calendarModal');
  if (!modal) return;
  modal.hidden = !open;
  document.body.classList.toggle('calendar-modal-open', open);
  if (open) {
    renderCalendarDetail();
    modal.querySelector('[data-calendar-close]')?.focus();
  }
}

function openCalendarModal() {
  setCalendarModalOpen(true);
}

function closeCalendarModal() {
  setCalendarModalOpen(false);
}

function handleCalendarModalKeydown(event) {
  if (event.key !== 'Escape' || !calendarModalOpen) return;
  closeCalendarModal();
}

function renderCalendarDetail() {
  const detail = document.querySelector('#calendarDayDetail');
  if (!detail) return;
  const selected = toDate(selectedCalendarDate);
  const data = getCalendarDayData(selected);
  const continuingTasks = data.tasks.filter((task) => task.end !== selectedCalendarDate);
  const isToday = sameDay(selected, today);
  const sections = [];

  if (data.holidays.length) {
    sections.push(`
      <div class="day-detail-section">
        <strong>节假日</strong>
        <div class="day-detail-tags">
          ${data.holidays
            .map(
              (holiday) =>
                `<span class="holiday-chip ${holiday.country.toLowerCase()}">${holidayCountryLabel(holiday.country)} · ${holiday.name}</span>`,
            )
            .join('')}
        </div>
      </div>
    `);
  }

  if (data.milestones.length) {
    sections.push(`
      <div class="day-detail-section">
        <strong>重点交付</strong>
        <div class="day-detail-list">
          ${data.milestones.map((milestone) => `<span>${icon('calendar')}${escapeHtml(milestone.title)}</span>`).join('')}
        </div>
      </div>
    `);
  }

  if (data.dueTasks.length) {
    sections.push(`
      <div class="day-detail-section">
        <strong>计划截止 · ${data.dueTasks.length}项</strong>
        <div class="day-detail-list">
          ${data.dueTasks.map((task) => `<span>${escapeHtml(task.title)}<em>${escapeHtml(task.sourceStatus || task.status)}</em></span>`).join('')}
        </div>
      </div>
    `);
  }

  if (continuingTasks.length) {
    sections.push(`
      <div class="day-detail-section">
        <strong>当天其他计划任务</strong>
        <div class="day-detail-list">
          ${continuingTasks
            .slice(0, 5)
            .map(
              (task) => `
                <span>
                  <i class="priority-dot ${task.priority.toLowerCase()}"></i>
                  ${escapeAttribute(task.title)}
                  <em>${escapeHtml(task.priority)}</em>
                </span>
              `,
            )
            .join('')}
          ${continuingTasks.length > 5 ? `<small>另有 ${continuingTasks.length - 5} 项任务，建议打开底表查看。</small>` : ''}
        </div>
      </div>
    `);
  }

  if (!sections.length) {
    sections.push('<p>当天暂无计划任务、里程碑或节假日。</p>');
  }

  const phaseText = data.activePhases[0] ? `阶段：${data.activePhases[0].title}` : '暂无进行中阶段';
  detail.className = `day-detail ${sections.length ? '' : 'empty'}`;
  detail.innerHTML = `
    <div class="day-detail-head">
      <span>${formatDateLabel(selected)}</span>
      <b>${isToday ? '今日' : `${data.tasks.length}项任务`}</b>
    </div>
    <h3 id="calendarModalTitle">${escapeHtml(phaseText)}</h3>
    ${sections.join('')}
  `;
}

function renderCalendar() {
  if (!document.querySelector('#calendarMonth')) return;
  const year = calendarCursor.getFullYear();
  const month = calendarCursor.getMonth();
  const monthStart = new Date(year, month, 1);
  const startOffset = (monthStart.getDay() + 6) % 7;
  const gridStart = new Date(year, month, 1 - startOffset);

  document.querySelector('#calendarMonth').textContent = formatMonth(calendarCursor);
  const monthKey = dateKey(monthStart).slice(0, 7);
  const monthlyDeadlines = ganttPlan.keyRows.filter((row) => row.type === 'task' && row.end?.startsWith(monthKey)).length;
  const monthlyMilestones = milestones.filter((item) => item.date?.startsWith(monthKey)).length;
  document.querySelector('#calendarSummary').textContent = `本月 ${monthlyDeadlines}项计划截止 · ${monthlyMilestones}个里程碑`;

  const cells = [];
  for (let index = 0; index < 42; index += 1) {
    const day = new Date(gridStart);
    day.setDate(gridStart.getDate() + index);
    const data = getCalendarDayData(day);
    const holidayCountries = new Set(data.holidays.map((holiday) => holiday.country));
    const markers = renderCalendarMarkers(data);
    const classes = ['day'];
    if (day.getMonth() !== month) classes.push('muted');
    if (sameDay(day, today)) classes.push('today');
    if (dateKey(day) === selectedCalendarDate) classes.push('selected');
    if (day.getDay() === 0 || day.getDay() === 6) classes.push('weekend');
    if (data.dueTasks.length) classes.push('deadline');
    if (data.milestones.length) classes.push('milestone');
    if (data.holidays.length) classes.push('holiday');
    if (holidayCountries.has('CN')) classes.push('holiday-cn');
    if (holidayCountries.has('TH')) classes.push('holiday-th');
    const title = [
      dateKey(day),
      `${data.tasks.length}项计划任务`,
      `${data.dueTasks.length}项计划截止`,
      ...data.tasks.slice(0, 2).map((task) => task.title),
      ...data.milestones.map((milestone) => milestone.title),
      ...data.holidays.map((holiday) => `${holidayCountryLabel(holiday.country)} ${holiday.name}`),
    ]
      .filter(Boolean)
      .join(' | ');

    cells.push(`
      <button class="${classes.join(' ')}" type="button" data-date="${dateKey(day)}" aria-label="${escapeAttribute(title)}" ${sameDay(day, today) ? 'aria-current="date"' : ''} title="${escapeAttribute(title)}">
        <span class="day-number">${day.getDate()}</span>
        ${markers ? `<span class="day-annotations">${markers}</span>` : ''}
      </button>
    `);
  }

  document.querySelector('#calendarDays').innerHTML = cells.join('');
  if (calendarModalOpen) renderCalendarDetail();
}

function boot() {
  const selected = new URL(window.location.href).searchParams.get('project');
  activeProject = projectCatalog.find(project => project.id === selected) || projectCatalog[0];
  restorePlanCache();
  renderShell();
  renderGanttBoard();
  renderCompactPhases();
  renderCalendar();
  taskEditor = createTaskEditor({ onPlan: applyEditedPlan });
  ganttTodayTimer = window.setInterval(updateTodayMarker, 60000);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) updateTodayMarker(); });
  window.addEventListener('focus', updateTodayMarker);
  syncBitableData();
}

boot();
