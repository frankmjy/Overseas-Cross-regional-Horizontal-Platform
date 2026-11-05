import test from 'node:test';
import assert from 'node:assert/strict';
import { workspacePages, buildWorkspaceDemo, renderWorkspaceSidebar, renderWorkspacePage, createProjectWorkspace } from '../src/project-workspace.js';

test('navigation contains overview, reporting, organization and distinct stage pages', () => {
  const ids = workspacePages.map(page => page.id);
  assert.equal(new Set(ids).size, ids.length);
  for (const id of ['overview', 'weekly', 'monthly', 'organization', 'preparation', 'construction', 'validation', 'handover']) assert.ok(ids.includes(id));
  const html = renderWorkspaceSidebar('validation');
  assert.equal((html.match(/aria-current="page"/g) || []).length, 1);
  assert.match(html, /data-workspace-page="validation" aria-label="验证测试" aria-current="page"/);
});

test('all preview counts and charts derive from the same sample rows', () => {
  const model = buildWorkspaceDemo('2026-10-26');
  assert.equal(model.tasks.length, 20);
  assert.equal(model.stats.total, model.stats.done + model.stats.active + model.stats.waiting);
  assert.equal(model.stages.reduce((sum, stage) => sum + stage.total, 0), model.stats.total);
  assert.equal(model.stages.reduce((sum, stage) => sum + stage.done, 0), model.stats.done);
  assert.equal(model.team.reduce((sum, group) => sum + group.people.length, 0), model.people.length);
  assert.ok(model.tasks.every(task => !task.recordId));
});

test('each page is distinct, explicitly demo, and contains working detail identities', () => {
  const model = buildWorkspaceDemo('2026-10-26');
  for (const page of workspacePages.filter(page => !['overview', 'weekly'].includes(page.id))) {
    const html = renderWorkspacePage(page.id, model);
    assert.match(html, /演示数据/);
    assert.match(html, new RegExp(page.label));
    assert.doesNotMatch(html, /data-edit-task|fetch\(|data-focus-task/);
    if (page.id !== 'organization') assert.match(html, /data-workspace-detail=/);
  }
  assert.match(renderWorkspacePage('validation', model), /测试通过率/);
  assert.match(renderWorkspacePage('monthly', model), /月度完成趋势/);
  assert.match(renderWorkspacePage('weekly', model), /下周计划/);
  assert.doesNotMatch(renderWorkspacePage('weekly', model), /演示数据/);
});

test('status filtering changes visible task rows while preserving overview counts', () => {
  const model = buildWorkspaceDemo('2026-10-26');
  const html = renderWorkspacePage('validation', model, { status: '已完成' });
  const rows = model.tasks.filter(task => task.stage === 'validation' && task.status === '已完成');
  assert.equal((html.match(/data-workspace-detail=/g) || []).length, rows.length);
  assert.match(html, /value="已完成" selected/);
});

test('preview does not interpolate arbitrary dates or unknown page keys', () => {
  assert.throws(() => buildWorkspaceDemo('2026-02-30'), /date/i);
  assert.throws(() => renderWorkspacePage('unknown', buildWorkspaceDemo('2026-10-26')), /page/i);
});

test('revealing the hidden overview requests centering once; normal refresh preserves a panned timeline', () => {
  const previousWindow = globalThis.window;
  let href = 'https://localhost:3333/project-management?section=weekly', onClick, centered = 0;
  const overview = { hidden: false, focus() {} }, content = { hidden: true, addEventListener() {}, focus() {} }, hero = {};
  globalThis.window = { location: { get href() { return href; } }, history: { replaceState(_state, _title, url) { href = String(url); } }, scrollTo() {} };
  const root = { querySelector: selector => ({ '#workspacePage': content, '#projectOverview': overview, '.project-command': hero })[selector], querySelectorAll: () => [], addEventListener(_type, handler) { onClick = handler; } };
  try {
    const workspace = createProjectWorkspace({ root, today: '2026-10-27', onOverviewVisible: () => centered++ });
    assert.equal(overview.hidden, true); assert.equal(centered, 0);
    onClick({ preventDefault() {}, target: { closest: selector => selector === '[data-workspace-page]' ? { dataset: { workspacePage: 'overview' } } : null } });
    assert.equal(overview.hidden, false); assert.equal(centered, 1);
    workspace.refresh();
    assert.equal(centered, 1);
  } finally { if (previousWindow === undefined) delete globalThis.window; else globalThis.window = previousWindow; }
});
