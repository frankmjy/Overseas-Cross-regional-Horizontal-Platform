import fs from 'node:fs';
import path from 'node:path';
import { BaseAdapter } from '../research/adapter.mjs';
import { writeAtomic } from '../research/service.mjs';
import { canonicalFieldName } from '../research/field-names.mjs';
import { researchProjectConfigs } from '../research/projects.mjs';
const file = path.resolve('research/config.json');
const config = JSON.parse(fs.readFileSync(file, 'utf8'));
if (config.projects) {
  for (const [project, target] of Object.entries(researchProjectConfigs(config))) {
    const adapter = new BaseAdapter(target);
    for (const table of ['questions', 'findings', 'evidence', 'topics']) {
      const result = await adapter.cli('+field-list', ['--table-id', target.tables[table]]);
      const required = Object.entries(target.fieldIds[table]);
      if (required.some(([name, id]) => !result.fields.some(field => field.id === id && canonicalFieldName(field.name) === name))) throw new Error(`${project}/${table} 正式字段绑定不一致，请先核对配置。`);
    }
    console.log(JSON.stringify({ ok: true, project, tables: target.tables, mode: 'verify-existing-formal-schema' }));
  }
  process.exit(0);
}
const base = new BaseAdapter(config);
const tables = (await base.cli('+table-list')).tables;
let topics = tables.filter(t => config.tables.topics ? t.id === config.tables.topics : ['专题目录', 'Topic Directory（专题目录）'].includes(t.name));
if (topics.length > 1) throw new Error('存在同名专题目录，禁止猜测目标表。');
if (!topics.length) {
  const result = await base.cli('+table-create', ['--name', '专题目录', '--fields', JSON.stringify([{ name: '专题名称', type: 'text' }, { name: '专题说明', type: 'text' }, { name: '迁移键', type: 'text' }])]);
  topics = [result.table];
}
if (!topics[0]?.id) throw new Error('专题目录 ID 未确认。');
config.tables.topics = topics[0].id; writeAtomic(file, config);
for (const table of ['questions', 'findings', 'evidence', 'topics']) {
  const result = await base.cli('+field-list', ['--table-id', base.table(table)]);
  const names = new Set(result.fields.map(f => canonicalFieldName(f.name)));
  const required = { questions: ['问题编号', '问题列表', '一级分类', '迁移键'], findings: ['明细编号', '关联问题', '调研内容', '举证原文', '迁移键'], evidence: ['附件', '所属明细', 'SHA256', '迁移键'], topics: ['专题名称', '专题说明', '迁移键'] }[table];
  if (required.some(name => !names.has(name))) throw new Error(`${table} 字段与应用契约不符。`);
}
const questions = await base.list('questions'); const existing = await base.list('topics');
const categories = [...new Set(questions.map(q => Array.isArray(q.一级分类) ? q.一级分类[0] : q.一级分类).filter(Boolean))];
for (const name of categories) {
  if (existing.some(t => t.专题名称 === name)) continue;
  await base.create('topics', { 专题名称: name, 专题说明: '从现有调研问题初始化', 迁移键: `init:${name}` });
}
const readback = await base.list('topics');
if (categories.some(name => !readback.some(t => t.专题名称 === name))) throw new Error('专题回读校验失败。');
console.log(JSON.stringify({ ok: true, identity: 'bot', topicTable: config.tables.topics, topics: readback.length, questions: questions.length }));
