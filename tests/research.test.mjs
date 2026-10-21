import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';
import { ResearchService, normalizeRows, versionOf } from '../research/service.mjs';

class MemoryBase {
  tables = { questions: [], findings: [], evidence: [], topics: [{ recordId: 't1', 专题名称: '组织与人才' }] };
  writes = 0;
  failAfterCreate = false;
  async list(table) { return structuredClone(this.tables[table]); }
  async create(table, fields) {
    const row = { ...structuredClone(fields), recordId: `rec-${++this.writes}` };
    this.tables[table].push(row);
    if (this.failAfterCreate) { this.failAfterCreate = false; throw new Error('response lost'); }
    return row.recordId;
  }
  async update(table, id, fields) { Object.assign(this.tables[table].find(r => r.recordId === id), fields); this.writes++; }
  async ensureDeletionField() {}
  async upload() { throw new Error('not used'); }
}
async function fixture(t, base = new MemoryBase()) {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'research-test-'));
  const service = new ResearchService({ dir, base, autoRun: false });
  await service.init();
  const services = [service];
  t.after(async () => { for (const item of services) await item.close(); await rm(dir, { recursive: true, force: true }); });
  await service.refresh();
  return { service, base, dir, services };
}
const question = { kind: 'question', clientMutationId: '18a4a033-5274-4cdf-a4e4-d41061cce415', title: '人员培训怎么开展？', category: '组织与人才', priority: false };

test('release maintenance pauses durable background work and resumes after the marker is removed', async t => {
  const { service, base } = await fixture(t); let maintenance = true;
  service.isMaintenance = () => maintenance;
  await service.accept(question); await service.run(); assert.equal(base.writes, 0);
  maintenance = false; await service.run(); assert.ok(base.writes > 0);
  assert.equal(service.operation(question.clientMutationId).status, 'success');
});

test('accepted records are visible before any Feishu work, survive restart, and remain visible after failure', async t => {
  const { service, base, dir, services } = await fixture(t);
  const op = await service.accept(question);
  const snapshot = service.snapshot();
  assert.equal(snapshot.questions[0].title, question.title);
  assert.equal(snapshot.findings.length, 5);
  assert.equal(snapshot.questions[0].sync.status, 'accepted');
  assert.equal(base.writes, 0);
  await service.close();
  const resumed = new ResearchService({ dir, base, autoRun: false }); services.push(resumed); await resumed.init();
  assert.equal(resumed.snapshot().questions[0].id, snapshot.questions[0].id);
  base.list = async () => { throw new Error('slow external service unavailable'); };
  await resumed.run();
  assert.equal(resumed.operation(op.id).status, 'error');
  assert.equal(resumed.snapshot().questions[0].sync.status, 'error');
  assert.equal(resumed.snapshot().questions[0].title, question.title);
});

test('local topics, questions and consecutive content edits can be submitted without waiting for Feishu', async t => {
  const { service, base } = await fixture(t);
  const topic = await service.accept({ kind: 'topic', name: '即时专题', description: '', clientMutationId: '10a4a033-5274-4cdf-a4e4-d41061cce415' });
  const created = await service.accept({ ...question, category: '即时专题' });
  const q = service.snapshot().questions[0], f = service.snapshot().findings[0];
  const first = await service.accept({ kind: 'finding', questionId: q.id, company: f.company, content: '第一次本地录入', proof: '', version: f.version, clientMutationId: '20a4a033-5274-4cdf-a4e4-d41061cce415' });
  const latest = service.snapshot().findings[0];
  const second = await service.accept({ ...first.payload, content: '第二次本地修正', version: latest.version, clientMutationId: '30a4a033-5274-4cdf-a4e4-d41061cce415' });
  assert.equal(service.snapshot().findings[0].content, '第二次本地修正');
  assert.ok(created.dependencies.includes(topic.id)); assert.ok(first.dependencies.includes(created.id)); assert.ok(second.dependencies.includes(first.id));
  assert.equal(base.writes, 0);
  await service.run();
  assert.equal(second.status, 'success');
  assert.equal(base.tables.findings[0].调研内容, '第二次本地修正');
});

test('delete and restore update the local list immediately and synchronize in dependency order', async t => {
  const { service, base } = await fixture(t);
  await service.accept(question); await service.run(); const q = service.snapshot().questions[0];
  const removed = await service.accept({ kind: 'question-visibility', questionId: q.id, deleted: true, version: q.version, clientMutationId: '40a4a033-5274-4cdf-a4e4-d41061cce415' });
  assert.equal(service.snapshot().questions.length, 0); assert.notEqual(base.tables.questions[0].已删除, true);
  const restored = await service.accept({ ...removed.payload, deleted: false, version: service.snapshot().deletedQuestions[0].version, clientMutationId: '50a4a033-5274-4cdf-a4e4-d41061cce415' });
  assert.equal(service.snapshot().questions.length, 1); assert.ok(restored.dependencies.includes(removed.id));
  await service.run(); assert.equal(restored.status, 'success'); assert.equal(base.tables.questions[0].已删除, false);
});

test('text saves before attachment bytes arrive; waiting attachments do not overwrite a later content edit', async t => {
  const { service, base } = await fixture(t); await service.accept(question); await service.run();
  const f = service.snapshot().findings[0], id = '60a4a033-5274-4cdf-a4e4-d41061cce415';
  const op = await service.accept({ kind: 'finding', questionId: f.questionId, company: f.company, content: '基础文字已保存', proof: '', version: f.version, uploadIds: [id], uploadPlans: [{ id, name: 'qa.pdf', size: 8 }], clientMutationId: '70a4a033-5274-4cdf-a4e4-d41061cce415' });
  assert.equal(service.snapshot().findings[0].content, '基础文字已保存');
  assert.equal(service.snapshot().evidence[0].pendingUpload, true);
  await service.run(); assert.equal(op.status, 'waiting_upload'); assert.equal(op.steps.content.status, 'success');
  const latest = service.snapshot().findings[0];
  const newer = await service.accept({ ...op.payload, content: '后续修正内容', version: latest.version, uploadIds: [], uploadPlans: [], clientMutationId: '80a4a033-5274-4cdf-a4e4-d41061cce415' });
  await service.run(); assert.equal(newer.status, 'success');
  assert.equal(service.snapshot().findings[0].content, '后续修正内容');
  assert.equal(service.snapshot().evidence[0].pendingUpload, true);
  const folder = path.join(service.dir, 'uploads', id); fs.mkdirSync(folder, { recursive: true }); fs.writeFileSync(path.join(folder, 'qa.pdf'), 'pdfbytes');
  service.completeUpload(id, { name: 'qa.pdf', size: 8, sha256: 'test-digest', mime: 'application/pdf' });
  base.upload = async recordId => { base.tables.evidence.find(e => e.recordId === recordId).附件 = [{ name: 'qa.pdf', size: 8, file_token: 'private-token' }]; };
  await service.run(); assert.equal(op.status, 'success');
  assert.equal(service.snapshot().findings[0].content, '后续修正内容');
});

test('failed parent blocks external child writes; retry resumes the chain without losing local records', async t => {
  const { service, base } = await fixture(t);
  const parent = await service.accept(question); const q = service.snapshot().questions[0], f = service.snapshot().findings[0];
  const child = await service.accept({ kind: 'finding', questionId: q.id, company: f.company, content: '保留的本地内容', proof: '', version: f.version, clientMutationId: '90a4a033-5274-4cdf-a4e4-d41061cce415' });
  const list = base.list.bind(base); base.list = async () => { throw new Error('temporary unavailable'); };
  await service.run(); assert.equal(parent.status, 'error'); assert.equal(child.status, 'blocked'); assert.equal(base.writes, 0);
  assert.equal(service.snapshot().findings[0].content, '保留的本地内容');
  base.list = list; await service.retry(child.id); await service.run();
  assert.equal(parent.status, 'success'); assert.equal(child.status, 'success'); assert.equal(base.tables.questions.length, 1);
});

test('duplicate topic names fail locally while replayed acknowledged edits remain idempotent after deletion', async t => {
  const { service, base } = await fixture(t);
  await assert.rejects(service.accept({ kind: 'topic', name: '组织与人才', description: '', clientMutationId: 'a0a4a033-5274-4cdf-a4e4-d41061cce415' }), /已存在/);
  await service.accept(question); await service.run(); const q = service.snapshot().questions[0], f = service.snapshot().findings[0];
  const payload = { kind: 'finding', questionId: q.id, company: f.company, content: '确认过的内容', proof: '', version: f.version, clientMutationId: 'b0a4a033-5274-4cdf-a4e4-d41061cce415' };
  const saved = await service.accept(payload); await service.run();
  await service.accept({ kind: 'question-visibility', questionId: q.id, deleted: true, version: q.version, clientMutationId: 'c0a4a033-5274-4cdf-a4e4-d41061cce415' }); await service.run();
  const writes = base.writes; assert.equal((await service.accept(payload)).id, saved.id); await service.run(); assert.equal(base.writes, writes);
});

test('deleting a question hides its whole row, preserves linked data, and supports restoration', async t => {
  const { service, base } = await fixture(t);
  await service.accept(question); await service.run();
  const q = service.snapshot().questions[0];
  base.tables.evidence.push({ recordId: 'recProof', 问题编号: q.id, 调研对象: '万国数据', 附件: [{ name: 'keep.pdf', size: 9, file_token: 'private-test-token' }] });
  await service.refresh();
  const before = structuredClone({ findings: base.tables.findings, evidence: base.tables.evidence });
  const payload = { kind: 'question-visibility', questionId: q.id, deleted: true, version: q.version, clientMutationId: '48a4a033-5274-4cdf-a4e4-d41061cce415' };
  const op = await service.accept(payload); await service.run();
  assert.equal(op.status, 'success'); assert.equal(base.tables.questions[0].已删除, true);
  assert.equal(service.snapshot().questions.length, 0); assert.equal(service.snapshot().findings.length, 0); assert.equal(service.snapshot().evidence.length, 0);
  assert.equal(service.snapshot().deletedQuestions[0].id, q.id);
  assert.deepEqual({ findings: base.tables.findings, evidence: base.tables.evidence }, before);
  const writes = base.writes; await service.accept(payload); await service.run(); assert.equal(base.writes, writes);
  await assert.rejects(service.accept({ kind: 'finding', questionId: q.id, company: '万国数据', content: 'must not edit', proof: '', version: before.findings[0].version, clientMutationId: '58a4a033-5274-4cdf-a4e4-d41061cce415' }), /不存在/);
  const removed = service.snapshot().deletedQuestions[0];
  const restore = await service.accept({ ...payload, deleted: false, version: removed.version, clientMutationId: '68a4a033-5274-4cdf-a4e4-d41061cce415' }); await service.run();
  assert.equal(restore.status, 'success'); assert.equal(service.snapshot().questions.length, 1);
  assert.equal(service.snapshot().findings.length, 5); assert.equal(service.snapshot().evidence[0].name, 'keep.pdf');
});

test('lost deletion response reconciles after restart without repeating the update', async t => {
  const { service, base, dir, services } = await fixture(t);
  await service.accept(question); await service.run(); const q = service.snapshot().questions[0];
  const originalUpdate = base.update.bind(base); let calls = 0;
  base.update = async (...args) => { calls++; await originalUpdate(...args); throw new Error('response lost'); };
  const op = await service.accept({ kind: 'question-visibility', questionId: q.id, deleted: true, version: q.version, clientMutationId: '78a4a033-5274-4cdf-a4e4-d41061cce415' });
  await service.run(); assert.equal(op.status, 'error'); await service.close();
  const resumed = new ResearchService({ dir, base, autoRun: false }); services.push(resumed); await resumed.init();
  await resumed.retry(op.id); await resumed.run();
  assert.equal(resumed.operation(op.id).status, 'success'); assert.equal(calls, 1); assert.equal(resumed.snapshot().questions.length, 0);
});

test('deletion errors preserve local intent and keep the remote original unchanged', async t => {
  const { service, base } = await fixture(t);
  await service.accept(question); await service.run(); const q = service.snapshot().questions[0];
  base.tables.questions[0].问题列表 = '飞书刚修正的问题';
  const op = await service.accept({ kind: 'question-visibility', questionId: q.id, deleted: true, version: q.version, clientMutationId: '88a4a033-5274-4cdf-a4e4-d41061cce415' });
  await service.run(); assert.equal(op.status, 'error'); assert.match(op.error, /已被修改/); assert.notEqual(base.tables.questions[0].已删除, true);
  assert.equal(service.snapshot().deletedQuestions[0].sync.status, 'error');
  const other = await fixture(t); await other.service.accept(question); await other.service.run();
  other.base.ensureDeletionField = async () => { throw new Error('缺少字段管理权限'); };
  const latest = other.service.snapshot().questions[0];
  const failed = await other.service.accept({ ...op.payload, version: latest.version, clientMutationId: '98a4a033-5274-4cdf-a4e4-d41061cce415' }); await other.service.run();
  assert.equal(failed.status, 'error'); assert.match(failed.error, /字段管理权限/); assert.equal(other.service.snapshot().deletedQuestions[0].sync.status, 'error');
  assert.notEqual(other.base.tables.questions[0].已删除, true);
});

test('normalize CLI column arrays without leaking attachment tokens', () => {
  const rows = normalizeRows({ fields: ['一级分类', '重点标记'], data: [[['组织与人才'], true]], record_id_list: ['rec1'], has_more: false });
  assert.deepEqual(rows, [{ recordId: 'rec1', 一级分类: ['组织与人才'], 重点标记: true }]);
  assert.throws(() => normalizeRows({ fields: ['x'], data: [[1]], record_id_list: [] }), /结构/);
});
test('accepted operations survive restart; duplicate submission creates one question and five linked findings', async t => {
  const { service, base, dir, services } = await fixture(t);
  const first = await service.accept(question);
  assert.equal(first.status, 'accepted');
  await service.close();
  const resumed = new ResearchService({ dir, base, autoRun: false });
  await resumed.init();
  services.push(resumed);
  assert.equal((await resumed.accept(question)).id, first.id);
  await resumed.run();
  assert.equal(resumed.operation(first.id).status, 'success');
  assert.equal(base.tables.questions.length, 1);
  assert.equal(base.tables.findings.length, 5);
  assert.ok(base.tables.findings.every(f => f.关联问题[0].id === base.tables.questions[0].recordId));
  await resumed.accept(question); await resumed.run();
  assert.equal(base.writes, 6);
  await assert.rejects(resumed.accept({ ...question, title: 'changed' }), /重复提交标识/);
});
test('lost remote response is reconciled by durable key and never duplicated', async t => {
  const { service, base } = await fixture(t);
  base.failAfterCreate = true;
  const op = await service.accept(question);
  await service.run();
  assert.equal(service.operation(op.id).status, 'error');
  await service.retry(op.id); await service.run();
  assert.equal(service.operation(op.id).status, 'success');
  assert.equal(base.tables.questions.length, 1);
  assert.equal(base.tables.findings.length, 5);
});
test('simultaneous duplicate submissions serialize the durable ledger', async t => {
  const { service, base } = await fixture(t);
  const results = await Promise.all(Array.from({ length: 5 }, () => service.accept(question)));
  assert.equal(new Set(results.map(r => r.id)).size, 1);
  await service.run();
  assert.equal(base.tables.questions.length, 1);
});
test('remote edits made after opening a form produce a conflict without overwriting', async t => {
  const { service, base } = await fixture(t);
  const created = await service.accept(question); await service.run();
  const finding = service.snapshot().findings[0];
  const pending = await service.accept({ kind: 'finding', clientMutationId: '28a4a033-5274-4cdf-a4e4-d41061cce415', questionId: created.result.questionId, company: finding.company, content: '网页编辑内容', proof: '', version: finding.version });
  base.tables.findings[0].调研内容 = '飞书刚编辑过';
  await service.run();
  assert.equal(service.operation(pending.id).status, 'error');
  assert.match(service.operation(pending.id).error, /已被修改/);
  assert.equal(base.tables.findings[0].调研内容, '飞书刚编辑过');
});

test('corrections update the selected finding, preserve evidence and remain idempotent', async t => {
  const { service, base } = await fixture(t);
  const created = await service.accept(question); await service.run();
  const finding = service.snapshot().findings[3];
  base.tables.evidence.push({ recordId: 'recProof', 问题编号: finding.questionId, 调研对象: finding.company, 附件: [{ name: 'original.pdf', size: 10, file_token: 'private-token' }] });
  const beforeOthers = structuredClone(base.tables.findings.filter(f => f.调研对象 !== finding.company));
  const payload = { kind: 'finding', clientMutationId: '29a4a033-5274-4cdf-a4e4-d41061cce415', questionId: created.result.questionId, company: finding.company, content: '修正后人员配置', proof: '已复核', version: finding.version };
  const op = await service.accept(payload); await service.run();
  assert.equal(service.operation(op.id).status, 'success');
  const corrected = service.snapshot().findings.find(f => f.id === finding.id);
  assert.equal(corrected.content, payload.content); assert.equal(corrected.proof, payload.proof);
  assert.notEqual(corrected.version, finding.version);
  assert.deepEqual(base.tables.findings.filter(f => f.调研对象 !== finding.company), beforeOthers);
  assert.equal(service.snapshot().evidence[0].name, 'original.pdf');
  const writes = base.writes;
  await service.accept(payload); await service.run(); assert.equal(base.writes, writes);
});
test('version includes content and proof; invalid input never enters ledger', async t => {
  assert.notEqual(versionOf({ 调研内容: 'a', 举证原文: '' }), versionOf({ 调研内容: 'a', 举证原文: 'b' }));
  const { service } = await fixture(t);
  await assert.rejects(service.accept({ ...question, title: '' }), /问题/);
  await assert.rejects(service.accept({ ...question, clientMutationId: '../../unsafe' }), /提交标识/);
});
test('empty topic persists and duplicate names reconcile to the same remote record', async t => {
  const { service, base } = await fixture(t);
  const op = await service.accept({ kind: 'topic', clientMutationId: '38a4a033-5274-4cdf-a4e4-d41061cce415', name: '新能源', description: '新增专题' });
  await service.run();
  assert.equal(service.operation(op.id).status, 'success');
  assert.ok(service.snapshot().categories.includes('新能源'));
  assert.equal(base.tables.topics.filter(r => r.专题名称 === '新能源').length, 1);
});

test('uncertain create without a visible remote record never attempts another create', async t => {
  const { service, base } = await fixture(t);
  let calls = 0;
  base.create = async () => { calls++; throw new Error('network lost'); };
  const op = await service.accept(question); await service.run();
  await service.retry(op.id); await service.run();
  assert.equal(calls, 1);
  assert.match(service.operation(op.id).error, /阻止重复/);
});
test('failed refresh retains last good data and reports the error', async t => {
  const { service, base } = await fixture(t);
  base.list = async () => { throw new Error('offline'); };
  await assert.rejects(service.refresh(), /offline/);
  assert.ok(service.snapshot().categories.includes('组织与人才'));
  assert.equal(service.snapshot().syncError, 'offline');
});

test('cached startup does not read Feishu until manual refresh or a new mutation', async t => {
  const { service, base, dir, services } = await fixture(t);
  await service.close();
  const list = base.list.bind(base); let reads = 0;
  base.list = async table => { reads++; return list(table); };
  const resumed = new ResearchService({ dir, base }); services.push(resumed);
  await resumed.init(); await resumed.run();
  assert.equal(reads, 0);
  await resumed.refresh(); assert.equal(reads, 4);
  const operation = await resumed.accept(question); await resumed.run();
  assert.equal(resumed.operation(operation.id).status, 'success');
  assert.equal(base.tables.questions.length, 1);
  assert.ok(reads > 4);
});

test('attachment upload that succeeds before response loss is reconciled without uploading twice', async t => {
  const { service, base } = await fixture(t);
  const q = await service.accept(question); await service.run();
  const f = service.snapshot().findings[0];
  const uploadId = 'a8a4a033-5274-4cdf-a4e4-d41061cce415';
  service.state.uploads[uploadId] = { id: uploadId, name: 'QA.txt', size: 8, mime: 'text/plain', sha256: 'test-sha' };
  let uploads = 0;
  base.upload = async rec => { uploads++; base.tables.evidence.find(e => e.recordId === rec).附件 = [{ name: 'QA.txt', size: 8, file_token: 'private-test-token' }]; throw new Error('upload response lost'); };
  const op = await service.accept({ kind: 'finding', clientMutationId: 'b8a4a033-5274-4cdf-a4e4-d41061cce415', questionId: q.result.questionId, company: f.company, version: f.version, content: '有附件', proof: '', uploadIds: [uploadId] });
  await service.run(); assert.equal(service.operation(op.id).status, 'error');
  await service.retry(op.id); await service.run();
  assert.equal(service.operation(op.id).status, 'success'); assert.equal(uploads, 1);
  assert.equal(base.tables.evidence.length, 1);
  assert.doesNotMatch(JSON.stringify(service.snapshot()), /private-test-token/);
});

test('disk persistence failure never returns accepted and becomes visible to the UI', async t => {
  const { service } = await fixture(t);
  const temp = `${service.statePath}.${process.pid}.tmp`;
  fs.mkdirSync(temp);
  await assert.rejects(service.accept(question));
  assert.equal(service.operation(question.clientMutationId), undefined);
  assert.match(service.snapshot().syncError, /磁盘/);
  fs.rmdirSync(temp);
});

test('cleaned QA mutation tombstones reject replay instead of recreating deleted records', async t => {
  const { service } = await fixture(t);
  service.state.operations[question.clientMutationId] = { id: question.clientMutationId, status: 'retired', hash: 'retired-proof' };
  await assert.rejects(service.accept(question), /已清理/);
  assert.equal(service.publicOperation(service.operation(question.clientMutationId)).result.cleaned, true);
});

test('invalid or duplicate question IDs from Base fail refresh without reaching HTML attributes', async t => {
  const { service, base } = await fixture(t);
  base.tables.questions.push({ recordId: 'unsafe', 问题编号: 'Q-\" onclick=\"alert(1)', 问题列表: '测试' });
  await assert.rejects(service.refresh(), /编号/);
  assert.equal(service.snapshot().questions.length, 0);
  base.tables.questions = [{ recordId: 'a', 问题编号: 'Q-001', 问题列表: '问题一' }, { recordId: 'b', 问题编号: 'Q-001', 问题列表: '问题二' }];
  await assert.rejects(service.refresh(), /编号/);
});
