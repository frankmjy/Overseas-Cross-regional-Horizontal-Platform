import test from 'node:test';
import assert from 'node:assert/strict';
import { buildProjectFocus, focusDemoRows, renderProjectFocus } from '../src/project-focus.js';

const now = '2026-10-26';
const row = (code, fields = {}) => ({ type: 'task', recordId: `rec${code}`, code, title: code, status: '进行中', priority: 'P1', end: '2026-10-30', phase: 'blue', ...fields });
const plan = rows => ({ keyRows: rows, phases: [{ tone: 'blue', short: '合规筹备' }] });

test('focus counts unfinished priorities and overdue work once, including milestones', () => {
  const model = buildProjectFocus(plan([
    row('done', { priority: 'P0', status: '已完成', end: '2026-10-01' }),
    row('late', { priority: 'P0', end: '2026-10-25' }),
    row('normal'), row('low-late', { priority: 'P2', end: '2026-10-20' }),
    row('low-future', { priority: 'P2' }), row('node', { type: 'milestone', end: now }),
    row('phase', { type: 'phase' }),
  ]), now);
  assert.deepEqual(model.counts, { all: 4, stuck: 2, key: 3, soon: 2, high: 1 });
  assert.deepEqual(model.items.map(item => item.code), ['late', 'low-late', 'node', 'normal']);
  assert.equal(model.stages[0].total, 4);
  assert.equal(model.stages[0].stuck, 2);
  assert.equal(model.stages[0].key, 2);
  assert.equal(model.buckets.reduce((sum, part) => sum + part.count, 0), model.counts.all);
});

test('dates are civil days: today is due, next seven days inclusive, invalid dates remain unscheduled', () => {
  const model = buildProjectFocus(plan([row('today', { end: now }), row('seven', { end: '2026-11-02' }), row('eight', { end: '2026-11-03' }), row('invalid', { end: '2026-02-30' })]), now);
  assert.equal(model.counts.stuck, 0);
  assert.equal(model.counts.soon, 2);
  assert.equal(model.items.find(item => item.code === 'invalid').due, '');
});

test('latest follow-up is shown without treating old notes as new progress', () => {
  const feedback = '旧记录\n\n【跟进 2 · 2026-10-25 15:30 · 编辑甲】\n第一版\n\n【跟进 3 · 2026-10-26 09:10 · 编辑乙】\n已提交清单';
  const model = buildProjectFocus(plan([row('one', { feedback, requirements: '提供合同原件', owner: '负责人甲' })]), now);
  assert.equal(model.items[0].feedback, '已提交清单');
  assert.equal(model.items[0].owner, '负责人甲');
  assert.equal(model.items[0].requirements, '提供合同原件');
});

test('demo never changes project counts or exposes an editable record identity', () => {
  const source = plan([]), model = buildProjectFocus(source, now);
  assert.equal(model.counts.all, 0);
  const demo = buildProjectFocus({ ...source, keyRows: focusDemoRows(now) }, now, true);
  assert.equal(demo.counts.all, 6);
  assert.ok(demo.items.every(item => !item.recordId));
  assert.ok(demo.counts.stuck > 0 && demo.counts.soon > 0);
  const html = renderProjectFocus(demo, { mode: 'demo', filter: 'all', projectName: '项目甲' });
  assert.match(html, /演示数据/);
  assert.doesNotMatch(html, /data-focus-task=/);
  assert.equal(source.keyRows.length, 0);
});

test('filters preserve global chart totals and escape all source content', () => {
  const model = buildProjectFocus(plan([row('late', { end: '2026-10-25', title: '<img src=x onerror=1>', feedback: '<script>bad</script>', owner: '甲"乙' }), row('future')]), now);
  const html = renderProjectFocus(model, { mode: 'live', filter: 'stuck', projectName: '<项目>' });
  assert.match(html, /&lt;img src=x onerror=1&gt;/);
  assert.doesNotMatch(html, /<script>|<img|<h4>future/);
  assert.match(html, /data-focus-task="reclate"/);
  assert.match(html, /aria-pressed="true"[^>]*>关键卡点/);
  assert.match(html, /阶段分布/);
  assert.match(renderProjectFocus(buildProjectFocus(plan([]), now), { mode: 'live', filter: 'all' }), /暂无待攻坚事项/);
});

test('long focus lists paginate without losing totals or task identities', () => {
  const model = buildProjectFocus(plan(Array.from({ length: 20 }, (_, i) => row(String(i).padStart(2, '0')))), now);
  const html = renderProjectFocus(model, { page: 2 });
  assert.equal((html.match(/class="focus-item /g) || []).length, 8);
  assert.match(html, /focus-item-mark">09</);
  assert.match(html, /2 \/ 3/);
  assert.match(html, /全部<span>20/);
});
