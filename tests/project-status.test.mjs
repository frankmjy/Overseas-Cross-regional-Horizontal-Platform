import test from 'node:test';
import assert from 'node:assert/strict';
import { columns } from '../project-tasks/model.mjs';
import { calculatedStatus, chinaDay, nextChinaMidnight } from '../project-tasks/status.mjs';
const row = (start, due, actual = '') => ({ [columns.start[0]]: start, [columns.due[0]]: due, [columns.actualCompletion[0]]: actual });
test('status uses Shanghai civil dates and inclusive due-day boundaries', () => {
  const r = row('2026-10-25', '2026-10-26');
  assert.equal(calculatedStatus(r, Date.parse('2026-10-24T15:59:00Z')), '未开始');
  assert.equal(calculatedStatus(r, Date.parse('2026-10-24T16:00:00Z')), '进行中');
  assert.equal(calculatedStatus(r, Date.parse('2026-10-26T15:59:00Z')), '进行中');
  assert.equal(calculatedStatus(r, Date.parse('2026-10-26T16:00:00Z')), '逾期未完成');
});
test('completion dates determine normal or late completion; missing schedules remain untouched', () => {
  assert.equal(calculatedStatus(row('2026-10-01','2026-10-25','2026-10-25'), Date.now()), '正常完成');
  assert.equal(calculatedStatus(row('2026-10-01','2026-10-25','2026-10-26'), Date.now()), '逾期完成');
  assert.equal(calculatedStatus(row('','2026-10-25'),Date.now()),null);
  assert.equal(calculatedStatus(row('2026-10-25','2026-10-01'),Date.now()),null);
});
test('midnight scheduling is independent of host timezone and rolls over months and years', () => {
  const now = Date.parse('2026-12-31T15:59:59Z');
  assert.equal(chinaDay(now),'2026-12-31');
  assert.equal(nextChinaMidnight(now), Date.parse('2026-12-31T16:00:00Z'));
  assert.equal(nextChinaMidnight(now+1000),Date.parse('2027-01-01T16:00:00Z'));
});
