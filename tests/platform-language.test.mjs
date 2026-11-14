import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { translateInterface, translateProjectTitle, translateWeekday } from '../src/platform-translations.js';

test('English labels support dynamic schedule summaries and preserve unknown content', () => {
  assert.equal(translateInterface('计划开始 2026/09/10'), 'Planned start 2026/09/10');
  assert.equal(translateInterface('11个里程碑'), '11 milestones');
  assert.equal(translateInterface('01 项目筹备'), '01 Preparation');
  assert.equal(translateInterface('今天 11/13'), 'Today 11/13');
  assert.equal(translateInterface('6组周期待复核'), '6 groups need schedule review');
  assert.equal(translateInterface('飞书多维表 · 11/13 17:06'), 'Feishu Bitable · 11/13 17:06');
  assert.equal(translateInterface('2026-11-13，1项截止，0个里程碑'), '2026-11-13, 1 task due, 0 milestones');
  assert.equal(translateInterface('覆盖5类工作，64项待推进。'), '5 categories, 64 pending.');
  assert.equal(translateInterface('＋ 添加交付物'), '＋ Add deliverable');
  assert.equal(translateInterface('关闭交付物管理前须核对记录'), '关闭交付物管理前须核对记录');
});

test('known project milestones translate without altering unlisted record titles', () => {
  assert.equal(translateProjectTitle('一期60MW交付'), 'Phase 1 Delivery (60 MW)');
  assert.equal(translateProjectTitle('团队筹备'), 'Team Setup');
  assert.equal(translateProjectTitle('岗位缺口补充（内部招募&外聘）'), 'Fill Staffing Gaps Through Internal and External Hiring');
  assert.equal(translateProjectTitle('项目管理'), '项目管理');
  assert.equal(translateInterface('二期40MW'), 'Phase 2 · 40 MW');
  assert.equal(translateWeekday('一'), 'Mon');
  assert.equal(translateInterface('一'), '一');
});

test('every production page template loads the shared language switch', async () => {
  const entries = [
    'index.html', 'auth/web/login.html', 'auth/web/admin.html', 'coordination/web/index.html',
    'research/web/index.html', 'knowledge/web/index.html', 'project-tasks/staffing/web/index.html',
    'samples/handover-preview/index.html'
  ];
  for (const entry of entries) {
    const html = await readFile(new URL('../' + entry, import.meta.url), 'utf8');
    assert.match(html, /src="\/src\/platform-language\.js"/, entry);
    assert.match(html, /href="\/src\/platform-language\.css"/, entry);
  }
});
