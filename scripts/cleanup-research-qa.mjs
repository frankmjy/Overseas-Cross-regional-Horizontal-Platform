import fs from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { BaseAdapter } from '../research/adapter.mjs';
import { writeAtomic } from '../research/service.mjs';
const config = JSON.parse(fs.readFileSync('research/config.json'));
const base = new BaseAdapter(config);
const dataDir = path.resolve('.runtime/research');
if (process.argv.includes('--execute') && fs.existsSync(path.join(dataDir, 'writer.lock'))) {
  const lock = JSON.parse(fs.readFileSync(path.join(dataDir, 'writer.lock')));
  let alive = true; try { process.kill(lock.pid, 0); } catch (e) { if (e.code === 'ESRCH') alive = false; }
  if (alive) throw new Error('请先停止本次联调进程，再清理测试台账，避免覆盖并发写入。');
}
const qaName = '【验收测试】调研同步-20261016';
const qaTitle = '【验收测试】五个对象内容与附件同步';
const ledger = JSON.parse(fs.readFileSync('.runtime/research/state.json'));
const ops = Object.values(ledger.operations);
const questionOp = ops.find(o => o.payload?.kind === 'question' && o.payload.title === qaTitle && o.payload.category === qaName);
const topicOp = ops.find(o => o.payload?.kind === 'topic' && o.payload.name === qaName);
if (!questionOp && !topicOp && fs.existsSync('reports/research-integration-20261016/qa-cleanup-plan.json')) {
  const previous = JSON.parse(fs.readFileSync('reports/research-integration-20261016/qa-cleanup-plan.json'));
  if (!previous.operationIds.every(id => ledger.operations[id]?.status === 'retired')) throw new Error('测试清理状态不完整，请核对原清单。');
  for (const [table, ids] of Object.entries(previous.records)) if ((await base.list(table)).some(r => ids.includes(r.recordId))) throw new Error('已清理测试记录重新出现，请核对。');
  console.log('QA already cleaned; verified no listed records remain.'); process.exit(0);
}
if (!questionOp || !topicOp || [questionOp, topicOp].some(o => o.status !== 'success')) throw new Error('测试任务标识或成功终态不匹配，禁止清理。');
const qid = questionOp.result.questionId;
const qaOps = ops.filter(o => [questionOp.id, topicOp.id].includes(o.id) || o.payload?.kind === 'finding' && o.payload.questionId === qid && o.payload.content === '【验收测试】真实飞书应用同步；文字与附件分步骤提交。');
const keys = qaOps.map(o => `web:${o.id}`);
const raw = {}; for (const table of ['evidence', 'findings', 'questions', 'topics']) raw[table] = await base.list(table);
const selected = Object.fromEntries(Object.entries(raw).map(([table, rows]) => [table, rows.filter(r => keys.some(key => r.迁移键 === key || r.迁移键?.startsWith(`${key}:`)))]));
if (selected.questions.some(r => r.问题编号 !== qid || r.问题列表 !== qaTitle) || selected.topics.some(r => r.专题名称 !== qaName) || selected.findings.some(r => r.明细编号?.split(':')[0] !== qid) || selected.evidence.some(r => r.问题编号 !== qid)) throw new Error('测试记录范围核对失败。');
function canonical(value) { if (Array.isArray(value)) return value.map(canonical); if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().map(k => [k, canonical(value[k])])); return value; }
const fingerprint = rows => createHash('sha256').update(JSON.stringify(canonical(rows.toSorted((a, b) => a.recordId.localeCompare(b.recordId))))).digest('hex');
let before = Object.fromEntries(Object.entries(raw).map(([table, rows]) => [table, fingerprint(rows.filter(r => !selected[table].some(q => q.recordId === r.recordId)))]));
let plan = { at: new Date().toISOString(), operationIds: qaOps.map(o => o.id), records: Object.fromEntries(Object.entries(selected).map(([t, rows]) => [t, rows.map(r => r.recordId)])), baseline: before };
const planPath = 'reports/research-integration-20261016/qa-cleanup-plan.json';
if (fs.existsSync(planPath)) {
  const previous = JSON.parse(fs.readFileSync(planPath));
  if (JSON.stringify(previous.operationIds.toSorted()) === JSON.stringify(plan.operationIds.toSorted()) && Object.values(previous.records).some(ids => ids.length)) { plan = previous; before = previous.baseline; }
}
fs.mkdirSync('reports/research-integration-20261016', { recursive: true });
fs.writeFileSync('reports/research-integration-20261016/qa-cleanup-plan.json', JSON.stringify(plan, null, 2));
console.log(JSON.stringify({ dryRun: !process.argv.includes('--execute'), counts: Object.fromEntries(Object.entries(selected).map(([t, rows]) => [t, rows.length])) }));
if (!process.argv.includes('--execute')) process.exit(0);
for (const [table, rows] of Object.entries(selected)) {
  if (rows.length) await base.cli('+record-delete', ['--table-id', base.table(table), '--json', JSON.stringify({ record_id_list: rows.map(r => r.recordId) }), '--yes']);
}
const after = {}; for (const table of Object.keys(raw)) {
  after[table] = await base.list(table);
  if (selected[table].some(r => after[table].some(a => a.recordId === r.recordId))) throw new Error('测试记录仍有残留。');
  if (fingerprint(after[table]) !== before[table]) throw new Error('非测试记录指纹发生变化，停止后续清理并核对。');
}
for (const table of ['questions', 'findings']) {
  if (after[table].some(r => (Array.isArray(r.一级分类) ? r.一级分类 : [r.一级分类]).includes(qaName))) throw new Error('测试专题仍被使用，不删除选项。');
  const field = (await base.cli('+field-list', ['--table-id', base.table(table)])).fields.find(f => f.name === '一级分类');
  if (field.options.some(o => o.name === qaName)) await base.cli('+field-update', ['--table-id', base.table(table), '--field-id', field.id, '--json', JSON.stringify({ name: field.name, type: field.type, multiple: field.multiple, options: field.options.filter(o => o.name !== qaName) }), '--yes']);
  const verified = (await base.cli('+field-list', ['--table-id', base.table(table)])).fields.find(f => f.id === field.id);
  if (JSON.stringify(canonical(verified.options)) !== JSON.stringify(canonical(field.options.filter(o => o.name !== qaName)))) throw new Error('分类选项清理回读不一致。');
}
const cachedQA = ledger.cache.raw.evidence.filter(r => keys.some(key => r.迁移键 === key || r.迁移键?.startsWith(`${key}:`)));
for (const op of qaOps) {
  for (const id of op.payload.uploadIds || []) {
    const upload = ledger.uploads[id]; if (!upload || upload.claimed !== op.id) throw new Error('测试附件归属不匹配。');
    const file = path.resolve(dataDir, 'uploads', id, upload.name);
    const parent = path.resolve(dataDir, 'uploads', id);
    if (!/^[a-f0-9-]{36}$/i.test(id) || path.dirname(file) !== parent || !parent.startsWith(path.join(dataDir, 'uploads') + path.sep)) throw new Error('测试附件路径越界。');
    if (fs.existsSync(file)) { if (createHash('sha256').update(fs.readFileSync(file)).digest('hex') !== upload.sha256) throw new Error('测试附件内容已变化，不删除。'); fs.unlinkSync(file); }
    if (fs.existsSync(parent) && fs.readdirSync(parent).length === 0) fs.rmdirSync(parent);
    delete ledger.uploads[id];
  }
  ledger.operations[op.id] = { id: op.id, hash: op.hash, status: 'retired', createdAt: op.createdAt, retiredAt: new Date().toISOString() };
}
for (const row of cachedQA) for (const file of row.附件 || []) {
  const cached = path.join(dataDir, 'files', `${createHash('sha256').update(file.file_token).digest('hex')}.bin`);
  if (fs.existsSync(cached)) fs.unlinkSync(cached);
}
ledger.cache = { raw: after, syncedAt: new Date().toISOString() }; writeAtomic(path.join(dataDir, 'state.json'), ledger);
fs.writeFileSync('reports/research-integration-20261016/qa-cleanup-result.json', JSON.stringify({ at: new Date().toISOString(), ok: true, nonTestRecordsUnchanged: true, operationIds: plan.operationIds, counts: Object.fromEntries(Object.entries(after).map(([table, rows]) => [table, rows.length])) }, null, 2));
console.log('Test cloud records removed; non-test records unchanged.');
