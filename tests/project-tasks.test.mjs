import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { createServer } from 'node:http';
import { ProjectTaskService } from '../project-tasks/service.mjs';
import { createProjectTaskHandler } from '../project-tasks/http.mjs';
import { columns, publicRecord } from '../project-tasks/model.mjs';

const metadata = Object.entries(columns).map(([key, [name, type]]) => ({ name, type, multiple: key === 'participants', options: ['未开始', '进行中', '正常完成', 'P0', 'P1', '团队筹建准备', '🚩'].map(name => ({ name })) }));
function fixture(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vnet-task-edit-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  let row = { recordId: 'recOne', 'Task Code（任务编号）': '001-1', ...Object.fromEntries(Object.entries(columns).map(([key, [name, type]]) => [name, type === 'user' ? [] : ''])) };
  Object.assign(row, { [columns.title[0]]: '原任务', [columns.stage[0]]: '团队筹建准备', [columns.status[0]]: '未开始', [columns.start[0]]: '2026-10-01', [columns.due[0]]: '2026-10-31', [columns.owner[0]]: [{ id: 'ou_verified', name: '真实账号' }] });
  let writes = 0, loseResponse = false, wrongRead = false;
  const table = fields => ({ fields, record_id_list: [row.recordId], data: [fields.map(name => row[name] ?? null)], has_more: false });
  const adapter = { async cli(command, args) {
    const fields = args.flatMap((v, i) => v === '--field-id' ? [args[i + 1]] : []);
    if (command === '+field-list') { assert.ok(!args.includes('--format')); return { fields: metadata }; }
    if (command === '+record-list') return table(fields);
    if (command === '+record-batch-update') {
      const body = JSON.parse(args[args.indexOf('--json') + 1]);
      assert.deepEqual(Object.keys(body.patch), [columns.status[0]]);
      if (body.record_id_list.includes(row.recordId)) Object.assign(row,body.patch);
      return {};
    }
    if (command === '+record-get') {
      const response = table(fields);
      if (wrongRead && writes) response.data[0][fields.indexOf(columns.feedback[0])] = '未写入';
      return response;
    }
    if (command === '+record-upsert') {
      assert.ok(!args.includes('--format')); assert.equal(args[args.indexOf('--record-id') + 1], 'recOne');
      const patch = JSON.parse(args[args.indexOf('--json') + 1]); Object.assign(row, patch); writes++;
      if (loseResponse) { loseResponse = false; throw Error('uncertain write'); }
      return {};
    }
    assert.fail(command);
  } };
  let now = Date.now();
  const create = () => new ProjectTaskService({ dir, adapter, now: () => now });
  return { dir, create, get row() { return row; }, writes: () => writes, lose() { loseResponse = true; }, wrong() { wrongRead = true; }, advance() { now += 3600001; } };
}
const input = (service, patch) => ({ clientMutationId: randomUUID(), recordId: 'recOne', version: service.snapshot().records[0].version, patch });
const actor = { name: '测试编辑人', openId: 'ou_verified' };

test('feedback appends authenticated minute-stamped history, preserves legacy text and deduplicates retries', async t => {
  const f = fixture(t), service = f.create(); await service.refresh();
  f.row[columns.feedback[0]] = '原有进展'; await service.refresh();
  const submission = input(service, { feedback: '第一次跟进' });
  assert.throws(() => service.accept(submission), /登录/);
  const accepted = service.accept(submission, actor);
  assert.equal(accepted.record.latestFeedback, '第一次跟进');
  assert.equal(accepted.record.feedbackHistory.length, 2);
  const entry = accepted.record.feedbackHistory.at(-1);
  assert.equal(entry.sequence, 2); assert.equal(entry.editor, actor.name);
  assert.match(entry.time, /^\d{4}-\d\d-\d\d \d\d:\d\d$/);
  service.accept(submission, actor); await service.flush();
  assert.equal(service.snapshot().records[0].feedbackHistory.length, 2);
  service.accept(input(service, { feedback: '第二次跟进' }), actor); await service.flush();
  assert.equal(service.snapshot().records[0].latestFeedback, '第二次跟进');
  assert.equal(service.snapshot().records[0].feedbackHistory.length, 3);
  assert.ok(f.row[columns.feedback[0]].startsWith('原有进展'));
  assert.equal(f.writes(), 2);
});

test('accept is durable and immediate without external I/O; restart and duplicate submit preserve one operation', async t => {
  const f = fixture(t), service = f.create(); await service.refresh();
  const submission = input(service, { feedback: '新进展' });
  const accepted = service.accept(submission, actor);
  assert.equal(accepted.operation.status, 'accepted'); assert.equal(f.writes(), 0);
  assert.equal(accepted.record.latestFeedback, '新进展');
  const restored = f.create(); assert.equal(restored.accept(submission, actor).operation.id, accepted.operation.id);
  assert.throws(() => restored.accept({ ...submission, patch: { feedback: '其他' } }), /提交标识/);
  await restored.flush(); assert.equal(f.writes(), 1);
  assert.equal(restored.snapshot().operations[0].status, 'success');
});

test('uncertain remote update is recovered by semantic readback without writing twice', async t => {
  const f = fixture(t), service = f.create(); await service.refresh(); f.lose();
  service.accept(input(service, { title: '新任务' })); await service.flush();
  assert.equal(service.snapshot().operations[0].status, 'error'); f.advance();
  await service.flush(); assert.equal(f.writes(), 1); assert.equal(service.snapshot().operations[0].status, 'success');
});

test('same-field remote conflict is blocked; unrelated fields are preserved', async t => {
  const f = fixture(t), service = f.create(); await service.refresh();
  service.accept(input(service, { feedback: '本机修改' }), actor); f.row[columns.feedback[0]] = '别人修改';
  await service.flush(); assert.equal(service.snapshot().operations[0].status, 'blocked'); assert.equal(f.writes(), 0);
  assert.throws(() => service.retry(service.snapshot().operations[0].id), /冲突/);
  service.discard(service.snapshot().operations[0].id); await service.refresh();
  service.accept(input(service, { title: '只改标题' })); f.row[columns.feedback[0]] = '再改进展';
  await service.flush(); assert.equal(f.row[columns.feedback[0]], '再改进展'); assert.equal(service.snapshot().operations[0].status, 'success');
});

test('schema, dates, stable account IDs and stale versions are enforced before acceptance', async t => {
  const f = fixture(t), service = f.create(); await service.refresh();
  for (const patch of [{ code: 'fake' }, { owner: ['某个人'] }, { priority: '新选项' }, { start: '2026-02-30' }, { due: '2020-01-01' }]) assert.throws(() => service.accept(input(service, patch)));
  assert.throws(() => service.accept({ ...input(service, { title: '修改' }), version: 'stale' }), /已更新/);
  service.accept(input(service, { owner: ['ou_verified'], participants: ['ou_verified'] })); await service.flush();
  assert.equal(service.snapshot().operations[0].status, 'success');
});

test('failed local persistence never produces an accepted operation', async t => {
  const f = fixture(t), service = f.create(); await service.refresh();
  const submission = input(service, { feedback: '不能丢' });
  fs.unlinkSync(service.file); fs.mkdirSync(service.file);
  assert.throws(() => service.accept(submission, actor), /未保存/);
  assert.equal(Object.keys(service.state.operations).length, 0); assert.equal(f.writes(), 0);
});

test('inconsistent readback stays recoverable and never reports success', async t => {
  const f = fixture(t), service = f.create(); await service.refresh(); f.wrong();
  service.accept(input(service, { feedback: '新反馈' }), actor); await service.flush();
  assert.equal(service.snapshot().operations[0].status, 'error'); assert.equal(service.snapshot().records[0].latestFeedback, '新反馈');
});

test('date and account readback use semantic values', () => {
  const a = { recordId: 'recOne', [columns.start[0]]: '2026/10/25', [columns.owner[0]]: [{ name: '姓名', id: 'ou_verified' }] };
  const b = { ...a, [columns.start[0]]: '2026-10-25 00:00:00', [columns.owner[0]]: [{ open_id: 'ou_verified' }] };
  assert.equal(publicRecord(a).version, publicRecord(b).version);
});

test('manual status refresh writes only changed status values and verifies the source snapshot', async t => {
  const f=fixture(t),service=f.create();service.now=()=>Date.parse('2026-10-25T02:00:00Z');await service.refresh();
  const result=await service.refreshStatuses();assert.equal(result.changed,1);
  assert.equal(service.snapshot().records[0].values.status,'进行中');
  assert.equal(service.state.statusRefreshedDay,'2026-10-25');
  assert.equal((await service.refreshStatuses()).changed,0);assert.equal(f.writes(),0);
  service.accept(input(service,{feedback:'待同步进展'}),actor);
  f.row[columns.due[0]]='2026-10-01';
  await service.refreshStatuses();assert.equal(f.row[columns.status[0]],'进行中');
});

test('daily refresh runs at Shanghai midnight and catches up after a restart', async t => {
  t.mock.timers.enable({apis:['setTimeout']});
  const f=fixture(t),service=f.create();let clock=Date.parse('2026-10-25T15:59:59Z');service.now=()=>clock;
  await service.refresh();service.commit(next=>{next.statusRefreshedDay='2026-10-25';});
  service.start();t.after(()=>service.close());
  clock+=1020;t.mock.timers.tick(1020);await service.statusRefreshing;
  assert.equal(service.state.statusRefreshedDay,'2026-10-26');
  service.close();service.commit(next=>{next.statusRefreshedDay='2026-10-24';});
  service.start();t.mock.timers.tick(1000);await service.statusRefreshing;
  assert.equal(service.state.statusRefreshedDay,'2026-10-26');
});

test('accepted work wakes immediately and a recovered write needs only one read', async t => {
  const f = fixture(t), service = f.create(); await service.refresh();
  service.start(); t.after(() => service.close());
  const submission = input(service, { title: '立即同步' });
  service.accept(submission);
  await new Promise(resolve => setTimeout(resolve, 80));
  assert.equal(service.snapshot().operations[0].status, 'success');
  assert.equal(f.writes(), 1);
  service.close();
  service.accept(input(service, { title: '恢复结果' }));
  f.row[columns.title[0]] = '恢复结果';
  const original = service.adapter.cli; let reads = 0;
  service.adapter.cli = async (...args) => { if (args[0] === '+record-get') reads++; return original(...args); };
  await service.flush(); assert.equal(reads, 1); assert.equal(f.writes(), 1);
});

test('HTTP accepts only validated durable mutations and rejects malformed or oversized bodies', async t => {
  const f = fixture(t), service = f.create(); await service.refresh();
  const handle = createProjectTaskHandler(service);
  const server = createServer(async (req, res) => { req.auth = actor; if (!await handle(req, res)) { res.writeHead(404); res.end(); } });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const origin = `http://127.0.0.1:${server.address().port}`;
  const post = (body, headers = { 'Content-Type': 'application/json' }) => fetch(`${origin}/api/project-tasks`, { method: 'POST', headers, body });
  const submission = JSON.stringify(input(service, { feedback: 'HTTP 修改' }));
  const response = await post(submission); assert.equal(response.status, 202);
  const body = await response.json(); assert.equal(body.operation.status, 'accepted'); assert.equal(f.writes(), 0);
  assert.equal((await post(submission)).status, 202);
  assert.equal((await post('{')).status, 400);
  assert.equal((await post('x'.repeat(160001))).status, 413);
  assert.equal((await post(submission, { 'Content-Type': 'text/plain' })).status, 415);
  assert.equal((await fetch(`${origin}/api/project-tasks`, { method: 'DELETE' })).status, 405);
  const status = await (await fetch(`${origin}/api/project-tasks/status`)).json();
  assert.equal(status.operations.length, 1); assert.equal(status.records[0].latestFeedback, 'HTTP 修改');
});
