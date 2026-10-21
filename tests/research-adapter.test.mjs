import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { BaseAdapter } from '../research/adapter.mjs';

test('bilingual columns retain the internal model and writes use stable field IDs', async () => {
  const base = new BaseAdapter({ baseToken: 'test', tables: { questions: 'tblQuestions' }, fieldIds: { questions: { 问题编号: 'fldId', 问题列表: 'fldTitle', 已删除: 'fldDeleted' } } });
  const calls = [];
  base.cli = async (command, args) => {
    calls.push({ command, args });
    if (command === '+record-list') return { fields: ['Question ID（问题编号）', 'Question（问题列表）', 'Deleted（已删除）'], data: [['Q-1', 'Existing title', false]], record_id_list: ['rec1'], has_more: false };
    if (command === '+field-list') return { fields: [{ id: 'fldDeleted', name: 'Deleted（已删除）', type: 'checkbox' }] };
    return { record: { record_id_list: ['rec1'] } };
  };
  assert.deepEqual(await base.list('questions'), [{ recordId: 'rec1', 问题编号: 'Q-1', 问题列表: 'Existing title', 已删除: false }]);
  await base.create('questions', { 问题编号: 'Q-2', 问题列表: 'New title' });
  assert.deepEqual(JSON.parse(calls.at(-1).args[calls.at(-1).args.indexOf('--json') + 1]), { fldId: 'Q-2', fldTitle: 'New title' });
  await base.update('questions', 'rec1', { 已删除: true });
  assert.deepEqual(JSON.parse(calls.at(-1).args[calls.at(-1).args.indexOf('--json') + 1]), { fldDeleted: true });
  await base.ensureDeletionField();
  assert.equal(calls.some(c => c.command === '+field-create'), false);
});

test('mixed schemas stay readable and duplicate aliases fail instead of losing values', async () => {
  const base = new BaseAdapter({ tables: { questions: 'tblQuestions' }, fieldIds: { questions: { 问题编号: 'fldId', 问题列表: 'fldTitle' } } });
  base.cli = async () => ({ fields: ['fldId', '问题列表'], data: [['Q-1', 'Legacy title']], record_id_list: ['rec1'], has_more: false });
  assert.equal((await base.list('questions'))[0].问题编号, 'Q-1');
  base.cli = async () => ({ fields: ['问题列表', 'Question（问题列表）'], data: [['Old', 'New']], record_id_list: ['rec1'], has_more: false });
  await assert.rejects(base.list('questions'), /重复/);
});

test('attachment upload uses the bound field ID after the column is renamed', async () => {
  const base = new BaseAdapter({ tables: { evidence: 'tblEvidence' }, fieldIds: { evidence: { 附件: 'fldAttachment' } } });
  base.cli = async (command, args) => { assert.equal(command, '+record-upload-attachment'); assert.equal(args[args.indexOf('--field-id') + 1], 'fldAttachment'); };
  await base.upload('rec1', 'example.pdf');
});
test('deletion checkbox is created once, checked on readback and reused', async t => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'research-delete-field-'));
  const runner = path.join(dir, 'runner.mjs');
  await fs.writeFile(runner, `import fs from 'node:fs';import assert from 'node:assert/strict';const a=process.argv.slice(2),file=new URL('./field.json',import.meta.url);assert.equal(a[a.indexOf('--as')+1],'bot');assert.equal(a[a.indexOf('--table-id')+1],'tblQuestions');if(a.includes('+field-create')){const f=JSON.parse(a[a.indexOf('--json')+1]);assert.equal(f.type,'checkbox');assert.equal(f.name,'已删除');assert.equal(fs.existsSync(file),false);fs.writeFileSync(file,JSON.stringify(f));console.log(JSON.stringify({ok:true,data:{created:true}}));}else{assert.ok(a.includes('+field-list'));console.log(JSON.stringify({ok:true,data:{fields:fs.existsSync(file)?[JSON.parse(fs.readFileSync(file))]:[]}}));}`);
  const previous = process.env.LARK_CLI_SCRIPT; process.env.LARK_CLI_SCRIPT = runner;
  t.after(async () => { if (previous) process.env.LARK_CLI_SCRIPT = previous; else delete process.env.LARK_CLI_SCRIPT; await fs.rm(dir, { recursive: true, force: true }); });
  const base = new BaseAdapter({ baseToken: 'test', tables: { questions: 'tblQuestions' } });
  await base.ensureDeletionField(); await base.ensureDeletionField();
  assert.equal(JSON.parse(await fs.readFile(path.join(dir, 'field.json'), 'utf8')).type, 'checkbox');
});
test('credential rejection points to application settings without leaking upstream details', async t => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'research-credential-'));
  const runner = path.join(dir, 'runner.mjs');
  await fs.writeFile(runner, `console.log(JSON.stringify({ok:false,error:{type:'api_error',message:'TAT API error: [10014] app secret invalid private-value'}}));process.exitCode=1;`);
  const previous = process.env.LARK_CLI_SCRIPT; process.env.LARK_CLI_SCRIPT = runner;
  t.after(async () => { if (previous) process.env.LARK_CLI_SCRIPT = previous; else delete process.env.LARK_CLI_SCRIPT; await fs.rm(dir, { recursive: true, force: true }); });
  const base = new BaseAdapter({ baseToken: 'test', tables: {} });
  await assert.rejects(base.cli('+table-list'), error => { assert.match(error.message, /10014.*应用配置/); assert.doesNotMatch(error.message, /private-value/); return true; });
});
test('CLI attachment files use a relative name inside the selected working directory', async t => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'research-cli-'));
  const runner = path.join(dir, 'runner.mjs');
  await fs.writeFile(runner, `import fs from 'node:fs';import path from 'node:path';const args=process.argv.slice(2);const flag=args.includes('--output')?'--output':'--file';const file=args[args.indexOf(flag)+1];if(path.isAbsolute(file))console.log(JSON.stringify({ok:false,error:{message:'absolute paths rejected'}}));else{if(flag==='--output')fs.writeFileSync(file,'real-file');else if(fs.readFileSync(file,'utf8')!=='real-file')throw Error('missing bytes');console.log(JSON.stringify({ok:true,data:{}}));}`);
  const previous = process.env.LARK_CLI_SCRIPT; process.env.LARK_CLI_SCRIPT = runner;
  t.after(async () => { if (previous) process.env.LARK_CLI_SCRIPT = previous; else delete process.env.LARK_CLI_SCRIPT; await fs.rm(dir, { recursive: true, force: true }); });
  const base = new BaseAdapter({ baseToken: 'test', tables: { evidence: 'tblTest' } });
  const file = path.join(dir, 'attachment.png');
  await base.download('recTest', 'test-token', file);
  assert.equal(await fs.readFile(file, 'utf8'), 'real-file');
  await base.upload('recTest', file);
});

test('record viewing asks the official API for its shared URL using bot identity', async t => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'research-link-'));
  const runner = path.join(dir, 'runner.mjs');
  await fs.writeFile(runner, `import assert from 'node:assert/strict';const a=process.argv.slice(2);assert.deepEqual(a.slice(0,3),['api','GET','/open-apis/bitable/v1/apps/test/tables/tblTest/records/recTest']);assert.equal(a[a.indexOf('--as')+1],'bot');assert.equal(JSON.parse(a[a.indexOf('--params')+1]).with_shared_url,true);console.log(JSON.stringify({code:0,data:{record:{record_url:'https://vnet.feishu.cn/record/officialLink'}}}));`);
  const previous = process.env.LARK_CLI_SCRIPT; process.env.LARK_CLI_SCRIPT = runner;
  t.after(async () => { if (previous) process.env.LARK_CLI_SCRIPT = previous; else delete process.env.LARK_CLI_SCRIPT; await fs.rm(dir, { recursive: true, force: true }); });
  const base = new BaseAdapter({ baseToken: 'test', tables: { evidence: 'tblTest' } });
  assert.equal(await base.recordUrl('recTest'), 'https://vnet.feishu.cn/record/officialLink');
});

test('an uncoded connection failure never masquerades as a permission error', async t => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'research-error-'));
  const runner = path.join(dir, 'runner.mjs');
  await fs.writeFile(runner, `console.log(JSON.stringify({ok:false,error:{type:'network',message:'private upstream detail'}}));`);
  const previous = process.env.LARK_CLI_SCRIPT; process.env.LARK_CLI_SCRIPT = runner;
  t.after(async () => { if (previous) process.env.LARK_CLI_SCRIPT = previous; else delete process.env.LARK_CLI_SCRIPT; await fs.rm(dir, { recursive: true, force: true }); });
  const base = new BaseAdapter({ baseToken: 'test', tables: {} });
  await assert.rejects(base.cli('+record-list'), e => { assert.match(e.message, /未完成/); assert.doesNotMatch(e.message, /unknown|权限|授权|private/); return true; });
});
