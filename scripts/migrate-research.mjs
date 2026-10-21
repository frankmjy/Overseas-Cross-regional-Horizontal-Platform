import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';

const dir = path.resolve('reports/research-migration-20261016');
const sourceUrl = 'https://vnet.feishu.cn/sheets/DCWyskGejheU9ttN82icPJ5xnOg';
const read = name => JSON.parse(fs.readFileSync(path.join(dir, name), 'utf8'));
const save = (name, value) => fs.writeFileSync(path.join(dir, name), JSON.stringify(value, null, 2) + '\n');
const text = name => ({ name, type: 'text' });
const number = name => ({ name, type: 'number', style: { type: 'plain', precision: 0 } });
const select = (name, values) => ({ name, type: 'select', options: values.map(name => ({ name })) });
const link = (name, table) => ({ name, type: 'link', link_table: table });
const url = name => ({ name, type: 'text', style: { type: 'url' } });
const sourceFile = fs.existsSync(path.join(dir, 'source-recheck.json')) ? 'source-recheck.json' : 'source-cells.json';
const source = read(sourceFile).data;
const originalData = fs.existsSync(path.join(dir, 'normalized-data-700.json')) ? read('normalized-data-700.json') : null;
const originalEvidence = originalData?.['证据资料'] || [];
let nextEvidenceNumber = Math.max(0, ...originalEvidence.map(x => +x['资料编号'].slice(2))) + 1;
const range = source.ranges[0];
const structure = read(fs.existsSync(path.join(dir, 'source-final-structure.json')) ? 'source-final-structure.json' : 'source-structure.json').data;
assert.equal(source.has_more, false);
assert.equal(range.actual_range, 'A1:Z213');
assert.equal(range.row_indices.length, 213);
const cells = new Map();
for (let i = 0; i < range.cells.length; i++) {
  for (let j = 0; j < range.cells[i].length; j++) {
    cells.set(`${range.col_indices[j]}${range.row_indices[i]}`, range.cells[i][j]);
  }
}
const cell = address => cells.get(address) || {};
const value = address => cell(address).value ?? '';
const companyCols = [['万国数据', 'D', 'E'], ['秦淮数据', 'F', 'G'], ['中联云港', 'H', 'I'], ['德衡数据', 'J', 'K'], ['其他部门输入', 'L', 'M']];
for (const [company, col] of companyCols) assert.equal(value(`${col}1`), company);
const meaningful = c => c.value !== undefined || (c.rich_text || []).length > 0;
for (const row of range.row_indices) {
  for (const col of range.col_indices.slice(13)) assert.ok(!meaningful(cell(`${col}${row}`)), `Unmapped source content at ${col}${row}`);
}
for (const sourceCell of range.cells.flat()) {
  assert.ok(Object.keys(sourceCell).every(key => ['value', 'rich_text'].includes(key)), 'Source has additional data that needs a migration mapping');
  assert.ok((sourceCell.rich_text || []).every(item => ['text', 'attachment', 'embed-image', 'mention', 'link'].includes(item.type)), 'Unsupported rich text type');
}
const filledRows = range.row_indices.filter(row => row > 1 && range.col_indices.some(col => meaningful(cell(`${col}${row}`))));
assert.equal(filledRows.length, sourceFile === 'source-recheck.json' ? 50 : 49);
assert.equal(filledRows.at(-1), sourceFile === 'source-recheck.json' ? 51 : 50);
const mergedCategories = new Map();
for (const merge of structure.merged_cells) {
  const m = /^A(\d+):A(\d+)$/.exec(merge.range);
  if (m) for (let row = +m[1]; row <= +m[2]; row++) mergedCategories.set(row, value(`A${m[1]}`));
}
const sourceCellUrl = coordinate => `${sourceUrl}?sheet=6ec4f0&range=${coordinate}`;
const questions = [];
const findings = [];
const evidence = [];
for (const row of filledRows) {
  const category = value(`A${row}`) || mergedCategories.get(row) || '';
  const qid = `Q-${String(row - 1).padStart(3, '0')}`;
  const question = value(`C${row}`);
  assert.ok(question);
  questions.push({
    '问题列表': question, '问题编号': qid, '一级分类': category || '待确认分类',
    '原序号': String(value(`B${row}`)), '重点标记': /^top\s*[123]$/i.test(String(value(`B${row}`))),
    '分类待确认': !category, '源行号': row, '源表链接': sourceCellUrl(`A${row}:M${row}`),
    '迁移键': `6ec4f0:${row}`,
  });
  for (const [company, answerCol, proofCol] of companyCols) {
    const fid = `${qid}:${company}`;
    const media = [];
    for (const col of [answerCol, proofCol]) {
      for (const rich of cell(`${col}${row}`).rich_text || []) {
        if (!['attachment', 'embed-image', 'mention', 'link'].includes(rich.type)) continue;
        const embedded = rich.type === 'embed-image';
        const downloadable = ['attachment', 'embed-image'].includes(rich.type);
        const token = rich.attachment_token || rich.image_token || rich.mention_token || '';
        const previous = originalEvidence.find(x => token && x['原文件标识'] === token)
          || originalEvidence.find(x => rich.link && x['原始链接'] === rich.link)
          || originalEvidence.find(x => x['所属明细'] === fid && x['资料类型'] === '单元格图片');
        const index = previous ? +previous['资料编号'].slice(2) : originalEvidence.length ? nextEvidenceNumber++ : evidence.length + 1;
        const filename = embedded ? `${company}-项目规模.png` : (rich.text || '资料');
        const relativePath = downloadable ? `media/${String(index).padStart(3, '0')}/${filename}` : null;
        const item = {
          '资料名称': filename, '资料编号': `E-${String(index).padStart(3, '0')}`, '所属明细': fid,
          '调研对象': company, '问题编号': qid,
          '资料类型': embedded ? '单元格图片' : rich.type === 'attachment' ? '文件附件' : rich.type === 'mention' ? '文件引用' : '文件夹链接',
          '迁移状态': downloadable ? '待下载授权' : '保留原引用',
          '源单元格': `${col}${row}`, '原文件标识': rich.attachment_token || rich.image_token || rich.mention_token || '',
          '原文件大小': rich.file_size ?? null, 'MIME类型': rich.mime_type || (embedded ? 'image/png' : ''),
          '原始链接': rich.link || (rich.type === 'mention' ? 'https://www.feishu.cn/file/FQvcbukIRo965UxKbY1cMpqmnPc' : ''),
          '源表链接': sourceCellUrl(`${col}${row}`), '迁移键': `6ec4f0:${col}${row}:${media.length}`,
          localPath: relativePath, downloadable,
        };
        evidence.push(item);
        media.push(item);
      }
    }
    findings.push({
      '明细名称': `${company}｜${question}`, '明细编号': fid, '关联问题': qid,
      '一级分类': category || '待确认分类', '调研对象': company,
      '调研内容': String(value(`${answerCol}${row}`)), '举证原文': String(value(`${proofCol}${row}`)),
      '材料状态': meaningful(cell(`${answerCol}${row}`)) || meaningful(cell(`${proofCol}${row}`)) ? '有原始材料' : '待调研',
      '源内容单元格': `${answerCol}${row}`, '源举证单元格': `${proofCol}${row}`,
      '源行号': row, '源表链接': sourceCellUrl(`${answerCol}${row}:${proofCol}${row}`),
      '迁移键': `6ec4f0:${row}:${answerCol}:${proofCol}`,
    });
  }
}
assert.equal(findings.length, questions.length * 5);
assert.equal(evidence.length, sourceFile === 'source-recheck.json' ? 30 : 28);
assert.equal(evidence.filter(x => x.downloadable).length, sourceFile === 'source-recheck.json' ? 28 : 26);
assert.equal(new Set(evidence.map(x => x['资料编号'])).size, evidence.length);
const unclassifiedRows = questions.filter(q => q['分类待确认']).map(q => q['源行号']);
assert.deepEqual(unclassifiedRows, sourceFile === 'source-recheck.json' ? [19, 33, 34, 35, 51] : [19, 33, 34, 35]);
const categories = [...new Set(questions.map(q => q['一级分类']))];
const companies = companyCols.map(x => x[0]);
const schemas = {
  '调研问题': [text('问题列表'), text('问题编号'), select('一级分类', categories), text('原序号'), { name: '重点标记', type: 'checkbox' }, { name: '分类待确认', type: 'checkbox' }, number('源行号'), url('源表链接'), text('迁移键')],
  '调研明细': [text('明细名称'), text('明细编号'), link('关联问题', '调研问题'), select('一级分类', categories), select('调研对象', companies), text('调研内容'), text('举证原文'), select('材料状态', ['有原始材料', '待调研']), text('源内容单元格'), text('源举证单元格'), number('源行号'), url('源表链接'), text('迁移键')],
  '证据资料': [text('资料名称'), text('资料编号'), link('所属明细', '调研明细'), select('调研对象', companies), text('问题编号'), select('资料类型', ['文件附件', '单元格图片', '文件引用', '文件夹链接']), { name: '附件', type: 'attachment' }, select('迁移状态', ['待下载授权', '已迁移', '保留原引用', '迁移失败']), text('源单元格'), text('原文件标识'), number('原文件大小'), text('MIME类型'), url('原始链接'), url('源表链接'), text('SHA256'), text('迁移键')],
};
const dataByTable = { '调研问题': questions, '调研明细': findings, '证据资料': evidence };
save('normalized-data.json', dataByTable);
save('schemas.json', schemas);

function cli(args) {
  const runner = process.env.LARK_CLI_RUNNER;
  assert.ok(runner && fs.existsSync(runner), 'Set LARK_CLI_RUNNER to the installed lark-cli scripts/run.js');
  const result = spawnSync(process.execPath, [runner, ...args, '--as', 'user'], { encoding: 'utf8', maxBuffer: 12 * 1024 * 1024, timeout: 90000, windowsHide: true });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${args[0]} ${args[1]} failed: ${result.stderr.slice(0, 3000)}`);
  const parsed = JSON.parse(result.stdout);
  assert.equal(parsed.ok, true, `${args[1]} did not return ok`);
  return parsed.data;
}
const checkpointFile = 'checkpoint.json';
const state = fs.existsSync(path.join(dir, checkpointFile)) ? read(checkpointFile) : { tables: {}, batches: {}, uploads: {} };
const checkpoint = () => save(checkpointFile, state);
const baseArgs = () => ['--base-token', state.baseToken];
function listAll(table) {
  const output = [];
  for (let offset = 0; ; offset += 200) {
    const data = cli(['base', '+record-list', ...baseArgs(), '--table-id', table, '--limit', '200', '--offset', String(offset), '--format', 'json']);
    save(`readback-${table}-${offset}.json`, data);
    output.push(data);
    const count = data.record_id_list?.length;
    assert.ok(count !== undefined, 'Inspect record-list response before continuing');
    if (count < 200) break;
  }
  return output;
}

const action = process.argv[2] || 'prepare';
if (action === 'prepare') {
  console.log(JSON.stringify({ questions: questions.length, findings: findings.length, evidence: evidence.length, media: evidence.filter(x => x.downloadable).length, categories, unclassifiedRows, populatedFindings: findings.filter(x => x['材料状态'] === '有原始材料').length }, null, 2));
} else if (action === 'create-base') {
  assert.ok(!state.baseToken, 'Base already exists; use checkpoint');
  const data = cli(['base', '+base-create', '--name', '海外项目调研数据库', '--time-zone', 'Asia/Shanghai', '--table-name', '调研问题', '--fields', JSON.stringify(schemas['调研问题'])]);
  save('base-create.json', data);
  console.log(JSON.stringify(data));
} else if (action === 'import-base') {
  assert.ok(!state.baseToken && !fs.existsSync(path.join(dir, 'base-import.json')), 'An existing import must be resumed, never recreated');
  const data = cli(['drive', '+import', '--file', 'reports/research-migration-20261016/迁移说明.csv', '--type', 'bitable', '--name', '海外项目调研数据库']);
  save('base-import.json', data);
  console.log(JSON.stringify(data));
} else if (action === 'create-tables') {
  assert.ok(state.baseToken);
  for (const name of ['调研问题', '调研明细', '证据资料']) {
    if (state.tables[name]) continue;
    const data = cli(['base', '+table-create', ...baseArgs(), '--name', name, '--fields', JSON.stringify(schemas[name])]);
    save(`create-${name}.json`, data);
    console.log(JSON.stringify({ name, id: data.table?.id || data.table_id || data.id }));
    const id = data.table_id || data.table?.id || data.id;
    assert.ok(id, 'Inspect created table response and checkpoint before continuing');
    state.tables[name] = id;
    checkpoint();
  }
} else if (action === 'fields') {
  for (const [name, table] of Object.entries(state.tables)) {
    const data = cli(['base', '+field-list', ...baseArgs(), '--table-id', table]);
    save(`fields-${name}.json`, data);
    console.log(name, 'field metadata saved');
  }
} else if (action === 'migrate') {
  for (const name of ['调研问题', '调研明细', '证据资料']) {
    const table = state.tables[name];
    assert.ok(table);
    assert.ok(fs.existsSync(path.join(dir, `fields-${name}.json`)), 'Read fields before writing');
    const records = dataByTable[name];
    const fields = schemas[name].filter(f => !['attachment'].includes(f.type)).map(f => f.name);
    for (let offset = 0; offset < records.length; offset += 200) {
      const key = `${name}:${offset}`;
      if (state.batches[key]) continue;
      assert.ok(!state.pendingBatch, 'An unconfirmed write must be reconciled by reading the table');
      const batch = records.slice(offset, offset + 200);
      const rows = batch.map(record => fields.map(field => {
        let v = record[field] ?? null;
        if (field === '关联问题') v = [{ id: state.questionIds[v] }];
        if (field === '所属明细') v = [{ id: state.findingIds[v] }];
        return v === '' ? null : v;
      }));
      const payload = { fields, rows };
      const filename = `payload-${name}-${offset}.json`;
      save(filename, payload);
      state.pendingBatch = key;
      checkpoint();
      const data = cli(['base', '+record-batch-create', ...baseArgs(), '--table-id', table, '--json', `@${path.relative(process.cwd(), path.join(dir, filename))}`]);
      save(`created-${name}-${offset}.json`, data);
      assert.equal(data.record_id_list.length, batch.length);
      assert.ok(!data.ignored_fields?.length);
      state.batches[key] = data.record_id_list;
      if (name === '调研问题') {
        state.questionIds ||= {};
        batch.forEach((r, i) => state.questionIds[r['问题编号']] = data.record_id_list[i]);
      } else if (name === '调研明细') {
        state.findingIds ||= {};
        batch.forEach((r, i) => state.findingIds[r['明细编号']] = data.record_id_list[i]);
      } else {
        state.evidenceIds ||= {};
        batch.forEach((r, i) => state.evidenceIds[r['资料编号']] = data.record_id_list[i]);
      }
      delete state.pendingBatch;
      checkpoint();
      console.log(`${name}: ${offset + batch.length}/${records.length}`);
    }
  }
} else if (action === 'refresh-snapshot') {
  assert.ok(originalData);
  state.refresh ||= {};
  for (const name of ['调研问题', '调研明细', '证据资料']) {
    const keyField = name === '调研问题' ? '问题编号' : name === '调研明细' ? '明细编号' : '资料编号';
    const ids = name === '调研问题' ? state.questionIds : name === '调研明细' ? state.findingIds : state.evidenceIds;
    const oldRows = new Map(originalData[name].map(r => [r[keyField], r]));
    for (const record of dataByTable[name]) {
      const old = oldRows.get(record[keyField]);
      if (JSON.stringify(old) === JSON.stringify(record)) continue;
      const key = record[keyField];
      if (process.argv[3] && key !== process.argv[3]) continue;
      const payload = Object.fromEntries(schemas[name].filter(f => f.type !== 'attachment').map(f => {
        let v = record[f.name] ?? null;
        if (f.name === '关联问题') v = [{ id: state.questionIds[v] }];
        if (f.name === '所属明细') v = [{ id: state.findingIds[v] }];
        if (name === '证据资料' && state.uploads[key]?.marked) {
          if (f.name === '迁移状态') v = '已迁移';
          if (f.name === 'SHA256') v = state.uploads[key].sha256;
        }
        return [f.name, v === '' ? null : v];
      }));
      const payloadHash = createHash('sha256').update(JSON.stringify(payload)).digest('hex');
      if (state.refresh[key] === payloadHash) continue;
      const filename = `refresh-${name}-${key.replaceAll(':', '-')}.json`;
      save(filename, payload);
      const args = ['base', '+record-upsert', ...baseArgs(), '--table-id', state.tables[name], '--json', `@${path.relative(process.cwd(), path.join(dir, filename))}`];
      if (ids[key]) args.push('--record-id', ids[key]);
      else {
        assert.ok(!state.pendingRefresh, 'Reconcile unconfirmed create before resuming');
        state.pendingRefresh = key;
        checkpoint();
      }
      const result = cli(args);
      save(`refresh-result-${name}-${key.replaceAll(':', '-')}.json`, result);
      if (!ids[key]) {
        ids[key] = result.record?.id || result.record?.record_id || result.record?.record_id_list?.[0];
        assert.ok(ids[key], 'Inspect created record ID');
      }
      state.refresh[key] = payloadHash;
      delete state.pendingRefresh;
      checkpoint();
      console.log(name, key, result.updated ? 'updated' : 'added');
    }
  }
} else if (action === 'readback') {
  for (const table of Object.values(state.tables)) listAll(table);
} else if (action === 'upload-media') {
  for (const item of evidence.filter(x => x.downloadable)) {
    const id = item['资料编号'];
    const filename = path.join(dir, item.localPath);
    if (!fs.existsSync(filename)) continue;
    const bytes = fs.readFileSync(filename);
    if (item['原文件大小'] !== null) assert.equal(bytes.length, item['原文件大小'], `${id}: wrong file size`);
    const sha256 = createHash('sha256').update(bytes).digest('hex');
    if (!state.uploads[id]) {
      assert.ok(!state.pendingUpload, 'Reconcile unconfirmed attachment upload before resuming');
      state.pendingUpload = id;
      checkpoint();
      const uploaded = cli(['base', '+record-upload-attachment', ...baseArgs(), '--table-id', state.tables['证据资料'], '--record-id', state.evidenceIds[id], '--field-id', '附件', '--file', path.relative(process.cwd(), filename)]);
      save(`uploaded-${id}.json`, uploaded);
      state.uploads[id] = { sha256, bytes: bytes.length, localPath: item.localPath };
      delete state.pendingUpload;
      checkpoint();
    }
    assert.equal(state.uploads[id].sha256, sha256);
    if (!state.uploads[id].marked) {
      cli(['base', '+record-upsert', ...baseArgs(), '--table-id', state.tables['证据资料'], '--record-id', state.evidenceIds[id], '--json', JSON.stringify({ '迁移状态': '已迁移', SHA256: sha256 })]);
      state.uploads[id].marked = true;
      checkpoint();
    }
    console.log(id, 'uploaded', bytes.length, sha256);
  }
} else if (action === 'collect-downloads') {
  const downloaded = read('browser-downloads.json');
  for (const entry of downloaded) {
    const item = evidence.find(x => x['资料编号'] === entry.id);
    assert.ok(item?.downloadable);
    assert.ok(fs.existsSync(entry.path), `${entry.id}: downloaded file is missing`);
    if (item['原文件大小'] !== null) assert.equal(fs.statSync(entry.path).size, item['原文件大小']);
    const target = path.join(dir, item.localPath);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    if (fs.existsSync(target)) {
      assert.deepEqual(fs.readFileSync(target), fs.readFileSync(entry.path), `${entry.id}: existing local file differs`);
    } else fs.copyFileSync(entry.path, target);
  }
  console.log(downloaded.length, 'browser downloads collected');
} else if (action === 'views') {
  state.views ||= {};
  const configs = [
    { table: '调研问题', name: '按分类查看', group: [{ field: '一级分类', desc: false }], fields: ['问题列表', '问题编号', '一级分类', '原序号', '重点标记', '分类待确认', '源表链接'] },
    { table: '调研问题', name: '重点问题', filter: { conditions: [['重点标记', '==', true]] } },
    { table: '调研问题', name: '分类待确认', filter: { conditions: [['分类待确认', '==', true]] } },
    { table: '调研明细', name: '已有材料', filter: { conditions: [['材料状态', 'intersects', ['有原始材料']]] }, group: [{ field: '一级分类', desc: false }], fields: ['明细名称', '调研对象', '调研内容', '举证原文', '关联问题', '材料状态', '源表链接'] },
    { table: '调研明细', name: '待调研', filter: { conditions: [['材料状态', 'intersects', ['待调研']]] }, group: [{ field: '一级分类', desc: false }], fields: ['明细名称', '调研对象', '关联问题', '材料状态', '源表链接'] },
    { table: '证据资料', name: '证据清单', filter: { conditions: [['资料编号', 'non_empty']] }, group: [{ field: '调研对象', desc: false }], fields: ['资料名称', '调研对象', '问题编号', '资料类型', '附件', '迁移状态', '所属明细', '原始链接', '源表链接'] },
  ];
  for (const config of configs) {
    const key = `${config.table}:${config.name}`;
    const args = [...baseArgs(), '--table-id', state.tables[config.table]];
    if (!state.views[key]) {
      const created = cli(['base', '+view-create', ...args, '--json', JSON.stringify({ name: config.name, type: 'grid' })]);
      save(`view-create-${config.name}.json`, created);
      const id = created.view?.id || created.views?.[0]?.id || created.id;
      assert.ok(id, 'Inspect created view ID');
      state.views[key] = { id };
      checkpoint();
    }
    const view = state.views[key];
    const viewArgs = [...args, '--view-id', view.id];
    if (config.filter) cli(['base', '+view-set-filter', ...viewArgs, '--json', JSON.stringify(config.filter)]);
    if (config.group) {
      cli(['base', '+view-get-group', ...viewArgs]);
      cli(['base', '+view-set-group', ...viewArgs, '--json', JSON.stringify({ group_config: config.group })]);
    }
    if (config.fields) {
      cli(['base', '+view-get-visible-fields', ...viewArgs]);
      cli(['base', '+view-set-visible-fields', ...viewArgs, '--json', JSON.stringify({ visible_fields: config.fields })]);
    }
    save(`view-readback-${config.name}.json`, cli(['base', '+view-get', ...viewArgs]));
    console.log(config.name, 'configured');
  }
} else if (action === 'verify-views') {
  const targets = [
    ['调研问题', '重点问题', questions.filter(q => q['重点标记']).length],
    ['调研问题', '分类待确认', unclassifiedRows.length],
    ['调研明细', '已有材料', findings.filter(f => f['材料状态'] === '有原始材料').length],
    ['调研明细', '待调研', findings.filter(f => f['材料状态'] === '待调研').length],
    ['证据资料', '证据清单', evidence.length],
  ];
  const results = [];
  for (const [table, name, count] of targets) {
    const page = cli(['base', '+record-list', ...baseArgs(), '--table-id', state.tables[table], '--view-id', state.views[`${table}:${name}`].id, '--field-id', '迁移键', '--limit', '200', '--format', 'json']);
    assert.equal(page.has_more, false);
    assert.equal(page.data.length, count, `${name}: filtered count`);
    assert.equal(new Set(page.data.map(row => row[0])).size, count);
    results.push({ table, view: name, count });
  }
  save('view-verification.json', results);
  console.log(JSON.stringify(results));
} else if (action === 'verify') {
  const checks = [];
  for (const name of ['调研问题', '调研明细', '证据资料']) {
    const table = state.tables[name];
    const pages = [];
    for (let offset = 0; ; offset += 200) {
      const page = read(`readback-${table}-${offset}.json`);
      pages.push(page);
      if (!page.has_more) break;
    }
    const byKey = new Map();
    for (const page of pages) {
      assert.equal(page.record_id_list.length, page.data.length);
      for (let i = 0; i < page.data.length; i++) {
        const record = Object.fromEntries(page.fields.map((f, j) => [f, page.data[i][j]]));
        if (!record['迁移键']) {
          assert.ok((state.clearedPlaceholderIds || []).includes(page.record_id_list[i]), 'Unexpected blank row');
          assert.ok(Object.values(record).every(v => v === null || v === '' || Array.isArray(v) && !v.length));
          continue;
        }
        assert.ok(!byKey.has(record['迁移键']), 'Duplicate migration key');
        byKey.set(record['迁移键'], record);
      }
    }
    assert.equal(byKey.size, dataByTable[name].length, `${name}: record count`);
    let compared = 0;
    for (const expected of dataByTable[name]) {
      const actual = byKey.get(expected['迁移键']);
      assert.ok(actual);
      for (const field of schemas[name]) {
        if (field.type === 'attachment') continue;
        let wanted = expected[field.name] ?? null;
        if (name === '证据资料' && state.uploads[expected['资料编号']]?.marked) {
          if (field.name === '迁移状态') wanted = '已迁移';
          if (field.name === 'SHA256') wanted = state.uploads[expected['资料编号']].sha256;
        }
        let got = actual[field.name] ?? null;
        if (field.type === 'link') {
          wanted = [{ id: field.name === '关联问题' ? state.questionIds[wanted] : state.findingIds[wanted] }];
          got = (got || []).map(x => ({ id: x.id }));
        } else if (field.type === 'select') got = Array.isArray(got) ? got[0] : got;
        else if (field.type === 'text') {
          wanted ??= '';
          got ??= '';
          if (field.style?.type === 'url' && got) {
            const m = /^\[[\s\S]*\]\((https?:[^\n]*)\)$/.exec(got);
            if (m) got = m[1];
          }
        }
        assert.deepEqual(got, wanted, `${name}/${expected['迁移键']}/${field.name}`);
        compared++;
      }
      if (name === '证据资料' && expected.downloadable) {
        const uploaded = state.uploads[expected['资料编号']];
        assert.ok(uploaded?.marked, `${expected['资料编号']}: media is incomplete`);
        const attachments = actual['附件'];
        assert.equal(attachments?.length, 1, `${expected['资料编号']}: attachment count`);
        const file = attachments[0];
        assert.equal(file.name, expected['资料名称']);
        assert.equal(file.size, uploaded.bytes);
      }
    }
    checks.push({ table: name, records: byKey.size, comparedFields: compared });
  }
  const report = { verifiedAt: new Date().toISOString(), sourceSnapshot: sourceFile, sourceRevision: read('source-final-workbook.json').data.revision, sourceSHA256: createHash('sha256').update(fs.readFileSync(path.join(dir, sourceFile))).digest('hex'), checks, media: evidence.filter(x => x.downloadable).length, externalReferences: 2, unclassifiedRows, result: 'passed' };
  save('verification.json', report);
  const exported = structuredClone(dataByTable);
  for (const item of exported['证据资料']) {
    if (state.uploads[item['资料编号']]?.marked) {
      item['迁移状态'] = '已迁移';
      item.SHA256 = state.uploads[item['资料编号']].sha256;
    }
  }
  save('database-snapshot.json', exported);
  save('database-contract.json', {
    url: state.url, tables: state.tables, views: state.views,
    source: { url: sourceUrl, revision: report.sourceRevision, snapshotSHA256: report.sourceSHA256 },
    keys: { questions: '问题编号', findings: '明细编号', evidence: '资料编号' },
    relationships: ['调研明细.关联问题 -> 调研问题', '证据资料.所属明细 -> 调研明细'],
    schemas, note: '前端由服务端读取飞书数据，应用凭据仅放环境变量；此任务只完成快照迁移。',
  });
  console.log(JSON.stringify(report, null, 2));
} else if (action === 'finish-notes') {
  assert.equal(read('verification.json').result, 'passed');
  const tableData = cli(['base', '+table-list', ...baseArgs()]);
  const notesTable = tableData.tables.find(t => t.name === '迁移说明');
  assert.ok(notesTable);
  const notes = cli(['base', '+record-list', ...baseArgs(), '--table-id', notesTable.id, '--format', 'json']);
  const nameIndex = notes.fields.indexOf('事项');
  const updates = {
    '数据范围': '源表Sheet1第2至51行；50个问题、5个调研对象、250个调研单元。',
    '分类待确认': '原表第19、33、34、35、51行未填写分类；合并单元格内按明确合并范围继承，其余不推断。',
    '附件状态': '28个附件均已迁移，逐份核对原文件大小，并记录SHA256；2处外部资料引用保留原链接。',
    '迁移时间': '2026-10-16，迁移采用读取时源表第722版快照；不自动同步此后编辑。',
  };
  const emptyIds = [];
  for (let i = 0; i < notes.data.length; i++) {
    const name = notes.data[i][nameIndex];
    if (!name) emptyIds.push(notes.record_id_list[i]);
    if (updates[name]) cli(['base', '+record-upsert', ...baseArgs(), '--table-id', notesTable.id, '--record-id', notes.record_id_list[i], '--json', JSON.stringify({ '说明': updates[name] })]);
  }
  const extra = [
    { '事项': '校验结果', '说明': '50个问题、250条明细、30条证据全量字段和关联回读通过；77条明细有原始材料，173条待调研。' },
    { '事项': '前端接入', '说明': '问题编号、明细编号和资料编号为稳定业务标识；后续先确认展示模板，再接入本数据库。' },
  ];
  for (const entry of extra) {
    const found = notes.data.findIndex(row => row[nameIndex] === entry['事项']);
    const id = found >= 0 ? notes.record_id_list[found] : emptyIds.shift();
    assert.ok(id, 'Notes table requires a known existing record');
    cli(['base', '+record-upsert', ...baseArgs(), '--table-id', notesTable.id, '--record-id', id, '--json', JSON.stringify(entry)]);
  }
  const after = cli(['base', '+record-list', ...baseArgs(), '--table-id', notesTable.id, '--format', 'json']);
  save('notes-readback.json', after);
  assert.equal(after.data.length, 10);
  assert.ok(after.data.every(row => row.every(v => v !== null && v !== '')));
  console.log('Migration notes updated and verified');
} else {
  throw new Error(`Unknown action: ${action}`);
}
