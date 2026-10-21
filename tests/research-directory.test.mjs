import test from 'node:test';
import assert from 'node:assert/strict';
import { researchDirectory } from '../research/directory.mjs';

test('the revised directory orders source questions without changing stable IDs or legacy rows', () => {
  const rows = [
    {问题编号:'Q-044',问题列表:'旧问题',一级分类:['零售相关'],源行号:45,源表链接:'https://vnet.feishu.cn/sheets/source?sheet=6ec4f0'},
    {问题编号:'Q-002',问题列表:'第二项',一级分类:['属地合规'],源行号:26,源表链接:'[源表](https://vnet.feishu.cn/sheets/source?sheet=wwLsaC&range=A26)'},
    {问题编号:'Q-001',问题列表:'第一项',一级分类:['组织与人才'],源行号:2,源表链接:'https://vnet.feishu.cn/sheets/source?sheet=wwLsaC&range=A2'},
  ];
  const original=structuredClone(rows),result=researchDirectory(rows,[]);
  assert.deepEqual(result.questions.map(q=>q.问题编号),['Q-001','Q-002','Q-044']);
  assert.deepEqual(result.categories,['组织与人才','属地合规','零售相关']);
  assert.deepEqual(rows,original);
});

test('empty imported categories leave navigation while user-created topics and legacy data remain', () => {
  const result=researchDirectory([
    {问题列表:'有效',一级分类:['运维与验证']},
    {问题列表:'已删除',一级分类:['待确认分类'],已删除:true},
  ],[
    {专题名称:'待确认分类',迁移键:'init:待确认分类'},
    {专题名称:'运维与验证',迁移键:'wwLsaC:topic:运维与验证'},
    {专题名称:'新专题',迁移键:'web:123'},
  ]);
  assert.deepEqual(result.categories,['运维与验证','新专题']);
  assert.equal(result.questions.length,2);
});
