import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import vm from 'node:vm';
import { groupTopics } from '../research/web/topics.mjs';
const researchProjects=[{key:'thailand',name:'泰国项目'},{key:'malaysia',name:'马来项目'}];
import { matchesResearchRange as matches, rangeProjectKeys as keys } from '../research/web/unified-research.mjs';
const rangeOptions=[...researchProjects,{key:'common',name:'通用'}],matchesResearchRange=(q,r)=>matches(q,r,researchProjects),rangeProjectKeys=r=>keys(r,researchProjects);
import { renderComparisonEntry, comparisonForQuestion } from '../src/diagram-viewer.js';
import { topicProgress } from '../research/web/topic-progress.mjs';

async function workspace() {
  const source = (await fs.readFile(new URL('../research/web/app.mjs', import.meta.url), 'utf8'))
    .replace('const platformProject = await requirePlatformProject();', 'const platformProject = {id: "my-001", name: "马来项目", researchKey: "malaysia"};')
    .replace(/^import .+;$/gm, '').replace(/^poll\(\);$/m, '');
  const surface = { addEventListener() {} };
  const location = { search: '', pathname: '/', origin: 'https://example.test' };
  const context = vm.createContext({
    URL, URLSearchParams, location, researchProjects, rangeOptions, matchesResearchRange, rangeProjectKeys, groupTopics, renderComparisonEntry, comparisonForQuestion, topicProgress,
    document: { querySelector: () => surface, addEventListener() {} }, window: { addEventListener() {} },
    history: { replaceState(_state, _title, url) { location.search = url.includes('?') ? url.slice(url.indexOf('?')) : ''; } },
  });
  vm.runInContext(`${source}\nglobalThis.workspace = { matrixPage, filteredQuestions, renderMatrix, renderTopicProgress, renderPagination, renderCategories, renderSidebar, renderControls, renderQuestionStepper, readState, updateUrl,
    load(data) { indexData(data); }, set(next) { Object.assign(state, next); }, state() { return state; } };`, context);
  const companies = [{ name: '万国数据', code: 'GDS', color: 'blue' }, { name: '秦淮数据', code: 'BDC', color: 'teal' }];
  const questions = Array.from({ length: 126 }, (_, index) => ({ id: `malaysia:Q-${index}`, title: `问题 ${index}`, category: index < 60 ? '组织与人才' : '运维与验证', projectKey: 'malaysia', projectName: '马来项目', applicability: '本项目', priority: index === 0 }));
  const findings = questions.flatMap(q => companies.map(company => ({ id: `${q.id}-${company.code}`, questionId: q.id, company: company.name, hasMaterial: false, content: '', proof: '' })));
  const data = { categories: ['组织与人才', '运维与验证'], questions, companies, findings, evidence: [], deletedQuestions: [] };
  context.workspace.load(data);
  return { app: context.workspace, questions, findings, location };
}

test('continuous browsing exposes every filtered question by default', async () => {
  const { app, questions } = await workspace();
  const page = app.matrixPage(questions);
  assert.equal(page.pageSize, 0);
  assert.equal(page.rows.length, 126);
  assert.equal(page.pages, 1);
  const html = app.renderMatrix(questions);
  assert.equal((html.match(/class="question-row"/g) || []).length, 126);
  assert.match(html, /126 项 · 连续浏览/);
  assert.doesNotMatch(html, /data-page=/);
});

test('topic progress exposes focus buttons and counts entries without invented completion', async () => {
  const { app, questions } = await workspace();
  const html = app.renderTopicProgress(questions);
  assert.match(html, /专题进度/); assert.match(html, /已有数据/);
  assert.match(html, /0 \/ 126/); assert.match(html, /aria-valuenow="0"/);
  assert.match(html, /<button[^>]*data-topic-focus="组织与人才"/);
  assert.doesNotMatch(html, /已完成|NaN|\?\?\?\?/);
  assert.match(app.renderTopicProgress([]), /—/);
});

test('data-bearing entries come first inside each topic and track selected companies', async () => {
  const { app, questions, findings } = await workspace();
  const filled = findings.find(f => f.questionId === questions[20].id && f.company === '万国数据');
  filled.hasMaterial = true;
  app.set({ categories: ['组织与人才'] });
  assert.equal(app.filteredQuestions()[0].id, questions[20].id);
  assert.equal(app.filteredQuestions().length, 60);
  assert.match(app.renderTopicProgress(app.filteredQuestions()), /aria-pressed="true"/);
  app.set({ companies: ['秦淮数据'] });
  assert.equal(app.filteredQuestions()[0].id, questions[0].id);
});

test('Malaysia team comparison has its own icon outside the existing question and rename buttons', async()=>{
  const {app,questions}=await workspace();
  questions[0].sourceId='Q-001';questions[0].title='团队人员配置';
  const html=app.renderMatrix(questions);
  assert.equal((html.match(/data-team-comparison/g)||[]).length,1);
  assert.match(html,/<\/button><button[^>]*row-comparison/);
  assert.match(html,/data-rename-question/);
  questions[0].projectKey='thailand';
  assert.doesNotMatch(app.renderMatrix(questions),/data-team-comparison/);
});

test('optional paging clamps direct jumps and includes the final partial page', async () => {
  const { app, questions } = await workspace();
  app.set({ pageSize: 25, page: 99 });
  const last = app.matrixPage(questions);
  assert.equal(app.state().page, 6);
  assert.equal(last.rows.length, 1);
  assert.equal(last.rows[0].id, questions[125].id);
  assert.match(app.renderPagination(126, 25), /id="pageJump"/);
  app.set({ pageSize: 50, page: 2 });
  assert.equal(app.matrixPage(questions).rows[0].id, questions[50].id);
  app.set({ pageSize: 7, page: 3 });
  assert.equal(app.matrixPage(questions).rows.length, 126);
  assert.equal(app.state().page, 1);
});

test('density and page size round-trip through the URL with safe defaults', async () => {
  const { app, location } = await workspace();
  app.set({ density: 'comfortable', pageSize: 50 });
  app.updateUrl();
  assert.match(location.search, /density=comfortable/);
  assert.match(location.search, /rows=50/);
  app.readState();
  assert.equal(app.state().density, 'comfortable');
  assert.equal(app.state().pageSize, 50);
  location.search = '?density=unknown&rows=999999';
  app.readState();
  assert.equal(app.state().density, 'compact');
  assert.equal(app.state().pageSize, 0);
});

test('topic shortcuts keep checkbox selection while exposing one-click topic focus', async () => {
  const { app } = await workspace();
  const html = app.renderCategories();
  assert.match(html, /data-topic-focus="组织与人才"/);
  assert.match(html, /data-category-check="组织与人才"/);
  app.set({ categories: ['组织与人才'] });
  assert.match(app.renderCategories(), /aria-pressed="true"/);
});

test('question navigation stays inside the filtered topic and disables boundaries', async () => {
  const { app, questions } = await workspace();
  app.set({ categories: ['组织与人才'] });
  assert.match(app.renderQuestionStepper(questions[0].id), /data-detail-step="-1" disabled/);
  assert.match(app.renderQuestionStepper(questions[59].id), /data-detail-step="1" disabled/);
  assert.match(app.renderQuestionStepper(questions[20].id), /21 \/ 60/);
  assert.equal(app.renderQuestionStepper(questions[60].id), '');
});

test('empty results retain footer actions without inventing a 1–0 range', async () => {
  const { app } = await workspace();
  const html = app.renderPagination(0, 25);
  assert.match(html, />0 项</);
  assert.match(html, /data-tasks/);
  assert.match(html, /data-deleted-questions/);
  assert.doesNotMatch(html, /1–0/);
});

test('overview comes first by default and explicit list URLs survive a reload',async()=>{
 const {app,location}=await workspace();app.readState();assert.equal(app.state().view,'overview');
 const controls=app.renderControls();assert(controls.indexOf('data-research-view="overview"')<controls.indexOf('data-research-view="list"'));
 app.set({view:'list'});app.updateUrl();assert.match(location.search,/view=list/);app.readState();assert.equal(app.state().view,'list');
 location.search='?view=unknown';app.readState();assert.equal(app.state().view,'overview');
});
