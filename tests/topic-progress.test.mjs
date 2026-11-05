import test from 'node:test';
import assert from 'node:assert/strict';
import { topicProgress } from '../research/web/topic-progress.mjs';

const questions = [{ id: 'thailand:Q-1', category: '组织与人才' }, { id: 'malaysia:Q-1', category: '组织与人才' }, { id: 'malaysia:Q-2', category: '运维与验证' }];
const findings = [{ questionId: 'thailand:Q-1', company: '甲', hasMaterial: false }, { questionId: 'malaysia:Q-1', company: '甲', hasMaterial: true }, { questionId: 'malaysia:Q-1', company: '乙', hasMaterial: true }, { questionId: 'malaysia:Q-2', company: '甲', hasMaterial: true }];
const categories = ['组织与人才', '运维与验证', '属地合规'];
test('topic progress counts unique question entries, not company cells, and separates countries', () => {
  const result = topicProgress({ questions, findings: [...findings, findings[1]], categories, companies: ['甲', '乙'] });
  assert.deepEqual(result.topics[0], { name: '组织与人才', questions: 2, total: 2, filled: 1, percent: 50 });
  assert.equal(result.percent, 67); assert.equal(result.filled, 2); assert.equal(result.total, 3);
  assert.equal(result.topics[2].percent, null);
});
test('coverage recalculates only the filtered questions and selected companies', () => {
  const result = topicProgress({ questions: questions.slice(1), findings, categories, companies: ['乙'] });
  assert.equal(result.topics[0].percent, 100); assert.equal(result.topics[1].percent, 0); assert.equal(result.percent, 50);
});
test('no selected questions or companies has no invented coverage or NaN', () => {
  for (const input of [{ questions: [], companies: ['甲'] }, { questions, companies: [] }]) {
    const result = topicProgress({ ...input, categories, findings });
    assert.equal(result.percent, null); assert.equal(result.total, input.questions.length); assert.equal(result.filled, 0);
  }
});

test('duplicate questions and findings never inflate entry counts', () => {
  const result = topicProgress({ questions: [...questions, questions[1]], findings: [...findings, findings[1]], categories, companies: ['甲', '乙', '甲'] });
  assert.equal(result.total, 3); assert.equal(result.filled, 2);
});
