import test from 'node:test';
import assert from 'node:assert/strict';
import { groupTopics } from '../research/web/topics.mjs';

test('topics follow business groups; custom topics precede the final pending category', () => {
  const source = ['待确认分类', '其他', '零售相关', '验证测试', '属地合规', '组织与人才', '采购与应急供应', '友商相关', '运维相关', '驻地与人员保障', '新增专题'];
  const original = [...source];
  const groups = groupTopics(source);
  assert.deepEqual(groups.map(g => g.name), ['团队与运营', '资源与保障', '业务与合规', '其他专题', '待整理']);
  assert.deepEqual(groups[0].topics.map(t => t.name), ['组织与人才', '运维相关', '验证测试']);
  assert.deepEqual(groups.flatMap(g => g.topics).map(t => t.name).slice(-3), ['新增专题', '其他', '待确认分类']);
  assert.equal(groups.flatMap(g => g.topics).length, source.length);
  assert.deepEqual(source, original);
});

test('topic groups omit empty sections and preserve newly created topics without duplicates', () => {
  const groups = groupTopics(['新专题', '新专题', '组织与人才']);
  assert.deepEqual(groups.map(g => g.name), ['团队与运营', '其他专题']);
  assert.deepEqual(groups.flatMap(g => g.topics).map(t => t.name), ['组织与人才', '新专题']);
  assert.deepEqual(groupTopics([]), []);
});

test('revised source categories stay in their business sections', () => {
  const groups = groupTopics(['组织与人才', '运维与验证', '友商与市场']);
  assert.deepEqual(groups.map(g => g.name), ['团队与运营', '业务与合规']);
  assert.deepEqual(groups[0].topics.map(t => t.name), ['组织与人才', '运维与验证']);
  assert.equal(groups[1].topics[0].name, '友商与市场');
});
