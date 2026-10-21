import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import vm from 'node:vm';

async function page({ storage = new Map(), fetchPlan = () => { throw new Error('Unexpected request'); } } = {}) {
  const source = (await fs.readFile(new URL('../src/app.js', import.meta.url), 'utf8'))
    .replace(/^import .+;\r?$/gm, '')
    .replace(/\nboot\(\);\s*$/, '');
  const cards = { innerHTML: '' };
  const month = { textContent: '' };
  const days = { innerHTML: '' };
  const summary = { textContent: '' };
  const status = { textContent: '', dataset: {}, hidden: true };
  const board = { innerHTML: '', setAttribute() {} };
  const refresh = { innerHTML: '', disabled: false };
  const update = { textContent: '' };
  const context = vm.createContext({
    defaultLegalHolidays: [], URL, AbortController, DOMException, fetch: fetchPlan,
    window: { setTimeout() {}, clearTimeout() {}, localStorage: { getItem: key => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, value) } },
    document: { querySelector: selector => ({ '#phaseCards': cards, '#calendarMonth': month, '#calendarDays': days, '#calendarSummary': summary, '#planSyncStatus': status, '#ganttBoard': board, '.refresh': refresh, '.update-time': update })[selector] || null },
  });
  vm.runInContext(`${source}\nglobalThis.page = { renderKpiCards, renderGanttRow, renderDeliverableEntry, renderCompactPhases, getDetailCardData, getCalendarDayData, renderCalendarMarkers, renderCalendar, ganttPosition, restorePlanCache, savePlanCache, renderPlanSkeleton, syncBitableData, renderProjectPicker,
    selectProject(id) { resetProjectState(projectCatalog.find(project => project.id === id)); },
    load(data) { ganttPlan = data.ganttPlan; phases = data.phases; milestones = data.milestones; },
    snapshot() { return { ganttPlan, phases, milestones, project: activeProject.id, planState, planCacheNotice }; } };`, context);
  return { app: context.page, cards, days, summary, storage, status, board };
}

const phase = { no: '01', title: '源表阶段', short: '源表阶段', total: 3, completed: 1, remaining: 2, progress: 33, status: '进行中', tone: 'blue', tasks: ['源表任务'], desc: '源表说明' };
const row = { type: 'task', code: '001-62', recordId: 'recTask', title: '源表任务', start: '', end: '', priority: 'P1', status: '已完成', sourceStatus: '逾期完成', progress: 100, phase: 'blue', deliverables: [] };
const data = { ganttPlan: { totalTasks: 3, completedTasks: 1, p0Tasks: 1, milestoneCount: 0, durationDays: 5, rangeStart: '2026-06-01', rangeEnd: '2026-06-05', keyRows: [row], phases: [phase], riskRadar: [], gaps: [] }, phases: [phase], milestones: [] };
const cacheData = { ...data, syncedAtLabel: '10/21 08:00', ganttPlan: { ...data.ganttPlan, source: { baseUrl: 'https://vnet.feishu.cn/base/CID8b8V7CaCtKesWGFKcHTdqnlc?table=tblSpSvqS2FMpHks', tableId: 'tblSpSvqS2FMpHks' } } };

test('one compact project trigger exposes grouped options with exactly one current selection', async () => {
  const { app } = await page();
  for (const id of ['th-001', 'th-002', 'my-001', 'my-002']) {
    app.selectProject(id);
    const html = app.renderProjectPicker();
    assert.equal((html.match(/id="projectPickerTrigger"/g) || []).length, 1);
    assert.match(html, /aria-haspopup="menu" aria-expanded="false"/);
    assert.match(html, /role="menu"[^>]*hidden/);
    assert.equal((html.match(/role="menuitemradio"/g) || []).length, 4);
    assert.equal((html.match(/aria-checked="true"/g) || []).length, 1);
    assert.match(html, new RegExp(`aria-checked="true"[^>]*data-project-id="${id}"`));
    assert.match(html, /project-group-TH/);
    assert.match(html, /project-group-MY/);
    assert.doesNotMatch(html, /<select|projectCountry|projectSelect/);
  }
});

test('a successful snapshot restores real source values before the next refresh', async () => {
  const first = await page();
  assert.equal(first.app.savePlanCache(cacheData), true);
  const second = await page({ storage: first.storage });
  assert.equal(second.app.restorePlanCache(), true);
  assert.equal(second.app.snapshot().ganttPlan.keyRows[0].recordId, row.recordId);
  assert.equal(second.app.snapshot().phases[0].progress, 33);
});

test('invalid or cross-source snapshots never become displayed project data', async () => {
  const first = await page();
  first.app.savePlanCache(cacheData);
  const key = [...first.storage.keys()][0];
  for (const value of ['{broken', JSON.stringify({ version: 1, data: {} }), JSON.stringify({ version: 1, data: { ...cacheData, ganttPlan: { ...cacheData.ganttPlan, source: { tableId: 'other' } } } })]) {
    const candidate = await page({ storage: new Map([[key, value]]) });
    assert.equal(candidate.app.restorePlanCache(), false);
    assert.equal(candidate.app.snapshot().ganttPlan, null);
  }
});

test('first visit uses a structural loading skeleton without fake values or the old empty message', async () => {
  const { app } = await page();
  const html = app.renderPlanSkeleton();
  assert.match(html, /plan-skeleton/);
  assert.doesNotMatch(html, /正在连接泰国项目任务表|同步成功后显示|<strong>\d+/);
});

test('unconnected projects cannot reuse the Thailand snapshot or trigger a Thailand sync', async () => {
  let calls = 0;
  const { app } = await page({ fetchPlan: () => { calls++; } });
  app.savePlanCache(cacheData);
  assert.equal(app.restorePlanCache(), true);
  for (const id of ['th-002', 'my-001', 'my-002']) {
    app.selectProject(id);
    assert.equal(app.restorePlanCache(), false);
    assert.equal(app.snapshot().ganttPlan, null);
    await app.syncBitableData();
  }
  assert.equal(calls, 0);
  app.selectProject('th-001');
  assert.equal(app.restorePlanCache(), true);
});

test('a late response from the old project cannot overwrite the new workspace', async () => {
  let finish;
  let signal;
  const { app } = await page({ fetchPlan: (_url, options) => {
    signal = options.signal;
    return new Promise(resolve => { finish = resolve; });
  } });
  const pending = app.syncBitableData();
  app.selectProject('my-001');
  assert.equal(signal.aborted, true);
  finish({ ok: true, json: async () => ({ ok: true, data: cacheData }) });
  await pending;
  assert.equal(app.snapshot().project, 'my-001');
  assert.equal(app.snapshot().ganttPlan, null);
});

test('background refresh failure keeps the last successful snapshot and exposes a retry error', async () => {
  const { app, status } = await page({ fetchPlan: async () => { throw new TypeError('offline'); } });
  app.savePlanCache(cacheData);
  app.restorePlanCache();
  await app.syncBitableData();
  assert.equal(app.snapshot().ganttPlan.keyRows[0].recordId, row.recordId);
  assert.equal(app.snapshot().planState, 'error');
  assert.equal(status.hidden, false);
  assert.match(status.textContent, /保留上次成功/);
});

test('storage failure does not turn a successful live sync into success-looking cached data', async () => {
  const storage = new Map();
  storage.set = () => { throw new Error('quota'); };
  const { app } = await page({ storage });
  assert.equal(app.savePlanCache(cacheData), false);
  assert.match(app.snapshot().planCacheNotice, /无法保存快照/);
});

test('initial project page has no static task fallback or invented indicators', async () => {
  const { app } = await page();
  assert.equal(app.snapshot().ganttPlan, null);
  assert.equal(app.snapshot().phases.length, 0);
  assert.match(app.renderKpiCards(), /<strong>—<\/strong>/);
  assert.doesNotMatch(app.renderKpiCards(), /<strong>\d+<\/strong>/);
});

test('phase cards show source-based completed and remaining counts', async () => {
  const { app, cards } = await page();
  app.load(data);
  app.renderCompactPhases();
  assert.match(cards.innerHTML, /<strong>2<\/strong>/);
  assert.match(cards.innerHTML, /完成 1/);
  assert.match(cards.innerHTML, /--value:33%/);
  assert.match(cards.innerHTML, /完成进度<\/span><strong>33%<\/strong>/);
  assert.match(cards.innerHTML, /role="progressbar"[^>]*aria-valuenow="33"/);
  assert.match(cards.innerHTML, /进行中/);
});

test('gantt retains source task codes, raw statuses and an explicit unscheduled row', async () => {
  const { app } = await page();
  app.load(data);
  const html = app.renderGanttRow(row);
  assert.match(html, /001-62/);
  assert.match(html, /逾期完成/);
  assert.match(html, /未排期/);
  assert.doesNotMatch(html, /class="gantt-bar/);
});

test('deliverables stay hidden when absent, direct when single, and selectable when multiple', async () => {
  const { app } = await page();
  const files = [{ name: '合同 <原件>', url: 'https://vnet.feishu.cn/docx/one' }, { name: '附件二', url: 'https://vnet.feishu.cn/sheets/two' }];
  assert.equal(app.renderDeliverableEntry(row), '');
  const single = app.renderDeliverableEntry({ ...row, deliverables: files.slice(0, 1) });
  assert.match(single, /href="https:\/\/vnet.feishu.cn\/docx\/one"/);
  assert.match(single, /target="_blank" rel="noopener noreferrer"/);
  assert.match(single, /合同 &lt;原件&gt;/);
  const withFiles = { ...row, deliverables: files };
  app.load({ ...data, ganttPlan: { ...data.ganttPlan, keyRows: [withFiles] } });
  assert.match(app.renderDeliverableEntry(withFiles), /data-detail-card="deliverables-recTask"/);
  assert.match(app.renderDeliverableEntry(withFiles), /交付物 2/);
  const detail = app.getDetailCardData('deliverables-recTask');
  assert.equal(detail.sections[0].items.length, 2);
  assert.equal(detail.sections[0].items[1].url, files[1].url);
});

test('empty milestone details remain usable without dates', async () => {
  const { app } = await page();
  app.load(data);
  const detail = app.getDetailCardData('milestones');
  assert.equal(detail.stats[0].value, 0);
  assert.equal(detail.stats[1].value, '未排期');
});

test('the first indicator is a deliverables card that opens all files grouped by source task', async () => {
  const { app } = await page();
  const rows = [
    { ...row, deliverables: [{ name: '合同', url: 'https://vnet.feishu.cn/docx/one' }, { name: '配置表', url: 'https://vnet.feishu.cn/sheets/two' }] },
    { ...row, recordId: 'recOther', code: '001-2', title: '另一任务', deliverables: [{ name: '调研资料', url: 'https://vnet.feishu.cn/docx/three' }] },
  ];
  app.load({ ...data, ganttPlan: { ...data.ganttPlan, keyRows: rows } });
  const html = app.renderKpiCards();
  const first = html.slice(0, html.indexOf('</article>'));
  assert.match(first, /data-detail-card="deliverables"/);
  assert.match(first, /<h2>交付物<\/h2>/);
  assert.match(first, /<strong>3<\/strong><span>份<\/span>/);
  assert.match(first, /#icon-file/);
  const detail = app.getDetailCardData('deliverables');
  assert.equal(detail.title, '交付物');
  assert.equal(detail.stats[0].value, 3);
  assert.equal(detail.stats[1].value, 2);
  assert.equal(detail.sections.length, 2);
  assert.equal(detail.sections[1].title, '001-2 · 另一任务');
  assert.equal(detail.sections[1].items[0].url, 'https://vnet.feishu.cn/docx/three');

  app.load(data);
  assert.match(app.renderKpiCards().slice(0, app.renderKpiCards().indexOf('</article>')), /<strong>0<\/strong><span>份<\/span>/);
  const empty = app.getDetailCardData('deliverables');
  assert.match(empty.body, /暂无交付物/);
  assert.equal(empty.sections.length, 0);
});

test('completion is an explicit read-only column driven by the task status', async () => {
  const { app } = await page();
  app.load(data);
  const complete = app.renderGanttRow({ ...row, status: '已完成' });
  assert.match(complete, /class="gantt-completion is-complete"/);
  assert.match(complete, /aria-label="已完成：逾期完成"/);
  assert.match(complete, /<svg[^>]*aria-hidden="true"/);
  assert.doesNotMatch(complete, /type="checkbox"/);
  const unfinished = app.renderGanttRow({ ...row, status: '逾期未完成', sourceStatus: '逾期未完成', progress: 100 });
  assert.doesNotMatch(unfinished, /gantt-completion is-complete/);
});

test('calendar highlights deadlines instead of repeating active task counts', async () => {
  const { app } = await page();
  const deadline = app.renderCalendarMarkers({ tasks: [{}, {}, {}], dueTasks: [{}], milestones: [], holidays: [] });
  assert.match(deadline, /1截止/);
  assert.doesNotMatch(deadline, /3项|class="dot/);
  const holiday = app.renderCalendarMarkers({ dueTasks: [], milestones: [], holidays: [{ country: 'CN' }, { country: 'TH' }] });
  assert.match(holiday, /中泰休/);
  const milestone = app.renderCalendarMarkers({ dueTasks: [{}], milestones: [{}], holidays: [{ country: 'TH' }] });
  assert.match(milestone, /节点/);
  const none = app.renderCalendarMarkers({ tasks: [{}, {}], dueTasks: [], milestones: [], holidays: [] });
  assert.equal(none, '');
});

test('calendar separates deadline tasks from tasks continuing through the day', async () => {
  const { app, summary } = await page();
  const day = new Date();
  day.setHours(0, 0, 0, 0);
  const date = `${day.getFullYear()}-${String(day.getMonth() + 1).padStart(2, '0')}-${String(day.getDate()).padStart(2, '0')}`;
  const tomorrow = new Date(day);
  tomorrow.setDate(day.getDate() + 1);
  const later = `${tomorrow.getFullYear()}-${String(tomorrow.getMonth() + 1).padStart(2, '0')}-${String(tomorrow.getDate()).padStart(2, '0')}`;
  app.load({ ...data, ganttPlan: { ...data.ganttPlan, keyRows: [
    { ...row, start: date, end: date },
    { ...row, recordId: 'recContinuing', start: date, end: later },
    { ...row, recordId: 'recUnscheduled' },
  ] } });
  const dayData = app.getCalendarDayData(day);
  assert.equal(dayData.tasks.length, 2);
  assert.equal(dayData.dueTasks.length, 1);
  assert.equal(dayData.dueTasks[0].recordId, 'recTask');
  app.renderCalendar();
  assert.match(summary.textContent, /本月 .*项计划截止 · 0个里程碑/);
});

test('calendar date buttons expose readable descriptions and today through aria-current', async () => {
  const { app, days } = await page();
  app.load(data);
  app.renderCalendar();
  assert.match(days.innerHTML, /aria-current="date"/);
  assert.match(days.innerHTML, /aria-label="\d{4}-\d{2}-\d{2}/);
  assert.doesNotMatch(days.innerHTML, /class="dots"/);
});

test('timeline bars align with calendar-month boundaries rather than the first task day', async () => {
  const { app } = await page();
  app.load({ ...data, ganttPlan: { ...data.ganttPlan, rangeStart: '2026-06-15', rangeEnd: '2026-07-31' } });
  const position = app.ganttPosition({ type: 'task', start: '2026-06-15', end: '2026-06-15' });
  assert.ok(Math.abs(position.left - 14 / 61 * 100) < 0.001);
  assert.ok(Math.abs(position.width - 1 / 61 * 100) < 0.001);
  app.load({ ...data, ganttPlan: { ...data.ganttPlan, rangeStart: '2026-06-15', rangeEnd: '2027-03-31' } });
  const lastDay = app.ganttPosition({ type: 'task', start: '2027-03-31', end: '2027-03-31' });
  assert.ok(Math.abs(lastDay.left - 303 / 304 * 100) < 0.001);
});
