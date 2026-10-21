import fs from 'node:fs/promises';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { buildPlan, projectNames } from './overseas-base-content.mjs';

const execute = promisify(execFile);
const root = path.resolve('.');
if (process.argv.includes('--apply')) throw new Error('旧通用字段导入已停用。请使用 reorganize-overseas-base.mjs；避免覆盖现场业务字段。');
const work = path.join(root, '.runtime/base-enrichment-20261018');
const report = path.join(root, 'reports/base-enrichment-20261018');
const input = JSON.parse(await fs.readFile(path.join(work, 'source-projection.json'), 'utf8'));
const plan = buildPlan(input);
await fs.mkdir(report, { recursive: true });
await fs.writeFile(path.join(report, 'adaptation-plan.json'), JSON.stringify(plan, null, 2));
const fieldKey = 'Import Key（导入键）';
const canonical = value => Array.isArray(value) ? value.map(canonical) : value && typeof value === 'object' ? Object.fromEntries(Object.keys(value).sort().map(k => [k, canonical(value[k])])) : value;
const equal = (a, b) => JSON.stringify(canonical(a)) === JSON.stringify(canonical(b));

async function cli(command, args = [], retried = false) {
  let stdout;
  try { ({ stdout } = await execute(process.execPath, [path.join(root, 'vendor/lark-cli/run.cjs'), 'base', command, '--base-token', plan.targetBase, ...args, '--as', 'bot', '--jq', '.'], { cwd: root, windowsHide: true, timeout: 60000, maxBuffer: 16 * 1024 * 1024 })); }
  catch (e) { stdout = e.stdout || e.stderr; }
  let result; try { result = JSON.parse(stdout); } catch { throw new Error(`${command}: CLI 返回不是 JSON，已停止，未自动重试写入。`); }
  if (!result.ok) {
    const network = /dial tcp|timeout|timed out|connectex|network/i.test(result.error?.message || '');
    if (network && !retried && ['+table-list', '+field-list', '+record-list', '+view-list'].includes(command)) return cli(command, args, true);
    throw new Error(`${command}: ${network ? '网络连接未完成' : result.error?.code || result.error?.type || 'failed'}；已停止，写入不会自动重试。`);
  }
  return result.data;
}
async function read(table) {
  const all = []; let offset = 0;
  for (let page = 0; page < 100; page++) {
    const d = await cli('+record-list', ['--table-id', table, '--limit', '200', '--offset', String(offset)]);
    const rows = d.data.map((row, i) => ({ recordId: d.record_id_list[i], ...Object.fromEntries(d.fields.map((f, j) => [f, row[j]])) }));
    all.push(...rows); if (!d.has_more) return all;
    if (!rows.length) throw new Error('分页没有前进。'); offset += rows.length;
  }
  throw new Error('分页超过上限。');
}
if (!process.argv.includes('--apply')) {
  console.log(JSON.stringify({ planOnly: true, tables: plan.tables.map(t => ({ name: t.name, fields: t.fields.length, rows: t.rows.length })), rows: plan.tables.reduce((n, t) => n + t.rows.length, 0) }, null, 2));
  process.exit(0);
}
const progressFile = path.join(work, 'progress.json');
let progress;
try { progress = JSON.parse(await fs.readFile(progressFile, 'utf8')); } catch (e) { if (e.code !== 'ENOENT') throw e; progress = { tables: {}, records: {}, views: {}, verified: {} }; }
const save = () => fs.writeFile(progressFile, JSON.stringify(progress, null, 2));
const remoteTables = (await cli('+table-list')).tables;
let boundProjects = [];
const from = process.argv.indexOf('--from');
const start = from < 0 ? 0 : plan.tables.findIndex(t => t.key === process.argv[from + 1]);
if (start < 0) throw new Error('续跑模块不存在。');
if (start > 0) {
  if (plan.tables.slice(0, start).some(t => !progress.verified[t.key])) throw new Error('前置模块缺少已验证台账，不能跳过。');
  boundProjects = await read(progress.tables.projects);
}
for (const table of plan.tables.slice(start)) {
  const matches = remoteTables.filter(t => t.name === table.name);
  if (matches.length > 1) throw new Error(`重名表：${table.name}`);
  let tableId = matches[0]?.id;
  const fields = table.fields.map(f => f.link_table === '@projects' ? { ...f, link_table: progress.tables.projects } : f);
  if (fields.some(f => f.type === 'link' && !f.link_table)) throw new Error('关联项目表尚未创建。');
  if (!tableId) {
    if (progress.tables[table.key]) throw new Error('台账中的表已被移动或改名，禁止新建重复表。');
    const d = await cli('+table-create', ['--name', table.name, '--fields', JSON.stringify(fields), '--view', JSON.stringify({ name: 'All Records（全部记录）', type: 'grid' })]);
    tableId = d.table?.id;
    if (!tableId) throw new Error('创建表响应未包含 ID，停止并待重新读取核对。');
    remoteTables.push({ id: tableId, name: table.name });
  }
  progress.tables[table.key] = tableId; await save();
  const actualFields = (await cli('+field-list', ['--table-id', tableId])).fields;
  const names = new Map(actualFields.map(f => [f.name, f]));
  for (const f of fields) {
    const actual = names.get(f.name);
    const selectMismatch = f.type === 'select' && (actual?.multiple !== f.multiple || !equal(actual.options.map(o => o.name).sort(), f.options.map(o => o.name).sort()));
    if (!actual || actual.type !== f.type || f.type === 'link' && actual.link_table !== f.link_table || selectMismatch) throw new Error(`表结构不匹配：${table.name} ${f.name}`);
  }
  const projectRecords = table.key === 'projects' ? [] : boundProjects;
  const expectedRows = table.rows.map(row => ({ ...row, ...(table.key === 'projects' ? {} : { 'Related Project（关联项目）': (Array.isArray(row['Project（项目归属）']) ? row['Project（项目归属）'] : [row['Project（项目归属）']]).map(name => { const matches = projectRecords.filter(p => p['Project Name（项目名称）'] === name); if (matches.length !== 1) throw new Error(`项目关联不唯一：${name}`); return { id: matches[0].recordId }; }) }) }));
  const existing = await read(tableId);
  const byKey = new Map();
  for (const row of existing) { if (!row[fieldKey]) continue; if (byKey.has(row[fieldKey])) throw new Error('存在重复导入键，停止写入。'); byKey.set(row[fieldKey], row); }
  const missing = expectedRows.filter(r => !byKey.has(r[fieldKey]));
  const keys = fields.filter(f => expectedRows.some(r => Object.hasOwn(r, f.name))).map(f => f.name);
  for (let offset = 0; offset < missing.length; offset += 200) {
    const batch = missing.slice(offset, offset + 200);
    const payloadFile = path.join(work, `payload-${table.key}-${offset}.json`);
    await fs.writeFile(payloadFile, JSON.stringify({ fields: keys.map(k => names.get(k).id), rows: batch.map(r => keys.map(k => r[k] ?? null)) }));
    const d = await cli('+record-batch-create', ['--table-id', tableId, '--json', `@${path.relative(root, payloadFile)}`]);
    if (d.ignored_fields?.length || d.record_id_list?.length !== batch.length) throw new Error('批量创建结果不完整；禁止盲目重试，请按导入键回读。');
    progress.records[table.key] = [...(progress.records[table.key] || []), ...d.record_id_list]; await save();
  }
  const after = missing.length ? await read(tableId) : existing;
  for (const expected of expectedRows) {
    const found = after.filter(r => r[fieldKey] === expected[fieldKey]);
    if (found.length !== 1) throw new Error('回读未唯一匹配导入键。');
    for (const [name, value] of Object.entries(expected)) {
      const f = names.get(name), actual = found[0][name];
      const normalize = v => f.type === 'link' ? (v || []).map(x => x.id).sort() : f.type === 'select' ? (Array.isArray(v) ? v : [v]).filter(Boolean).sort() : v;
      if (!equal(normalize(actual), normalize(value))) throw new Error(`回读字段不一致：${table.name} ${name}`);
    }
  }
  progress.verified[table.key] = { expected: expectedRows.length, records: after.length, createdThisRun: missing.length }; await save();
  if (table.key === 'projects') boundProjects = after;
  if (table.key !== 'projects') {
    const viewList = (await cli('+view-list', ['--table-id', tableId])).views;
    if (!Array.isArray(viewList)) throw new Error('视图返回结构不匹配。');
    for (const name of projectNames) {
      let view = viewList.find(v => v.name === name);
      if (view?.id && progress.views[`${table.key}:${name}`] === view.id) continue;
      if (!view) { const d = await cli('+view-create', ['--table-id', tableId, '--json', JSON.stringify({ name, type: 'grid' })]); view = d.views?.[0] || d.view; if (!view?.id) throw new Error('视图创建响应缺少 ID，停止并重新读取。'); }
      await cli('+view-set-filter', ['--table-id', tableId, '--view-id', view.id, '--json', JSON.stringify({ logic: 'and', conditions: [[names.get('Project（项目归属）').id, 'intersects', [name]]] })]);
      progress.views[`${table.key}:${name}`] = view.id; await save();
    }
  }
  console.log(`${table.name}: ${expectedRows.length} 条回读通过，本次新增 ${missing.length}`);
}
await fs.writeFile(path.join(report, 'verification.json'), JSON.stringify({ at: new Date().toISOString(), targetBase: plan.targetBase, ...progress }, null, 2));
console.log('全部适配表与项目筛选视图已核验。');
