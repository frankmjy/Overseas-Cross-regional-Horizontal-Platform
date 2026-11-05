import test from 'node:test';
import assert from 'node:assert/strict';
import { buildProjectWeekly, renderProjectWeekly } from '../src/project-weekly.js';
import { taskEditorPatch } from '../src/task-editor.js';

const task = (id, start, end, more = {}) => ({ type: 'task', recordId: id, code: id, title: id, start, end, status: '进行中', priority: 'P1', phase: 'blue', ...more });
const plan = rows => ({ keyRows: rows, phases: [{ tone: 'blue', short: '合规筹备' }] });
const rows = [task('carry', '2026-09-01', '2026-10-20', { priority: 'P0' }), task('current', '2026-10-26', '2026-10-30'),
  task('overlap', '2026-10-01', '2026-11-20'), task('next', '2026-11-02', '2026-11-04'),
  task('done', '2026-10-01', '2026-10-29', { status: '已完成', progress: 100 }), task('unscheduled', '', '')];

test('weekly selects unfinished overlapping plans and earlier overdue items once, never completed or undated rows', () => {
  const model = buildProjectWeekly(plan(rows), { anchor: '2026-10-27', today: '2026-10-27' });
  assert.equal(model.start, '2026-10-26'); assert.equal(model.end, '2026-11-01');
  assert.deepEqual(model.current.map(row => row.recordId), ['carry', 'current', 'overlap']);
  assert.equal(model.overdue.length, 1);
  assert.equal(model.priorityItems.length, 6);
  assert.ok(model.priorityItems.every(item => !item.recordId));
  assert.deepEqual(model.next.map(row => row.recordId), ['next', 'overlap']);
  assert.equal(model.stages.reduce((sum, stage) => sum + stage.total, 0), model.current.length);
});

test('week windows cross years and Sunday belongs to the preceding Monday', () => {
  const model = buildProjectWeekly(plan([]), { anchor: '2027-01-03', today: '2027-01-03' });
  assert.equal(model.start, '2026-12-28'); assert.equal(model.nextStart, '2027-01-04');
  assert.throws(() => buildProjectWeekly(plan([]), { anchor: '2026-02-30', today: '2026-10-27' }), /date/i);
});

test('period selection uses that week cut-off while current week uses today; boundary dates remain planned', () => {
  const model = buildProjectWeekly(plan([task('friday', '2026-10-19', '2026-10-23'), task('sunday', '2026-10-25', '2026-10-25')]), { anchor: '2026-10-20', today: '2026-10-27' });
  assert.equal(model.overdue.length, 1);
  assert.equal(model.current.length, 2);
});

test('render distinguishes missing meeting source from zero todos, filters and escapes source fields', () => {
  const model = buildProjectWeekly(plan(rows), { anchor: '2026-10-27', today: '2026-10-27' });
  model.current[0].title = '<script>bad</script>';
  const html = renderProjectWeekly(model, { filter: 'overdue' });
  assert.match(html, /会议待办/); assert.match(html, /待接入/);
  assert.match(html, /&lt;script&gt;bad&lt;\/script&gt;/); assert.doesNotMatch(html, /<script>|演示数据/);
  assert.equal((html.match(/data-weekly-update="carry"/g) || []).length, 1);
  assert.match(renderProjectWeekly(buildProjectWeekly(null, { anchor: '2026-10-27', today: '2026-10-27' })), /正在读取项目计划/);
});

test('cards switch exclusive views with one selected card and never stack other panels', () => {
  const model = buildProjectWeekly(plan(rows), { anchor: '2026-10-27', today: '2026-10-27' });
  for (const view of ['current', 'overdue', 'focus', 'meetings', 'next']) {
    const html = renderProjectWeekly(model, { view });
    assert.equal((html.match(/data-weekly-view="[^"]+" aria-pressed="true"/g) || []).length, 1);
    assert.match(html, new RegExp(`data-weekly-panel="${view}"`));
    assert.equal(html.includes('id="weekly-meetings"'), view === 'meetings');
    assert.equal(html.includes('id="weekly-next"'), view === 'next');
    assert.equal(html.includes('class="weekly-chart-grid"'), view === 'current');
    assert.equal(html.includes('id="weekly-current"'), ['current', 'overdue'].includes(view));
    assert.doesNotMatch(html, /weekly-section-nav|data-weekly-overview/);
  }
  assert.match(renderProjectWeekly(model, { view: 'invalid' }), /data-weekly-panel="current"/);
  assert.equal((renderProjectWeekly(model, { view: 'overdue' }).match(/data-weekly-update=/g) || []).length, 1);
  assert.match(renderProjectWeekly({ ...model, meetingTodos: [] }, { view: 'meetings' }), /暂无会议待办/);
});

test('follow-up submission is feedback-only, trims new text and never clears other task fields', () => {
  const current = { values: { title: '原任务', owner: ['ou_one'], feedback: '历史记录' }, latestFeedback: '上一条' };
  assert.deepEqual(taskEditorPatch({ feedback: '  本次跟进  ', title: '不应修改', owner: [] }, current, true), { feedback: '本次跟进' });
  assert.deepEqual(taskEditorPatch({ feedback: '  ' }, current, true), {});
  assert.deepEqual(taskEditorPatch({ title: '原任务', owner: ['ou_one'], feedback: '上一条' }, current), {});
});

test('accepted and failed synchronization remain visible instead of reporting remote success', () => {
  const model = buildProjectWeekly(plan([task('pending', '2026-10-26', '2026-10-30', { sync: { status: 'accepted' } }), task('failed', '2026-10-26', '2026-10-31', { sync: { status: 'error' } })]), { anchor: '2026-10-27', today: '2026-10-27' });
  const html = renderProjectWeekly(model);
  assert.match(html, /role="status">同步中/);
  assert.match(html, /role="status">待同步/);
  assert.doesNotMatch(html, /已同步到多维表/);
});
