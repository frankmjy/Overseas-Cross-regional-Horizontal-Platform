import test from 'node:test';
import assert from 'node:assert/strict';
import { buildPlan, sanitize, projectNames } from '../scripts/overseas-base-content.mjs';

const source = { tables: [{ id: 'tblRoutine', name: '例行工作' }, { id: 'tblLaunch', name: '【巴音】开服初始化D6' }, { id: 'tblSla', name: 'SLA标准' }], records: { tblRoutine: [{ recordId: 'recRoutine', 工作: '字节月度容量月报', 工作分类: ['二线工单'], 周期: ['1次/月'], 要求: '怀来基地每月10号上报' }], tblLaunch: [{ recordId: 'recLaunch', 工作内容: '消防强切检查', 工作目标: '关闭消防系统', 实施方法: '切断电源', 分类: ['检查类'] }], tblSla: [{ recordId: 'recSla', 分类: '基础服务', 子分类: '电力持续供应', 内容: '99.995%，40分钟赔付' }] } };

test('all new schemas are bilingual and use the two overseas projects only', () => {
  const plan = buildPlan(source);
  assert.ok(plan.tables.length >= 10);
  for (const table of plan.tables) {
    assert.match(table.name, /^[A-Za-z0-9].*（.+）$/);
    assert.equal(new Set(table.fields.map(f => f.name)).size, table.fields.length);
    for (const field of table.fields) assert.match(field.name, /^[A-Za-z0-9].*（.+）$/);
  }
  assert.deepEqual(projectNames, ['Thailand Project（泰国项目）', 'Malaysia Project（马来项目）']);
  assert.doesNotMatch(JSON.stringify(plan), /乌兰|怀来|太仓|巴音|安次|字节|抖音|北京时间|D6/);
});

test('adapted rows are explicit review templates with no invented people, dates or completion', () => {
  const plan = buildPlan(source);
  for (const table of plan.tables) for (const row of table.rows) {
    assert.ok(row['Import Key（导入键）']);
    assert.equal(row['Owner（负责人）'], undefined);
    assert.equal(row['Due Date（截止日期）'], undefined);
    if (table.key !== 'projects') assert.equal(row['Review Status（复核状态）'], 'Pending Review（待复核）');
  }
  const launch = plan.tables.find(t => t.key === 'launch').rows;
  assert.ok(launch.length === 2);
  assert.doesNotMatch(JSON.stringify(launch), /关闭消防系统|切断电源/);
  const sla = plan.tables.find(t => t.key === 'sla').rows;
  assert.equal(sla.length, 2);
  assert.doesNotMatch(JSON.stringify(sla), /99\.995|40分钟/);
  assert.ok(sla.every(r => r['Agreed Target（约定指标）'] === undefined));
});

test('content generation is deterministic and deduplicates identical source topics', () => {
  const duplicate = structuredClone(source); duplicate.records.tblRoutine.push({ ...duplicate.records.tblRoutine[0], recordId: 'recOther' });
  assert.equal(buildPlan(duplicate).tables.find(t => t.key === 'routine').rows.length, 2);
  const a = buildPlan(source), b = buildPlan(source);
  assert.deepEqual(a, b);
  const keys = a.tables.flatMap(t => t.rows.map(r => r['Import Key（导入键）']));
  assert.equal(new Set(keys).size, keys.length);
  assert.equal(sanitize('太仓基地与怀来基地，字节Dora，北京时间'), '项目现场与项目现场，客户服务门户，项目当地时间');
});
